// Tests A4 — côté route : upload annulé si la sync n'est pas confirmée +
// endpoint GET /documents/:id/verify.

const mongoose = require('mongoose');

function load({ providerExists, findOneDoc } = {}) {
  jest.resetModules();

  const deleteVersion = jest.fn().mockResolvedValue(undefined);
  const uploadVersion = jest.fn().mockResolvedValue({ storageKey: 'onedrive:userA:IT1', size: 10, mime: 'application/pdf', filename: 'f.pdf' });
  const exists = jest.fn(providerExists);
  const provider = { createVersionId: () => 'v1', uploadVersion, deleteVersion, exists, perUser: true };

  const releaseQuota = jest.fn().mockResolvedValue({ usedBytes: 0 });
  const reserveQuota = jest.fn().mockResolvedValue({ usedBytes: 10, quotaBytes: 100 });
  const getUsage = jest.fn().mockResolvedValue({ usedBytes: 10, quotaBytes: 100 });
  class QuotaExceededError extends Error {}
  const save = jest.fn().mockResolvedValue();

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../middlewares/requireTenant', () => (req, res, next) => next());
  jest.doMock('../../utils/ownershipHelpers', () => ({ ensureDossierOwnership: jest.fn().mockResolvedValue(true) }));
  jest.doMock('../../models/Storage/StoredDocument', () => {
    function StoredDocument(data) { Object.assign(this, data); this._id = new mongoose.Types.ObjectId(); this.save = save; this.toObject = () => ({ ...data, _id: this._id, versions: data.versions || [] }); }
    StoredDocument.findOne = jest.fn().mockResolvedValue(findOneDoc || null);
    return StoredDocument;
  });
  jest.doMock('../../services/storage', () => ({
    getStorageProvider: jest.fn().mockResolvedValue(provider),
    // Volet B : la route upload resout le provider PAR UTILISATEUR via
    // getUploadProvider (et non plus getStorageProvider seul).
    getUploadProvider: jest.fn().mockResolvedValue(provider),
    getProviderForStorageKey: jest.fn().mockResolvedValue(provider),
    resolveTenantId: jest.fn(() => 'TENANT1'),
    selectStorageProvider: jest.fn(),
    toTenantObjectId: jest.fn((x) => x),
    // On garde la VRAIE logique de validation (c'est ce qu'on teste au niveau route).
    assertUploadCompleted: jest.requireActual('../../services/storage').assertUploadCompleted,
  }));
  jest.doMock('../../services/storage/quota', () => ({ QuotaExceededError, reserveQuota, releaseQuota, getUsage }));

  const router = require('../storage');
  const findRoute = (path, method) => {
    const layer = router.stack.find((l) => l.route?.path === path && l.route.methods[method]);
    return layer.route.stack[layer.route.stack.length - 1].handle;
  };
  return { uploadHandler: findRoute('/documents/upload', 'post'), verifyHandler: findRoute('/documents/:id/verify', 'get'), uploadVersion, deleteVersion, releaseQuota, exists };
}

function res() {
  return { statusCode: 200, status: jest.fn(function (c) { this.statusCode = c; return this; }), json: jest.fn(function (p) { this.payload = p; return this; }), setHeader: jest.fn(), send: jest.fn() };
}
const uploadReq = () => ({ user: String(new mongoose.Types.ObjectId()), body: {}, file: { buffer: Buffer.from('0123456789'), size: 10, originalname: 'f.pdf', mimetype: 'application/pdf' } });
const VALID_ID = new mongoose.Types.ObjectId().toString();

describe('upload — validation de complétion', () => {
  test('🔒 fichier absent chez le fournisseur → rollback (blob + quota), pas de commit', async () => {
    const { uploadHandler, deleteVersion, releaseQuota } = load({ providerExists: async () => false });
    const r = res();
    await uploadHandler(uploadReq(), r);
    expect(r.status).toHaveBeenCalledWith(502);
    expect(deleteVersion).toHaveBeenCalledWith({ storageKey: 'onedrive:userA:IT1' });
    expect(releaseQuota).toHaveBeenCalledWith('TENANT1', 10);
  });

  test('fichier bien présent → commit (201)', async () => {
    const { uploadHandler, deleteVersion } = load({ providerExists: async () => true });
    const r = res();
    await uploadHandler(uploadReq(), r);
    expect(r.status).toHaveBeenCalledWith(201);
    expect(deleteVersion).not.toHaveBeenCalled();
  });

  test('vérification inconclusive (exists lève) → ne bloque pas → commit', async () => {
    const { uploadHandler } = load({ providerExists: async () => { throw new Error('net'); } });
    const r = res();
    await uploadHandler(uploadReq(), r);
    expect(r.status).toHaveBeenCalledWith(201);
  });
});

describe('GET /documents/:id/verify', () => {
  const doc = { versions: [{ versionId: 'v1', storageKey: 'k1' }], currentVersionId: 'v1', toObject() { return this; } };

  test('présent → { synced: true }', async () => {
    const { verifyHandler } = load({ providerExists: async () => true, findOneDoc: doc });
    const r = res();
    await verifyHandler({ params: { id: VALID_ID }, query: {} }, r);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ synced: true, versionId: 'v1' }));
  });

  test('🔒 disparu → { synced: false } (dérive détectée)', async () => {
    const { verifyHandler } = load({ providerExists: async () => false, findOneDoc: doc });
    const r = res();
    await verifyHandler({ params: { id: VALID_ID }, query: {} }, r);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ synced: false }));
  });

  test('inconclusif → { synced: null }', async () => {
    const { verifyHandler } = load({ providerExists: async () => { throw new Error('net'); }, findOneDoc: doc });
    const r = res();
    await verifyHandler({ params: { id: VALID_ID }, query: {} }, r);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ synced: null }));
  });

  test('document introuvable → 404', async () => {
    const { verifyHandler } = load({ providerExists: async () => true, findOneDoc: null });
    const r = res();
    await verifyHandler({ params: { id: VALID_ID }, query: {} }, r);
    expect(r.status).toHaveBeenCalledWith(404);
  });
});
