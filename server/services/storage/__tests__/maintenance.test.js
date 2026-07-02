// Tests A17-A19 — intégrité stockage : libération quota + purge physique.

jest.mock('../../../models/Storage/StoredDocument', () => ({ find: jest.fn(), deleteOne: jest.fn() }));
jest.mock('../index', () => ({ getStorageProvider: jest.fn() }));
jest.mock('../quota', () => ({ releaseQuota: jest.fn().mockResolvedValue({ usedBytes: 0 }) }));

const StoredDocument = require('../../../models/Storage/StoredDocument');
const { getStorageProvider } = require('../index');
const { releaseQuota } = require('../quota');
const { documentBytes, releaseDossierDocuments, releaseDocument, purgeSoftDeleted } = require('../maintenance');

afterEach(() => jest.clearAllMocks());

describe('documentBytes', () => {
  test('somme les tailles de toutes les versions', () => {
    expect(documentBytes({ versions: [{ size: 10 }, { size: 5 }, { size: 0 }] })).toBe(15);
    expect(documentBytes({ versions: [] })).toBe(0);
    expect(documentBytes({})).toBe(0);
  });
});

describe('releaseDossierDocuments', () => {
  test('met en corbeille les documents du dossier et rend leur quota (groupé par tenant)', async () => {
    const docs = [
      { tenantId: 'T1', versions: [{ size: 10 }], deletedAt: null, save: jest.fn().mockResolvedValue() },
      { tenantId: 'T1', versions: [{ size: 5 }], deletedAt: null, save: jest.fn().mockResolvedValue() },
    ];
    StoredDocument.find.mockResolvedValue(docs);

    const res = await releaseDossierDocuments({ dossierId: 'D1' });

    expect(StoredDocument.find).toHaveBeenCalledWith({ dossierId: 'D1', deletedAt: null });
    expect(docs[0].deletedAt).toBeInstanceOf(Date);
    expect(docs[0].save).toHaveBeenCalled();
    expect(docs[1].save).toHaveBeenCalled();
    expect(releaseQuota).toHaveBeenCalledWith('T1', 15); // 10 + 5 groupés
    expect(res).toEqual({ count: 2, releasedBytes: 15 });
  });

  test('aucun document → rien à faire, pas de libération', async () => {
    StoredDocument.find.mockResolvedValue([]);
    const res = await releaseDossierDocuments({ dossierId: 'D1' });
    expect(res).toEqual({ count: 0, releasedBytes: 0 });
    expect(releaseQuota).not.toHaveBeenCalled();
  });

  test('sans dossierId → no-op', async () => {
    const res = await releaseDossierDocuments({});
    expect(res).toEqual({ count: 0, releasedBytes: 0 });
    expect(StoredDocument.find).not.toHaveBeenCalled();
  });
});

describe('releaseDocument (reliquat fusion — une seule fiche)', () => {
  test('met en corbeille le document lié à la fiche et rend son quota', async () => {
    const doc = { tenantId: 'T1', versions: [{ size: 42 }], deletedAt: null, save: jest.fn().mockResolvedValue() };
    StoredDocument.find.mockResolvedValue([doc]);

    const res = await releaseDocument({ documentId: 'DOC1', dossierId: 'D1' });

    expect(StoredDocument.find).toHaveBeenCalledWith({ documentId: 'DOC1', dossierId: 'D1', deletedAt: null });
    expect(doc.deletedAt).toBeInstanceOf(Date);
    expect(doc.save).toHaveBeenCalled();
    expect(releaseQuota).toHaveBeenCalledWith('T1', 42);
    expect(res).toEqual({ count: 1, releasedBytes: 42 });
  });

  test('aucun document stocké lié → no-op silencieux (fiche héritée sans fichier nuage)', async () => {
    StoredDocument.find.mockResolvedValue([]);
    const res = await releaseDocument({ documentId: 'DOC1' });
    expect(res).toEqual({ count: 0, releasedBytes: 0 });
    expect(releaseQuota).not.toHaveBeenCalled();
  });

  test('sans documentId → no-op, aucune requête', async () => {
    const res = await releaseDocument({});
    expect(res).toEqual({ count: 0, releasedBytes: 0 });
    expect(StoredDocument.find).not.toHaveBeenCalled();
  });
});

describe('purgeSoftDeleted', () => {
  test('supprime les fichiers puis l\'enregistrement des documents en corbeille anciens', async () => {
    const docs = [{ _id: 'x1', tenantId: 'T1', versions: [{ storageKey: 'k1' }, { storageKey: 'k2' }] }];
    StoredDocument.find.mockResolvedValue(docs);
    const deleteVersion = jest.fn().mockResolvedValue();
    getStorageProvider.mockResolvedValue({ deleteVersion });
    StoredDocument.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const res = await purgeSoftDeleted({ olderThanMs: 1000, now: 100000 });

    // filtre : supprimés depuis > cutoff
    const filter = StoredDocument.find.mock.calls[0][0];
    expect(filter.deletedAt.$ne).toBe(null);
    expect(filter.deletedAt.$lte).toEqual(new Date(100000 - 1000));
    // blobs supprimés puis document retiré
    expect(deleteVersion).toHaveBeenCalledWith({ storageKey: 'k1' });
    expect(deleteVersion).toHaveBeenCalledWith({ storageKey: 'k2' });
    expect(StoredDocument.deleteOne).toHaveBeenCalledWith({ _id: 'x1' });
    expect(res).toEqual({ candidates: 1, purgedDocs: 1, deletedBlobs: 2, blobErrors: 0 });
  });

  test('🔒 échec de suppression d\'un fichier → document CONSERVÉ (retenté plus tard)', async () => {
    const docs = [{ _id: 'x1', tenantId: 'T1', versions: [{ storageKey: 'k1' }, { storageKey: 'k2' }] }];
    StoredDocument.find.mockResolvedValue(docs);
    const deleteVersion = jest.fn()
      .mockResolvedValueOnce() // k1 ok
      .mockRejectedValueOnce(new Error('token expiré')); // k2 échoue
    getStorageProvider.mockResolvedValue({ deleteVersion });

    const res = await purgeSoftDeleted({ olderThanMs: 0, now: 100000 });

    expect(StoredDocument.deleteOne).not.toHaveBeenCalled(); // pas de suppression base
    expect(res).toEqual({ candidates: 1, purgedDocs: 0, deletedBlobs: 1, blobErrors: 1 });
  });

  test('aucun candidat → compteurs à zéro', async () => {
    StoredDocument.find.mockResolvedValue([]);
    const res = await purgeSoftDeleted({});
    expect(res).toEqual({ candidates: 0, purgedDocs: 0, deletedBlobs: 0, blobErrors: 0 });
  });
});
