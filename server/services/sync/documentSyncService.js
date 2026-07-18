const crypto = require('crypto');
const mongoose = require('mongoose');
const DocumentSyncJournal = require('../../models/Documents/DocumentSyncJournal');
const LogicalDocument = require('../../models/Documents/LogicalDocument');
const DocumentCopy = require('../../models/Documents/DocumentCopy');
const DocumentLocation = require('../../models/Documents/DocumentLocation');

function objectId(value, label, { optional = false } = {}) {
  if (optional && !value) return null;
  if (!mongoose.Types.ObjectId.isValid(String(value || ''))) {
    throw Object.assign(new Error(`${label} invalide.`), { statusCode: 400, code: 'INVALID_ID' });
  }
  return new mongoose.Types.ObjectId(String(value));
}

function clean(value, max, fallback = '') {
  return String(value == null ? fallback : value).trim().slice(0, max);
}

function safeMetadata(value, depth = 0) {
  if (depth > 6 || value == null) return value == null ? null : String(value).slice(0, 1000);
  if (['string', 'boolean', 'number'].includes(typeof value)) return typeof value === 'string' ? value.slice(0, 3000) : value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeMetadata(item, depth + 1));
  if (typeof value !== 'object') return String(value).slice(0, 1000);
  return Object.fromEntries(Object.entries(value).slice(0, 100)
    .filter(([key]) => !key.startsWith('$') && !key.includes('.') && key !== '__proto__')
    .map(([key, item]) => [key.slice(0, 100), safeMetadata(item, depth + 1)]));
}

function operationId() {
  return `sync-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

function normalizedEndpoint(input = {}) {
  return {
    copyId: objectId(input.copyId, 'copyId', { optional: true }),
    locationId: objectId(input.locationId, 'locationId', { optional: true }),
    versionId: input.versionId ? clean(input.versionId, 180) : null,
    checksum: input.checksum ? clean(input.checksum, 128).toLowerCase() : null,
  };
}

function makeDocumentSyncService({
  Journal = DocumentSyncJournal,
  Logical = LogicalDocument,
  Copy = DocumentCopy,
  Location = DocumentLocation,
  clock = () => new Date(),
} = {}) {
  async function assertEndpointReferences({ tenantId, logicalDocumentId, endpoint, label }) {
    if (endpoint.copyId) {
      const copy = await Copy.findOne({
        _id: endpoint.copyId,
        tenantId,
        logicalDocumentId,
      }).select('_id logicalDocumentId').lean();
      if (!copy) throw Object.assign(new Error(`${label}.copyId ne correspond pas à ce document.`), {
        statusCode: 400,
        code: 'SYNC_ENDPOINT_SCOPE_INVALID',
      });
    }
    if (endpoint.locationId) {
      const location = await Location.findOne({
        _id: endpoint.locationId,
        tenantId,
        logicalDocumentId,
        ...(endpoint.copyId ? { copyId: endpoint.copyId } : {}),
      }).select('_id copyId logicalDocumentId').lean();
      if (!location) throw Object.assign(new Error(`${label}.locationId ne correspond pas à ce document ou à cette copie.`), {
        statusCode: 400,
        code: 'SYNC_ENDPOINT_SCOPE_INVALID',
      });
    }
  }

  async function enqueue({ tenantId, logicalDocumentId, userId, input = {} }) {
    const tenant = objectId(tenantId, 'tenantId');
    const logicalId = objectId(logicalDocumentId, 'logicalDocumentId');
    const actor = objectId(userId, 'userId');
    const idempotencyKey = clean(input.idempotencyKey, 240);
    if (!idempotencyKey) throw Object.assign(new Error('idempotencyKey requis.'), { statusCode: 400, code: 'IDEMPOTENCY_REQUIRED' });
    const existing = await Journal.findOne({ tenantId: tenant, idempotencyKey }).lean();
    if (existing) return { operation: existing, created: false, idempotent: true };
    const logical = await Logical.findOne({ _id: logicalId, tenantId: tenant }).lean();
    if (!logical) throw Object.assign(new Error('Document logique introuvable.'), { statusCode: 404, code: 'LOGICAL_DOCUMENT_NOT_FOUND' });
    const source = normalizedEndpoint(input.source);
    const target = normalizedEndpoint(input.target);
    await assertEndpointReferences({ tenantId: tenant, logicalDocumentId: logicalId, endpoint: source, label: 'source' });
    await assertEndpointReferences({ tenantId: tenant, logicalDocumentId: logicalId, endpoint: target, label: 'target' });
    const direction = ['push', 'pull', 'reconcile', 'copy', 'delete_external'].includes(input.direction)
      ? input.direction
      : 'reconcile';
    try {
      const operation = await Journal.create({
        tenantId: tenant,
        logicalDocumentId: logicalId,
        operationId: input.operationId ? clean(input.operationId, 180) : operationId(),
        idempotencyKey,
        direction,
        source,
        target,
        baseVersionId: input.baseVersionId ? clean(input.baseVersionId, 180) : logical.currentVersionId,
        status: 'queued',
        maxAttempts: Math.max(1, Math.min(50, Number(input.maxAttempts) || 5)),
        checkpoint: { stage: 'queued', metadata: safeMetadata(input.metadata || {}), updatedAt: clock() },
        requestedBy: actor,
      });
      return { operation, created: true, idempotent: false };
    } catch (err) {
      if (err && err.code === 11000) {
        const winner = await Journal.findOne({ tenantId: tenant, idempotencyKey }).lean();
        if (winner) return { operation: winner, created: false, idempotent: true };
      }
      throw err;
    }
  }

  async function claim({ tenantId, operationId: id, workerId, leaseMs = 60000 }) {
    const tenant = objectId(tenantId, 'tenantId');
    const now = clock();
    const worker = clean(workerId, 180);
    if (!worker) throw Object.assign(new Error('workerId requis.'), { statusCode: 400, code: 'WORKER_REQUIRED' });
    const operation = await Journal.findOneAndUpdate({
      tenantId: tenant,
      operationId: clean(id, 180),
      $and: [
        { $or: [{ status: 'queued' }, { status: 'retry_wait', nextRetryAt: { $lte: now } }, { status: 'running', 'lease.expiresAt': { $lte: now } }] },
      ],
    }, {
      $set: {
        status: 'running',
        'lease.workerId': worker,
        'lease.acquiredAt': now,
        'lease.expiresAt': new Date(now.getTime() + Math.max(5000, Math.min(3600000, Number(leaseMs) || 60000))),
        nextRetryAt: null,
      },
      $inc: { attempt: 1 },
    }, { new: true });
    if (operation) return operation;
    const existing = await Journal.findOne({ tenantId: tenant, operationId: clean(id, 180) }).lean();
    if (!existing) throw Object.assign(new Error('Opération de synchronisation introuvable.'), { statusCode: 404, code: 'SYNC_NOT_FOUND' });
    throw Object.assign(new Error('Opération déjà réservée ou non exécutable.'), { statusCode: 409, code: 'SYNC_NOT_CLAIMABLE' });
  }

  async function checkpoint({ tenantId, operationId: id, workerId, checkpoint: input = {}, leaseMs = 60000 }) {
    const tenant = objectId(tenantId, 'tenantId');
    const now = clock();
    const operation = await Journal.findOneAndUpdate({
      tenantId: tenant,
      operationId: clean(id, 180),
      status: 'running',
      'lease.workerId': clean(workerId, 180),
      'lease.expiresAt': { $gt: now },
    }, {
      $set: {
        'checkpoint.stage': clean(input.stage || 'running', 100),
        'checkpoint.cursor': clean(input.cursor, 1000),
        'checkpoint.bytesProcessed': Math.max(0, Number(input.bytesProcessed) || 0),
        'checkpoint.metadata': safeMetadata(input.metadata || {}),
        'checkpoint.updatedAt': now,
        'lease.expiresAt': new Date(now.getTime() + Math.max(5000, Math.min(3600000, Number(leaseMs) || 60000))),
      },
    }, { new: true });
    if (!operation) throw Object.assign(new Error('Bail de synchronisation expiré ou détenu par un autre worker.'), { statusCode: 409, code: 'SYNC_LEASE_LOST' });
    return operation;
  }

  async function complete({ tenantId, operationId: id, workerId, result = {} }) {
    const tenant = objectId(tenantId, 'tenantId');
    const operationKey = clean(id, 180);
    const existing = await Journal.findOne({ tenantId: tenant, operationId: operationKey });
    if (!existing) throw Object.assign(new Error('Opération introuvable.'), { statusCode: 404, code: 'SYNC_NOT_FOUND' });
    if (existing.status === 'succeeded') return { operation: existing, idempotent: true };
    if (existing.status === 'conflict') throw Object.assign(new Error('Le conflit doit être résolu avant de terminer.'), { statusCode: 409, code: 'SYNC_CONFLICT_OPEN' });
    const resultEndpoint = {
      copyId: objectId(result.copyId, 'result.copyId', { optional: true }),
      locationId: objectId(result.locationId, 'result.locationId', { optional: true }),
    };
    await assertEndpointReferences({
      tenantId: tenant,
      logicalDocumentId: existing.logicalDocumentId,
      endpoint: resultEndpoint,
      label: 'result',
    });
    const operation = await Journal.findOneAndUpdate({
      _id: existing._id,
      status: 'running',
      'lease.workerId': clean(workerId, 180),
    }, {
      $set: {
        status: 'succeeded',
        result: {
          versionId: result.versionId || null,
          copyId: resultEndpoint.copyId,
          locationId: resultEndpoint.locationId,
          checksum: result.checksum ? clean(result.checksum, 128).toLowerCase() : null,
          deduplicated: Boolean(result.deduplicated),
        },
        completedAt: clock(),
        'checkpoint.stage': 'completed',
        'checkpoint.updatedAt': clock(),
        lease: { workerId: null, acquiredAt: null, expiresAt: null },
        lastError: { code: null, message: null, retryable: false, at: null },
      },
    }, { new: true });
    if (!operation) throw Object.assign(new Error('Bail perdu avant confirmation.'), { statusCode: 409, code: 'SYNC_LEASE_LOST' });
    return { operation, idempotent: false };
  }

  async function fail({ tenantId, operationId: id, workerId, error = {}, retryable = false }) {
    const tenant = objectId(tenantId, 'tenantId');
    const current = await Journal.findOne({ tenantId: tenant, operationId: clean(id, 180) });
    if (!current) throw Object.assign(new Error('Opération introuvable.'), { statusCode: 404, code: 'SYNC_NOT_FOUND' });
    if (['failed', 'succeeded', 'cancelled'].includes(current.status)) return { operation: current, idempotent: true };
    const willRetry = Boolean(retryable) && current.attempt < current.maxAttempts;
    const delayMs = Math.min(3600000, 1000 * (2 ** Math.max(0, current.attempt - 1)));
    const operation = await Journal.findOneAndUpdate({
      _id: current._id,
      status: 'running',
      'lease.workerId': clean(workerId, 180),
    }, {
      $set: {
        status: willRetry ? 'retry_wait' : 'failed',
        nextRetryAt: willRetry ? new Date(clock().getTime() + delayMs) : null,
        lastError: {
          code: clean(error.code || 'SYNC_FAILED', 120),
          message: clean(error.message || 'Synchronisation interrompue.', 1500),
          retryable: willRetry,
          at: clock(),
        },
        lease: { workerId: null, acquiredAt: null, expiresAt: null },
        'checkpoint.updatedAt': clock(),
      },
    }, { new: true });
    if (!operation) throw Object.assign(new Error('Bail perdu avant enregistrement de l’échec.'), { statusCode: 409, code: 'SYNC_LEASE_LOST' });
    return { operation, idempotent: false, willRetry };
  }

  async function recordConflict({ tenantId, operationId: id, workerId, conflict = {} }) {
    const tenant = objectId(tenantId, 'tenantId');
    const now = clock();
    const allowedKinds = ['both_modified', 'base_missing', 'remote_deleted', 'checksum_mismatch', 'version_diverged', 'policy_blocked'];
    const operation = await Journal.findOneAndUpdate({
      tenantId: tenant,
      operationId: clean(id, 180),
      status: 'running',
      'lease.workerId': clean(workerId, 180),
    }, {
      $set: {
        status: 'conflict',
        conflict: {
          kind: allowedKinds.includes(conflict.kind) ? conflict.kind : 'version_diverged',
          detectedAt: now,
          sourceVersionId: conflict.sourceVersionId || null,
          targetVersionId: conflict.targetVersionId || null,
          sourceChecksum: conflict.sourceChecksum || null,
          targetChecksum: conflict.targetChecksum || null,
          status: 'open',
          resolution: null,
          note: clean(conflict.note, 1000),
        },
        lease: { workerId: null, acquiredAt: null, expiresAt: null },
        'checkpoint.stage': 'conflict',
        'checkpoint.updatedAt': now,
      },
    }, { new: true });
    if (!operation) throw Object.assign(new Error('Impossible d’enregistrer le conflit : bail perdu.'), { statusCode: 409, code: 'SYNC_LEASE_LOST' });
    const copyIds = [operation.source?.copyId, operation.target?.copyId].filter(Boolean);
    if (copyIds.length) await Copy.updateMany({
      tenantId: tenant,
      logicalDocumentId: operation.logicalDocumentId,
      _id: { $in: copyIds },
    }, { $set: { state: 'conflict' } });
    await Logical.updateOne({ tenantId: tenant, _id: operation.logicalDocumentId }, { $set: { status: 'conflict' } });
    return operation;
  }

  async function resolveConflict({ tenantId, operationId: id, userId, resolution, note = '' }) {
    const tenant = objectId(tenantId, 'tenantId');
    const actor = objectId(userId, 'userId');
    const allowed = ['keep_source', 'keep_target', 'keep_both', 'merged', 'cancelled'];
    if (!allowed.includes(resolution)) throw Object.assign(new Error('Résolution de conflit invalide.'), { statusCode: 400, code: 'INVALID_CONFLICT_RESOLUTION' });
    const now = clock();
    const operation = await Journal.findOneAndUpdate({
      tenantId: tenant,
      operationId: clean(id, 180),
      status: 'conflict',
      'conflict.status': 'open',
    }, {
      $set: {
        status: resolution === 'cancelled' ? 'cancelled' : 'queued',
        'conflict.status': 'resolved',
        'conflict.resolution': resolution,
        'conflict.resolvedAt': now,
        'conflict.resolvedBy': actor,
        'conflict.note': clean(note, 1000),
        'checkpoint.stage': resolution === 'cancelled' ? 'cancelled' : 'conflict_resolved',
        'checkpoint.updatedAt': now,
        nextRetryAt: null,
      },
    }, { new: true });
    if (!operation) throw Object.assign(new Error('Conflit introuvable ou déjà résolu.'), { statusCode: 409, code: 'SYNC_CONFLICT_NOT_OPEN' });
    return operation;
  }

  async function resume({ tenantId, operationId: id }) {
    const tenant = objectId(tenantId, 'tenantId');
    const operationKey = clean(id, 180);
    const existing = await Journal.findOne({ tenantId: tenant, operationId: operationKey });
    if (!existing) throw Object.assign(new Error('Opération introuvable.'), { statusCode: 404, code: 'SYNC_NOT_FOUND' });
    if (['queued', 'running', 'retry_wait'].includes(existing.status)) return { operation: existing, idempotent: true };
    if (existing.status === 'conflict' && existing.conflict?.status === 'open') {
      throw Object.assign(new Error('Résolvez le conflit avant la reprise.'), { statusCode: 409, code: 'SYNC_CONFLICT_OPEN' });
    }
    if (!['failed'].includes(existing.status)) {
      throw Object.assign(new Error('Cette opération ne peut pas être reprise.'), { statusCode: 409, code: 'SYNC_NOT_RESUMABLE' });
    }
    const operation = await Journal.findOneAndUpdate({ _id: existing._id, status: 'failed' }, {
      $set: {
        status: 'queued',
        nextRetryAt: null,
        lease: { workerId: null, acquiredAt: null, expiresAt: null },
        'checkpoint.stage': 'resumed',
        'checkpoint.updatedAt': clock(),
      },
    }, { new: true });
    return { operation, idempotent: false };
  }

  async function getOperation({ tenantId, operationId: id }) {
    const operation = await Journal.findOne({
      tenantId: objectId(tenantId, 'tenantId'),
      operationId: clean(id, 180),
    }).lean();
    if (!operation) throw Object.assign(new Error('Opération introuvable.'), { statusCode: 404, code: 'SYNC_NOT_FOUND' });
    return operation;
  }

  async function listOperations({ tenantId, logicalDocumentId, status, limit = 100, cursor }) {
    const query = { tenantId: objectId(tenantId, 'tenantId') };
    if (logicalDocumentId) query.logicalDocumentId = objectId(logicalDocumentId, 'logicalDocumentId');
    if (status) {
      const statuses = String(status).split(',').map((item) => item.trim()).filter(Boolean);
      const allowed = ['queued', 'running', 'retry_wait', 'succeeded', 'failed', 'conflict', 'cancelled'];
      const accepted = statuses.filter((item) => allowed.includes(item));
      if (!accepted.length) throw Object.assign(new Error('Filtre status invalide.'), { statusCode: 400, code: 'INVALID_SYNC_STATUS' });
      query.status = accepted.length === 1 ? accepted[0] : { $in: accepted };
    }
    if (cursor) query._id = { $lt: objectId(cursor, 'cursor') };
    return Journal.find(query)
      .sort({ _id: -1 })
      .limit(Math.max(1, Math.min(250, Number(limit) || 100)))
      .lean();
  }

  return {
    checkpoint,
    claim,
    complete,
    enqueue,
    fail,
    getOperation,
    listOperations,
    recordConflict,
    resolveConflict,
    resume,
  };
}

module.exports = { makeDocumentSyncService, safeMetadata, ...makeDocumentSyncService() };
