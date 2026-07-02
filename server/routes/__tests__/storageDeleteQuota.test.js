// Test A17 — DELETE /documents/:id met en corbeille ET rend le quota occupé.

const mongoose = require('mongoose');

function loadDeleteHandler(doc) {
  jest.resetModules();

  const releaseQuota = jest.fn().mockResolvedValue({ usedBytes: 0, quotaBytes: 100 });
  const getUsage = jest.fn().mockResolvedValue({ usedBytes: 0, quotaBytes: 100 });
  class QuotaExceededError extends Error {}

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../middlewares/requireTenant', () => (req, res, next) => next());
  jest.doMock('../../utils/ownershipHelpers', () => ({ ensureDossierOwnership: jest.fn().mockResolvedValue(true) }));
  jest.doMock('../../models/Storage/StoredDocument', () => ({ findOne: jest.fn().mockResolvedValue(doc) }));
  jest.doMock('../../services/storage', () => ({
    getStorageProvider: jest.fn(),
    resolveTenantId: jest.fn(() => 'TENANT1'),
    selectStorageProvider: jest.fn(),
    toTenantObjectId: jest.fn((x) => x),
  }));
  jest.doMock('../../services/storage/quota', () => ({ QuotaExceededError, reserveQuota: jest.fn(), releaseQuota, getUsage }));

  const router = require('../storage');
  const layer = router.stack.find((l) => l.route?.path === '/documents/:id' && l.route.methods.delete);
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  return { handler, releaseQuota };
}

function fakeReqRes(id) {
  const req = { params: { id }, query: {}, method: 'DELETE', originalUrl: `/api/storage/documents/${id}` };
  const res = {
    statusCode: 200,
    status: jest.fn(function (c) { this.statusCode = c; return this; }),
    json: jest.fn(function (p) { this.payload = p; return this; }),
  };
  return { req, res };
}

const VALID_ID = new mongoose.Types.ObjectId().toString();

test('soft-delete + libère le quota (somme des versions)', async () => {
  const doc = {
    _id: VALID_ID,
    versions: [{ size: 10 }, { size: 20 }],
    deletedAt: null,
    save: jest.fn().mockResolvedValue(),
    toObject: () => ({ _id: VALID_ID, versions: [] }),
  };
  const { handler, releaseQuota } = loadDeleteHandler(doc);
  const { req, res } = fakeReqRes(VALID_ID);

  await handler(req, res);

  expect(doc.deletedAt).toBeInstanceOf(Date); // mis en corbeille
  expect(doc.save).toHaveBeenCalled();
  expect(releaseQuota).toHaveBeenCalledWith('TENANT1', 30); // 10 + 20
  expect(res.json).toHaveBeenCalled();
  expect(res.statusCode).toBe(200);
});

test('document introuvable → 404, aucune libération', async () => {
  const { handler, releaseQuota } = loadDeleteHandler(null);
  const { req, res } = fakeReqRes(VALID_ID);
  await handler(req, res);
  expect(res.status).toHaveBeenCalledWith(404);
  expect(releaseQuota).not.toHaveBeenCalled();
});
