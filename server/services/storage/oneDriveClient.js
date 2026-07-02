// server/services/storage/oneDriveClient.js
//
// Client Microsoft Graph pour le OneDrive PERSONNEL de chaque utilisateur (A3).
//
// Principe (confidentialité) : il n'existe AUCUN OneDrive « cabinet » central.
// Chaque document est écrit dans le OneDrive de l'utilisateur qui l'a créé,
// via SON jeton OAuth délégué (délivré au login Microsoft, scope Files.ReadWrite
// déjà consenti — cf. routes/auth.js MICROSOFT_SCOPES). On réutilise donc le
// résolveur de jeton par utilisateur déjà en place pour la messagerie Graph.
//
// Le module n'expose que des opérations bas-niveau sur un drive donné, prenant
// toujours le `userId` PROPRIÉTAIRE en premier argument. La correspondance
// document ↔ propriétaire est portée par le storageKey (voir providers/onedrive.js).

const axios = require('axios');
const { getAccessTokenForUser } = require('../../utils/microsoftGraphMail');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

// Erreur normalisée « OneDrive non connecté » (jeton absent / refresh échoué).
// 428 Precondition Required : le client doit déclencher la connexion Microsoft.
function notConnectedError(cause) {
  const err = new Error(
    "OneDrive non connecté pour cet utilisateur : une connexion Microsoft (Files.ReadWrite) est requise.",
  );
  err.statusCode = 428;
  err.code = 'ONEDRIVE_NOT_CONNECTED';
  if (cause) err.cause = cause;
  return err;
}

async function tokenFor(userId) {
  try {
    return await getAccessTokenForUser(userId);
  } catch (err) {
    // getAccessTokenForUser lève 'AUTH_REQUIRED' (pas de refresh token) ou
    // 'AUTH_REFRESH_FAILED' (token révoqué/expiré). Dans les deux cas, l'action
    // utilisateur attendue est la même : (re)connecter OneDrive.
    if (err.message === 'AUTH_REQUIRED' || err.message === 'AUTH_REFRESH_FAILED') {
      throw notConnectedError(err.message);
    }
    throw err;
  }
}

// Encode un chemin OneDrive segment par segment (les espaces / accents / etc.
// doivent être encodés, mais pas les '/').
function encodePath(pathStr) {
  return String(pathStr)
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

/**
 * Upload simple (fichiers <= 250 Mo — largement au-dessus du plafond 100 Mo des
 * routes). PUT /me/drive/root:/{path}:/content.
 * @returns {Promise<{itemId:string,size:number,webUrl:string,name:string}>}
 */
async function uploadFile(userId, { path, buffer, mime }) {
  if (!Buffer.isBuffer(buffer)) {
    const err = new Error('Buffer fichier manquant.');
    err.statusCode = 400;
    err.code = 'MISSING_FILE_BUFFER';
    throw err;
  }
  const token = await tokenFor(userId);
  const url =
    `${GRAPH_BASE}/me/drive/root:/${encodePath(path)}:/content` +
    '?%40microsoft.graph.conflictBehavior=replace';
  const resp = await axios.put(url, buffer, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mime || 'application/octet-stream',
    },
    timeout: 60000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return {
    itemId: resp.data.id,
    size: resp.data.size,
    webUrl: resp.data.webUrl,
    name: resp.data.name,
  };
}

/** Télécharge le contenu d'un item → Buffer. */
async function downloadFile(userId, itemId) {
  const token = await tokenFor(userId);
  const resp = await axios.get(
    `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(itemId)}/content`,
    {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'arraybuffer',
      timeout: 60000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    },
  );
  return Buffer.from(resp.data);
}

/**
 * URL de téléchargement pré-authentifiée et éphémère (fournie par Graph via la
 * propriété @microsoft.graph.downloadUrl). Équivalent d'une URL signée GCS.
 */
async function getDownloadUrl(userId, itemId) {
  const token = await tokenFor(userId);
  const resp = await axios.get(
    `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(itemId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: { $select: 'id,@microsoft.graph.downloadUrl' },
      timeout: 30000,
    },
  );
  const url = resp.data['@microsoft.graph.downloadUrl'];
  if (!url) {
    const err = new Error('URL de téléchargement OneDrive indisponible.');
    err.statusCode = 502;
    err.code = 'ONEDRIVE_NO_DOWNLOAD_URL';
    throw err;
  }
  return url;
}

/** Supprime définitivement un item (corbeille OneDrive de l'utilisateur). */
async function deleteItem(userId, itemId) {
  const token = await tokenFor(userId);
  await axios.delete(`${GRAPH_BASE}/me/drive/items/${encodeURIComponent(itemId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000,
    // 404 = déjà supprimé : idempotent, on n'échoue pas.
    validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
  });
  return { ok: true };
}

/** Teste l'existence d'un item. */
async function itemExists(userId, itemId) {
  const token = await tokenFor(userId);
  const resp = await axios.get(
    `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(itemId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: { $select: 'id' },
      timeout: 30000,
      validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
    },
  );
  return resp.status !== 404;
}

/**
 * Sonde de connexion : renvoie true si le OneDrive de l'utilisateur est
 * accessible (jeton valide + /me/drive répond). Ne lève jamais — renvoie false
 * en cas d'absence de connexion.
 */
async function isConnected(userId) {
  try {
    const token = await tokenFor(userId);
    await axios.get(`${GRAPH_BASE}/me/drive`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { $select: 'id' },
      timeout: 15000,
    });
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  uploadFile,
  downloadFile,
  getDownloadUrl,
  deleteItem,
  itemExists,
  isConnected,
  notConnectedError,
  _encodePath: encodePath,
};
