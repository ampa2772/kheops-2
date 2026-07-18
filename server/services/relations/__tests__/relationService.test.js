const mongoose = require('mongoose');
const { makeRelationService } = require('../relationService');
const { normalizeRelationInput, relationContentHash, relationDedupeKey } = require('../relationKey');

function query(value) {
  return {
    lean: jest.fn().mockResolvedValue(value),
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}

function input(overrides = {}) {
  return {
    relationType: 'represents',
    subject: { entityType: 'contact', entityId: 'C1' },
    object: { entityType: 'contact_pm', entityId: 'PM1' },
    roles: [{ side: 'subject', code: 'lawyer' }],
    ...overrides,
  };
}

describe('relationService', () => {
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  test('crée une relation version 1 avec clés déterministes', async () => {
    const Relation = {
      findOne: jest.fn(() => query(null)),
      create: jest.fn(async (payload) => ({ _id: new mongoose.Types.ObjectId(), ...payload })),
    };
    const service = makeRelationService({ Relation });
    const result = await service.createRelation({ tenantId, userId, input: input() });
    expect(result.created).toBe(true);
    expect(Relation.create).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      revision: 1,
      isCurrent: true,
      dedupeKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });

  test('renvoie la relation existante si son contenu est identique', async () => {
    const normalized = normalizeRelationInput(input());
    const current = {
      _id: new mongoose.Types.ObjectId(),
      logicalRelationId: new mongoose.Types.ObjectId(),
      revision: 1,
      dedupeKey: relationDedupeKey(normalized),
      contentHash: relationContentHash(normalized),
      toObject() { return { ...this, toObject: undefined }; },
    };
    const Relation = { findOne: jest.fn(() => query(current)), create: jest.fn() };
    const result = await makeRelationService({ Relation }).createRelation({ tenantId, userId, input: input() });
    expect(result).toMatchObject({ created: false, deduplicated: true });
    expect(Relation.create).not.toHaveBeenCalled();
  });

  test('une transition conserve la révision précédente et crée la suivante', async () => {
    const normalized = normalizeRelationInput(input());
    const current = {
      _id: new mongoose.Types.ObjectId(), tenantId,
      logicalRelationId: new mongoose.Types.ObjectId(), revision: 2,
      isCurrent: true, dedupeKey: relationDedupeKey(normalized), contentHash: relationContentHash(normalized),
      ...normalized,
      toObject() { const result = { ...this }; delete result.toObject; return result; },
    };
    const nextId = new mongoose.Types.ObjectId();
    const Relation = {
      findOne: jest.fn(() => query(current)),
      findOneAndUpdate: jest.fn(async () => ({ ...current, isCurrent: false })),
      create: jest.fn(async (payload) => ({ _id: nextId, ...payload })),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const result = await makeRelationService({ Relation }).transitionRelation({
      tenantId, userId, logicalRelationId: current.logicalRelationId,
      patch: { status: 'inactive', provenance: { source: 'user' } },
    });
    expect(result.relation).toMatchObject({ revision: 3, status: 'inactive', supersedesRevisionId: current._id });
    expect(Relation.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: current._id, isCurrent: true, revision: 2 },
      { $set: { isCurrent: false } },
      { new: true },
    );
    expect(Relation.updateOne).toHaveBeenCalledWith({ _id: current._id }, { $set: { supersededByRevisionId: nextId } });
  });

  test('restaure isCurrent si la création de la nouvelle révision échoue', async () => {
    const normalized = normalizeRelationInput(input());
    const current = {
      _id: new mongoose.Types.ObjectId(), logicalRelationId: new mongoose.Types.ObjectId(), revision: 1,
      isCurrent: true, dedupeKey: relationDedupeKey(normalized), contentHash: relationContentHash(normalized),
      ...normalized,
      toObject() { const result = { ...this }; delete result.toObject; return result; },
    };
    const Relation = {
      findOne: jest.fn(() => query(current)),
      findOneAndUpdate: jest.fn(async () => ({ ...current, isCurrent: false })),
      create: jest.fn().mockRejectedValue(new Error('mongo down')),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    await expect(makeRelationService({ Relation }).transitionRelation({
      tenantId, userId, logicalRelationId: current.logicalRelationId, patch: { status: 'inactive' },
    })).rejects.toThrow('mongo down');
    expect(Relation.updateOne).toHaveBeenCalledWith({ _id: current._id, isCurrent: false }, { $set: { isCurrent: true } });
  });
});
