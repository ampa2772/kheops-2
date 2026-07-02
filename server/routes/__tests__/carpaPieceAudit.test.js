// Tests A21 — audit documentaire des pièces CARPA : l'ajout ET le retrait
// d'une pièce doivent tracer le document attaché (documentId), pas seulement
// la catégorie — sinon une substitution de fichier est indétectable.

const mongoose = require('mongoose');

const OP_ID = new mongoose.Types.ObjectId().toString();
const DOC_ID = new mongoose.Types.ObjectId().toString();
const selectLean = (data) => ({ select: () => ({ lean: async () => data }) });

function loadHandlers({ op }) {
  jest.resetModules();

  const CarpaOperation = { findOne: jest.fn().mockResolvedValue(op) };
  const writeAudit = jest.fn().mockResolvedValue();

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  // Rôle : utilisateur solo → owner (les routes pièces n'ont pas de garde de
  // rôle, mais cabinetRoles est chargé par le module).
  jest.doMock('../../models/Cabinet/Tenant', () => ({ findOne: jest.fn().mockReturnValue(selectLean(null)) }));
  jest.doMock('../../models/Cabinet/Membership', () => ({ find: jest.fn().mockReturnValue(selectLean([])) }));
  jest.doMock('../../utils/securityLogger', () => ({ log: jest.fn(), EVT: { ACCESS_DENIED: 'ACCESS_DENIED' } }));
  jest.doMock('../../utils/ownershipHelpers', () => ({
    ensureDossierOwnership: jest.fn().mockResolvedValue(true),
    ensureContactOwnership: jest.fn().mockResolvedValue(true),
    ensureOfficeUserOwnership: jest.fn().mockResolvedValue(true),
    ensureDocOwnership: jest.fn().mockResolvedValue(true),
  }));
  jest.doMock('../../utils/auditLogger', () => ({ create: jest.fn(), update: jest.fn(), delete: jest.fn() }));
  jest.doMock('../../models/Carpa/CarpaOperation', () => CarpaOperation);
  jest.doMock('../../models/Folder/Dossier', () => ({ findById: jest.fn() }));
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
    writeAudit,
    listAuditForOperation: jest.fn().mockResolvedValue([]),
  }));

  const router = require('../carpa');
  function handlerOf(method, path) {
    const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
    if (!layer) throw new Error(`route introuvable : ${method} ${path}`);
    return layer.route.stack[layer.route.stack.length - 1].handle;
  }
  return {
    writeAudit,
    addPiece: handlerOf('post', '/operations/:id/pieces'),
    removePiece: handlerOf('delete', '/operations/:id/pieces/:pieceId'),
  };
}

function fakeReqRes({ body = {}, params = {} } = {}) {
  const req = { user: 'U1', body, params, headers: {}, method: 'X', originalUrl: '/api/carpa/x' };
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

test('ajout de pièce → audit avec catégorie ET documentId', async () => {
  const op = {
    _id: OP_ID, dossierId: 'D1',
    pieces: { push: jest.fn() },
    save: jest.fn().mockResolvedValue(),
    toObject: () => ({ _id: OP_ID }),
  };
  const h = loadHandlers({ op });
  const { req, res, next } = fakeReqRes({
    params: { id: OP_ID },
    body: { categoriePiece: 'rib', documentId: DOC_ID, nomFichier: 'rib-client.pdf' },
  });
  await settleHandler(h.addPiece, req, res, next);

  expect(op.pieces.push).toHaveBeenCalled();
  expect(h.writeAudit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'piece_add',
    champsModifies: {
      piece: { categoriePiece: 'rib', documentId: DOC_ID, nomFichier: 'rib-client.pdf' },
    },
  }));
  expect(res.statusCode).toBe(200);
});

test('ajout sans document lié → documentId null dans la trace (référence libre)', async () => {
  const op = {
    _id: OP_ID, dossierId: 'D1',
    pieces: { push: jest.fn() },
    save: jest.fn().mockResolvedValue(),
    toObject: () => ({}),
  };
  const h = loadHandlers({ op });
  const { req, res, next } = fakeReqRes({
    params: { id: OP_ID },
    body: { categoriePiece: 'facture' },
  });
  await settleHandler(h.addPiece, req, res, next);

  expect(h.writeAudit).toHaveBeenCalledWith(expect.objectContaining({
    champsModifies: { piece: { categoriePiece: 'facture', documentId: null, nomFichier: '' } },
  }));
});

test('retrait de pièce → audit avec la photographie de la pièce (documentId inclus)', async () => {
  const piece = {
    categoriePiece: 'rib',
    documentId: DOC_ID,
    nomFichier: 'rib-client.pdf',
    deleteOne: jest.fn(),
  };
  const op = {
    _id: OP_ID, dossierId: 'D1',
    pieces: { id: jest.fn().mockReturnValue(piece) },
    save: jest.fn().mockResolvedValue(),
    toObject: () => ({}),
  };
  const h = loadHandlers({ op });
  const { req, res, next } = fakeReqRes({ params: { id: OP_ID, pieceId: 'P1' } });
  await settleHandler(h.removePiece, req, res, next);

  expect(piece.deleteOne).toHaveBeenCalled();
  expect(h.writeAudit).toHaveBeenCalledWith(expect.objectContaining({
    action: 'piece_remove',
    champsModifies: {
      piece: { categoriePiece: 'rib', documentId: DOC_ID, nomFichier: 'rib-client.pdf' },
    },
    resume: expect.stringContaining('rib-client.pdf'),
  }));
});
