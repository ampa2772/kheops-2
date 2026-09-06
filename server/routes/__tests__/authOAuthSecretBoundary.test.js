jest.mock('../../models/App_Users/User', () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
}));

jest.mock('../../utils/securityLogger', () => ({
  log: jest.fn(),
  EVT: { AUTH_REFRESH_TOKEN_GET: 'AUTH_REFRESH_TOKEN_GET', AUTH_LOGOUT: 'AUTH_LOGOUT' },
}));

const User = require('../../models/App_Users/User');
const router = require('../auth');

function routeHandler(path) {
  const layer = router.stack.find((entry) => entry.route?.path === path);
  if (!layer) throw new Error(`Route absente: ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('frontière serveur des secrets OAuth', () => {
  beforeEach(() => jest.clearAllMocks());

  test('la déconnexion exige une authentification et journalise uniquement la fermeture locale', async () => {
    const layer = router.stack.find((entry) => entry.route?.path === '/logout');
    expect(layer.route.stack).toHaveLength(2);
    const req = { user: 'user-1' };
    const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), end: jest.fn() };
    await routeHandler('/logout')(req, res);
    expect(require('../../utils/securityLogger').log).toHaveBeenCalledWith('AUTH_LOGOUT', {
      userId: 'user-1', source: 'kheops', reason: 'client-session-closed',
    }, req);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });

  test.each([
    ['/google/get-refresh-token', 'googleRefreshToken', 'google'],
    ['/microsoft/get-refresh-token', 'microsoftRefreshToken', 'microsoft'],
  ])('%s ne renvoie jamais le refresh token déchiffrable', async (path, field, provider) => {
    const secret = `${provider}-refresh-token-ultra-secret`;
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'user-1',
        email: 'avocat@example.test',
        [field]: secret,
      }),
    });
    const res = responseRecorder();

    await routeHandler(path)({ user: 'user-1' }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ connected: true, provider });
    expect(JSON.stringify(res.body)).not.toContain(secret);
    expect(res.body).not.toHaveProperty('refreshToken');
  });

  test('/user ne sérialise aucun secret et conserve seulement des indicateurs booléens', async () => {
    const persisted = {
      _id: 'user-1',
      email: 'avocat@example.test',
      password: 'hash-bcrypt-secret',
      googleRefreshToken: 'google-mail-secret',
      googleDriveRefreshToken: 'google-drive-secret',
      microsoftRefreshToken: 'microsoft-mail-secret',
      microsoftOneDriveRefreshToken: 'onedrive-secret',
      microsoftSharePointRefreshToken: 'sharepoint-secret',
      resetCodeHash: 'reset-secret',
      resetCodeExpiresAt: new Date(),
      resetCodeAttempts: 2,
    };
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        toObject: () => ({ ...persisted }),
      }),
    });
    const res = responseRecorder();

    await routeHandler('/user')({ user: 'user-1' }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.googleRefreshToken).toBe(true);
    expect(res.body.microsoftRefreshToken).toBe(true);
    expect(res.body.oauthConnections).toEqual({
      googleMail: true,
      googleDrive: true,
      microsoftMail: true,
      oneDrive: true,
      sharePoint: true,
    });
    for (const secret of Object.values(persisted).filter((value) =>
      typeof value === 'string' && value.includes('secret')
    )) {
      expect(JSON.stringify(res.body)).not.toContain(secret);
    }
    expect(res.body).not.toHaveProperty('googleDriveRefreshToken');
    expect(res.body).not.toHaveProperty('microsoftOneDriveRefreshToken');
    expect(res.body).not.toHaveProperty('microsoftSharePointRefreshToken');
    expect(res.body).not.toHaveProperty('resetCodeHash');
  });

  test.each([
    ['/user/settings', {}],
    ['/user/onboarding-done', {}],
    ['/user/dossier-colors', { reset: true }],
  ])('%s applique la même frontière après une mise à jour du profil', async (path, body) => {
    const user = {
      _id: 'user-1',
      email: 'avocat@example.test',
      googleRefreshToken: 'google-secret-after-update',
      microsoftRefreshToken: 'microsoft-secret-after-update',
      googleDriveRefreshToken: 'drive-secret-after-update',
      microsoftOneDriveRefreshToken: 'onedrive-secret-after-update',
      microsoftSharePointRefreshToken: 'sharepoint-secret-after-update',
      resetCodeHash: 'reset-secret-after-update',
      dossierColorPreferences: new Map([['default', '#112233']]),
      save: jest.fn().mockResolvedValue(undefined),
      toObject() {
        return {
          ...this,
          save: undefined,
          toObject: undefined,
        };
      },
    };
    User.findById.mockResolvedValue(user);
    const res = responseRecorder();

    await routeHandler(path)({ user: 'user-1', body }, res);

    expect(res.statusCode).toBe(200);
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(res.body.googleRefreshToken).toBe(true);
    expect(res.body.microsoftRefreshToken).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('secret-after-update');
    expect(res.body).not.toHaveProperty('googleDriveRefreshToken');
    expect(res.body).not.toHaveProperty('microsoftOneDriveRefreshToken');
    expect(res.body).not.toHaveProperty('microsoftSharePointRefreshToken');
    expect(res.body).not.toHaveProperty('resetCodeHash');
  });
});
