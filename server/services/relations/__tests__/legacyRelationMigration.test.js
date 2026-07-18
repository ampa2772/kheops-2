const { makeLegacyRelationMigration, planLegacyRelations } = require('../legacyRelationMigration');

describe('planLegacyRelations', () => {
  test('adapte les anciennes liaisons avec provenance et idempotence', () => {
    const plan = planLegacyRelations({
      DossierContact: [{ _id: 'L1', dossier: 'D1', contact: 'C1' }],
      ContactRepresentantLegal: [{ _id: 'L2', contactPM: 'PM1', representantLegal: 'R1' }],
    });
    expect(plan.scanned).toBe(2);
    expect(plan.unique).toHaveLength(2);
    expect(plan.unique[0].input.provenance).toMatchObject({ source: 'migration', sourceCollection: 'DossierContact', sourceId: 'L1' });
    expect(plan.unique[0].input.idempotencyKey).toBe('legacy-relation:DossierContact:L1');
  });

  test('déduplique deux liaisons sémantiquement identiques', () => {
    const plan = planLegacyRelations({
      DossierContact: [
        { _id: 'L1', dossier: 'D1', contact: 'C1' },
        { _id: 'L2', dossier: 'D1', contact: 'C1' },
      ],
    });
    expect(plan.unique).toHaveLength(1);
    expect(plan.duplicates).toHaveLength(1);
    expect(plan.duplicates[0].duplicateOf).toBe('L1');
  });

  test('ignore explicitement les liaisons incomplètes', () => {
    const plan = planLegacyRelations({ ContactPartie: [{ _id: 'L1', contact: 'C1' }] });
    expect(plan.unique).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe('incomplete_relation');
  });

  test('le dry-run ne touche ni aux relations ni au journal de migration', async () => {
    const Relation = { findOne: jest.fn() };
    const MigrationRun = { findOne: jest.fn(), create: jest.fn() };
    const relations = { createRelation: jest.fn() };
    const result = await makeLegacyRelationMigration({ Relation, MigrationRun, relations }).execute({
      tenantId: 'T1', userId: 'U1', dryRun: true,
      sources: { DossierContact: [{ _id: 'L1', dossier: 'D1', contact: 'C1' }] },
    });
    expect(result.dryRun).toBe(true);
    expect(MigrationRun.findOne).not.toHaveBeenCalled();
    expect(MigrationRun.create).not.toHaveBeenCalled();
    expect(relations.createRelation).not.toHaveBeenCalled();
  });
});
