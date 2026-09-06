// server/services/storage/providers/onedrive.js
//
// Provider de stockage OneDrive PAR UTILISATEUR (A3). Aucun OneDrive « cabinet »
// central : chaque document est écrit dans le OneDrive personnel de son
// propriétaire (l'utilisateur qui l'a créé), via son propre jeton Microsoft.
//
// Le lien document → propriétaire est porté par le storageKey, au format :
//     onedrive:<ownerUserId>:<driveItemId>
// Ainsi download/delete/exists sont auto-suffisants : ils retrouvent le drive
// cible à partir du seul storageKey persisté dans StoredDocument.
//
// Les métadonnées (versions, dossiers, quota) restent en base Mongo comme pour
// managed_gcs — seul l'OCTET physique vit dans le OneDrive de l'utilisateur.

const crypto = require('crypto');
const sanitizeFilename = require('sanitize-filename');
const oneDrive = require('../oneDriveClient');
const StoredDocument = require('../../../models/Storage/StoredDocument');

// Dossier racine applicatif dans le OneDrive de l'utilisateur.
const ROOT_FOLDER = 'Kheops2';

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

// Ajoute un suffixe " (vN)" au nom de fichier pour les versions >= 2, afin que
// chaque version reste un fichier OneDrive DISTINCT (l'appli recupere par itemId,
// donc toutes les versions restent telechargeables) tout en gardant un nom lisible.
function versionedFilename(filename, ordinal) {
  const base = safeFilename(filename);
  if (!ordinal || ordinal <= 1) return base;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? `${base.slice(0, dot)} (v${ordinal})${base.slice(dot)}` : `${base} (v${ordinal})`;
}

// Chemin logique dans le OneDrive de l'utilisateur (utilisé à l'upload).
// Volet A : si matterLabel est fourni (nom de dossier lisible + reference, ex.
// "Durand c- Petit — 202601"), on range le fichier dans un dossier au VRAI NOM :
//   Kheops2/Dossiers/<matterLabel>/<fichier>
// Sinon on retombe sur l'ancien schema base sur les IDs (compat / robustesse).
function buildStorageKey({ tenantId, matterId, documentId, versionId, filename, matterLabel, versionOrdinal }) {
  if (matterLabel) {
    return [ROOT_FOLDER, 'Dossiers', String(matterLabel), versionedFilename(filename, versionOrdinal)].join('/');
  }
  return [
    ROOT_FOLDER,
    'tenants',
    safeSegment(tenantId, 'unknown-tenant'),
    'matters',
    safeSegment(matterId, 'unassigned'),
    'documents',
    safeSegment(documentId, 'document'),
    'versions',
    safeSegment(versionId, 'version'),
    safeFilename(filename),
  ].join('/');
}

// storageKey persisté = onedrive:<ownerUserId>:<itemId>
function encodeKey(ownerUserId, itemId, driveId) {
  if (driveId) return `onedrive-v2:${ownerUserId}:${driveId}:${itemId}`;
  return `onedrive:${ownerUserId}:${itemId}`;
}

function parseKey(storageKey) {
  const s = String(storageKey || '');
  if (s.startsWith('onedrive-v2:')) {
    const [, ownerUserId, driveId, ...itemParts] = s.split(':');
    const itemId = itemParts.join(':');
    if (!ownerUserId || !driveId || !itemId) throw Object.assign(new Error('Référence OneDrive incomplète.'), {statusCode:400,code:'INVALID_ONEDRIVE_KEY'});
    return {ownerUserId, driveId, itemId};
  }
  if (!s.startsWith('onedrive:')) {
    const err = new Error('storageKey OneDrive invalide.');
    err.statusCode = 400;
    err.code = 'INVALID_ONEDRIVE_KEY';
    throw err;
  }
  // Format : onedrive:<ownerUserId>:<itemId>. L'itemId peut théoriquement
  // contenir des ':' → on ne découpe que sur les 2 premiers séparateurs.
  const rest = s.slice('onedrive:'.length);
  const idx = rest.indexOf(':');
  if (idx <= 0) {
    const err = new Error('storageKey OneDrive malformé.');
    err.statusCode = 400;
    err.code = 'INVALID_ONEDRIVE_KEY';
    throw err;
  }
  const ownerUserId = rest.slice(0, idx);
  const itemId = rest.slice(idx + 1);
  if (!ownerUserId || !itemId) {
    const err = new Error('storageKey OneDrive malformé.');
    err.statusCode = 400;
    err.code = 'INVALID_ONEDRIVE_KEY';
    throw err;
  }
  return { ownerUserId, itemId };
}

async function uploadVersion({ tenantId, matterId, documentId, versionId, filename, buffer, mime, ownerUserId, matterLabel, versionOrdinal, containerId, idempotencyKey }) {
  if (!ownerUserId) {
    // Sans propriétaire identifié, on ne sait pas dans quel OneDrive écrire.
    const err = new Error("Propriétaire (ownerUserId) requis pour un upload OneDrive.");
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

  const path = buildStorageKey({ tenantId, matterId, documentId, versionId, filename, matterLabel, versionOrdinal });
  const result = await oneDrive.uploadFile(ownerUserId, { path, buffer, mime,
    ...(containerId ? {driveId:containerId} : {}), ...(idempotencyKey ? {idempotencyKey} : {}),
  });

  return {
    provider: 'onedrive',
    storageKey: encodeKey(ownerUserId, result.itemId, containerId),
    idempotent: Boolean(result.idempotent),
    size: typeof result.size === 'number' ? result.size : buffer.length,
    mime: mime || 'application/octet-stream',
    filename: safeFilename(filename),
  };
}

async function downloadVersion({ storageKey }) {
  const { ownerUserId, itemId, driveId } = parseKey(storageKey);
  return oneDrive.downloadFile(ownerUserId, itemId, ...(driveId ? [driveId] : []));
}

async function getDownloadUrl({ storageKey }) {
  const { ownerUserId, itemId, driveId } = parseKey(storageKey);
  return oneDrive.getDownloadUrl(ownerUserId, itemId, ...(driveId ? [driveId] : []));
}

async function deleteVersion({ storageKey }) {
  const { ownerUserId, itemId, driveId } = parseKey(storageKey);
  return oneDrive.deleteItem(ownerUserId, itemId, ...(driveId ? [driveId] : []));
}

async function exists({ storageKey }) {
  const { ownerUserId, itemId, driveId } = parseKey(storageKey);
  return oneDrive.itemExists(ownerUserId, itemId, ...(driveId ? [driveId] : []));
}

// Métadonnées : identiques à managed_gcs (elles vivent dans Mongo, pas OneDrive).
async function listDocuments({ tenantId, matterId, includeDeleted = false }) {
  const query = { tenantId };
  if (matterId) query.dossierId = matterId;
  if (!includeDeleted) query.deletedAt = null;
  return StoredDocument.find(query).sort({ updatedAt: -1 }).lean();
}

module.exports = {
  name: 'onedrive',
  perUser: true,
  buildStorageKey,
  createVersionId,
  deleteVersion,
  downloadVersion,
  exists,
  getDownloadUrl,
  listDocuments,
  uploadVersion,
  // exposés pour les tests
  _encodeKey: encodeKey,
  _parseKey: parseKey,
};
