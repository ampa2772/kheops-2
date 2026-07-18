const mongoose = require('mongoose');
const { makeContactIdentityService, normalizeContact } = require('../contactIdentityService');

function query(value) {
  return { lean: jest.fn().mockResolvedValue(value), then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } };
}

describe('contactIdentityService', () => {
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  test('normalise les clés de rapprochement sans décider d’une fusion', () => {
    const normalized = normalizeContact({
      kind: 'organization', displayName: 'Société Éxemple', email: 'CONTACT@EXAMPLE.FR', siret: '123 456 789 00010',
    });
    expect(normalized.normalized.name).toBe('societe exemple');
    expect(normalized.duplicateKeys).toContain('email:contact@example.fr');
    expect(normalized.duplicateKeys).toContain('siret:12345678900010');
  });

  test('un alias historique existant est idempotent même si identityKey diffère', async () => {
    const prior = { _id: new mongoose.Types.ObjectId(), identityKey: 'prior' };
    const Identity = { findOne: jest.fn(() => query(prior)), create: jest.fn() };
    const result = await makeContactIdentityService({ Identity }).register({
      tenantId, userId,
      input: { displayName: 'Alice', identityKey: 'custom', aliases: [{ system: 'legacy-contact', externalId: 'C1' }] },
    });
    expect(result).toMatchObject({ created: false, idempotent: true, identity: prior });
    expect(Identity.create).not.toHaveBeenCalled();
  });

  test('une fusion conserve la source avec le statut merged', async () => {
    const sourceId = new mongoose.Types.ObjectId();
    const targetId = new mongoose.Types.ObjectId();
    const target = { _id: targetId, status: 'active' };
    const source = { _id: sourceId, status: 'merged', aliases: [], provenance: [], duplicateKeys: [] };
    const Identity = {
      findOne: jest.fn(() => query(target)),
      findOneAndUpdate: jest.fn().mockResolvedValue(source),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const result = await makeContactIdentityService({ Identity }).merge({
      tenantId, userId, sourceIdentityId: sourceId, targetIdentityId: targetId, reason: 'Même personne confirmée',
    });
    expect(result.merged).toBe(true);
    expect(Identity.findOneAndUpdate.mock.calls[0][1]).toMatchObject({
      $set: { status: 'merged', mergedIntoIdentityId: targetId }, $inc: { revision: 1 },
    });
    expect(Identity).not.toHaveProperty('deleteOne');
  });
});
