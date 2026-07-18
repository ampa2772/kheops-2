const DOC_ID = '64b64b64b64b64b64b64b64b';

function response() {
  return {
    statusCode: 200,
    headers: {},
    status: jest.fn(function setStatus(code) { this.statusCode = code; return this; }),
    json: jest.fn(function sendJson(payload) { this.payload = payload; return this; }),
    setHeader: jest.fn(function setHeader(name, value) { this.headers[name] = value; }),
    send: jest.fn(function send(payload) { this.body = payload; return this; }),
  };
}

function loadRoute({ ownership, findHistory } = {}) {
  jest.resetModules();
  const ensureDocOwnership = jest.fn(ownership || (async () => ({
    ok: true,
    tenantId: 'tenant-autorise',
    dossierId: 'dossier-autorise',
  })));
  const history = {
    _id: 'history-1',
    tenantId: 'tenant-autorise',
    dossierId: 'dossier-autorise',
    documentId: DOC_ID,
    currentVersionId: 'v1',
    versions: [{ versionId: 'v1', filename: 'contrat.docx' }],
  };
  const DocumentHistory = {
    findOne: jest.fn(findHistory || (async () => history)),
  };
  const readVersion = jest.fn().mockResolvedValue({
    version: history.versions[0],
    buffer: Buffer.from('version'),
  });
  const promoteVersion = jest.fn().mockResolvedValue(history.versions[0]);
  const toClient = jest.fn((value) => ({
    documentId: value.documentId,
    currentVersionId: value.currentVersionId,
    versions: value.versions,
  }));
  const saveCanonicalDocument = jest.fn().mockResolvedValue(undefined);

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../utils/ownershipHelpers', () => ({ ensureDocOwnership }));
  jest.doMock('../../models/Storage/DocumentHistory', () => DocumentHistory);
  jest.doMock('../../services/documentHistoryService', () => ({ readVersion, promoteVersion, toClient }));
  jest.doMock('../../services/documentContentService', () => ({ saveCanonicalDocument }));
  jest.doMock('../../utils/auditLogger', () => ({ update: jest.fn() }));

  const router = require('../documentHistory');
  const handler = (path, method) => {
    const layer = router.stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
    return layer.route.stack[layer.route.stack.length - 1].handle;
  };
  return {
    handlers: {
      list: handler('/:docId', 'get'),
      download: handler('/:docId/versions/:versionId/download', 'get'),
    },
    DocumentHistory,
    ensureDocOwnership,
    readVersion,
  };
}

function request(params = {}) {
  return {
    user: 'user-1',
    params: { docId: DOC_ID, ...params },
    method: 'GET',
    originalUrl: `/api/document-history/${DOC_ID}`,
  };
}

describe('documentHistory — cloisonnement tenant/dossier', () => {
  test('la recherche Mongo contient toujours le tenant et le dossier issus de l’ownership', async () => {
    const { handlers, DocumentHistory } = loadRoute();
    const res = response();

    await handlers.list(request(), res);

    expect(res.statusCode).toBe(200);
    expect(DocumentHistory.findOne).toHaveBeenCalledWith({
      tenantId: 'tenant-autorise',
      dossierId: 'dossier-autorise',
      documentId: DOC_ID,
    });
  });

  test('un historique homonyme d’un autre tenant n’est jamais renvoyé', async () => {
    const findHistory = async (filter) => {
      // Simule un document portant le même identifiant logique dans un autre
      // tenant : il ne serait divulgué que si la route omettait le tenant.
      if (!Object.prototype.hasOwnProperty.call(filter, 'tenantId')) {
        return { tenantId: 'tenant-étranger', documentId: DOC_ID, versions: [] };
      }
      return null;
    };
    const { handlers, DocumentHistory } = loadRoute({ findHistory });
    const res = response();

    await handlers.list(request(), res);

    expect(res.statusCode).toBe(404);
    expect(res.payload.error).toBe('HISTORY_NOT_FOUND');
    expect(DocumentHistory.findOne).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-autorise',
      dossierId: 'dossier-autorise',
    }));
  });

  test('un accès dossier révoqué arrête le téléchargement avant la lecture de version', async () => {
    const ownership = async (req, res) => {
      res.status(403).json({ error: 'DOCUMENT_ACCESS_DENIED' });
      return { ok: false };
    };
    const { handlers, DocumentHistory, readVersion } = loadRoute({ ownership });
    const res = response();

    await handlers.download(request({ versionId: 'v1' }), res);

    expect(res.statusCode).toBe(403);
    expect(DocumentHistory.findOne).not.toHaveBeenCalled();
    expect(readVersion).not.toHaveBeenCalled();
  });
});
