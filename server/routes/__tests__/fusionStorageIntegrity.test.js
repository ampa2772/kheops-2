// Tests A17/A19 (reliquat fusion) — intégrité du stockage sur les routes
// de fiches de documents (dossier.dossier.documents) :
//   - POST /fusion/deleteDocument : retirer la fiche met AUSSI en corbeille le
//     fichier stocké lié (StoredDocument.documentId) et rend son quota.
//   - POST /fusion/duplicateDocument : refuse la « copie fantôme » d'un
//     document stocké en nuage (fiche dupliquée sans fichier derrière) ;
//     le chemin hérité (fiche sans fichier nuage) reste inchangé.
//
// Les handlers de fusion.js sont des async simples (pas d'asyncHandler) :
// `await handler(req, res)` suffit.

const mongoose = require('mongoose');

const DOSSIER_ID = new mongoose.Types.ObjectId().toString();
const DOC_ID = new mongoose.Types.ObjectId().toString();

const selectLean = (data) => ({ select: () => ({ lean: async () => data }) });

function fakeDossier(docIds) {
  const arr = docIds.map((id) => ({ _id: id, nomDocument: 'doc.pdf', toString: undefined }));
  arr.pull = function (id) {
    const i = this.findIndex((d) => String(d._id) === String(id));
    if (i >= 0) this.splice(i, 1);
  };
  return {
    dossier: { documents: arr },
    save: jest.fn().mockResolvedValue(),
    markModified: jest.fn(),
  };
}

function loadHandlers({ dossier, storedDocForDuplicate = null, releaseResult, releaseThrows = false }) {
  jest.resetModules();

  const Dossier = { findById: jest.fn().mockResolvedValue(dossier) };
  const StoredDocument = { findOne: jest.fn().mockReturnValue(selectLean(storedDocForDuplicate)) };
  const releaseDocument = releaseThrows
    ? jest.fn().mockRejectedValue(new Error('panne stockage'))
    : jest.fn().mockResolvedValue(releaseResult || { count: 0, releasedBytes: 0 });

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../utils/ownershipHelpers', () => ({
    ensureDossierOwnership: jest.fn().mockResolvedValue(true),
    ensureContactOwnership: jest.fn(),
    ensureOfficeUserOwnership: jest.fn(),
    ensureDocOwnership: jest.fn(),
  }));
  jest.doMock('../../utils/auditLogger', () => ({ create: jest.fn(), update: jest.fn(), delete: jest.fn() }));
  jest.doMock('../../utils/fusionUtils', () => ({ findTemplateByName: jest.fn() }));
  jest.doMock('../../models/Folder/Dossier', () => Dossier);
  jest.doMock('../../models/Storage/StoredDocument', () => StoredDocument);
  jest.doMock('../../services/storage/maintenance', () => ({ releaseDocument }));

  const router = require('../fusion');
  function handlerOf(path) {
    const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods.post);
    if (!layer) throw new Error(`route introuvable : POST ${path}`);
    return layer.route.stack[layer.route.stack.length - 1].handle;
  }

  return {
    Dossier,
    StoredDocument,
    releaseDocument,
    deleteDocument: handlerOf('/deleteDocument'),
    duplicateDocument: handlerOf('/duplicateDocument'),
  };
}

function fakeReqRes(body) {
  const req = { user: 'U1', body, headers: {}, method: 'POST', originalUrl: '/api/fusion/test' };
  const res = {
    statusCode: 200,
    status: jest.fn(function (c) { this.statusCode = c; return this; }),
    json: jest.fn(function (p) { this.payload = p; return this; }),
  };
  return { req, res };
}

afterEach(() => jest.clearAllMocks());

// ============================================================
// deleteDocument — libération du stockage lié
// ============================================================
describe('POST /fusion/deleteDocument', () => {
  test('retire la fiche ET libère le fichier stocké lié (quota rendu)', async () => {
    const dossier = fakeDossier([DOC_ID]);
    const h = loadHandlers({ dossier, releaseResult: { count: 1, releasedBytes: 42 } });
    const { req, res } = fakeReqRes({ dossierId: DOSSIER_ID, docId: DOC_ID });

    await h.deleteDocument(req, res);

    expect(dossier.save).toHaveBeenCalled();
    expect(h.releaseDocument).toHaveBeenCalledWith({ documentId: DOC_ID, dossierId: DOSSIER_ID });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      storage: { count: 1, releasedBytes: 42 },
    }));
    expect(res.statusCode).toBe(200);
  });

  test('🔒 fiche introuvable → 404 et AUCUNE libération de stockage', async () => {
    const dossier = fakeDossier(['autre-doc']);
    const h = loadHandlers({ dossier });
    const { req, res } = fakeReqRes({ dossierId: DOSSIER_ID, docId: DOC_ID });

    await h.deleteDocument(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(h.releaseDocument).not.toHaveBeenCalled();
  });

  test('libération en panne → la suppression de la fiche reste acquise (200, storage à zéro)', async () => {
    const dossier = fakeDossier([DOC_ID]);
    const h = loadHandlers({ dossier, releaseThrows: true });
    const { req, res } = fakeReqRes({ dossierId: DOSSIER_ID, docId: DOC_ID });

    await h.deleteDocument(req, res);

    expect(dossier.save).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      storage: { count: 0, releasedBytes: 0 },
    }));
  });
});

// ============================================================
// duplicateDocument — refus des copies fantômes
// ============================================================
describe('POST /fusion/duplicateDocument', () => {
  test('🔒 document stocké en nuage → 409 DUPLICATE_CLOUD_NOT_SUPPORTED, aucune fiche ajoutée', async () => {
    const dossier = fakeDossier([DOC_ID]);
    const h = loadHandlers({ dossier, storedDocForDuplicate: { _id: 'SD1' } });
    const { req, res } = fakeReqRes({ dossierId: DOSSIER_ID, docId: DOC_ID });

    await h.duplicateDocument(req, res);

    expect(h.StoredDocument.findOne).toHaveBeenCalledWith({ documentId: DOC_ID, deletedAt: null });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.payload.error).toBe('DUPLICATE_CLOUD_NOT_SUPPORTED');
    expect(dossier.dossier.documents).toHaveLength(1); // rien ajouté
    expect(dossier.save).not.toHaveBeenCalled();
  });

  test('document hérité (sans fichier nuage) → duplication de fiche inchangée (201)', async () => {
    const dossier = fakeDossier([DOC_ID]);
    const h = loadHandlers({ dossier, storedDocForDuplicate: null });
    const { req, res } = fakeReqRes({ dossierId: DOSSIER_ID, docId: DOC_ID });

    await h.duplicateDocument(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(dossier.dossier.documents).toHaveLength(2);
    expect(dossier.save).toHaveBeenCalled();
    expect(res.payload.doc.nomDocument).toBe('doc.pdf');
  });
});
