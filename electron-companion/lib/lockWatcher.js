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
// Filet de securite : apres 8h, on REVALIDE periodiquement l'etat du document.
// Cette echeance ne constitue jamais, a elle seule, une preuve de fermeture :
// une session Word legitime peut durer plus de 8h.

const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const backendClient = require('./backendClient');

const OFFICE_LOCK_DETECTION_TIMEOUT_MS = 30_000;
const FALLBACK_PROBE_INTERVAL_MS = 5_000;
const ABSOLUTE_TTL_MS = 8 * 60 * 60 * 1000;
const TTL_REVALIDATION_INTERVAL_MS = FALLBACK_PROBE_INTERVAL_MS;

const sessions = new Map(); // docId -> session

function track({ docId, localFilePath, backendBaseUrl, token, getToken, onReleased }) {
  if (!docId || !localFilePath) return;
  if (sessions.has(docId)) stop(docId, { silent: true });
  if (!fs.existsSync(localFilePath)) return;

  const fileDir = path.dirname(localFilePath);
  const officeLockName = `~$${path.basename(localFilePath)}`;

  const session = {
    docId, localFilePath, officeLockName, backendBaseUrl, token, getToken, onReleased,
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

  scheduleTtlRevalidation(session, ABSOLUTE_TTL_MS);
}

function startFallbackProbe(session) {
  if (session.released || session.fallbackProbeTimer) return;
  session.fallbackProbeTimer = setInterval(() => {
    if (session.released) return;
    const state = probeLocalFile(session.localFilePath);
    if (state === 'missing') {
      releaseAndStop(session, 'file-missing');
      return;
    }
    if (state === 'available') {
      releaseAndStop(session, 'fallback-probe');
    }
  }, FALLBACK_PROBE_INTERVAL_MS);
}

/**
 * Verifie si le fichier principal peut etre repris par le compagnon.
 * Toute erreur autre qu'une disparition est traitee de maniere conservative :
 * le document peut encore etre tenu par Word, donc on ne finalise pas.
 */
function probeLocalFile(localFilePath) {
  if (!fs.existsSync(localFilePath)) return 'missing';

  let fd;
  try {
    fd = fs.openSync(localFilePath, 'r+'); // EBUSY/EPERM/EACCES si Word tient le handle
    fs.closeSync(fd);
    return 'available';
  } catch (err) {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) {} }
    return err && err.code === 'ENOENT' ? 'missing' : 'busy-or-unknown';
  }
}

function scheduleTtlRevalidation(session, delayMs) {
  if (session.released) return;
  if (session.absoluteTtlTimer) clearTimeout(session.absoluteTtlTimer);
  session.absoluteTtlTimer = setTimeout(() => {
    session.absoluteTtlTimer = null;
    revalidateAtTtl(session);
  }, delayMs);
}

/**
 * Le TTL est un controle de securite, pas un signal de fermeture.
 *
 * - Si le lock Office existe, Word est considere ouvert et on recontrole plus
 *   tard. Cela couvre notamment une session legitime de plus de huit heures.
 * - Si chokidar a manque le lock Office, sa presence est rattrapee ici.
 * - Sans lock Office, on applique la meme sonde conservative que le fallback.
 *
 * Une seule timeout de revalidation est armee a la fois. releaseAndStop/stop la
 * nettoient, ce qui evite d'accumuler timers ou sessions apres la fermeture.
 */
function revalidateAtTtl(session) {
  if (session.released) return;

  const officeLockPath = path.join(path.dirname(session.localFilePath), session.officeLockName);
  if (fs.existsSync(officeLockPath)) {
    session.officeDetected = true;
    if (session.officeTimeoutTimer) {
      clearTimeout(session.officeTimeoutTimer);
      session.officeTimeoutTimer = null;
    }
    if (session.fallbackProbeTimer) {
      clearInterval(session.fallbackProbeTimer);
      session.fallbackProbeTimer = null;
    }
    scheduleTtlRevalidation(session, TTL_REVALIDATION_INTERVAL_MS);
    return;
  }

  const state = probeLocalFile(session.localFilePath);
  if (state === 'missing') {
    releaseAndStop(session, 'file-missing-at-ttl');
    return;
  }
  if (state === 'available') {
    releaseAndStop(session, session.officeDetected
      ? 'office-close-revalidated'
      : 'fallback-probe-at-ttl');
    return;
  }

  // Le fichier est encore verrouille (ou son etat est incertain) : surtout ne
  // pas finaliser. Le fallback continue s'il etait actif, et cette timeout
  // unique constitue le filet de securite si le watcher/fallback est defaillant.
  if (!session.officeDetected) startFallbackProbe(session);
  scheduleTtlRevalidation(session, TTL_REVALIDATION_INTERVAL_MS);
}

function releaseAndStop(session, reason) {
  if (session.released) return;
  session.released = true;
  if (session.officeTimeoutTimer) clearTimeout(session.officeTimeoutTimer);
  if (session.fallbackProbeTimer) clearInterval(session.fallbackProbeTimer);
  if (session.absoluteTtlTimer) clearTimeout(session.absoluteTtlTimer);
  session.officeTimeoutTimer = null;
  session.fallbackProbeTimer = null;
  session.absoluteTtlTimer = null;
  if (session.watcher) { try { session.watcher.close(); } catch (_) {} session.watcher = null; }

  // Promise.resolve().then couvre aussi une exception synchrone inattendue du
  // client HTTP : la session et son callback sont alors tout de meme nettoyes.
  Promise.resolve()
    .then(() => {
      const token = typeof session.getToken === 'function' ? session.getToken() : session.token;
      if (!token) throw new Error('Jeton compagnon indisponible.');
      return backendClient.releaseLock(session.backendBaseUrl, token, session.docId);
    })
    .catch(() => { /* le serveur expirera le verrou apres 90s sans heartbeat */ })
    .finally(() => {
      // Ne jamais supprimer une nouvelle session qui aurait repris le meme
      // docId pendant que la requete de release precedente etait en vol.
      if (sessions.get(session.docId) === session) sessions.delete(session.docId);
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
  session.officeTimeoutTimer = null;
  session.fallbackProbeTimer = null;
  session.absoluteTtlTimer = null;
  if (session.watcher) { try { session.watcher.close(); } catch (_) {} session.watcher = null; }
  session.released = true;
  sessions.delete(docId);
}

function stopAll() {
  for (const id of Array.from(sessions.keys())) stop(id, { silent: true });
}

function getStateForTesting() {
  return {
    docIds: Array.from(sessions.keys()),
    getSession: (docId) => sessions.get(docId),
  };
}

module.exports = {
  track,
  stop,
  stopAll,
  OFFICE_LOCK_DETECTION_TIMEOUT_MS,
  FALLBACK_PROBE_INTERVAL_MS,
  ABSOLUTE_TTL_MS,
  TTL_REVALIDATION_INTERVAL_MS,
  _getStateForTesting: getStateForTesting,
};
