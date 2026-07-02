// electron-companion/lib/wordSession.js
//
// Orchestrateur du cycle de vie d'un document Word, cote compagnon :
//   download -> open (Word) -> watch (save -> re-upload) -> heartbeat verrou
//   -> detection fermeture -> sync finale -> release verrou -> cleanup temp.
//
// Etats exposes a /sync-status : opening | open | syncing | saved | error | closed.

const fs = require('fs');
const path = require('path');
const { app, shell } = require('electron');

const config = require('./config');
const backendClient = require('./backendClient');
const saveWatcher = require('./saveWatcher');
const lockWatcher = require('./lockWatcher');

const sessions = new Map(); // docId -> session

function sanitizeFileName(name, docId) {
  const fallback = `${docId}.docx`;
  if (!name || typeof name !== 'string') return fallback;
  const base = path.basename(name).replace(/[\\/:*?"<>|]/g, '_').trim();
  if (!base) return fallback;
  return /\.docx?$/i.test(base) ? base : `${base}.docx`;
}

function setState(docId, patch) {
  const s = sessions.get(docId);
  if (!s) return;
  Object.assign(s, patch);
}

function getStatus(docId) {
  const s = sessions.get(docId);
  if (!s) return { docId, state: 'idle', error: null, lastSyncAt: null };
  return { docId, state: s.state, error: s.error || null, lastSyncAt: s.lastSyncAt || null };
}

/**
 * Ouvre un document : telecharge le .docx, l'ouvre dans Word, et lance la
 * surveillance + le heartbeat.
 * @returns {Promise<{ok:true}>}
 * @throws si le verrou est detenu par un autre, ou en cas d'erreur reseau.
 */
async function open({ docId, fileName, backendBaseUrl, token }) {
  if (sessions.has(docId)) {
    // Deja ouvert : on remet juste Word au premier plan.
    const s = sessions.get(docId);
    if (s.localFilePath && fs.existsSync(s.localFilePath)) {
      try { await shell.openPath(s.localFilePath); } catch (_) {}
    }
    return { ok: true, reopened: true };
  }

  const tempRoot = config.getTempDir(app);
  const localFilePath = path.join(tempRoot, docId, sanitizeFileName(fileName, docId));

  const session = {
    docId, backendBaseUrl, token, localFilePath,
    state: 'opening', error: null, lastSyncAt: null,
    heartbeatTimer: null,
  };
  sessions.set(docId, session);

  // NB verrou : c'est le FRONTEND web qui ACQUIERT le verrou (handleOpenDocument,
  // tryAcquireDocLock) AVANT de demander l'ouverture au compagnon. Le compagnon
  // ne fait donc que le HEARTBEAT (maintien) puis le RELEASE a la fermeture —
  // point d'acquisition unique, pas de double-acquire.

  // 1) Telechargement du .docx.
  try {
    await backendClient.downloadDocx(backendBaseUrl, token, docId, localFilePath);
  } catch (err) {
    setState(docId, { state: 'error', error: `Telechargement: ${err.message}` });
    await safeReleaseLock(backendBaseUrl, token, docId);
    throw err;
  }

  // 2) Ouverture dans l'application par defaut (Microsoft Word).
  try {
    const opened = await shell.openPath(localFilePath); // '' si OK, message d'erreur sinon
    if (opened) throw new Error(opened);
  } catch (err) {
    setState(docId, { state: 'error', error: `Ouverture Word: ${err.message}` });
    await safeReleaseLock(backendBaseUrl, token, docId);
    throw err;
  }

  setState(docId, { state: 'open' });

  // 3) Heartbeat du verrou (toutes les 30s).
  session.heartbeatTimer = setInterval(() => {
    backendClient.heartbeat(backendBaseUrl, token, docId).catch(() => { /* le serveur expirera */ });
  }, config.HEARTBEAT_INTERVAL_MS);

  // 4) Surveillance des sauvegardes -> re-upload.
  saveWatcher.watch({
    docId, localFilePath, backendBaseUrl, token,
    onState: (state, extra = {}) => setState(docId, { state, ...extra }),
  });

  // 5) Detection de fermeture -> sync finale + release + cleanup.
  lockWatcher.track({
    docId, localFilePath, backendBaseUrl, token,
    onReleased: async () => {
      await finalizeAndCleanup(docId, { lockAlreadyReleased: true });
    },
  });

  return { ok: true };
}

async function finalizeAndCleanup(docId, { lockAlreadyReleased = false } = {}) {
  const s = sessions.get(docId);
  if (!s) return;
  if (s.heartbeatTimer) { clearInterval(s.heartbeatTimer); s.heartbeatTimer = null; }
  saveWatcher.stop(docId);

  // Sync finale (au cas ou une derniere sauvegarde n'aurait pas ete debouncee).
  if (fs.existsSync(s.localFilePath)) {
    await saveWatcher.finalUpload({
      docId, localFilePath: s.localFilePath, backendBaseUrl: s.backendBaseUrl, token: s.token,
      onState: (state, extra = {}) => setState(docId, { state, ...extra }),
    });
  }

  if (!lockAlreadyReleased) {
    await safeReleaseLock(s.backendBaseUrl, s.token, docId);
    lockWatcher.stop(docId);
  }

  // Nettoyage du fichier temporaire.
  try {
    const dir = path.dirname(s.localFilePath);
    await fs.promises.rm(dir, { recursive: true, force: true });
  } catch (_) { /* best-effort */ }

  setState(docId, { state: 'closed' });
  // On garde l'etat 'closed' un court instant pour que le web le lise, puis purge.
  setTimeout(() => sessions.delete(docId), 15_000);
}

async function safeReleaseLock(backendBaseUrl, token, docId) {
  try { await backendClient.releaseLock(backendBaseUrl, token, docId); } catch (_) { /* best-effort */ }
}

/**
 * Fermeture/nettoyage explicite demande par le web.
 */
async function closeCleanup(docId) {
  lockWatcher.stop(docId);
  await finalizeAndCleanup(docId, { lockAlreadyReleased: false });
  return { ok: true };
}

function stopAll() {
  for (const docId of Array.from(sessions.keys())) {
    const s = sessions.get(docId);
    if (s && s.heartbeatTimer) clearInterval(s.heartbeatTimer);
  }
  saveWatcher.stopAll();
  lockWatcher.stopAll();
  sessions.clear();
}

module.exports = { open, getStatus, closeCleanup, stopAll };
