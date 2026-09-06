const crypto = require('crypto');
const mongoose = require('mongoose');
const DocumentHistory = require('../models/Storage/DocumentHistory');
const { getFileStorage } = require('./fileStorage');

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function safeSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function makeVersionId() {
  return `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

function checksumOf(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function isVersionConflict({
  baseVersionId,
  previousCurrent,
  latestChecksum = null,
  requireBaseVersion = false,
}) {
  if (!previousCurrent) return false;
  const normalizedBaseVersionId = baseVersionId ? String(baseVersionId) : null;
  if (!normalizedBaseVersionId) return Boolean(requireBaseVersion);
  if (normalizedBaseVersionId === String(previousCurrent)) return false;
  if (normalizedBaseVersionId.startsWith('sha256:') && latestChecksum) {
    return normalizedBaseVersionId.slice('sha256:'.length) !== String(latestChecksum);
  }
  return true;
}

function isDuplicateVersion({ latest, checksum, status, normalizedComment, structuredChecksum }) {
  return Boolean(
    latest
    && latest.checksum === checksum
    && latest.status === status
    && String(latest.comment || '') === String(normalizedComment || '')
    && String(latest.structuredChecksum || '') === String(structuredChecksum || '')
  );
}

function historyStorageKey(tenantId, documentId, versionId, filename = '') {
  const ext = /\.pdf$/i.test(filename)
    ? '.pdf'
    : /\.json$/i.test(filename)
      ? '.json'
      : /\.txt$/i.test(filename)
        ? '.txt'
        : '.docx';
  return `document-history/${safeSegment(tenantId)}/${safeSegment(documentId)}/${safeSegment(versionId)}${ext}`;
}

function structuredStorageKey(tenantId, documentId, versionId) {
  return `document-history/${safeSegment(tenantId)}/${safeSegment(documentId)}/${safeSegment(versionId)}.structured.json`;
}

async function saveVersion({
  tenantId,
  dossierId,
  documentId,
  userId,
  buffer,
  filename,
  mime = DOCX_MIME,
  editor = 'system',
  origin = 'kheops',
  comment = '',
  status = 'draft',
  baseVersionId = null,
  requireBaseVersion = false,
  structuredDocument = null,
  restoredFromVersionId = null,
  operationKey = null,
  _attempt = 0,
}) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('buffer documentaire requis.');
  const ids = { tenantId, dossierId, documentId, userId };
  for (const [name, value] of Object.entries(ids)) {
    if (!value || !mongoose.Types.ObjectId.isValid(String(value))) {
      const err = new Error(`${name} invalide.`);
      err.statusCode = 400;
      throw err;
    }
  }

  let history = await DocumentHistory.findOne({ tenantId, documentId });
  const normalizedOperationKey = operationKey ? String(operationKey).slice(0, 180) : null;
  if (normalizedOperationKey && history) {
    const completed = history.versions.find((version) => String(version.operationKey || '') === normalizedOperationKey);
    if (completed) return { history, version: completed, deduplicated: true,
      conflict: completed.status === 'conflict' || Boolean(completed.conflictWithVersionId), idempotent: true };
  }
  const previousCurrent = history?.currentVersionId || null;
  const latest = history?.versions?.find((v) => String(v.versionId) === String(previousCurrent));
  // Les synchronisations du compagnon utilisent une précondition obligatoire.
  // Une ancienne session sans base connue ne doit jamais remplacer la version
  // courante en silence : son contenu est conservé comme version conflictuelle.
  const conflict = isVersionConflict({
    baseVersionId,
    previousCurrent,
    latestChecksum: latest?.checksum,
    requireBaseVersion,
  });
  const versionId = makeVersionId();
  const storageKey = historyStorageKey(tenantId, documentId, versionId, filename);
  const checksum = checksumOf(buffer);
  const normalizedComment = String(comment || '').slice(0, 1000);
  const structuredBuffer = structuredDocument
    ? Buffer.from(JSON.stringify(structuredDocument), 'utf8')
    : null;
  const structuredChecksum = structuredBuffer ? checksumOf(structuredBuffer) : null;
  const structuredKey = structuredBuffer
    ? structuredStorageKey(tenantId, documentId, versionId)
    : null;

  // Un autosave identique ne fabrique pas une succession de doublons.
  // Une réponse HTTP peut se perdre après l'enregistrement. Le compagnon
  // renverra alors exactement le même fichier avec son ancienne baseVersionId.
  // Dédupliquer AVANT de matérialiser le conflit rend ce retry idempotent sans
  // masquer de vraie divergence : octets et métadonnées doivent être identiques.
  if (isDuplicateVersion({
    latest,
    checksum,
    status,
    normalizedComment,
    structuredChecksum,
  })) {
    return { history, version: latest, deduplicated: true, conflict: false };
  }

  await getFileStorage().save(storageKey, buffer, { contentType: mime });
  if (structuredBuffer) {
    try {
      await getFileStorage().save(structuredKey, structuredBuffer, { contentType: 'application/json' });
    } catch (err) {
      try { await getFileStorage().delete(storageKey); } catch (_) {}
      throw err;
    }
  }
  const version = {
    versionId,
    storageKey,
    checksum,
    size: buffer.length,
    mime,
    filename: filename || `${documentId}.docx`,
    createdAt: new Date(),
    createdBy: userId,
    editor,
    origin,
    comment: normalizedComment,
    status: conflict ? 'conflict' : status,
    baseVersionId: baseVersionId || previousCurrent,
    conflictWithVersionId: conflict ? previousCurrent : null,
    structuredStorageKey: structuredKey,
    structuredChecksum,
    structuredDocument: null,
    restoredFromVersionId: restoredFromVersionId ? String(restoredFromVersionId) : null,
    operationKey: normalizedOperationKey,
    // The outbox flag commits atomically with the immutable history version.
    // A process crash cannot lose the registration/verification work.
    syncProjectionPending: true,
  };

  if (!history) {
    history = new DocumentHistory({
      tenantId,
      dossierId,
      documentId,
      originalVersionId: versionId,
      currentVersionId: versionId,
      versions: [version],
    });
  } else {
    history.versions.push(version);
    // Une version concurrente est conservée, mais ne remplace jamais silencieusement
    // la version principale. L'utilisateur pourra la promouvoir explicitement.
    if (!conflict) history.currentVersionId = versionId;
  }

  try {
    await history.save();
  } catch (err) {
    // A lost Mongo acknowledgement is not evidence that the write failed.
    // Read the committed version first; uncertainty keeps the blob intact.
    let observed;
    try { observed=await DocumentHistory.findOne({tenantId,documentId}); } catch(_) {}
    const committed=observed?.versions?.find(row=>String(row.versionId)===versionId);
    if(committed) return {history:observed,version:committed,deduplicated:true,idempotent:true,
      conflict:committed.status==='conflict'||Boolean(committed.conflictWithVersionId)};
    if(observed!==undefined && (err?.name==='VersionError' || err?.name==='ValidationError' || err?.code===11000)) {
      try { await getFileStorage().delete(storageKey); } catch (_) {}
      if (structuredKey) {
        try { await getFileStorage().delete(structuredKey); } catch (_) {}
      }
    }
    if (_attempt < 2 && (err?.name === 'VersionError' || err?.code === 11000)) {
      return saveVersion({
        tenantId, dossierId, documentId, userId, buffer, filename, mime,
        editor, origin, comment, status, baseVersionId, requireBaseVersion, structuredDocument,
        restoredFromVersionId, operationKey: normalizedOperationKey,
        _attempt: _attempt + 1,
      });
    }
    throw err;
  }
  return { history, version, deduplicated: false, conflict };
}

async function readVersion(history, versionId) {
  const selected = history?.versions?.find((v) => String(v.versionId) === String(versionId || history.currentVersionId));
  if (!selected) return null;
  return { version: selected, buffer: await getFileStorage().read(selected.storageKey) };
}

async function readStructuredVersion(history, versionId) {
  const selected = history?.versions?.find((version) => String(version.versionId) === String(versionId || history.currentVersionId));
  if (!selected) return null;
  if (selected.structuredDocument) return selected.structuredDocument;
  if (!selected.structuredStorageKey) return null;
  try {
    const buffer = await getFileStorage().read(selected.structuredStorageKey);
    return JSON.parse(buffer.toString('utf8'));
  } catch (_error) {
    return null;
  }
}

async function restoreVersion({ history, versionId, userId, operationKey = null, comment = '' }) {
  const selected = history?.versions?.find((version) => String(version.versionId) === String(versionId));
  if (!selected) return null;
  const normalizedOperationKey = operationKey ? String(operationKey).slice(0, 180) : null;
  if (normalizedOperationKey) {
    const completed = history.versions.find((version) => String(version.operationKey || '') === normalizedOperationKey);
    if (completed) return { history, version: completed, deduplicated: true, idempotent: true };
  }
  const [file, structuredDocument] = await Promise.all([
    readVersion(history, selected.versionId),
    readStructuredVersion(history, selected.versionId),
  ]);
  if (!file) return null;
  const humanComment = String(comment || `Restaurée depuis la version ${selected.versionId}`).slice(0, 1000);
  return saveVersion({
    tenantId: history.tenantId,
    dossierId: history.dossierId,
    documentId: history.documentId,
    userId,
    buffer: file.buffer,
    filename: selected.filename,
    mime: selected.mime,
    editor: 'kheops',
    origin: 'restore',
    comment: humanComment,
    // Une restauration doit repasser par la relecture : elle ne réutilise
    // jamais automatiquement un ancien statut validé ou signé.
    status: 'draft',
    baseVersionId: history.currentVersionId,
    requireBaseVersion: true,
    structuredDocument,
    restoredFromVersionId: selected.versionId,
    operationKey: normalizedOperationKey,
  });
}

async function promoteVersion({ history, versionId }) {
  const selected = history.versions.find((v) => String(v.versionId) === String(versionId));
  if (!selected) return null;
  history.currentVersionId = selected.versionId;
  if (selected.status === 'conflict') selected.status = 'draft';
  selected.conflictWithVersionId = null;
  selected.syncProjectionPending = true;
  await history.save();
  return selected;
}

function toClient(history) {
  if (!history) return null;
  return {
    id: String(history._id),
    documentId: String(history.documentId),
    dossierId: String(history.dossierId),
    originalVersionId: history.originalVersionId,
    currentVersionId: history.currentVersionId,
    registryPending: history.versions.some(version=>version.syncProjectionPending===true),
    registryError: history.syncProjectionError || '',
    versions: history.versions.map((v) => ({
      versionId: v.versionId,
      size: v.size,
      mime: v.mime,
      filename: v.filename,
      createdAt: v.createdAt,
      createdBy: String(v.createdBy),
      editor: v.editor,
      origin: v.origin,
      comment: v.comment,
      status: v.status,
      baseVersionId: v.baseVersionId,
      conflictWithVersionId: v.conflictWithVersionId,
      hasStructuredDocument: Boolean(v.structuredStorageKey || v.structuredDocument),
      restoredFromVersionId: v.restoredFromVersionId || null,
      operationKey: v.operationKey || null,
    })),
  };
}

module.exports = {
  DOCX_MIME,
  saveVersion,
  readVersion,
  readStructuredVersion,
  restoreVersion,
  promoteVersion,
  toClient,
  historyStorageKey,
  checksumOf,
  isVersionConflict,
  isDuplicateVersion,
  structuredStorageKey,
};
