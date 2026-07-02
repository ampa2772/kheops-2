// client/src/services/chatSocketCentral.js
//
// Socket.io client connecté au SERVEUR CENTRAL (port 5000) — distinct du
// socket local Electron (port 8080) qui sert à la communication renderer/main.
// Utilisé pour la livraison temps réel du chat (et plus tard, potentiellement,
// du verrou de documents en push plutôt qu'en polling).
//
// Authentification : JWT au handshake. Si déconnecté → reconnecte avec backoff.

import { io } from 'socket.io-client';

let socket = null;
let currentToken = null;

/**
 * URL du serveur Socket.IO central. En web hébergé = l'origine du site
 * (Cloud Run) ; dans Electron = http://localhost:5000 (serveur embarqué).
 * window.location.origin couvre les deux sans fallback localhost (qui
 * casserait le chat temps réel en mode web).
 */
function getServerUrl() {
    return process.env.REACT_APP_API_URL || window.location.origin;
}

/**
 * Initialise (ou ré-initialise si le token a changé) la connexion socket.io
 * au serveur central. Idempotent : appel multiple avec le même token = no-op.
 *
 * @param {string} token  JWT
 * @returns {Socket} l'instance socket.io-client
 */
export function initChatSocket(token) {
    if (!token) {
        console.warn('[ChatSocket] initChatSocket appelé sans token, ignoré');
        return null;
    }

    // Si déjà connecté avec le même token → no-op
    if (socket && currentToken === token && socket.connected) {
        return socket;
    }

    // Token différent → on ferme et on reconnecte
    if (socket) {
        try { socket.disconnect(); } catch (_) {}
        socket = null;
    }

    currentToken = token;
    const url = getServerUrl();
    console.log('[ChatSocket] Tentative de connexion à', url);
    socket = io(url, {
        auth: { token },
        // Fallback polling activé : si WebSocket échoue (firewall, AV, etc.),
        // socket.io bascule automatiquement sur HTTP long-polling.
        transports: ['websocket', 'polling'],
        // Tentatives de reconnexion infinies (chaîne de cabinet stable)
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
    });

    socket.on('connect', () => {
        console.log('[ChatSocket] ✅ Connecté, socketId=' + socket.id + ' transport=' + socket.io.engine.transport.name);
        // Notifier le serveur via REST pour qu'il logge dans chat-debug.log
        try {
            fetch(url + '/api/chat/debug/client-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ event: 'connect', socketId: socket.id, transport: socket.io.engine.transport.name }),
            }).catch(() => {});
        } catch (_) {}
    });
    socket.on('connect_error', (err) => {
        console.warn('[ChatSocket] connect_error:', err?.message || err);
        try {
            fetch(url + '/api/chat/debug/client-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ event: 'connect_error', message: err?.message || String(err) }),
            }).catch(() => {});
        } catch (_) {}
    });
    socket.on('disconnect', (reason) => {
        console.log('[ChatSocket] Déconnecté:', reason);
        try {
            fetch(url + '/api/chat/debug/client-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ event: 'disconnect', reason }),
            }).catch(() => {});
        } catch (_) {}
    });

    return socket;
}

export function getChatSocket() {
    return socket;
}

export function disconnectChatSocket() {
    if (socket) {
        try { socket.disconnect(); } catch (_) {}
        socket = null;
        currentToken = null;
    }
}

/**
 * Helper pour s'abonner à 'chat:message'. Retourne une fonction de
 * désabonnement à appeler au unmount.
 */
export function subscribeToMessages(handler) {
    if (!socket) return () => {};
    const wrapped = (msg) => handler(msg);
    socket.on('chat:message', wrapped);
    return () => socket.off('chat:message', wrapped);
}

/**
 * Idem pour 'chat:typing'.
 */
export function subscribeToTyping(handler) {
    if (!socket) return () => {};
    const wrapped = (evt) => handler(evt);
    socket.on('chat:typing', wrapped);
    return () => socket.off('chat:typing', wrapped);
}

/**
 * Émet un événement de saisie en cours (best-effort).
 */
export function emitTyping(recipientId, isTyping) {
    if (socket && socket.connected) {
        socket.emit('chat:typing', { recipientId, isTyping });
    }
}

/**
 * Déclare quel OfficeUser est actif sur cette session (presence). Utilisé par
 * la modale "Utilisateurs connectés" du header. Si officeUserId est falsy,
 * efface la présence pour ce socket.
 */
export function emitPresence(officeUserId) {
    if (socket && socket.connected) {
        socket.emit('presence:set-office-user', { officeUserId: officeUserId || null });
    }
}
