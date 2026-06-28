// client/src/services/documentLockApi.js
//
// Wrapper léger autour de l'API REST /api/document-locks. Toutes les fonctions
// utilisent apiClient (axios pré-configuré avec le JWT depuis Redux).
//
// Sémantique des codes de retour :
//   - acquire  : { granted: true } ou { granted: false, lockedBy: { userId, displayName, lockedAt } }
//   - heartbeat: { ok: true }       ou { ok: false, reason: 'no-lock' | 'wrong-owner' | 'expired' }
//   - release  : { released: bool, reason? }
//   - list     : { locks: [{ docId, userId, displayName, lockedAt }], currentUserId }

import apiClient from './apiClient';

const BASE = '/api/document-locks';

export async function acquireLock(docId) {
    try {
        const res = await apiClient.post(`${BASE}/${encodeURIComponent(docId)}/acquire`);
        return res.data; // { granted: true }
    } catch (err) {
        if (err.response && err.response.status === 409) {
            return err.response.data; // { granted: false, lockedBy: {...} }
        }
        throw err;
    }
}

export async function heartbeatLock(docId) {
    try {
        const res = await apiClient.post(`${BASE}/${encodeURIComponent(docId)}/heartbeat`);
        return res.data; // { ok: true }
    } catch (err) {
        if (err.response && (err.response.status === 410 || err.response.status === 403)) {
            return err.response.data; // { ok: false, reason }
        }
        throw err;
    }
}

export async function releaseLock(docId) {
    try {
        const res = await apiClient.post(`${BASE}/${encodeURIComponent(docId)}/release`);
        return res.data; // { released: bool }
    } catch (err) {
        // Une libération ne doit jamais bloquer l'utilisateur — on retourne une erreur silencieuse
        return { released: false, reason: 'network-error', error: err.message };
    }
}

export async function listLocks(docIds) {
    const params = (docIds && docIds.length > 0) ? { docIds: docIds.join(',') } : {};
    const res = await apiClient.get(BASE, { params });
    return res.data; // { locks: [...], currentUserId }
}
