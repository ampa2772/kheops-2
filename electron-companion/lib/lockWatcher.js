// electron-companion/lib/lockWatcher.js
//
// Detection de la FERMETURE d'un document ouvert dans Word, pour liberer le
// verrou collaboratif cote serveur. Portage du documentLockWatcher de l'app
// Electron historique (meme strategie eprouvee), mais decouple : il passe par
// backendClient (jeton compagnon) au lieu d'axios brut, et n'a aucune autre
// dependance a l'ancienne app.
//
// Strategie en 2 couches :
//   COUCHE 1 — fichier-lock Office "~$<nom>" (Word le cree a l'ouverture et le
//     supprime a la fermeture) : le plus fiable.
//   COUCHE 2 — sonde periodique du file-lock (fallback) si pas de ~$ apres 30s.
// Filet de securite : TTL absolu de 8h.

const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const backendClient = require('./backendClient');

const OFFICE_LOCK_DETECTION_TIMEOUT_MS = 30_000;
const FALLBACK_PROBE_INTERVAL_MS = 5_000;
const ABSOLUTE_TTL_MS = 8 * 60 * 60 * 1000;

const sessions = new Map(); // docId -> session

function track({ docId, localFilePath, backendBaseUrl, token, onReleased }) {
  if (!docId || !localFilePath) return;
  if (sessions.has(docId)) stop(docId, { silent: true });
  if (!fs.existsSync(localFilePath)) return;

  const fileDir = path.dirname(localFilePath);
  const officeLockName = `~$${path.basename(localFilePath)}`;

  const session = {
    docId, localFilePath, officeLockName, backendBaseUrl, token, onReleased,
    watcher: null, officeDetected: false,
    officeTimeoutTimer: null, fallbackProbeTimer: null, absoluteTtlTimer: null,
    released: false,
  };
  sessions.set(docId, session);

  try {
    session.watcher = chokidar.watch(fileDir, {
      persistent: true, ignoreInitial: false, depth: 0, awaitWriteFinish: false,
    });
    session.watcher.on('add', (p) => {
      if (path.basename(p) === officeLockName) {
        session.officeDetected = true;
        if (session.officeTimeoutTimer) { clearTimeout(session.officeTimeoutTimer); session.officeTimeoutTimer = null; }
        if (session.fallbackProbeTimer) { clearInterval(session.fallbackProbeTimer); session.fallbackProbeTimer = null; }
      }
    });
    session.watcher.on('unlink', (p) => {
      if (path.basename(p) === officeLockName && session.officeDetected) {
        releaseAndStop(session, 'office-close');
      }
    });
    session.watcher.on('error', () => { /* watcher errors non fatales */ });
  } catch (_e) { /* chokidar indisponible : on garde au moins le TTL + fallback */ }

  session.officeTimeoutTimer = setTimeout(() => {
    if (session.released || session.officeDetected) return;
    startFallbackProbe(session);
  }, OFFICE_LOCK_DETECTION_TIMEOUT_MS);

  session.absoluteTtlTimer = setTimeout(() => {
    if (session.released) return;
    releaseAndStop(session, 'absolute-ttl');
  }, ABSOLUTE_TTL_MS);
}

function startFallbackProbe(session) {
  if (session.released) return;
  session.fallbackProbeTimer = setInterval(() => {
    if (session.released) return;
    if (!fs.existsSync(session.localFilePath)) { releaseAndStop(session, 'file-missing'); return; }
    let fd;
    try {
      fd = fs.openSync(session.localFilePath, 'r+'); // EBUSY si Word tient le handle
      fs.closeSync(fd);
      releaseAndStop(session, 'fallback-probe');
    } catch (err) {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) {} }
      // EBUSY/EPERM/EACCES => encore ouvert, on retente.
    }
  }, FALLBACK_PROBE_INTERVAL_MS);
}

function releaseAndStop(session, reason) {
  if (session.released) return;
  session.released = true;
  if (session.officeTimeoutTimer) clearTimeout(session.officeTimeoutTimer);
  if (session.fallbackProbeTimer) clearInterval(session.fallbackProbeTimer);
  if (session.absoluteTtlTimer) clearTimeout(session.absoluteTtlTimer);
  if (session.watcher) { try { session.watcher.close(); } catch (_) {} session.watcher = null; }

  backendClient.releaseLock(session.backendBaseUrl, session.token, session.docId)
    .catch(() => { /* le serveur expirera le verrou apres 90s sans heartbeat */ })
    .finally(() => {
      sessions.delete(session.docId);
      if (typeof session.onReleased === 'function') {
        try { session.onReleased({ docId: session.docId, reason }); } catch (_) {}
      }
    });
}

function stop(docId, options = {}) {
  const session = sessions.get(docId);
  if (!session) return;
  if (options.releaseLock) { releaseAndStop(session, 'manual-stop'); return; }
  if (session.officeTimeoutTimer) clearTimeout(session.officeTimeoutTimer);
  if (session.fallbackProbeTimer) clearInterval(session.fallbackProbeTimer);
  if (session.absoluteTtlTimer) clearTimeout(session.absoluteTtlTimer);
  if (session.watcher) { try { session.watcher.close(); } catch (_) {} }
  session.released = true;
  sessions.delete(docId);
}

function stopAll() {
  for (const id of Array.from(sessions.keys())) stop(id, { silent: true });
}

module.exports = { track, stop, stopAll, OFFICE_LOCK_DETECTION_TIMEOUT_MS, FALLBACK_PROBE_INTERVAL_MS, ABSOLUTE_TTL_MS };
