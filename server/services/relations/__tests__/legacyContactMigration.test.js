const { makeLegacyContactMigration, planLegacyContacts } = require('../legacyContactMigration');
const mongoose = require('mongoose');

describe('legacyContactMigration', () => {
  test('adapte les trois familles sans fusion automatique', () => {
    const plan = planLegacyContacts({
      Contact: [{ _id: 'C1', prenoms: 'Alice', nom: 'Martin', email: 'same@example.fr' }],
      ContactPM: [{ _id: 'PM1', raisonSociale: 'Cabinet Martin', emailEntreprise: 'same@example.fr' }],
      ContactPMPublique: [{ _id: 'PUB1', denomination: 'Mairie' }],
    });
    expect(plan.unique).toHaveLength(3);
    expect(plan.duplicates).toHaveLength(0);
    expect(plan.likelyDuplicateGroups).toHaveLength(1);
    expect(plan.unique[0].input.provenance[0]).toMatchObject({ source: 'migration', sourceCollection: 'Contact', sourceId: 'C1' });
  });

  test('déduplique uniquement le même alias historique exact', () => {
    const record = { _id: 'C1', prenoms: 'Alice', nom: 'Martin' };
    const plan = planLegacyContacts({ Contact: [record, { ...record }] });
    expect(plan.unique).toHaveLength(1);
    expect(plan.duplicates[0].duplicateOf).toBe('C1');
  });

  test('le dry-run ne crée ni identité ni journal', async () => {
    const MigrationRun = { findOne: jest.fn(), create: jest.fn() };
    const identities = { register: jest.fn(), archiveMigrated: jest.fn() };
    const result = await makeLegacyContactMigration({ Identity: {}, MigrationRun, identities }).execute({
      tenantId: 'T1', userId: 'U1', dryRun: true,
      sources: { Contact: [{ _id: 'C1', prenoms: 'Alice', nom: 'Martin' }] },
    });
    expect(result.dryRun).toBe(true);
    expect(MigrationRun.create).not.toHaveBeenCalled();
    expect(identities.register).not.toHaveBeenCalled();
  });

  test('le rollback archive uniquement les identités créées par ce run', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const identityId = new mongoose.Types.ObjectId();
    const run = {
      options: { resource: 'contact-identities' },
      status: 'completed',
      resources: [{ resourceType: 'contact_identity', resourceId: String(identityId) }],
      stats: { rolledBack: 0 },
      rollback: {},
      save: jest.fn().mockResolvedValue(undefined),
    };
    const MigrationRun = { findOne: jest.fn().mockResolvedValue(run) };
    const identities = { archiveMigrated: jest.fn().mockResolvedValue({ _id: identityId }) };
    const result = await makeLegacyContactMigration({ Identity: {}, MigrationRun, identities }).rollback({
      tenantId, userId, runId: 'contacts-run-1', note: 'annulation test',
    });
    expect(result.rolledBack).toBe(1);
    expect(identities.archiveMigrated).toHaveBeenCalledWith(expect.objectContaining({
      identityId: String(identityId), runId: 'contacts-run-1',
    }));
    expect(run.status).toBe('rolled_back');
    expect(run.save).toHaveBeenCalledTimes(2);
  });
});
