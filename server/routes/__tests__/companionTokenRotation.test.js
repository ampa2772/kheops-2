const jwt = require('jsonwebtoken');

const mockSessions = new Map();
const mockCompanionSession = {
  create: jest.fn(async (value) => {
    if (mockSessions.has(value.sessionId)) throw new Error('duplicate sessionId');
    const session = { ...value };
    mockSessions.set(value.sessionId, session);
    return { ...session };
  }),
  findOneAndUpdate: jest.fn(async (filter, update) => {
    const session = mockSessions.get(filter.sessionId);
    const now = filter.absoluteExpiresAt?.$gt;
    if (!session
      || session.userId !== filter.userId
      || session.currentJtiHash !== filter.currentJtiHash
      || session.revokedAt != null
      || !(new Date(session.absoluteExpiresAt) > now)) return null;
    Object.assign(session, update.$set);
    return { ...session };
  }),
  updateOne: jest.fn(async (filter, update) => {
    const session = mockSessions.get(filter.sessionId);
    if (!session || session.userId !== filter.userId || session.revokedAt != null) {
      return { modifiedCount: 0 };
    }
    Object.assign(session, update.$set);
    return { modifiedCount: 1 };
  }),
  updateMany: jest.fn(async (filter, update) => {
    let modifiedCount = 0;
    for (const session of mockSessions.values()) {
      if (session.userId === filter.userId && session.revokedAt == null) {
        Object.assign(session, update.$set);
        modifiedCount += 1;
      }
    }
    return { modifiedCount };
  }),
};

jest.mock('../../models/App_Users/CompanionSession', () => mockCompanionSession);
jest.mock('../../middlewares/middleware-auth', () => (req, res, next) => next());
jest.mock('../../utils/ownershipHelpers', () => ({
  ensureDocOwnership: jest.fn(),
  ensureDossierOwnership: jest.fn(),
}));
jest.mock('../../services/fileStorage', () => ({ getFileStorage: jest.fn(() => ({})) }));

const router = require('../word');
const { hashCompanionJti } = require('../../utils/companionSessionSecurity');

function routeHandler(path, method = 'post') {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route.methods[method]);
  if (!layer) throw new Error(`Route absente: ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function request({ user = 'user-1', token, body = {} } = {}) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  return {
    user,
    body,
    headers,
    protocol: 'https',
    get(name) {
      const key = String(name).toLowerCase();
      if (key === 'host') return 'kheops.test';
      return headers[key];
    },
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

async function call(path, { method = 'post', ...options } = {}) {
  const res = responseRecorder();
  await routeHandler(path, method)(request(options), res);
  return res;
}

describe('rotation stateful du jeton Kheops dedie au compagnon', () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalFrontend = process.env.FRONTEND_URL;
  const secret = 'companion-rotation-test-secret-at-least-32-chars';

  beforeAll(() => {
    process.env.JWT_SECRET = secret;
    process.env.FRONTEND_URL = 'https://kheops.test';
  });

  beforeEach(() => {
    mockSessions.clear();
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    if (originalFrontend === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontend;
  });

  test('un JWT utilisateur cree une session Mongo bornee, sans jeton fournisseur', async () => {
    const userToken = jwt.sign({ id: 'user-1' }, secret, { expiresIn: '14d' });
    const res = await call('/companion/session', { token: userToken });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      expiresIn: '8h',
      expiresInSeconds: 8 * 60 * 60,
      backendBaseUrl: 'https://kheops.test',
      userId: 'user-1',
    }));
    const claims = jwt.verify(res.body.companionToken, secret);
    expect(claims).toEqual(expect.objectContaining({
      id: 'user-1',
      companion: true,
      companionSessionId: expect.any(String),
      companionSessionAbsoluteExp: expect.any(Number),
      companionPurpose: 'mirror',
      jti: expect.any(String),
    }));
    expect(claims.exp - claims.iat).toBe(8 * 60 * 60);
    expect(claims.companionSessionAbsoluteExp - claims.iat).toBe(14 * 24 * 60 * 60);
    expect(mockSessions.get(claims.companionSessionId)).toEqual(expect.objectContaining({
      userId: 'user-1',
      purpose: 'mirror',
      docId: null,
      currentJtiHash: hashCompanionJti(claims.jti),
      revokedAt: null,
    }));
    expect(JSON.stringify(res.body)).not.toMatch(/refreshToken|accessToken|google|microsoft|onedrive|sharepoint/i);
  });

  test('une session demandee pour Word est liee au docId', async () => {
    const userToken = jwt.sign({ id: 'user-1' }, secret, { expiresIn: '14d' });
    const res = await call('/companion/session', {
      token: userToken,
      body: { docId: 'doc-lie-1' },
    });
    const claims = jwt.verify(res.body.companionToken, secret);

    expect(claims).toEqual(expect.objectContaining({
      companionPurpose: 'word',
      companionDocId: 'doc-lie-1',
    }));
    expect(mockSessions.get(claims.companionSessionId)).toEqual(expect.objectContaining({
      purpose: 'word',
      docId: 'doc-lie-1',
    }));
  });

  test('une rotation CAS conserve la limite absolue et remplace le jti courant', async () => {
    const userToken = jwt.sign({ id: 'user-1' }, secret, { expiresIn: '14d' });
    const first = await call('/companion/session', { token: userToken });
    const firstClaims = jwt.verify(first.body.companionToken, secret);

    const second = await call('/companion/session', { token: first.body.companionToken });
    const secondClaims = jwt.verify(second.body.companionToken, secret);

    expect(second.statusCode).toBe(200);
    expect(secondClaims.companionSessionId).toBe(firstClaims.companionSessionId);
    expect(secondClaims.companionSessionAbsoluteExp).toBe(firstClaims.companionSessionAbsoluteExp);
    expect(secondClaims.jti).not.toBe(firstClaims.jti);
    expect(mockSessions.get(firstClaims.companionSessionId)).toEqual(expect.objectContaining({
      currentJtiHash: hashCompanionJti(secondClaims.jti),
      previousJtiHash: hashCompanionJti(firstClaims.jti),
      previousValidUntil: expect.any(Date),
    }));
  });

  test('un ancien jti ne peut pas etre rejoue pour une nouvelle rotation', async () => {
    const userToken = jwt.sign({ id: 'user-1' }, secret, { expiresIn: '14d' });
    const first = await call('/companion/session', { token: userToken });
    expect((await call('/companion/session', { token: first.body.companionToken })).statusCode).toBe(200);

    const replay = await call('/companion/session', { token: first.body.companionToken });
    expect(replay.statusCode).toBe(401);
    expect(replay.body.error).toBe('COMPANION_SESSION_ROTATION_REJECTED');
  });

  test('deux rotations concurrentes du meme jti ont exactement un gagnant', async () => {
    const userToken = jwt.sign({ id: 'user-1' }, secret, { expiresIn: '14d' });
    const first = await call('/companion/session', { token: userToken });

    const results = await Promise.all([
      call('/companion/session', { token: first.body.companionToken }),
      call('/companion/session', { token: first.body.companionToken }),
    ]);
    expect(results.map((item) => item.statusCode).sort()).toEqual([200, 401]);
  });

  test('un jeton compagnon 1.0.5 est migre seulement avec une intention explicite', async () => {
    const legacyToken = jwt.sign({ id: 'user-1', companion: true }, secret, { expiresIn: '8h' });
    const refused = await call('/companion/session', { token: legacyToken });
    expect(refused.statusCode).toBe(400);
    expect(refused.body.error).toBe('COMPANION_SESSION_PURPOSE_REQUIRED');

    const res = await call('/companion/session', {
      token: legacyToken,
      body: { purpose: 'word', docId: 'doc-legacy' },
    });

    expect(res.statusCode).toBe(200);
    const claims = jwt.verify(res.body.companionToken, secret);
    expect(mockSessions.has(claims.companionSessionId)).toBe(true);
    expect(claims.jti).toEqual(expect.any(String));
    expect(claims.companionPurpose).toBe('word');
    expect(claims.companionDocId).toBe('doc-legacy');
  });

  test('la rotation refuse une session arrivee a son echeance absolue', async () => {
    const expiredChainToken = jwt.sign({
      id: 'user-1',
      companion: true,
      companionSessionId: 'session-expiree',
      companionSessionAbsoluteExp: Math.floor(Date.now() / 1000) - 1,
      companionPurpose: 'mirror',
    }, secret, { expiresIn: '1h', jwtid: 'jti-expire' });
    const res = await call('/companion/session', { token: expiredChainToken });

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('COMPANION_SESSION_EXPIRED');
  });

  test('revoke coupe la session courante et empeche sa rotation', async () => {
    const userToken = jwt.sign({ id: 'user-1' }, secret, { expiresIn: '14d' });
    const session = await call('/companion/session', { token: userToken });
    const claims = jwt.verify(session.body.companionToken, secret);

    const revoked = await call('/companion/revoke', { token: session.body.companionToken });
    expect(revoked.body).toEqual({ ok: true, revoked: true });
    expect(mockSessions.get(claims.companionSessionId).revokedAt).toEqual(expect.any(Date));
    expect((await call('/companion/session', { token: session.body.companionToken })).statusCode).toBe(401);
  });

  test('revoke-all exige un JWT utilisateur et revoque toutes ses sessions', async () => {
    const userToken = jwt.sign({ id: 'user-1' }, secret, { expiresIn: '14d' });
    const first = await call('/companion/session', { token: userToken });
    const second = await call('/companion/session', { token: userToken });

    const forbidden = await call('/companion/revoke-all', { token: first.body.companionToken });
    expect(forbidden.statusCode).toBe(403);
    const revoked = await call('/companion/revoke-all', { token: userToken });
    expect(revoked.body).toEqual({ ok: true, revokedCount: 2 });
    expect([...mockSessions.values()].every((item) => item.revokedAt instanceof Date)).toBe(true);
    expect(second.body.companionToken).toEqual(expect.any(String));
  });

  test('whoami expose uniquement les bornes utiles a la rotation', async () => {
    const token = jwt.sign({
      id: 'user-1',
      companion: true,
      companionSessionId: 'session-1',
      companionSessionAbsoluteExp: Math.floor(Date.now() / 1000) + 86_400,
      companionPurpose: 'mirror',
    }, secret, { expiresIn: '1h', jwtid: 'jti-1' });
    const res = await call('/companion/whoami', { method: 'get', token });

    expect(res.body).toEqual({
      ok: true,
      userId: 'user-1',
      companion: true,
      sessionId: 'session-1',
      purpose: 'mirror',
      docId: null,
      expiresAt: expect.any(Number),
      sessionAbsoluteExpiresAt: expect.any(Number),
    });
    expect(JSON.stringify(res.body)).not.toContain(token);
  });
});
