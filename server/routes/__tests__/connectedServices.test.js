function response() {
  return {
    statusCode: 200,
    status: jest.fn(function setStatus(code) { this.statusCode = code; return this; }),
    json: jest.fn(function sendJson(payload) { this.payload = payload; return this; }),
  };
}

function queryFor(leanValue, documentValue) {
  const query = {
    select: jest.fn(() => query),
    lean: jest.fn().mockResolvedValue(leanValue),
    then(resolve, reject) {
      return Promise.resolve(documentValue).then(resolve, reject);
    },
  };
  return query;
}

function loadRoute({ snapshot = {}, document = null } = {}) {
  jest.resetModules();
  const userDocument = document || {
    ...snapshot,
    save: jest.fn().mockResolvedValue(undefined),
  };
  const User = {
    findById: jest.fn(() => queryFor(snapshot, userDocument)),
  };
  const googleDrive = {
    isConnected: jest.fn().mockResolvedValue(true),
    clearTokenCache: jest.fn(),
  };
  const oneDrive = {
    isConnected: jest.fn().mockResolvedValue(true),
  };
  const axios = { post: jest.fn().mockResolvedValue({ status: 200 }) };
  const clearOneDriveTokenCache = jest.fn();
  const audit = { update: jest.fn() };

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../models/App_Users/User', () => User);
  jest.doMock('../../services/storage/googleDriveClient', () => googleDrive);
  jest.doMock('../../services/storage/oneDriveClient', () => oneDrive);
  jest.doMock('../../utils/microsoftGraphMail', () => ({ clearOneDriveTokenCache }));
  jest.doMock('../../utils/tokenCrypto', () => ({ decryptIfNeeded: jest.fn((token) => `plain:${token}`) }));
  jest.doMock('../../utils/auditLogger', () => audit);
  jest.doMock('axios', () => axios);

  const router = require('../connectedServices');
  const handler = (path, method) => {
    const layer = router.stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
    return layer.route.stack[layer.route.stack.length - 1].handle;
  };
  return {
    handlers: {
      status: handler('/', 'get'),
      disconnectGoogle: handler('/google', 'delete'),
      disconnectMicrosoft: handler('/microsoft', 'delete'),
    },
    userDocument,
    googleDrive,
    oneDrive,
    axios,
    clearOneDriveTokenCache,
    audit,
  };
}

function request(method = 'GET') {
  return {
    user: 'user-1',
    method,
    originalUrl: '/api/connected-services',
  };
}

describe('connectedServices — indépendance des consentements documentaires', () => {
  test('un marqueur de déconnexion Drive neutralise le jeton Google historique sans couper Microsoft', async () => {
    const snapshot = {
      email: 'avocat@example.test',
      googleRefreshToken: 'google-login-secret',
      googleDriveRefreshToken: null,
      googleDriveAccount: { disconnectedAt: new Date('2026-07-10T00:00:00Z') },
      microsoftRefreshToken: 'microsoft-login-secret',
      microsoftOneDriveRefreshToken: null,
      microsoftOneDriveAccount: { disconnectedAt: null },
      sharePoint: { enabled: false },
    };
    const { handlers, googleDrive, oneDrive } = loadRoute({ snapshot });
    const res = response();

    await handlers.status(request(), res);

    expect(res.payload.google).toEqual(expect.objectContaining({ configured: false, connected: false }));
    expect(res.payload.microsoft).toEqual(expect.objectContaining({ configured: true, connected: true }));
    expect(googleDrive.isConnected).not.toHaveBeenCalled();
    expect(oneDrive.isConnected).toHaveBeenCalledWith('user-1');
    expect(JSON.stringify(res.payload)).not.toContain('google-login-secret');
    expect(JSON.stringify(res.payload)).not.toContain('microsoft-login-secret');
  });

  test('déconnecter Google Drive conserve login/Gmail et Microsoft, mais purge son jeton et son cache dédiés', async () => {
    const userDocument = {
      googleDriveRefreshToken: 'google-drive-secret',
      googleRefreshToken: 'google-login-secret',
      microsoftOneDriveRefreshToken: 'onedrive-secret',
      microsoftRefreshToken: 'microsoft-login-secret',
      googleDriveAccount: { email: 'g@example.test', disconnectedAt: null },
      microsoftOneDriveAccount: { email: 'm@example.test', disconnectedAt: null },
      documentOpening: { externalTransferConsents: { googleDrive: true, oneDrive: true } },
      save: jest.fn().mockResolvedValue(undefined),
    };
    const {
      handlers, googleDrive, clearOneDriveTokenCache, axios,
    } = loadRoute({ snapshot: userDocument, document: userDocument });
    const res = response();

    await handlers.disconnectGoogle(request('DELETE'), res);

    expect(res.payload).toEqual({ ok: true, provider: 'google' });
    expect(userDocument.googleDriveRefreshToken).toBeNull();
    expect(userDocument.googleRefreshToken).toBe('google-login-secret');
    expect(userDocument.microsoftOneDriveRefreshToken).toBe('onedrive-secret');
    expect(userDocument.microsoftRefreshToken).toBe('microsoft-login-secret');
    expect(userDocument.googleDriveAccount.disconnectedAt).toBeInstanceOf(Date);
    expect(userDocument.documentOpening.externalTransferConsents.googleDrive).toBe(false);
    expect(userDocument.documentOpening.externalTransferConsents.oneDrive).toBe(true);
    expect(axios.post).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/revoke',
      null,
      expect.objectContaining({ params: { token: 'plain:google-drive-secret' } }),
    );
    expect(googleDrive.clearTokenCache).toHaveBeenCalledWith('user-1');
    expect(clearOneDriveTokenCache).not.toHaveBeenCalled();
  });

  test('déconnecter OneDrive conserve Outlook/login et Google Drive, mais purge uniquement son cache Graph fichiers', async () => {
    const userDocument = {
      googleDriveRefreshToken: 'google-drive-secret',
      googleRefreshToken: 'google-login-secret',
      microsoftOneDriveRefreshToken: 'onedrive-secret',
      microsoftRefreshToken: 'microsoft-login-secret',
      googleDriveAccount: { email: 'g@example.test', disconnectedAt: null },
      microsoftOneDriveAccount: { email: 'm@example.test', disconnectedAt: null },
      documentOpening: { externalTransferConsents: { googleDrive: true, oneDrive: true } },
      save: jest.fn().mockResolvedValue(undefined),
    };
    const {
      handlers, googleDrive, clearOneDriveTokenCache, axios,
    } = loadRoute({ snapshot: userDocument, document: userDocument });
    const res = response();

    await handlers.disconnectMicrosoft(request('DELETE'), res);

    expect(res.payload).toEqual({ ok: true, provider: 'microsoft' });
    expect(userDocument.microsoftOneDriveRefreshToken).toBeNull();
    expect(userDocument.microsoftRefreshToken).toBe('microsoft-login-secret');
    expect(userDocument.googleDriveRefreshToken).toBe('google-drive-secret');
    expect(userDocument.googleRefreshToken).toBe('google-login-secret');
    expect(userDocument.microsoftOneDriveAccount.disconnectedAt).toBeInstanceOf(Date);
    expect(userDocument.documentOpening.externalTransferConsents.oneDrive).toBe(false);
    expect(userDocument.documentOpening.externalTransferConsents.googleDrive).toBe(true);
    expect(clearOneDriveTokenCache).toHaveBeenCalledTimes(2);
    expect(clearOneDriveTokenCache).toHaveBeenNthCalledWith(1, 'user-1');
    expect(clearOneDriveTokenCache).toHaveBeenNthCalledWith(2, 'user-1');
    expect(googleDrive.clearTokenCache).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });
});
