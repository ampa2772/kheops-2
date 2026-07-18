const mongoose = require('mongoose');
const { deterministicKey, makeLogicalDocumentService } = require('../logicalDocumentService');

function query(value) {
  return {
    lean: jest.fn().mockResolvedValue(value),
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}

describe('logicalDocumentService', () => {
  const tenantId = new mongoose.Types.ObjectId();
  const dossierId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  test('les clés techniques sont déterministes', () => {
    expect(deterministicKey('doc', ['A', 'B'])).toBe(deterministicKey('doc', ['a', 'b']));
    expect(deterministicKey('doc', ['A', 'B'])).not.toBe(deterministicKey('doc', ['A', 'C']));
  });

  test('résout un document par alias sans sortir du dossier', async () => {
    const found = { _id: new mongoose.Types.ObjectId(), dossierId };
    const Logical = { findOne: jest.fn(() => query(found)) };
    const service = makeLogicalDocumentService({ Logical, Version: {}, Copy: {}, Location: {} });
    const result = await service.resolveDocumentAlias({
      tenantId, dossierId, system: 'legacy-dossier-document', externalId: 'DOC1',
    });
    expect(result).toBe(found);
    expect(Logical.findOne).toHaveBeenCalledWith({
      tenantId,
      dossierId,
      aliases: { $elemMatch: { system: 'legacy-dossier-document', externalId: 'DOC1' } },
    });
  });

  test('une version basée sur une ancienne base est conservée comme conflit sans promotion', async () => {
    const logicalDocumentId = new mongoose.Types.ObjectId();
    const logical = {
      _id: logicalDocumentId, tenantId, currentVersionId: 'v-current', revision: 3,
      preferredMime: 'application/docx', title: 'Contrat.docx',
    };
    const Logical = {
      findOne: jest.fn(() => query(logical)),
      findOneAndUpdate: jest.fn(),
    };
    const Version = {
      findOne: jest.fn((filter) => {
        if (filter.versionId) return query(null);
        return { sort: () => ({ select: () => ({ lean: async () => ({ sequence: 3 }) }) }) };
      }),
      create: jest.fn(async (payload) => ({ _id: new mongoose.Types.ObjectId(), ...payload })),
      updateOne: jest.fn(),
    };
    const service = makeLogicalDocumentService({ Logical, Version, Copy: {}, Location: {} });
    const result = await service.addVersion({
      tenantId, logicalDocumentId, userId,
      input: { checksum: 'abc123', size: 10, baseVersionId: 'v-old', idempotencyKey: null },
    });
    expect(result.conflict).toBe(true);
    expect(result.version).toMatchObject({ status: 'conflict', conflictWithVersionId: 'v-current', sequence: 4 });
    expect(Logical.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
