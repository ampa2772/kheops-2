// Tests — GET /api/word/:docId/download : repli sur le stockage DOCUMENTAIRE
// (StoredDocument) quand documents/<docId>.docx n'existe pas (documents deposes
// ou herites de l'ancien flux — bug prod 2026-07-06 : Word ne s'ouvrait jamais,
// le compagnon recevait 404).

const mongoose = require('mongoose');

function load({
  wordDocxExists,
  storedDoc,
  providerDownload,
  ownership = { ok: true, dossierId: 'D1' },
  resolvedDocumentContent = null,
} = {}) {
  jest.resetModules();

  const storageExists = jest.fn().mockResolvedValue(!!wordDocxExists);
  const storageRead = jest.fn().mockResolvedValue(Buffer.from('WORD-FLOW-DOCX'));
  const downloadVersion = jest.fn(providerDownload || (async () => Buffer.from('STORED-DOC-BYTES')));
  const resolveDocumentContent = jest.fn().mockResolvedValue(resolvedDocumentContent);

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../utils/ownershipHelpers', () => ({
    ensureDocOwnership: jest.fn().mockResolvedValue(ownership),
  }));
  jest.doMock('../../services/fileStorage', () => ({
    getFileStorage: () => ({ exists: storageExists, read: storageRead, save: jest.fn() }),
  }));
  jest.doMock('../../models/Storage/StoredDocument', () => ({
    findOne: jest.fn(() => ({ lean: () => Promise.resolve(storedDoc || null) })),
  }));
  jest.doMock('../../services/storage', () => ({
    getProviderForStorageKey: jest.fn().mockResolvedValue({ downloadVersion }),
  }));
  jest.doMock('../../services/documentContentService', () => ({ resolveDocumentContent }));
  jest.doMock('../../services/tenantService', () => ({
    resolveTenantId: jest.fn().mockResolvedValue('TENANT1'),
  }));

  const router = require('../word');
  const layer = router.stack.find((l) => l.route?.path === '/:docId/download' && l.route.methods.get);
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  return { handler, storageExists, storageRead, downloadVersion, resolveDocumentContent };
}

function res() {
  return {
    statusCode: 200,
    status: jest.fn(function (c) { this.statusCode = c; return this; }),
    json: jest.fn(function (p) { this.payload = p; return this; }),
    setHeader: jest.fn(),
    send: jest.fn(function (b) { this.body = b; return this; }),
  };
}
const DOC_ID = new mongoose.Types.ObjectId().toString();
const req = () => ({ params: { docId: DOC_ID }, user: 'userA' });

afterEach(() => jest.clearAllMocks());

describe('GET /api/word/:docId/download — repli stockage documentaire', () => {
  test('flux Word present (documents/<id>.docx) → prioritaire, pas de repli', async () => {
    const { handler, storageRead, downloadVersion } = load({ wordDocxExists: true });
    const r = res();
    await handler(req(), r);
    expect(storageRead).toHaveBeenCalled();
    expect(downloadVersion).not.toHaveBeenCalled();
    expect(r.setHeader).toHaveBeenCalledWith(
      'X-Kheops-Base-Version-Id',
      expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    );
    expect(r.send).toHaveBeenCalledWith(Buffer.from('WORD-FLOW-DOCX'));
  });

  test('absent du flux Word + StoredDocument existe → sert la version courante via son provider', async () => {
    const stored = {
      tenantId: 'TENANT1',
      currentVersionId: 'V2',
      versions: [
        { versionId: 'V1', storageKey: 'tenants/T1/old.docx', filename: 'Conclusion (v1).docx' },
        { versionId: 'V2', storageKey: 'tenants/T1/new.docx', filename: 'Conclusion.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      ],
    };
    const { handler, downloadVersion } = load({ wordDocxExists: false, storedDoc: stored });
    const r = res();
    await handler(req(), r);
    // La VERSION COURANTE (V2) est servie, pas la premiere.
    expect(downloadVersion).toHaveBeenCalledWith({ storageKey: 'tenants/T1/new.docx' });
    expect(r.send).toHaveBeenCalledWith(Buffer.from('STORED-DOC-BYTES'));
    expect(r.status).not.toHaveBeenCalledWith(404);
  });

  test('Word reçoit les octets et la précondition de la dernière autosauvegarde Kheops', async () => {
    const latest = Buffer.from('DOCX-DERNIERE-AUTOSAUVEGARDE-KHEOPS');
    const { handler, resolveDocumentContent } = load({
      ownership: { ok: true, tenantId: 'TENANT1', dossierId: 'D1' },
      resolvedDocumentContent: {
        buffer: latest,
        filename: 'Conclusions.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        source: 'document-history',
        versionId: 'autosave-kheops-v8',
      },
    });
    const r = res();

    await handler(req(), r);

    expect(resolveDocumentContent).toHaveBeenCalledWith({
      tenantId: 'TENANT1',
      dossierId: 'D1',
      documentId: DOC_ID,
      fallbackFilename: `${DOC_ID}.docx`,
    });
    expect(r.send).toHaveBeenCalledWith(latest);
    expect(r.setHeader).toHaveBeenCalledWith(
      'X-Kheops-Base-Version-Id',
      'autosave-kheops-v8',
    );
  });

  test('sert un ancien .doc avec ses octets, son nom et application/msword sans le déguiser en DOCX', async () => {
    const legacyBytes = Buffer.from('OLE-DOC-HISTORIQUE');
    const { handler } = load({
      ownership: { ok: true, tenantId: 'TENANT1', dossierId: 'D1' },
      resolvedDocumentContent: {
        buffer: legacyBytes,
        filename: 'Conclusions historiques.doc',
        mime: 'application/msword',
        source: 'document-history',
        versionId: 'legacy-doc-v3',
      },
    });
    const r = res();

    await handler(req(), r);

    expect(r.send).toHaveBeenCalledWith(legacyBytes);
    expect(r.setHeader).toHaveBeenCalledWith('Content-Type', 'application/msword');
    expect(r.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('Conclusions%20historiques.doc'),
    );
    expect(r.setHeader).toHaveBeenCalledWith(
      'X-Kheops-Base-Version-Id',
      'legacy-doc-v3',
    );
  });

  test('absent partout → 404 docx-not-found', async () => {
    const { handler } = load({ wordDocxExists: false, storedDoc: null });
    const r = res();
    await handler(req(), r);
    expect(r.status).toHaveBeenCalledWith(404);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'docx-not-found' }));
  });

  test('repli en erreur (provider leve) → 404 propre, pas 500', async () => {
    const stored = {
      tenantId: 'TENANT1',
      currentVersionId: 'V1',
      versions: [{ versionId: 'V1', storageKey: 'onedrive:userA:GONE', filename: 'x.docx' }],
    };
    const { handler } = load({
      wordDocxExists: false,
      storedDoc: stored,
      providerDownload: async () => { throw new Error('cloud indisponible'); },
    });
    const r = res();
    await handler(req(), r);
    expect(r.status).toHaveBeenCalledWith(404);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'docx-not-found' }));
  });
});
