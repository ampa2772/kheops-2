// server/services/storage/providers/sharepoint.js
//
// Provider de stockage SharePoint PAR UTILISATEUR (Volet B). Symetrique
// d'onedrive : aucun SharePoint « cabinet » central. Chaque document est ecrit
// dans le site/drive SharePoint que SON PROPRIETAIRE a choisi (User.sharePoint),
// via son propre jeton Microsoft.
//
// Le lien document -> (proprietaire, drive, item) est porte par le storageKey :
//     sharepoint:<ownerUserId>:<driveId>:<itemId>
// Le driveId y est encode pour que download/delete/exists restent auto-suffisants
// meme si l'utilisateur change ensuite de site SharePoint.
//
// Rangement LISIBLE (Volet A) : si matterLabel est fourni (ex. "Durand c- Petit
// — 202601"), le fichier est place dans Kheops2/Dossiers/<matterLabel>/<fichier>.

const crypto = require('crypto');
const sanitizeFilename = require('sanitize-filename');
const sharePoint = require('../sharePointClient');
const User = require('../../../models/App_Users/User');
const StoredDocument = require('../../../models/Storage/StoredDocument');

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

// Suffixe " (vN)" pour les versions >= 2 : chaque version = un fichier SharePoint
// DISTINCT (recupere par itemId) tout en gardant un nom lisible.
function versionedFilename(filename, ordinal) {
  const base = safeFilename(filename);
  if (!ordinal || ordinal <= 1) return base;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? `${base.slice(0, dot)} (v${ordinal})${base.slice(dot)}` : `${base} (v${ordinal})`;
}

// Chemin logique dans le drive SharePoint de l'utilisateur (utilise a l'upload).
function buildPath({ tenantId, matterId, documentId, versionId, filename, matterLabel, versionOrdinal }) {
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

// storageKey persiste = sharepoint:<ownerUserId>:<driveId>:<itemId>
function encodeKey(ownerUserId, driveId, itemId) {
  return `sharepoint:${ownerUserId}:${driveId}:${itemId}`;
}

function parseKey(storageKey) {
  const s = String(storageKey || '');
  if (!s.startsWith('sharepoint:')) {
    const err = new Error('storageKey SharePoint invalide.');
    err.statusCode = 400;
    err.code = 'INVALID_SHAREPOINT_KEY';
    throw err;
  }
  // Format : sharepoint:<ownerUserId>:<driveId>:<itemId>. ownerUserId et driveId
  // ne contiennent pas de ':' ; l'itemId peut en contenir -> on decoupe sur les
  // 3 premiers separateurs seulement.
  const rest = s.slice('sharepoint:'.length);
  const i1 = rest.indexOf(':');
  const i2 = i1 >= 0 ? rest.indexOf(':', i1 + 1) : -1;
  if (i1 <= 0 || i2 <= i1) {
    const err = new Error('storageKey SharePoint malforme.');
    err.statusCode = 400;
    err.code = 'INVALID_SHAREPOINT_KEY';
    throw err;
  }
  const ownerUserId = rest.slice(0, i1);
  const driveId = rest.slice(i1 + 1, i2);
  const itemId = rest.slice(i2 + 1);
  if (!ownerUserId || !driveId || !itemId) {
    const err = new Error('storageKey SharePoint malforme.');
    err.statusCode = 400;
    err.code = 'INVALID_SHAREPOINT_KEY';
    throw err;
  }
  return { ownerUserId, driveId, itemId };
}

// Resout le drive SharePoint cible du proprietaire (choix persiste en base).
async function resolveOwnerDriveId(ownerUserId) {
  const user = await User.findById(ownerUserId).select('sharePoint').lean();
  const driveId = user?.sharePoint?.enabled ? user.sharePoint.driveId : null;
  if (!driveId) {
    const err = new Error(
      "Aucun site SharePoint n'est configure pour cet utilisateur : selectionnez d'abord un site dans Parametres > Rangement.",
    );
    err.statusCode = 428;
    err.code = 'SHAREPOINT_SITE_NOT_SELECTED';
    throw err;
  }
  return driveId;
}

async function uploadVersion({ tenantId, matterId, documentId, versionId, filename, buffer, mime, ownerUserId, matterLabel, versionOrdinal, containerId, idempotencyKey }) {
  if (!ownerUserId) {
    const err = new Error('Proprietaire (ownerUserId) requis pour un upload SharePoint.');
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

  const driveId = containerId || await resolveOwnerDriveId(ownerUserId);
  const path = buildPath({ tenantId, matterId, documentId, versionId, filename, matterLabel, versionOrdinal });
  const result = await sharePoint.uploadFile(ownerUserId, driveId, { path, buffer, mime, ...(idempotencyKey ? {idempotencyKey} : {}) });

  return {
    provider: 'sharepoint',
    idempotent: Boolean(result.idempotent),
    storageKey: encodeKey(ownerUserId, driveId, result.itemId),
    size: typeof result.size === 'number' ? result.size : buffer.length,
    mime: mime || 'application/octet-stream',
    filename: safeFilename(filename),
  };
}

async function downloadVersion({ storageKey }) {
  const { ownerUserId, driveId, itemId } = parseKey(storageKey);
  return sharePoint.downloadFile(ownerUserId, driveId, itemId);
}

async function getDownloadUrl({ storageKey }) {
  const { ownerUserId, driveId, itemId } = parseKey(storageKey);
  return sharePoint.getDownloadUrl(ownerUserId, driveId, itemId);
}

async function deleteVersion({ storageKey }) {
  const { ownerUserId, driveId, itemId } = parseKey(storageKey);
  return sharePoint.deleteItem(ownerUserId, driveId, itemId);
}

async function exists({ storageKey }) {
  const { ownerUserId, driveId, itemId } = parseKey(storageKey);
  return sharePoint.itemExists(ownerUserId, driveId, itemId);
}

// Metadonnees : identiques a managed_gcs (elles vivent dans Mongo, pas SharePoint).
async function listDocuments({ tenantId, matterId, includeDeleted = false }) {
  const query = { tenantId };
  if (matterId) query.dossierId = matterId;
  if (!includeDeleted) query.deletedAt = null;
  return StoredDocument.find(query).sort({ updatedAt: -1 }).lean();
}

module.exports = {
  name: 'sharepoint',
  perUser: true,
  buildStorageKey: buildPath,
  createVersionId,
  deleteVersion,
  downloadVersion,
  exists,
  getDownloadUrl,
  listDocuments,
  uploadVersion,
  // exposes pour les tests
  _encodeKey: encodeKey,
  _parseKey: parseKey,
  _resolveOwnerDriveId: resolveOwnerDriveId,
};
