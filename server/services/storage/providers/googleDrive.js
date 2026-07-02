// server/services/storage/providers/googleDrive.js
//
// Provider de stockage Google Drive PAR UTILISATEUR (A3). Symétrique d'onedrive :
// aucun Drive « cabinet » central, chaque document vit dans le Drive personnel de
// son propriétaire. Le lien document → propriétaire est porté par le storageKey :
//     googledrive:<ownerUserId>:<fileId>
//
// Confidentialité : scope `drive.file` → l'app ne voit que les fichiers qu'elle a
// créés. Les fichiers étant privés, il n'existe PAS d'URL de téléchargement
// pré-authentifiée (contrairement à OneDrive) : getDownloadUrl signale
// SIGNED_URL_UNSUPPORTED et la route de téléchargement bascule en streaming.

const crypto = require('crypto');
const sanitizeFilename = require('sanitize-filename');
const gdrive = require('../googleDriveClient');
const StoredDocument = require('../../../models/Storage/StoredDocument');

function safeSegment(value, fallback) {
  const raw = String(value || fallback || '').trim();
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
  return safe || fallback;
}

function safeFilename(name) {
  const clean = sanitizeFilename(String(name || 'document')).replace(/^\.+/, '').trim();
  return clean || 'document';
}

function createVersionId() {
  return crypto.randomUUID();
}

// Nom lisible du fichier dans le Drive de l'utilisateur (préfixé de l'id de
// version pour rester unique et évitable en cas de collision d'intitulés).
function buildDriveName({ documentId, versionId, filename }) {
  return `${safeSegment(documentId, 'doc')}__${safeSegment(versionId, 'v')}__${safeFilename(filename)}`;
}

function buildStorageKey(parts) {
  // Compat interface : renvoie le nom logique (utilisé à l'upload).
  return buildDriveName(parts);
}

function encodeKey(ownerUserId, fileId) {
  return `googledrive:${ownerUserId}:${fileId}`;
}

function parseKey(storageKey) {
  const s = String(storageKey || '');
  if (!s.startsWith('googledrive:')) {
    const err = new Error('storageKey Google Drive invalide.');
    err.statusCode = 400;
    err.code = 'INVALID_GOOGLEDRIVE_KEY';
    throw err;
  }
  const rest = s.slice('googledrive:'.length);
  const idx = rest.indexOf(':');
  if (idx <= 0) {
    const err = new Error('storageKey Google Drive malformé.');
    err.statusCode = 400;
    err.code = 'INVALID_GOOGLEDRIVE_KEY';
    throw err;
  }
  const ownerUserId = rest.slice(0, idx);
  const fileId = rest.slice(idx + 1);
  if (!ownerUserId || !fileId) {
    const err = new Error('storageKey Google Drive malformé.');
    err.statusCode = 400;
    err.code = 'INVALID_GOOGLEDRIVE_KEY';
    throw err;
  }
  return { ownerUserId, fileId };
}

async function uploadVersion({ documentId, versionId, filename, buffer, mime, ownerUserId }) {
  if (!ownerUserId) {
    const err = new Error("Propriétaire (ownerUserId) requis pour un upload Google Drive.");
    err.statusCode = 400;
    err.code = 'MISSING_OWNER_USER_ID';
    throw err;
  }
  if (!Buffer.isBuffer(buffer)) {
    const err = new Error('Buffer fichier manquant.');
    err.statusCode = 400;
    err.code = 'MISSING_FILE_BUFFER';
    throw err;
  }
  const name = buildDriveName({ documentId, versionId, filename });
  const result = await gdrive.uploadFile(ownerUserId, { name, buffer, mime });
  return {
    provider: 'google_drive',
    storageKey: encodeKey(ownerUserId, result.fileId),
    size: typeof result.size === 'number' ? result.size : buffer.length,
    mime: mime || 'application/octet-stream',
    filename: safeFilename(filename),
  };
}

async function downloadVersion({ storageKey }) {
  const { ownerUserId, fileId } = parseKey(storageKey);
  return gdrive.downloadFile(ownerUserId, fileId);
}

async function getDownloadUrl() {
  // Fichiers privés (drive.file) → pas d'URL anonyme. La route bascule en
  // streaming lorsqu'elle reçoit ce code.
  const err = new Error('Google Drive ne fournit pas d\'URL signée pour un fichier privé.');
  err.statusCode = 501;
  err.code = 'SIGNED_URL_UNSUPPORTED';
  throw err;
}

async function deleteVersion({ storageKey }) {
  const { ownerUserId, fileId } = parseKey(storageKey);
  return gdrive.deleteItem(ownerUserId, fileId);
}

async function exists({ storageKey }) {
  const { ownerUserId, fileId } = parseKey(storageKey);
  return gdrive.itemExists(ownerUserId, fileId);
}

async function listDocuments({ tenantId, matterId, includeDeleted = false }) {
  const query = { tenantId };
  if (matterId) query.dossierId = matterId;
  if (!includeDeleted) query.deletedAt = null;
  return StoredDocument.find(query).sort({ updatedAt: -1 }).lean();
}

module.exports = {
  name: 'google_drive',
  perUser: true,
  buildStorageKey,
  createVersionId,
  deleteVersion,
  downloadVersion,
  exists,
  getDownloadUrl,
  listDocuments,
  uploadVersion,
  _encodeKey: encodeKey,
  _parseKey: parseKey,
};
