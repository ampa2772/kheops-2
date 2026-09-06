const mongoose = require('mongoose');
const { makeDocumentSyncService, safeMetadata } = require('../documentSyncService');

function query(value) {
  return {
    lean: jest.fn().mockResolvedValue(value),
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}

function selectedQuery(value) {
  return { select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(value) })) };
}

describe('documentSyncService', () => {
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const logicalDocumentId = new mongoose.Types.ObjectId();
  const now = new Date('2026-07-10T10:00:00.000Z');

  test('enqueue est idempotent par clé explicite', async () => {
    const prior = { operationId: 'sync-1', idempotencyKey: 'idem-1', status: 'queued' };
    const Journal = { findOne: jest.fn(() => query(prior)), create: jest.fn() };
    const service = makeDocumentSyncService({ Journal, Logical: {}, Copy: {}, Location: {}, clock: () => now });
    const result = await service.enqueue({ tenantId, logicalDocumentId, userId, input: { idempotencyKey: 'idem-1' } });
    expect(result).toMatchObject({ created: false, idempotent: true, operation: prior });
    expect(Journal.create).not.toHaveBeenCalled();
  });

  test('crée une opération reprenable avec un checkpoint initial', async () => {
    const Journal = {
      findOne: jest.fn(() => query(null)),
      create: jest.fn(async (payload) => ({ _id: new mongoose.Types.ObjectId(), ...payload })),
    };
    const Logical = { findOne: jest.fn(() => query({ _id: logicalDocumentId, currentVersionId: 'v2' })) };
    const result = await makeDocumentSyncService({ Journal, Logical, Copy: {}, Location: {}, clock: () => now }).enqueue({
      tenantId, logicalDocumentId, userId,
      input: { idempotencyKey: 'idem-2', direction: 'push', source: { versionId: 'v2' }, target: {} },
    });
    expect(result.created).toBe(true);
    expect(Journal.create).toHaveBeenCalledWith(expect.objectContaining({
      baseVersionId: 'v2', status: 'queued', checkpoint: expect.objectContaining({ stage: 'queued', updatedAt: now }),
    }));
  });

  test('refuse une copie source appartenant à un autre document', async () => {
    const foreignCopyId = new mongoose.Types.ObjectId();
    const Journal = { findOne: jest.fn(() => query(null)), create: jest.fn() };
    const Logical = { findOne: jest.fn(() => query({ _id: logicalDocumentId, currentVersionId: 'v2' })) };
    const Copy = { findOne: jest.fn(() => selectedQuery(null)) };
    await expect(makeDocumentSyncService({ Journal, Logical, Copy, Location: {}, clock: () => now }).enqueue({
      tenantId, logicalDocumentId, userId,
      input: { idempotencyKey: 'idem-foreign', source: { copyId: foreignCopyId }, target: {} },
    })).rejects.toMatchObject({ statusCode: 400, code: 'SYNC_ENDPOINT_SCOPE_INVALID' });
    expect(Copy.findOne).toHaveBeenCalledWith(expect.objectContaining({
      _id: foreignCopyId, logicalDocumentId,
    }));
    expect(Journal.create).not.toHaveBeenCalled();
  });

  test('claim réserve atomiquement et incrémente la tentative', async () => {
    const claimed = { operationId: 'sync-2', status: 'running', attempt: 1 };
    const Journal = { findOneAndUpdate: jest.fn(async () => claimed), findOne: jest.fn() };
    const result = await makeDocumentSyncService({ Journal, Logical: {}, Copy: {}, Location: {}, clock: () => now }).claim({
      tenantId, operationId: 'sync-2', workerId: 'worker-A', leaseMs: 30000,
    });
    expect(result).toBe(claimed);
    expect(Journal.findOneAndUpdate.mock.calls[0][1]).toMatchObject({
      $set: { status: 'running', 'lease.workerId': 'worker-A', 'lease.expiresAt': new Date('2026-07-10T10:00:30.000Z') },
      $inc: { attempt: 1 },
    });
  });

  test('un échec réessayable conserve le checkpoint et planifie un backoff', async () => {
    const current = { _id: new mongoose.Types.ObjectId(), status: 'running', attempt: 2, maxAttempts: 5 };
    const updated = { ...current, status: 'retry_wait' };
    const Journal = {
      findOne: jest.fn(() => query(current)),
      findOneAndUpdate: jest.fn(async () => updated),
    };
    const result = await makeDocumentSyncService({ Journal, Logical: {}, Copy: {}, Location: {}, clock: () => now }).fail({
      tenantId, operationId: 'sync-2', workerId: 'worker-A', retryable: true,
      error: { code: 'NETWORK', message: 'timeout' },
    });
    expect(result.willRetry).toBe(true);
    expect(Journal.findOneAndUpdate.mock.calls[0][1].$set).toMatchObject({
      status: 'retry_wait',
      nextRetryAt: new Date('2026-07-10T10:00:02.000Z'),
      lastError: { code: 'NETWORK', message: 'timeout', retryable: true, at: now },
    });
  });

  test('un conflit est explicite et marque le document et ses copies', async () => {
    const sourceCopy = new mongoose.Types.ObjectId();
    const operation = {
      logicalDocumentId,
      source: { copyId: sourceCopy }, target: {},
      conflict: { kind: 'both_modified' }, status: 'conflict',
    };
    const Journal = { findOneAndUpdate: jest.fn(async () => operation) };
    const Copy = { updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }) };
    const Logical = { updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }) };
    const result = await makeDocumentSyncService({ Journal, Logical, Copy, Location: {}, clock: () => now }).recordConflict({
      tenantId, operationId: 'sync-2', workerId: 'worker-A', conflict: { kind: 'both_modified' },
    });
    expect(result.status).toBe('conflict');
    expect(Copy.updateMany).toHaveBeenCalledWith({
      tenantId, logicalDocumentId, _id: { $in: [sourceCopy] },
    }, { $addToSet: { syncConflicts: operation.operationId } });
    expect(Logical.updateOne).toHaveBeenCalledWith({ tenantId, _id: logicalDocumentId }, { $addToSet: { syncConflicts: operation.operationId } });
  });

  test('nettoie les métadonnées de checkpoint', () => {
    expect(safeMetadata({ safe: 1, '$where': 'bad', 'a.b': 'bad', nested: { ok: true } })).toEqual({ safe: 1, nested: { ok: true } });
  });
});
