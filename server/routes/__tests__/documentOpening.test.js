function queryResult(value) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

function loadRoute({
  user,
  updatedUser,
  storageProvider = 'managed_gcs',
  googleConnected = false,
  microsoftConnected = false,
  tenant = { _id: 'tenant-1', ownerUserId: 'user-1' },
  updatedTenant,
  adminMembership = null,
  dossier = null,
  updatedDossier,
  documentAccess = { ok: true, dossierId: 'dossier-1' },
  documentContent = { buffer: Buffer.from('docx'), filename: 'Document.docx' },
  compatibility = { level: 'complete', score: 0, warnings: [], features: {} },
} = {}) {
  jest.resetModules();

  const findById = jest.fn(() => queryResult(user || null));
  const findByIdAndUpdate = jest.fn((id, update) => queryResult(
    update.$unset ? { _id: id } : (updatedUser || user || null),
  ));
  const User = { findById, findByIdAndUpdate };
  const tenantFindById = jest.fn(() => queryResult(tenant));
  const tenantFindByIdAndUpdate = jest.fn(() => queryResult(updatedTenant || tenant));
  const Tenant = { findById: tenantFindById, findByIdAndUpdate: tenantFindByIdAndUpdate };
  const membershipFindOne = jest.fn(() => queryResult(adminMembership));
  const Membership = { findOne: membershipFindOne };
  const dossierFindOne = jest.fn(() => queryResult(dossier));
  const dossierFindById = jest.fn(() => queryResult(dossier));
  const dossierFindOneAndUpdate = jest.fn(() => queryResult(updatedDossier || dossier));
  const Dossier = { findOne: dossierFindOne, findById: dossierFindById, findOneAndUpdate: dossierFindOneAndUpdate };
  const ensureDocOwnership = jest.fn().mockResolvedValue(documentAccess);
  const getStorageProviderConfig = jest.fn().mockResolvedValue({ provider: storageProvider });
  const googleProbe = jest.fn().mockResolvedValue(googleConnected);
  const microsoftProbe = jest.fn().mockResolvedValue(microsoftConnected);
  const resolveDocumentContent = jest.fn().mockResolvedValue(documentContent);
  const analyzeDocx = jest.fn().mockReturnValue(compatibility);
  const isDocxBuffer = jest.fn().mockReturnValue(true);

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../middlewares/requireTenant', () => (req, res, next) => next());
  jest.doMock('../../models/App_Users/User', () => User);
  jest.doMock('../../models/Cabinet/Tenant', () => Tenant);
  jest.doMock('../../models/Cabinet/Membership', () => Membership);
  jest.doMock('../../models/Folder/Dossier', () => Dossier);
  jest.doMock('../../utils/ownershipHelpers', () => ({ ensureDocOwnership }));
  jest.doMock('../../services/storage', () => ({ getStorageProviderConfig }));
  jest.doMock('../../services/storage/googleDriveClient', () => ({ isConnected: googleProbe }));
  jest.doMock('../../services/storage/oneDriveClient', () => ({ isConnected: microsoftProbe }));
  jest.doMock('../../services/documentContentService', () => ({ resolveDocumentContent }));
  jest.doMock('../../services/documentCompatibilityService', () => ({ analyzeDocx, isDocxBuffer }));

  const router = require('../documentOpening');
  const handler = (path, method) => {
    const layer = router.stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
    return layer.route.stack[layer.route.stack.length - 1].handle;
  };

  return {
    handlers: {
      getPreference: handler('/preferences', 'get'),
      putPreference: handler('/preferences', 'put'),
      deletePreference: handler('/preferences', 'delete'),
      getPolicy: handler('/policy', 'get'),
      putPolicy: handler('/policy', 'put'),
      getDocumentPreference: handler('/documents/:docId', 'get'),
      putDocumentPreference: handler('/documents/:docId', 'put'),
      deleteDocumentPreference: handler('/documents/:docId', 'delete'),
      textPreview: handler('/documents/:docId/text-preview', 'get'),
      pdfPreview: handler('/documents/:docId/pdf-preview', 'get'),
      imagePreview: handler('/documents/:docId/image-preview', 'get'),
      availability: handler('/availability', 'get'),
    },
    User,
    getStorageProviderConfig,
    googleProbe,
    microsoftProbe,
    Tenant,
    Membership,
    Dossier,
    ensureDocOwnership,
    resolveDocumentContent,
    analyzeDocx,
  };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    status: jest.fn(function setStatus(code) { this.statusCode = code; return this; }),
    set: jest.fn(function setHeaders(headers) { Object.assign(this.headers, headers); return this; }),
    send: jest.fn(function send(payload) { this.payload = payload; return this; }),
    json: jest.fn(function sendJson(payload) { this.payload = payload; return this; }),
  };
}

const req = (body = {}) => ({
  user: 'user-1',
  tenantId: 'tenant-1',
  body,
});

const DOCUMENT_ID = '64b64b64b64b64b64b64b64b';
const docReq = (body = {}) => ({
  ...req(body),
  params: { docId: DOCUMENT_ID },
  method: 'GET',
  originalUrl: `/api/document-opening/documents/${DOCUMENT_ID}`,
});

describe('preferences d’ouverture documentaire', () => {
  test('GET renvoie Toujours demander tant qu’aucun choix explicite n’existe', async () => {
    const { handlers } = loadRoute({ user: { _id: 'user-1' } });
    const res = response();

    await handlers.getPreference(req(), res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.preference).toEqual(expect.objectContaining({
      mode: 'ask',
      configured: false,
      rememberChoice: false,
    }));
  });

  test('PUT rejette un mode inconnu avant toute écriture', async () => {
    const { handlers, User } = loadRoute({ user: { _id: 'user-1' } });
    const res = response();

    await handlers.putPreference(req({ mode: 'libreoffice' }), res);

    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual(expect.objectContaining({
      error: 'INVALID_DOCUMENT_OPENING_PREFERENCE',
      field: 'mode',
    }));
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('PUT mémorise uniquement les champs autorisés et conserve les consentements explicites', async () => {
    const now = new Date();
    const updatedUser = {
      documentOpening: {
        mode: 'google_docs',
        rememberChoice: true,
        lastUsedMode: 'google_docs',
        externalTransferConsents: { googleDrive: true, oneDrive: false },
        updatedAt: now,
      },
    };
    const { handlers, User } = loadRoute({ user: { _id: 'user-1' }, updatedUser });
    const res = response();

    await handlers.putPreference(req({
      mode: 'google_docs',
      lastUsedMode: 'google_docs',
      externalTransferConsents: { googleDrive: true },
      googleRefreshToken: 'ne-doit-jamais-etre-ecrit',
    }), res);

    expect(res.statusCode).toBe(200);
    expect(res.payload.preference).toEqual(expect.objectContaining({
      mode: 'google_docs',
      configured: true,
      rememberChoice: true,
    }));
    const update = User.findByIdAndUpdate.mock.calls[0][1];
    expect(update.$set).toEqual(expect.objectContaining({
      'documentOpening.mode': 'google_docs',
      'documentOpening.rememberChoice': true,
      'documentOpening.lastUsedMode': 'google_docs',
      'documentOpening.externalTransferConsents.googleDrive': true,
    }));
    expect(JSON.stringify(update)).not.toContain('googleRefreshToken');
  });

  test('DELETE supprime le sous-document et réactive la question au prochain usage', async () => {
    const { handlers, User } = loadRoute({ user: { _id: 'user-1' } });
    const res = response();

    await handlers.deletePreference(req(), res);

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'user-1',
      { $unset: { documentOpening: 1 } },
      { new: true },
    );
    expect(res.payload).toEqual(expect.objectContaining({
      ok: true,
      preference: expect.objectContaining({ mode: 'ask', configured: false }),
    }));
  });
});

describe('disponibilité des éditeurs', () => {
  test('expose la lecture navigateur et les choix TXT sans rendre le mode natif disponible', async () => {
    const tenant = {
      _id: 'tenant-1',
      ownerUserId: 'user-1',
      documentPolicy: { allowGoogleConversion: true },
    };
    const { handlers } = loadRoute({
      user: { googleRefreshToken: 'google-token' },
      tenant,
      googleConnected: true,
    });
    const res = response();

    await handlers.availability({
      ...req(),
      query: { fileName: 'Notes.txt', mimeType: 'text/plain; charset=utf-8' },
    }, res);

    expect(res.payload.format).toEqual(expect.objectContaining({ kind: 'text', readOnlyPreview: true }));
    expect(res.payload.methods.browser_preview).toEqual(expect.objectContaining({
      available: true,
      readOnly: true,
    }));
    expect(res.payload.methods.kheops).toEqual(expect.objectContaining({
      available: true,
      label: 'Éditeur texte Kheops',
    }));
    expect(res.payload.methods.word_desktop).toEqual(expect.objectContaining({
      available: false,
      requiresClientCheck: false,
      reason: 'TXT_NATIVE_COMPANION_UNAVAILABLE',
    }));
    expect(res.payload.methods.word_web).toEqual(expect.objectContaining({
      available: false,
      reason: 'TXT_WORD_ONLINE_IMPORT_REQUIRED',
    }));
    expect(res.payload.methods.google_docs.available).toBe(true);
    expect(res.payload.recommendedMode).toBe('browser_preview');
  });

  test("laisse Google Docs indisponible pour TXT si l'import n'est pas autorisé", async () => {
    const { handlers } = loadRoute({
      user: { googleRefreshToken: 'google-token' },
      googleConnected: true,
    });
    const res = response();

    await handlers.availability({ ...req(), query: { fileName: 'Notes.txt' } }, res);

    expect(res.payload.methods.google_docs).toEqual(expect.objectContaining({
      available: false,
      reason: 'TXT_GOOGLE_CONVERSION_DISABLED',
    }));
  });

  test('agrège connexions et stockage sans exposer les jetons', async () => {
    const user = {
      documentOpening: { mode: 'ask', updatedAt: null },
      googleRefreshToken: 'secret-google',
      microsoftRefreshToken: 'secret-microsoft',
      sharePoint: { enabled: false },
    };
    const { handlers, googleProbe, microsoftProbe } = loadRoute({
      user,
      storageProvider: 'google_drive',
      googleConnected: true,
      microsoftConnected: false,
    });
    const res = response();

    await handlers.availability(req(), res);

    expect(googleProbe).toHaveBeenCalledWith('user-1');
    expect(microsoftProbe).toHaveBeenCalledWith('user-1');
    expect(res.payload.methods.google_docs.available).toBe(true);
    expect(res.payload.methods.word_web).toEqual(expect.objectContaining({
      available: false,
      reason: 'MICROSOFT_CONNECTION_UNAVAILABLE',
    }));
    expect(res.payload.methods.word_desktop).toEqual(expect.objectContaining({
      available: null,
      requiresClientCheck: true,
    }));
    expect(res.payload.recommendedMode).toBe('google_docs');
    expect(res.payload.policy.storageProvider).toBe('google_drive');
    const serialized = JSON.stringify(res.payload);
    expect(serialized).not.toContain('secret-google');
    expect(serialized).not.toContain('secret-microsoft');
    expect(serialized).not.toContain('RefreshToken');
  });

  test('n’appelle pas les fournisseurs sans jeton et explique la reconnexion nécessaire', async () => {
    const { handlers, googleProbe, microsoftProbe } = loadRoute({
      user: { documentOpening: { mode: 'automatic', updatedAt: new Date() } },
    });
    const res = response();

    await handlers.availability(req(), res);

    expect(googleProbe).not.toHaveBeenCalled();
    expect(microsoftProbe).not.toHaveBeenCalled();
    expect(res.payload.methods.google_docs.reason).toBe('GOOGLE_ACCOUNT_REQUIRED');
    expect(res.payload.methods.word_web.reason).toBe('MICROSOFT_ACCOUNT_REQUIRED');
    expect(res.payload.recommendedMode).toBe('kheops');
  });

  test('analyse le DOCX avant le choix et recommande Word pour un document complexe', async () => {
    const dossier = {
      _id: 'dossier-1',
      dossier: { documents: [{ _id: DOCUMENT_ID }] },
    };
    const complex = {
      level: 'complex',
      score: 50,
      warnings: ['Macros VBA détectées : utilisez Microsoft Word.'],
      features: { macros: true },
    };
    const { handlers, resolveDocumentContent, analyzeDocx } = loadRoute({
      user: {
        documentOpening: { mode: 'automatic', updatedAt: new Date() },
        microsoftRefreshToken: 'microsoft-token',
      },
      microsoftConnected: true,
      dossier,
      documentAccess: { ok: true, dossierId: 'dossier-1', tenantId: 'tenant-1' },
      compatibility: complex,
    });
    const res = response();

    await handlers.availability({
      ...req(),
      query: { documentId: DOCUMENT_ID, fileName: 'Conclusions.docx' },
    }, res);

    expect(resolveDocumentContent).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      dossierId: 'dossier-1',
      documentId: DOCUMENT_ID,
    }));
    expect(analyzeDocx).toHaveBeenCalledTimes(1);
    expect(res.payload.compatibility).toEqual(expect.objectContaining({
      level: 'complex',
      label: 'Document complexe',
      recommendationReason: 'COMPLEX_DOCUMENT_WORD_RECOMMENDED',
    }));
    expect(res.payload.recommendedMode).toBe('word_desktop');
    expect(res.payload.userPreference.mode).toBe('automatic');
    expect(res.payload.documentPreference).toEqual({
      documentId: DOCUMENT_ID,
      mode: null,
      configured: false,
    });
  });

  test('propose Kheops pour .doc avec conversion explicite et recommande Word en automatique', async () => {
    const { handlers } = loadRoute({
      user: { documentOpening: { mode: 'automatic', updatedAt: new Date() } },
    });
    const res = response();

    await handlers.availability({
      ...req(),
      query: { fileName: 'Conclusions historiques.doc', mimeType: 'application/msword' },
    }, res);

    expect(res.payload.methods.kheops).toEqual(expect.objectContaining({
      available: true,
      reason: null,
      conversionRequired: true,
      conversionTarget: 'docx',
      originalPreserved: true,
    }));
    expect(res.payload.methods.word_desktop).toEqual(expect.objectContaining({
      available: null,
      requiresClientCheck: true,
    }));
    expect(res.payload.methods.word_web).toEqual(expect.objectContaining({
      available: false,
      reason: 'DOCX_REQUIRED',
    }));
    expect(res.payload.methods.google_docs).toEqual(expect.objectContaining({
      available: false,
      reason: 'DOCX_REQUIRED',
    }));
    expect(res.payload.format).toEqual({
      kind: 'legacy-word',
      extension: 'doc',
      mimeType: 'application/msword',
      conversionRequired: true,
      conversionTarget: 'docx',
      originalPreserved: true,
    });
    expect(res.payload.recommendedMode).toBe('word_desktop');
  });

  test('respecte la préférence Kheops explicite pour .doc même si Word Desktop doit être vérifié', async () => {
    const { handlers } = loadRoute({
      user: { documentOpening: { mode: 'kheops', rememberChoice: true, updatedAt: new Date() } },
    });
    const res = response();

    await handlers.availability({
      ...req(),
      query: { fileName: 'Conclusions historiques.doc' },
    }, res);

    expect(res.payload.methods.kheops.available).toBe(true);
    expect(res.payload.recommendedMode).toBe('kheops');
  });

  test('traite un fichier nommé .docx comme DOCX même si son MIME historique vaut application/msword', async () => {
    const { handlers } = loadRoute({
      user: { documentOpening: { mode: 'kheops', rememberChoice: true, updatedAt: new Date() } },
    });
    const res = response();

    await handlers.availability({
      ...req(),
      query: { fileName: 'Conclusions.docx', mimeType: 'application/msword' },
    }, res);

    expect(res.payload.format).toBeUndefined();
    expect(res.payload.methods.kheops).not.toHaveProperty('conversionRequired');
    expect(res.payload.recommendedMode).toBe('kheops');
  });

  test('traite un fichier nommé .doc comme DOC historique même si son MIME annonce DOCX', async () => {
    const { handlers } = loadRoute({
      user: { documentOpening: { mode: 'kheops', rememberChoice: true, updatedAt: new Date() } },
    });
    const res = response();

    await handlers.availability({
      ...req(),
      query: {
        fileName: 'Conclusions.doc',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    }, res);

    expect(res.payload.format).toEqual(expect.objectContaining({
      kind: 'legacy-word',
      extension: 'doc',
      conversionRequired: true,
      conversionTarget: 'docx',
      originalPreserved: true,
    }));
    expect(res.payload.methods.kheops).toEqual(expect.objectContaining({
      available: true,
      conversionRequired: true,
      conversionTarget: 'docx',
    }));
    expect(res.payload.recommendedMode).toBe('kheops');
  });
});

describe('lecture authentifiée des fichiers texte', () => {
  test('sert uniquement le texte UTF-8 du document autorisé avec des en-têtes sûrs', async () => {
    const dossier = {
      _id: 'dossier-1',
      dossier: { documents: [{ _id: DOCUMENT_ID, nomDocument: 'Notes.txt' }] },
    };
    const { handlers, resolveDocumentContent } = loadRoute({
      dossier,
      documentAccess: { ok: true, dossierId: 'dossier-1', tenantId: 'tenant-1' },
      documentContent: {
        buffer: Buffer.from('<script>alert(1)</script>\nBonjour', 'utf8'),
        filename: 'Notes.txt',
        mime: 'text/plain; charset=utf-8',
      },
    });
    const res = response();

    await handlers.textPreview(docReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers).toEqual(expect.objectContaining({
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Document-Read-Only': 'true',
    }));
    expect(Buffer.isBuffer(res.payload)).toBe(true);
    expect(res.payload.toString('utf8')).toBe('<script>alert(1)</script>\nBonjour');
    expect(resolveDocumentContent).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      dossierId: 'dossier-1',
      documentId: DOCUMENT_ID,
    }));
  });

  test('refuse un contenu binaire même si son nom se termine par .txt', async () => {
    const dossier = {
      _id: 'dossier-1',
      dossier: { documents: [{ _id: DOCUMENT_ID, nomDocument: 'Faux.txt' }] },
    };
    const { handlers } = loadRoute({
      dossier,
      documentAccess: { ok: true, dossierId: 'dossier-1', tenantId: 'tenant-1' },
      documentContent: {
        buffer: Buffer.from([0x41, 0x00, 0x42]),
        filename: 'Faux.txt',
        mime: 'text/plain',
      },
    });
    const res = response();

    await handlers.textPreview(docReq(), res);

    expect(res.statusCode).toBe(415);
    expect(res.payload.error).toBe('TEXT_PREVIEW_BINARY_CONTENT');
  });

  test('oriente vers le téléchargement au-delà de la limite de 5 Mo', async () => {
    const dossier = {
      _id: 'dossier-1',
      dossier: { documents: [{ _id: DOCUMENT_ID, nomDocument: 'Tres-long.txt' }] },
    };
    const { handlers } = loadRoute({
      dossier,
      documentAccess: { ok: true, dossierId: 'dossier-1', tenantId: 'tenant-1' },
      documentContent: {
        buffer: Buffer.alloc((5 * 1024 * 1024) + 1, 0x41),
        filename: 'Tres-long.txt',
        mime: 'text/plain',
      },
    });
    const res = response();

    await handlers.textPreview(docReq(), res);

    expect(res.statusCode).toBe(413);
    expect(res.payload).toEqual(expect.objectContaining({
      error: 'TEXT_PREVIEW_TOO_LARGE',
      message: expect.stringMatching(/5 Mo.*[Tt]elechargez/),
    }));
  });
});

describe('consultation authentifiée des fichiers PDF', () => {
  const dossierPdf = {
    _id: 'dossier-1',
    dossier: { documents: [{ _id: DOCUMENT_ID, nomDocument: 'Assignation.pdf' }] },
  };

  test('sert inline uniquement le PDF autorisé avec un nom et des en-têtes sûrs', async () => {
    const pdf = Buffer.from('%PDF-1.7\n% contenu de test', 'ascii');
    const { handlers, resolveDocumentContent } = loadRoute({
      dossier: dossierPdf,
      documentAccess: { ok: true, dossierId: 'dossier-1', tenantId: 'tenant-1' },
      documentContent: {
        buffer: pdf,
        filename: '../Assignation\r\nX-Injected: yes.pdf',
        mime: 'application/pdf; version=1.7',
      },
    });
    const res = response();

    await handlers.pdfPreview(docReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers).toEqual(expect.objectContaining({
      'Cache-Control': 'private, no-store',
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdf.length),
      'X-Content-Type-Options': 'nosniff',
    }));
    expect(res.headers['Content-Disposition']).toMatch(/^inline; filename\*=UTF-8''/);
    expect(res.headers['Content-Disposition']).not.toMatch(/[\r\n]/);
    expect(res.payload).toBe(pdf);
    expect(resolveDocumentContent).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      dossierId: 'dossier-1',
      documentId: DOCUMENT_ID,
    }));
  });

  test('refuse un faux PDF même si son extension et son MIME annoncent un PDF', async () => {
    const { handlers } = loadRoute({
      dossier: dossierPdf,
      documentAccess: { ok: true, dossierId: 'dossier-1', tenantId: 'tenant-1' },
      documentContent: {
        buffer: Buffer.from('<html>pas un PDF</html>', 'utf8'),
        filename: 'Faux.pdf',
        mime: 'application/pdf',
      },
    });
    const res = response();

    await handlers.pdfPreview(docReq(), res);

    expect(res.statusCode).toBe(415);
    expect(res.payload.error).toBe('PDF_PREVIEW_INVALID_CONTENT');
    expect(res.headers['Content-Type']).toBeUndefined();
  });

  test('refuse un autre format même si ses octets commencent par une signature PDF', async () => {
    const { handlers } = loadRoute({
      dossier: dossierPdf,
      documentAccess: { ok: true, dossierId: 'dossier-1', tenantId: 'tenant-1' },
      documentContent: {
        buffer: Buffer.from('%PDF-1.7\ncontenu', 'ascii'),
        filename: 'Document.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    });
    const res = response();

    await handlers.pdfPreview(docReq(), res);

    expect(res.statusCode).toBe(415);
    expect(res.payload.error).toBe('PDF_PREVIEW_UNSUPPORTED_FORMAT');
  });

  test('un refus ownership arrête la route avant toute lecture du dossier ou du contenu', async () => {
    const { handlers, Dossier, resolveDocumentContent } = loadRoute({
      dossier: dossierPdf,
      documentAccess: { ok: false },
    });
    const res = response();

    await handlers.pdfPreview(docReq(), res);

    expect(Dossier.findOne).not.toHaveBeenCalled();
    expect(resolveDocumentContent).not.toHaveBeenCalled();
  });
});

describe('consultation authentifiée des images raster sûres', () => {
  const imageDossier = (name) => ({
    _id: 'dossier-1',
    dossier: { documents: [{ _id: DOCUMENT_ID, nomDocument: name }] },
  });
  const samples = [
    ['PNG', 'Photo.png', 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01])],
    ['JPEG', 'Photo.jpeg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01])],
    ['GIF', 'Animation.gif', 'image/gif', Buffer.from('GIF89a contenu', 'ascii')],
    ['WebP', 'Photo.webp', 'image/webp', Buffer.concat([
      Buffer.from('RIFF', 'ascii'), Buffer.from([0x04, 0x00, 0x00, 0x00]), Buffer.from('WEBPdata', 'ascii'),
    ])],
  ];

  test.each(samples)('sert inline une image %s dont le format et la signature concordent', async (
    _label,
    filename,
    mime,
    buffer,
  ) => {
    const { handlers } = loadRoute({
      dossier: imageDossier(filename),
      documentAccess: { ok: true, dossierId: 'dossier-1', tenantId: 'tenant-1' },
      documentContent: { buffer, filename, mime },
    });
    const res = response();

    await handlers.imagePreview(docReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.headers).toEqual(expect.objectContaining({
      'Cache-Control': 'private, no-store',
      'Content-Type': mime,
      'Content-Length': String(buffer.length),
      'X-Content-Type-Options': 'nosniff',
    }));
    expect(res.headers['Content-Disposition']).toMatch(/^inline; filename\*=UTF-8''/);
    expect(res.payload).toBe(buffer);
  });

  test.each([
    ['Vector.svg', 'image/svg+xml', Buffer.from('<svg><script>alert(1)</script></svg>'), 'IMAGE_PREVIEW_UNSAFE_FORMAT'],
    ['Page.html', 'text/html', Buffer.from('<html><script>alert(1)</script></html>'), 'IMAGE_PREVIEW_UNSAFE_FORMAT'],
    ['Archive.bin', 'application/octet-stream', Buffer.from('RIFFxxxxWEBP'), 'IMAGE_PREVIEW_UNSUPPORTED_FORMAT'],
  ])('refuse explicitement %s', async (filename, mime, buffer, expectedError) => {
    const { handlers } = loadRoute({
      dossier: imageDossier(filename),
      documentAccess: { ok: true, dossierId: 'dossier-1', tenantId: 'tenant-1' },
      documentContent: { buffer, filename, mime },
    });
    const res = response();

    await handlers.imagePreview(docReq(), res);

    expect(res.statusCode).toBe(415);
    expect(res.payload.error).toBe(expectedError);
    expect(res.headers['Content-Type']).toBeUndefined();
  });

  test('refuse un désaccord extension, MIME et octets magiques', async () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const { handlers } = loadRoute({
      dossier: imageDossier('Photo.jpg'),
      documentAccess: { ok: true, dossierId: 'dossier-1', tenantId: 'tenant-1' },
      documentContent: { buffer, filename: 'Photo.jpg', mime: 'image/jpeg' },
    });
    const res = response();

    await handlers.imagePreview(docReq(), res);

    expect(res.statusCode).toBe(415);
    expect(res.payload.error).toBe('IMAGE_PREVIEW_INVALID_CONTENT');
  });

  test('refuse des métadonnées qui se contredisent avant de servir les octets', async () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const { handlers } = loadRoute({
      dossier: imageDossier('Photo.jpg'),
      documentAccess: { ok: true, dossierId: 'dossier-1', tenantId: 'tenant-1' },
      documentContent: { buffer, filename: 'Photo.jpg', mime: 'image/png' },
    });
    const res = response();

    await handlers.imagePreview(docReq(), res);

    expect(res.statusCode).toBe(415);
    expect(res.payload.error).toBe('IMAGE_PREVIEW_METADATA_MISMATCH');
  });

  test('un refus ownership arrête la route avant toute lecture du dossier ou du contenu', async () => {
    const { handlers, Dossier, resolveDocumentContent } = loadRoute({
      dossier: imageDossier('Photo.png'),
      documentAccess: { ok: false },
    });
    const res = response();

    await handlers.imagePreview(docReq(), res);

    expect(Dossier.findOne).not.toHaveBeenCalled();
    expect(resolveDocumentContent).not.toHaveBeenCalled();
  });
});

describe('politique documentaire du cabinet', () => {
  test('tout membre peut lire la politique sans pouvoir nécessairement la modifier', async () => {
    const tenant = {
      _id: 'tenant-1',
      ownerUserId: 'owner-1',
      documentPolicy: {
        allowPersonalClouds: false,
        allowedProviders: ['managed_gcs'],
        requireKheopsVersion: true,
      },
    };
    const { handlers } = loadRoute({ user: { _id: 'user-1' }, tenant });
    const res = response();

    await handlers.getPolicy(req(), res);

    expect(res.payload).toEqual(expect.objectContaining({
      canManage: false,
      policy: expect.objectContaining({
        allowPersonalClouds: false,
        allowedProviders: ['managed_gcs'],
        requireKheopsVersion: true,
      }),
    }));
  });

  test('un membre non administrateur reçoit 403 avant toute écriture', async () => {
    const tenant = { _id: 'tenant-1', ownerUserId: 'owner-1' };
    const { handlers, Tenant } = loadRoute({ user: { _id: 'user-1' }, tenant });
    const res = response();

    await handlers.putPolicy(req({ allowPersonalClouds: false }), res);

    expect(res.statusCode).toBe(403);
    expect(res.payload.error).toBe('DOCUMENT_POLICY_FORBIDDEN');
    expect(Tenant.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('un administrateur actif peut enregistrer les six règles sans champ parasite', async () => {
    const tenant = { _id: 'tenant-1', ownerUserId: 'owner-1' };
    const updatedTenant = {
      documentPolicy: {
        allowPersonalClouds: false,
        allowedProviders: ['managed_gcs'],
        forceMethod: 'kheops',
        allowGoogleConversion: false,
        requireKheopsVersion: true,
        deleteExternalCopyAfterSync: true,
        updatedAt: new Date(),
      },
    };
    const { handlers, Tenant, Membership } = loadRoute({
      user: { _id: 'user-1' },
      tenant,
      updatedTenant,
      adminMembership: { _id: 'membership-1' },
    });
    const res = response();

    await handlers.putPolicy(req({
      allowPersonalClouds: false,
      allowedProviders: ['managed_gcs'],
      forceMethod: 'kheops',
      allowGoogleConversion: false,
      requireKheopsVersion: true,
      deleteExternalCopyAfterSync: true,
      ownerUserId: 'attacker',
    }), res);

    expect(Membership.findOne).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      userId: 'user-1',
      role: 'admin',
      status: 'active',
    }));
    expect(res.statusCode).toBe(200);
    expect(res.payload.canManage).toBe(true);
    const update = Tenant.findByIdAndUpdate.mock.calls[0][1];
    expect(update.$set).toEqual(expect.objectContaining({
      'documentPolicy.allowPersonalClouds': false,
      'documentPolicy.allowedProviders': ['managed_gcs'],
      'documentPolicy.forceMethod': 'kheops',
      'documentPolicy.deleteExternalCopyAfterSync': true,
      'documentPolicy.updatedBy': 'user-1',
    }));
    expect(JSON.stringify(update)).not.toContain('ownerUserId');
  });

  test('la disponibilité applique une méthode imposée et bloque les clouds personnels', async () => {
    const tenant = {
      _id: 'tenant-1',
      ownerUserId: 'owner-1',
      documentPolicy: {
        allowPersonalClouds: false,
        allowedProviders: ['managed_gcs'],
        forceMethod: 'kheops',
      },
    };
    const { handlers } = loadRoute({
      user: { googleRefreshToken: 'g', microsoftRefreshToken: 'm' },
      tenant,
      googleConnected: true,
      microsoftConnected: true,
    });
    const res = response();

    await handlers.availability(req(), res);

    expect(res.payload.recommendedMode).toBe('kheops');
    expect(res.payload.methods.kheops).toEqual(expect.objectContaining({
      available: true,
      enforcedByPolicy: true,
    }));
    expect(res.payload.methods.google_docs).toEqual(expect.objectContaining({
      available: false,
      reason: 'CABINET_METHOD_ENFORCED',
    }));
    expect(res.payload.policy.restrictions).toEqual(expect.arrayContaining([
      'PERSONAL_CLOUDS_DISABLED', 'METHOD_ENFORCED',
    ]));
  });

  test.each([
    ['personal', false],
    ['organization', true],
  ])('applique la politique comptes professionnels à un compte Microsoft %s', async (accountType, expected) => {
    const tenant = {
      _id: 'tenant-1',
      ownerUserId: 'owner-1',
      documentPolicy: {
        allowPersonalClouds: false,
        requireProfessionalMicrosoftAccount: true,
        allowedProviders: ['managed_gcs', 'onedrive'],
      },
    };
    const { handlers } = loadRoute({
      user: {
        microsoftOneDriveRefreshToken: 'dedicated-token',
        microsoftOneDriveAccount: { accountType },
      },
      tenant,
      microsoftConnected: true,
    });
    const res = response();

    await handlers.availability(req(), res);

    expect(res.payload.methods.word_web.available).toBe(expected);
    expect(res.payload.methods.word_web.allowedByPolicy).toBe(expected);
  });
});

describe('préférence propre à un document', () => {
  test('GET, PUT et DELETE restent bornés au dossier autorisé', async () => {
    const dossier = {
      _id: 'dossier-1',
      dossier: { documents: [{ _id: DOCUMENT_ID, openingMode: 'word_web' }] },
    };
    const { handlers, Dossier, ensureDocOwnership } = loadRoute({ dossier, updatedDossier: dossier });

    const getRes = response();
    await handlers.getDocumentPreference(docReq(), getRes);
    expect(getRes.payload).toEqual({
      documentId: DOCUMENT_ID,
      openingMode: 'word_web',
      configured: true,
    });

    const putRes = response();
    await handlers.putDocumentPreference(docReq({ openingMode: 'google_docs' }), putRes);
    expect(putRes.payload).toEqual({
      documentId: DOCUMENT_ID,
      openingMode: 'google_docs',
      configured: true,
    });
    expect(Dossier.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'dossier-1',
        'dossier.documents._id': expect.any(Object),
      }),
      { $set: { 'dossier.documents.$.openingMode': 'google_docs' } },
      { new: true, runValidators: true },
    );

    const deleteRes = response();
    await handlers.deleteDocumentPreference(docReq(), deleteRes);
    expect(deleteRes.payload).toEqual({
      ok: true,
      documentId: DOCUMENT_ID,
      openingMode: null,
      configured: false,
    });
    expect(Dossier.findOneAndUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ _id: 'dossier-1' }),
      { $unset: { 'dossier.documents.$.openingMode': 1 } },
      { new: true },
    );
    expect(ensureDocOwnership).toHaveBeenCalledTimes(3);
  });

  test('un refus ownership arrête la route avant toute lecture du dossier', async () => {
    const { handlers, Dossier } = loadRoute({ documentAccess: { ok: false } });
    const res = response();

    await handlers.getDocumentPreference(docReq(), res);

    expect(Dossier.findOne).not.toHaveBeenCalled();
  });

  test('la disponibilité expose séparément le choix du document et le défaut global', async () => {
    const dossier = {
      _id: 'dossier-1',
      dossier: { documents: [{ _id: DOCUMENT_ID, openingMode: 'word_web' }] },
    };
    const { handlers } = loadRoute({
      user: {
        documentOpening: { mode: 'google_docs', rememberChoice: true, updatedAt: new Date() },
        microsoftRefreshToken: 'microsoft-token',
      },
      microsoftConnected: true,
      dossier,
      documentAccess: { ok: true, dossierId: 'dossier-1', tenantId: 'tenant-1' },
    });
    const res = response();

    await handlers.availability({
      ...req(),
      query: { documentId: DOCUMENT_ID, fileName: 'Conclusions.docx' },
    }, res);

    expect(res.payload.preference).toEqual(expect.objectContaining({
      mode: 'word_web',
      documentMode: 'word_web',
      userMode: 'google_docs',
    }));
    expect(res.payload.userPreference.mode).toBe('google_docs');
    expect(res.payload.documentPreference).toEqual({
      documentId: DOCUMENT_ID,
      mode: 'word_web',
      configured: true,
    });
    expect(res.payload.recommendedMode).toBe('word_web');
  });
});
