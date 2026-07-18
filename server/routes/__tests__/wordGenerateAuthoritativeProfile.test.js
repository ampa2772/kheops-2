jest.mock('../../middlewares/middleware-auth', () => (req, _res, next) => next());

const mockProfileLean = jest.fn();
const mockProfileSelect = jest.fn(() => ({ lean: mockProfileLean }));
const mockFindUserById = jest.fn(() => ({ select: mockProfileSelect }));
jest.mock('../../models/App_Users/User', () => ({
  findById: (...args) => mockFindUserById(...args),
}));

const mockEnsureDocOwnership = jest.fn();
jest.mock('../../utils/ownershipHelpers', () => ({
  ensureDocOwnership: (...args) => mockEnsureDocOwnership(...args),
  ensureDossierOwnership: jest.fn(),
}));

const mockStorage = {
  exists: jest.fn(),
  read: jest.fn(),
  save: jest.fn(),
};
jest.mock('../../services/fileStorage', () => ({
  getFileStorage: () => mockStorage,
}));

const mockBuildDocumentVariables = jest.fn();
jest.mock('../../services/docx/variables', () => ({
  buildDocumentVariables: (...args) => mockBuildDocumentVariables(...args),
}));

const mockGenerateDocx = jest.fn();
jest.mock('../../services/docx/docxGenerator', () => ({
  generateDocx: (...args) => mockGenerateDocx(...args),
}));

const mockSaveVersion = jest.fn();
jest.mock('../../services/documentHistoryService', () => ({
  saveVersion: (...args) => mockSaveVersion(...args),
}));

const router = require('../word');

function generateHandler() {
  const layer = router.stack.find((item) => item.route
    && item.route.path === '/:docId/generate'
    && item.route.methods.post);
  if (!layer) throw new Error('Route POST /:docId/generate introuvable');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function responseMock() {
  return {
    statusCode: 200,
    status: jest.fn(function status(code) { this.statusCode = code; return this; }),
    json: jest.fn(function json(payload) { this.payload = payload; return this; }),
  };
}

describe('génération Word avec profil serveur autoritatif', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureDocOwnership.mockResolvedValue({ ok: true, tenantId: 'tenant-1', dossierId: 'dossier-1' });
    mockStorage.exists.mockResolvedValue(true);
    mockStorage.read.mockResolvedValue(Buffer.from('template'));
    mockStorage.save.mockResolvedValue(undefined);
    mockBuildDocumentVariables.mockReturnValue({ titre: 'Madame Alice Martin' });
    mockGenerateDocx.mockResolvedValue(Buffer.from('generated-docx'));
    mockSaveVersion.mockResolvedValue({ version: { versionId: 'version-1' } });
  });

  test('charge les réglages depuis req.user et remplace le profil client obsolète', async () => {
    const profile = {
      _id: 'user-1',
      firstName: 'Alice',
      lastName: 'Martin',
      city: 'Paris',
      header: 'Cabinet Martin',
      signature: 'Maître Alice Martin',
      signatureImage: 'data:image/png;base64,SERVER',
      headerFontFamily: 'Georgia',
      headerFontSize: 12,
      headerFontWeight: 'bold',
      headerTextAlign: 'right',
    };
    mockProfileLean.mockResolvedValue(profile);
    const req = {
      params: { docId: 'document-1' },
      user: 'user-1',
      body: {
        templateName: 'courrier.docx',
        header: 'EN-TÊTE CLIENT INTERDIT',
        signatureText: 'SIGNATURE CLIENT INTERDITE',
        clientData: {
          dossier: { _id: 'dossier-1' },
          recipients: [{ nom: 'Martin' }],
          userProfile: { header: 'PROFIL REDUX OBSOLÈTE' },
        },
      },
    };
    const res = responseMock();

    await generateHandler()(req, res);

    expect(mockFindUserById).toHaveBeenCalledWith('user-1');
    expect(mockBuildDocumentVariables).toHaveBeenCalledWith(expect.objectContaining({
      userProfile: profile,
    }));
    expect(mockGenerateDocx).toHaveBeenCalledWith(expect.objectContaining({
      header: 'Cabinet Martin',
      signatureText: 'Maître Alice Martin',
      signatureImageBase64: 'data:image/png;base64,SERVER',
      fontOptions: {
        fontFamily: 'Georgia',
        fontSize: 12,
        fontWeight: 'bold',
        textAlign: 'right',
      },
    }));
    expect(mockGenerateDocx.mock.calls[0][0]).not.toEqual(expect.objectContaining({
      header: 'EN-TÊTE CLIENT INTERDIT',
    }));
    expect(res.statusCode).toBe(200);
  });

  test('transmet des décorations vides sans rien composer si le profil ne les définit pas', async () => {
    mockProfileLean.mockResolvedValue({
      _id: 'user-1',
      firstName: 'Alice',
      lastName: 'Martin',
      city: 'Paris',
    });
    const req = {
      params: { docId: 'document-2' },
      user: { id: 'user-1' },
      body: {
        templateName: 'courrier.docx',
        clientData: { dossier: { _id: 'dossier-1' }, recipients: [] },
      },
    };
    const res = responseMock();

    await generateHandler()(req, res);

    expect(mockGenerateDocx).toHaveBeenCalledWith(expect.objectContaining({
      header: '',
      signatureText: '',
      signatureImageBase64: '',
    }));
    expect(res.statusCode).toBe(200);
  });

  test('refuse la génération si le JWT ne correspond plus à aucun profil', async () => {
    mockProfileLean.mockResolvedValue(null);
    const req = {
      params: { docId: 'document-3' },
      user: 'missing-user',
      body: { templateName: 'courrier.docx', clientData: { dossier: {}, recipients: [] } },
    };
    const res = responseMock();

    await generateHandler()(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.payload.error).toBe('user-profile-not-found');
    expect(mockGenerateDocx).not.toHaveBeenCalled();
  });
});
