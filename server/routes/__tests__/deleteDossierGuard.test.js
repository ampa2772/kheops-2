// Tests A7 — garde de rôle + appartenance sur DELETE /api/folder/dossier/:dossierId.
// Modèles et helpers simulés (pas de vraie base). On extrait le handler du
// routeur et on l'appelle avec un req/res factices (même approche que
// mailAttachRoute.test.js).
//
// NB : asyncHandler (folder-middleWare) ne RENVOIE pas la promesse du handler
// (Promise.resolve(fn(...)).catch(next) sans return). `await handler()` ne suffit
// donc pas — on attend que la réponse soit émise via settleHandler().

const mongoose = require('mongoose');

function loadHandler({ ownershipResult, role }) {
  jest.resetModules();

  const ensureDossierOwnership = jest.fn(async (req, res) => {
    if (ownershipResult === false) {
      res.status(403).json({ message: 'refus ownership' });
      return false;
    }
    return true;
  });
  const getCabinetRole = jest.fn().mockResolvedValue(role);
  const canDeleteDossier = (r) => ['owner', 'admin', 'avocat'].includes(r);

  const Dossier = {
    findById: jest.fn().mockResolvedValue({ _id: 'D1' }),
    findByIdAndDelete: jest.fn().mockResolvedValue({ _id: 'D1' }),
    find: jest.fn(),
  };
  const UserDossier = { find: jest.fn(), findOne: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }), insertMany: jest.fn() };
  const AgendaEvent = { deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }) };
  const DossierEventLink = { find: jest.fn().mockResolvedValue([]), deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }) };

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../utils/ownershipHelpers', () => ({
    ensureDossierOwnership,
    ensureContactOwnership: jest.fn(),
    ensureOfficeUserOwnership: jest.fn(),
    ensureDocOwnership: jest.fn(),
  }));
  jest.doMock('../../services/cabinetRoles', () => ({
    getCabinetRole,
    canDeleteDossier,
    ROLES: { OWNER: 'owner', ADMIN: 'admin', AVOCAT: 'avocat', COLLABORATEUR: 'collaborateur', SECRETAIRE: 'secretaire' },
  }));
  jest.doMock('../../models/Folder/Dossier', () => Dossier);
  jest.doMock('../../models/Folder/modelsLiaisons/UserDossier', () => UserDossier);
  jest.doMock('../../models/AgendaEvents/AgendaEvent', () => AgendaEvent);
  jest.doMock('../../models/AgendaEvents/DossierEventLink', () => DossierEventLink);
  jest.doMock('../../utils/auditLogger', () => ({ create: jest.fn(), update: jest.fn(), delete: jest.fn() }));
  jest.doMock('../../utils/securityLogger', () => ({ log: jest.fn(), EVT: { ACCESS_DENIED: 'ACCESS_DENIED' } }));
  // A17 : la cascade appelle désormais le nettoyage stockage (require en ligne).
  jest.doMock('../../services/storage/maintenance', () => ({
    releaseDossierDocuments: jest.fn().mockResolvedValue({ count: 0, releasedBytes: 0 }),
  }));

  const router = require('../folder/folderDossierInteraction');
  const layer = router.stack.find((l) => l.route && l.route.path === '/dossier/:dossierId' && l.route.methods.delete);
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  return { handler, ensureDossierOwnership, getCabinetRole, Dossier };
}

function fakeReqRes(dossierId) {
  const req = { params: { dossierId }, user: 'A', method: 'DELETE', originalUrl: `/api/folder/dossier/${dossierId}` };
  const res = {
    statusCode: 200,
    status: jest.fn(function (c) { this.statusCode = c; return this; }),
    json: jest.fn(function (p) { this.payload = p; return this; }),
  };
  return { req, res, next: jest.fn() };
}

// Lance le handler puis attend que la réponse soit émise (res.status/json) ou
// que next soit appelé — nécessaire car asyncHandler ne renvoie pas la promesse.
async function settleHandler(handler, req, res, next) {
  handler(req, res, next);
  for (let i = 0; i < 100; i++) {
    if (res.status.mock.calls.length || res.json.mock.calls.length || next.mock.calls.length) break;
    await new Promise((r) => setImmediate(r));
  }
  if (next.mock.calls.length && next.mock.calls[0][0]) throw next.mock.calls[0][0];
}

const VALID_ID = new mongoose.Types.ObjectId().toString();

test('🔒 secrétaire → 403, aucune suppression', async () => {
  const { handler, Dossier } = loadHandler({ ownershipResult: true, role: 'secretaire' });
  const { req, res, next } = fakeReqRes(VALID_ID);
  await settleHandler(handler, req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(Dossier.findByIdAndDelete).not.toHaveBeenCalled();
});

test('🔒 collaborateur → 403, aucune suppression', async () => {
  const { handler, Dossier } = loadHandler({ ownershipResult: true, role: 'collaborateur' });
  const { req, res, next } = fakeReqRes(VALID_ID);
  await settleHandler(handler, req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(Dossier.findByIdAndDelete).not.toHaveBeenCalled();
});

test('🔒 dossier hors cabinet (ownership refusé) → aucune suppression, garde de rôle non atteinte', async () => {
  const { handler, Dossier, getCabinetRole } = loadHandler({ ownershipResult: false, role: 'owner' });
  const { req, res, next } = fakeReqRes(VALID_ID);
  await settleHandler(handler, req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(getCabinetRole).not.toHaveBeenCalled();
  expect(Dossier.findByIdAndDelete).not.toHaveBeenCalled();
});

test('avocat + dossier du cabinet → suppression effectuée', async () => {
  const { handler, Dossier } = loadHandler({ ownershipResult: true, role: 'avocat' });
  const { req, res, next } = fakeReqRes(VALID_ID);
  await settleHandler(handler, req, res, next);
  expect(Dossier.findByIdAndDelete).toHaveBeenCalledWith(VALID_ID);
});

test('id invalide → 400 avant tout accès', async () => {
  const { handler, Dossier } = loadHandler({ ownershipResult: true, role: 'owner' });
  const { req, res, next } = fakeReqRes('pas-un-objectid');
  await settleHandler(handler, req, res, next);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(Dossier.findByIdAndDelete).not.toHaveBeenCalled();
});
