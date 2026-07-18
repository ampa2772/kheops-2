const crypto = require('crypto');
const mongoose = require('mongoose');

const mockStorage = {
  save: jest.fn(),
  read: jest.fn(),
  exists: jest.fn(),
  delete: jest.fn(),
};
jest.mock('../fileStorage', () => ({ getFileStorage: () => mockStorage }));

const mockArtifactFindOne = jest.fn();
const mockArtifactCreate = jest.fn();
jest.mock('../../models/Documents/DocumentPublicationArtifact', () => ({
  findOne: (...args) => mockArtifactFindOne(...args),
  create: (...args) => mockArtifactCreate(...args),
}));

const mockHistoryFindOne = jest.fn();
jest.mock('../../models/Storage/DocumentHistory', () => ({
  findOne: (...args) => mockHistoryFindOne(...args),
}));

const mockReadStructuredVersion = jest.fn();
jest.mock('../documentHistoryService', () => ({
  readStructuredVersion: (...args) => mockReadStructuredVersion(...args),
}));

const mockRenderStructuredDocumentPdf = jest.fn();
jest.mock('../pdf/documentPdfRenderer', () => ({
  PDF_MIME: 'application/pdf',
  renderStructuredDocumentPdf: (...args) => mockRenderStructuredDocumentPdf(...args),
}));

const publication = require('../documentPublicationService');

function artifactRecord(payload) {
  return {
    _id: new mongoose.Types.ObjectId(),
    ...payload,
    toObject() { return { ...this }; },
  };
}

describe('documentPublicationService', () => {
  const tenantId = new mongoose.Types.ObjectId();
  const dossierId = new mongoose.Types.ObjectId();
  const documentId = new mongoose.Types.ObjectId();
  const createdBy = new mongoose.Types.ObjectId();
  const versionId = 'version-exacte-v7';
  const docx = Buffer.from('docx exact immutable bytes');
  const pdf = Buffer.from('%PDF-1.7 deterministic bytes');
  const sourceChecksum = crypto.createHash('sha256').update(docx).digest('hex');

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.exists.mockImplementation(async (key) => key === 'document-history/exact.docx');
    mockStorage.read.mockResolvedValue(docx);
    mockStorage.save.mockResolvedValue({ key: 'saved' });
    mockStorage.delete.mockResolvedValue(undefined);
    mockHistoryFindOne.mockResolvedValue({
      tenantId,
      dossierId,
      documentId,
      versions: [{
        versionId,
        storageKey: 'document-history/exact.docx',
        checksum: sourceChecksum,
        filename: 'Conclusions.docx',
        mime: publication.DOCX_MIME,
      }],
    });
    mockReadStructuredVersion.mockResolvedValue({ title: 'Conclusions', blocks: [] });
    mockRenderStructuredDocumentPdf.mockResolvedValue(pdf);
    mockArtifactFindOne.mockResolvedValue(null);
    mockArtifactCreate.mockImplementation(async (payload) => artifactRecord(payload));
  });

  test('normalise, déduplique et développe le format both', () => {
    expect(publication.normalizePublicationFormats(['DOCX', 'both', 'docx'])).toEqual(['docx', 'pdf']);
    expect(() => publication.normalizePublicationFormats(['html'])).toThrow(/docx, pdf/i);
  });

  test('construit une clé isolée par cabinet, dossier, document, version et format', () => {
    const key = publication.publicationStorageKey({
      tenantId: '../tenant', dossierId: 'dossier', documentId: 'document',
      versionId: 'v/../../7', format: 'pdf', checksum: 'a'.repeat(64),
    });
    expect(key).toBe(`publication-artifacts/tenants/___tenant/dossiers/dossier/documents/document/versions/v_______7/pdf/${'a'.repeat(64)}.pdf`);
    expect(key).not.toContain('..');
  });

  test('matérialise réellement les artefacts DOCX et PDF de la version exacte', async () => {
    const result = await publication.preparePublicationArtifacts({
      tenantId,
      dossierId,
      documentId,
      versionId,
      revision: 12,
      formats: 'both',
      title: 'Conclusions définitives',
      structuredDocument: { title: 'fallback' },
      createdBy,
    });

    expect(mockRenderStructuredDocumentPdf).toHaveBeenCalledWith({ title: 'Conclusions', blocks: [] });
    expect(mockStorage.save).toHaveBeenCalledTimes(2);
    expect(mockArtifactCreate).toHaveBeenCalledTimes(2);
    expect(result.artifacts.docx).toMatchObject({
      ready: true,
      format: 'docx',
      versionId,
      filename: 'Conclusions définitives.docx',
      sourceChecksum,
      downloadUrl: expect.stringContaining(`/document-editor/${documentId}/publications/`),
    });
    expect(result.artifacts.pdf).toMatchObject({
      ready: true,
      format: 'pdf',
      versionId,
      filename: 'Conclusions définitives.pdf',
      sourceChecksum,
      checksum: crypto.createHash('sha256').update(pdf).digest('hex'),
    });
    expect(result.reused).toBe(false);
  });

  test('réutilise uniquement un artefact dont les métadonnées et les octets concordent', async () => {
    const checksum = crypto.createHash('sha256').update(docx).digest('hex');
    const existing = artifactRecord({
      tenantId, dossierId, documentId, versionId, format: 'docx',
      checksum, sourceChecksum, size: docx.length, mime: publication.DOCX_MIME,
      filename: 'Conclusions.docx', storageKey: 'immutable.docx',
    });
    mockArtifactFindOne.mockResolvedValue(existing);
    mockStorage.exists.mockResolvedValue(true);
    mockStorage.read.mockResolvedValue(docx);

    const saved = await publication.persistPublicationArtifact({
      tenantId, dossierId, documentId, versionId, format: 'docx',
      mime: publication.DOCX_MIME, filename: 'Conclusions.docx', buffer: docx,
      sourceChecksum, createdBy,
    });

    expect(saved.reused).toBe(true);
    expect(mockArtifactCreate).not.toHaveBeenCalled();
    expect(mockStorage.save).not.toHaveBeenCalled();
  });

  test('refuse un blob dont le checksum ne correspond plus à l’artefact', async () => {
    const existing = artifactRecord({
      tenantId, dossierId, documentId, versionId, format: 'pdf',
      checksum: crypto.createHash('sha256').update(pdf).digest('hex'),
      sourceChecksum, size: pdf.length, mime: publication.PDF_MIME,
      filename: 'Conclusions.pdf', storageKey: 'immutable.pdf',
    });
    mockArtifactFindOne.mockResolvedValue(existing);
    mockStorage.exists.mockResolvedValue(true);
    mockStorage.read.mockResolvedValue(Buffer.from('corrompu'));

    await expect(publication.readPublicationArtifact({
      tenantId, dossierId, documentId, artifactId: existing._id,
    })).rejects.toMatchObject({ code: 'PUBLICATION_ARTIFACT_CHECKSUM_MISMATCH' });
  });

  test('refuse de rendre un modèle structuré altéré par rapport à la version', async () => {
    mockHistoryFindOne.mockResolvedValue({
      tenantId, dossierId, documentId,
      versions: [{
        versionId,
        storageKey: 'document-history/exact.docx',
        checksum: sourceChecksum,
        structuredChecksum: 'f'.repeat(64),
        filename: 'Conclusions.docx',
        mime: publication.DOCX_MIME,
      }],
    });
    await expect(publication.preparePublicationArtifacts({
      tenantId, dossierId, documentId, versionId, formats: ['pdf'], createdBy,
    })).rejects.toMatchObject({ code: 'PUBLICATION_STRUCTURED_CHECKSUM_MISMATCH' });
    expect(mockRenderStructuredDocumentPdf).not.toHaveBeenCalled();
  });
});
