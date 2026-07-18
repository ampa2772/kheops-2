// electron-companion/lib/localServer.js
//
// Serveur HTTP local du compagnon. Ecoute UNIQUEMENT sur 127.0.0.1 et n'expose
// que les routes strictement necessaires :
//   GET  /health            -> presence (detection au login)
//   POST /open-document      -> ouvrir un docId dans Word (jeton compagnon exige)
//   GET  /sync-status/:docId -> etat de synchronisation
//   POST /close-cleanup      -> fermeture/nettoyage explicite
//   POST /shutdown           -> arret PROPRE du compagnon (avant mise a jour)
//   POST /mirror/sync        -> synchronise le MIROIR LOCAL (jeton compagnon exige)
//   GET  /mirror/status      -> etat du miroir local
//
// Toute requete passe par security.guard (Origin allowlist + en-tete anti-CSRF).
// /open-document exige en plus un jeton de session compagnon valide, revalide
// aupres du backend (le compagnon ne detient aucun secret).

const http = require('http');
const { PORT, BIND_HOST, COMPANION_TOKEN_HEADER, APP_NAME } = require('./config');
const security = require('./security');
const wordSession = require('./wordSession');
const backendClient = require('./backendClient');

let VERSION = '0.0.0';
try { VERSION = require('../package.json').version || VERSION; } catch (_) {}

const MAX_BODY_BYTES = 256 * 1024; // les payloads sont de petits JSON

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('payload-too-large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (_e) { reject(new Error('invalid-json')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${BIND_HOST}:${PORT}`);
  const pathname = url.pathname;
  const method = req.method;

  // Preflight CORS / Private Network Access.
  if (method === 'OPTIONS') return security.handlePreflight(req, res);

  // Garde commune : Origin allowlist + en-tete anti-CSRF + CORS headers.
  const g = security.guard(req, res);
  if (!g.ok) return sendJson(res, g.status, { ok: false, error: g.reason });

  // GET /health
  if (method === 'GET' && pathname === '/health') {
    return sendJson(res, 200, { ok: true, app: APP_NAME, version: VERSION, platform: process.platform });
  }

  // POST /open-document
  if (method === 'POST' && pathname === '/open-document') {
    const token = req.headers[COMPANION_TOKEN_HEADER];
    if (!token) return sendJson(res, 401, { ok: false, error: 'missing-companion-token' });
    let body;
    try { body = await readJsonBody(req); }
    catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }

    const { docId, fileName, backendBaseUrl } = body || {};
    if (!docId || !backendBaseUrl) return sendJson(res, 400, { ok: false, error: 'docId-and-backendBaseUrl-required' });

    // Revalidation du jeton aupres du backend (le compagnon n'a aucun secret).
    let identity;
    try {
      identity = await backendClient.whoami(backendBaseUrl, token);
    } catch (_e) {
      return sendJson(res, 401, { ok: false, error: 'invalid-companion-token' });
    }
    // Un backend recent distingue explicitement un jeton compagnon d'un JWT
    // utilisateur normal. `undefined` reste accepte pour compatibilite avec un
    // backend anterieur qui ne renvoyait que { ok, userId }.
    if (identity?.companion === false) {
      return sendJson(res, 401, { ok: false, error: 'invalid-companion-token-scope' });
    }
    if (identity?.companion === true && identity?.purpose
      && (identity.purpose !== 'word'
        || (identity.docId && String(identity.docId) !== String(docId)))) {
      return sendJson(res, 401, { ok: false, error: 'invalid-companion-document-scope' });
    }

    try {
      const result = await wordSession.open({
        docId,
        fileName,
        backendBaseUrl,
        token,
        tokenExpiresAt: identity?.expiresAt || null,
        sessionAbsoluteExpiresAt: identity?.sessionAbsoluteExpiresAt || null,
        userId: identity?.userId || null,
      });
      return sendJson(res, 200, result);
    } catch (err) {
      const status = ['LOCKED', 'SYNC_IN_PROGRESS'].includes(err.code) ? 409 : 500;
      return sendJson(res, status, { ok: false, error: err.message, code: err.code || null });
    }
  }

  // GET /sync-status/:docId
  if (method === 'GET' && pathname.startsWith('/sync-status/')) {
    const docId = decodeURIComponent(pathname.slice('/sync-status/'.length));
    if (!docId) return sendJson(res, 400, { ok: false, error: 'docId-required' });
    return sendJson(res, 200, wordSession.getStatus(docId));
  }

  // POST /close-cleanup
  if (method === 'POST' && pathname === '/close-cleanup') {
    let body;
    try { body = await readJsonBody(req); }
    catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
    const { docId } = body || {};
    if (!docId) return sendJson(res, 400, { ok: false, error: 'docId-required' });
    try {
      const result = await wordSession.closeCleanup(docId);
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  // POST /mirror/sync
  // Synchronise le MIROIR LOCAL (C:\Files_Clients\Kheops2\Dossiers\<noms lisibles>)
  // pour les comptes sans cloud personnel. Declenche par le web apres login.
  // Jeton compagnon exige + revalide (comme /open-document) : le manifeste et
  // les telechargements se font avec CE jeton, jamais persiste sur disque.
  if (method === 'POST' && pathname === '/mirror/sync') {
    const token = req.headers[COMPANION_TOKEN_HEADER];
    if (!token) return sendJson(res, 401, { ok: false, error: 'missing-companion-token' });
    let body;
    try { body = await readJsonBody(req); }
    catch (e) { return sendJson(res, 400, { ok: false, error: e.message }); }
    const { backendBaseUrl } = body || {};
    if (!backendBaseUrl) return sendJson(res, 400, { ok: false, error: 'backendBaseUrl-required' });
    let identity;
    try {
      identity = await backendClient.whoami(backendBaseUrl, token);
    } catch (_e) {
      return sendJson(res, 401, { ok: false, error: 'invalid-companion-token' });
    }
    if (identity?.companion === false) {
      return sendJson(res, 401, { ok: false, error: 'invalid-companion-token-scope' });
    }
    if (identity?.companion === true && identity?.purpose && identity.purpose !== 'mirror') {
      return sendJson(res, 401, { ok: false, error: 'invalid-companion-mirror-scope' });
    }
    // 202 immediat : la synchro (potentiellement longue) se poursuit en fond.
    const mirror = require('./mirror');
    mirror.sync({
      backendBaseUrl,
      token,
      tokenExpiresAt: identity?.expiresAt || null,
      sessionAbsoluteExpiresAt: identity?.sessionAbsoluteExpiresAt || null,
      userId: identity?.userId || null,
    }).catch(() => {});
    return sendJson(res, 202, { ok: true, started: true });
  }

  // GET /mirror/status
  if (method === 'GET' && pathname === '/mirror/status') {
    const mirror = require('./mirror');
    return sendJson(res, 200, { ok: true, ...mirror.getStatus() });
  }

  // POST /shutdown
  // Arret PROPRE du compagnon, declenche par l'app web JUSTE AVANT de lancer
  // l'installeur de mise a jour. Le compagnon etant un agent de fond SANS
  // fenetre, l'installeur NSIS ne peut pas le fermer via un message de fenetre
  // (d'ou l'ancien blocage « veuillez fermer le compagnon »). On repond d'abord,
  // PUIS on quitte (before-quit libere le port 8080 et les verrous Word), pour
  // que le fichier .exe soit liberable par l'installeur. Proteger par la garde
  // commune (Origin Kheops + anti-CSRF) suffit : aucune donnee sensible, juste
  // l'arret du process. Pas de jeton compagnon exige (rien a lire/ecrire).
  if (method === 'POST' && pathname === '/shutdown') {
    sendJson(res, 200, { ok: true, shuttingDown: true });
    // Laisse la reponse HTTP se vider avant de couper le process.
    setTimeout(() => {
      try {
        // require paresseux : hors contexte Electron (tests), on ne fait rien.
        const { app } = require('electron');
        if (app && typeof app.quit === 'function') app.quit();
      } catch (_) { /* pas de contexte Electron : no-op */ }
    }, 250);
    return undefined;
  }

  return sendJson(res, 404, { ok: false, error: 'not-found' });
}

let server = null;

function start() {
  if (server) return server;
  server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      try { sendJson(res, 500, { ok: false, error: err.message }); } catch (_) {}
    });
  });

  server.on('error', (err) => {
    // EADDRINUSE = un compagnon (ou autre process) tient deja le port. On laisse
    // l'instance existante servir (single-instance lock cote main couvre le cas
    // d'un double-lancement du compagnon lui-meme).
    console.error(`[Companion] Erreur serveur local: ${err.code || err.message}`);
  });

  server.listen(PORT, BIND_HOST, () => {
    console.log(`[Companion] Serveur local sur http://${BIND_HOST}:${PORT} (loopback only) v${VERSION}`);
  });
  return server;
}

function stop() {
  if (server) { try { server.close(); } catch (_) {} server = null; }
}

module.exports = { start, stop };
