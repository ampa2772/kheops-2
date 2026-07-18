const crypto = require('crypto');
const mongoose = require('mongoose');
const LogicalDocument = require('../../models/Documents/LogicalDocument');
const DocumentVersion = require('../../models/Documents/DocumentVersion');
const DocumentCopy = require('../../models/Documents/DocumentCopy');
const DocumentLocation = require('../../models/Documents/DocumentLocation');
const syncService = require('./documentSyncService');
const storageService = require('../storage');

const DEFAULT_LEASE_MS = 5 * 60 * 1000;

function objectId(value, label) {
  if (!mongoose.Types.ObjectId.isValid(String(value || ''))) {
    throw Object.assign(new Error(`${label} invalide.`), { statusCode: 400, code: 'INVALID_ID' });
  }
  return new mongoose.Types.ObjectId(String(value));
}

function checksum(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function conflict(kind, note, details = {}) {
  return Object.assign(new Error(note), {
    statusCode: 409,
    code: 'SYNC_CONTENT_CONFLICT',
    conflictKind: kind,
    conflictDetails: details,
  });
}

function retryable(error) {
  if (error?.retryable === true) return true;
  if (Number(error?.statusCode) >= 500) return true;
  return ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'ECONNREFUSED'].includes(error?.code);
}

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (Buffer.isBuffer(value?.buffer)) return value.buffer;
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw Object.assign(new Error('Le fournisseur source n’a pas renvoyé un contenu binaire.'), {
    statusCode: 502,
    code: 'SYNC_SOURCE_CONTENT_INVALID',
    retryable: true,
  });
}

function makeDocumentSyncWorker({
  Logical = LogicalDocument,
  Version = DocumentVersion,
  Copy = DocumentCopy,
  Location = DocumentLocation,
  sync = syncService,
  storage = storageService,
  now = () => new Date(),
} = {}) {
  async function loadScope(operation, tenantId) {
    const tenant = objectId(tenantId, 'tenantId');
    const logical = await Logical.findOne({ _id: operation.logicalDocumentId, tenantId: tenant }).lean();
    if (!logical) throw Object.assign(new Error('Document logique introuvable.'), { statusCode: 404, code: 'LOGICAL_DOCUMENT_NOT_FOUND' });
    if (operation.direction === 'delete_external') {
      throw conflict('policy_blocked', 'La suppression externe automatique est désactivée : aucune donnée ne sera détruite.');
    }

    const sourceVersionId = operation.source?.versionId || logical.currentVersionId;
    const sourceVersion = sourceVersionId
      ? await Version.findOne({ tenantId: tenant, logicalDocumentId: logical._id, versionId: sourceVersionId }).lean()
      : null;
    const sourceCopy = operation.source?.copyId
      ? await Copy.findOne({ _id: operation.source.copyId, tenantId: tenant, logicalDocumentId: logical._id }).lean()
      : null;
    const sourceLocation = operation.source?.locationId
      ? await Location.findOne({ _id: operation.source.locationId, tenantId: tenant, logicalDocumentId: logical._id }).lean()
      : null;
    if (operation.source?.copyId && !sourceCopy) throw conflict('base_missing', 'La copie source n’existe plus dans ce document.');
    if (operation.source?.locationId && !sourceLocation) throw conflict('base_missing', 'L’emplacement source n’existe plus dans ce document.');
    if (sourceLocation && sourceCopy && String(sourceLocation.copyId) !== String(sourceCopy._id)) {
      throw conflict('base_missing', 'La copie et l’emplacement source ne correspondent plus.');
    }

    if (!operation.target?.locationId) {
      throw conflict('policy_blocked', 'Un emplacement cible explicite est requis pour éviter toute écriture dans le mauvais cloud.');
    }
    const targetLocation = await Location.findOne({
      _id: operation.target.locationId,
      tenantId: tenant,
      logicalDocumentId: logical._id,
    }).lean();
    if (!targetLocation) throw conflict('base_missing', 'L’emplacement cible n’existe plus dans ce document.');
    const targetCopyId = operation.target.copyId || targetLocation.copyId;
    const targetCopy = await Copy.findOne({
      _id: targetCopyId,
      tenantId: tenant,
      logicalDocumentId: logical._id,
    }).lean();
    if (!targetCopy || String(targetLocation.copyId) !== String(targetCopy._id)) {
      throw conflict('base_missing', 'La copie et l’emplacement cible ne correspondent plus.');
    }

    const storageKey = sourceLocation?.storageKey || sourceVersion?.storageRef?.storageKey;
    if (!storageKey) throw conflict('base_missing', 'Aucun contenu physique source n’est disponible.');
    return {
      tenant,
      logical,
      sourceVersion,
      sourceCopy,
      sourceLocation,
      sourceStorageKey: storageKey,
      targetCopy,
      targetLocation,
    };
  }

  async function providerForTarget(scope, operation) {
    const ownerUserId = scope.targetCopy.lastModifiedBy || scope.targetCopy.createdBy || operation.requestedBy;
    if (scope.targetLocation.provider === 'canonical') {
      return {
        provider: await storage.getUploadProvider(scope.tenant, ownerUserId),
        ownerUserId,
      };
    }
    const provider = storage.providers?.[scope.targetLocation.provider];
    if (!provider || typeof provider.uploadVersion !== 'function') {
      throw conflict('policy_blocked', `Le fournisseur cible « ${scope.targetLocation.provider} » ne permet pas un transfert sûr.`);
    }
    return { provider, ownerUserId };
  }

  async function completeWithoutUpload({ operation, scope, workerId, sourceChecksum }) {
    await Copy.updateOne({
      _id: scope.targetCopy._id,
      tenantId: scope.tenant,
      logicalDocumentId: scope.logical._id,
    }, { $set: {
      checksum: sourceChecksum || scope.targetCopy.checksum || null,
      state: 'synced',
      basedOnVersionId: scope.sourceVersion?.versionId || scope.targetCopy.basedOnVersionId,
      lastModifiedBy: operation.requestedBy,
    } });
    return sync.complete({
      tenantId: scope.tenant,
      operationId: operation.operationId,
      workerId,
      result: {
        versionId: scope.sourceVersion?.versionId || operation.source?.versionId || null,
        copyId: scope.targetCopy._id,
        locationId: scope.targetLocation._id,
        checksum: sourceChecksum || scope.targetLocation.remoteChecksum || scope.targetCopy.checksum || null,
        deduplicated: true,
      },
    });
  }

  async function commitUploadedLocation({ operation, scope, uploaded, digest }) {
    const set = {
      provider: uploaded.provider || scope.targetLocation.provider,
      storageKey: uploaded.storageKey,
      remoteChecksum: digest,
      remoteModifiedAt: now(),
      lastObservedAt: now(),
      state: 'available',
    };
    let location;
    if (!scope.targetLocation.storageKey || scope.targetLocation.storageKey === uploaded.storageKey) {
      location = await Location.findOneAndUpdate({
        _id: scope.targetLocation._id,
        tenantId: scope.tenant,
        logicalDocumentId: scope.logical._id,
        copyId: scope.targetCopy._id,
        state: { $nin: ['revoked', 'deleted'] },
      }, { $set: set }, { new: true });
    } else {
      // Le fichier cible précédent est conservé et marqué obsolète. La nouvelle
      // copie physique obtient son propre emplacement : aucune perte silencieuse.
      const idempotencyKey = `sync-location:${operation.operationId}`;
      location = await Location.findOne({ tenantId: scope.tenant, idempotencyKey });
      if (!location) {
        try {
          location = await Location.create({
            tenantId: scope.tenant,
            logicalDocumentId: scope.logical._id,
            copyId: scope.targetCopy._id,
            locationKey: `sync_${crypto.createHash('sha256').update(operation.operationId).digest('hex').slice(0, 40)}`,
            provider: set.provider,
            accountRef: scope.targetLocation.accountRef || '',
            containerId: scope.targetLocation.containerId || '',
            externalFileId: uploaded.externalFileId || '',
            storageKey: uploaded.storageKey,
            remoteChecksum: digest,
            remoteModifiedAt: set.remoteModifiedAt,
            state: 'available',
            lastObservedAt: set.lastObservedAt,
            idempotencyKey,
            createdBy: operation.requestedBy,
          });
        } catch (error) {
          if (error?.code !== 11000) throw error;
          location = await Location.findOne({ tenantId: scope.tenant, idempotencyKey });
        }
      }
      await Location.updateOne({ _id: scope.targetLocation._id, state: 'available' }, { $set: { state: 'stale' } });
    }
    if (!location) throw conflict('both_modified', 'L’emplacement cible a changé pendant le transfert. Le fichier envoyé est conservé sans remplacer la cible.');
    await Copy.updateOne({
      _id: scope.targetCopy._id,
      tenantId: scope.tenant,
      logicalDocumentId: scope.logical._id,
    }, { $set: {
      checksum: digest,
      size: Math.max(0, Number(uploaded.size) || 0),
      state: 'synced',
      basedOnVersionId: scope.sourceVersion?.versionId || scope.targetCopy.basedOnVersionId,
      lastModifiedBy: operation.requestedBy,
    } });
    return location;
  }

  async function runClaimed({ operation, workerId, leaseMs }) {
    const scope = await loadScope(operation, operation.tenantId);
    const resolution = operation.conflict?.status === 'resolved' ? operation.conflict.resolution : null;
    if (resolution === 'keep_target') {
      return completeWithoutUpload({ operation, scope, workerId, sourceChecksum: null });
    }
    if (resolution === 'keep_both') {
      throw conflict('policy_blocked', 'Créez une seconde copie/emplacement cible avant de reprendre avec « conserver les deux ».');
    }

    const expectedChecksum = String(
      operation.source?.checksum
      || scope.sourceVersion?.checksum
      || scope.sourceCopy?.checksum
      || scope.sourceLocation?.remoteChecksum
      || '',
    ).toLowerCase();
    const targetChecksum = String(scope.targetLocation.remoteChecksum || scope.targetCopy.checksum || '').toLowerCase();
    if (scope.targetLocation.storageKey && expectedChecksum && targetChecksum && expectedChecksum !== targetChecksum
      && !['keep_source', 'merged'].includes(resolution)) {
      throw conflict('both_modified', 'La source et la cible ont des contenus différents.', {
        sourceChecksum: expectedChecksum,
        targetChecksum,
        sourceVersionId: scope.sourceVersion?.versionId || null,
      });
    }

    await sync.checkpoint({
      tenantId: scope.tenant,
      operationId: operation.operationId,
      workerId,
      checkpoint: { stage: 'downloading', cursor: scope.sourceStorageKey },
      leaseMs,
    });
    const sourceProvider = await storage.getProviderForStorageKey(scope.tenant, scope.sourceStorageKey);
    if (!sourceProvider || typeof sourceProvider.downloadVersion !== 'function') {
      throw conflict('policy_blocked', 'Le fournisseur source ne permet pas de télécharger le contenu.');
    }
    const buffer = asBuffer(await sourceProvider.downloadVersion({ storageKey: scope.sourceStorageKey }));
    const digest = checksum(buffer);
    if (expectedChecksum && digest !== expectedChecksum) {
      throw conflict('checksum_mismatch', 'Le contenu téléchargé ne correspond pas à son empreinte enregistrée.', {
        sourceChecksum: digest,
        targetChecksum: expectedChecksum,
        sourceVersionId: scope.sourceVersion?.versionId || null,
      });
    }

    const { provider: targetProvider, ownerUserId } = await providerForTarget(scope, operation);
    if (scope.targetLocation.storageKey && digest === targetChecksum) {
      const existingTargetProvider = await storage.getProviderForStorageKey(scope.tenant, scope.targetLocation.storageKey);
      let exists = false;
      try {
        exists = typeof existingTargetProvider?.exists === 'function'
          && await existingTargetProvider.exists({ storageKey: scope.targetLocation.storageKey });
      } catch (_) { exists = false; }
      if (exists) return completeWithoutUpload({ operation, scope, workerId, sourceChecksum: digest });
    }

    await sync.checkpoint({
      tenantId: scope.tenant,
      operationId: operation.operationId,
      workerId,
      checkpoint: { stage: 'uploading', bytesProcessed: buffer.length, metadata: { checksum: digest } },
      leaseMs,
    });
    const uploadIdempotencyKey = `kheops-sync:${scope.tenant}:${operation.operationId}`;
    const uploaded = await targetProvider.uploadVersion({
      tenantId: scope.tenant,
      matterId: scope.logical.dossierId,
      documentId: scope.logical._id,
      versionId: scope.sourceVersion?.versionId || `sync-${operation.operationId}`,
      filename: scope.sourceVersion?.filename || scope.logical.title || 'document',
      buffer,
      mime: scope.sourceVersion?.mime || scope.logical.preferredMime || 'application/octet-stream',
      ownerUserId,
      versionOrdinal: scope.sourceVersion?.sequence || 1,
      idempotencyKey: uploadIdempotencyKey,
      checksum: digest,
    });
    await storage.assertUploadCompleted(targetProvider, uploaded.storageKey);
    await sync.checkpoint({
      tenantId: scope.tenant,
      operationId: operation.operationId,
      workerId,
      checkpoint: {
        stage: 'uploaded',
        bytesProcessed: buffer.length,
        metadata: { checksum: digest, storageKey: uploaded.storageKey, provider: uploaded.provider || targetProvider.name },
      },
      leaseMs,
    });
    const location = await commitUploadedLocation({ operation, scope, uploaded, digest });
    return sync.complete({
      tenantId: scope.tenant,
      operationId: operation.operationId,
      workerId,
      result: {
        versionId: scope.sourceVersion?.versionId || operation.source?.versionId || null,
        copyId: scope.targetCopy._id,
        locationId: location._id,
        checksum: digest,
        deduplicated: Boolean(uploaded.idempotent),
      },
    });
  }

  async function execute({ tenantId, operationId, workerId, leaseMs = DEFAULT_LEASE_MS }) {
    const existing = await sync.getOperation({ tenantId, operationId });
    if (existing.status === 'succeeded') return { operation: existing, idempotent: true, succeeded: true };
    if (existing.status === 'cancelled') return { operation: existing, idempotent: true, cancelled: true };
    if (existing.status === 'conflict' && existing.conflict?.status === 'open') {
      return { operation: existing, idempotent: true, conflict: true };
    }
    const operation = await sync.claim({ tenantId, operationId, workerId, leaseMs });
    try {
      const result = await runClaimed({ operation, workerId, leaseMs });
      return { ...result, operation: result.operation, succeeded: true, idempotent: Boolean(result.idempotent) };
    } catch (error) {
      if (error?.conflictKind) {
        const details = error.conflictDetails || {};
        const operationWithConflict = await sync.recordConflict({
          tenantId,
          operationId,
          workerId,
          conflict: {
            kind: error.conflictKind,
            note: error.message,
            sourceVersionId: details.sourceVersionId,
            targetVersionId: details.targetVersionId,
            sourceChecksum: details.sourceChecksum,
            targetChecksum: details.targetChecksum,
          },
        });
        return { operation: operationWithConflict, conflict: true, succeeded: false, idempotent: false };
      }
      const failed = await sync.fail({
        tenantId,
        operationId,
        workerId,
        retryable: retryable(error),
        error: { code: error?.code || 'SYNC_WORKER_FAILED', message: error?.message || 'Échec du worker de synchronisation.' },
      });
      return { ...failed, failed: true, succeeded: false, error };
    }
  }

  return { execute, runClaimed };
}

module.exports = {
  DEFAULT_LEASE_MS,
  checksum,
  makeDocumentSyncWorker,
  retryable,
  ...makeDocumentSyncWorker(),
};
