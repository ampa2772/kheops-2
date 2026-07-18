// electron-companion/lib/saveWatcher.js
//
// Surveille UN seul fichier .docx temporaire ouvert dans Word et re-uploade la
// nouvelle version vers le backend a chaque sauvegarde (debounce). Version
// mince et autonome (l'ancien localFileWatcher etait couple a Google Drive /
// au contexte cloud — non reutilise ici a dessein).

const chokidar = require('chokidar');
const backendClient = require('./backendClient');
const { UPLOAD_DEBOUNCE_MS } = require('./config');

const sessions = new Map(); // docId -> { watcher, timer, uploading, baseVersionId, conflicted }

function currentToken(token, getToken) {
  const value = typeof getToken === 'function' ? getToken() : token;
  if (!value) {
    const err = new Error('Jeton compagnon indisponible.');
    err.code = 'COMPANION_TOKEN_MISSING';
    throw err;
  }
  return value;
}

function conflictExtra(err) {
  return {
    error: err.message,
    conflict: {
      code: err.code,
      savedConflictVersionId: err.details?.savedConflictVersionId || null,
      currentVersionId: err.details?.currentVersionId || null,
      baseVersionId: err.details?.baseVersionId || null,
    },
  };
}

/**
 * @param {object} opts
 * @param {string} opts.docId
 * @param {string} opts.localFilePath
 * @param {string} opts.backendBaseUrl
 * @param {string} opts.token
 * @param {() => string} [opts.getToken] Lit le jeton courant apres rotation.
 * @param {(state, extra?) => void} opts.onState  'syncing' | 'saved' | 'error'
 */
function watch({ docId, localFilePath, backendBaseUrl, token, getToken, baseVersionId = null, onVersion, onState }) {
  stop(docId);

  const session = {
    watcher: null,
    timer: null,
    uploading: false,
    currentUploadPromise: null,
    baseVersionId,
    conflicted: false,
    stopped: false,
  };
  sessions.set(docId, session);

  const scheduleUpload = () => {
    if (session.conflicted || session.stopped) return;
    if (session.timer) clearTimeout(session.timer);
    session.timer = setTimeout(() => {
      session.timer = null;
      doUpload();
    }, UPLOAD_DEBOUNCE_MS);
  };

  const doUpload = async () => {
    if (session.conflicted || session.stopped) return false;
    if (session.uploading) {
      scheduleUpload();
      return session.currentUploadPromise;
    } // une nouvelle sauvegarde pendant l'upload -> on re-planifie
    session.uploading = true;
    const uploadPromise = (async () => {
      try {
        if (typeof onState === 'function') onState('syncing');
        const result = await backendClient.uploadDocx(
          backendBaseUrl,
          currentToken(token, getToken),
          docId,
          localFilePath,
          { baseVersionId: session.baseVersionId },
        );
        if (result?.versionId) {
          session.baseVersionId = result.versionId;
          if (typeof onVersion === 'function') onVersion(result.versionId);
        }
        if (typeof onState === 'function') onState('saved', { lastSyncAt: Date.now() });
        return true;
      } catch (err) {
        if (err.code === 'DOCUMENT_VERSION_CONFLICT') {
          session.conflicted = true;
          if (session.timer) { clearTimeout(session.timer); session.timer = null; }
          if (typeof onState === 'function') onState('conflict', conflictExtra(err));
        } else if (typeof onState === 'function') {
          onState('error', { error: err.message });
        }
        return false;
      } finally {
        session.uploading = false;
        if (session.currentUploadPromise === uploadPromise) session.currentUploadPromise = null;
      }
    })();
    session.currentUploadPromise = uploadPromise;
    return uploadPromise;
  };

  try {
    session.watcher = chokidar.watch(localFilePath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 },
    });
    session.watcher.on('change', scheduleUpload);
    session.watcher.on('error', () => { /* non fatal */ });
  } catch (_e) { /* chokidar indisponible */ }

  return { forceUpload: doUpload };
}

/**
 * Upload final synchrone-ish (attendu) avant nettoyage a la fermeture.
 */
async function finalUpload({
  docId,
  localFilePath,
  backendBaseUrl,
  token,
  getToken,
  baseVersionId = null,
  onVersion,
  onState,
}) {
  try {
    if (typeof onState === 'function') onState('syncing');
    const result = await backendClient.uploadDocx(
      backendBaseUrl,
      currentToken(token, getToken),
      docId,
      localFilePath,
      { baseVersionId },
    );
    if (result?.versionId && typeof onVersion === 'function') onVersion(result.versionId);
    if (typeof onState === 'function') onState('saved', { lastSyncAt: Date.now() });
    return true;
  } catch (err) {
    if (typeof onState === 'function') {
      if (err.code === 'DOCUMENT_VERSION_CONFLICT') onState('conflict', conflictExtra(err));
      else onState('error', { error: err.message });
    }
    return false;
  }
}

function stop(docId) {
  const session = sessions.get(docId);
  if (!session) return Promise.resolve();
  // Poser le drapeau AVANT de fermer chokidar neutralise aussi un evenement
  // `change` deja place dans la file de l'event-loop.
  session.stopped = true;
  if (session.timer) clearTimeout(session.timer);
  if (session.watcher) { try { session.watcher.close(); } catch (_) {} }
  sessions.delete(docId);
  return session.currentUploadPromise || Promise.resolve();
}

function stopAll() {
  for (const id of Array.from(sessions.keys())) stop(id);
}

module.exports = { watch, finalUpload, stop, stopAll };
