// Tests A6 — gardes de RÔLE cabinet sur les routes sensibles :
//   - CARPA : transition d'état, suppression de brouillon, mainlevée de gel LCB-FT
//     → réservés à owner/admin/avocat (le secrétariat prépare, il n'engage pas).
//   - Finances : GET /api/cabinet/bilan et /profitability
//     → réservés à owner/admin (CA consolidé du cabinet).
//
// On utilise le VRAI services/cabinetRoles (résolution de rôle incluse) en
// simulant seulement les modèles Tenant/Membership — le test couvre donc le
// câblage réel garde→route, pas une réimplémentation.
//
// NB : asyncHandler (folder-middleWare) ne RENVOIE pas la promesse du handler →
// on attend l'émission de la réponse via settleHandler() (cf. deleteDossierGuard).

const mongoose = require('mongoose');

const VALID_ID = new mongoose.Types.ObjectId().toString();
const selectLean = (data) => ({ select: () => ({ lean: async () => data }) });

// roleSetup : 'owner' | 'solo' | 'admin' | 'avocat' | 'collaborateur' | 'secretaire'
function loadRouters(roleSetup) {
  jest.resetModules();

  const Tenant = { findOne: jest.fn() };
  const Membership = { find: jest.fn() };
  if (roleSetup === 'owner') {
    Tenant.findOne.mockReturnValue(selectLean({ _id: 'T1' }));
    Membership.find.mockReturnValue(selectLean([]));
  } else if (roleSetup === 'solo') {
    Tenant.findOne.mockReturnValue(selectLean(null));
    Membership.find.mockReturnValue(selectLean([]));
  } else {
    Tenant.findOne.mockReturnValue(selectLean(null));
    Membership.find.mockReturnValue(selectLean([{ role: roleSetup }]));
  }

  const CarpaOperation = { findOne: jest.fn().mockResolvedValue(null), find: jest.fn() };
  const cabinetService = {
    calculerBilan: jest.fn().mockResolvedValue({ recettesTTC: 0 }),
    calculerRentabiliteDossiers: jest.fn().mockResolvedValue([]),
  };

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../models/Cabinet/Tenant', () => Tenant);
  jest.doMock('../../models/Cabinet/Membership', () => Membership);
  jest.doMock('../../utils/securityLogger', () => ({
    log: jest.fn(),
    EVT: { ACCESS_DENIED: 'ACCESS_DENIED' },
  }));
  jest.doMock('../../utils/ownershipHelpers', () => ({
    ensureDossierOwnership: jest.fn().mockResolvedValue(true),
    ensureContactOwnership: jest.fn().mockResolvedValue(true),
    ensureOfficeUserOwnership: jest.fn().mockResolvedValue(true),
    ensureDocOwnership: jest.fn().mockResolvedValue(true),
  }));
  jest.doMock('../../utils/auditLogger', () => ({ create: jest.fn(), update: jest.fn(), delete: jest.fn() }));
  // CARPA
  jest.doMock('../../models/Carpa/CarpaOperation', () => CarpaOperation);
  jest.doMock('../../models/Folder/Dossier', () => ({ findById: jest.fn(), find: jest.fn() }));
  jest.doMock('../../services/carpaService', () => ({
    resolveActiveOfficeUserId: jest.fn().mockResolvedValue('OU1'),
    buildBeneficiaireSnapshot: jest.fn(),
    piecesRequisesPourType: jest.fn().mockReturnValue([]),
    piecesCompletes: jest.fn().mockReturnValue(true),
    piecesManquantes: jest.fn().mockReturnValue([]),
    recalculerFlagsLcbft: jest.fn().mockReturnValue([]),
    masquerRib: jest.fn(),
    beneficiaireResume: jest.fn(),
  }));
  jest.doMock('../../services/carpaAuditService', () => ({
    writeAudit: jest.fn(),
    listAuditForOperation: jest.fn().mockResolvedValue([]),
  }));
  // Cabinet (finances)
  jest.doMock('../../models/Cabinet/CabinetExpense', () => ({ find: jest.fn() }));
  jest.doMock('../../models/Cabinet/CabinetRecurringExpense', () => ({ find: jest.fn() }));
  jest.doMock('../../services/cabinetService', () => cabinetService);

  const carpaRouter = require('../carpa');
  const cabinetRouter = require('../cabinet');

  function handlerOf(router, method, path) {
    const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
    if (!layer) throw new Error(`route introuvable : ${method.toUpperCase()} ${path}`);
    return layer.route.stack[layer.route.stack.length - 1].handle;
  }

  return {
    CarpaOperation,
    cabinetService,
    transition: handlerOf(carpaRouter, 'post', '/operations/:id/transition'),
    deleteOp: handlerOf(carpaRouter, 'delete', '/operations/:id'),
    liftFlag: handlerOf(carpaRouter, 'post', '/operations/:id/flags/:flagId/lift'),
    bilan: handlerOf(cabinetRouter, 'get', '/bilan'),
    profitability: handlerOf(cabinetRouter, 'get', '/profitability'),
  };
}

function fakeReqRes({ body = {}, params = {}, query = {} } = {}) {
  const req = {
    user: 'U1', body, params, query, headers: {},
    method: 'X', originalUrl: '/api/test',
  };
  const res = {
    statusCode: 200,
    status: jest.fn(function (c) { this.statusCode = c; return this; }),
    json: jest.fn(function (p) { this.payload = p; return this; }),
  };
  return { req, res, next: jest.fn() };
}

async function settleHandler(handler, req, res, next) {
  handler(req, res, next);
  for (let i = 0; i < 100; i++) {
    if (res.json.mock.calls.length || next.mock.calls.length) break;
    await new Promise((r) => setImmediate(r));
  }
  if (next.mock.calls.length && next.mock.calls[0][0]) throw next.mock.calls[0][0];
}

afterEach(() => jest.clearAllMocks());

// ============================================================
// CARPA — transition d'état
// ============================================================
describe('POST /carpa/operations/:id/transition', () => {
  test('🔒 secrétaire → 403 ROLE_FORBIDDEN, opération jamais lue', async () => {
    const h = loadRouters('secretaire');
    const { req, res, next } = fakeReqRes({ params: { id: VALID_ID }, body: { nouvelEtat: 'annule' } });
    await settleHandler(h.transition, req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.payload.code).toBe('ROLE_FORBIDDEN');
    expect(h.CarpaOperation.findOne).not.toHaveBeenCalled();
  });

  test('🔒 collaborateur → 403', async () => {
    const h = loadRouters('collaborateur');
    const { req, res, next } = fakeReqRes({ params: { id: VALID_ID }, body: { nouvelEtat: 'annule' } });
    await settleHandler(h.transition, req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('avocat → passe la garde (404 : opération inexistante lue)', async () => {
    const h = loadRouters('avocat');
    const { req, res, next } = fakeReqRes({ params: { id: VALID_ID }, body: { nouvelEtat: 'annule' } });
    await settleHandler(h.transition, req, res, next);
    expect(h.CarpaOperation.findOne).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('utilisateur solo (owner implicite) → passe la garde', async () => {
    const h = loadRouters('solo');
    const { req, res, next } = fakeReqRes({ params: { id: VALID_ID }, body: { nouvelEtat: 'annule' } });
    await settleHandler(h.transition, req, res, next);
    expect(h.CarpaOperation.findOne).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ============================================================
// CARPA — suppression de brouillon
// ============================================================
describe('DELETE /carpa/operations/:id', () => {
  test('🔒 secrétaire → 403, opération jamais lue', async () => {
    const h = loadRouters('secretaire');
    const { req, res, next } = fakeReqRes({ params: { id: VALID_ID } });
    await settleHandler(h.deleteOp, req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(h.CarpaOperation.findOne).not.toHaveBeenCalled();
  });

  test('admin (membre) → passe la garde (404)', async () => {
    const h = loadRouters('admin');
    const { req, res, next } = fakeReqRes({ params: { id: VALID_ID } });
    await settleHandler(h.deleteOp, req, res, next);
    expect(h.CarpaOperation.findOne).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ============================================================
// CARPA — mainlevée d'un gel LCB-FT
// ============================================================
describe('POST /carpa/operations/:id/flags/:flagId/lift', () => {
  test('🔒 collaborateur → 403, opération jamais lue', async () => {
    const h = loadRouters('collaborateur');
    const { req, res, next } = fakeReqRes({ params: { id: VALID_ID, flagId: 'F1' }, body: { motif: 'x' } });
    await settleHandler(h.liftFlag, req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(h.CarpaOperation.findOne).not.toHaveBeenCalled();
  });

  test('avocat → passe la garde (404)', async () => {
    const h = loadRouters('avocat');
    const { req, res, next } = fakeReqRes({ params: { id: VALID_ID, flagId: 'F1' } });
    await settleHandler(h.liftFlag, req, res, next);
    expect(h.CarpaOperation.findOne).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ============================================================
// Finances — bilan et rentabilité (owner/admin SEULEMENT)
// ============================================================
describe('GET /cabinet/bilan et /profitability', () => {
  test('🔒 avocat → 403 sur le bilan (les finances vont au-delà du rôle avocat)', async () => {
    const h = loadRouters('avocat');
    const { req, res, next } = fakeReqRes();
    await settleHandler(h.bilan, req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(h.cabinetService.calculerBilan).not.toHaveBeenCalled();
  });

  test('🔒 secrétaire → 403 sur le bilan', async () => {
    const h = loadRouters('secretaire');
    const { req, res, next } = fakeReqRes();
    await settleHandler(h.bilan, req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(h.cabinetService.calculerBilan).not.toHaveBeenCalled();
  });

  test('admin → bilan calculé et renvoyé', async () => {
    const h = loadRouters('admin');
    const { req, res, next } = fakeReqRes();
    await settleHandler(h.bilan, req, res, next);
    expect(h.cabinetService.calculerBilan).toHaveBeenCalledWith('U1', expect.any(Object));
    expect(res.json).toHaveBeenCalledWith({ recettesTTC: 0 });
  });

  test('titulaire (owner) → bilan OK ; solo → bilan OK', async () => {
    for (const setup of ['owner', 'solo']) {
      const h = loadRouters(setup);
      const { req, res, next } = fakeReqRes();
      await settleHandler(h.bilan, req, res, next);
      expect(h.cabinetService.calculerBilan).toHaveBeenCalled();
    }
  });

  test('🔒 collaborateur → 403 sur la rentabilité', async () => {
    const h = loadRouters('collaborateur');
    const { req, res, next } = fakeReqRes();
    await settleHandler(h.profitability, req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(h.cabinetService.calculerRentabiliteDossiers).not.toHaveBeenCalled();
  });

  test('owner → rentabilité OK', async () => {
    const h = loadRouters('owner');
    const { req, res, next } = fakeReqRes();
    await settleHandler(h.profitability, req, res, next);
    expect(h.cabinetService.calculerRentabiliteDossiers).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ profitability: [] });
  });
});
