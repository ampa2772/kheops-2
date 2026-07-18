// client/src/hooks/useDocumentLock.js
//
// Hook impératif pour le cycle de vie d'un verrou de document : acquire avant
// d'ouvrir, heartbeat périodique, release au close (ou unmount, ou refresh).
//
// Usage :
//   const { tryOpen, release } = useDocumentLock();
//   const result = await tryOpen(docId);
//   if (result.granted) { window.electron.openDocument(doc); }
//   else { showLockedModal(result.lockedBy); }
//   // plus tard, quand l'app détecte la fermeture du doc :
//   release(docId);
//
// Détails techniques :
//  - On garde la liste des docIds verrouillés par CETTE instance dans un Set
//    interne (par hook). À l'unmount du composant qui utilise le hook, tous
//    les verrous détenus par ce hook sont libérés.
//  - Heartbeat : un seul interval global qui balaye tous les verrous actifs.
//    On ne fait pas un interval par doc — plus simple et moins de timers.
//  - Cleanup de fenêtre fermée (beforeunload) : libère tous les verrous
//    pour éviter qu'ils restent coincés 90s après une fermeture brutale.

import { useCallback, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { acquireLock, heartbeatLock, releaseLock } from '../services/documentLockApi';
import { markLocked, markReleased } from '../redux/slices/documentLockSlice';

const HEARTBEAT_INTERVAL_MS = 30_000; // 30s — TTL serveur = 90s, marge x3

export function useDocumentLock() {
    const dispatch = useDispatch();
    const heldRef = useRef(new Set()); // docIds verrouillés par cette instance
    const heartbeatTimerRef = useRef(null);

    const startHeartbeatIfNeeded = useCallback(() => {
        if (heartbeatTimerRef.current) return;
        heartbeatTimerRef.current = setInterval(async () => {
            const ids = Array.from(heldRef.current);
            for (const docId of ids) {
                try {
                    const r = await heartbeatLock(docId);
                    if (!r.ok) {
                        // Le verrou a été perdu côté serveur (expiré, ou ré-acquis par
                        // quelqu'un d'autre après expiration) → on le retire localement.
                        heldRef.current.delete(docId);
                        dispatch(markReleased({ docId }));
                    }
                } catch (_) {
                    // Erreur réseau silencieuse — on retentera au prochain tick
                }
            }
            if (heldRef.current.size === 0) {
                clearInterval(heartbeatTimerRef.current);
                heartbeatTimerRef.current = null;
            }
        }, HEARTBEAT_INTERVAL_MS);
    }, [dispatch]);

    const tryOpen = useCallback(async (docId, ownerHint) => {
        if (!docId) throw new Error('docId requis');
        const result = await acquireLock(docId);
        if (result.granted) {
            heldRef.current.add(docId);
            // userId/displayName : hint appelant, sinon ceux renvoyes par le
            // serveur a l'acquire. Sans proprietaire, selectIsDocLockedByOther
            // considerait NOTRE PROPRE verrou comme celui « d'un autre
            // utilisateur » (badge trompeur pendant ~5s jusqu'au poll suivant).
            dispatch(markLocked({
                docId,
                userId: ownerHint?.userId ?? result.userId,
                displayName: ownerHint?.displayName ?? result.displayName,
                lockedAt: Date.now(),
            }));
            startHeartbeatIfNeeded();
        }
        return result;
    }, [dispatch, startHeartbeatIfNeeded]);

    const release = useCallback(async (docId) => {
        if (!docId) return;
        if (!heldRef.current.has(docId)) return; // pas notre verrou
        heldRef.current.delete(docId);
        dispatch(markReleased({ docId }));
        try {
            await releaseLock(docId);
        } catch (_) {
            // Erreur silencieuse — le serveur expirera de toute façon en 90s max
        }
    }, [dispatch]);

    const releaseAll = useCallback(async () => {
        const ids = Array.from(heldRef.current);
        heldRef.current.clear();
        for (const id of ids) {
            dispatch(markReleased({ docId: id }));
            releaseLock(id).catch(() => {});
        }
    }, [dispatch]);

    // Libération à l'unmount du composant et à la fermeture de la fenêtre
    useEffect(() => {
        const onBeforeUnload = () => {
            // Tente de libérer tous les verrous (best effort — la fenêtre se ferme).
            // navigator.sendBeacon est plus fiable que axios sur unload, mais
            // axios marche aussi en pratique car les requêtes sont en flight.
            for (const docId of heldRef.current) {
                try {
                    const url = `/api/document-locks/${encodeURIComponent(docId)}/release`;
                    const blob = new Blob([JSON.stringify({})], { type: 'application/json' });
                    if (navigator.sendBeacon) navigator.sendBeacon(url, blob);
                } catch (_) { /* best-effort */ }
            }
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', onBeforeUnload);
            // Unmount React → on libère les verrous proprement
            releaseAll();
            if (heartbeatTimerRef.current) {
                clearInterval(heartbeatTimerRef.current);
                heartbeatTimerRef.current = null;
            }
        };
    }, [releaseAll]);

    return { tryOpen, release, releaseAll };
}
