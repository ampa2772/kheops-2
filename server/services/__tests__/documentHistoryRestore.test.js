const mongoose = require('mongoose');

const mockFindOne = jest.fn();
const mockStorage = { read: jest.fn(), save: jest.fn(), delete: jest.fn() };

jest.mock('../../models/Storage/DocumentHistory', () => {
  function DocumentHistory(payload) {
    Object.assign(this, payload);
    this.save = jest.fn().mockResolvedValue(this);
  }
  DocumentHistory.findOne = mockFindOne;
  return DocumentHistory;
});
jest.mock('../fileStorage', () => ({ getFileStorage: () => mockStorage }));

const { checksumOf, restoreVersion } = require('../documentHistoryService');

describe('documentHistoryService.restoreVersion', () => {
  beforeEach(() => jest.clearAllMocks());

  test('crée une nouvelle version sans modifier ni promouvoir la version source', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const dossierId = new mongoose.Types.ObjectId();
    const documentId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const oldBuffer = Buffer.from('ancienne version exacte');
    const currentBuffer = Buffer.from('version courante');
    const source = {
      versionId: 'v-source', storageKey: 'source.docx', checksum: checksumOf(oldBuffer), size: oldBuffer.length,
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename: 'acte.docx', status: 'validated', comment: '',
    };
    const current = {
      versionId: 'v-current', storageKey: 'current.docx', checksum: checksumOf(currentBuffer), size: currentBuffer.length,
      mime: source.mime, filename: 'acte.docx', status: 'draft', comment: '',
    };
    const history = {
      tenantId, dossierId, documentId, currentVersionId: current.versionId,
      versions: [source, current], save: jest.fn().mockResolvedValue(null),
    };
    mockFindOne.mockResolvedValue(history);
    mockStorage.read.mockImplementation(async (key) => {
      if (key === source.storageKey) return oldBuffer;
      if (key === current.storageKey) return currentBuffer;
      throw new Error('clé inconnue');
    });
    mockStorage.save.mockResolvedValue(undefined);

    const result = await restoreVersion({
      history, versionId: source.versionId, userId,
      operationKey: 'restore-once', comment: 'Restauration contrôlée',
    });

    expect(result.version.versionId).not.toBe(source.versionId);
    expect(history.currentVersionId).toBe(result.version.versionId);
    expect(result.version).toMatchObject({
      restoredFromVersionId: source.versionId,
      baseVersionId: current.versionId,
      operationKey: 'restore-once',
    });
    expect(history.versions[0]).toBe(source);
    expect(history.versions[1]).toBe(current);
    expect(history.versions).toHaveLength(3);
    expect(mockStorage.save).toHaveBeenCalledWith(expect.stringMatching(/\.docx$/), oldBuffer, expect.any(Object));
  });
});
