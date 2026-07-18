// server/services/chatSocketHandler.js
//
// Branche Socket.io central pour la livraison temps réel des messages chat.
//
// Authentification : JWT au handshake (socket.handshake.auth.token).
// Sur connexion, le socket conserve un room `user:<userId>` pour les événements
// du compte (invitations, cabinet). Les messages de chat, eux, sont livrés
// exclusivement dans les rooms `office-user:<officeUserId>` déclarées et
// vérifiées fenêtre par fenêtre via la présence active.
//
// Le handler attache un hook au router /api/chat (setOnMessageCreated) afin
// que toute création de message via REST soit broadcastée temps réel.

const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const chatRouter = require('../routes/chat');
const UserOfficeUser = require('../models/App_Users/modelsLiaisons/UserOfficeUser');
const { getAccessibleUserIds } = require('./cabinetAccess');
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
// Chaîne de mises à jour par socket : deux changements de profil rapprochés
// ne peuvent jamais laisser la fenêtre inscrite dans deux rooms OfficeUser.
const presenceUpdateBySocket = new Map();

function officeUserRoom(officeUserId) {
    return `office-user:${String(officeUserId)}`;
}

/**
 * Retourne le Set des officeUserIds (string) ayant au moins un socket actif
 * declarant cette presence. Utilise par la route /api/presence/connected.
 */
function getConnectedOfficeUserIds() {
    return new Set(presenceBySocket.values());
}

/**
 * A14 — ANTI-USURPATION DE PRÉSENCE. Enregistre (ou efface) l'OfficeUser actif
 * d'un socket, mais UNIQUEMENT si cet OfficeUser appartient réellement à
 * l'utilisateur authentifié du socket (lien UserOfficeUser). Sans ce contrôle,
 * un client pouvait déclarer `presence:set-office-user` avec l'_id d'un
 * OfficeUser d'un AUTRE utilisateur/cabinet et le faire apparaître « en ligne ».
 *
 * @returns {Promise<'set'|'cleared'|'rejected'>}
 */
async function applySocketPresence({ socketId, userId, officeUserId }) {
    if (!officeUserId) {
        const socket = io && io.sockets && io.sockets.sockets
            ? io.sockets.sockets.get(socketId)
            : null;
        const previousOfficeUserId = presenceBySocket.get(socketId) || null;
        if (socket && previousOfficeUserId) {
            await Promise.resolve(socket.leave(officeUserRoom(previousOfficeUserId)));
        }
        presenceBySocket.delete(socketId);
        return 'cleared';
    }
    const owned = await UserOfficeUser
        .findOne({ user: String(userId), officeUser: String(officeUserId) })
        .lean();
    if (!owned) {
        // Tentative d'usurpation : conserver atomiquement le profil légitime
        // précédent et sa room plutôt que de basculer vers une identité invalide.
        return 'rejected';
    }

    const socket = io && io.sockets && io.sockets.sockets
        ? io.sockets.sockets.get(socketId)
        : null;
    // Quand Socket.io est attaché, l'absence du socket signifie qu'il s'est
    // déconnecté pendant la vérification DB : ne pas recréer une présence
    // fantôme. Quand io est null, on autorise l'appel unitaire sans serveur.
    if (io && !socket) {
        presenceBySocket.delete(socketId);
        return 'cleared';
    }
    const previousOfficeUserId = presenceBySocket.get(socketId) || null;
    const nextOfficeUserId = String(officeUserId);
    if (previousOfficeUserId === nextOfficeUserId) return 'set';

    // Le changement est borné au socket de cette fenêtre. En cas d'échec de
    // join, on restaure la room précédente et la source de présence.
    try {
        if (socket && previousOfficeUserId) {
            await Promise.resolve(socket.leave(officeUserRoom(previousOfficeUserId)));
        }
        if (socket) {
            await Promise.resolve(socket.join(officeUserRoom(nextOfficeUserId)));
        }
        presenceBySocket.set(socketId, nextOfficeUserId);
    } catch (error) {
        if (socket && previousOfficeUserId) {
            try { await Promise.resolve(socket.join(officeUserRoom(previousOfficeUserId))); } catch (_) {}
        }
        if (previousOfficeUserId) presenceBySocket.set(socketId, previousOfficeUserId);
        else presenceBySocket.delete(socketId);
        throw error;
    }
    return 'set';
}

async function setSocketPresence(params) {
    const socketId = String(params.socketId);
    const previousUpdate = presenceUpdateBySocket.get(socketId) || Promise.resolve();
    const update = previousUpdate
        .catch(() => {})
        .then(() => applySocketPresence({ ...params, socketId }));
    presenceUpdateBySocket.set(socketId, update);
    try {
        return await update;
    } finally {
        if (presenceUpdateBySocket.get(socketId) === update) {
            presenceUpdateBySocket.delete(socketId);
        }
    }
}

// Exposé pour les tests unitaires (isolation de l'état de présence).
function _clearPresence() {
    presenceBySocket.clear();
    presenceUpdateBySocket.clear();
}

// Route un message uniquement vers les fenêtres ayant déclaré l'un des deux
// OfficeUsers concernés. Cette fonction est hors de attach() afin de pouvoir
// tester le routage réel sans reproduire manuellement son implémentation.
async function broadcastChatMessage(msg, source = 'unknown') {
    if (!io || !msg) return;
    const payload = serializeMessage(msg);
    try {
        const officeUserIds = new Set(
            [msg.sender, msg.recipient].filter(Boolean).map(value => String(value)),
        );
        log(`[Broadcast] source=${source} msg=${msg._id} sender=${msg.sender} recipient=${msg.recipient} -> ${officeUserIds.size} OfficeUser(s) cible(s)`);
        for (const officeUserId of officeUserIds) {
            const room = officeUserRoom(officeUserId);
            const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;
            log(`[Broadcast]   -> emit vers ${room} (${roomSize} socket(s) connecte(s))`);
            io.to(room).emit('chat:message', payload);
        }
    } catch (err) {
        log('[Broadcast] FAILED:', err && err.message);
    }
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
                    // BUG rc38 : le payload JWT du projet est { user: { id } }.
                    // `decoded.user || decoded.id` renvoyait alors l'OBJET user,
                    // et String(objet) = "[object Object]" → room `user:[object Object]`
                    // → tout le routage temps réel cassé en mode bypass. On extrait
                    // désormais l'id comme la branche stricte plus bas.
                    const realUserId = decoded.user?.id || decoded.user || decoded.id;
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
            const looksLikeJwt = /^eyJ/.test(token);
            const looksLikeGoogleOAuth = /^ya29\./.test(token);
            // Ne jamais journaliser le jeton, même tronqué : les journaux du
            // serveur peuvent être persistés dans Cloud Logging.
            log(`[Socket] HANDSHAKE token info : present=${tokenLen > 0} len=${tokenLen} jwt=${looksLikeJwt} google_oauth=${looksLikeGoogleOAuth}`);

            if (!token) {
                log('[Socket] HANDSHAKE REJECTED : no-token');
                return next(new Error('chat:auth/no-token'));
            }

            const decoded = jwt.verify(token, jwtSecret);
            // Le JWT du projet contient soit `user` (objet ou string), soit `id`
            const userId = decoded.user?.id || decoded.user || decoded.id;
            if (!userId) {
                log('[Socket] HANDSHAKE REJECTED : invalid-payload');
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

        // La saisie est attribuée au profil interne actif de CETTE fenêtre et
        // diffusée uniquement au profil destinataire vérifié du même cabinet.
        socket.on('chat:typing', async ({ recipientId, isTyping } = {}, acknowledge) => {
            const activeOfficeUserId = presenceBySocket.get(socket.id) || null;
            const reject = (error) => {
                if (typeof acknowledge === 'function') acknowledge({ ok: false, error });
            };
            if (!activeOfficeUserId) return reject('ACTIVE_OFFICE_USER_REQUIRED');
            if (!recipientId) return reject('RECIPIENT_REQUIRED');
            if (String(recipientId) === String(activeOfficeUserId)) {
                return reject('SELF_CONVERSATION_NOT_ALLOWED');
            }
            try {
                const accessibleUserIds = await getAccessibleUserIds(userId);
                const recipientOwned = await UserOfficeUser.findOne({
                    user: { $in: accessibleUserIds },
                    officeUser: String(recipientId),
                }).lean();
                if (!recipientOwned) return reject('RECIPIENT_FORBIDDEN');

                io.to(officeUserRoom(recipientId)).emit('chat:typing', {
                    // fromUserId est conservé pour compatibilité, mais désigne
                    // désormais correctement l'OfficeUser, pas le compte JWT.
                    fromUserId: activeOfficeUserId,
                    fromOfficeUserId: activeOfficeUserId,
                    isTyping: !!isTyping,
                });
                if (typeof acknowledge === 'function') acknowledge({ ok: true });
            } catch (error) {
                log(`[Typing] ERROR socketId=${socket.id} : ${error.message}`);
                reject('TYPING_UNAVAILABLE');
            }
        });

        // Presence : le client declare quel OfficeUser est actif sur sa session.
        // On stocke le mapping socketId -> officeUserId pour pouvoir lister les
        // OfficeUsers connectes via /api/presence/connected.
        socket.on('presence:set-office-user', async ({ officeUserId } = {}, acknowledge) => {
            try {
                const outcome = await setSocketPresence({
                    socketId: socket.id,
                    userId: socket.data.userId,
                    officeUserId,
                });
                if (outcome === 'set') {
                    log(`[Presence] SET socketId=${socket.id} officeUser=${officeUserId}`);
                } else if (outcome === 'rejected') {
                    log(`[Presence] REJECTED (usurpation) socketId=${socket.id} user=${socket.data.userId} officeUser=${officeUserId}`);
                } else {
                    log(`[Presence] CLEAR socketId=${socket.id}`);
                }
                if (typeof acknowledge === 'function') {
                    acknowledge({ ok: outcome !== 'rejected', outcome });
                }
            } catch (err) {
                log(`[Presence] ERROR socketId=${socket.id} : ${err.message}`);
                if (typeof acknowledge === 'function') {
                    acknowledge({ ok: false, outcome: 'error' });
                }
            }
        });

        socket.on('disconnect', (reason) => {
            presenceBySocket.delete(socket.id);
            log(`[Socket] DISCONNECT socketId=${socket.id} userId=${userId} reason=${reason}`);
        });
    });

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

/**
 * Emet un evenement a UN utilisateur precis (toutes ses sessions/onglets), via
 * le room `user:<userId>` rejoint au handshake. Best-effort : no-op si le
 * socket n'est pas encore attache ou si userId manque. Retourne true si
 * l'emission a ete tentee.
 */
function emitToUser(userId, event, payload) {
    if (!io || !userId || !event) return false;
    io.to(`user:${String(userId)}`).emit(event, payload);
    return true;
}

module.exports = {
    attach,
    detach,
    serializeMessage,
    getConnectedOfficeUserIds,
    setSocketPresence,
    emitToUser,
    MAX_RECONNECT_ATTEMPTS,
    _getIoForTesting,
    _broadcastChatMessageForTesting: broadcastChatMessage,
    _clearPresence,
};
