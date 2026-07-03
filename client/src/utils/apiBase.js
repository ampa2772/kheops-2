// client/src/utils/apiBase.js
//
// Résolution UNIQUE de l'URL de base du backend, utilisée partout où l'on
// construit une URL absolue (login OAuth Google/Microsoft, connexion cloud,
// socket temps réel). Ordre de priorité :
//   1. config RUNTIME `window.__KHEOPS_CONFIG__.apiUrl` (posée par config.js,
//      servi par l'hébergeur AVANT le bundle) → web hébergé = même origine ;
//   2. valeur de BUILD `REACT_APP_API_URL` → app Electron packagée (localhost) ;
//   3. `window.location.origin` en dernier recours.
//
// Bug historique corrigé : les appelants faisaient `REACT_APP_API_URL ||
// window.location.origin`. Or `REACT_APP_API_URL` est TOUJOURS défini au build
// (=localhost:5000, pour Electron), donc le repli vers l'origine ne se
// déclenchait JAMAIS → le site hébergé pointait vers localhost. En donnant la
// priorité à la config runtime (posée à l'origine du site sur l'hébergé), le
// problème disparaît sans casser Electron (qui n'a pas de config runtime).

export function resolveApiBase() {
  const runtime =
    (typeof window !== 'undefined' && window.__KHEOPS_CONFIG__) || {};
  if (runtime.apiUrl) return runtime.apiUrl;
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
  return (typeof window !== 'undefined' && window.location && window.location.origin) || '';
}

export default resolveApiBase;
