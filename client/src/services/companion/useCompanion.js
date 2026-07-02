// client/src/services/companion/useCompanion.js
//
// Hooks React au-dessus du store du companionClient (useSyncExternalStore).

import { useSyncExternalStore, useCallback } from 'react';
import { companionStore, DOC_STATE } from './companionClient';

/**
 * Etat de presence global du compagnon : 'unknown' | 'present' | 'absent'.
 */
export function useCompanionPresence() {
  return useSyncExternalStore(companionStore.subscribe, companionStore.getPresence);
}

/**
 * Etat d'un document precis (ouvert / sync / sauvegarde / erreur / ferme).
 */
export function useDocCompanionState(docId) {
  const getSnapshot = useCallback(() => companionStore.getDocState(docId), [docId]);
  return useSyncExternalStore(companionStore.subscribe, getSnapshot);
}

export { DOC_STATE };
