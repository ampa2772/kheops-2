const mongoose = require('mongoose');

jest.mock('../../middlewares/middleware-auth', () => (req, _res, next) => next());
jest.mock('../../middlewares/requireTenant', () => (req, _res, next) => next());
jest.mock('../../utils/auditLogger', () => ({ create: jest.fn(), update: jest.fn(), failure: jest.fn() }));

const mockResolveDocumentAlias = jest.fn();
jest.mock('../../services/sync/logicalDocumentService', () => ({
  resolveDocumentAlias: (...args) => mockResolveDocumentAlias(...args),
  registerDocument: jest.fn(), getDocumentGraph: jest.fn(), addVersion: jest.fn(),
  registerCopy: jest.fn(), registerLocation: jest.fn(),
}));

const mockListOperations = jest.fn();
const mockGetOperation = jest.fn();
const mockClaim = jest.fn();
jest.mock('../../services/sync/documentSyncService', () => ({
  listOperations: (...args) => mockListOperations(...args),
  enqueue: jest.fn(), getOperation: (...args) => mockGetOperation(...args), claim: (...args) => mockClaim(...args), checkpoint: jest.fn(),
  complete: jest.fn(), fail: jest.fn(), recordConflict: jest.fn(), resolveConflict: jest.fn(), resume: jest.fn(),
}));

const mockAssertDossierAccess = jest.fn();
const mockAssertDocumentAccess = jest.fn();
const mockAssertOperationAccess = jest.fn();
const mockAssertTechnicalAdmin = jest.fn();
const mockAssertWorkerOrTechnicalAdmin = jest.fn();
const mockFindLogical = jest.fn();
jest.mock('../../services/sync/documentSyncAccess', () => ({
  assertCopyAccess: jest.fn(),
  assertDossierAccess: (...args) => mockAssertDossierAccess(...args),
  assertDocumentAccess: (...args) => mockAssertDocumentAccess(...args),
  assertOperationAccess: (...args) => mockAssertOperationAccess(...args),
  assertTechnicalAdmin: (...args) => mockAssertTechnicalAdmin(...args),
  assertWorkerOrTechnicalAdmin: (...args) => mockAssertWorkerOrTechnicalAdmin(...args),
  findLogical: (...args) => mockFindLogical(...args),
}));

const router = require('../documentSync');

function handler(path, method) {
  const layer = router.stack.find((item) => item.route && item.route.path === path && item.route.methods[method]);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function res() {
  return {
    statusCode: 200,
    status: jest.fn(function status(code) { this.statusCode = code; return this; }),
    json: jest.fn(function json(payload) { this.payload = payload; return this; }),
  };
}

describe('routes document-sync', () => {
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  beforeEach(() => {
    jest.clearAllMocks();
    mockAssertWorkerOrTechnicalAdmin.mockResolvedValue({ internalWorker: false });
  });

  test('résout une ligne historique par alias tenant+dossier', async () => {
    const dossierId = new mongoose.Types.ObjectId();
    const document = { _id: new mongoose.Types.ObjectId(), identityKey: 'legacy-document:D1' };
    mockResolveDocumentAlias.mockResolvedValue(document);
    const response = res();
    await handler('/documents/resolve', 'get')({
      tenantId, user: userId,
      query: { dossierId: String(dossierId), system: 'legacy-dossier-document', externalId: 'D1' },
    }, response);
    expect(response.payload.document).toBe(document);
    expect(mockResolveDocumentAlias).toHaveBeenCalledWith({
      tenantId, dossierId: String(dossierId), system: 'legacy-dossier-document', externalId: 'D1',
    });
  });

  test('liste le journal filtré et renvoie un curseur', async () => {
    const logicalDocumentId = new mongoose.Types.ObjectId();
    const operation = { _id: new mongoose.Types.ObjectId(), status: 'conflict' };
    mockListOperations.mockResolvedValue([operation]);
    const response = res();
    await handler('/operations', 'get')({
      tenantId, user: userId,
      query: { logicalDocumentId: String(logicalDocumentId), status: 'conflict,failed', limit: '20' },
    }, response);
    expect(response.payload.operations).toEqual([operation]);
    expect(response.payload.nextCursor).toBe(String(operation._id));
    expect(mockListOperations).toHaveBeenCalledWith(expect.objectContaining({ status: 'conflict,failed', limit: '20' }));
  });

  test('ne résout aucun document si le dossier n’est pas accessible', async () => {
    mockAssertDossierAccess.mockRejectedValueOnce(Object.assign(new Error('Accès refusé'), {
      statusCode: 403, code: 'DOSSIER_ACCESS_DENIED',
    }));
    const response = res();
    await handler('/documents/resolve', 'get')({
      tenantId,
      user: userId,
      query: { dossierId: new mongoose.Types.ObjectId().toString(), system: 'legacy', externalId: 'D1' },
    }, response);
    expect(response.statusCode).toBe(403);
    expect(response.payload.error).toBe('DOSSIER_ACCESS_DENIED');
    expect(mockResolveDocumentAlias).not.toHaveBeenCalled();
  });

  test('refuse claim à un membre qui n’est ni worker interne ni admin technique', async () => {
    mockAssertWorkerOrTechnicalAdmin.mockRejectedValueOnce(Object.assign(new Error('Worker requis'), {
      statusCode: 403, code: 'DOCUMENT_SYNC_WORKER_REQUIRED',
    }));
    const response = res();
    await handler('/operations/:operationId/claim', 'post')({
      tenantId,
      user: userId,
      params: { operationId: 'sync-1' },
      body: { workerId: 'fake-worker' },
      headers: {},
    }, response);
    expect(response.statusCode).toBe(403);
    expect(response.payload.error).toBe('DOCUMENT_SYNC_WORKER_REQUIRED');
    expect(mockGetOperation).not.toHaveBeenCalled();
    expect(mockClaim).not.toHaveBeenCalled();
  });
});
