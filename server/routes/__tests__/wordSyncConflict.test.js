function load({ conflict = true, canonicalSaveError = null, deduplicated = false } = {}) {
  jest.resetModules();

  const save = canonicalSaveError
    ? jest.fn().mockRejectedValue(canonicalSaveError)
    : jest.fn().mockResolvedValue();
  const saveVersion = jest.fn().mockResolvedValue(conflict ? {
    conflict: true,
    version: { versionId: 'conflict-copy-v3' },
    history: { currentVersionId: 'current-v2' },
  } : {
    conflict: false,
    deduplicated,
    version: { versionId: 'new-v3' },
    history: { currentVersionId: 'new-v3' },
  });

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../utils/ownershipHelpers', () => ({
    ensureDocOwnership: jest.fn().mockResolvedValue({
      ok: true,
      tenantId: '64f0a1b2c3d4e5f6a7b8c9d0',
      dossierId: '64f0a1b2c3d4e5f6a7b8c9d1',
    }),
  }));
  jest.doMock('../../services/fileStorage', () => ({
    getFileStorage: () => ({ save, exists: jest.fn(), read: jest.fn() }),
  }));
  jest.doMock('../../services/documentHistoryService', () => ({
    saveVersion,
    checksumOf: jest.fn(() => 'hash'),
  }));

  const router = require('../word');
  const layer = router.stack.find((item) => item.route?.path === '/:docId/sync' && item.route.methods.post);
  return {
    handler: layer.route.stack[layer.route.stack.length - 1].handle,
    save,
    saveVersion,
  };
}

const DOC_MIME = 'application/msword';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function request(baseVersionId = 'base-v1', {
  buffer = Buffer.from('edited-docx'),
  originalname = 'Acte.docx',
  mimetype = DOCX_MIME,
} = {}) {
  return {
    params: { docId: '64f0a1b2c3d4e5f6a7b8c9d2' },
    user: '64f0a1b2c3d4e5f6a7b8c9d3',
    body: { baseVersionId },
    file: {
      buffer,
      originalname,
      mimetype,
      size: buffer.length,
    },
  };
}

function response() {
  return {
    statusCode: 200,
    status: jest.fn(function setStatus(code) { this.statusCode = code; return this; }),
    json: jest.fn(function sendJson(payload) { this.payload = payload; return this; }),
  };
}

describe('POST /api/word/:docId/sync — protection des versions Word Desktop', () => {
  test('conserve la copie concurrente et ne remplace pas le document canonique', async () => {
    const { handler, save, saveVersion } = load({ conflict: true });
    const res = response();

    await handler(request('base-v1'), res);

    expect(saveVersion).toHaveBeenCalledWith(expect.objectContaining({
      baseVersionId: 'base-v1',
      requireBaseVersion: true,
      editor: 'word_desktop',
    }));
    expect(res.statusCode).toBe(409);
    expect(res.payload).toEqual(expect.objectContaining({
      error: 'DOCUMENT_VERSION_CONFLICT',
      savedConflictVersionId: 'conflict-copy-v3',
      currentVersionId: 'current-v2',
      baseVersionId: 'base-v1',
    }));
    expect(save).not.toHaveBeenCalled();
  });

  test('met à jour la copie canonique seulement après une précondition valide', async () => {
    const { handler, save, saveVersion } = load({ conflict: false });
    const res = response();

    // Une ancienne métadonnée application/msword ne doit pas dégrader un nom
    // explicite .docx : extension, MIME et clé canonique restent OOXML.
    await handler(request('current-v2', {
      originalname: 'Acte.docx',
      mimetype: DOC_MIME,
    }), res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual(expect.objectContaining({
      ok: true,
      versionId: 'new-v3',
      filename: 'Acte.docx',
      mime: DOCX_MIME,
      key: expect.stringMatching(/\.docx$/),
    }));
    expect(saveVersion).toHaveBeenCalledWith(expect.objectContaining({
      filename: 'Acte.docx',
      mime: DOCX_MIME,
    }));
    expect(save).toHaveBeenCalledWith(
      expect.stringMatching(/\.docx$/),
      Buffer.from('edited-docx'),
      { contentType: DOCX_MIME },
    );
  });

  test('conserve fidèlement les octets, le nom, le MIME et la clé canonique d’un ancien .doc', async () => {
    const { handler, save, saveVersion } = load({ conflict: false });
    const res = response();
    const legacyBytes = Buffer.from('legacy-doc-ole-bytes');

    await handler(request('legacy-v2', {
      buffer: legacyBytes,
      originalname: 'Conclusions historiques.doc',
      // Même si une table MIME locale se trompe, l’extension explicite du
      // fichier réellement surveillé par le compagnon reste la référence.
      mimetype: DOCX_MIME,
    }), res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual(expect.objectContaining({
      ok: true,
      filename: 'Conclusions historiques.doc',
      mime: DOC_MIME,
      key: expect.stringMatching(/\.doc$/),
    }));
    expect(saveVersion).toHaveBeenCalledWith(expect.objectContaining({
      buffer: legacyBytes,
      filename: 'Conclusions historiques.doc',
      mime: DOC_MIME,
      editor: 'word_desktop',
      origin: 'companion',
    }));
    expect(save).toHaveBeenCalledWith(
      expect.stringMatching(/\.doc$/),
      legacyBytes,
      { contentType: DOC_MIME },
    );
  });

  test("une panne canonique reste non bloquante et renvoie la nouvelle base pour un retry idempotent", async () => {
    const { handler, save } = load({
      conflict: false,
      canonicalSaveError: new Error('GCS temporairement indisponible'),
      deduplicated: true,
    });
    const res = response();

    await handler(request('current-v2'), res);

    expect(save).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual(expect.objectContaining({
      ok: true,
      versionId: 'new-v3',
      deduplicated: true,
      canonicalSynced: false,
      warning: expect.stringMatching(/version est enregistrée/i),
    }));
  });
});
