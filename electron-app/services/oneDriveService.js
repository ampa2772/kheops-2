// electron-app/services/oneDriveService.js
//
// Service OneDrive (Microsoft Graph) — équivalent de googleDriveService.js pour
// les utilisateurs connectés via Microsoft. Expose la même API publique
// (ensureFolder, listChildren, uploadFile, downloadFile, etc.) afin que
// localFileWatcher puisse utiliser indifféremment l'un ou l'autre service.
//
// Auth : init(getAccessTokenFn) — getAccessTokenFn doit retourner un access
// token Microsoft Graph valide (refresh à la demande). Implémenté par
// microsoftAuthService.getServerAccessToken.
//
// Endpoint racine OneDrive : /me/drive
//   - "root"     → drive racine de l'utilisateur
//   - {item-id}  → identifiant interne d'un fichier ou dossier

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const { app } = require('electron');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

let getAccessTokenFn = null;
const folderIdCache = new Map(); // "parentId:name" -> itemId

function init(tokenProvider) {
  if (typeof tokenProvider !== 'function') {
    throw new Error("oneDriveService.init : tokenProvider doit être une fonction qui retourne un access token.");
  }
  getAccessTokenFn = tokenProvider;
  folderIdCache.clear();
  console.log('[OneDrive] Service initialisé.');
}

function ensureInitialized() {
  if (!getAccessTokenFn) {
    throw new Error("Le service OneDrive n'est pas initialisé. Authentification Microsoft requise.");
  }
}

async function _request(method, urlPath, { params, data, headers, responseType } = {}) {
  ensureInitialized();
  const token = await getAccessTokenFn();
  const url = urlPath.startsWith('http') ? urlPath : `${GRAPH_BASE}${urlPath}`;
  return axios({
    method,
    url,
    params,
    data,
    headers: { Authorization: `Bearer ${token}`, ...(headers || {}) },
    responseType,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 60000,
    validateStatus: (s) => s >= 200 && s < 300,
  });
}

function _parentRef(parentId) {
  // OneDrive : "root" est un alias spécial. Pour un id concret, on utilise /items/{id}
  return parentId === 'root' || !parentId ? '/me/drive/root' : `/me/drive/items/${parentId}`;
}

// ── Recherche d'un item par nom dans un parent ──────────────────────────────
async function findItemByNameAndParent(name, parentId = 'root', isFolder = false) {
  ensureInitialized();
  try {
    // Endpoint "by path" : /me/drive/items/{parent}:/{name}
    const ref = _parentRef(parentId);
    const encName = encodeURIComponent(name);
    const url = parentId === 'root' || !parentId
      ? `${ref}:/${encName}`
      : `${ref}:/${encName}`;
    const res = await _request('get', url);
    const item = res.data;
    if (isFolder && !item.folder) return null;
    return { id: item.id, name: item.name, mimeType: item.folder ? 'application/vnd.ms-onedrive.folder' : (item.file?.mimeType || 'application/octet-stream') };
  } catch (err) {
    if (err.response && err.response.status === 404) return null;
    throw err;
  }
}

// ── Crée (si besoin) un dossier et retourne son id ──────────────────────────
async function ensureFolder(name, parentId = 'root') {
  const cacheKey = `${parentId}:${name}`;
  if (folderIdCache.has(cacheKey)) return folderIdCache.get(cacheKey);

  let folder = await findItemByNameAndParent(name, parentId, true);
  if (!folder) {
    console.log(`[OneDrive] Création du dossier '${name}' (parent=${parentId})...`);
    const res = await _request('post', `${_parentRef(parentId)}/children`, {
      data: { name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' },
      headers: { 'Content-Type': 'application/json' },
    });
    folder = { id: res.data.id, name: res.data.name };
    console.log(`[OneDrive] Dossier '${name}' créé. ID=${folder.id}`);
  }
  folderIdCache.set(cacheKey, folder.id);
  return folder.id;
}

// ── Liste tous les enfants d'un dossier (avec pagination) ───────────────────
async function listChildren(parentId, _includeFields = null) {
  ensureInitialized();
  const all = [];
  let url = `${GRAPH_BASE}${_parentRef(parentId)}/children?$top=200`;
  while (url) {
    const res = await _request('get', url);
    for (const item of (res.data.value || [])) {
      all.push({
        id: item.id,
        name: item.name,
        mimeType: item.folder ? 'application/vnd.ms-onedrive.folder' : (item.file?.mimeType || 'application/octet-stream'),
        modifiedTime: item.lastModifiedDateTime,
        size: item.size,
        // Marqueur compatible googleDriveService (pour que pullFromDrive filtre les dossiers)
        isFolder: !!item.folder,
      });
    }
    url = res.data['@odata.nextLink'] || null;
  }
  return all;
}

// ── Upload (Buffer / Stream / chemin local) ─────────────────────────────────
async function uploadFile(fileName, mimeType, fileContent, parentFolderId) {
  ensureInitialized();
  if (!parentFolderId) throw new Error("parentFolderId est requis pour l'upload OneDrive.");

  // Convertir l'input en Buffer (on tolère < 4 Mo via simple PUT ; au-delà, upload session)
  let buffer;
  if (Buffer.isBuffer(fileContent)) {
    buffer = fileContent;
  } else if (fileContent instanceof stream.Readable) {
    const chunks = [];
    for await (const chunk of fileContent) chunks.push(chunk);
    buffer = Buffer.concat(chunks);
  } else if (typeof fileContent === 'string') {
    if (!fs.existsSync(fileContent)) throw new Error(`Fichier local non trouvé : ${fileContent}`);
    buffer = fs.readFileSync(fileContent);
  } else {
    throw new Error('fileContent doit être Buffer, Readable Stream ou chemin de fichier.');
  }

  const encName = encodeURIComponent(fileName);
  const ref = _parentRef(parentFolderId);
  const SMALL_LIMIT = 4 * 1024 * 1024; // Microsoft : simple PUT limité à 4 MiB

  if (buffer.length <= SMALL_LIMIT) {
    // Upload simple (PUT direct) avec replace en cas d'existant
    console.log(`[OneDrive] Upload simple de '${fileName}' (${buffer.length} octets) → parent=${parentFolderId}`);
    const url = `${ref}:/${encName}:/content?@microsoft.graph.conflictBehavior=replace`;
    const res = await _request('put', url, {
      data: buffer,
      headers: { 'Content-Type': mimeType || 'application/octet-stream' },
    });
    console.log(`[OneDrive] Fichier uploadé. ID=${res.data.id}`);
    return { id: res.data.id, name: res.data.name };
  }

  // Upload session (>4 MiB) — par chunks de 5 MiB
  console.log(`[OneDrive] Upload session pour '${fileName}' (${buffer.length} octets)...`);
  const sessionRes = await _request('post', `${ref}:/${encName}:/createUploadSession`, {
    data: { item: { '@microsoft.graph.conflictBehavior': 'replace', name: fileName } },
    headers: { 'Content-Type': 'application/json' },
  });
  const uploadUrl = sessionRes.data.uploadUrl;
  const CHUNK = 5 * 1024 * 1024;
  let offset = 0;
  let lastResp = null;
  while (offset < buffer.length) {
    const end = Math.min(offset + CHUNK, buffer.length);
    const chunk = buffer.slice(offset, end);
    lastResp = await axios.put(uploadUrl, chunk, {
      headers: {
        'Content-Length': chunk.length,
        'Content-Range': `bytes ${offset}-${end - 1}/${buffer.length}`,
      },
      maxBodyLength: Infinity, maxContentLength: Infinity,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    offset = end;
  }
  console.log(`[OneDrive] Upload session terminé. ID=${lastResp?.data?.id}`);
  return { id: lastResp?.data?.id, name: lastResp?.data?.name || fileName };
}

// ── Télécharge un item vers un chemin local ─────────────────────────────────
async function downloadFile(itemId, destinationPath) {
  ensureInitialized();
  console.log(`[OneDrive] Téléchargement ${itemId} → ${destinationPath}`);
  const res = await _request('get', `/me/drive/items/${itemId}/content`, { responseType: 'stream' });
  return new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(destinationPath);
    let resolved = false;
    const cleanup = (err) => { if (resolved) return; resolved = true; dest.end(); reject(err); };
    dest.on('finish', () => {
      if (resolved) return;
      resolved = true;
      const stats = fs.statSync(destinationPath);
      console.log(`[OneDrive] Fichier écrit : ${destinationPath} (${stats.size} octets)`);
      if (stats.size === 0) reject(new Error(`Fichier téléchargé vide : ${destinationPath}`));
      else resolve(destinationPath);
    });
    dest.on('error', cleanup);
    res.data.on('error', cleanup).pipe(dest);
  });
}

// ── Suppression ─────────────────────────────────────────────────────────────
async function deleteFileOrFolder(itemId) {
  ensureInitialized();
  console.log(`[OneDrive] Suppression ${itemId}`);
  try {
    await _request('delete', `/me/drive/items/${itemId}`);
    invalidateCacheEntriesByValue(itemId);
  } catch (err) {
    if (err.response?.status === 404) {
      invalidateCacheEntriesByValue(itemId);
      return;
    }
    throw err;
  }
}

// ── Renommage ───────────────────────────────────────────────────────────────
async function renameItem(itemId, newName) {
  ensureInitialized();
  console.log(`[OneDrive] Renommage ${itemId} → '${newName}'`);
  const res = await _request('patch', `/me/drive/items/${itemId}`, {
    data: { name: newName },
    headers: { 'Content-Type': 'application/json' },
  });
  invalidateCacheEntriesByValue(itemId);
  return { id: res.data.id, name: res.data.name };
}

// ── Métadonnées d'un item ───────────────────────────────────────────────────
async function getFileMetadata(itemId) {
  ensureInitialized();
  const res = await _request('get', `/me/drive/items/${itemId}`);
  const item = res.data;
  return {
    id: item.id, name: item.name,
    mimeType: item.folder ? 'application/vnd.ms-onedrive.folder' : (item.file?.mimeType || 'application/octet-stream'),
    modifiedTime: item.lastModifiedDateTime, size: item.size,
  };
}

// ── Cache invalidation ──────────────────────────────────────────────────────
function invalidateCacheEntriesByValue(itemId) {
  for (const [k, v] of folderIdCache.entries()) {
    if (v === itemId) folderIdCache.delete(k);
  }
}
function invalidateCacheEntry(parentId, name) { folderIdCache.delete(`${parentId}:${name}`); }
function clearFolderCache() { folderIdCache.clear(); }

// ── Templates par défaut (mirror de googleDriveService) ─────────────────────
async function ensureDefaultTemplateDocuments(templateFolderId) {
  ensureInitialized();
  if (!templateFolderId) return;

  const TEMPLATE_FILES = [
    'Courrier.docx', 'Assignation.docx', 'Conclusion.docx', 'Mise_en_Demeure.docx',
    'Requete.docx', 'Conclusions_Recapitulatives.docx', 'Protocole_Accord_Transactionnel.docx',
    'Sommation_Interpellative.docx', 'Note_en_Delibere.docx', 'Declaration_Appel.docx',
    'Dire_et_Observations.docx', 'Conclusions_Incident.docx', 'Requete_Saisie.docx',
  ];
  const isPackaged = app && app.isPackaged;
  const localTemplatesDir = isPackaged
    ? path.join(process.resourcesPath, 'templates')
    : path.join(__dirname, '..', 'templates');

  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  for (const tplName of TEMPLATE_FILES) {
    const localFile = path.join(localTemplatesDir, tplName);
    if (!fs.existsSync(localFile)) {
      console.warn(`[OneDrive] Template local introuvable : '${localFile}'. Ignoré.`);
      continue;
    }
    try {
      console.log(`[OneDrive] Upload template '${tplName}' vers OneDrive...`);
      await uploadFile(tplName, DOCX_MIME, localFile, templateFolderId);
    } catch (e) {
      console.error(`[OneDrive] Échec upload template '${tplName}':`, e.message);
    }
  }
}

async function ensureBaseStructure() {
  console.log('[OneDrive] Vérification / création de la structure de base...');
  const filesClientsId = await ensureFolder('Files_Clients', 'root');
  console.log(`[OneDrive] Files_Clients ID: ${filesClientsId}`);
  const templatesId = await ensureFolder('Templates', filesClientsId);
  console.log(`[OneDrive] Templates ID: ${templatesId}`);
  await ensureDefaultTemplateDocuments(templatesId);
  console.log('[OneDrive] Structure de base OK.');
  return { filesClientsId, templatesId };
}

// resolvePathToId — utilisé éventuellement, mirror Google
async function resolvePathToId(remotePath) {
  ensureInitialized();
  if (!remotePath || remotePath === '/' || remotePath === '.') return 'root';
  const parts = remotePath.split('/').filter(p => p && p !== '.');
  let currentParent = 'root';
  for (const part of parts) {
    const item = await findItemByNameAndParent(part, currentParent, false);
    if (!item) {
      console.warn(`[OneDrive] Chemin introuvable : '${part}' dans ${remotePath}`);
      return null;
    }
    currentParent = item.id;
  }
  return currentParent;
}

/**
 * Réinitialise complètement le service OneDrive : token provider, cache folder.
 * À appeler au logout Microsoft pour s'assurer qu'aucune donnée du user
 * précédent ne fuit vers le user suivant (confidentialité multi-user sur PC).
 */
function reset() {
  getAccessTokenFn = null;
  folderIdCache.clear();
  console.log('[OneDrive] Service réinitialisé (logout).');
}

module.exports = {
  init,
  reset,
  ensureFolder,
  ensureBaseStructure,
  resolvePathToId,
  listChildren,
  getFileMetadata,
  uploadFile,
  downloadFile,
  deleteFileOrFolder,
  renameItem,
  findItemByNameAndParent,
  invalidateCacheEntry,
  invalidateCacheEntriesByValue,
  clearFolderCache,
};
