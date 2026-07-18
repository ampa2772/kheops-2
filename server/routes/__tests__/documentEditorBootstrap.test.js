const crypto = require('crypto');
const mongoose = require('mongoose');

jest.mock('../../middlewares/middleware-auth', () => (req, _res, next) => next());
jest.mock('../../middlewares/requireTenant', () => (req, _res, next) => next());

const mockConvertToHtml = jest.fn().mockResolvedValue({ value: '<p>Contenu existant</p>', messages: [] });
jest.mock('mammoth', () => ({
  convertToHtml: (...args) => mockConvertToHtml(...args),
  images: { imgElement: jest.fn((handler) => handler) },
}));

const mockStoredLean = jest.fn();
const mockStoredSelect = jest.fn(() => ({ lean: mockStoredLean }));
const mockStoredFindOne = jest.fn(() => ({ select: mockStoredSelect }));
jest.mock('../../models/Storage/StoredDocument', () => ({ findOne: (...args) => mockStoredFindOne(...args) }));

const mockStateFindOne = jest.fn();
const mockStateCreate = jest.fn();
const mockStateFindOneAndUpdate = jest.fn();
const mockStateUpdateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
jest.mock('../../models/DocumentEditor/DocumentEditorState', () => ({
  findOne: (...args) => mockStateFindOne(...args),
  create: (...args) => mockStateCreate(...args),
  findOneAndUpdate: (...args) => mockStateFindOneAndUpdate(...args),
  updateOne: (...args) => mockStateUpdateOne(...args),
}));

const mockOriginalFindOneAndUpdate = jest.fn();
const mockOriginalFindOne = jest.fn();
jest.mock('../../models/DocumentEditor/DocumentEditorOriginal', () => ({
  findOneAndUpdate: (...args) => mockOriginalFindOneAndUpdate(...args),
  findOne: (...args) => mockOriginalFindOne(...args),
}));

const mockRevisionLean = jest.fn().mockResolvedValue([]);
const mockRevisionLimit = jest.fn(() => ({ lean: mockRevisionLean }));
const mockRevisionSort = jest.fn(() => ({ limit: mockRevisionLimit }));
const mockRevisionSelect = jest.fn(() => ({ sort: mockRevisionSort }));
const mockRevisionCreate = jest.fn();
jest.mock('../../models/DocumentEditor/DocumentEditorRevision', () => ({
  find: jest.fn(() => ({ select: mockRevisionSelect })),
  create: (...args) => mockRevisionCreate(...args),
}));

const mockResolveDocumentContent = jest.fn();
const mockSaveCanonicalDocument = jest.fn();
const mockSaveHistoryVersion = jest.fn().mockResolvedValue({
  history: { currentVersionId: 'history-autosave-v3' },
  version: { versionId: 'history-autosave-v3' },
  conflict: false,
  deduplicated: false,
});
jest.mock('../../services/documentContentService', () => ({
  resolveDocumentContent: (...args) => mockResolveDocumentContent(...args),
  saveCanonicalDocument: (...args) => mockSaveCanonicalDocument(...args),
}));
jest.mock('../../services/documentHistoryService', () => ({
  saveVersion: (...args) => mockSaveHistoryVersion(...args),
}));
const mockConvertLegacyWordBuffer = jest.fn();
jest.mock('../../services/documentLegacyWordFormat', () => ({
  ...jest.requireActual('../../services/documentLegacyWordFormat'),
  convertLegacyWordBuffer: (...args) => mockConvertLegacyWordBuffer(...args),
}));
const mockConvertLegacyWordToDocx = jest.fn();
jest.mock('../../services/documentLegacyWordConversion', () => ({
  ...jest.requireActual('../../services/documentLegacyWordConversion'),
  convertLegacyWordToDocx: (...args) => mockConvertLegacyWordToDocx(...args),
}));
const mockPreparePublicationArtifacts = jest.fn();
const mockReadPublicationArtifact = jest.fn();
jest.mock('../../services/documentPublicationService', () => ({
  ...jest.requireActual('../../services/documentPublicationService'),
  preparePublicationArtifacts: (...args) => mockPreparePublicationArtifacts(...args),
  readPublicationArtifact: (...args) => mockReadPublicationArtifact(...args),
}));
jest.mock('../../utils/auditLogger', () => ({
  create: jest.fn(), update: jest.fn(), failure: jest.fn(), log: jest.fn(),
}));

const { createDefaultDocument, createDocxBuffer } = require('../../services/documentEditorFormat');
const router = require('../documentEditor');

function getHandler() {
  const layer = router.stack.find((item) => item.route && item.route.path === '/:documentId' && item.route.methods.get);
  if (!layer) throw new Error('Route GET /:documentId introuvable');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function putHandler() {
  const layer = router.stack.find((item) => item.route && item.route.path === '/:documentId' && item.route.methods.put);
  if (!layer) throw new Error('Route PUT /:documentId introuvable');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function reloadHandler() {
  const layer = router.stack.find((item) => item.route && item.route.path === '/:documentId/reload-canonical' && item.route.methods.post);
  if (!layer) throw new Error('Route POST /:documentId/reload-canonical introuvable');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function reconvertOriginalHandler() {
  const layer = router.stack.find((item) => item.route && item.route.path === '/:documentId/reconvert-original' && item.route.methods.post);
  if (!layer) throw new Error('Route POST /:documentId/reconvert-original introuvable');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function publicationHandler() {
  const layer = router.stack.find((item) => item.route && item.route.path === '/:documentId/publications/prepare' && item.route.methods.post);
  if (!layer) throw new Error('Route POST /:documentId/publications/prepare introuvable');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function publicationDownloadHandler() {
  const layer = router.stack.find((item) => item.route && item.route.path === '/:documentId/publications/:artifactId/download' && item.route.methods.get);
  if (!layer) throw new Error('Route GET publication download introuvable');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    status: jest.fn(function setStatus(code) { this.statusCode = code; return this; }),
    json: jest.fn(function json(payload) { this.payload = payload; return this; }),
    setHeader: jest.fn(function setHeader(name, value) { this.headers[name] = value; return this; }),
    send: jest.fn(function send(payload) { this.payload = payload; return this; }),
  };
}

describe('bootstrap sûr de l’Éditeur Kheops', () => {
  const tenantId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const storedId = new mongoose.Types.ObjectId();
  const documentId = new mongoose.Types.ObjectId();
  const originalId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
    mockConvertLegacyWordToDocx.mockRejectedValue(Object.assign(
      new Error('soffice absent'),
      { code: 'LEGACY_DOC_CONVERTER_UNAVAILABLE', statusCode: 503 },
    ));
    mockStoredLean.mockResolvedValue({
      _id: storedId,
      documentId,
      dossierId: new mongoose.Types.ObjectId(),
      currentVersionId: 'v1',
      versions: [{ versionId: 'v1', filename: 'contrat.docx' }],
    });
    mockStateFindOne.mockResolvedValueOnce(null);
    mockOriginalFindOneAndUpdate.mockResolvedValue({
      _id: originalId,
      importedAt: new Date('2026-07-10T00:00:00Z'),
    });
    const buffer = createDocxBuffer(createDefaultDocument('Contrat existant'));
    mockResolveDocumentContent.mockResolvedValue({
      buffer,
      filename: 'contrat.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      source: 'stored-document',
    });
    const legacyDocument = createDefaultDocument('Contrat Word historique');
    legacyDocument.documentType = 'legacy-word';
    legacyDocument.blocks[0].runs = [{ text: 'Contenu extrait du DOC', marks: {} }];
    mockConvertLegacyWordBuffer.mockResolvedValue({
      compatibility: {
        level: 'partial',
        label: 'DOC historique converti',
        warnings: ['Original .doc conservé.'],
        analyzedAt: new Date('2026-07-10T00:00:00Z'),
      },
      converted: { messages: [] },
      structured: legacyDocument,
    });
    mockStateCreate.mockImplementation(async (payload) => ({ _id: new mongoose.Types.ObjectId(), ...payload }));
    mockPreparePublicationArtifacts.mockResolvedValue({
      artifacts: {
        docx: {
          requested: true, ready: true, artifactId: new mongoose.Types.ObjectId().toString(),
          versionId: 'publication-v5', format: 'docx', filename: 'conclusions.docx',
          downloadUrl: `/api/document-editor/${documentId}/publications/docx-artifact/download`,
        },
        pdf: {
          requested: true, ready: true, artifactId: new mongoose.Types.ObjectId().toString(),
          versionId: 'publication-v5', format: 'pdf', filename: 'conclusions.pdf',
          downloadUrl: `/api/document-editor/${documentId}/publications/pdf-artifact/download`,
        },
      },
      reused: false,
    });
    mockReadPublicationArtifact.mockResolvedValue(null);
  });

  test('importe le DOCX existant, préserve ses octets puis retourne un état non vide', async () => {
    const req = { params: { documentId: String(storedId) }, tenantId, user: String(userId), body: {} };
    const res = responseMock();

    await getHandler()(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.exists).toBe(true);
    expect(res.payload.document.blocks[0].runs[0].text).toBe('Contenu existant');
    expect(mockOriginalFindOneAndUpdate).toHaveBeenCalledTimes(1);
    const originalInsert = mockOriginalFindOneAndUpdate.mock.calls[0][1].$setOnInsert;
    expect(Buffer.isBuffer(originalInsert.data)).toBe(true);
    expect(originalInsert.data.length).toBeGreaterThan(100);
    expect(mockStateCreate).toHaveBeenCalledTimes(1);
    expect(mockOriginalFindOneAndUpdate.mock.invocationCallOrder[0]).toBeLessThan(mockStateCreate.mock.invocationCallOrder[0]);
    // Un GET de bootstrap ne réécrit jamais la copie canonique existante.
    expect(mockSaveCanonicalDocument).not.toHaveBeenCalled();
  });

  test('refuse un paquet DOCX ambigu avant de lancer Mammoth', async () => {
    mockResolveDocumentContent.mockResolvedValue({
      buffer: Buffer.from('PK\u0003\u0004archive DOCX tronquée', 'utf8'),
      filename: 'archive.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      source: 'stored-document',
    });
    const req = { params: { documentId: String(storedId) }, tenantId, user: String(userId), body: {} };
    const res = responseMock();

    await getHandler()(req, res);

    expect(res.statusCode).toBe(415);
    expect(res.payload).toEqual(expect.objectContaining({
      error: 'INVALID_DOCX',
      message: 'Le fichier n’est pas un document DOCX valide.',
    }));
    expect(mockConvertToHtml).not.toHaveBeenCalled();
    expect(mockStateCreate).not.toHaveBeenCalled();
  });

  test('importe un TXT sans conversion et restitue son format, son BOM et ses fins de ligne', async () => {
    const source = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('Première ligne\r\nDeuxième ligne\r\n', 'utf8'),
    ]);
    mockStoredLean.mockResolvedValue({
      _id: storedId,
      documentId,
      dossierId: new mongoose.Types.ObjectId(),
      currentVersionId: 'txt-v1',
      versions: [{ versionId: 'txt-v1', filename: 'notes audience.txt', mime: 'text/plain' }],
    });
    mockResolveDocumentContent.mockResolvedValue({
      buffer: source,
      filename: 'notes audience.txt',
      mime: 'text/plain',
      source: 'stored-document',
    });
    const req = { params: { documentId: String(storedId) }, tenantId, user: String(userId), body: {} };
    const res = responseMock();

    await getHandler()(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({
      exists: true,
      textContent: 'Première ligne\nDeuxième ligne\n',
      fileFormat: {
        kind: 'text',
        filename: 'notes audience.txt',
        mime: 'text/plain',
        encoding: 'utf8',
        bom: true,
        lineEnding: 'crlf',
        finalNewline: true,
      },
    });
    expect(mockOriginalFindOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mockOriginalFindOneAndUpdate.mock.calls[0][1].$setOnInsert.data.equals(source)).toBe(true);
    expect(mockSaveCanonicalDocument).not.toHaveBeenCalled();
  });

  test('importe un ancien DOC dans une copie DOCX éditable après avoir préservé les octets originaux', async () => {
    const source = Buffer.concat([
      Buffer.from('d0cf11e0a1b11ae1', 'hex'),
      Buffer.alloc(504),
    ]);
    mockStoredLean.mockResolvedValue({
      _id: storedId,
      documentId,
      dossierId: new mongoose.Types.ObjectId(),
      currentVersionId: 'doc-v1',
      versions: [{ versionId: 'doc-v1', filename: 'conclusions.doc', mime: 'application/msword' }],
    });
    mockResolveDocumentContent.mockResolvedValue({
      buffer: source,
      filename: 'conclusions.doc',
      mime: 'application/msword',
      source: 'document-history',
    });
    const req = { params: { documentId: String(storedId) }, tenantId, user: String(userId), body: {} };
    const res = responseMock();

    await getHandler()(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual(expect.objectContaining({
      exists: true,
      fileFormat: expect.objectContaining({
        kind: 'docx',
        filename: 'conclusions.docx',
      }),
      compatibility: expect.objectContaining({
        level: 'partial',
        label: 'DOC historique — repli textuel',
        warnings: expect.arrayContaining([expect.stringMatching(/repli textuel/i)]),
      }),
    }));
    expect(res.payload.document.blocks[0].runs[0].text).toBe('Contenu extrait du DOC');
    expect(mockOriginalFindOneAndUpdate.mock.calls[0][1].$setOnInsert).toEqual(expect.objectContaining({
      mime: 'application/msword',
      filename: 'conclusions.doc',
      data: source,
    }));
    expect(mockOriginalFindOneAndUpdate.mock.invocationCallOrder[0])
      .toBeLessThan(mockConvertLegacyWordBuffer.mock.invocationCallOrder[0]);
    expect(mockConvertLegacyWordToDocx.mock.invocationCallOrder[0])
      .toBeLessThan(mockConvertLegacyWordBuffer.mock.invocationCallOrder[0]);
    expect(mockStateCreate.mock.calls[0][0].fileFormat).toEqual(expect.objectContaining({
      kind: 'docx',
      filename: 'conclusions.docx',
    }));
    expect(mockSaveCanonicalDocument).not.toHaveBeenCalled();
  });

  test('convertit un ancien DOC avec LibreOffice puis utilise le pipeline DOCX riche', async () => {
    const source = Buffer.concat([
      Buffer.from('d0cf11e0a1b11ae1', 'hex'),
      Buffer.alloc(504),
    ]);
    const convertedDocx = createDocxBuffer(createDefaultDocument('Conversion LibreOffice'));
    mockStoredLean.mockResolvedValue({
      _id: storedId,
      documentId,
      dossierId: new mongoose.Types.ObjectId(),
      currentVersionId: 'doc-v2',
      versions: [{ versionId: 'doc-v2', filename: 'conclusions.doc', mime: 'application/msword' }],
    });
    mockResolveDocumentContent.mockResolvedValue({
      buffer: source,
      filename: 'conclusions.doc',
      mime: 'application/msword',
      source: 'document-history',
    });
    mockConvertLegacyWordToDocx.mockResolvedValueOnce({
      buffer: convertedDocx,
      filename: 'conclusions.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      converter: 'libreoffice',
    });
    mockConvertToHtml.mockResolvedValueOnce({
      value: '<p>Contenu converti avec présentation</p>',
      messages: [],
    });
    const req = { params: { documentId: String(storedId) }, tenantId, user: String(userId), body: {} };
    const res = responseMock();

    await getHandler()(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockConvertLegacyWordToDocx).toHaveBeenCalledWith(source, 'conclusions.doc');
    expect(mockConvertLegacyWordBuffer).not.toHaveBeenCalled();
    expect(res.payload.document.blocks[0].runs[0].text).toBe('Contenu converti avec présentation');
    expect(res.payload.compatibility).toEqual(expect.objectContaining({
      level: 'partial',
      label: 'DOC historique converti',
      warnings: expect.arrayContaining([expect.stringMatching(/LibreOffice/i)]),
    }));
    expect(mockOriginalFindOneAndUpdate.mock.calls[0][1].$setOnInsert).toEqual(expect.objectContaining({
      mime: 'application/msword',
      filename: 'conclusions.doc',
      data: source,
    }));
    expect(mockOriginalFindOneAndUpdate.mock.invocationCallOrder[0])
      .toBeLessThan(mockConvertLegacyWordToDocx.mock.invocationCallOrder[0]);
    expect(mockSaveCanonicalDocument).not.toHaveBeenCalled();
  });

  test('refuse une sauvegarde basée sur une ancienne révision avant toute réécriture canonique', async () => {
    mockStateFindOne.mockReset();
    mockStateFindOne.mockResolvedValue({ _id: new mongoose.Types.ObjectId(), revision: 5 });
    const req = {
      params: { documentId: String(storedId) },
      tenantId,
      user: String(userId),
      body: { document: createDefaultDocument('Copie ancienne'), expectedRevision: 4 },
    };
    const res = responseMock();

    await putHandler()(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.payload.error).toBe('REVISION_CONFLICT');
    expect(mockStateFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mockSaveCanonicalDocument).not.toHaveBeenCalled();
  });

  test('fige une révision exacte pour publication avec une clé idempotente', async () => {
    mockStateFindOne.mockReset();
    const actualDocumentTenant = new mongoose.Types.ObjectId();
    const actualDossierId = new mongoose.Types.ObjectId();
    const document = createDefaultDocument('Conclusions définitives');
    const buffer = createDocxBuffer(document);
    mockStoredLean.mockResolvedValue({
      _id: storedId, tenantId: actualDocumentTenant, documentId, dossierId: actualDossierId,
      currentVersionId: 'history-v4', versions: [{ versionId: 'history-v4', filename: 'conclusions.docx' }],
    });
    mockStateFindOne.mockResolvedValue({
      _id: new mongoose.Types.ObjectId(), tenantId: actualDocumentTenant, documentId,
      structuredDocument: document, revision: 4, status: 'ready_to_send',
      canonical: { checksum: crypto.createHash('sha256').update(buffer).digest('hex'), historyVersionId: 'history-v4', pending: false },
    });
    mockResolveDocumentContent.mockResolvedValue({ buffer, filename: 'conclusions.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    mockSaveHistoryVersion.mockResolvedValueOnce({
      history: { currentVersionId: 'publication-v5' },
      version: {
        versionId: 'publication-v5', filename: 'conclusions.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', checksum: 'c'.repeat(64),
      },
      conflict: false, deduplicated: false,
    });
    mockSaveCanonicalDocument.mockResolvedValue('canonical/conclusions.docx');
    const req = {
      params: { documentId: String(storedId) }, tenantId, user: String(userId),
      body: { expectedRevision: 4, formats: ['docx', 'pdf'], operationKey: 'mail-draft-123' },
    };
    const res = responseMock();

    await publicationHandler()(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.payload).toMatchObject({
      ok: true, revision: 4,
      frozenVersion: { versionId: 'publication-v5' },
      artifacts: {
        docx: { ready: true, versionId: 'publication-v5', format: 'docx' },
        pdf: { ready: true, versionId: 'publication-v5', format: 'pdf' },
      },
    });
    expect(mockSaveHistoryVersion).toHaveBeenCalledWith(expect.objectContaining({
      operationKey: 'mail-draft-123', baseVersionId: 'history-v4', status: 'ready_to_send',
    }));
    expect(mockPreparePublicationArtifacts).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: actualDocumentTenant,
      dossierId: actualDossierId,
      documentId,
      versionId: 'publication-v5',
      revision: 4,
      formats: ['docx', 'pdf'],
      createdBy: expect.any(mongoose.Types.ObjectId),
    }));
  });

  test('télécharge un artefact seulement dans la portée du document accessible', async () => {
    const actualDocumentTenant = new mongoose.Types.ObjectId();
    const actualDossierId = new mongoose.Types.ObjectId();
    const artifactId = new mongoose.Types.ObjectId();
    const file = Buffer.from('%PDF exact');
    mockStoredLean.mockResolvedValue({
      _id: storedId,
      tenantId: actualDocumentTenant,
      documentId,
      dossierId: actualDossierId,
      currentVersionId: 'v7',
      versions: [],
    });
    mockReadPublicationArtifact.mockResolvedValue({
      artifact: {
        _id: artifactId,
        versionId: 'v7',
        format: 'pdf',
        mime: 'application/pdf',
        filename: 'Conclusions.pdf',
        checksum: 'a'.repeat(64),
      },
      buffer: file,
    });
    const req = {
      params: { documentId: String(storedId), artifactId: String(artifactId) },
      tenantId,
      user: String(userId),
      body: {},
    };
    const res = responseMock();

    await publicationDownloadHandler()(req, res);

    expect(mockReadPublicationArtifact).toHaveBeenCalledWith({
      tenantId: actualDocumentTenant,
      dossierId: actualDossierId,
      documentId,
      artifactId: String(artifactId),
    });
    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(res.payload).toBe(file);
  });

  test('refuse de préparer une publication sans clé anti-doublon', async () => {
    const req = { params: { documentId: String(storedId) }, tenantId, user: String(userId), body: { expectedRevision: 1 } };
    const res = responseMock();
    await publicationHandler()(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.payload.error).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(mockSaveHistoryVersion).not.toHaveBeenCalled();
  });

  test('refuse une clé anti-doublon qui serait tronquée de façon ambiguë', async () => {
    const req = {
      params: { documentId: String(storedId) }, tenantId, user: String(userId),
      body: { expectedRevision: 1, operationKey: 'x'.repeat(181) },
    };
    const res = responseMock();
    await publicationHandler()(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.payload.error).toBe('IDEMPOTENCY_KEY_INVALID');
    expect(mockSaveHistoryVersion).not.toHaveBeenCalled();
  });

  test('une autosauvegarde alimente d’abord l’historique central puis la copie DOCX canonique', async () => {
    mockStateFindOne.mockReset();
    const actualDocumentTenant = new mongoose.Types.ObjectId();
    const actualDossierId = new mongoose.Types.ObjectId();
    mockStoredLean.mockResolvedValue({
      _id: storedId,
      tenantId: actualDocumentTenant,
      documentId,
      dossierId: actualDossierId,
      currentVersionId: 'v1',
      versions: [{ versionId: 'v1', filename: 'contrat.docx' }],
    });
    const document = createDefaultDocument('Version actuelle');
    document.blocks[0].runs = [{ text: 'Modification sûre', marks: {} }];
    const stateId = new mongoose.Types.ObjectId();
    const canonicalBuffer = createDocxBuffer(createDefaultDocument('Version canonique de départ'));
    const existing = {
      _id: stateId,
      revision: 2,
      structuredDocument: document,
      canonical: {
        checksum: crypto.createHash('sha256').update(canonicalBuffer).digest('hex'),
        pending: false,
      },
    };
    mockResolveDocumentContent.mockResolvedValue({
      buffer: canonicalBuffer,
      filename: 'contrat.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      source: 'canonical',
    });
    mockStateFindOne.mockResolvedValue(existing);
    const savedState = {
      _id: stateId,
      tenantId: actualDocumentTenant,
      documentId,
      structuredDocument: document,
      revision: 3,
      status: 'draft',
      lastSavedBy: userId,
      lastSavedAt: new Date(),
    };
    mockStateFindOneAndUpdate.mockResolvedValue(savedState);
    mockSaveCanonicalDocument.mockResolvedValue('documents/test.docx');
    const req = {
      params: { documentId: String(storedId) },
      tenantId,
      user: String(userId),
      body: { document, expectedRevision: 2, createVersion: false },
    };
    const res = responseMock();

    await putHandler()(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.ok).toBe(true);
    expect(res.payload.revision).toBe(3);
    expect(res.payload.sync).toEqual(expect.objectContaining({
      canonicalSynced: true,
      canonicalCopySynced: true,
      history: expect.objectContaining({
        versionId: 'history-autosave-v3',
        checkpoint: false,
      }),
    }));
    expect(mockSaveHistoryVersion).toHaveBeenCalledTimes(1);
    expect(mockSaveHistoryVersion).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: actualDocumentTenant,
      dossierId: actualDossierId,
      documentId,
      editor: 'kheops',
      origin: 'kheops',
      structuredDocument: document,
    }));
    expect(mockSaveCanonicalDocument).toHaveBeenCalledTimes(1);
    expect(Buffer.isBuffer(mockSaveCanonicalDocument.mock.calls[0][1])).toBe(true);
    expect(mockSaveCanonicalDocument.mock.calls[0][3]).toMatchObject({
      tenantId: actualDocumentTenant,
      dossierId: actualDossierId,
    });
    expect(mockSaveHistoryVersion.mock.invocationCallOrder[0])
      .toBeLessThan(mockSaveCanonicalDocument.mock.invocationCallOrder[0]);
    expect(mockStateUpdateOne).toHaveBeenCalledWith(
      { _id: stateId, revision: 3 },
      { $set: { canonical: expect.objectContaining({
        pending: false,
        checksum: expect.any(String),
        historyVersionId: 'history-autosave-v3',
      }) } },
    );

    // La réouverture relit la même version depuis l'historique prioritaire et
    // ne considère donc jamais l'état Kheops fraîchement autosauvegardé comme obsolète.
    const autosavedBuffer = mockSaveHistoryVersion.mock.calls[0][0].buffer;
    mockStateFindOne.mockResolvedValue(savedState);
    mockResolveDocumentContent.mockResolvedValue({
      buffer: autosavedBuffer,
      filename: 'Version actuelle.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      source: 'document-history',
      versionId: 'history-autosave-v3',
    });
    const reopenReq = {
      params: { documentId: String(storedId) }, tenantId, user: String(userId), body: {},
    };
    const reopenRes = responseMock();

    await getHandler()(reopenReq, reopenRes);

    expect(reopenRes.statusCode).toBe(200);
    expect(reopenRes.payload).toEqual(expect.objectContaining({
      exists: true,
      revision: 3,
      syncPending: false,
    }));
    expect(reopenRes.payload.document.blocks[0].runs[0].text).toBe('Modification sûre');
  });

  test('une panne de la copie secondaire ne rend pas obsolète l’autosauvegarde déjà courante dans l’historique', async () => {
    mockStateFindOne.mockReset();
    const actualDocumentTenant = new mongoose.Types.ObjectId();
    const actualDossierId = new mongoose.Types.ObjectId();
    mockStoredLean.mockResolvedValue({
      _id: storedId,
      tenantId: actualDocumentTenant,
      documentId,
      dossierId: actualDossierId,
      currentVersionId: 'v1',
      versions: [{ versionId: 'v1', filename: 'contrat.docx' }],
    });
    const document = createDefaultDocument('Dernière autosauvegarde');
    const stateId = new mongoose.Types.ObjectId();
    const oldBuffer = createDocxBuffer(createDefaultDocument('Ancienne version'));
    mockStateFindOne.mockResolvedValue({
      _id: stateId,
      revision: 4,
      structuredDocument: document,
      canonical: {
        checksum: crypto.createHash('sha256').update(oldBuffer).digest('hex'),
        historyVersionId: 'history-v1',
        pending: false,
      },
    });
    mockResolveDocumentContent.mockResolvedValue({
      buffer: oldBuffer,
      filename: 'contrat.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      source: 'document-history',
      versionId: 'history-v1',
    });
    mockStateFindOneAndUpdate.mockResolvedValue({
      _id: stateId,
      tenantId: actualDocumentTenant,
      documentId,
      structuredDocument: document,
      revision: 5,
      status: 'draft',
      lastSavedBy: userId,
      lastSavedAt: new Date(),
    });
    mockSaveCanonicalDocument.mockRejectedValueOnce(new Error('cache GCS indisponible'));
    const req = {
      params: { documentId: String(storedId) },
      tenantId,
      user: String(userId),
      body: { document, expectedRevision: 4, createVersion: false },
    };
    const res = responseMock();

    await putHandler()(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.sync).toEqual(expect.objectContaining({
      canonicalSynced: true,
      canonicalCopySynced: false,
      history: expect.objectContaining({ versionId: 'history-autosave-v3' }),
    }));
    expect(mockStateUpdateOne).toHaveBeenCalledWith(
      { _id: stateId, revision: 5 },
      { $set: { canonical: expect.objectContaining({
        historyVersionId: 'history-autosave-v3',
        pending: false,
      }) } },
    );
  });

  test('bloque un état Kheops devenu obsolète après une modification canonique externe', async () => {
    mockStateFindOne.mockReset();
    const document = createDefaultDocument('Ancienne copie Kheops');
    mockStateFindOne.mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      tenantId,
      documentId,
      structuredDocument: document,
      revision: 7,
      status: 'draft',
      canonical: { checksum: '0'.repeat(64), pending: false },
      original: { checksum: '1'.repeat(64) },
      lastSavedBy: userId,
    });
    const changedBuffer = createDocxBuffer(createDefaultDocument('Modification Word externe'));
    mockResolveDocumentContent.mockResolvedValue({
      buffer: changedBuffer,
      filename: 'contrat.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      source: 'canonical',
    });
    const req = { params: { documentId: String(storedId) }, tenantId, user: String(userId), body: {} };
    const res = responseMock();

    await getHandler()(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.payload).toMatchObject({
      error: 'EDITOR_STATE_STALE',
      editorRevision: 7,
      reloadAvailable: true,
    });
    expect(mockSaveCanonicalDocument).not.toHaveBeenCalled();
  });

  test('revérifie aussi l’empreinte au moment du PUT et n’écrase pas une modification externe récente', async () => {
    mockStateFindOne.mockReset();
    const document = createDefaultDocument('Brouillon encore ouvert');
    mockStateFindOne.mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      tenantId,
      documentId,
      structuredDocument: document,
      revision: 9,
      canonical: { checksum: 'a'.repeat(64), pending: false },
      lastSavedBy: userId,
    });
    mockResolveDocumentContent.mockResolvedValue({
      buffer: createDocxBuffer(createDefaultDocument('Word vient de modifier le fichier')),
      filename: 'contrat.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      source: 'canonical',
    });
    const req = {
      params: { documentId: String(storedId) }, tenantId, user: String(userId),
      body: { document, expectedRevision: 9 },
    };
    const res = responseMock();

    await putHandler()(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.payload.error).toBe('EDITOR_STATE_STALE');
    expect(mockStateFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mockSaveCanonicalDocument).not.toHaveBeenCalled();
  });

  test('recharge explicitement la version externe en conservant le brouillon précédent', async () => {
    mockStateFindOne.mockReset();
    const stateId = new mongoose.Types.ObjectId();
    const oldDocument = createDefaultDocument('Brouillon Kheops précédent');
    const currentState = {
      _id: stateId,
      tenantId,
      documentId,
      structuredDocument: oldDocument,
      revision: 7,
      status: 'draft',
      canonical: { checksum: '0'.repeat(64), pending: false },
      lastSavedBy: userId,
    };
    mockStateFindOne.mockResolvedValue(currentState);
    const changedBuffer = createDocxBuffer(createDefaultDocument('Version Word externe'));
    mockResolveDocumentContent.mockResolvedValue({
      buffer: changedBuffer,
      filename: 'version-word.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      source: 'canonical',
    });
    mockStateFindOneAndUpdate.mockImplementation(async (_filter, update) => ({
      ...currentState,
      structuredDocument: update.$set.structuredDocument,
      compatibility: update.$set.compatibility,
      original: update.$set.original,
      canonical: update.$set.canonical,
      revision: 8,
    }));
    const req = {
      params: { documentId: String(storedId) }, tenantId, user: String(userId),
      body: { expectedRevision: 7 },
    };
    const res = responseMock();

    await reloadHandler()(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.revision).toBe(8);
    expect(res.payload.document.blocks[0].runs[0].text).toBe('Contenu existant');
    expect(mockRevisionCreate).toHaveBeenCalledWith(expect.objectContaining({
      revision: 7,
      structuredDocument: oldDocument,
    }));
    expect(mockOriginalFindOneAndUpdate.mock.invocationCallOrder[0]).toBeLessThan(mockStateFindOneAndUpdate.mock.invocationCallOrder[0]);
    expect(mockSaveCanonicalDocument).not.toHaveBeenCalled();
  });

  test('archive le brouillon DOM non enregistré avant de recharger le canonique', async () => {
    mockStateFindOne.mockReset();
    const stateId = new mongoose.Types.ObjectId();
    const savedDocument = createDefaultDocument('État serveur');
    const localDraft = createDefaultDocument('Brouillon DOM');
    localDraft.blocks[0].runs = [{ text: 'Texte local non enregistré', marks: {} }];
    const currentState = {
      _id: stateId,
      tenantId,
      documentId,
      structuredDocument: savedDocument,
      revision: 11,
      status: 'draft',
      canonical: { checksum: '0'.repeat(64), pending: false },
      lastSavedBy: userId,
    };
    mockStateFindOne.mockResolvedValue(currentState);
    mockResolveDocumentContent.mockResolvedValue({
      buffer: createDocxBuffer(createDefaultDocument('Version externe')),
      filename: 'version-externe.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      source: 'canonical',
    });
    mockStateFindOneAndUpdate.mockImplementation(async (_filter, update) => ({
      ...currentState,
      structuredDocument: update.$set.structuredDocument,
      compatibility: update.$set.compatibility,
      original: update.$set.original,
      canonical: update.$set.canonical,
      revision: currentState.revision + update.$inc.revision,
    }));
    const req = {
      params: { documentId: String(storedId) }, tenantId, user: String(userId),
      body: { expectedRevision: 11, localDraft },
    };
    const res = responseMock();

    await reloadHandler()(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.revision).toBe(13);
    expect(res.payload.unsavedLocalDraftPreserved).toBe(true);
    expect(mockRevisionCreate).toHaveBeenCalledWith(expect.objectContaining({
      revision: 12,
      structuredDocument: expect.objectContaining({ title: 'Brouillon DOM' }),
      comment: expect.stringMatching(/non enregistré/),
    }));
    expect(mockRevisionCreate.mock.invocationCallOrder[0]).toBeLessThan(mockStateFindOneAndUpdate.mock.invocationCallOrder[0]);
  });

  test('reconvertit explicitement un DOC depuis l’original sans réécrire le canonique', async () => {
    mockStateFindOne.mockReset();
    const stateId = new mongoose.Types.ObjectId();
    const originalBuffer = Buffer.concat([
      Buffer.from('d0cf11e0a1b11ae1', 'hex'),
      Buffer.alloc(504),
    ]);
    const previousDocument = createDefaultDocument('Ancienne conversion aplatie');
    const currentState = {
      _id: stateId,
      tenantId,
      documentId,
      structuredDocument: previousDocument,
      revision: 14,
      status: 'draft',
      original: {
        ref: originalId,
        checksum: 'a'.repeat(64),
        filename: 'conclusions.doc',
        mime: 'application/msword',
      },
      canonical: { checksum: 'b'.repeat(64), source: 'document-history', pending: false },
      lastSavedBy: userId,
    };
    mockStateFindOne.mockResolvedValue(currentState);
    mockOriginalFindOne.mockResolvedValue({
      _id: originalId,
      tenantId,
      documentId,
      filename: 'conclusions.doc',
      mime: 'application/msword',
      checksum: 'a'.repeat(64),
      data: originalBuffer,
    });
    const convertedDocx = createDocxBuffer(createDefaultDocument('Conversion riche'));
    mockConvertLegacyWordToDocx.mockResolvedValueOnce({
      buffer: convertedDocx,
      filename: 'conclusions.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      converter: 'libreoffice',
    });
    mockConvertToHtml.mockResolvedValueOnce({
      value: '<p style="text-align:center">Présentation restaurée</p>',
      messages: [],
    });
    mockStateFindOneAndUpdate.mockImplementation(async (_filter, update) => ({
      ...currentState,
      structuredDocument: update.$set.structuredDocument,
      compatibility: update.$set.compatibility,
      fileFormat: update.$set.fileFormat,
      canonical: update.$set.canonical,
      revision: currentState.revision + update.$inc.revision,
    }));
    const req = {
      params: { documentId: String(storedId) }, tenantId, user: String(userId),
      body: { expectedRevision: 14 },
    };
    const res = responseMock();

    await reconvertOriginalHandler()(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual(expect.objectContaining({
      revision: 15,
      originalReconverted: true,
      syncPending: true,
    }));
    expect(mockConvertLegacyWordToDocx).toHaveBeenCalledWith(originalBuffer, 'conclusions.doc');
    expect(mockRevisionCreate).toHaveBeenCalledWith(expect.objectContaining({
      revision: 14,
      structuredDocument: previousDocument,
      comment: expect.stringMatching(/reconversion du DOC original/i),
    }));
    expect(mockStateFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: stateId, revision: 14 },
      expect.objectContaining({
        $set: expect.objectContaining({
          canonical: expect.objectContaining({ checksum: 'b'.repeat(64), pending: true }),
        }),
      }),
      { new: true, runValidators: true },
    );
    expect(mockSaveCanonicalDocument).not.toHaveBeenCalled();
    expect(mockOriginalFindOneAndUpdate).not.toHaveBeenCalled();
  });

  test('conserve l’état courant si la reconversion riche du DOC échoue', async () => {
    mockStateFindOne.mockReset();
    const currentState = {
      _id: new mongoose.Types.ObjectId(),
      tenantId,
      documentId,
      structuredDocument: createDefaultDocument('État à conserver'),
      revision: 20,
      original: { ref: originalId, filename: 'archive.doc', mime: 'application/msword' },
      canonical: { checksum: 'c'.repeat(64), pending: false },
      lastSavedBy: userId,
    };
    mockStateFindOne.mockResolvedValue(currentState);
    mockOriginalFindOne.mockResolvedValue({
      _id: originalId,
      filename: 'archive.doc',
      mime: 'application/msword',
      data: Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(504)]),
    });
    mockConvertLegacyWordToDocx.mockRejectedValueOnce(Object.assign(
      new Error('Convertisseur indisponible'),
      { code: 'LEGACY_DOC_CONVERTER_UNAVAILABLE', statusCode: 503 },
    ));
    const req = {
      params: { documentId: String(storedId) }, tenantId, user: String(userId),
      body: { expectedRevision: 20 },
    };
    const res = responseMock();

    await reconvertOriginalHandler()(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.payload.error).toBe('LEGACY_DOC_CONVERTER_UNAVAILABLE');
    expect(mockRevisionCreate).not.toHaveBeenCalled();
    expect(mockStateFindOneAndUpdate).not.toHaveBeenCalled();
    expect(mockSaveCanonicalDocument).not.toHaveBeenCalled();
  });
});
