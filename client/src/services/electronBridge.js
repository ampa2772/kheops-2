// client/src/services/electronBridge.js
//
// SOURCE DE VERITE UNIQUE pour la detection de l'environnement Electron cote
// renderer React (Phase 2 — preparation du mode web).
//
// Le pont IPC est expose par electron-app/preload.js sous deux objets :
//   - window.electron     : crypto, documents, sync, drag OS, openExternal...
//   - window.electronAPI  : authentification cloud (login Google/Microsoft)
//
// En mode NAVIGATEUR (web), ces objets sont absents. Ces helpers renvoient
// alors false/null afin que l'UI degrade proprement (fallbacks web, boutons
// desktop-only masques/desactives) AU LIEU DE PLANTER. A utiliser partout
// plutot que de re-tester ad hoc `typeof window !== 'undefined' && window.electron...`.

import { useMemo } from 'react';

/** Le pont principal window.electron est-il disponible ? (true en Electron) */
export function isElectron() {
  return typeof window !== 'undefined' && !!window.electron;
}

/** L'API cloud window.electronAPI (login Google/Microsoft) est-elle dispo ? */
export function hasElectronAPI() {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

/** Accesseur sur a window.electron, ou null en mode web. */
export function getElectron() {
  return isElectron() ? window.electron : null;
}

/** Accesseur sur a window.electronAPI, ou null en mode web. */
export function getElectronAPI() {
  return hasElectronAPI() ? window.electronAPI : null;
}

/**
 * Accesseur sur au module crypto IPC (window.electron.crypto), ou null.
 * Le chiffrement E2E est une fonctionnalite desktop-only : en mode web ce
 * helper renvoie null et les operations crypto doivent etre evitees/grisees.
 */
export function getElectronCrypto() {
  if (typeof window === 'undefined') return null;
  return window.electron && window.electron.crypto ? window.electron.crypto : null;
}

/**
 * Hook React : true si on tourne dans Electron, false dans un navigateur web.
 * A utiliser pour masquer/desactiver proprement les fonctionnalites
 * desktop-only (ouverture Word locale, drag OS vers une autre app, feuille de
 * secours du chiffrement, synchronisation locale...).
 *
 * @example
 *   const isElectron = useIsElectron();
 *   {isElectron && <button onClick={openInWord}>Ouvrir dans Word</button>}
 */
export function useIsElectron() {
  // La presence du pont ne change pas pendant la vie de la page -> useMemo([]).
  return useMemo(() => isElectron(), []);
}
