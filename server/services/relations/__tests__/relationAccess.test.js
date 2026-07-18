const mongoose = require('mongoose');
const { endpointDossierIds, makeRelationAccess } = require('../relationAccess');

function links(value) {
  return { select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(value) })) };
}

describe('relationAccess', () => {
  const dossierId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();

  test('détecte dossier et matter dans les deux extrémités', () => {
    expect(endpointDossierIds({
      subject: { entityType: 'dossier', entityId: String(dossierId) },
      object: { entityType: 'contact', entityId: 'C1' },
    })).toEqual([String(dossierId)]);
  });

  test('refuse une relation vers un dossier sans lien UserDossier', async () => {
    const DossierLink = { find: jest.fn(() => links([])) };
    const DossierModel = { findOne: jest.fn(() => links({ _id: dossierId, tenantId })) };
    const access = makeRelationAccess({ DossierLink, DossierModel, accessibleUsers: async () => ['U1'], tenantRole: async () => 'collaborateur' });
    await expect(access.assertRelationAccess({
      tenantId, userId: 'U1',
      relation: { subject: { entityType: 'matter', entityId: String(dossierId) }, object: { entityType: 'contact', entityId: 'C1' } },
    })).rejects.toMatchObject({ statusCode: 403, code: 'DOSSIER_ACCESS_DENIED' });
  });

  test('filtre les relations qui révéleraient un dossier inaccessible', async () => {
    const allowed = new mongoose.Types.ObjectId();
    const denied = new mongoose.Types.ObjectId();
    const DossierLink = { find: jest.fn(() => links([{ dossier: allowed }])) };
    const DossierModel = { find: jest.fn(() => links([{ _id: allowed, tenantId }])) };
    const access = makeRelationAccess({ DossierLink, DossierModel, accessibleUsers: async () => ['U1'], tenantRole: async () => 'collaborateur' });
    const relations = await access.filterAccessibleRelations({ tenantId, userId: 'U1', relations: [
      { _id: 'R1', subject: { entityType: 'dossier', entityId: String(allowed) } },
      { _id: 'R2', subject: { entityType: 'dossier', entityId: String(denied) } },
      { _id: 'R3', subject: { entityType: 'contact', entityId: 'C1' } },
    ] });
    expect(relations.map((item) => item._id)).toEqual(['R1', 'R3']);
  });

  test('réserve l’audit global à owner/admin', async () => {
    const access = makeRelationAccess({ DossierLink: {}, accessibleUsers: jest.fn(), tenantRole: async () => 'secretaire' });
    await expect(access.assertAuditAdmin({ tenantId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId() }))
      .rejects.toMatchObject({ code: 'RELATION_AUDIT_ADMIN_REQUIRED' });
  });
});
