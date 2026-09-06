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
      downloadVersion: jest.fn().mockResolvedValue(buffer),
      exists: jest.fn().mockResolvedValue(true),
    };
    const storage = {
      providers: { google_drive: targetProvider },
      getProviderForStorageKey: jest.fn(async (_tenant, key) => key.startsWith('googledrive:') ? targetProvider : sourceProvider),
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
      rememberUpload: jest.fn(async ({ uploadedFile }) => { operation.uploadedFile = uploadedFile; return operation; }),
    };
    const authorization = {
      assertStorageReference: jest.fn().mockResolvedValue(true),
      assertDestination: jest.fn().mockResolvedValue({ providerName: 'google_drive', ownerUserId: String(userId), containerId: 'pinned-folder' }),
    };
    return { operation, logical, targetCopy, sourceLocation, targetLocation, Logical, Version, Copy, Location, sourceProvider, targetProvider, storage, sync, authorization };
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
    expect(f.targetProvider.downloadVersion).toHaveBeenCalledWith({ storageKey: 'googledrive:user:F1' });
    expect(f.sync.rememberUpload.mock.invocationCallOrder[0]).toBeLessThan(f.targetProvider.downloadVersion.mock.invocationCallOrder[0]);
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

  test('refuses an untrusted physical key before reading bytes', async () => {
    const f = fixture();
    f.authorization.assertStorageReference.mockRejectedValue(Object.assign(new Error('forbidden'), {statusCode:403}));
    await expect(makeDocumentSyncWorker(f).runClaimed({operation:f.operation, workerId:'w'})).rejects.toMatchObject({statusCode:403});
    expect(f.sourceProvider.downloadVersion).not.toHaveBeenCalled();
    expect(f.targetProvider.uploadVersion).not.toHaveBeenCalled();
  });

  test('refuses revoked source without touching either provider', async () => {
    const f=fixture(); f.sourceLocation.state='revoked';
    await expect(makeDocumentSyncWorker(f).runClaimed({operation:f.operation, workerId:'w'})).rejects.toMatchObject({conflictKind:'policy_blocked'});
    expect(f.sourceProvider.downloadVersion).not.toHaveBeenCalled();
  });

  test('pins account and container despite a different last author', async () => {
    const f=fixture(); f.targetCopy.lastModifiedBy=new mongoose.Types.ObjectId();
    await makeDocumentSyncWorker(f).runClaimed({operation:f.operation,workerId:'w'});
    expect(f.targetProvider.uploadVersion).toHaveBeenCalledWith(expect.objectContaining({ownerUserId:String(userId),containerId:'pinned-folder'}));
    expect(f.storage.getUploadProvider).not.toHaveBeenCalled();
  });

  test('detects changed remote bytes even when the stored checksum matches source', async () => {
    const f=fixture({targetLocation:{storageKey:'googledrive:user:F0',remoteChecksum:digest}});
    f.targetProvider.downloadVersion.mockResolvedValue(Buffer.from('external change'));
    await expect(makeDocumentSyncWorker(f).runClaimed({operation:f.operation,workerId:'w'})).rejects.toMatchObject({conflictKind:'both_modified'});
    expect(f.targetProvider.uploadVersion).not.toHaveBeenCalled();
    expect(f.sync.complete).not.toHaveBeenCalled();
  });

  test('keeping target reads it and preserves its actual base version', async () => {
    const f=fixture({targetLocation:{storageKey:'googledrive:user:F0'},operation:{conflict:{status:'resolved',resolution:'keep_target'}}});
    const target=Buffer.from('old target'); const targetHash=crypto.createHash('sha256').update(target).digest('hex');
    f.targetCopy.checksum=targetHash; f.targetCopy.basedOnVersionId='v-old'; f.targetProvider.downloadVersion.mockResolvedValue(target);
    await makeDocumentSyncWorker(f).runClaimed({operation:f.operation,workerId:'w'});
    expect(f.Copy.updateOne).toHaveBeenCalledWith(expect.anything(),{$set:expect.objectContaining({checksum:targetHash,basedOnVersionId:'v-old',state:'ready'})});
    expect(f.sync.complete).toHaveBeenCalledWith(expect.objectContaining({result:expect.objectContaining({versionId:'v-old'})}));
    expect(f.targetProvider.uploadVersion).not.toHaveBeenCalled();
  });

  test('resumes read-back after timeout without reuploading', async () => {
    const f=fixture(); const worker=makeDocumentSyncWorker(f);
    f.targetProvider.downloadVersion.mockRejectedValueOnce(Object.assign(new Error('timeout'), {code:'ETIMEDOUT'}));
    await expect(worker.runClaimed({operation:f.operation,workerId:'w'})).rejects.toMatchObject({code:'ETIMEDOUT'});
    expect(f.sync.complete).not.toHaveBeenCalled();
    expect(f.operation.uploadedFile.storageKey).toBe('googledrive:user:F1');
    await worker.runClaimed({operation:f.operation,workerId:'w'});
    expect(f.targetProvider.uploadVersion).toHaveBeenCalledTimes(1);
    expect(f.targetProvider.downloadVersion).toHaveBeenCalledTimes(2);
  });

  test('keeping both creates a separate copy and preserves the previous target',async()=>{
    const f=fixture({targetLocation:{storageKey:'googledrive:user:F0',remoteChecksum:digest},operation:{conflict:{status:'resolved',resolution:'keep_both'}}});
    let extraCopy,extraLocation;
    f.Copy.findOne.mockImplementation(query=>{
      const value=query.copyKey ? extraCopy : String(query._id)===String(sourceCopyId) ? {_id:sourceCopyId,checksum:digest} : f.targetCopy;
      return {lean:async()=>value,then:(yes,no)=>Promise.resolve(value).then(yes,no)};
    });
    f.Copy.create=jest.fn(async row=>(extraCopy={...row,_id:new mongoose.Types.ObjectId()}));
    f.Location.findOne.mockImplementation(query=>{
      const value=query.locationKey ? extraLocation : String(query._id)===String(sourceLocationId) ? f.sourceLocation : f.targetLocation;
      return {lean:async()=>value,then:(yes,no)=>Promise.resolve(value).then(yes,no)};
    });
    f.Location.create.mockImplementation(async row=>(extraLocation={...row,_id:new mongoose.Types.ObjectId()}));
    f.Location.findOneAndUpdate.mockImplementation(async(query,update)=>({...extraLocation,...update.$set}));
    await makeDocumentSyncWorker(f).runClaimed({operation:f.operation,workerId:'w'});
    expect(f.Copy.create).toHaveBeenCalledTimes(1);
    expect(f.Location.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({_id:extraLocation._id,copyId:extraCopy._id}),expect.anything(),expect.anything());
    expect(f.Copy.updateOne).toHaveBeenCalledWith(expect.objectContaining({_id:extraCopy._id}),expect.anything());
    expect(f.Location.updateOne).not.toHaveBeenCalled();
    expect(f.targetLocation.storageKey).toBe('googledrive:user:F0');
    expect(f.sync.complete).toHaveBeenCalledWith(expect.objectContaining({result:expect.objectContaining({copyId:extraCopy._id})}));
  });

  test('does not expose Axios credentials when reporting a failed transfer',async()=>{
    const f=fixture();f.sourceProvider.downloadVersion.mockRejectedValue({response:{status:503},config:{headers:{Authorization:'private-value'}},message:'private-value'});
    const result=await makeDocumentSyncWorker(f).execute({tenantId,operationId:'sync-1',workerId:'w'});
    expect(JSON.stringify(result)).not.toContain('private-value');
    expect(f.sync.fail).toHaveBeenCalledWith(expect.objectContaining({retryable:true}));
  });
});
