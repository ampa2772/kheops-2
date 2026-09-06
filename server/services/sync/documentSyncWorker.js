const crypto = require('crypto');
const mongoose = require('mongoose');
const LogicalDocument = require('../../models/Documents/LogicalDocument');
const DocumentVersion = require('../../models/Documents/DocumentVersion');
const DocumentCopy = require('../../models/Documents/DocumentCopy');
const DocumentLocation = require('../../models/Documents/DocumentLocation');
const syncService = require('./documentSyncService');
const storageService = require('../storage');
const { retryable, retryAfterMs } = require('./providerErrors');
const storageAuthorization = require('./documentSyncAuthorization');

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
  authorization = storageAuthorization,
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
    if (logical.status === 'archived' || [sourceCopy, targetCopy, sourceLocation, targetLocation]
      .some(row => ['deleted', 'revoked', 'archived'].includes(row?.state))) {
      throw conflict('policy_blocked', 'Le document ou un emplacement a été archivé ou révoqué.');
    }
    const authScope = { tenantId: tenant, logicalDocumentId: logical._id, userId: operation.requestedBy };
    await authorization.assertStorageReference({ ...authScope, storageKey });
    if (targetLocation.storageKey) await authorization.assertStorageReference({ ...authScope, storageKey: targetLocation.storageKey });
    const destination = await authorization.assertDestination({ ...authScope, location: targetLocation });
    return {
      tenant,
      logical,
      sourceVersion,
      sourceCopy,
      sourceLocation,
      sourceStorageKey: storageKey,
      targetCopy,
      targetLocation,
      destination,
    };
  }

  async function providerForTarget(scope, operation) {
    const { ownerUserId, providerName } = scope.destination;
    const provider = storage.providers?.[providerName];
    if (!provider || typeof provider.uploadVersion !== 'function') {
      throw conflict('policy_blocked', `Le fournisseur cible « ${scope.targetLocation.provider} » ne permet pas un transfert sûr.`);
    }
    return { provider, ownerUserId };
  }

  async function completeWithoutUpload({ operation, scope, workerId, sourceChecksum, keepTarget = false }) {
    await sync.checkpoint({tenantId:scope.tenant,operationId:operation.operationId,workerId,checkpoint:{stage:'verified'},leaseMs:DEFAULT_LEASE_MS});
    const versionId = keepTarget
      ? (sourceChecksum === scope.targetCopy.checksum ? scope.targetCopy.basedOnVersionId : null)
      : (scope.sourceVersion?.versionId || scope.targetCopy.basedOnVersionId);
    const changed = await Copy.updateOne({
      _id: scope.targetCopy._id,
      tenantId: scope.tenant,
      logicalDocumentId: scope.logical._id,
      checksum: scope.targetCopy.checksum || null,
      basedOnVersionId: scope.targetCopy.basedOnVersionId || null,
      state: {$nin:['deleted','detached']},
    }, { $set: {
      checksum: sourceChecksum || scope.targetCopy.checksum || null,
      state: keepTarget ? 'ready' : 'synced',
      basedOnVersionId: versionId,
      lastModifiedBy: operation.requestedBy,
    } });
    if((changed.matchedCount ?? changed.modifiedCount)!==1) throw conflict('both_modified','La copie cible a changé pendant la vérification.');
    await Location.updateOne({_id:scope.targetLocation._id,tenantId:scope.tenant,logicalDocumentId:scope.logical._id,
      storageKey:scope.targetLocation.storageKey,state:{$nin:['revoked','deleted']}},{$set:{remoteChecksum:sourceChecksum,lastObservedAt:now(),
        verifiedStorageKey:scope.targetLocation.storageKey,storageVerifiedAt:now()}});
    return sync.complete({
      tenantId: scope.tenant,
      operationId: operation.operationId,
      workerId,
      result: {
        versionId: versionId || null,
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
      verifiedStorageKey: uploaded.storageKey,
      storageVerifiedAt: now(),
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
            verifiedStorageKey: uploaded.storageKey,
            storageVerifiedAt: now(),
            remoteChecksum: digest,
            remoteModifiedAt: set.remoteModifiedAt,
            state: 'available',
            lastObservedAt: set.lastObservedAt,
            idempotencyKey,
            createdBy: scope.targetLocation.createdBy || operation.requestedBy,
          });
        } catch (error) {
          if (error?.code !== 11000) throw error;
          location = await Location.findOne({ tenantId: scope.tenant, idempotencyKey });
        }
      }
      await Location.updateOne({ _id: scope.targetLocation._id, state: 'available' }, { $set: { state: 'stale' } });
    }
    if (!location) throw conflict('both_modified', 'L’emplacement cible a changé pendant le transfert. Le fichier envoyé est conservé sans remplacer la cible.');
    const changed = await Copy.updateOne({
      _id: scope.targetCopy._id,
      tenantId: scope.tenant,
      logicalDocumentId: scope.logical._id,
      checksum: scope.targetCopy.checksum || null,
      basedOnVersionId: scope.targetCopy.basedOnVersionId || null,
      state: {$nin:['deleted','detached']},
    }, { $set: {
      checksum: digest,
      size: Math.max(0, Number(uploaded.size) || 0),
      state: 'synced',
      basedOnVersionId: scope.sourceVersion?.versionId || scope.targetCopy.basedOnVersionId,
      lastModifiedBy: operation.requestedBy,
    } });
    if((changed.matchedCount ?? changed.modifiedCount)!==1) throw conflict('both_modified','La copie cible a changé pendant le transfert. Les fichiers sont conservés.');
    return location;
  }

  async function readPhysical(tenant, key) {
    const provider = await storage.getProviderForStorageKey(tenant, key);
    if (typeof provider?.downloadVersion !== 'function') throw conflict('policy_blocked', 'Le contenu distant ne peut pas être vérifié.');
    try { return asBuffer(await provider.downloadVersion({ storageKey: key })); }
    catch (error) {
      if (Number(error?.response?.status || error?.statusCode || error?.code) === 404 || error?.code === 'ENOENT') {
        throw conflict('remote_deleted', 'Le fichier distant est absent ; aucune copie ne sera écrasée.');
      }
      throw error;
    }
  }

  async function separateTarget(scope, operation) {
    // Deterministic metadata identity: retrying keeps the same extra copy.
    const copyKey = `retained_${checksum(Buffer.from(operation.operationId)).slice(0, 40)}`;
    let copy = await Copy.findOne({ tenantId: scope.tenant, logicalDocumentId: scope.logical._id, copyKey });
    if (!copy) {
      try { copy = await Copy.create({
        tenantId: scope.tenant, logicalDocumentId: scope.logical._id, copyKey,
        basedOnVersionId: scope.sourceVersion?.versionId, format: scope.targetCopy.format,
        purpose: 'working', state: 'ready', retentionPolicy: 'manual',
        createdBy: operation.requestedBy, lastModifiedBy: operation.requestedBy,
      }); } catch (error) {
        if (error?.code !== 11000) throw error;
        copy = await Copy.findOne({ tenantId: scope.tenant, logicalDocumentId: scope.logical._id, copyKey });
      }
    }
    if (!copy) throw conflict('base_missing', 'La copie supplémentaire n’a pas pu être créée.');
    const locationKey = `destination_${copyKey}`;
    let location = await Location.findOne({ tenantId: scope.tenant, copyId: copy._id, locationKey });
    if (!location) {
      try { location = await Location.create({
        tenantId: scope.tenant, logicalDocumentId: scope.logical._id, copyId: copy._id, locationKey,
        provider: scope.targetLocation.provider, accountRef: scope.targetLocation.accountRef,
        containerId: scope.targetLocation.containerId, createdBy: scope.targetLocation.createdBy,
        state: 'available', storageKey: '',
      }); } catch (error) {
        if (error?.code !== 11000) throw error;
        location = await Location.findOne({ tenantId: scope.tenant, copyId: copy._id, locationKey });
      }
    }
    if (!location) throw conflict('base_missing', 'L’emplacement supplémentaire n’a pas pu être créé.');
    scope.targetCopy = copy; scope.targetLocation = location;
  }

  async function runClaimed({ operation, workerId, leaseMs }) {
    const scope = await loadScope(operation, operation.tenantId);
    const resolution = operation.conflict?.status === 'resolved' ? operation.conflict.resolution : null;
    if (resolution === 'keep_target') {
      if (!scope.targetLocation.storageKey) throw conflict('base_missing', 'Aucune cible à conserver.');
      const target = await readPhysical(scope.tenant, scope.targetLocation.storageKey);
      return completeWithoutUpload({ operation, scope, workerId, sourceChecksum: checksum(target), keepTarget: true });
    }

    const expectedChecksum = String(
      operation.source?.checksum
      || scope.sourceVersion?.checksum
      || scope.sourceCopy?.checksum
      || scope.sourceLocation?.remoteChecksum
      || '',
    ).toLowerCase();
    const targetChecksum = String(scope.targetLocation.remoteChecksum || scope.targetCopy.checksum || '').toLowerCase();
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

    if (scope.targetLocation.storageKey) {
      const freshChecksum = checksum(await readPhysical(scope.tenant, scope.targetLocation.storageKey));
      if (digest === freshChecksum && resolution !== 'keep_both') {
        return completeWithoutUpload({ operation, scope, workerId, sourceChecksum: digest });
      }
      if ((!targetChecksum || freshChecksum !== targetChecksum) && !['keep_source', 'merged', 'keep_both'].includes(resolution)) {
        throw conflict('both_modified', 'La cible distante a changé depuis sa dernière vérification.', {
          sourceChecksum: digest, targetChecksum: freshChecksum, sourceVersionId: scope.sourceVersion?.versionId,
        });
      }
    }
    if (resolution === 'keep_both') await separateTarget(scope, operation);
    const { provider: targetProvider, ownerUserId } = await providerForTarget(scope, operation);

    await sync.checkpoint({
      tenantId: scope.tenant,
      operationId: operation.operationId,
      workerId,
      checkpoint: { stage: 'uploading', bytesProcessed: buffer.length, metadata: { checksum: digest } },
      leaseMs,
    });
    const uploadIdempotencyKey = `kheops-sync:${scope.tenant}:${operation.operationId}`;
    const receipt = operation.uploadedFile;
    if (receipt?.storageKey && (receipt.checksum !== digest
      || String(receipt.copyId) !== String(scope.targetCopy._id)
      || String(receipt.locationId) !== String(scope.targetLocation._id)
      || receipt.provider !== targetProvider.name)) {
      throw conflict('policy_blocked', 'Le transfert repris ne correspond plus à la destination ou au contenu prévu.');
    }
    const uploaded = receipt?.storageKey ? { storageKey: receipt.storageKey, provider: receipt.provider,
      size: receipt.size, idempotent: true } : await targetProvider.uploadVersion({
      tenantId: scope.tenant,
      matterId: scope.logical.dossierId,
      documentId: scope.logical._id,
      // A transfer gets its own immutable physical destination, even when two
      // operations happen to start from the same logical version.
      versionId: `sync-${checksum(Buffer.from(operation.operationId)).slice(0, 40)}`,
      filename: scope.sourceVersion?.filename || scope.logical.title || 'document',
      buffer,
      mime: scope.sourceVersion?.mime || scope.logical.preferredMime || 'application/octet-stream',
      ownerUserId,
      containerId: scope.destination.containerId,
      versionOrdinal: scope.sourceVersion?.sequence || 1,
      idempotencyKey: uploadIdempotencyKey,
      checksum: digest,
    });
    if (!uploaded?.storageKey) throw Object.assign(new Error('Aucune référence reçue après envoi.'), { code: 'SYNC_NOT_CONFIRMED', retryable: true });
    if (!receipt?.storageKey) await sync.rememberUpload({ tenantId: scope.tenant, operationId: operation.operationId, workerId,
      uploadedFile: { storageKey: uploaded.storageKey, provider: uploaded.provider || targetProvider.name,
        checksum: digest, size: buffer.length, copyId: scope.targetCopy._id, locationId: scope.targetLocation._id } });
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
    // Read back bytes before marking a copy synchronized. If this fails, the
    // durable receipt resumes confirmation, not another upload.
    const confirmed = asBuffer(await targetProvider.downloadVersion({ storageKey: uploaded.storageKey }));
    if (checksum(confirmed) !== digest) throw conflict('checksum_mismatch', 'Le fichier envoyé ne correspond pas au contenu relu ; les deux contenus sont conservés.');
    await sync.checkpoint({ tenantId: scope.tenant, operationId: operation.operationId, workerId,
      checkpoint: { stage: 'verified', bytesProcessed: buffer.length }, leaseMs });
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
    if (existing.status === 'succeeded') {
      const result=await sync.complete({tenantId,operationId,workerId});
      return {...result,idempotent:true,succeeded:true};
    }
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
      const safeError = {
        code: /^[A-Z0-9_]{1,100}$/.test(String(error?.code || '')) ? error.code : 'SYNC_WORKER_FAILED',
        message: retryable(error) ? 'Le transfert est interrompu temporairement ; une reprise sera tentée.'
          : 'Le transfert nécessite une vérification des droits, de la connexion ou de la destination.',
      };
      const failed = await sync.fail({
        tenantId,
        operationId,
        workerId,
        retryable: retryable(error),
        retryAfterMs: retryAfterMs(error, now().getTime()),
        error: safeError,
      });
      return { ...failed, failed: true, succeeded: false, error: safeError };
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
