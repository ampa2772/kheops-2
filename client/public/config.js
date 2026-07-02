// =============================================================================
// Kheops 2 — Configuration RUNTIME du frontend
// =============================================================================
// Ce fichier est charge AVANT le bundle React (voir public/index.html). Il
// permet de pointer un backend different SANS recompiler le bundle.
//
// Par defaut il est VIDE : l'application retombe alors sur la valeur de build
// REACT_APP_API_URL (comportement Electron / local inchange).
//
// DEPLOIEMENT WEB HEBERGE : remplacez le contenu (ou injectez-le cote
// hebergeur, ex. via une etape de deploiement) pour cibler votre API, ex. :
//
//   window.__KHEOPS_CONFIG__ = { apiUrl: "https://api.kheops-2.fr" };
//
// Clefs supportees :
//   - apiUrl : URL de base de l'API backend (axios baseURL).
// =============================================================================
window.__KHEOPS_CONFIG__ = window.__KHEOPS_CONFIG__ || {};
