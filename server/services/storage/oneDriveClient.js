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
const microsoftGraphAuth = require('../../utils/microsoftGraphMail');

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
    // Le helper dédié utilise microsoftOneDriveRefreshToken. Le repli garde les
    // anciens tests et installations compatibles pendant la migration.
    const resolver = microsoftGraphAuth.getAccessTokenForOneDriveUser
      || microsoftGraphAuth.getAccessTokenForUser;
    return await resolver(userId);
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
  // conflictBehavior=rename (et NON replace) : deux documents DISTINCTS de meme
  // nom deposes dans le meme dossier produisent le meme chemin ; « replace »
  // ecraserait silencieusement le premier (perte de donnees). « rename » fait
  // ajouter un suffixe « (1) » par Graph et renvoie un itemId DISTINCT (capture
  // dans le storageKey), donc rien n'est ecrase. Les vraies nouvelles versions
  // d'un meme document ne collisionnent pas (suffixe « (vN) » deja applique).
  const url =
    `${GRAPH_BASE}/me/drive/root:/${encodePath(path)}:/content` +
    '?%40microsoft.graph.conflictBehavior=rename';
  const resp = await axios.put(url, buffer, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mime || 'application/octet-stream',
    },
    timeout: 60000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  const result = {
    itemId: resp.data.id,
    size: resp.data.size,
    webUrl: resp.data.webUrl,
    name: resp.data.name,
  };
  if (resp.data.lastModifiedDateTime) result.modifiedTime = resp.data.lastModifiedDateTime;
  if (resp.data.eTag) result.etag = resp.data.eTag;
  return result;
}

/**
 * Cree (ou retrouve) une HIERARCHIE de dossiers dans le OneDrive de l'utilisateur
 * (ex. ['Kheops2','Dossiers','Durand c- Petit — 202601']) et renvoie l'item du
 * dossier feuille. IDEMPOTENT : si un segment existe deja, il est reutilise.
 * Sert a MATERIALISER un dossier (vide) des sa creation dans l'appli, pour qu'il
 * soit visible dans OneDrive / l'explorateur Windows meme sans document.
 * @returns {Promise<{itemId:string, webUrl:string}>}
 */
async function ensureFolderPath(userId, segments) {
  const token = await tokenFor(userId);
  const headers = { Authorization: `Bearer ${token}` };
  let path = '';
  let item = null;
  for (const seg of segments) {
    const next = path ? `${path}/${seg}` : String(seg);
    // L'item existe-t-il deja a ce chemin ?
    let resp = await axios.get(`${GRAPH_BASE}/me/drive/root:/${encodePath(next)}`, {
      headers,
      params: { $select: 'id,webUrl' },
      timeout: 20000,
      validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
    });
    if (resp.status === 404) {
      // Creation sous le parent. conflictBehavior=fail + relecture en cas de 409 :
      // idempotent meme en concurrence (deux creations simultanees du meme dossier).
      const parentUrl = path
        ? `${GRAPH_BASE}/me/drive/root:/${encodePath(path)}:/children`
        : `${GRAPH_BASE}/me/drive/root/children`;
      const createResp = await axios.post(
        parentUrl,
        { name: String(seg), folder: {}, '@microsoft.graph.conflictBehavior': 'fail' },
        { headers, timeout: 20000, validateStatus: (s) => (s >= 200 && s < 300) || s === 409 },
      );
      if (createResp.status === 409) {
        resp = await axios.get(`${GRAPH_BASE}/me/drive/root:/${encodePath(next)}`, {
          headers, params: { $select: 'id,webUrl' }, timeout: 20000,
        });
        item = resp.data;
      } else {
        item = createResp.data;
      }
    } else {
      item = resp.data;
    }
    path = next;
  }
  return { itemId: item.id, webUrl: item.webUrl };
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

/** Métadonnées utiles à une session Word pour le web (sans URL de téléchargement). */
async function getItemMetadata(userId, itemId) {
  const token = await tokenFor(userId);
  const resp = await axios.get(
    `${GRAPH_BASE}/me/drive/items/${encodeURIComponent(itemId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: { $select: 'id,name,size,webUrl,lastModifiedDateTime,eTag,file' },
      timeout: 30000,
    },
  );
  return {
    itemId: resp.data.id,
    name: resp.data.name,
    size: Number(resp.data.size) || 0,
    webUrl: resp.data.webUrl,
    modifiedTime: resp.data.lastModifiedDateTime || null,
    etag: resp.data.eTag || null,
    mime: resp.data.file?.mimeType || null,
  };
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
  getItemMetadata,
  deleteItem,
  itemExists,
  isConnected,
  ensureFolderPath,
  notConnectedError,
  _encodePath: encodePath,
};
