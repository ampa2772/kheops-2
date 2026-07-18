// =============================================================================
// Kheops 2 — Configuration RUNTIME du frontend
// =============================================================================
// Ce fichier est charge AVANT le bundle React (voir public/index.html). Il
// permet de pointer un backend different SANS recompiler le bundle.
//
// Comportement AUTO :
//   - Web HEBERGE (http/https, hors localhost) : l'API, le temps reel et les
//     redirections OAuth sont servis par la MEME origine que le site. On fixe
//     donc apiUrl = origine du site automatiquement (aucune retouche a faire
//     au deploiement, robuste si l'URL change / domaine personnalise).
//   - Electron / local : on ne touche a rien => l'app retombe sur la valeur de
//     build REACT_APP_API_URL (http://localhost:5000, serveur embarque).
//
// Pour forcer un backend different (API sur un autre domaine), definir
// window.__KHEOPS_CONFIG__.apiUrl AVANT ce script, ou remplacer ce fichier.
//
// Clefs supportees :
//   - apiUrl : URL de base de l'API backend (axios baseURL + OAuth + socket).
//   - companionInstallerUrlWindows : installateur .exe du compagnon Windows.
//   - companionInstallerUrlMacos : installateur .dmg/.pkg du compagnon macOS.
//     Sans URL macOS explicite, l'interface affiche un repli clair et ne
//     propose jamais l'ancien .exe Windows.
//   - features : drapeaux d'activation réversibles. Exemple :
//       { aiAssistant: true, responsiveEditor: true,
//         relationGraph: true, documentSyncV2: true, officeEngine: true }
// =============================================================================
window.__KHEOPS_CONFIG__ = window.__KHEOPS_CONFIG__ || {};
(function () {
  window.__KHEOPS_CONFIG__.features = window.__KHEOPS_CONFIG__.features || {
    aiAssistant: true,
    responsiveEditor: true,
    relationGraph: true,
    documentSyncV2: true,
    officeEngine: true,
  };
})();
(function () {
  try {
    var loc = (typeof window !== 'undefined' && window.location) || {};
    var isHttp = /^https?:$/.test(loc.protocol || '');
    var isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname || '');
    if (isHttp && !isLocal && !window.__KHEOPS_CONFIG__.apiUrl) {
      window.__KHEOPS_CONFIG__.apiUrl = loc.origin;
    }
  } catch (e) {
    /* no-op : on laisse le fallback REACT_APP_API_URL agir */
  }
})();
