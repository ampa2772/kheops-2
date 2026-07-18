// electron-app/services/backendMirrorService.js
//
// Adaptateur entre l'application Electron historique et le miroir mince du
// compagnon. Le seul credential transmis est le JWT Kheops deja possede par le
// renderer. Les refresh/access tokens Google, Microsoft et SharePoint restent
// derriere les routes backend et ne sont jamais ecrits par ce module.

const EventEmitter = require('events');
const mirror = require('../../electron-companion/lib/mirror');
const backendClient = require('../../electron-companion/lib/backendClient');

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const progressEvents = new EventEmitter();

let activeSession = null; // JWT Kheops en memoire uniquement
let pollTimer = null;
let generation = 0;
let inFlight = Promise.resolve();

function emitProgress(event, isNewMachine = false) {
  try {
    progressEvents.emit('progress', {
      source: 'kheops',
      isNewMachine: !!isNewMachine,
      ...event,
    });
  } catch (_) { /* une UI fermee ne bloque jamais le miroir */ }
}

function resolveRootPath(session) {
  const value = typeof session.getRootPath === 'function'
    ? session.getRootPath()
    : session.rootPath;
  return value ? String(value) : null;
}

async function runSession(session, sessionGeneration, { isNewMachine = false } = {}) {
  if (!session || sessionGeneration !== generation || session !== activeSession) {
    return { skipped: 'session-remplacee' };
  }

  const rootPath = resolveRootPath(session);
  if (!rootPath) {
    const report = { skipped: 'chemin-local-non-configure' };
    emitProgress({
      phase: 'end', success: false, total: 0, downloaded: 0, failed: 1,
      errors: ['Aucun chemin local configure.'],
    }, isNewMachine);
    return report;
  }

  return mirror.sync({
    backendBaseUrl: session.backendBaseUrl,
    token: session.token,
    rootPath,
    // Difference volontaire avec le compagnon autonome : Electron n'utilise
    // plus les SDK fournisseurs et demande donc le miroir pour tout provider.
    electronClient: true,
    onProgress: (event) => emitProgress(event, isNewMachine),
  });
}

function enqueue(session, sessionGeneration, options) {
  const task = inFlight
    .catch(() => {})
    .then(() => runSession(session, sessionGeneration, options));
  inFlight = task;
  return task;
}

function clearPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

/**
 * Synchronise immédiatement, démarre le watcher local du miroir puis un pull
 * périodique. `token` n'est jamais persisté.
 */
async function start({
  backendBaseUrl,
  token,
  rootPath = null,
  getRootPath = null,
  isNewMachine = false,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}) {
  if (!backendBaseUrl || typeof backendBaseUrl !== 'string') {
    throw new TypeError('backendBaseUrl requis.');
  }
  if (!token || typeof token !== 'string') {
    throw new TypeError('JWT Kheops requis.');
  }

  clearPolling();
  generation += 1;
  const sessionGeneration = generation;
  const session = {
    backendBaseUrl: backendBaseUrl.replace(/\/$/, ''),
    token,
    rootPath,
    getRootPath: typeof getRootPath === 'function' ? getRootPath : null,
  };
  activeSession = session;

  const report = await enqueue(session, sessionGeneration, { isNewMachine });

  if (activeSession === session && generation === sessionGeneration && pollIntervalMs > 0) {
    pollTimer = setInterval(() => {
      enqueue(session, sessionGeneration, { isNewMachine: false }).catch(() => {});
    }, pollIntervalMs);
    if (typeof pollTimer.unref === 'function') pollTimer.unref();
  }
  return report;
}

/**
 * Le renderer fournit parfois le userId quelques millisecondes apres le JWT.
 * On rebascule alors vers la racine user-isolee et on resynchronise. mirror.js
 * vide son index/watcher avant tout changement de racine.
 */
function refreshRootPath(rootPath) {
  if (!activeSession || !rootPath) return false;
  activeSession.rootPath = String(rootPath);
  activeSession.getRootPath = null;
  enqueue(activeSession, generation, { isNewMachine: false }).catch(() => {});
  return true;
}

function hasActiveSession() {
  return !!activeSession;
}

async function resolveUserId(backendBaseUrl, token) {
  const identity = await backendClient.whoami(backendBaseUrl.replace(/\/$/, ''), token);
  return identity?.userId ? String(identity.userId) : null;
}

function onSyncProgress(handler) {
  progressEvents.on('progress', handler);
}

function offSyncProgress(handler) {
  progressEvents.off('progress', handler);
}

function stopAll() {
  clearPolling();
  generation += 1;
  activeSession = null;
  mirror.stopAll();
  // Une synchro deja en vol ne peut pas etre annulee au milieu d'un stream.
  // On garantit toutefois qu'elle ne laisse ni watcher ni JWT en memoire a sa
  // sortie si aucune nouvelle session n'a ete ouverte entre-temps.
  inFlight.finally(() => {
    if (!activeSession) mirror.stopAll();
  }).catch(() => {});
}

module.exports = {
  start,
  refreshRootPath,
  hasActiveSession,
  resolveUserId,
  onSyncProgress,
  offSyncProgress,
  stopAll,
};
