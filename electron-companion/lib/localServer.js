// electron-companion/lib/localServer.js
//
// Serveur HTTP local du compagnon. Ecoute UNIQUEMENT sur 127.0.0.1 et n'expose
// que les routes strictement necessaires :
//   GET  /health            -> presence (detection au login)
//   POST /open-document      -> ouvrir un docId dans Word (jeton compagnon exige)
//   GET  /sync-status/:docId -> etat de synchronisation
//   POST /close-cleanup      -> fermeture/nettoyage explicite
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
    try {
      await backendClient.whoami(backendBaseUrl, token);
    } catch (_e) {
      return sendJson(res, 401, { ok: false, error: 'invalid-companion-token' });
    }

    try {
      const result = await wordSession.open({ docId, fileName, backendBaseUrl, token });
      return sendJson(res, 200, result);
    } catch (err) {
      const status = err.code === 'LOCKED' ? 409 : 500;
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
