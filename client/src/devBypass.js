// =====================================================================
// === DEV BYPASS — Désactivation temporaire de l'authentification ====
// Pilote par variable d'environnement REACT_APP_KHEOPS_BYPASS_AUTH.
// Bypass actif uniquement si la variable vaut explicitement 'true' ;
// sinon (absente, autre valeur, build prod) → bypass désactivé (sécurité
// par défaut). Doit rester aligné avec KHEOPS_BYPASS_AUTH côté serveur
// (middleware-auth.js + chatSocketHandler.js).
// =====================================================================
export const BYPASS_AUTH = process.env.REACT_APP_KHEOPS_BYPASS_AUTH === 'true';

// Token factice injecté en localStorage quand BYPASS_AUTH est actif.
// Sa valeur n'a pas d'importance : le serveur ignore la vérification JWT
// quand son propre flag BYPASS_AUTH est activé.
export const BYPASS_DEV_TOKEN = 'dev-bypass-token';
