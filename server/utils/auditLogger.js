// server/utils/auditLogger.js
//
// Module centralise de logs CRUD metier pour Kheops 2 (rc37, chantier 2).
//
// Different de securityLogger.js (auth/access) : ce module trace les
// modifications data (creations, mises a jour, suppressions d'entites
// metier : dossiers, documents, evenements, contacts, factures, etc.).
//
// Sortie : console + fichier `%APPDATA%\kheops-2\audit.log` (JSON par ligne).
// En dev (npm start) comme en build packagee Electron, le serveur Express
// tourne dans un process Node ou la variable APPDATA est definie sous Windows.
// Fallback Linux/Mac : ~/.kheops2/audit.log.
// L'auditeur conserve toujours :
//   - userId / email (auteur)
//   - entityType / entityId
//   - action (CREATE / UPDATE / DELETE)
//   - result (success / failure)
//   - reason (si failure)
//   - extra (champs metier modifies, etc.)
//   - ip / ua / route
//
// Usage minimaliste :
//   const audit = require('../utils/auditLogger');
//   audit.create(req, 'dossier', dossier._id, { reference: dossier.reference });
//   audit.update(req, 'contact', contact._id, { fields: ['email', 'telephone'] });
//   audit.delete(req, 'agendaEvent', eventId);
//   audit.failure(req, 'CREATE', 'dossier', null, 'validation-failed', { ... });

const fs = require('fs');
const os = require('os');
const path = require('path');

const LOG_DIR = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'kheops-2')
  : path.join(os.homedir(), '.kheops2');
const LOG_FILE = path.join(LOG_DIR, 'audit.log');
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 Mo, coherent avec chatLogger.js

let logDirReady = false;
function ensureLogDir() {
  if (logDirReady) return;
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    logDirReady = true;
  } catch (err) {
    console.error('[auditLogger] Impossible de creer le dossier logs :', err.message);
  }
}

// Rotation simple : si le fichier depasse 5 Mo, on le renomme en `.old`
// (un seul ancien fichier conserve, le suivant ecrase le precedent).
function rotateIfNeeded() {
  try {
    const st = fs.statSync(LOG_FILE);
    if (st.size > MAX_LOG_BYTES) {
      fs.renameSync(LOG_FILE, LOG_FILE + '.old');
    }
  } catch (_) { /* fichier inexistant : OK */ }
}

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
  return `${req.method || '?'} ${req.originalUrl || req.url || '?'}`;
}

/**
 * Log un evenement CRUD metier structure.
 *
 * @param {object} args
 *   - action       : 'CREATE' | 'UPDATE' | 'DELETE' | autre
 *   - entityType   : 'dossier' | 'document' | 'agendaEvent' | 'contact' | etc.
 *   - entityId     : id de la ressource
 *   - userId       : id du user auteur
 *   - email        : email du user (optionnel)
 *   - result       : 'success' | 'failure'
 *   - reason       : string (raison d'echec)
 *   - extra        : objet libre pour info metier (champs modifies, etc.)
 * @param {object} [req] requete Express pour extraire ip/ua/route
 */
function log(args, req = null) {
  const event = {
    ts: new Date().toISOString(),
    action: args.action || null,
    entityType: args.entityType || null,
    entityId: args.entityId ? String(args.entityId) : null,
    userId: args.userId ? String(args.userId) : (req && req.user ? String(req.user) : null),
    email: args.email || null,
    result: args.result || 'success',
    reason: args.reason || null,
    extra: args.extra || null,
    ip: extractIp(req),
    ua: extractUA(req),
    route: extractRoute(req),
  };

  // Console : un seul format human-friendly
  const tag = `[AUDIT ${event.action || '?'} ${event.entityType || '?'}]`;
  const human = [
    event.userId ? `userId=${event.userId}` : null,
    event.entityId ? `id=${event.entityId}` : null,
    event.result === 'failure' ? `FAIL=${event.reason}` : null,
    event.extra ? `extra=${JSON.stringify(event.extra)}` : null,
  ].filter(Boolean).join(' ');
  console.log(`${tag} ${human}`);

  // Fichier : ligne JSON (pour parsing offline)
  ensureLogDir();
  if (logDirReady) {
    try {
      rotateIfNeeded();
      fs.appendFileSync(LOG_FILE, JSON.stringify(event) + '\n', { encoding: 'utf8' });
    } catch (err) {
      console.error('[auditLogger] Echec ecriture audit log :', err.message);
    }
  }
}

// Helpers haut-niveau pour rester concis dans les routes :
function create(req, entityType, entityId, extra) {
  log({ action: 'CREATE', entityType, entityId, extra }, req);
}
function update(req, entityType, entityId, extra) {
  log({ action: 'UPDATE', entityType, entityId, extra }, req);
}
function remove(req, entityType, entityId, extra) {
  log({ action: 'DELETE', entityType, entityId, extra }, req);
}
function failure(req, action, entityType, entityId, reason, extra) {
  log({ action, entityType, entityId, result: 'failure', reason, extra }, req);
}

module.exports = {
  log,
  create,
  update,
  delete: remove,   // `delete` est un mot reserve pour les destructurations
  remove,
  failure,
};
