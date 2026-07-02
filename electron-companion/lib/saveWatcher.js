// electron-companion/lib/saveWatcher.js
//
// Surveille UN seul fichier .docx temporaire ouvert dans Word et re-uploade la
// nouvelle version vers le backend a chaque sauvegarde (debounce). Version
// mince et autonome (l'ancien localFileWatcher etait couple a Google Drive /
// au contexte cloud — non reutilise ici a dessein).

const chokidar = require('chokidar');
const backendClient = require('./backendClient');
const { UPLOAD_DEBOUNCE_MS } = require('./config');

const sessions = new Map(); // docId -> { watcher, timer, uploading }

/**
 * @param {object} opts
 * @param {string} opts.docId
 * @param {string} opts.localFilePath
 * @param {string} opts.backendBaseUrl
 * @param {string} opts.token
 * @param {(state, extra?) => void} opts.onState  'syncing' | 'saved' | 'error'
 */
function watch({ docId, localFilePath, backendBaseUrl, token, onState }) {
  stop(docId);

  const session = { watcher: null, timer: null, uploading: false };
  sessions.set(docId, session);

  const scheduleUpload = () => {
    if (session.timer) clearTimeout(session.timer);
    session.timer = setTimeout(() => doUpload(), UPLOAD_DEBOUNCE_MS);
  };

  const doUpload = async () => {
    if (session.uploading) { scheduleUpload(); return; } // une nouvelle sauvegarde pendant l'upload -> on re-planifie
    session.uploading = true;
    try {
      if (typeof onState === 'function') onState('syncing');
      await backendClient.uploadDocx(backendBaseUrl, token, docId, localFilePath);
      if (typeof onState === 'function') onState('saved', { lastSyncAt: Date.now() });
    } catch (err) {
      if (typeof onState === 'function') onState('error', { error: err.message });
    } finally {
      session.uploading = false;
    }
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
async function finalUpload({ docId, localFilePath, backendBaseUrl, token, onState }) {
  try {
    if (typeof onState === 'function') onState('syncing');
    await backendClient.uploadDocx(backendBaseUrl, token, docId, localFilePath);
    if (typeof onState === 'function') onState('saved', { lastSyncAt: Date.now() });
    return true;
  } catch (err) {
    if (typeof onState === 'function') onState('error', { error: err.message });
    return false;
  }
}

function stop(docId) {
  const session = sessions.get(docId);
  if (!session) return;
  if (session.timer) clearTimeout(session.timer);
  if (session.watcher) { try { session.watcher.close(); } catch (_) {} }
  sessions.delete(docId);
}

function stopAll() {
  for (const id of Array.from(sessions.keys())) stop(id);
}

module.exports = { watch, finalUpload, stop, stopAll };
