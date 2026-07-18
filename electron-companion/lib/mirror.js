// electron-companion/lib/mirror.js
//
// MIROIR LOCAL des documents (Phase 2 « rangement coherent », decision Adrien :
// miroir complet). Pour les comptes SANS cloud personnel (stockage interne
// managed_gcs — invisible autrement), le compagnon materialise :
//
//     C:\Files_Clients\Kheops2\Dossiers\<Nom c- Nom — reference>\(<sous-dossier>\)?<fichier>
//
// et RENVOIE les modifications au serveur a chaque sauvegarde Word.
//
// Fonctionnement :
//   1. La page web declenche POST /mirror/sync (jeton compagnon) apres login.
//   2. On recupere le MANIFESTE aupres du backend (GET /api/word/mirror/manifest,
//      qui repond mirrorEnabled=false pour les comptes OneDrive/Google/SharePoint
//      -> no-op, leurs clients officiels s'en chargent).
//   3. On telecharge les fichiers manquants via GET /api/word/:docId/download
//      (la meme route que « Ouvrir dans Word » : flux Word, stockage documentaire,
//      heritage — tout est couvert). Un 404 (fiche sans octets) est simplement
//      compte, jamais bloquant.
//   4. UN SEUL watcher d'arborescence (chokidar) surveille le miroir : toute
//      sauvegarde d'un fichier .doc/.docx connu re-uploade via /api/word/:docId/sync
//      (debounce, meme mecanique que saveWatcher).
//
// SECURITE : aucun jeton persiste sur disque. Le jeton (8h) vit en memoire et
// est rafraichi a chaque /mirror/sync declenche par le web. Apres un redemarrage
// du compagnon, le watcher reprend au prochain login web.
// L'index docId <-> chemin relatif est persiste dans .kheops-mirror.json (aucune
// donnee sensible : identifiants de documents et noms de fichiers).

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const backendClient = require('./backendClient');
const { UPLOAD_DEBOUNCE_MS } = require('./config');

const IS_WIN = process.platform === 'win32';
const WORD_EXT = /\.docx?$/i;
const TOKEN_REFRESH_FALLBACK_DELAY_MS = 6 * 60 * 60 * 1000;
const TOKEN_REFRESH_MARGIN_MS = 15 * 60 * 1000;
const TOKEN_REFRESH_RETRY_MS = 60 * 1000;
const TOKEN_REFRESH_MIN_DELAY_MS = 1000;
let configuredMirrorRoot = null;

function getMirrorRoot() {
  if (configuredMirrorRoot) return configuredMirrorRoot;
  if (process.env.KHEOPS_MIRROR_ROOT) return process.env.KHEOPS_MIRROR_ROOT;
  return IS_WIN ? 'C:\\Files_Clients' : path.join(require('os').homedir(), 'Files_Clients');
}
function getBaseDir() { return path.join(getMirrorRoot(), 'Kheops2', 'Dossiers'); }
function getIndexFile() { return path.join(getMirrorRoot(), '.kheops-mirror.json'); }

// Ceinture de securite filesystem : les labels sont deja assainis cote serveur
// (matterFolderName), on neutralise quand meme les caracteres interdits Windows.
function fsSafe(segment) {
  return String(segment || '').replace(/[\\/:*?"<>|]/g, '-').replace(/[.\s]+$/, '').trim() || 'Dossier';
}

const state = {
  auth: null,            // jeton Kheops/compagnon + bornes — MEMOIRE UNIQUEMENT
  index: new Map(),      // docId -> chemin ABSOLU
  reverse: new Map(),    // chemin absolu (normalise) -> docId
  baseVersions: new Map(), // docId -> précondition de version (jamais un jeton)
  watcher: null,
  timers: new Map(),     // docId -> timer debounce
  uploading: new Map(),  // docId -> marqueur d'upload (generation/racine)
  syncing: false,
  lastSyncAt: null,
  lastReport: null,
  generation: 0,         // invalide les opérations asynchrones inter-compte
};

function jwtExpiryMs(token) {
  try {
    const payload = String(token || '').split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const exp = Number(decoded.exp);
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch (_) {
    return null;
  }
}

function normalizedExpiry(value, token) {
  const explicit = Number(value);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return jwtExpiryMs(token);
}

function clearAuthRefreshTimer(auth) {
  if (!auth?.refreshTimer) return;
  clearTimeout(auth.refreshTimer);
  auth.refreshTimer = null;
}

function authRefreshDelay(auth) {
  const expiresAt = normalizedExpiry(auth?.tokenExpiresAt, auth?.token);
  if (!expiresAt) return TOKEN_REFRESH_FALLBACK_DELAY_MS;
  const remaining = expiresAt - Date.now();
  if (remaining <= TOKEN_REFRESH_MIN_DELAY_MS) return TOKEN_REFRESH_MIN_DELAY_MS;
  if (remaining <= TOKEN_REFRESH_MARGIN_MS) {
    return Math.max(TOKEN_REFRESH_MIN_DELAY_MS, Math.floor(remaining / 2));
  }
  return Math.max(
    TOKEN_REFRESH_MIN_DELAY_MS,
    Math.min(Math.floor(remaining * 0.75), remaining - TOKEN_REFRESH_MARGIN_MS),
  );
}

function authRetryDelay(auth) {
  const expiresAt = normalizedExpiry(auth?.tokenExpiresAt, auth?.token);
  if (!expiresAt) return TOKEN_REFRESH_RETRY_MS;
  const remaining = expiresAt - Date.now();
  if (remaining <= TOKEN_REFRESH_MIN_DELAY_MS) return null;
  return Math.max(TOKEN_REFRESH_MIN_DELAY_MS, Math.min(TOKEN_REFRESH_RETRY_MS, Math.floor(remaining / 4)));
}

async function revokeAuthBestEffort(auth) {
  if (!auth?.backendBaseUrl || !auth?.token
    || typeof backendClient.revokeCompanionSession !== 'function') return false;
  try {
    await backendClient.revokeCompanionSession(auth.backendBaseUrl, auth.token);
    return true;
  } catch (_) {
    return false;
  }
}

function scheduleAuthRefresh(auth, delayMs = authRefreshDelay(auth)) {
  if (!auth || state.auth !== auth || !auth.token
    || typeof backendClient.refreshCompanionSession !== 'function') return;
  clearAuthRefreshTimer(auth);
  const absoluteExpiresAt = Number(auth.sessionAbsoluteExpiresAt);
  if (Number.isFinite(absoluteExpiresAt)
    && absoluteExpiresAt > 0
    && absoluteExpiresAt - Date.now() <= TOKEN_REFRESH_MARGIN_MS) return;
  if (!Number.isFinite(Number(delayMs)) || Number(delayMs) < 0) return;
  auth.refreshTimer = setTimeout(() => {
    auth.refreshTimer = null;
    refreshMirrorAuth(auth).catch(() => {});
  }, Math.max(TOKEN_REFRESH_MIN_DELAY_MS, Number(delayMs)));
  if (typeof auth.refreshTimer.unref === 'function') auth.refreshTimer.unref();
}

async function refreshMirrorAuth(auth) {
  if (!auth || state.auth !== auth || !auth.token) return false;
  if (auth.refreshPromise) return auth.refreshPromise;
  const promise = (async () => {
    try {
      const refreshed = await backendClient.refreshCompanionSession(
        auth.backendBaseUrl,
        auth.token,
        { purpose: 'mirror' },
      );
      if (state.auth !== auth) {
        await revokeAuthBestEffort({
          backendBaseUrl: refreshed.backendBaseUrl || auth.backendBaseUrl,
          token: refreshed.companionToken,
        });
        return false;
      }
      const refreshedBackend = String(refreshed.backendBaseUrl || auth.backendBaseUrl).replace(/\/$/, '');
      if (refreshedBackend !== String(auth.backendBaseUrl).replace(/\/$/, '')) {
        await revokeAuthBestEffort({ backendBaseUrl: refreshedBackend, token: refreshed.companionToken });
        throw new Error('Le backend du miroir ne peut pas changer pendant une rotation.');
      }
      if (auth.userId && refreshed.userId && String(auth.userId) !== String(refreshed.userId)) {
        await revokeAuthBestEffort({ backendBaseUrl: auth.backendBaseUrl, token: refreshed.companionToken });
        throw new Error('Le jeton renouvele appartient a un autre utilisateur.');
      }
      auth.token = refreshed.companionToken;
      auth.tokenExpiresAt = normalizedExpiry(refreshed.expiresAt, auth.token);
      auth.sessionAbsoluteExpiresAt = Number(refreshed.sessionAbsoluteExpiresAt)
        || auth.sessionAbsoluteExpiresAt
        || null;
      if (refreshed.userId) auth.userId = String(refreshed.userId);
      auth.refreshError = null;
      scheduleAuthRefresh(auth);
      return true;
    } catch (err) {
      if (state.auth !== auth) return false;
      auth.refreshError = err?.message || 'Renouvellement du jeton miroir impossible.';
      const retryDelay = authRetryDelay(auth);
      if (retryDelay !== null) scheduleAuthRefresh(auth, retryDelay);
      return false;
    }
  })();
  auth.refreshPromise = promise;
  try {
    return await promise;
  } finally {
    if (auth.refreshPromise === promise) auth.refreshPromise = null;
  }
}

async function adoptAuth({ backendBaseUrl, token, tokenExpiresAt, sessionAbsoluteExpiresAt, userId }) {
  const normalizedBackend = String(backendBaseUrl || '').replace(/\/$/, '');
  const previous = state.auth;
  if (previous && previous.token === token && previous.backendBaseUrl === normalizedBackend) {
    const nextTokenExpiry = normalizedExpiry(tokenExpiresAt, token) || previous.tokenExpiresAt;
    const nextAbsoluteExpiry = Number(sessionAbsoluteExpiresAt)
      || previous.sessionAbsoluteExpiresAt
      || null;
    const timingChanged = nextTokenExpiry !== previous.tokenExpiresAt
      || nextAbsoluteExpiry !== previous.sessionAbsoluteExpiresAt;
    previous.tokenExpiresAt = nextTokenExpiry;
    previous.sessionAbsoluteExpiresAt = nextAbsoluteExpiry;
    if (userId) previous.userId = String(userId);
    // Le polling Electron rappelle sync chaque minute. Ne jamais repousser le
    // meme timer a chaque pull, sinon il ne se declencherait qu'a la derniere
    // minute de vie du jeton.
    if (!previous.refreshTimer || timingChanged) scheduleAuthRefresh(previous);
    return previous;
  }

  if (previous) {
    // Ne plus accepter de nouveaux evenements locaux pendant le passage de
    // relais, puis laisser finir les uploads deja authentifies avant de
    // revoquer leur chaine.
    stopWatcher();
    const pendingUploads = Array.from(state.uploading.values())
      .filter((marker) => marker?.auth === previous && marker.promise)
      .map((marker) => marker.promise);
    if (pendingUploads.length) await Promise.allSettled(pendingUploads);
    clearAuthRefreshTimer(previous);
    if (previous.refreshPromise) {
      try { await previous.refreshPromise; } catch (_) {}
    }
    await revokeAuthBestEffort(previous);
  }

  const auth = {
    backendBaseUrl: normalizedBackend,
    token,
    tokenExpiresAt: normalizedExpiry(tokenExpiresAt, token),
    sessionAbsoluteExpiresAt: Number(sessionAbsoluteExpiresAt) || null,
    userId: userId ? String(userId) : null,
    refreshTimer: null,
    refreshPromise: null,
    refreshError: null,
  };
  state.auth = auth;
  scheduleAuthRefresh(auth);
  return auth;
}

function loadIndexFromDisk() {
  try {
    const raw = JSON.parse(fs.readFileSync(getIndexFile(), 'utf8'));
    for (const [docId, rel] of Object.entries(raw.files || {})) {
      const abs = path.join(getBaseDir(), rel);
      state.index.set(docId, abs);
      state.reverse.set(path.normalize(abs).toLowerCase(), docId);
    }
    for (const [docId, baseVersionId] of Object.entries(raw.baseVersions || {})) {
      if (baseVersionId) state.baseVersions.set(docId, String(baseVersionId));
    }
  } catch (_) { /* premier lancement : pas d'index */ }
}

function persistIndex() {
  try {
    const files = {};
    const baseVersions = {};
    for (const [docId, abs] of state.index.entries()) {
      files[docId] = path.relative(getBaseDir(), abs);
      const baseVersionId = state.baseVersions.get(docId);
      if (baseVersionId) baseVersions[docId] = baseVersionId;
    }
    fs.mkdirSync(getMirrorRoot(), { recursive: true });
    fs.writeFileSync(getIndexFile(), JSON.stringify({ version: 2, files, baseVersions }, null, 1));
  } catch (_) { /* best effort */ }
}

function scheduleUpload(docId) {
  const prev = state.timers.get(docId);
  if (prev) clearTimeout(prev);
  state.timers.set(docId, setTimeout(() => {
    // Le timer ne doit pas rester lié à la promesse réseau : une requête lente
    // n'empêche ni le changement de compte ni l'arrêt propre du watcher.
    doUpload(docId).catch((err) => {
      console.warn(`[Mirror] Upload différé impossible pour ${docId}: ${err.message}`);
    });
  }, UPLOAD_DEBOUNCE_MS));
}

async function doUpload(docId) {
  if (!state.auth) return; // pas de jeton en memoire (redemarrage) -> prochain sync
  if (state.uploading.has(docId)) { scheduleUpload(docId); return; }
  const abs = state.index.get(docId);
  if (!abs || !fs.existsSync(abs)) return;
  const auth = state.auth;
  const generation = state.generation;
  const baseVersionId = state.baseVersions.get(docId) || null;
  const uploadMarker = { auth, generation, abs };
  state.uploading.set(docId, uploadMarker);
  try {
    uploadMarker.promise = backendClient.uploadDocx(
      auth.backendBaseUrl,
      auth.token,
      docId,
      abs,
      { baseVersionId },
    );
    const uploaded = await uploadMarker.promise;
    // Un upload du compte A peut se terminer après le passage au compte B.
    // Il est déjà enregistré côté backend A, mais ne doit surtout pas modifier
    // l'index/baseVersion ou écrire le fichier d'index dans la racine B.
    if (state.generation !== generation
      || state.auth !== auth
      || state.index.get(docId) !== abs) return;
    if (uploaded?.versionId) {
      state.baseVersions.set(docId, String(uploaded.versionId));
      persistIndex();
    }
    console.log(`[Mirror] ⬆️  ${path.basename(abs)} renvoye au serveur.`);
  } catch (err) {
    console.warn(`[Mirror] Upload rate pour ${path.basename(abs)}: ${err.message}`);
  } finally {
    // Ne jamais effacer le marqueur d'un nouvel upload du même docId lancé
    // après un changement de compte/racine.
    if (state.uploading.get(docId) === uploadMarker) state.uploading.delete(docId);
  }
}

function configureMirrorRoot(rootPath) {
  if (!rootPath) return;
  const nextRoot = path.resolve(String(rootPath));
  const currentRoot = path.resolve(getMirrorRoot());
  if (nextRoot === currentRoot) return;

  // Etancheite multi-utilisateur : un changement de racine invalide toujours
  // les maps et le watcher de l'utilisateur precedent. Les index restent dans
  // chaque racine isolee et seront recharges au prochain sync.
  stopWatcher();
  state.generation += 1;
  state.index.clear();
  state.reverse.clear();
  state.baseVersions.clear();
  state.uploading.clear();
  configuredMirrorRoot = nextRoot;
}

function emitProgress(onProgress, event) {
  if (typeof onProgress !== 'function') return;
  try { onProgress(event); } catch (_) { /* l'UI ne bloque jamais la synchro */ }
}

function startWatcher() {
  stopWatcher();
  const baseDir = getBaseDir();
  if (!fs.existsSync(baseDir)) return;
  try {
    state.watcher = chokidar.watch(baseDir, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 },
      // Word cree des fichiers verrous temporaires « ~$xxx.docx » : ignores.
      ignored: /~\$|\.tmp$|\.kheops-mirror\.json$/i,
    });
    state.watcher.on('change', (abs) => {
      const docId = state.reverse.get(path.normalize(abs).toLowerCase());
      if (docId && WORD_EXT.test(abs)) scheduleUpload(docId);
    });
    state.watcher.on('error', () => { /* non fatal */ });
  } catch (_) { /* chokidar indisponible */ }
}

function stopWatcher() {
  if (state.watcher) { try { state.watcher.close(); } catch (_) {} state.watcher = null; }
  for (const t of state.timers.values()) clearTimeout(t);
  state.timers.clear();
}

/**
 * Synchronisation complete (serveur -> local) puis (re)demarrage du watcher
 * (local -> serveur). Ne leve jamais : renvoie un rapport.
 */
async function sync({
  backendBaseUrl,
  token,
  tokenExpiresAt = null,
  sessionAbsoluteExpiresAt = null,
  userId = null,
  rootPath = null,
  electronClient = false,
  onProgress = null,
}) {
  if (state.syncing) {
    // Le jeton fraichement emis ne doit pas devenir une chaine orpheline si un
    // pull est deja en cours. Le pull courant conserve ses propres credentials.
    if (token && token !== state.auth?.token) {
      revokeAuthBestEffort({ backendBaseUrl, token }).catch(() => {});
    }
    return { skipped: 'sync-deja-en-cours' };
  }
  state.syncing = true;
  const report = { downloaded: 0, existing: 0, missingOnServer: 0, errors: 0, dossiers: 0 };
  try {
    configureMirrorRoot(rootPath);
    const auth = await adoptAuth({
      backendBaseUrl,
      token,
      tokenExpiresAt,
      sessionAbsoluteExpiresAt,
      userId,
    });
    const generation = state.generation;
    const isCurrentSession = () => state.generation === generation && state.auth === auth;

    let manifest;
    try {
      manifest = await backendClient.getMirrorManifest(
        backendBaseUrl,
        auth.token,
        { electronClient },
      );
    } catch (err) {
      state.lastReport = { skipped: `manifeste: ${err.message}` };
      emitProgress(onProgress, {
        phase: 'end', success: false, total: 0, downloaded: 0, failed: 1,
        errors: [err.message],
      });
      return state.lastReport;
    }
    if (!isCurrentSession()) return { skipped: 'session-remplacee' };
    if (!manifest || manifest.mirrorEnabled !== true) {
      state.lastReport = { skipped: 'miroir-desactive (compte avec cloud personnel)' };
      emitProgress(onProgress, {
        phase: 'end', success: true, total: 0, downloaded: 0, failed: 0, errors: [],
      });
      return state.lastReport;
    }

    const total = (manifest.dossiers || []).reduce(
      (sum, dossier) => sum + (dossier.documents || []).length,
      0,
    );
    let current = 0;
    emitProgress(onProgress, { phase: 'start', total });

    if (state.index.size === 0) loadIndexFromDisk();
    const baseDir = getBaseDir();
    fs.mkdirSync(baseDir, { recursive: true });

    // Chemins revendiques PENDANT cette synchro : deux fiches homonymes du meme
    // dossier (ex. trois « Conclusion.docx ») recoivent des fichiers DISTINCTS
    // (suffixe court derive de l'id) au lieu de s'ecraser mutuellement.
    const claimed = new Map(); // chemin normalise -> docId

    for (const dossier of manifest.dossiers || []) {
      const dossierDir = path.join(baseDir, fsSafe(dossier.label));
      try { fs.mkdirSync(dossierDir, { recursive: true }); } catch (_) { report.errors += 1; continue; }
      report.dossiers += 1;

      for (const doc of dossier.documents || []) {
        const dir = doc.subfolder ? path.join(dossierDir, fsSafe(doc.subfolder)) : dossierDir;
        let fileName = fsSafe(doc.name);
        let abs = path.join(dir, fileName);
        let key = path.normalize(abs).toLowerCase();
        if (claimed.has(key) && claimed.get(key) !== doc.docId) {
          const dot = fileName.lastIndexOf('.');
          const tag = ` (${String(doc.docId).slice(-4)})`;
          fileName = dot > 0 ? `${fileName.slice(0, dot)}${tag}${fileName.slice(dot)}` : `${fileName}${tag}`;
          abs = path.join(dir, fileName);
          key = path.normalize(abs).toLowerCase();
        }
        claimed.set(key, doc.docId);

        if (fs.existsSync(abs)) {
          if (!state.baseVersions.has(doc.docId)) {
            try {
              const baseVersionId = await backendClient.getDocumentBaseVersion(
                backendBaseUrl,
                auth.token,
                doc.docId,
              );
              if (!isCurrentSession()) return { skipped: 'session-remplacee' };
              if (baseVersionId) state.baseVersions.set(doc.docId, baseVersionId);
            } catch (err) {
              // Le fichier local reste intact. Sans base, /sync appliquera de
              // toute façon sa protection de conflit obligatoire.
              if (!(err.response && err.response.status === 404)) report.errors += 1;
            }
          }
          report.existing += 1;
        } else {
          try {
            fs.mkdirSync(dir, { recursive: true });
            const downloaded = await backendClient.downloadDocx(backendBaseUrl, auth.token, doc.docId, abs);
            if (!isCurrentSession()) {
              try { if (fs.existsSync(abs)) fs.unlinkSync(abs); } catch (_) {}
              return { skipped: 'session-remplacee' };
            }
            if (downloaded?.baseVersionId) {
              state.baseVersions.set(doc.docId, String(downloaded.baseVersionId));
            }
            report.downloaded += 1;
          } catch (err) {
            // 404 = fiche sans octets serveur (ancienne app, jamais uploade...) :
            // attendu pour une partie de l'historique, jamais bloquant.
            if (err.response && err.response.status === 404) report.missingOnServer += 1;
            else report.errors += 1;
            // Nettoie un fichier partiel eventuel.
            try { if (fs.existsSync(abs) && fs.statSync(abs).size === 0) fs.unlinkSync(abs); } catch (_) {}
            current += 1;
            emitProgress(onProgress, {
              phase: 'progress', current, total,
              currentFolder: dossier.label || '', currentFile: doc.name || '',
              downloaded: report.downloaded, failed: report.errors,
            });
            continue;
          }
        }
        state.index.set(doc.docId, abs);
        state.reverse.set(key, doc.docId);
        current += 1;
        emitProgress(onProgress, {
          phase: 'progress', current, total,
          currentFolder: dossier.label || '', currentFile: doc.name || '',
          downloaded: report.downloaded, failed: report.errors,
        });
      }
    }

    if (!isCurrentSession()) return { skipped: 'session-remplacee' };
    persistIndex();
    startWatcher();
    state.lastSyncAt = Date.now();
    state.lastReport = report;
    emitProgress(onProgress, {
      phase: 'end',
      success: report.errors === 0,
      total,
      downloaded: report.downloaded,
      failed: report.errors,
      errors: [],
    });
    console.log(`[Mirror] ✅ Sync: ${report.downloaded} telecharges, ${report.existing} deja presents, ${report.missingOnServer} sans octets serveur, ${report.errors} erreurs.`);
    return report;
  } catch (err) {
    state.lastReport = { skipped: err.message };
    emitProgress(onProgress, {
      phase: 'end', success: false, total: 0, downloaded: report.downloaded,
      failed: Math.max(1, report.errors), errors: [err.message],
    });
    return state.lastReport;
  } finally {
    state.syncing = false;
  }
}

function getStatus() {
  return {
    root: getMirrorRoot(),
    syncing: state.syncing,
    watching: !!state.watcher,
    files: state.index.size,
    lastSyncAt: state.lastSyncAt,
    lastReport: state.lastReport,
  };
}

function stopAll() {
  stopWatcher();
  state.generation += 1;
  const auth = state.auth;
  if (auth) clearAuthRefreshTimer(auth);
  state.auth = null;
  state.uploading.clear();
  if (auth) revokeAuthBestEffort(auth).catch(() => {});
}

module.exports = { sync, getStatus, stopAll, getMirrorRoot };
