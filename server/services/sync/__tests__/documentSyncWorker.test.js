const crypto = require('crypto');
const mongoose = require('mongoose');
const { makeDocumentSyncWorker } = require('../documentSyncWorker');

function lean(value) {
  return { lean: jest.fn().mockResolvedValue(value) };
}

describe('documentSyncWorker', () => {
  const tenantId = new mongoose.Types.ObjectId();
  const logicalDocumentId = new mongoose.Types.ObjectId();
  const sourceCopyId = new mongoose.Types.ObjectId();
  const targetCopyId = new mongoose.Types.ObjectId();
  const sourceLocationId = new mongoose.Types.ObjectId();
  const targetLocationId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const buffer = Buffer.from('contenu synchronisé');
  const digest = crypto.createHash('sha256').update(buffer).digest('hex');

  function fixture(overrides = {}) {
    const operation = {
      tenantId,
      logicalDocumentId,
      operationId: 'sync-1',
      direction: 'copy',
      status: 'running',
      requestedBy: userId,
      source: { copyId: sourceCopyId, locationId: sourceLocationId, versionId: 'v1', checksum: digest },
      target: { copyId: targetCopyId, locationId: targetLocationId },
      ...overrides.operation,
    };
    const logical = { _id: logicalDocumentId, tenantId, dossierId: new mongoose.Types.ObjectId(), title: 'Acte.docx' };
    const version = { logicalDocumentId, versionId: 'v1', sequence: 1, checksum: digest, filename: 'Acte.docx', mime: 'application/test' };
    const sourceCopy = { _id: sourceCopyId, logicalDocumentId, checksum: digest, createdBy: userId };
    const targetCopy = { _id: targetCopyId, logicalDocumentId, checksum: null, createdBy: userId, lastModifiedBy: userId };
    const sourceLocation = { _id: sourceLocationId, logicalDocumentId, copyId: sourceCopyId, provider: 'managed_gcs', storageKey: 'tenants/source' };
    const targetLocation = {
      _id: targetLocationId, logicalDocumentId, copyId: targetCopyId, provider: 'google_drive',
      storageKey: '', remoteChecksum: '', state: 'available', accountRef: String(userId),
      ...overrides.targetLocation,
    };
    const Logical = { findOne: jest.fn(() => lean(logical)) };
    const Version = { findOne: jest.fn(() => lean(version)) };
    const Copy = {
      findOne: jest.fn((query) => lean(String(query._id) === String(sourceCopyId) ? sourceCopy : targetCopy)),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const Location = {
      findOne: jest.fn((query) => lean(String(query._id) === String(sourceLocationId) ? sourceLocation : targetLocation)),
      findOneAndUpdate: jest.fn().mockResolvedValue({ ...targetLocation, storageKey: 'googledrive:user:F1', remoteChecksum: digest }),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      create: jest.fn(),
    };
    const sourceProvider = { name: 'managed_gcs', downloadVersion: jest.fn().mockResolvedValue(buffer) };
    const targetProvider = {
      name: 'google_drive',
      uploadVersion: jest.fn().mockResolvedValue({ provider: 'google_drive', storageKey: 'googledrive:user:F1', size: buffer.length }),
      exists: jest.fn().mockResolvedValue(true),
    };
    const storage = {
      providers: { google_drive: targetProvider },
      getProviderForStorageKey: jest.fn().mockResolvedValue(sourceProvider),
      getUploadProvider: jest.fn(),
      assertUploadCompleted: jest.fn().mockResolvedValue(undefined),
    };
    const sync = {
      checkpoint: jest.fn().mockResolvedValue(operation),
      complete: jest.fn().mockResolvedValue({ operation: { ...operation, status: 'succeeded' }, idempotent: false }),
      getOperation: jest.fn().mockResolvedValue(operation),
      claim: jest.fn().mockResolvedValue(operation),
      recordConflict: jest.fn().mockImplementation(async ({ conflict }) => ({ ...operation, status: 'conflict', conflict })),
      fail: jest.fn(),
    };
    return { operation, Logical, Version, Copy, Location, sourceProvider, targetProvider, storage, sync };
  }

  test('télécharge, vérifie, charge via le provider cible puis complète le journal', async () => {
    const f = fixture();
    const worker = makeDocumentSyncWorker(f);
    const result = await worker.runClaimed({ operation: f.operation, workerId: 'worker-A', leaseMs: 300000 });
    expect(result.operation.status).toBe('succeeded');
    expect(f.targetProvider.uploadVersion).toHaveBeenCalledWith(expect.objectContaining({
      buffer,
      checksum: digest,
      idempotencyKey: `kheops-sync:${tenantId}:sync-1`,
    }));
    expect(f.storage.assertUploadCompleted).toHaveBeenCalledWith(f.targetProvider, 'googledrive:user:F1');
    expect(f.sync.complete).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({ checksum: digest, copyId: targetCopyId, locationId: targetLocationId }),
    }));
  });

  test('ne renvoie aucun octet si la cible confirmée possède déjà le même checksum', async () => {
    const f = fixture({ targetLocation: { storageKey: 'googledrive:user:F0', remoteChecksum: digest } });
    f.storage.getProviderForStorageKey
      .mockResolvedValueOnce(f.sourceProvider)
      .mockResolvedValueOnce(f.targetProvider);
    const worker = makeDocumentSyncWorker(f);
    const result = await worker.runClaimed({ operation: f.operation, workerId: 'worker-A', leaseMs: 300000 });
    expect(result.operation.status).toBe('succeeded');
    expect(f.targetProvider.uploadVersion).not.toHaveBeenCalled();
    expect(f.sync.complete).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({ deduplicated: true }),
    }));
  });

  test('un checksum source incohérent ouvre un conflit explicite', async () => {
    const f = fixture({ operation: { source: {
      copyId: sourceCopyId, locationId: sourceLocationId, versionId: 'v1', checksum: '0'.repeat(64),
    } } });
    const result = await makeDocumentSyncWorker(f).execute({
      tenantId, operationId: 'sync-1', workerId: 'worker-A',
    });
    expect(result.conflict).toBe(true);
    expect(f.sync.recordConflict).toHaveBeenCalledWith(expect.objectContaining({
      conflict: expect.objectContaining({ kind: 'checksum_mismatch' }),
    }));
    expect(f.targetProvider.uploadVersion).not.toHaveBeenCalled();
  });

  test('une opération déjà réussie est strictement idempotente', async () => {
    const f = fixture();
    f.sync.getOperation.mockResolvedValue({ ...f.operation, status: 'succeeded' });
    const result = await makeDocumentSyncWorker(f).execute({ tenantId, operationId: 'sync-1', workerId: 'worker-A' });
    expect(result).toMatchObject({ succeeded: true, idempotent: true });
    expect(f.sync.claim).not.toHaveBeenCalled();
  });
});
