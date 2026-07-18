const mongoose = require('mongoose');
const { constantTimeWorkerTokenMatches, makeDocumentSyncAccess } = require('../documentSyncAccess');

function selectedLean(value) {
  return { select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(value) })) };
}

describe('documentSyncAccess', () => {
  const tenantId = new mongoose.Types.ObjectId();
  const logicalDocumentId = new mongoose.Types.ObjectId();
  const dossierId = new mongoose.Types.ObjectId();

  test('compare le secret worker sans comparaison de chaîne variable', () => {
    const secret = 's'.repeat(48);
    expect(constantTimeWorkerTokenMatches({ headers: { 'x-kheops-sync-worker-token': secret } }, secret)).toBe(true);
    expect(constantTimeWorkerTokenMatches({ headers: { 'x-kheops-sync-worker-token': `${secret}x` } }, secret)).toBe(false);
    expect(constantTimeWorkerTokenMatches({ headers: { 'x-kheops-sync-worker-token': 'court' } }, 'court')).toBe(false);
  });

  test('refuse le document si aucun lien UserDossier accessible n’existe', async () => {
    const Logical = { findOne: jest.fn(() => selectedLean({ _id: logicalDocumentId, tenantId, dossierId })) };
    const DossierLink = { exists: jest.fn().mockResolvedValue(null) };
    const DossierModel = { findOne: jest.fn(() => selectedLean({ _id: dossierId, tenantId })) };
    const access = makeDocumentSyncAccess({
      Logical, Copy: {}, Journal: {}, DossierLink, DossierModel,
      accessibleUsers: async () => ['U1'], tenantRole: async () => 'collaborateur',
    });
    await expect(access.assertDocumentAccess({ tenantId, userId: 'U1', logicalDocumentId }))
      .rejects.toMatchObject({ statusCode: 403, code: 'DOSSIER_ACCESS_DENIED' });
    expect(DossierLink.exists).toHaveBeenCalledWith({
      user: { $in: ['U1'] }, dossier: expect.any(mongoose.Types.ObjectId),
    });
  });

  test('refuse un dossier rattaché à un autre tenant même si un lien existe', async () => {
    const Logical = { findOne: jest.fn(() => selectedLean({ _id: logicalDocumentId, tenantId, dossierId })) };
    const DossierLink = { exists: jest.fn().mockResolvedValue({ _id: 'LINK' }) };
    const DossierModel = { findOne: jest.fn(() => selectedLean({ _id: dossierId, tenantId: new mongoose.Types.ObjectId() })) };
    const access = makeDocumentSyncAccess({
      Logical, Copy: {}, Journal: {}, DossierLink, DossierModel,
      accessibleUsers: async () => ['U1'], tenantRole: async () => 'collaborateur',
    });
    await expect(access.assertDocumentAccess({ tenantId, userId: 'U1', logicalDocumentId }))
      .rejects.toMatchObject({ statusCode: 403, code: 'DOSSIER_ACCESS_DENIED' });
    expect(DossierLink.exists).not.toHaveBeenCalled();
  });

  test('refuse les commandes worker à un membre ordinaire sans secret', async () => {
    const access = makeDocumentSyncAccess({
      Logical: {}, Copy: {}, Journal: {}, DossierLink: {},
      accessibleUsers: jest.fn(), tenantRole: async () => 'collaborateur', workerTokenMatches: () => false,
    });
    await expect(access.assertWorkerOrTechnicalAdmin({ tenantId, user: new mongoose.Types.ObjectId() }))
      .rejects.toMatchObject({ statusCode: 403, code: 'DOCUMENT_SYNC_WORKER_REQUIRED' });
  });

  test('autorise un worker muni du secret serveur sans lui attribuer un rôle utilisateur', async () => {
    const access = makeDocumentSyncAccess({
      Logical: {}, Copy: {}, Journal: {}, DossierLink: {},
      accessibleUsers: jest.fn(), tenantRole: jest.fn(), workerTokenMatches: () => true,
    });
    await expect(access.assertWorkerOrTechnicalAdmin({ user: null })).resolves.toEqual({ internalWorker: true });
  });
});
