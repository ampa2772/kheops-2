// server/services/documentLockService.js
//
// Service de verrouillage de documents pour empêcher les conflits d'édition
// quand plusieurs utilisateurs (sur PC différents, même compte ou même cabinet)
// tentent d'ouvrir le même document.
//
// Modèle :
//   - Verrou en mémoire (Map<docId, lockInfo>)
//   - TTL : auto-relâchement si pas de heartbeat depuis LOCK_TTL_MS
//   - Heartbeat : le client doit appeler /heartbeat toutes les ~30s
//   - Release explicite : /release ou auto à l'expiration
//
// Pour scaler horizontalement (plusieurs instances Node), il faudra remplacer
// la Map en mémoire par Redis. La forme de l'API (acquire/heartbeat/release/list)
// reste identique — donc migration future sans casser les clients.

const LOCK_TTL_MS = 90_000;          // 90s sans heartbeat → relâchement auto
const CLEANUP_INTERVAL_MS = 30_000;  // balayage toutes les 30s

/**
 * État interne — Map<docId, { userId, displayName, lockedAt, lastHeartbeat }>
 * Exporté pour les tests uniquement (via getStateForTesting).
 */
const locks = new Map();
let cleanupTimer = null;

/**
 * Tente d'acquérir le verrou sur un document.
 *
 * @param {string} docId
 * @param {{ userId: string, displayName: string }} owner
 * @returns {{ granted: boolean, lockedBy?: { userId, displayName, lockedAt } }}
 *
 * Cas :
 *  - Pas de verrou → granted: true
 *  - Verrou existant détenu par le MÊME userId → granted: true (idempotent — ré-acquire)
 *  - Verrou existant détenu par quelqu'un d'autre, NON expiré → granted: false + lockedBy
 *  - Verrou existant expiré → on l'efface et on accorde
 */
function acquire(docId, owner) {
    if (!docId || !owner || !owner.userId) {
        throw new Error('docId and owner.userId are required');
    }

    const existing = locks.get(docId);
    const now = Date.now();

    if (existing) {
        const isExpired = (now - existing.lastHeartbeat) > LOCK_TTL_MS;
        if (existing.userId === String(owner.userId)) {
            // Idempotent : même owner, on rafraîchit le heartbeat
            existing.lastHeartbeat = now;
            existing.displayName = owner.displayName || existing.displayName;
            return { granted: true };
        }
        if (!isExpired) {
            return {
                granted: false,
                lockedBy: {
                    userId: existing.userId,
                    displayName: existing.displayName,
                    lockedAt: existing.lockedAt,
                },
            };
        }
        // Verrou existant mais expiré → on le supprime et on accorde
        locks.delete(docId);
    }

    locks.set(docId, {
        userId: String(owner.userId),
        displayName: owner.displayName || '',
        lockedAt: now,
        lastHeartbeat: now,
    });
    return { granted: true };
}

/**
 * Rafraîchit le heartbeat d'un verrou détenu par l'utilisateur.
 *
 * @param {string} docId
 * @param {string} userId
 * @returns {{ ok: boolean, reason?: 'no-lock'|'wrong-owner'|'expired' }}
 */
function heartbeat(docId, userId) {
    const existing = locks.get(docId);
    if (!existing) return { ok: false, reason: 'no-lock' };
    if (existing.userId !== String(userId)) return { ok: false, reason: 'wrong-owner' };
    const now = Date.now();
    if ((now - existing.lastHeartbeat) > LOCK_TTL_MS) {
        // Verrou expiré entre deux heartbeats — on le supprime, le client devra réacquérir
        locks.delete(docId);
        return { ok: false, reason: 'expired' };
    }
    existing.lastHeartbeat = now;
    return { ok: true };
}

/**
 * Libère le verrou d'un document.
 * Si l'utilisateur n'est pas le propriétaire, le verrou n'est PAS libéré
 * (sauf force=true, à utiliser uniquement par un endpoint admin).
 *
 * @param {string} docId
 * @param {string} userId
 * @param {{ force?: boolean }} options
 * @returns {{ released: boolean, reason?: string }}
 */
function release(docId, userId, options = {}) {
    const existing = locks.get(docId);
    if (!existing) return { released: false, reason: 'no-lock' };
    if (!options.force && existing.userId !== String(userId)) {
        return { released: false, reason: 'wrong-owner' };
    }
    locks.delete(docId);
    return { released: true };
}

/**
 * Retourne l'état des verrous, optionnellement filtré sur une liste de docIds.
 * Filtre automatiquement les verrous expirés (et les supprime au passage).
 *
 * @param {string[]?} docIds — si fourni, ne renvoie que ces ids ; sinon, tous
 * @returns {Array<{ docId, userId, displayName, lockedAt }>}
 */
function list(docIds) {
    purgeStale();
    const out = [];
    if (Array.isArray(docIds) && docIds.length > 0) {
        for (const id of docIds) {
            const lock = locks.get(id);
            if (lock) out.push({ docId: id, ...publicLockInfo(lock) });
        }
    } else {
        for (const [docId, lock] of locks.entries()) {
            out.push({ docId, ...publicLockInfo(lock) });
        }
    }
    return out;
}

function publicLockInfo(lock) {
    return {
        userId: lock.userId,
        displayName: lock.displayName,
        lockedAt: lock.lockedAt,
    };
}

/**
 * Supprime les verrous expirés. Appelé par le cleanup loop ET par list().
 * @returns {number} nombre de verrous supprimés
 */
function purgeStale() {
    const now = Date.now();
    let removed = 0;
    for (const [docId, lock] of locks.entries()) {
        if ((now - lock.lastHeartbeat) > LOCK_TTL_MS) {
            locks.delete(docId);
            removed++;
        }
    }
    return removed;
}

/**
 * Démarre le cleanup loop. Idempotent : appel multiple ne crée qu'un seul timer.
 * Doit être appelé une fois au boot du serveur.
 */
function startCleanup() {
    if (cleanupTimer) return;
    cleanupTimer = setInterval(() => {
        const removed = purgeStale();
        if (removed > 0) {
            console.log(`[DocumentLockService] ${removed} verrou(x) expiré(s) supprimé(s).`);
        }
    }, CLEANUP_INTERVAL_MS);
    // Ne pas bloquer la fermeture du process
    if (cleanupTimer.unref) cleanupTimer.unref();
}

/**
 * Arrête le cleanup loop. Utile pour les tests.
 */
function stopCleanup() {
    if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
    }
}

/**
 * RÉSERVÉ AUX TESTS : reset complet de l'état interne.
 */
function _resetForTesting() {
    locks.clear();
    stopCleanup();
}

module.exports = {
    acquire,
    heartbeat,
    release,
    list,
    purgeStale,
    startCleanup,
    stopCleanup,
    LOCK_TTL_MS,
    CLEANUP_INTERVAL_MS,
    _resetForTesting,
};
