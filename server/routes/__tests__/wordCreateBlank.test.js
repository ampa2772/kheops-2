// Tests de POST /api/word/:docId/create-blank — fabrication serveur d'un
// .docx VIERGE (pendant web du bouton « Document vierge »).
// On vérifie que le fichier écrit est un VRAI .docx : signature ZIP « PK »
// et pièces OOXML minimales lisibles par pizzip.

const PizZip = require('pizzip');

function loadHandler({ ownershipOk = true } = {}) {
  jest.resetModules();

  const save = jest.fn().mockResolvedValue();
  const storage = { save, exists: jest.fn(), read: jest.fn(), delete: jest.fn() };

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../utils/ownershipHelpers', () => ({
    ensureDocOwnership: jest.fn(async (req, res) => {
      if (!ownershipOk) {
        res.status(403).json({ message: 'refus' });
        return { ok: false };
      }
      return { ok: true };
    }),
    ensureDossierOwnership: jest.fn(),
    ensureContactOwnership: jest.fn(),
    ensureOfficeUserOwnership: jest.fn(),
  }));
  jest.doMock('../../services/fileStorage', () => ({ getFileStorage: () => storage }));

  const router = require('../word');
  const layer = router.stack.find((l) => l.route && l.route.path === '/:docId/create-blank' && l.route.methods.post);
  if (!layer) throw new Error('route create-blank introuvable');
  return { handler: layer.route.stack[layer.route.stack.length - 1].handle, save };
}

function fakeReqRes(docId) {
  const req = { params: { docId }, user: 'U1', headers: {}, method: 'POST', originalUrl: '/api/word/x' };
  const res = {
    statusCode: 200,
    status: jest.fn(function (c) { this.statusCode = c; return this; }),
    json: jest.fn(function (p) { this.payload = p; return this; }),
  };
  return { req, res };
}

afterEach(() => jest.clearAllMocks());

test('fabrique et enregistre un VRAI .docx vierge sous documents/<docId>.docx', async () => {
  const { handler, save } = loadHandler();
  const { req, res } = fakeReqRes('64f0a1b2c3d4e5f6a7b8c9d0');

  await handler(req, res);

  expect(res.statusCode).toBe(200);
  expect(res.payload.ok).toBe(true);
  expect(save).toHaveBeenCalledTimes(1);
  const [key, buffer, opts] = save.mock.calls[0];
  expect(key).toBe('documents/64f0a1b2c3d4e5f6a7b8c9d0.docx');
  expect(opts.contentType).toMatch(/wordprocessingml/);

  // Signature ZIP « PK » + pièces OOXML minimales présentes et lisibles.
  expect(buffer[0]).toBe(0x50);
  expect(buffer[1]).toBe(0x4b);
  const zip = new PizZip(buffer);
  expect(zip.file('word/document.xml')).toBeTruthy();
  expect(zip.file('[Content_Types].xml')).toBeTruthy();
  expect(zip.file('_rels/.rels')).toBeTruthy();
  expect(zip.file('word/document.xml').asText()).toContain('<w:body>');
});

test('🔒 document hors cabinet → 403, rien n\'est écrit', async () => {
  const { handler, save } = loadHandler({ ownershipOk: false });
  const { req, res } = fakeReqRes('64f0a1b2c3d4e5f6a7b8c9d0');

  await handler(req, res);

  expect(res.status).toHaveBeenCalledWith(403);
  expect(save).not.toHaveBeenCalled();
});

test('panne de stockage → 500 explicite', async () => {
  const { handler, save } = loadHandler();
  save.mockRejectedValue(new Error('stockage indisponible'));
  const { req, res } = fakeReqRes('abc');

  await handler(req, res);

  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.payload.error).toBe('blank-creation-failed');
});
