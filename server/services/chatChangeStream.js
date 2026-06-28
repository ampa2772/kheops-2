// server/services/chatChangeStream.js
//
// MongoDB Change Stream sur la collection Message. Permet aux serveurs
// Express LOCAUX (un par machine du cabinet) d'être notifiés quand un
// nouveau message est inséré en BDD Atlas — y compris ceux insérés depuis
// une AUTRE machine du cabinet. Chaque serveur peut alors broadcaster
// l'événement à ses propres clients socket.io connectés en temps réel.
//
// Architecture :
//   Pierre (Machine 1) envoie → REST sur serveur 1 → INSERT Mongo Atlas
//   Atlas Change Stream notifie TOUS les serveurs en écoute :
//     → serveur 1 broadcast à ses clients (Pierre voit son propre message)
//     → serveur 2 (machine de Corinne) broadcast à ses clients
//        (Corinne voit le message en temps réel sans rafraîchir)
//
// Atlas est en replica set par défaut, donc Change Streams supportés.
// Le hook se relance automatiquement avec backoff en cas de déconnexion.

const Message = require('../models/Chat/Message');
const { log } = require('./chatLogger');

let changeStream = null;
let stopRequested = false;
let retryDelay = 2000;
const MAX_RETRY_DELAY = 30000;

/**
 * Démarre le change stream et appelle `onNewMessage(msg)` pour chaque
 * nouveau message inséré dans la collection.
 *
 * @param {(msg: object) => void | Promise<void>} onNewMessage
 */
function startChangeStream(onNewMessage) {
    if (changeStream) {
        console.warn('[ChatChangeStream] Déjà démarré, ignoré');
        return;
    }
    stopRequested = false;
    _attach(onNewMessage);
}

function _attach(onNewMessage) {
    if (stopRequested) return;
    try {
        changeStream = Message.watch(
            [{ $match: { operationType: 'insert' } }],
            { fullDocument: 'updateLookup' }
        );
        log('[ChangeStream] ✅ Watch sur collection Message démarré');

        changeStream.on('change', (change) => {
            try {
                const doc = change.fullDocument;
                if (doc && doc._id) {
                    log(`[ChangeStream] EVENT recu : msg _id=${doc._id} sender=${doc.sender} recipient=${doc.recipient} kind=${doc.kind}`);
                    Promise.resolve(onNewMessage(doc)).catch((e) => {
                        log('[ChangeStream] handler error:', e && e.message);
                    });
                }
            } catch (err) {
                log('[ChangeStream] event handling error:', err && err.message);
            }
        });

        changeStream.on('error', (err) => {
            log('[ChangeStream] ERROR:', err && err.message);
            try { changeStream && changeStream.close(); } catch (_) {}
            changeStream = null;
            if (!stopRequested) {
                log(`[ChangeStream] Reconnexion dans ${retryDelay / 1000}s...`);
                setTimeout(() => _attach(onNewMessage), retryDelay);
                retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
            }
        });

        changeStream.on('close', () => {
            log('[ChangeStream] Stream fermé');
            changeStream = null;
            if (!stopRequested) {
                log(`[ChangeStream] Reconnexion dans ${retryDelay / 1000}s...`);
                setTimeout(() => _attach(onNewMessage), retryDelay);
                retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
            }
        });

        // Reset retry delay on successful attach
        retryDelay = 2000;
    } catch (err) {
        log('[ChangeStream] startup ERROR:', err && err.message);
        changeStream = null;
        if (!stopRequested) {
            setTimeout(() => _attach(onNewMessage), retryDelay);
            retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
        }
    }
}

function stopChangeStream() {
    stopRequested = true;
    if (changeStream) {
        try { changeStream.close(); } catch (_) {}
        changeStream = null;
    }
}

module.exports = { startChangeStream, stopChangeStream };
