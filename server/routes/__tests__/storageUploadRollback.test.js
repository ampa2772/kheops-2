// Tests A5 — atomicité de l'upload storage : réservation quota + rollback complet
// (blob physique ET quota) si une étape échoue.

const mongoose = require('mongoose');

function loadUpload({ saveImpl, reserveImpl } = {}) {
  jest.resetModules();

  const deleteVersion = jest.fn().mockResolvedValue(undefined);
  const uploadVersion = jest.fn().mockResolvedValue({ storageKey: 'onedrive:userA:IT1', size: 10, mime: 'application/pdf', filename: 'f.pdf' });
  const provider = { createVersionId: () => 'v1', uploadVersion, deleteVersion };

  const reserveQuota = jest.fn(reserveImpl || (() => Promise.resolve({ usedBytes: 10, quotaBytes: 100 })));
  const releaseQuota = jest.fn().mockResolvedValue({ usedBytes: 0 });
  const getUsage = jest.fn().mockResolvedValue({ usedBytes: 10, quotaBytes: 100 });
  class QuotaExceededError extends Error { constructor() { super('q'); this.statusCode = 413; this.code = 'QUOTA_EXCEEDED'; } }

  const save = jest.fn(saveImpl || (() => Promise.resolve()));

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../middlewares/requireTenant', () => (req, res, next) => next());
  jest.doMock('../../utils/ownershipHelpers', () => ({ ensureDossierOwnership: jest.fn().mockResolvedValue(true) }));
  jest.doMock('../../models/Storage/StoredDocument', () => function StoredDocument(data) {
    Object.assign(this, data);
    this._id = new mongoose.Types.ObjectId();
    this.save = save;
    this.toObject = () => ({ ...data, _id: this._id, versions: data.versions || [] });
  });
  jest.doMock('../../services/storage', () => ({
    getStorageProvider: jest.fn().mockResolvedValue(provider),
    resolveTenantId: jest.fn(() => new mongoose.Types.ObjectId()),
    selectStorageProvider: jest.fn(),
    toTenantObjectId: jest.fn(() => new mongoose.Types.ObjectId()),
    assertUploadCompleted: jest.fn(), // A4 : no-op (provider non per-user ici)
  }));
  jest.doMock('../../services/storage/quota', () => ({ QuotaExceededError, reserveQuota, releaseQuota, getUsage }));

  const router = require('../storage');
  const layer = router.stack.find((l) => l.route?.path === '/documents/upload' && l.route.methods.post);
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  return { handler, uploadVersion, deleteVersion, reserveQuota, releaseQuota, getUsage, save };
}

function fakeReqRes() {
  const req = {
    user: String(new mongoose.Types.ObjectId()),
    body: {},
    file: { buffer: Buffer.from('0123456789'), size: 10, originalname: 'f.pdf', mimetype: 'application/pdf' },
    method: 'POST',
    originalUrl: '/api/storage/documents/upload',
  };
  const res = {
    statusCode: 200,
    status: jest.fn(function (c) { this.statusCode = c; return this; }),
    json: jest.fn(function (p) { this.payload = p; return this; }),
  };
  return { req, res };
}

test('succès : réserve le quota, upload, sauvegarde, pas de rollback', async () => {
  const { handler, uploadVersion, deleteVersion, reserveQuota, releaseQuota } = loadUpload();
  const { req, res } = fakeReqRes();
  await handler(req, res);
  expect(reserveQuota).toHaveBeenCalledTimes(1);
  expect(reserveQuota.mock.calls[0][1]).toBe(10); // réserve la taille du fichier
  expect(uploadVersion).toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(201);
  expect(deleteVersion).not.toHaveBeenCalled();
  expect(releaseQuota).not.toHaveBeenCalled();
});

test('🔒 échec de save APRÈS upload → rollback : blob supprimé ET quota libéré', async () => {
  const { handler, deleteVersion, releaseQuota } = loadUpload({
    saveImpl: () => Promise.reject(new Error('mongo down')),
  });
  const { req, res } = fakeReqRes();
  await handler(req, res);
  expect(deleteVersion).toHaveBeenCalledWith({ storageKey: 'onedrive:userA:IT1' });
  expect(releaseQuota).toHaveBeenCalled();
  expect(releaseQuota.mock.calls[0][1]).toBe(10); // libère exactement ce qui a été réservé
  expect(res.status).toHaveBeenCalledWith(500);
});

test('🔒 quota dépassé → 413, aucun upload, aucun rollback (rien n\'a été réservé)', async () => {
  const { handler, uploadVersion, deleteVersion, releaseQuota } = loadUpload({
    reserveImpl: () => { const e = new Error('q'); e.statusCode = 413; e.code = 'QUOTA_EXCEEDED'; return Promise.reject(e); },
  });
  const { req, res } = fakeReqRes();
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(413);
  expect(uploadVersion).not.toHaveBeenCalled();
  expect(deleteVersion).not.toHaveBeenCalled();
  expect(releaseQuota).not.toHaveBeenCalled();
});
