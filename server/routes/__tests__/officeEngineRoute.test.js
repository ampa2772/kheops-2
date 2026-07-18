const jwt = require('jsonwebtoken');

const TENANT_ID = '64a64a64a64a64a64a64a64a';
const DOSSIER_ID = '64b64b64b64b64b64b64b64b';
const DOCUMENT_ID = '64c64c64c64c64c64c64c64c';
const USER_ID = '64d64d64d64d64d64d64d64d';

function queryResult(value) {
  return {
    select: jest.fn(() => queryResult(value)),
    lean: jest.fn(async () => value),
  };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    status: jest.fn(function setStatus(code) { this.statusCode = code; return this; }),
    json: jest.fn(function sendJson(payload) { this.payload = payload; return this; }),
    set: jest.fn(function setHeader(name, value) {
      if (typeof name === 'object') Object.assign(this.headers, name);
      else this.headers[name] = value;
      return this;
    }),
    send: jest.fn(function send(payload) { this.body = payload; return this; }),
    end: jest.fn(function end() { return this; }),
  };
}

function loadRoute({ lock } = {}) {
  jest.resetModules();
  const stored = {
    _id: DOCUMENT_ID,
    tenantId: TENANT_ID,
    dossierId: DOSSIER_ID,
    documentId: DOCUMENT_ID,
    currentVersionId: 'v2',
    versions: [{ versionId: 'v2', filename: 'Conclusions.docx' }],
  };
  const history = {
    tenantId: TENANT_ID,
    dossierId: DOSSIER_ID,
    documentId: DOCUMENT_ID,
    currentVersionId: 'v2',
  };
  const DocumentHistory = { findOne: jest.fn(() => queryResult(history)) };
  const OfficeDocumentLock = {
    findOne: jest.fn(async () => lock || null),
    create: jest.fn(),
    deleteOne: jest.fn(),
  };

  jest.doMock('../../middlewares/middleware-auth', () => (req, _res, next) => next());
  jest.doMock('../../middlewares/requireTenant', () => (req, _res, next) => next());
  jest.doMock('../../models/Folder/Dossier', () => ({ findOne: jest.fn() }));
  jest.doMock('../../models/Folder/modelsLiaisons/UserDossier', () => ({
    find: jest.fn(() => queryResult([{ dossier: DOSSIER_ID }])),
  }));
  jest.doMock('../../models/App_Users/User', () => ({
    findById: jest.fn(() => queryResult({ firstName: 'Adrien', lastName: 'Test' })),
  }));
  jest.doMock('../../models/Storage/DocumentHistory', () => DocumentHistory);
  jest.doMock('../../models/Storage/OfficeDocumentLock', () => OfficeDocumentLock);
  jest.doMock('../../models/Storage/StoredDocument', () => ({
    findOne: jest.fn(() => queryResult(stored)),
  }));
  jest.doMock('../../services/cabinetAccess', () => ({ getAccessibleUserIds: jest.fn(async () => [USER_ID]) }));
  jest.doMock('../../services/documentContentService', () => ({
    resolveDocumentContent: jest.fn(async () => ({
      buffer: Buffer.from('docx'),
      filename: 'Conclusions.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      versionId: 'v2',
    })),
    saveCanonicalDocument: jest.fn(),
  }));
  jest.doMock('../../services/documentHistoryService', () => ({ saveVersion: jest.fn() }));
  jest.doMock('../../config/featureFlags', () => ({ enabled: jest.fn(() => true) }));
  jest.doMock('../../services/officeEngineService', () => ({
    isConfigured: jest.fn(() => true),
    resolveEditAction: jest.fn(async () => ({
      ext: 'docx',
      actionUrl: 'https://office.example/browser/hash/cool.html?',
    })),
    fetchDiscovery: jest.fn(async () => [{ ext: 'docx' }]),
    operationKey: jest.fn(() => 'operation'),
  }));

  const router = require('../officeEngine');
  const route = (path, method) => router.stack.find((entry) => entry.route?.path === path && entry.route.methods[method]).route;
  return { router, route, DocumentHistory, OfficeDocumentLock };
}

async function runRoute(route, req, res) {
  for (const layer of route.stack) {
    let nextCalled = false;
    await layer.handle(req, res, () => { nextCalled = true; });
    if (!nextCalled && layer !== route.stack[route.stack.length - 1]) break;
  }
}

describe('officeEngine — session WOPI et verrou persistant', () => {
  const previousEnv = { ...process.env };

  beforeEach(() => {
    process.env.JWT_SECRET = 'office-engine-test-secret';
    process.env.FRONTEND_URL = 'https://app.example';
    process.env.WOPI_PUBLIC_BASE_URL = 'https://app.example';
  });

  afterEach(() => {
    process.env = { ...previousEnv };
    jest.resetModules();
  });

  test('crée une session DOCX signée et un WOPISrc public sans exposer le stockage', async () => {
    const { route } = loadRoute();
    const res = response();
    await runRoute(route('/session/:documentId', 'get'), {
      user: USER_ID,
      tenantId: TENANT_ID,
      params: { documentId: DOCUMENT_ID },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual(expect.objectContaining({
      available: true,
      engine: 'collabora-online',
      filename: 'Conclusions.docx',
      defaultTheme: 'mixed',
    }));
    expect(res.payload.actionUrl).toContain(encodeURIComponent(`https://app.example/api/office-engine/wopi/files/${DOCUMENT_ID}`));
    const claims = jwt.verify(res.payload.accessToken, process.env.JWT_SECRET, {
      audience: 'kheops-office-engine',
      issuer: 'kheops-2',
    });
    expect(claims).toEqual(expect.objectContaining({
      sub: USER_ID,
      tenantId: TENANT_ID,
      dossierId: DOSSIER_ID,
      documentId: DOCUMENT_ID,
    }));
  });

  test('rebascule un verrou expiré sur la version actuellement autoritaire', async () => {
    const expiredLock = {
      lockId: 'ancien-verrou',
      currentVersionId: 'v1',
      expiresAt: new Date(Date.now() - 1000),
      save: jest.fn(async () => undefined),
    };
    const { route, DocumentHistory } = loadRoute({ lock: expiredLock });
    const token = jwt.sign({
      sub: USER_ID,
      tenantId: TENANT_ID,
      dossierId: DOSSIER_ID,
      documentId: DOCUMENT_ID,
      scope: 'office:edit',
    }, process.env.JWT_SECRET, {
      expiresIn: 600,
      audience: 'kheops-office-engine',
      issuer: 'kheops-2',
      jwtid: 'session-test',
    });
    const res = response();
    await runRoute(route('/wopi/files/:documentId', 'post'), {
      params: { documentId: DOCUMENT_ID },
      query: { access_token: token },
      body: {},
      get: (name) => ({
        'X-WOPI-Override': 'LOCK',
        'X-WOPI-Lock': 'nouveau-verrou',
      }[name] || ''),
    }, res);

    expect(res.statusCode).toBe(200);
    expect(expiredLock.lockId).toBe('nouveau-verrou');
    expect(expiredLock.currentVersionId).toBe('v2');
    expect(expiredLock.save).toHaveBeenCalled();
    expect(DocumentHistory.findOne).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      dossierId: DOSSIER_ID,
      documentId: DOCUMENT_ID,
    });
  });
});
