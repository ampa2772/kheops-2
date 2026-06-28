// server/services/chatSocketHandler.js
//
// Branche Socket.io central pour la livraison temps réel des messages chat.
//
// Authentification : JWT au handshake (socket.handshake.auth.token).
// Sur connexion, le socket rejoint un room nommé `user:<userId>`. Pour livrer
// un message à un destinataire, on émet vers `user:<recipientId>`. Bonus :
// l'expéditeur reçoit aussi son propre message via `user:<senderId>` pour
// que ses autres PCs (multi-device) restent synchronisés.
//
// Le handler attache un hook au router /api/chat (setOnMessageCreated) afin
// que toute création de message via REST soit broadcastée temps réel.

const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const chatRouter = require('../routes/chat');
const UserOfficeUser = require('../models/App_Users/modelsLiaisons/UserOfficeUser');
const { startChangeStream, stopChangeStream } = require('./chatChangeStream');
const { log } = require('./chatLogger');

// === DEV BYPASS — pilote par variable d'environnement KHEOPS_BYPASS_AUTH.
// Doit rester aligne avec server/middlewares/middleware-auth.js et
// REACT_APP_KHEOPS_BYPASS_AUTH côté client (devBypass.js).
// En mode bypass, on accepte n'importe quel token et on bind socket.data.userId
// à l'utilisateur par défaut. Permet aux 2 machines de chater même quand
// l'utilisateur n'a pas fait de login Google complet.
const BYPASS_AUTH = process.env.KHEOPS_BYPASS_AUTH === 'true';
const BYPASS_USER_ID = '698941d40c8df05d76c7740e';
const BYPASS_DEV_TOKEN = 'dev-bypass-token';

const MAX_RECONNECT_ATTEMPTS = 5;

let io = null; // exposé pour les tests / shutdown propre

// ── Présence "Utilisateurs connectés" ─────────────────────────────────────
// Map<socketId, officeUserId> — chaque client peut declarer quel OfficeUser
// est actuellement actif sur sa session via l'event `presence:set-office-user`.
// On agrege ensuite via getConnectedOfficeUserIds() pour la modale CurrentsUsers.
const presenceBySocket = new Map();

/**
 * Retourne le Set des officeUserIds (string) ayant au moins un socket actif
 * declarant cette presence. Utilise par la route /api/presence/connected.
 */
function getConnectedOfficeUserIds() {
    return new Set(presenceBySocket.values());
}

/**
 * Attache Socket.io à un serveur HTTP existant et configure le handler chat.
 *
 * @param {http.Server} httpServer
 * @param {object} options
 * @param {string} options.jwtSecret
 * @param {string[]?} options.corsOrigins  liste d'origines CORS autorisées
 * @returns {Server} l'instance Socket.io
 */
function attach(httpServer, { jwtSecret, corsOrigins } = {}) {
    if (!httpServer) throw new Error('httpServer requis');
    if (!jwtSecret) throw new Error('jwtSecret requis pour authentifier les sockets');

    io = new Server(httpServer, {
        cors: {
            origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : true,
            credentials: true,
        },
        // Les attachements (notamment les messages vocaux) sont stockés inline
        // en base64 dans le document Mongo et donc broadcastés via socket.
        // Limite alignée sur le body parser HTTP (10 MB) avec marge.
        maxHttpBufferSize: 12 * 1024 * 1024, // 12 Mo
    });

    // ── Middleware d'auth JWT au handshake ─────────────────────────────────
    io.use((socket, next) => {
        const transport = socket.conn?.transport?.name;
        const remote = socket.handshake?.address;
        log(`[Socket] HANDSHAKE attempt transport=${transport} remote=${remote} headers=${Object.keys(socket.handshake?.headers || {}).length}`);

        // ── DEV BYPASS : aligné sur le middleware REST. Si un VRAI JWT
        //    valide est fourni (ex: l'utilisateur s'est connecte avec
        //    Google ou Microsoft), on le respecte et on bind son userId
        //    plutot que le user de dev. Sinon (pas de token, token bypass,
        //    ou JWT invalide), on retombe sur le user par defaut pour ne
        //    pas casser la session de test.
        if (BYPASS_AUTH) {
            const rawToken = String(socket.handshake?.auth?.token
                || socket.handshake?.headers?.authorization
                || '').trim().replace(/^Bearer\s+/i, '').trim();
            if (rawToken && rawToken !== BYPASS_DEV_TOKEN) {
                try {
                    const decoded = jwt.verify(rawToken, jwtSecret);
                    const realUserId = decoded.user || decoded.id;
                    if (realUserId) {
                        socket.data.userId = String(realUserId);
                        log(`[Socket] HANDSHAKE BYPASS+JWT valide -> userId=${realUserId}`);
                        return next();
                    }
                } catch (_e) {
                    // JWT invalide : on retombe sur le user de dev
                }
            }
            socket.data.userId = BYPASS_USER_ID;
            log(`[Socket] HANDSHAKE BYPASS fallback -> userId=${BYPASS_USER_ID}`);
            return next();
        }

        try {
            // Lire le token depuis auth.token, ou Authorization header (avec préfixe Bearer optionnel)
            let token = socket.handshake?.auth?.token
                || socket.handshake?.headers?.authorization
                || '';
            // Strip "Bearer " si présent (et trim espaces)
            token = String(token).trim().replace(/^Bearer\s+/i, '').trim();

            // Détection du format pour diagnostic
            const tokenLen = token.length;
            const tokenPreview = token.slice(0, 20);
            const looksLikeJwt = /^eyJ/.test(token);
            const looksLikeGoogleOAuth = /^ya29\./.test(token);
            log(`[Socket] HANDSHAKE token info : len=${tokenLen} preview="${tokenPreview}..." jwt=${looksLikeJwt} google_oauth=${looksLikeGoogleOAuth}`);

            if (!token) {
                log('[Socket] HANDSHAKE REJECTED : no-token');
                return next(new Error('chat:auth/no-token'));
            }

            const decoded = jwt.verify(token, jwtSecret);
            // Le JWT du projet contient soit `user` (objet ou string), soit `id`
            const userId = decoded.user?.id || decoded.user || decoded.id;
            if (!userId) {
                log('[Socket] HANDSHAKE REJECTED : invalid-payload (decoded=' + JSON.stringify(decoded).slice(0, 100) + ')');
                return next(new Error('chat:auth/invalid-payload'));
            }
            socket.data.userId = String(userId);
            log(`[Socket] HANDSHAKE OK userId=${userId}`);
            return next();
        } catch (err) {
            log('[Socket] HANDSHAKE REJECTED : ' + (err.message || 'invalid'));
            return next(new Error('chat:auth/' + (err.message || 'invalid')));
        }
    });

    // ── Connexion : join le room du user ───────────────────────────────────
    io.on('connection', (socket) => {
        const userId = socket.data.userId;
        const room = `user:${userId}`;
        socket.join(room);
        const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
        log(`[Socket] CONNECT socketId=${socket.id} userId=${userId} room=${room} size=${roomSize}`);
        // Pour débogage / tests
        socket.emit('chat:hello', { userId });

        // Heartbeat / typing — extensions futures, on les expose mais
        // simplement comme pass-through pour le destinataire.
        socket.on('chat:typing', ({ recipientId, isTyping }) => {
            if (!recipientId) return;
            io.to(`user:${recipientId}`).emit('chat:typing', {
                fromUserId: userId, isTyping: !!isTyping,
            });
        });

        // Presence : le client declare quel OfficeUser est actif sur sa session.
        // On stocke le mapping socketId -> officeUserId pour pouvoir lister les
        // OfficeUsers connectes via /api/presence/connected.
        socket.on('presence:set-office-user', ({ officeUserId } = {}) => {
            if (officeUserId) {
                presenceBySocket.set(socket.id, String(officeUserId));
                log(`[Presence] SET socketId=${socket.id} officeUser=${officeUserId}`);
            } else {
                presenceBySocket.delete(socket.id);
                log(`[Presence] CLEAR socketId=${socket.id}`);
            }
        });

        socket.on('disconnect', (reason) => {
            presenceBySocket.delete(socket.id);
            log(`[Socket] DISCONNECT socketId=${socket.id} userId=${userId} reason=${reason}`);
        });
    });

    // ── Broadcast helper : route un message vers les Users proprietaires des
    //    OfficeUsers impliques (sender + recipient), via le room user:<userId>.
    async function broadcastChatMessage(msg, source = 'unknown') {
        if (!io || !msg) return;
        const payload = serializeMessage(msg);
        try {
            const links = await UserOfficeUser.find({
                officeUser: { $in: [msg.sender, msg.recipient] },
            }).lean();
            const userIds = new Set(links.map(l => String(l.user)));
            log(`[Broadcast] source=${source} msg=${msg._id} sender=${msg.sender} recipient=${msg.recipient} -> ${userIds.size} user(s) cible(s)`);
            if (userIds.size === 0) {
                log(`[Broadcast] AUCUN UserOfficeUser trouve pour sender ou recipient !!`);
                return;
            }
            for (const uid of userIds) {
                const room = `user:${uid}`;
                const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
                log(`[Broadcast]   -> emit vers ${room} (${roomSize} socket(s) connecte(s))`);
                io.to(room).emit('chat:message', payload);
            }
        } catch (err) {
            log('[Broadcast] FAILED:', err && err.message);
        }
    }

    // ── Voie 1 : hook REST direct (instantané pour la machine émettrice)
    //    Quand le client envoie un message via POST /api/chat/messages, on
    //    notifie directement les sockets connectés sur CE serveur.
    chatRouter.setOnMessageCreated((msg) => { broadcastChatMessage(msg, 'rest-hook'); });

    // ── Voie 2 : MongoDB Change Stream (instantané pour les autres machines)
    //    Chaque serveur Express (un par machine du cabinet) écoute la
    //    collection Message en temps réel via Atlas Change Streams. Quand
    //    un message inséré depuis une autre machine arrive, on broadcast
    //    aussi à nos clients locaux. La déduplication par `_id` côté client
    //    évite les doublons (le hook REST + le change stream peuvent émettre
    //    le même message sur la machine émettrice).
    startChangeStream((msg) => { broadcastChatMessage(msg, 'change-stream'); });

    return io;
}

/**
 * Sérialise un message Mongoose en objet plain pour transit JSON.
 */
function serializeMessage(msg) {
    if (!msg) return msg;
    if (typeof msg.toObject === 'function') return msg.toObject({ virtuals: false });
    return msg;
}

/**
 * Détache et ferme l'instance Socket.io. Utile pour les tests et shutdown.
 */
function detach() {
    if (io) {
        try { io.close(); } catch (_) {}
        io = null;
    }
    chatRouter.setOnMessageCreated(null);
    stopChangeStream();
}

/**
 * RÉSERVÉ AUX TESTS : retourne l'instance courante.
 */
function _getIoForTesting() { return io; }

module.exports = {
    attach,
    detach,
    serializeMessage,
    getConnectedOfficeUserIds,
    MAX_RECONNECT_ATTEMPTS,
    _getIoForTesting,
};
