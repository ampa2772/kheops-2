const mongoose = require('mongoose');

describe('storage route helpers', () => {
  function loadRouteWithDocumentModel(findOne) {
    jest.resetModules();
    jest.doMock('../../models/Storage/StoredDocument', () => ({ findOne }));
    jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
    jest.doMock('../../utils/ownershipHelpers', () => ({ ensureDossierOwnership: jest.fn() }));
    jest.doMock('../../services/storage', () => ({
      getStorageProvider: jest.fn(),
      resolveTenantId: jest.fn(),
      selectStorageProvider: jest.fn(),
      toTenantObjectId: jest.fn(),
    }));
    class QuotaExceededError extends Error {}
    jest.doMock('../../services/storage/quota', () => ({
      QuotaExceededError,
      addUsage: jest.fn(),
      assertWithinQuota: jest.fn(),
      getUsage: jest.fn(),
    }));
    return require('../storage')._private;
  }

  test('findTenantDocument scope toujours par tenantId', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const docId = new mongoose.Types.ObjectId();
    const findOne = jest.fn().mockResolvedValue(null);
    const { findTenantDocument } = loadRouteWithDocumentModel(findOne);

    await findTenantDocument(tenantId, docId);

    expect(findOne).toHaveBeenCalledTimes(1);
    const query = findOne.mock.calls[0][0];
    expect(String(query.tenantId)).toBe(String(tenantId));
    expect(query.deletedAt).toBe(null);
    expect(query.$or.map((entry) => Object.keys(entry)[0])).toEqual(['_id', 'documentId']);
    expect(query.$or.every((entry) => String(Object.values(entry)[0]) === String(docId))).toBe(true);
  });

  test('findTenantDocument rejette un id invalide avant toute requete', async () => {
    const findOne = jest.fn();
    const { findTenantDocument } = loadRouteWithDocumentModel(findOne);

    await expect(findTenantDocument(new mongoose.Types.ObjectId(), 'not-an-object-id'))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_DOCUMENT_ID' });
    expect(findOne).not.toHaveBeenCalled();
  });
});
