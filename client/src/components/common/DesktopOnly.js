// client/src/components/common/DesktopOnly.js
//
// Composant utilitaire (Phase 2 — mode web) : rend ses enfants UNIQUEMENT
// quand l'application tourne dans Electron (pont window.electron present).
// En mode navigateur (web), rend `fallback` (null par defaut).
//
// A utiliser pour les fonctionnalites desktop-only afin de ne pas presenter a
// l'utilisateur web des actions qui ne peuvent pas aboutir (ouvrir un .docx
// dans Word local, drag de fichier vers une autre app, feuille de secours du
// chiffrement, synchronisation locale...).
//
// @example
//   <DesktopOnly>
//     <button onClick={openInWord}>Ouvrir dans Word</button>
//   </DesktopOnly>
//
//   <DesktopOnly fallback={<a href={url} download>Telecharger</a>}>
//     <button onClick={openInWord}>Ouvrir dans Word</button>
//   </DesktopOnly>

import { useIsElectron } from '../../services/electronBridge';

const DesktopOnly = ({ children, fallback = null }) => {
  const isElectron = useIsElectron();
  return isElectron ? children : fallback;
};

export default DesktopOnly;
