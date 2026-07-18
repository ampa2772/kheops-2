const latestAutosave = Buffer.from('DOCX-DERNIERE-AUTOSAUVEGARDE-KHEOPS');
const staleCanonical = Buffer.from('DOCX-COPIE-CANONIQUE-ANCIENNE');

const mockHistoryLean = jest.fn();
const mockHistoryFindOne = jest.fn(() => ({ lean: mockHistoryLean }));
const mockStoredFindOne = jest.fn();
const mockStorageExists = jest.fn();
const mockStorageRead = jest.fn();
const mockStorageSave = jest.fn();

jest.mock('../../models/Storage/DocumentHistory', () => ({
  findOne: (...args) => mockHistoryFindOne(...args),
}));
jest.mock('../../models/Storage/StoredDocument', () => ({
  findOne: (...args) => mockStoredFindOne(...args),
}));
jest.mock('../fileStorage', () => ({
  getFileStorage: () => ({
    exists: (...args) => mockStorageExists(...args),
    read: (...args) => mockStorageRead(...args),
    save: (...args) => mockStorageSave(...args),
  }),
}));
jest.mock('../storage', () => ({ getProviderForStorageKey: jest.fn() }));

const {
  canonicalStorageKey,
  resolveDocumentContent,
  saveCanonicalDocument,
} = require('../documentContentService');

describe('documentContentService — cohérence autosauvegarde/historique', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHistoryLean.mockResolvedValue({
      currentVersionId: 'autosave-v8',
      versions: [
        { versionId: 'v7', storageKey: 'document-history/t/d/v7.docx' },
        {
          versionId: 'autosave-v8',
          storageKey: 'document-history/t/d/autosave-v8.docx',
          filename: 'Conclusions.docx',
          mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
      ],
    });
    mockStorageExists.mockImplementation(async (key) => (
      key === 'document-history/t/d/autosave-v8.docx'
      || key === canonicalStorageKey('document-1', 'tenant-1', 'dossier-1')
    ));
    mockStorageRead.mockImplementation(async (key) => (
      key === 'document-history/t/d/autosave-v8.docx' ? latestAutosave : staleCanonical
    ));
  });

  test('la réouverture sert la dernière autosauvegarde d’historique, jamais une copie canonique plus ancienne', async () => {
    const result = await resolveDocumentContent({
      tenantId: 'tenant-1',
      dossierId: 'dossier-1',
      documentId: 'document-1',
      fallbackFilename: 'Ancien nom.docx',
    });

    expect(result).toEqual(expect.objectContaining({
      buffer: latestAutosave,
      filename: 'Conclusions.docx',
      source: 'document-history',
      versionId: 'autosave-v8',
    }));
    expect(mockStorageRead).toHaveBeenCalledTimes(1);
    expect(mockStorageRead).toHaveBeenCalledWith('document-history/t/d/autosave-v8.docx');
    expect(mockStorageExists).not.toHaveBeenCalledWith(
      canonicalStorageKey('document-1', 'tenant-1', 'dossier-1'),
    );
    expect(mockStoredFindOne).not.toHaveBeenCalled();
  });

  test('restitue aussi le modèle structuré exact associé à la version', async () => {
    const structured = { schemaVersion: 2, title: 'Conclusions', blocks: [{ type: 'reference', referenceId: 'ref-1' }] };
    mockHistoryLean.mockResolvedValue({
      currentVersionId: 'autosave-v8',
      versions: [{
        versionId: 'autosave-v8', storageKey: 'document-history/t/d/autosave-v8.docx',
        structuredStorageKey: 'document-history/t/d/autosave-v8.structured.json', filename: 'Conclusions.docx',
      }],
    });
    mockStorageExists.mockResolvedValue(true);
    mockStorageRead.mockImplementation(async (key) => (
      key.endsWith('.structured.json') ? Buffer.from(JSON.stringify(structured)) : latestAutosave
    ));

    const result = await resolveDocumentContent({ tenantId: 'tenant-1', dossierId: 'dossier-1', documentId: 'document-1' });

    expect(result.structuredDocument).toEqual(structured);
    expect(result.buffer).toBe(latestAutosave);
  });

  test('écrit et relit un ancien .doc sous une clé .doc avec application/msword', async () => {
    const legacyBytes = Buffer.from('OLE-DOC-BYTES');
    const legacyKey = canonicalStorageKey('document-1', 'tenant-1', 'dossier-1', {
      filename: 'Conclusions historiques.doc',
      mime: 'application/msword',
    });
    mockHistoryLean.mockResolvedValue(null);
    mockStorageExists.mockImplementation(async (key) => key === legacyKey);
    mockStorageRead.mockImplementation(async (key) => (
      key === legacyKey ? legacyBytes : Buffer.alloc(0)
    ));

    const savedKey = await saveCanonicalDocument(
      'document-1',
      legacyBytes,
      'application/msword',
      {
        tenantId: 'tenant-1',
        dossierId: 'dossier-1',
        filename: 'Conclusions historiques.doc',
      },
    );
    const resolved = await resolveDocumentContent({
      tenantId: 'tenant-1',
      dossierId: 'dossier-1',
      documentId: 'document-1',
      fallbackFilename: 'Conclusions historiques.doc',
    });

    expect(savedKey).toBe(legacyKey);
    expect(legacyKey).toMatch(/\.doc$/);
    expect(mockStorageSave).toHaveBeenCalledWith(
      legacyKey,
      legacyBytes,
      { contentType: 'application/msword' },
    );
    expect(resolved).toEqual(expect.objectContaining({
      buffer: legacyBytes,
      filename: 'Conclusions historiques.doc',
      mime: 'application/msword',
      source: 'canonical',
    }));
  });

  test('un nom .docx reste OOXML même si son ancien MIME vaut application/msword', async () => {
    const key = canonicalStorageKey('document-1', 'tenant-1', 'dossier-1', {
      filename: 'Conclusions.docx',
      mime: 'application/msword',
    });

    await saveCanonicalDocument(
      'document-1',
      latestAutosave,
      'application/msword',
      {
        tenantId: 'tenant-1',
        dossierId: 'dossier-1',
        filename: 'Conclusions.docx',
      },
    );

    expect(key).toMatch(/\.docx$/);
    expect(mockStorageSave).toHaveBeenCalledWith(
      key,
      latestAutosave,
      { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    );
  });

  test('répare à la lecture le MIME absent d’une version historique nommée .doc', async () => {
    mockHistoryLean.mockResolvedValue({
      currentVersionId: 'legacy-v4',
      versions: [{
        versionId: 'legacy-v4',
        storageKey: 'document-history/t/d/legacy-v4.doc',
        filename: 'Conclusions historiques.doc',
      }],
    });
    mockStorageExists.mockResolvedValue(true);
    mockStorageRead.mockResolvedValue(Buffer.from('OLE-DOC-BYTES'));

    const result = await resolveDocumentContent({
      tenantId: 'tenant-1',
      dossierId: 'dossier-1',
      documentId: 'document-1',
    });

    expect(result).toEqual(expect.objectContaining({
      filename: 'Conclusions historiques.doc',
      mime: 'application/msword',
      source: 'document-history',
    }));
  });
});
