// server/utils/securityLogger.js
//
// Module centralisé de logs de sécurité serveur (auth, accès ressources, etc.).
// Tous les logs sont structurés (JSON-friendly) avec un timestamp ISO, un type
// d'événement, l'identité du user (si dispo), l'IP source et la route demandée.
// Double sortie : console + fichier `%APPDATA%\kheops-2\security.log` (créé à
// la volée). Fallback Linux/Mac : ~/.kheops2/security.log. Le fichier est
// append-only ; rotation manuelle pour le moment.
//
// Types d'événements (constants exportés) :
//   AUTH_LOGIN_SUCCESS      Login réussi (Google, Microsoft, local)
//   AUTH_LOGIN_FAILURE      Login échoué (mot de passe invalide, OAuth refusé, etc.)
//   AUTH_USER_CREATED       Nouveau user Kheops créé via OAuth (autocréation)
//   AUTH_LOGOUT             Logout côté client (note : pas de session serveur invalidée)
//   AUTH_TOKEN_VERIFY_OK    JWT vérifié avec succès dans le middleware
//   AUTH_TOKEN_VERIFY_FAIL  JWT invalide / expiré / absent
//   AUTH_BYPASS_USED        Mode dev : un user-de-bypass a été injecté
//   AUTH_REFRESH_TOKEN_GET  Vérification serveur de la présence d'une connexion OAuth
//   ACCESS_DENIED           Refus d'accès à une ressource (dossier d'un autre user, etc.)
//   ACCESS_GRANTED          (Optionnel) accès à une ressource sensible accordé
//   PASSWORD_RESET_REQUEST  Demande de code de reset password
//   PASSWORD_RESET_SUCCESS  Reset password effectué avec nouveau mdp
//   PASSWORD_RESET_FAILURE  Tentative de reset avec code invalide

const fs = require('fs');
const os = require('os');
const path = require('path');

const LOG_DIR = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'kheops-2')
  : path.join(os.homedir(), '.kheops2');
const LOG_FILE = path.join(LOG_DIR, 'security.log');
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 Mo, cohérent avec chatLogger.js

// Création paresseuse du dossier de logs au premier write
let logDirReady = false;
function ensureLogDir() {
  if (logDirReady) return;
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    logDirReady = true;
  } catch (err) {
    console.error('[securityLogger] Impossible de créer le dossier logs :', err.message);
  }
}

// Rotation simple : > 5 Mo -> renommé en `.old` (un seul ancien fichier conservé).
function rotateIfNeeded() {
  try {
    const st = fs.statSync(LOG_FILE);
    if (st.size > MAX_LOG_BYTES) {
      fs.renameSync(LOG_FILE, LOG_FILE + '.old');
    }
  } catch (_) { /* fichier inexistant : OK */ }
}

// Extraction de l'IP réelle (gère X-Forwarded-For derrière un reverse proxy)
function extractIp(req) {
  if (!req) return null;
  const fwd = req.headers && (req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For']);
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.ip || (req.connection && req.connection.remoteAddress) || null;
}

function extractUA(req) {
  if (!req || !req.headers) return null;
  return req.headers['user-agent'] || req.headers['User-Agent'] || null;
}

function extractRoute(req) {
  if (!req) return null;
  // Les callbacks OAuth portent des codes/state dans la query string.
  return `${req.method || '?'} ${String(req.originalUrl || req.url || '?').split(/[?#]/)[0]}`;
}

/**
 * Log un événement de sécurité structuré.
 *
 * @param {string} type  Constante d'événement (voir liste en tête de fichier)
 * @param {object} data  Champs métier — typiquement :
 *   - userId       : l'ID du user concerné (si connu)
 *   - email        : l'email du user (compte Kheops, OU compte cloud d'auth)
 *   - source       : 'google' | 'microsoft' | 'local-password' | 'bypass-dev' | ...
 *   - reason       : raison de l'échec ou détail
 *   - resourceId   : ID de la ressource accédée (dossier, doc...)
 *   - resourceType : 'dossier' | 'document' | etc.
 *   - extra        : objet libre pour info additionnelle
 * @param {object} [req]  Optionnel : la requête Express pour extraire IP+UA+route
 */
function log(type, data = {}, req = null) {
  const event = {
    ts: new Date().toISOString(),
    type,
    userId: data.userId || null,
    email: data.email || null,
    source: data.source || null,
    reason: data.reason || null,
    resourceType: data.resourceType || null,
    resourceId: data.resourceId || null,
    ip: extractIp(req),
    ua: extractUA(req),
    route: extractRoute(req),
    extra: data.extra || null,
  };

  // Console : on garde un format lisible humain + le JSON pour grep
  const tag = `[SECURITY ${event.type}]`;
  const human = [
    event.userId ? `userId=${event.userId}` : null,
    event.email ? `email=${event.email}` : null,
    event.source ? `source=${event.source}` : null,
    event.ip ? `ip=${event.ip}` : null,
    event.route ? `route=${event.route}` : null,
    event.reason ? `reason=${event.reason}` : null,
    event.resourceType ? `${event.resourceType}=${event.resourceId || '?'}` : null,
  ].filter(Boolean).join(' ');
  console.log(`${tag} ${human}`);

  // Fichier : ligne JSON pour parsing automatisé
  ensureLogDir();
  if (logDirReady) {
    try {
      rotateIfNeeded();
      fs.appendFileSync(LOG_FILE, JSON.stringify(event) + '\n', { encoding: 'utf8' });
    } catch (err) {
      console.error('[securityLogger] Échec écriture log :', err.message);
    }
  }
}

module.exports = {
  log,
  // Constantes pour éviter les fautes de frappe sur le `type`
  EVT: {
    AUTH_LOGIN_SUCCESS:     'AUTH_LOGIN_SUCCESS',
    AUTH_LOGIN_FAILURE:     'AUTH_LOGIN_FAILURE',
    AUTH_USER_CREATED:      'AUTH_USER_CREATED',
    AUTH_LOGOUT:            'AUTH_LOGOUT',
    AUTH_TOKEN_VERIFY_OK:   'AUTH_TOKEN_VERIFY_OK',
    AUTH_TOKEN_VERIFY_FAIL: 'AUTH_TOKEN_VERIFY_FAIL',
    AUTH_BYPASS_USED:       'AUTH_BYPASS_USED',
    AUTH_REFRESH_TOKEN_GET: 'AUTH_REFRESH_TOKEN_GET',
    ACCESS_DENIED:          'ACCESS_DENIED',
    ACCESS_GRANTED:         'ACCESS_GRANTED',
    PASSWORD_RESET_REQUEST: 'PASSWORD_RESET_REQUEST',
    PASSWORD_RESET_SUCCESS: 'PASSWORD_RESET_SUCCESS',
    PASSWORD_RESET_FAILURE: 'PASSWORD_RESET_FAILURE',
  },
  extractIp,
  extractUA,
};
