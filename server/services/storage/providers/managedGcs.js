const crypto = require('crypto');
const sanitizeFilename = require('sanitize-filename');
const { getFileStorage } = require('../../fileStorage');
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

function buildStorageKey({ tenantId, matterId, documentId, versionId, filename }) {
  return [
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

async function uploadVersion({ tenantId, matterId, documentId, versionId, filename, buffer, mime }) {
  if (!Buffer.isBuffer(buffer)) {
    const err = new Error('Buffer fichier manquant.');
    err.statusCode = 400;
    err.code = 'MISSING_FILE_BUFFER';
    throw err;
  }

  const storageKey = buildStorageKey({
    tenantId,
    matterId,
    documentId,
    versionId,
    filename,
  });
  const storage = getFileStorage();
  await storage.save(storageKey, buffer, {
    contentType: mime || 'application/octet-stream',
  });

  return {
    provider: 'managed_gcs',
    storageKey,
    size: buffer.length,
    mime: mime || 'application/octet-stream',
    filename: safeFilename(filename),
  };
}

async function downloadVersion({ storageKey }) {
  return getFileStorage().read(storageKey);
}

async function getDownloadUrl({ storageKey, expiresInSec = 900 }) {
  return getFileStorage().getSignedUrl(storageKey, {
    expiresInSec,
    action: 'read',
  });
}

async function deleteVersion({ storageKey }) {
  return getFileStorage().delete(storageKey);
}

async function exists({ storageKey }) {
  return getFileStorage().exists(storageKey);
}

async function listDocuments({ tenantId, matterId, includeDeleted = false }) {
  const query = { tenantId };
  if (matterId) query.dossierId = matterId;
  if (!includeDeleted) query.deletedAt = null;
  return StoredDocument.find(query).sort({ updatedAt: -1 }).lean();
}

module.exports = {
  name: 'managed_gcs',
  buildStorageKey,
  createVersionId,
  deleteVersion,
  downloadVersion,
  exists,
  getDownloadUrl,
  listDocuments,
  uploadVersion,
};
