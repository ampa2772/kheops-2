const mongoose = require('mongoose');

jest.mock('../../middlewares/middleware-auth', () => (req, _res, next) => next());
jest.mock('../../middlewares/requireTenant', () => (req, _res, next) => next());
jest.mock('../../utils/auditLogger', () => ({ create: jest.fn(), update: jest.fn(), failure: jest.fn() }));

const mockGetHistory = jest.fn();
const mockListRelations = jest.fn();
const mockCreateRelation = jest.fn();
jest.mock('../../services/relations/relationService', () => ({
  getHistory: (...args) => mockGetHistory(...args),
  listRelations: (...args) => mockListRelations(...args),
  createRelation: (...args) => mockCreateRelation(...args),
  transitionRelation: jest.fn(),
  archiveRelation: jest.fn(),
  previewDuplicates: jest.fn(),
}));

jest.mock('../../services/relations/contactIdentityService', () => ({
  register: jest.fn(), resolveAlias: jest.fn(), previewDuplicates: jest.fn(), merge: jest.fn(),
}));

const mockAssertAuditAdmin = jest.fn();
const mockAssertDossierAccess = jest.fn();
const mockAssertRelationAccess = jest.fn();
const mockFilterAccessibleRelations = jest.fn(async ({ relations }) => relations);
jest.mock('../../services/relations/relationAccess', () => ({
  assertAuditAdmin: (...args) => mockAssertAuditAdmin(...args),
  assertDossierAccess: (...args) => mockAssertDossierAccess(...args),
  assertRelationAccess: (...args) => mockAssertRelationAccess(...args),
  filterAccessibleRelations: (...args) => mockFilterAccessibleRelations(...args),
}));

const router = require('../relations');

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

describe('routes relations', () => {
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  beforeEach(() => jest.clearAllMocks());

  test('expose l’historique complet d’une relation logique', async () => {
    const logicalRelationId = new mongoose.Types.ObjectId();
    mockGetHistory.mockResolvedValue([{ revision: 1, isCurrent: false }, { revision: 2, isCurrent: true }]);
    const response = res();
    await handler('/:logicalRelationId/history', 'get')({ tenantId, user: userId, params: { logicalRelationId: String(logicalRelationId) } }, response);
    expect(response.statusCode).toBe(200);
    expect(response.payload.revisions).toHaveLength(2);
    expect(mockGetHistory).toHaveBeenCalledWith({ tenantId, logicalRelationId: String(logicalRelationId) });
  });

  test('la liste transmet les filtres d’entité et la pagination', async () => {
    mockListRelations.mockResolvedValue([{ _id: new mongoose.Types.ObjectId(), relationType: 'represents' }]);
    const response = res();
    await handler('/', 'get')({ tenantId, query: { entityType: 'contact', entityId: 'C1', limit: '25' } }, response);
    expect(response.payload.relations).toHaveLength(1);
    expect(response.payload.nextCursor).toBeTruthy();
    expect(mockListRelations).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'contact', entityId: 'C1', limit: '25' }));
  });

  test('refuse une création liée à un dossier auquel l’utilisateur n’a pas accès', async () => {
    mockAssertRelationAccess.mockRejectedValueOnce(Object.assign(new Error('Accès refusé'), {
      statusCode: 403, code: 'DOSSIER_ACCESS_DENIED',
    }));
    const response = res();
    await handler('/', 'post')({
      tenantId,
      user: userId,
      body: {
        relationType: 'attached_to_dossier',
        subject: { entityType: 'contact', entityId: 'C1' },
        object: { entityType: 'dossier', entityId: new mongoose.Types.ObjectId().toString() },
      },
    }, response);
    expect(response.statusCode).toBe(403);
    expect(response.payload.error).toBe('DOSSIER_ACCESS_DENIED');
    expect(mockCreateRelation).not.toHaveBeenCalled();
  });

  test('réserve la liste globale aux administrateurs/auditeurs', async () => {
    mockAssertAuditAdmin.mockRejectedValueOnce(Object.assign(new Error('Admin requis'), {
      statusCode: 403, code: 'RELATION_AUDIT_ADMIN_REQUIRED',
    }));
    const response = res();
    await handler('/', 'get')({ tenantId, user: userId, query: {} }, response);
    expect(response.statusCode).toBe(403);
    expect(mockListRelations).not.toHaveBeenCalled();
  });
});
