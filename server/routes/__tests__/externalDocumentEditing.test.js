const DOC_ID = '64b64b64b64b64b64b64b64b';
const SESSION_ID = '64c64c64c64c64c64c64c64c';

function queryResult(value) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    status: jest.fn(function setStatus(code) { this.statusCode = code; return this; }),
    json: jest.fn(function sendJson(payload) { this.payload = payload; return this; }),
    setHeader: jest.fn(function setHeader(name, value) { this.headers[name] = value; }),
    send: jest.fn(function send(payload) { this.body = payload; return this; }),
  };
}

function makeSession(overrides = {}) {
  return {
    _id: SESSION_ID,
    documentId: DOC_ID,
    dossierId: 'dossier-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    provider: 'onedrive',
    editor: 'word_web',
    remoteId: 'remote-1',
    remoteName: 'contrat.docx',
    openUrl: 'https://onedrive.example/edit',
    remoteMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    remoteModifiedAt: null,
    sourceFormat: 'docx',
    sourceFilename: 'contrat.docx',
    sourceMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    returnFormat: 'docx',
    baseVersionId: 'version-1',
    lastSyncedVersionId: null,
    lastSyncedAt: null,
    keepRemoteCopy: true,
    convertedToNative: false,
    state: 'open',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function loadRoute({
  policy = { allowPersonalClouds: true },
  account = { microsoftOneDriveAccount: { accountType: 'organization' } },
  content = { buffer: Buffer.from('PK\x03\x04docx'), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', source: 'canonical' },
  documentName = 'contrat.docx',
  validDocx = true,
  ownership,
  session = makeSession(),
  createSession,
  saveVersionResult,
  googleUpload,
  googleMetadata,
  googleDownload,
} = {}) {
  jest.resetModules();

  const ensureDocOwnership = jest.fn(ownership || (async () => ({
    ok: true,
    tenantId: 'tenant-1',
    dossierId: 'dossier-1',
  })));
  const Dossier = {
    exists: jest.fn().mockResolvedValue(true),
    findById: jest.fn().mockResolvedValue({
      _id: 'dossier-1',
      dossier: { documents: [{ _id: DOC_ID, nomDocument: documentName }] },
    }),
  };
  const Tenant = { findById: jest.fn(() => queryResult({ _id: 'tenant-1', documentPolicy: policy })) };
  const User = { findById: jest.fn(() => queryResult(account)) };

  const oneDrive = {
    getDriveId: jest.fn().mockResolvedValue('pinned-drive'),
    ensureFolderPath: jest.fn().mockResolvedValue('folder-id'),
    uploadFile: jest.fn().mockResolvedValue({
      itemId: 'remote-1',
      name: 'contrat.docx',
      webUrl: 'https://onedrive.example/edit',
    }),
    deleteItem: jest.fn().mockResolvedValue(undefined),
    getItemMetadata: jest.fn().mockResolvedValue({ name: 'contrat.docx', size: content.buffer.length,etag:'revision-1' }),
    downloadFile: jest.fn().mockResolvedValue(content.buffer),
  };
  const googleDrive = {
    trashItem: jest.fn().mockResolvedValue({ok:true}),
    uploadFile: jest.fn().mockResolvedValue(googleUpload || {
      fileId: 'google-file-1',
      name: documentName,
      mimeType: 'application/vnd.google-apps.document',
      webViewLink: 'https://docs.google.com/document/d/google-file-1/edit',
      modifiedTime: '2026-01-02T00:00:00.000Z',
    }),
    deleteItem: jest.fn().mockResolvedValue(undefined),
    getItemMetadata: jest.fn().mockResolvedValue(googleMetadata || {
      id: 'google-file-1',
      name: documentName.replace(/\.txt$/i, ''),
      mimeType: 'application/vnd.google-apps.document',
      modifiedTime: '2026-01-02T00:00:00.000Z',
      trashed: false,
    }),
    downloadEditableFile: jest.fn().mockResolvedValue(googleDownload || {
      buffer: Buffer.from('Texte modifié', 'utf8'),
      name: documentName,
      sourceMime: 'application/vnd.google-apps.document',
      downloadedMime: 'text/plain',
      modifiedTime: '2026-01-02T00:00:00.000Z',
    }),
  };
  const ExternalEditSession = {
    findOneAndUpdate: jest.fn(async(_query,update)=>Object.assign(session,update.$set)),
    updateOne: jest.fn().mockResolvedValue({matchedCount:1}),
    create: jest.fn(createSession || (async (data) => makeSession(data))),
    findOne: jest.fn().mockResolvedValue(session),
    find: jest.fn(),
  };
  const saveVersion = jest.fn().mockResolvedValue(saveVersionResult || {
    version: { versionId: 'version-1' },
    history: { currentVersionId: 'version-1' },
    conflict: false,
  });
  const resolveDocumentContent = jest.fn().mockResolvedValue(content);
  const saveCanonicalDocument = jest.fn().mockResolvedValue(undefined);
  const audit = { create: jest.fn(), update: jest.fn(), failure: jest.fn() };

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../utils/ownershipHelpers', () => ({ ensureDocOwnership }));
  jest.doMock('../../services/sync/documentSyncAccess', () => ({assertDossierAccess:jest.fn().mockResolvedValue(true)}));
  jest.doMock('../../models/Folder/Dossier', () => Dossier);
  jest.doMock('../../models/Cabinet/Tenant', () => Tenant);
  jest.doMock('../../models/App_Users/User', () => User);
  jest.doMock('../../models/Storage/DocumentHistory', () => ({}));
  jest.doMock('../../models/Storage/ExternalEditSession', () => ExternalEditSession);
  jest.doMock('../../services/storage/oneDriveClient', () => oneDrive);
  jest.doMock('../../services/storage/googleDriveClient', () => googleDrive);
  jest.doMock('../../services/documentContentService', () => ({
    resolveDocumentContent,
    saveCanonicalDocument,
    DOCX_MIME: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }));
  jest.doMock('../../services/documentHistoryService', () => ({
    saveVersion,
    toClient: jest.fn((history) => history),
  }));
  jest.doMock('../../services/documentCompatibilityService', () => ({
    analyzeDocx: jest.fn(() => ({ compatible: true })),
    isDocxBuffer: jest.fn(() => validDocx),
  }));
  jest.doMock('../../utils/auditLogger', () => audit);

  const router = require('../externalDocumentEditing');
  const handler = (path, method) => {
    const layer = router.stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
    return layer.route.stack[layer.route.stack.length - 1].handle;
  };

  return {
    handlers: {
      open: handler('/:docId/open', 'post'),
      status: handler('/sessions/:sessionId/status', 'get'),
      sync: handler('/sessions/:sessionId/sync', 'post'),
      close: handler('/sessions/:sessionId', 'delete'),
      automatic: handler('/sessions/:sessionId/automatic','patch'),
    },
    ensureDocOwnership,
    oneDrive,
    googleDrive,
    ExternalEditSession,
    saveVersion,
    saveCanonicalDocument,
    resolveDocumentContent,
    audit,
  };
}

function openRequest(body = {}) {
  return {
    user: 'user-1',
    params: { docId: DOC_ID },
    body: { method: 'word_web', consentExternalTransfer: true, ...body },
    method: 'POST',
    originalUrl: `/api/external-edit/${DOC_ID}/open`,
  };
}

function sessionRequest(sessionId = SESSION_ID) {
  return {
    user: 'user-1',
    params: { sessionId },
    body: {},
    method: 'GET',
    originalUrl: `/api/external-edit/sessions/${sessionId}/status`,
  };
}

describe('externalDocumentEditing — politique et isolation', () => {
  test('la copie externe utilise le nom visible plutôt qu’un ancien nom technique',async()=>{
    const {handlers,googleDrive}=loadRoute({content:{buffer:Buffer.from('PK\x03\x04docx'),mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',source:'history',filename:DOC_ID+'.docx'}});
    const res=response();await handlers.open(openRequest({method:'google_docs'}),res);
    expect(res.statusCode).toBe(201);
    expect(googleDrive.uploadFile).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({name:'contrat.docx'}));
  });
  test('l’absence de politique historique applique les mêmes valeurs par défaut que l’écran',async()=>{
    const {handlers,googleDrive}=loadRoute({policy:null,account:{googleDriveAccount:{accountType:'personal'}}});
    const res=response();await handlers.open(openRequest({method:'google_docs'}),res);
    expect(res.statusCode).toBe(201);expect(googleDrive.uploadFile).toHaveBeenCalledTimes(1);
  });
  test('une politique interdisant les clouds personnels bloque le transfert avant tout upload', async () => {
    const { handlers, oneDrive, saveVersion } = loadRoute({
      policy: { allowPersonalClouds: false, allowedProviders: ['onedrive'] },
      account: { microsoftOneDriveAccount: { accountType: 'personal' } },
    });
    const res = response();

    await handlers.open(openRequest(), res);

    expect(res.statusCode).toBe(403);
    expect(res.payload.error).toBe('METHOD_FORBIDDEN_BY_POLICY');
    expect(saveVersion).not.toHaveBeenCalled();
    expect(oneDrive.ensureFolderPath).not.toHaveBeenCalled();
    expect(oneDrive.uploadFile).not.toHaveBeenCalled();
  });

  test('une session dont le tenant ne correspond plus au dossier autorisé est refusée', async () => {
    const { handlers, oneDrive } = loadRoute({
      ownership: async () => ({ ok: true, tenantId: 'tenant-partage', dossierId: 'dossier-1' }),
      session: makeSession({ tenantId: 'tenant-origine' }),
    });
    const res = response();

    await handlers.status(sessionRequest(), res);

    expect(res.statusCode).toBe(403);
    expect(res.payload.error).toBe('SESSION_SCOPE_MISMATCH');
    expect(oneDrive.getItemMetadata).not.toHaveBeenCalled();
  });

  test('le retrait de l’accès au document invalide aussi une ancienne session externe', async () => {
    const ownership = async (req, res) => {
      res.status(403).json({ error: 'DOCUMENT_ACCESS_DENIED' });
      return { ok: false };
    };
    const { handlers, oneDrive } = loadRoute({ ownership });
    const res = response();

    await handlers.status(sessionRequest(), res);

    expect(res.statusCode).toBe(403);
    expect(res.payload.error).toBe('DOCUMENT_ACCESS_DENIED');
    expect(oneDrive.getItemMetadata).not.toHaveBeenCalled();
  });
});

describe('externalDocumentEditing — fermeture et reprise',()=>{
  test('une copie restaurée peut être reprise sans réactiver implicitement le retour automatique',async()=>{
    const session=makeSession({state:'remote_missing',autoSyncEnabled:false});
    const {handlers}=loadRoute({session});const res=response();
    await handlers.status({user:'user-1',params:{sessionId:SESSION_ID},query:{}},res);
    expect(res.statusCode).toBe(200);expect(res.payload.session.state).toBe('open');
    expect(res.payload.session.autoSyncEnabled).toBe(false);
  });
  test('une fermeture avec retrait sauvegarde d’abord et utilise le drive et la révision observés',async()=>{
    const {handlers,saveVersion,oneDrive}=loadRoute({session:makeSession({remoteDriveId:'pinned-drive'})});
    const res=response();await handlers.close({...sessionRequest(),query:{deleteRemote:'true'}},res);
    expect(res.statusCode).toBe(200);expect(res.payload.session.state).toBe('closed');
    expect(saveVersion.mock.invocationCallOrder[0]).toBeLessThan(oneDrive.deleteItem.mock.invocationCallOrder[0]);
    expect(oneDrive.deleteItem).toHaveBeenCalledWith('user-1','remote-1','pinned-drive','revision-1');
  });
  test('la fermeture conserve la copie si la sauvegarde produit un conflit',async()=>{
    const {handlers,oneDrive}=loadRoute({saveVersionResult:{version:{versionId:'conflict'},history:{currentVersionId:'other'},conflict:true}});
    const res=response();await handlers.close({...sessionRequest(),query:{deleteRemote:'true'}},res);
    expect(res.statusCode).toBe(409);expect(res.payload.error).toBe('DOCUMENT_VERSION_CONFLICT');
    expect(oneDrive.deleteItem).not.toHaveBeenCalled();
  });
  test('le rafraîchissement périodique de l’écran lit la session sans multiplier les appels cloud',async()=>{
    const {handlers,oneDrive}=loadRoute();const res=response();
    await handlers.status({...sessionRequest(),query:{localOnly:'true'}},res);
    expect(res.payload.localOnly).toBe(true);expect(oneDrive.getItemMetadata).not.toHaveBeenCalled();
  });
});

describe('externalDocumentEditing — création et compensation OneDrive', () => {
  test('crée le dossier Kheops dédié avant de déposer la copie Word pour le web', async () => {
    const { handlers, oneDrive, ExternalEditSession } = loadRoute();
    const res = response();

    await handlers.open(openRequest(), res);

    expect(res.statusCode).toBe(201);
    expect(oneDrive.ensureFolderPath).toHaveBeenCalledWith(
      'user-1',
      ['Kheops2', 'Modifications Kheops', DOC_ID],
      'pinned-drive',
    );
    expect(oneDrive.ensureFolderPath.mock.invocationCallOrder[0])
      .toBeLessThan(oneDrive.uploadFile.mock.invocationCallOrder[0]);
    expect(oneDrive.uploadFile).toHaveBeenCalledWith('user-1', expect.objectContaining({
      path: expect.stringMatching(new RegExp(`^Kheops2/Modifications Kheops/${DOC_ID}/\\d+-contrat\\.docx$`)),
      buffer: expect.any(Buffer),
    }));
    expect(ExternalEditSession.create).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1',
      dossierId: 'dossier-1',
      documentId: DOC_ID,
      provider: 'onedrive',
    }));
  });

  test('supprime la copie cloud si Mongo échoue après l’upload', async () => {
    const { handlers, oneDrive } = loadRoute({
      createSession: async () => { throw new Error('mongo indisponible'); },
    });
    const res = response();

    await handlers.open(openRequest(), res);

    expect(res.statusCode).toBe(500);
    expect(oneDrive.uploadFile).toHaveBeenCalledTimes(1);
    expect(oneDrive.deleteItem).toHaveBeenCalledWith('user-1', 'remote-1', 'pinned-drive');
  });
});

describe('externalDocumentEditing — garde-fous DOCX', () => {
  test('refuse un faux DOCX sans créer de version ni de copie externe', async () => {
    const { handlers, saveVersion, oneDrive } = loadRoute({ validDocx: false });
    const res = response();

    await handlers.open(openRequest(), res);

    expect(res.statusCode).toBe(415);
    expect(res.payload.error).toBe('INVALID_DOCX');
    expect(saveVersion).not.toHaveBeenCalled();
    expect(oneDrive.uploadFile).not.toHaveBeenCalled();
  });

  test('refuse avant téléchargement une copie distante supérieure à 25 Mo', async () => {
    const { handlers, oneDrive, saveVersion } = loadRoute();
    oneDrive.getItemMetadata.mockResolvedValue({
      name: 'contrat.docx',
      size: 25 * 1024 * 1024 + 1,
    });
    const res = response();
    const req = sessionRequest();
    req.method = 'POST';
    req.originalUrl = `/api/external-edit/sessions/${SESSION_ID}/sync`;

    await handlers.sync(req, res);

    expect(res.statusCode).toBe(413);
    expect(res.payload.error).toBe('DOCUMENT_TOO_LARGE');
    expect(oneDrive.downloadFile).not.toHaveBeenCalled();
    expect(saveVersion).not.toHaveBeenCalled();
  });
});

describe('externalDocumentEditing — fichiers texte et éditeurs en ligne', () => {
  test('Word pour le web annonce clairement qu’un TXT brut n’est pas éditable et ne transfère rien', async () => {
    const content = {
      buffer: Buffer.from('Bonjour', 'utf8'),
      filename: 'notes.txt',
      mime: 'text/plain',
      source: 'stored-document',
    };
    const {
      handlers, oneDrive, saveVersion, resolveDocumentContent,
    } = loadRoute({ documentName: 'notes.txt', content });
    const res = response();

    await handlers.open(openRequest(), res);

    expect(res.statusCode).toBe(415);
    expect(res.payload.error).toBe('WORD_WEB_TXT_UNSUPPORTED');
    expect(resolveDocumentContent).not.toHaveBeenCalled();
    expect(saveVersion).not.toHaveBeenCalled();
    expect(oneDrive.uploadFile).not.toHaveBeenCalled();
  });

  test('Google Docs importe un TXT UTF-8 en document natif et mémorise le format de retour', async () => {
    const original = Buffer.from('\uFEFFBonjour depuis Kheops', 'utf8');
    const content = {
      buffer: original,
      filename: 'notes.txt',
      mime: 'text/plain',
      source: 'stored-document',
    };
    const {
      handlers, googleDrive, ExternalEditSession, saveVersion,
    } = loadRoute({
      documentName: 'notes.txt',
      content,
      policy: {
        allowPersonalClouds: true,
        allowedProviders: ['google_drive'],
        allowGoogleConversion: true,
      },
      account: { googleDriveAccount: { accountType: 'organization' } },
    });
    const res = response();

    await handlers.open(openRequest({ method: 'google_docs' }), res);

    expect(res.statusCode).toBe(201);
    expect(googleDrive.uploadFile).toHaveBeenCalledWith('user-1', expect.objectContaining({
      name: 'notes.txt',
      mime: 'text/plain; charset=utf-8',
      convertToGoogle: true,
    }));
    const uploaded = googleDrive.uploadFile.mock.calls[0][1].buffer;
    expect(uploaded.equals(Buffer.from('Bonjour depuis Kheops', 'utf8'))).toBe(true);
    expect(saveVersion).toHaveBeenCalledWith(expect.objectContaining({
      buffer: original,
      filename: 'notes.txt',
      mime: 'text/plain',
    }));
    expect(ExternalEditSession.create).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'google_drive',
      editor: 'google_docs',
      sourceFormat: 'txt',
      sourceFilename: 'notes.txt',
      sourceMime: 'text/plain; charset=utf-8',
      returnFormat: 'txt',
      convertedToNative: true,
    }));
    expect(res.payload.session.formatWarning).toMatch(/texte brut/i);
  });

  test('la politique de conversion Google bloque le TXT avant version et upload', async () => {
    const content = {
      buffer: Buffer.from('Bonjour', 'utf8'),
      filename: 'notes.txt',
      mime: 'text/plain',
      source: 'stored-document',
    };
    const { handlers, googleDrive, saveVersion } = loadRoute({
      documentName: 'notes.txt',
      content,
      policy: {
        allowPersonalClouds: true,
        allowedProviders: ['google_drive'],
        allowGoogleConversion: false,
      },
      account: { googleDriveAccount: { accountType: 'organization' } },
    });
    const res = response();

    await handlers.open(openRequest({ method: 'google_docs' }), res);

    expect(res.statusCode).toBe(403);
    expect(res.payload.error).toBe('GOOGLE_TEXT_CONVERSION_FORBIDDEN');
    expect(saveVersion).not.toHaveBeenCalled();
    expect(googleDrive.uploadFile).not.toHaveBeenCalled();
  });

  test('un faux TXT binaire est refusé avant toute écriture', async () => {
    const content = {
      buffer: Buffer.from([0x42, 0x00, 0x49, 0x4e]),
      filename: 'notes.txt',
      mime: 'text/plain',
      source: 'stored-document',
    };
    const { handlers, googleDrive, saveVersion } = loadRoute({
      documentName: 'notes.txt',
      content,
      policy: {
        allowPersonalClouds: true,
        allowedProviders: ['google_drive'],
        allowGoogleConversion: true,
      },
      account: { googleDriveAccount: { accountType: 'organization' } },
    });
    const res = response();

    await handlers.open(openRequest({ method: 'google_docs' }), res);

    expect(res.statusCode).toBe(415);
    expect(res.payload.error).toBe('INVALID_TEXT_CONTENT');
    expect(saveVersion).not.toHaveBeenCalled();
    expect(googleDrive.uploadFile).not.toHaveBeenCalled();
  });

  test('la synchronisation Google exporte en TXT, crée une version texte et ne pollue pas le cache DOCX', async () => {
    const session = makeSession({
      provider: 'google_drive',
      editor: 'google_docs',
      remoteId: 'google-file-1',
      remoteName: 'notes',
      remoteMime: 'application/vnd.google-apps.document',
      sourceFormat: 'txt',
      sourceFilename: 'notes.txt',
      sourceMime: 'text/plain; charset=utf-8',
      returnFormat: 'txt',
      convertedToNative: true,
    });
    const {
      handlers, googleDrive, saveVersion, saveCanonicalDocument,
    } = loadRoute({ documentName: 'notes.txt', session });
    const res = response();
    const req = sessionRequest();
    req.method = 'POST';
    req.originalUrl = `/api/external-edit/sessions/${SESSION_ID}/sync`;

    await handlers.sync(req, res);

    expect(res.statusCode).toBe(200);
    expect(googleDrive.downloadEditableFile).toHaveBeenCalledWith('user-1', 'google-file-1', {
      exportMime: 'text/plain',
      exportExtension: '.txt',
    });
    expect(saveVersion).toHaveBeenCalledWith(expect.objectContaining({
      buffer: Buffer.from('Texte modifié', 'utf8'),
      filename: 'notes.txt',
      mime: 'text/plain; charset=utf-8',
      editor: 'google_docs',
      origin: 'google_drive',
      baseVersionId: 'version-1',
    }));
    expect(saveCanonicalDocument).not.toHaveBeenCalled();
    expect(session.state).toBe('synced');
    expect(res.payload.canonicalSynced).toBe(true);
    expect(res.payload.canonicalCopySynced).toBe(false);
  });

  test('une ancienne session TXT incohérente ne peut pas être synchronisée depuis OneDrive', async () => {
    const session = makeSession({
      sourceFormat: 'txt',
      sourceFilename: 'notes.txt',
      sourceMime: 'text/plain',
      returnFormat: 'txt',
    });
    const { handlers, oneDrive, saveVersion } = loadRoute({ session });
    const res = response();
    const req = sessionRequest();
    req.method = 'POST';

    await handlers.sync(req, res);

    expect(res.statusCode).toBe(415);
    expect(res.payload.error).toBe('TXT_SYNC_PROVIDER_UNSUPPORTED');
    expect(oneDrive.downloadFile).not.toHaveBeenCalled();
    expect(saveVersion).not.toHaveBeenCalled();
  });

  test('un conflit de version TXT conserve la version Google sans écraser la version courante', async () => {
    const session = makeSession({
      provider: 'google_drive',
      editor: 'google_docs',
      remoteId: 'google-file-1',
      remoteName: 'notes',
      sourceFormat: 'txt',
      sourceFilename: 'notes.txt',
      sourceMime: 'text/plain; charset=utf-8',
      returnFormat: 'txt',
      convertedToNative: true,
    });
    const { handlers, saveCanonicalDocument } = loadRoute({
      session,
      saveVersionResult: {
        version: { versionId: 'conflict-version-2' },
        history: { currentVersionId: 'concurrent-version-9' },
        conflict: true,
      },
    });
    const res = response();
    const req = sessionRequest();
    req.method = 'POST';

    await handlers.sync(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.payload.error).toBe('DOCUMENT_VERSION_CONFLICT');
    expect(session.state).toBe('conflict');
    expect(session.lastSyncedVersionId).toBe('conflict-version-2');
    expect(session.baseVersionId).toBe('version-1');
    expect(saveCanonicalDocument).not.toHaveBeenCalled();
  });
});
