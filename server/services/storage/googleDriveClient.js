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
const User = require('../../models/App_Users/User');
const { decryptIfNeeded, encryptIfNeeded } = require('../../utils/tokenCrypto');

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const APP_FOLDER_NAME = 'Kheops2';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

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

  const user = await User.findById(userId).select('googleRefreshToken');
  if (!user || !user.googleRefreshToken) throw notConnectedError('no-refresh-token');

  const refreshTokenPlain = decryptIfNeeded(user.googleRefreshToken);
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
        $set: { googleRefreshToken: encryptIfNeeded(resp.data.refresh_token) },
      });
    }
    return fresh.accessToken;
  } catch (err) {
    if (err.response?.data?.error === 'invalid_grant') {
      try { await User.findByIdAndUpdate(userId, { $set: { googleRefreshToken: null } }); } catch (_) {}
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

/**
 * Upload multipart (métadonnées + contenu) dans le dossier applicatif du Drive
 * de l'utilisateur.
 * @returns {Promise<{fileId:string,size:number,name:string}>}
 */
async function uploadFile(userId, { name, buffer, mime }) {
  if (!Buffer.isBuffer(buffer)) {
    const err = new Error('Buffer fichier manquant.');
    err.statusCode = 400;
    err.code = 'MISSING_FILE_BUFFER';
    throw err;
  }
  const token = await getAccessTokenForUser(userId);
  const folderId = await ensureAppFolder(userId, token);

  const boundary = 'kheops2boundary' + Buffer.from(String(name || 'f')).toString('hex').slice(0, 16) + 'x';
  const meta = JSON.stringify({ name: name || 'document', parents: [folderId] });
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
    params: { uploadType: 'multipart', fields: 'id,size' },
    timeout: 60000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return {
    fileId: resp.data.id,
    size: Number(resp.data.size) || buffer.length,
    name: name || 'document',
  };
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

module.exports = {
  getAccessTokenForUser,
  uploadFile,
  downloadFile,
  deleteItem,
  itemExists,
  isConnected,
  notConnectedError,
  _tokenCache: tokenCache,
  _folderCache: folderCache,
};
