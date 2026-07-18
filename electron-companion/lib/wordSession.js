// electron-companion/lib/wordSession.js
//
// Orchestrateur du cycle de vie d'un document Word, cote compagnon :
//   download -> open (Word) -> watch (save -> re-upload) -> heartbeat verrou
//   -> detection fermeture -> sync finale -> release verrou -> cleanup temp.
//
// Etats exposes a /sync-status : opening | open | syncing | saved | conflict |
// error | closed.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, shell, Notification: ElectronNotification } = require('electron');

const config = require('./config');
const backendClient = require('./backendClient');
const saveWatcher = require('./saveWatcher');
const lockWatcher = require('./lockWatcher');
const recoveryStore = require('./recoveryStore');

const sessions = new Map(); // docId -> session
const TOKEN_REFRESH_FALLBACK_DELAY_MS = 6 * 60 * 60 * 1000;
const TOKEN_REFRESH_MARGIN_MS = 15 * 60 * 1000;
const TOKEN_REFRESH_RETRY_MS = 60 * 1000;
const TOKEN_REFRESH_MIN_DELAY_MS = 1000;

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

function clearTokenRefreshTimer(session) {
  if (!session?.tokenRefreshTimer) return;
  clearTimeout(session.tokenRefreshTimer);
  session.tokenRefreshTimer = null;
}

function refreshDelayFor(session) {
  const expiresAt = normalizedExpiry(session?.tokenExpiresAt, session?.token);
  if (!expiresAt) return TOKEN_REFRESH_FALLBACK_DELAY_MS;
  const remaining = expiresAt - Date.now();
  if (remaining <= TOKEN_REFRESH_MIN_DELAY_MS) return TOKEN_REFRESH_MIN_DELAY_MS;
  if (remaining <= TOKEN_REFRESH_MARGIN_MS) {
    return Math.max(TOKEN_REFRESH_MIN_DELAY_MS, Math.floor(remaining / 2));
  }
  // Rotation vers 75 % de la duree du jeton, avec au moins quinze minutes de
  // marge. Pour un jeton de huit heures, cela donne environ six heures.
  return Math.max(
    TOKEN_REFRESH_MIN_DELAY_MS,
    Math.min(Math.floor(remaining * 0.75), remaining - TOKEN_REFRESH_MARGIN_MS),
  );
}

function retryDelayFor(session) {
  const expiresAt = normalizedExpiry(session?.tokenExpiresAt, session?.token);
  if (!expiresAt) return TOKEN_REFRESH_RETRY_MS;
  const remaining = expiresAt - Date.now();
  if (remaining <= TOKEN_REFRESH_MIN_DELAY_MS) return null;
  return Math.max(
    TOKEN_REFRESH_MIN_DELAY_MS,
    Math.min(TOKEN_REFRESH_RETRY_MS, Math.floor(remaining / 4)),
  );
}

function scheduleTokenRefresh(session, delayMs = refreshDelayFor(session)) {
  if (!session || session.finalized || session.finalizePromise || !session.token) return;
  clearTokenRefreshTimer(session);
  const absoluteExpiresAt = Number(session.sessionAbsoluteExpiresAt);
  if (Number.isFinite(absoluteExpiresAt)
    && absoluteExpiresAt > 0
    && absoluteExpiresAt - Date.now() <= TOKEN_REFRESH_MARGIN_MS) {
    // La rotation ne doit jamais prolonger la chaine au-dela de sa borne
    // absolue. Le dernier jeton reste utilisable jusqu'a cette echeance.
    return;
  }
  if (!Number.isFinite(Number(delayMs)) || Number(delayMs) < 0) return;
  session.tokenRefreshTimer = setTimeout(() => {
    session.tokenRefreshTimer = null;
    refreshSessionToken(session.docId).catch(() => { /* gere dans refreshSessionToken */ });
  }, Math.max(TOKEN_REFRESH_MIN_DELAY_MS, Number(delayMs)));
  if (typeof session.tokenRefreshTimer.unref === 'function') session.tokenRefreshTimer.unref();
}

function assertSameSessionIdentity(session, { backendBaseUrl, userId }) {
  if (backendBaseUrl && String(backendBaseUrl).replace(/\/$/, '') !== String(session.backendBaseUrl).replace(/\/$/, '')) {
    const err = new Error('Le backend de la session Word ne peut pas etre remplace en cours d edition.');
    err.code = 'COMPANION_BACKEND_MISMATCH';
    throw err;
  }
  if (session.userId && userId && String(session.userId) !== String(userId)) {
    const err = new Error('Cette session Word appartient a un autre utilisateur Kheops.');
    err.code = 'COMPANION_SESSION_USER_MISMATCH';
    throw err;
  }
}

function updateSessionCredentials(session, { token, tokenExpiresAt, userId, backendBaseUrl } = {}) {
  assertSameSessionIdentity(session, { backendBaseUrl, userId });
  if (token) session.token = token;
  const expiresAt = normalizedExpiry(tokenExpiresAt, token || session.token);
  if (expiresAt) session.tokenExpiresAt = expiresAt;
  if (userId) session.userId = String(userId);
  session.tokenRefreshError = null;
  scheduleTokenRefresh(session);
}

/**
 * Remplace de facon serialisee la chaine de jetons d'un document deja ouvert.
 * Une nouvelle demande du navigateur cree une nouvelle CompanionSession cote
 * serveur : l'ancienne doit etre revoquee avant d'adopter la nouvelle, sinon
 * elle resterait exploitable jusqu'a sa borne absolue.
 */
async function replaceSessionCredentials(session, credentials = {}) {
  assertSameSessionIdentity(session, credentials);

  const previousUpdate = session.credentialUpdatePromise || Promise.resolve();
  const operation = previousUpdate.catch(() => {}).then(async () => {
    assertSameSessionIdentity(session, credentials);

    // Aucun timer ne doit lancer une rotation de l'ancienne chaine pendant son
    // remplacement. Si une rotation etait deja partie, attendre son resultat
    // permet de revoquer la vraie chaine courante.
    clearTokenRefreshTimer(session);
    if (session.tokenRefreshPromise) {
      try { await session.tokenRefreshPromise; } catch (_) { /* erreur deja exposee dans le statut */ }
    }
    clearTokenRefreshTimer(session);

    const previousToken = session.token;
    if (credentials.token && previousToken && credentials.token !== previousToken) {
      await safeRevokeCompanionSession(session.backendBaseUrl, previousToken);
    }

    if (sessions.get(session.docId) !== session || session.finalized) return false;

    // IMPORTANT : la nouvelle borne doit etre posee AVANT l'appel qui planifie
    // la rotation. Sinon une ancienne borne a moins de 15 minutes supprimait le
    // timer du nouveau jeton pourtant valable huit heures.
    const nextAbsoluteExpiry = Number(credentials.sessionAbsoluteExpiresAt);
    if (Number.isFinite(nextAbsoluteExpiry) && nextAbsoluteExpiry > 0) {
      session.sessionAbsoluteExpiresAt = nextAbsoluteExpiry;
    }
    updateSessionCredentials(session, credentials);
    return true;
  });

  session.credentialUpdatePromise = operation;
  try {
    return await operation;
  } finally {
    if (session.credentialUpdatePromise === operation) session.credentialUpdatePromise = null;
  }
}

async function refreshSessionToken(docId) {
  const session = sessions.get(docId);
  if (!session || session.finalized || session.finalizePromise || !session.token) return false;
  if (session.tokenRefreshPromise) return session.tokenRefreshPromise;

  const promise = (async () => {
    try {
      const refreshed = await backendClient.refreshCompanionSession(
        session.backendBaseUrl,
        session.token,
        { purpose: 'word', docId: session.docId },
      );
      // La session peut avoir ete fermee pendant la requete reseau.
      if (sessions.get(docId) !== session || session.finalized) {
        await safeRevokeCompanionSession(session.backendBaseUrl, refreshed.companionToken);
        return false;
      }
      if (refreshed.userId && session.userId
        && String(refreshed.userId) !== String(session.userId)) {
        await safeRevokeCompanionSession(session.backendBaseUrl, refreshed.companionToken);
        const err = new Error('Le serveur a renvoye un jeton pour un autre utilisateur.');
        err.code = 'COMPANION_SESSION_USER_MISMATCH';
        throw err;
      }
      if (refreshed.backendBaseUrl
        && String(refreshed.backendBaseUrl).replace(/\/$/, '')
          !== String(session.backendBaseUrl).replace(/\/$/, '')) {
        await safeRevokeCompanionSession(session.backendBaseUrl, refreshed.companionToken);
        const err = new Error('Le serveur a renvoye un backend different pendant la rotation.');
        err.code = 'COMPANION_BACKEND_MISMATCH';
        throw err;
      }
      session.sessionAbsoluteExpiresAt = Number(refreshed.sessionAbsoluteExpiresAt)
        || session.sessionAbsoluteExpiresAt
        || null;
      updateSessionCredentials(session, {
        token: refreshed.companionToken,
        tokenExpiresAt: refreshed.expiresAt,
        userId: refreshed.userId || session.userId,
        backendBaseUrl: refreshed.backendBaseUrl || session.backendBaseUrl,
      });
      return true;
    } catch (err) {
      if (sessions.get(docId) !== session || session.finalized) return false;
      session.tokenRefreshError = err?.message || 'Renouvellement du jeton compagnon impossible.';
      const retryDelay = retryDelayFor(session);
      if (retryDelay !== null) scheduleTokenRefresh(session, retryDelay);
      return false;
    }
  })();

  session.tokenRefreshPromise = promise;
  try {
    return await promise;
  } finally {
    if (session.tokenRefreshPromise === promise) session.tokenRefreshPromise = null;
  }
}

function sanitizeFileName(name, docId) {
  const fallback = `${docId}.docx`;
  if (!name || typeof name !== 'string') return fallback;
  const base = path.basename(name).replace(/[\\/:*?"<>|]/g, '_').trim();
  if (!base) return fallback;
  return /\.docx?$/i.test(base) ? base : `${base}.docx`;
}

function safeSessionDirectoryName(docId) {
  const id = String(docId || 'document').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return `${id || 'document'}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function setState(docId, patch) {
  const s = sessions.get(docId);
  if (!s) return;
  Object.assign(s, patch);
}

function getStatus(docId) {
  const s = sessions.get(docId);
  if (!s) return { docId, state: 'idle', error: null, lastSyncAt: null };
  return {
    docId,
    state: s.state,
    error: s.error || null,
    lastSyncAt: s.lastSyncAt || null,
    companionSessionExpiresAt: s.sessionAbsoluteExpiresAt || null,
    tokenRefreshError: s.tokenRefreshError || null,
    conflict: s.conflict || null,
    recovery: s.recoveryPath ? {
      available: fs.existsSync(s.recoveryPath),
      path: s.recoveryPath,
      durable: !!s.recoveryDurable,
      savedAt: s.recoverySavedAt || null,
    } : null,
  };
}

function notifyUnsyncedRecovery(session) {
  const durable = !!session.recoveryDurable;
  const title = session.state === 'conflict'
    ? 'Kheops 2 - conflit de versions'
    : 'Kheops 2 - document non synchronise';
  const body = durable
    ? 'La synchronisation a echoue. Une copie de secours a ete conservee dans vos Documents. Cliquez pour la retrouver.'
    : "La synchronisation a echoue. Le fichier local n'a pas ete supprime. Ouvrez Kheops 2 pour verifier la recuperation.";

  // Toujours laisser une trace exploitable, meme lorsque les notifications du
  // systeme sont desactivees.
  console.error(`[Companion] ${body} Fichier: ${session.recoveryPath || session.localFilePath}`);

  try {
    if (typeof ElectronNotification !== 'function') return;
    if (typeof ElectronNotification.isSupported === 'function'
      && !ElectronNotification.isSupported()) return;
    const notification = new ElectronNotification({ title, body, silent: false });
    if (notification && typeof notification.on === 'function') {
      notification.on('click', () => {
        const target = session.recoveryPath || session.localFilePath;
        try {
          if (target && shell && typeof shell.showItemInFolder === 'function') {
            shell.showItemInFolder(target);
          }
        } catch (_) {}
      });
    }
    if (notification && typeof notification.show === 'function') notification.show();
  } catch (_) { /* notification best-effort, la copie reste disponible */ }
}

async function preserveUnsyncedDocument(session) {
  const originalError = session.error
    || (session.state === 'conflict'
      ? 'Une version plus recente existe.'
      : "La synchronisation finale n'a pas ete confirmee.");

  let recoveryPath = session.localFilePath;
  let recoveryDurable = false;
  let recoveryError = null;
  try {
    recoveryPath = await recoveryStore.preserve({
      sourcePath: session.localFilePath,
      recoveryDir: config.getRecoveryDir(app),
      docId: session.docId,
    });
    recoveryDurable = true;
  } catch (err) {
    recoveryError = err;
  }

  const recoverySavedAt = Date.now();
  const recoveryMessage = recoveryDurable
    ? 'Une copie recuperable a ete conservee dans Documents > Kheops 2 > Documents non synchronises.'
    : `Le fichier local n'a pas ete supprime, mais la copie vers Documents a echoue${recoveryError?.message ? ` (${recoveryError.message})` : ''}.`;
  setState(session.docId, {
    state: session.state === 'conflict' ? 'conflict' : 'error',
    error: `${originalError} ${recoveryMessage}`,
    recoveryPath,
    recoveryDurable,
    recoverySavedAt,
  });
  notifyUnsyncedRecovery(session);

  return { recoveryPath, recoveryDurable, recoverySavedAt };
}

/**
 * Ouvre un document : telecharge le .docx, l'ouvre dans Word, et lance la
 * surveillance + le heartbeat.
 * @returns {Promise<{ok:true}>}
 * @throws si le verrou est detenu par un autre, ou en cas d'erreur reseau.
 */
async function open({
  docId,
  fileName,
  backendBaseUrl,
  token,
  tokenExpiresAt = null,
  sessionAbsoluteExpiresAt = null,
  userId = null,
}) {
  if (sessions.has(docId)) {
    // Deja ouvert : on remet juste Word au premier plan.
    const s = sessions.get(docId);
    if (s.finalizePromise && !s.finalized) {
      const err = new Error('La synchronisation finale est encore en cours. Reessayez dans quelques instants.');
      err.code = 'SYNC_IN_PROGRESS';
      throw err;
    }
    if (!s.finalized && s.localFilePath && fs.existsSync(s.localFilePath)) {
      // Une nouvelle demande du web apporte normalement un jeton plus recent.
      // On le prend en compte sans retelecharger ni recreer la session Word.
      await replaceSessionCredentials(s, {
        token,
        tokenExpiresAt,
        sessionAbsoluteExpiresAt,
        userId,
        backendBaseUrl,
      });
      try { await shell.openPath(s.localFilePath); } catch (_) {}
      return { ok: true, reopened: true };
    }
    // SESSION FANTOME : une tentative precedente a echoue (ex. download 404) et a
    // laisse une session SANS fichier local. Sans ce nettoyage, tous les
    // double-clics suivants tombaient ici et NE retelechargeaient JAMAIS (Word ne
    // s'ouvrait plus jusqu'au redemarrage du compagnon). On la purge et on repart
    // sur une ouverture fraiche ci-dessous.
    if (s.heartbeatTimer) { try { clearInterval(s.heartbeatTimer); } catch (_) {} }
    if (s.cleanupTimer) { try { clearTimeout(s.cleanupTimer); } catch (_) {} }
    clearTokenRefreshTimer(s);
    try { saveWatcher.stop(docId); } catch (_) {}
    try { lockWatcher.stop(docId); } catch (_) {}
    sessions.delete(docId);
  }

  const tempRoot = config.getTempDir(app);
  // Un dossier unique par ouverture garantit qu'une ancienne copie locale,
  // conservee apres panne, ne sera jamais ecrasee par un nouveau telechargement.
  const localFilePath = path.join(
    tempRoot,
    safeSessionDirectoryName(docId),
    sanitizeFileName(fileName, docId),
  );

  const session = {
    docId, backendBaseUrl, token, localFilePath,
    userId: userId ? String(userId) : null,
    tokenExpiresAt: normalizedExpiry(tokenExpiresAt, token),
    sessionAbsoluteExpiresAt: Number(sessionAbsoluteExpiresAt) || null,
    tokenRefreshTimer: null, tokenRefreshPromise: null, tokenRefreshError: null,
    credentialUpdatePromise: null,
    state: 'opening', error: null, lastSyncAt: null,
    baseVersionId: null, conflict: null,
    recoveryPath: null, recoveryDurable: false, recoverySavedAt: null,
    heartbeatTimer: null, cleanupTimer: null, finalizePromise: null, finalized: false,
  };
  sessions.set(docId, session);

  // NB verrou : c'est le FRONTEND web qui ACQUIERT le verrou (handleOpenDocument,
  // tryAcquireDocLock) AVANT de demander l'ouverture au compagnon. Le compagnon
  // ne fait donc que le HEARTBEAT (maintien) puis le RELEASE a la fermeture —
  // point d'acquisition unique, pas de double-acquire.

  // 1) Telechargement du .docx.
  try {
    const downloaded = await backendClient.downloadDocx(backendBaseUrl, token, docId, localFilePath);
    session.baseVersionId = downloaded?.baseVersionId || null;
  } catch (err) {
    setState(docId, { state: 'error', error: `Telechargement: ${err.message}` });
    await safeReleaseLock(backendBaseUrl, token, docId);
    await safeRevokeCompanionSession(backendBaseUrl, token);
    // Purge la session ratee : une nouvelle tentative doit repartir a zero
    // (sinon elle serait ignoree par le garde « deja ouvert » ci-dessus).
    sessions.delete(docId);
    throw err;
  }

  // 2) Ouverture dans l'application par defaut (Microsoft Word).
  try {
    const opened = await shell.openPath(localFilePath); // '' si OK, message d'erreur sinon
    if (opened) throw new Error(opened);
  } catch (err) {
    setState(docId, { state: 'error', error: `Ouverture Word: ${err.message}` });
    await safeReleaseLock(backendBaseUrl, token, docId);
    await safeRevokeCompanionSession(backendBaseUrl, token);
    sessions.delete(docId);
    throw err;
  }

  setState(docId, { state: 'open' });

  // 3) Heartbeat du verrou (toutes les 30s).
  session.heartbeatTimer = setInterval(() => {
    backendClient.heartbeat(session.backendBaseUrl, session.token, docId).catch(() => { /* retry au prochain battement */ });
  }, config.HEARTBEAT_INTERVAL_MS);
  if (typeof session.heartbeatTimer.unref === 'function') session.heartbeatTimer.unref();

  // Le compagnon renouvelle lui-meme son jeton, meme si l'onglet web est
  // ferme. Le jeton reste exclusivement un JWT Kheops a portee compagnon.
  scheduleTokenRefresh(session);

  // 4) Surveillance des sauvegardes -> re-upload.
  saveWatcher.watch({
    docId, localFilePath, backendBaseUrl,
    token,
    getToken: () => session.token,
    baseVersionId: session.baseVersionId,
    onVersion: (versionId) => { session.baseVersionId = versionId; },
    onState: (state, extra = {}) => setState(docId, { state, ...extra }),
  });

  // 5) Detection de fermeture -> sync finale + release + cleanup.
  lockWatcher.track({
    docId, localFilePath, backendBaseUrl,
    token,
    getToken: () => session.token,
    onReleased: async () => {
      await finalizeAndCleanup(docId, { lockAlreadyReleased: true });
    },
  });

  return { ok: true };
}

async function finalizeAndCleanup(docId, { lockAlreadyReleased = false } = {}) {
  const s = sessions.get(docId);
  if (!s) return { synced: true, state: 'idle', alreadyClosed: true };
  if (s.finalizePromise) return s.finalizePromise;

  s.finalizePromise = (async () => {
    if (s.heartbeatTimer) { clearInterval(s.heartbeatTimer); s.heartbeatTimer = null; }
    clearTokenRefreshTimer(s);

    // Une reouverture concurrente peut etre en train de revoquer l'ancienne
    // chaine et d'installer la nouvelle. La fermeture doit attendre ce passage
    // de relais avant tout upload final.
    if (s.credentialUpdatePromise) {
      try { await s.credentialUpdatePromise; } catch (_) { /* la sauvegarde finale reste prioritaire */ }
    }

    // Si une rotation etait deja en vol au moment exact de la fermeture, on
    // attend son resultat avant l'envoi final. En cas d'echec, la sauvegarde
    // finale tente encore le jeton courant puis conserve la copie de secours.
    if (s.tokenRefreshPromise) {
      try { await s.tokenRefreshPromise; } catch (_) { /* gere par la rotation */ }
    }

    // Attendre un upload deja en cours avant la synchronisation finale. Sans
    // cela, deux envois issus de la meme session pouvaient partir avec la meme
    // baseVersionId et creer un faux conflit entre eux.
    try {
      await saveWatcher.stop(docId);
    } catch (err) {
      setState(docId, { state: 'error', error: `Synchronisation en cours interrompue: ${err.message}` });
    }

    const localFileExists = fs.existsSync(s.localFilePath);
    let synced = false;

    // Sync finale (au cas ou une derniere sauvegarde n'aurait pas ete debouncee).
    // Un conflit deja signale n'est pas renvoye : la copie locale doit rester
    // intacte pour que l'utilisateur puisse choisir la bonne version.
    if (localFileExists && s.state !== 'conflict') {
      try {
        synced = await saveWatcher.finalUpload({
          docId, localFilePath: s.localFilePath, backendBaseUrl: s.backendBaseUrl, token: s.token,
          getToken: () => s.token,
          baseVersionId: s.baseVersionId,
          onVersion: (versionId) => { s.baseVersionId = versionId; },
          onState: (state, extra = {}) => setState(docId, { state, ...extra }),
        }) === true;
      } catch (err) {
        setState(docId, { state: 'error', error: `Synchronisation finale: ${err.message}` });
        synced = false;
      }
    } else if (!localFileExists && s.state !== 'conflict') {
      setState(docId, { state: 'error', error: 'Le fichier Word local est introuvable.' });
    }

    if (!lockAlreadyReleased) {
      await safeReleaseLock(s.backendBaseUrl, s.token, docId);
      lockWatcher.stop(docId);
    }

    let recovery = null;
    if (synced) {
      // La suppression n'est autorisee qu'apres confirmation explicite du
      // backend. Une erreur de nettoyage n'affecte pas la durabilite serveur.
      try {
        const dir = path.dirname(s.localFilePath);
        await fs.promises.rm(dir, { recursive: true, force: true });
      } catch (_) { /* nettoyage best-effort apres sync confirmee */ }
      setState(docId, { state: 'closed', error: null });
    } else if (localFileExists) {
      // Panne reseau, jeton expire ou conflit : copie durable visible, puis
      // seulement nettoyage du temporaire. Si la copie echoue, le temporaire
      // reste strictement intact.
      recovery = await preserveUnsyncedDocument(s);
      // En cas de conflit, on garde AUSSI le temporaire original : le serveur a
      // bloque cette branche de synchronisation et l'utilisateur peut vouloir
      // la rouvrir/reessayer manuellement. Le dossier unique de chaque nouvelle
      // session empeche qu'elle soit ecrasee ensuite.
      if (recovery.recoveryDurable && s.state !== 'conflict') {
        try {
          const dir = path.dirname(s.localFilePath);
          await fs.promises.rm(dir, { recursive: true, force: true });
        } catch (_) { /* la copie durable existe deja */ }
      }
    }

    // La chaine ne doit pas survivre a la session Word. L'appel reste
    // best-effort : une panne reseau ne peut jamais annuler une sauvegarde ou
    // supprimer la copie locale de recuperation.
    await safeRevokeCompanionSession(s.backendBaseUrl, s.token);

    s.finalized = true;
    clearTokenRefreshTimer(s);
    // Le jeton ne sert plus une fois la fermeture traitee. On ne le conserve
    // pas pendant la courte fenetre ou le navigateur lit encore le statut.
    s.token = null;
    if (s.cleanupTimer) clearTimeout(s.cleanupTimer);
    s.cleanupTimer = setTimeout(() => sessions.delete(docId), 15_000);
    if (s.cleanupTimer && typeof s.cleanupTimer.unref === 'function') s.cleanupTimer.unref();

    return {
      synced,
      state: s.state,
      recovery: s.recoveryPath ? {
        available: fs.existsSync(s.recoveryPath),
        path: s.recoveryPath,
        durable: !!s.recoveryDurable,
        savedAt: s.recoverySavedAt || null,
      } : null,
    };
  })();

  return s.finalizePromise;
}

async function safeReleaseLock(backendBaseUrl, token, docId) {
  try { await backendClient.releaseLock(backendBaseUrl, token, docId); } catch (_) { /* best-effort */ }
}

async function safeRevokeCompanionSession(backendBaseUrl, token) {
  if (!backendBaseUrl || !token || typeof backendClient.revokeCompanionSession !== 'function') return false;
  try {
    await backendClient.revokeCompanionSession(backendBaseUrl, token);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Fermeture/nettoyage explicite demande par le web.
 */
async function closeCleanup(docId) {
  lockWatcher.stop(docId);
  const result = await finalizeAndCleanup(docId, { lockAlreadyReleased: false });
  return { ok: true, ...result };
}

function stopAll() {
  for (const docId of Array.from(sessions.keys())) {
    const s = sessions.get(docId);
    if (s && s.heartbeatTimer) clearInterval(s.heartbeatTimer);
    if (s && s.cleanupTimer) clearTimeout(s.cleanupTimer);
    if (s) clearTokenRefreshTimer(s);
    if (s?.token) {
      const token = s.token;
      s.token = null;
      safeRevokeCompanionSession(s.backendBaseUrl, token).catch(() => {});
    }
  }
  saveWatcher.stopAll();
  lockWatcher.stopAll();
  sessions.clear();
}

module.exports = {
  open,
  getStatus,
  closeCleanup,
  stopAll,
  _refreshSessionTokenForTesting: refreshSessionToken,
  _getSessionForTesting: (docId) => sessions.get(docId),
};
