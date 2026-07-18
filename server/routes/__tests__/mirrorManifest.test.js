// Tests — GET /api/word/mirror/manifest (Phase 2, miroir local du compagnon).
// Contrat : mirrorEnabled UNIQUEMENT pour les comptes au stockage interne
// (managed_gcs) ; manifeste = dossiers de l'utilisateur avec noms lisibles.

const mongoose = require('mongoose');

function load({ providerName, dossiers } = {}) {
  jest.resetModules();

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../utils/ownershipHelpers', () => ({ ensureDocOwnership: jest.fn() }));
  jest.doMock('../../services/fileStorage', () => ({ getFileStorage: () => ({}) }));
  jest.doMock('../../services/storage', () => ({
    getUploadProvider: jest.fn().mockResolvedValue({ name: providerName || 'managed_gcs' }),
    toTenantObjectId: jest.fn((x) => x),
    getProviderForStorageKey: jest.fn(),
  }));
  jest.doMock('../../services/tenantService', () => ({ resolveTenantId: jest.fn().mockResolvedValue('TENANT1') }));
  jest.doMock('../../models/Folder/modelsLiaisons/UserDossier', () => ({
    find: () => ({ select: () => ({ lean: () => Promise.resolve((dossiers || []).map((d) => ({ dossier: d._id }))) }) }),
  }));
  jest.doMock('../../models/Folder/Dossier', () => ({
    find: () => ({ select: () => ({ lean: () => Promise.resolve(dossiers || []) }) }),
  }));

  const router = require('../word');
  const layer = router.stack.find((l) => l.route?.path === '/mirror/manifest' && l.route.methods.get);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function res() {
  return {
    statusCode: 200,
    status: jest.fn(function (c) { this.statusCode = c; return this; }),
    json: jest.fn(function (p) { this.payload = p; return this; }),
  };
}

afterEach(() => jest.clearAllMocks());

test('compte avec cloud personnel (onedrive) → mirrorEnabled: false, pas de manifeste', async () => {
  const handler = load({ providerName: 'onedrive' });
  const r = res();
  await handler({ user: 'userA' }, r);
  expect(r.json).toHaveBeenCalledWith({ mirrorEnabled: false, dossiers: [] });
});

test('client Electron explicite → miroir backend actif aussi pour OneDrive', async () => {
  const dossierId = new mongoose.Types.ObjectId();
  const handler = load({
    providerName: 'onedrive',
    dossiers: [{
      _id: dossierId,
      reference: '202611',
      dossier: { dossier: { nom: 'Dossier cloud' }, documents: [] },
    }],
  });
  const r = res();
  await handler({ user: 'userA', query: { client: 'electron' } }, r);

  const payload = r.json.mock.calls[0][0];
  expect(payload.mirrorEnabled).toBe(true);
  expect(payload.dossiers).toHaveLength(1);
});

test('compte au stockage interne → manifeste avec noms lisibles et documents', async () => {
  const handler = load({
    providerName: 'managed_gcs',
    dossiers: [{
      _id: new mongoose.Types.ObjectId(),
      reference: '202610',
      dossier: {
        dossier: { nom: 'Delmont c/ Abily' },
        documents: [
          { _id: new mongoose.Types.ObjectId(), nomDocument: 'Conclusion.docx', subfolderName: null },
          { _id: new mongoose.Types.ObjectId(), nomDocument: 'Piece1.pdf', subfolderName: 'Pieces' },
        ],
      },
    }],
  });
  const r = res();
  await handler({ user: 'userA' }, r);

  const payload = r.json.mock.calls[0][0];
  expect(payload.mirrorEnabled).toBe(true);
  expect(payload.root).toEqual(['Kheops2', 'Dossiers']);
  expect(payload.dossiers).toHaveLength(1);
  expect(payload.dossiers[0].label).toBe('Delmont c- Abily — 202610');
  expect(payload.dossiers[0].documents).toEqual([
    expect.objectContaining({ name: 'Conclusion.docx', subfolder: null }),
    expect.objectContaining({ name: 'Piece1.pdf', subfolder: 'Pieces' }),
  ]);
});
