// server/services/storage/googleDriveClient.js
//
// Client Google Drive pour le Drive PERSONNEL de chaque utilisateur (A3), même
// principe que oneDriveClient : AUCUN Drive « cabinet » central. Chaque document
// est écrit dans le Drive de l'utilisateur qui l'a créé, via SON jeton OAuth.
//
// Scope : `drive.file` (déjà consenti au login Google — cf. routes/auth.js). Ce
// scope est idéal pour la confidentialité : l'application ne voit QUE les
// fichiers qu'elle a elle-même créés, jamais le reste du Drive de l'utilisateur.
//
// On rafraîchit le jeton d'accès par un appel direct au endpoint OAuth Google
// (comme microsoftGraphMail), pour NE PAS muter l'oauth2Client partagé (évite
// les races entre utilisateurs).

const axios = require('axios');
const crypto = require('crypto');
const User = require('../../models/App_Users/User');
const { decryptIfNeeded, encryptIfNeeded } = require('../../utils/tokenCrypto');

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const APP_FOLDER_NAME = 'Kheops2';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const TEXT_MIME = 'text/plain';

// userId -> { accessToken, expiresAt }
const tokenCache = new Map();
// userId -> folderId (stable ; invalidé seulement au restart process)
const folderCache = new Map();

function notConnectedError(cause) {
  const err = new Error(
    "Google Drive non connecté pour cet utilisateur : une connexion Google (Drive) est requise.",
  );
  err.statusCode = 428;
  err.code = 'GOOGLEDRIVE_NOT_CONNECTED';
  if (cause) err.cause = cause;
  return err;
}

async function getAccessTokenForUser(userId) {
  const key = String(userId);
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.accessToken;

  const user = await User.findById(userId).select('googleDriveRefreshToken googleRefreshToken googleDriveAccount.disconnectedAt');
  // Repli legacy : les anciens comptes ont pu consentir drive.file dans le
  // jeton Google historique. Les nouvelles connexions utilisent toujours le
  // champ dédié et restent donc indépendantes de Gmail/du login Kheops.
  const tokenField = user?.googleDriveRefreshToken
    ? 'googleDriveRefreshToken'
    : (user?.googleDriveAccount?.disconnectedAt ? null : 'googleRefreshToken');
  const storedToken = user?.[tokenField];
  if (!user || !storedToken) throw notConnectedError('no-refresh-token');

  const refreshTokenPlain = decryptIfNeeded(storedToken);
  if (!refreshTokenPlain) throw notConnectedError('undecryptable-refresh-token');

  try {
    const resp = await axios.post(
      OAUTH_TOKEN_URL,
      new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshTokenPlain,
        grant_type: 'refresh_token',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 },
    );
    const fresh = {
      accessToken: resp.data.access_token,
      expiresAt: Date.now() + (resp.data.expires_in * 1000) - 60000,
    };
    tokenCache.set(key, fresh);
    // Google renvoie rarement un nouveau refresh_token au refresh ; on le
    // persiste si présent (rotation).
    if (resp.data.refresh_token && resp.data.refresh_token !== refreshTokenPlain) {
      await User.findByIdAndUpdate(userId, {
        $set: { [tokenField]: encryptIfNeeded(resp.data.refresh_token) },
      });
    }
    return fresh.accessToken;
  } catch (err) {
    if (err.response?.data?.error === 'invalid_grant') {
      try { await User.findByIdAndUpdate(userId, { $set: { [tokenField]: null } }); } catch (_) {}
      throw notConnectedError('invalid_grant');
    }
    throw err;
  }
}

async function ensureAppFolder(userId, accessToken) {
  const key = String(userId);
  if (folderCache.has(key)) return folderCache.get(key);

  // Recherche du dossier applicatif (drive.file → ne voit que nos fichiers).
  const q = `name = '${APP_FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const searchResp = await axios.get(`${DRIVE_API}/files`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { q, fields: 'files(id)', spaces: 'drive', pageSize: 1 },
    timeout: 15000,
  });
  let folderId = searchResp.data.files?.[0]?.id;
  if (!folderId) {
    const createResp = await axios.post(
      `${DRIVE_API}/files`,
      { name: APP_FOLDER_NAME, mimeType: FOLDER_MIME },
      {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        params: { fields: 'id' },
        timeout: 15000,
      },
    );
    folderId = createResp.data.id;
  }
  folderCache.set(key, folderId);
  return folderId;
}

// Echappe les caracteres speciaux de la clause `q` de l'API Drive (apostrophes,
// backslashes) — un nom de partie peut contenir « D'Angelo », etc.
function escapeDriveQuery(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Trouve (ou cree) un sous-dossier `name` sous `parentId`. Avec drive.file, l'app
// ne voit que ses PROPRES dossiers -> la recherche reste cloisonnee et sure.
async function findOrCreateFolder(token, name, parentId) {
  const q = `name = '${escapeDriveQuery(name)}' and mimeType = '${FOLDER_MIME}' and '${parentId}' in parents and trashed = false`;
  const searchResp = await axios.get(`${DRIVE_API}/files`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { q, fields: 'files(id)', spaces: 'drive', pageSize: 1 },
    timeout: 15000,
  });
  let id = searchResp.data.files?.[0]?.id;
  if (!id) {
    const createResp = await axios.post(
      `${DRIVE_API}/files`,
      { name, mimeType: FOLDER_MIME, parents: [parentId] },
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        params: { fields: 'id' },
        timeout: 15000,
      },
    );
    id = createResp.data.id;
  }
  return id;
}

// File d'attente par utilisateur : SERIALISE les creations de dossiers d'un meme
// utilisateur. Contrairement a OneDrive/SharePoint (conflictBehavior=fail + 409),
// l'API Drive AUTORISE plusieurs dossiers de meme nom : une course search-then-
// create (ex. backfill concurrent) dupliquerait les dossiers PARENTS partages
// (Kheops2/Dossiers). La serialisation par user supprime cette course.
const folderLocks = new Map(); // userId -> Promise (queue de la file)

// Cree/retrouve une HIERARCHIE de dossiers (ex. ['Kheops2','Dossiers','<label>'])
// dans le Drive de l'utilisateur ; renvoie l'id du dossier feuille. Chaque chemin
// complet est mis en cache pour eviter des allers-retours a chaque upload.
async function ensureFolderPath(userId, token, segments) {
  const cacheKey = `${userId}|${segments.join('/')}`;
  if (folderCache.has(cacheKey)) return folderCache.get(cacheKey);

  const key = String(userId);
  const prev = folderLocks.get(key) || Promise.resolve();
  const run = prev.then(async () => {
    // Re-verifie le cache : un appel precedent de la file l'a peut-etre deja cree.
    if (folderCache.has(cacheKey)) return folderCache.get(cacheKey);
    let parentId = 'root';
    for (const seg of segments) {
      parentId = await findOrCreateFolder(token, seg, parentId);
    }
    folderCache.set(cacheKey, parentId);
    return parentId;
  });
  // On chaine la file meme si `run` echoue (sans propager le rejet aux suivants).
  folderLocks.set(key, run.catch(() => {}));
  return run;
}

/**
 * Upload multipart (métadonnées + contenu) dans le Drive de l'utilisateur.
 * Si `folderSegments` est fourni (ex. ['Kheops2','Dossiers','Durand c- Petit — 202601']),
 * le fichier est range dans cette hierarchie LISIBLE (Volet A) ; sinon il retombe
 * dans le dossier applicatif « Kheops2 » a plat (compat historique).
 * @returns {Promise<{fileId:string,size:number,name:string}>}
 */
async function uploadFile(userId, {
  name,
  buffer,
  mime,
  folderSegments,
  convertToGoogle = false,
  idempotencyKey = null,
}) {
  if (!Buffer.isBuffer(buffer)) {
    const err = new Error('Buffer fichier manquant.');
    err.statusCode = 400;
    err.code = 'MISSING_FILE_BUFFER';
    throw err;
  }
  const token = await getAccessTokenForUser(userId);
  const folderId = Array.isArray(folderSegments) && folderSegments.length
    ? await ensureFolderPath(userId, token, folderSegments)
    : await ensureAppFolder(userId, token);

  // Google Drive autorise plusieurs fichiers du même nom. Une propriété privée
  // à l'application ferme donc la fenêtre de duplication lors de la reprise
  // d'une opération journalisée après une panne réseau.
  const syncKey = idempotencyKey
    ? crypto.createHash('sha256').update(String(idempotencyKey)).digest('hex')
    : null;
  if (syncKey) {
    const q = `appProperties has { key='kheopsSyncKey' and value='${syncKey}' } and '${folderId}' in parents and trashed = false`;
    const existing = await axios.get(`${DRIVE_API}/files`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        q,
        fields: 'files(id,size,name,mimeType,webViewLink,modifiedTime)',
        spaces: 'drive',
        pageSize: 1,
      },
      timeout: 15000,
    });
    const file = existing.data.files?.[0];
    if (file) {
      return {
        fileId: file.id,
        size: Number(file.size) || buffer.length,
        name: file.name || name || 'document',
        mimeType: file.mimeType,
        webViewLink: file.webViewLink,
        modifiedTime: file.modifiedTime,
        idempotent: true,
      };
    }
  }

  const boundary = 'kheops2boundary' + Buffer.from(String(name || 'f')).toString('hex').slice(0, 16) + 'x';
  const uploadName = convertToGoogle
    ? String(name || 'document').replace(/\.(?:docx|txt)$/i, '')
    : (name || 'document');
  const meta = JSON.stringify({
    name: uploadName,
    parents: [folderId],
    ...(syncKey ? { appProperties: { kheopsSyncKey: syncKey } } : {}),
    ...(convertToGoogle ? { mimeType: 'application/vnd.google-apps.document' } : {}),
  });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`, 'utf8'),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mime || 'application/octet-stream'}\r\n\r\n`, 'utf8'),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  ]);

  const resp = await axios.post(DRIVE_UPLOAD, body, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    params: { uploadType: 'multipart', fields: 'id,size,name,mimeType,webViewLink,modifiedTime' },
    timeout: 60000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  const result = {
    fileId: resp.data.id,
    size: Number(resp.data.size) || buffer.length,
    name: resp.data.name || uploadName,
  };
  if (resp.data.mimeType || convertToGoogle) {
    result.mimeType = resp.data.mimeType || 'application/vnd.google-apps.document';
  }
  if (resp.data.webViewLink) result.webViewLink = resp.data.webViewLink;
  if (resp.data.modifiedTime) result.modifiedTime = resp.data.modifiedTime;
  return result;
}

async function downloadFile(userId, fileId) {
  const token = await getAccessTokenForUser(userId);
  const resp = await axios.get(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { alt: 'media' },
    responseType: 'arraybuffer',
    timeout: 60000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return Buffer.from(resp.data);
}

/**
 * Télécharge un fichier édité. Les documents Google natifs sont exportés dans
 * le format demandé. Le repli DOCX préserve toutes les sessions historiques.
 */
async function downloadEditableFile(userId, fileId, {
  exportMime = DOCX_MIME,
  exportExtension,
} = {}) {
  const token = await getAccessTokenForUser(userId);
  const meta = await axios.get(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { fields: 'id,name,mimeType,size,webViewLink,modifiedTime,md5Checksum' },
    timeout: 30000,
  });
  const isNative = meta.data.mimeType === 'application/vnd.google-apps.document';
  const url = isNative
    ? `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export`
    : `${DRIVE_API}/files/${encodeURIComponent(fileId)}`;
  const params = isNative
    ? { mimeType: exportMime }
    : { alt: 'media' };
  const resp = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    params,
    responseType: 'arraybuffer',
    timeout: 60000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  const extension = exportExtension
    || (exportMime === TEXT_MIME ? '.txt' : '.docx');
  const remoteName = String(meta.data.name || 'document');
  const name = isNative && !remoteName.toLowerCase().endsWith(extension.toLowerCase())
    ? `${remoteName}${extension}`
    : remoteName;
  return {
    buffer: Buffer.from(resp.data),
    fileId: meta.data.id,
    name,
    sourceMime: meta.data.mimeType,
    downloadedMime: isNative ? exportMime : meta.data.mimeType,
    webViewLink: meta.data.webViewLink || null,
    modifiedTime: meta.data.modifiedTime || null,
    checksum: meta.data.md5Checksum || null,
  };
}

async function getItemMetadata(userId, fileId) {
  const token = await getAccessTokenForUser(userId);
  const resp = await axios.get(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { fields: 'id,name,mimeType,size,webViewLink,modifiedTime,md5Checksum,trashed' },
    timeout: 30000,
  });
  return resp.data;
}

async function deleteItem(userId, fileId) {
  const token = await getAccessTokenForUser(userId);
  await axios.delete(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000,
    validateStatus: (s) => (s >= 200 && s < 300) || s === 404, // idempotent
  });
  return { ok: true };
}

async function itemExists(userId, fileId) {
  const token = await getAccessTokenForUser(userId);
  const resp = await axios.get(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { fields: 'id,trashed' },
    timeout: 30000,
    validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
  });
  return resp.status !== 404 && !resp.data?.trashed;
}

async function isConnected(userId) {
  try {
    const token = await getAccessTokenForUser(userId);
    await axios.get(`${DRIVE_API}/about`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { fields: 'user' },
      timeout: 15000,
    });
    return true;
  } catch (_) {
    return false;
  }
}

function clearTokenCache(userId) {
  const key = String(userId);
  tokenCache.delete(key);
  for (const folderKey of folderCache.keys()) {
    if (String(folderKey) === key || String(folderKey).startsWith(`${key}|`)) {
      folderCache.delete(folderKey);
    }
  }
}

/**
 * Cree (ou retrouve) une hierarchie de dossiers lisible dans le Drive de
 * l'utilisateur (materialisation d'un dossier vide a la creation / au backfill).
 * @returns {Promise<{folderId:string}>}
 */
async function ensureFolderPathForUser(userId, segments) {
  const token = await getAccessTokenForUser(userId);
  const folderId = await ensureFolderPath(userId, token, segments);
  return { folderId };
}

// ── Utilitaires MIGRATION HERITAGE (Files_Clients -> Kheops2/Dossiers) ───────
// L'ancienne app de bureau rangeait les fichiers sous Files_Clients/<idDossier>.
// Ces helpers permettent de retrouver cette hierarchie et de DEPLACER les
// fichiers vers le rangement lisible, sans rien re-uploader (les fileId sont
// conserves -> les storageKey googledrive: restent valides).
// NB : la visibilite de Files_Clients depend du scope du jeton (drive complet
// herite de l'ancien consentement, via include_granted_scopes). Avec un simple
// drive.file, la recherche renvoie [] -> la migration est un no-op propre.

/** Trouve un dossier par nom (sans le creer). Renvoie l'id ou null. */
async function findFolderByName(userId, name, { parentId } = {}) {
  const token = await getAccessTokenForUser(userId);
  let q = `name = '${escapeDriveQuery(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  const resp = await axios.get(`${DRIVE_API}/files`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { q, fields: 'files(id,name)', spaces: 'drive', pageSize: 1 },
    timeout: 20000,
  });
  return resp.data.files?.[0]?.id || null;
}

/** Liste les enfants directs d'un dossier (id, name, mimeType, size). Paginé. */
async function listChildren(userId, parentId) {
  const token = await getAccessTokenForUser(userId);
  const out = [];
  let pageToken;
  do {
    const resp = await axios.get(`${DRIVE_API}/files`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        q: `'${parentId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id,name,mimeType,size)',
        spaces: 'drive',
        pageSize: 100,
        pageToken,
      },
      timeout: 20000,
    });
    out.push(...(resp.data.files || []));
    pageToken = resp.data.nextPageToken;
  } while (pageToken && out.length < 2000);
  return out;
}

/** Cree (ou retrouve) UN sous-dossier nomme sous un parent donne. */
async function ensureChildFolderForUser(userId, parentId, name) {
  const token = await getAccessTokenForUser(userId);
  return findOrCreateFolder(token, name, parentId);
}

/** RENOMME un item (id conserve). Sert a l'ARCHIVAGE (Phase 3), jamais a supprimer. */
async function renameItem(userId, fileId, newName) {
  const token = await getAccessTokenForUser(userId);
  await axios.patch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}`,
    { name: String(newName) },
    { headers: { Authorization: `Bearer ${token}` }, params: { fields: 'id,name' }, timeout: 30000 },
  );
  return { ok: true };
}

/**
 * DEPLACE un item (changement de parent, id conserve — pas de copie d'octets).
 * Idempotent : re-deplacer vers le meme parent est sans effet.
 */
async function moveItem(userId, fileId, { addParentId, removeParentId }) {
  const token = await getAccessTokenForUser(userId);
  await axios.patch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}`,
    {},
    {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        addParents: addParentId,
        removeParents: removeParentId || undefined,
        fields: 'id,parents',
      },
      timeout: 30000,
    },
  );
  return { ok: true };
}

module.exports = {
  getAccessTokenForUser,
  uploadFile,
  downloadFile,
  downloadEditableFile,
  getItemMetadata,
  deleteItem,
  itemExists,
  isConnected,
  ensureFolderPathForUser,
  // migration heritage (Files_Clients -> Kheops2/Dossiers)
  findFolderByName,
  listChildren,
  ensureChildFolderForUser,
  moveItem,
  renameItem,
  notConnectedError,
  clearTokenCache,
  _tokenCache: tokenCache,
  _folderCache: folderCache,
};
