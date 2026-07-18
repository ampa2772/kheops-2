// middleware-auth.test.js — Tests du middleware d'authentification JWT

// Mock jsonwebtoken
const mockVerify = jest.fn();
const mockSessionExists = jest.fn();
jest.mock('jsonwebtoken', () => ({
  verify: (...args) => mockVerify(...args),
}));
jest.mock('../../models/App_Users/CompanionSession', () => ({
  exists: (...args) => mockSessionExists(...args),
}));

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

// Definir JWT_SECRET dans l'environnement
process.env.JWT_SECRET = 'test-secret-key';

const authMiddleware = require('../middleware-auth');

// Helpers pour creer req/res/next
const createMockReq = (headers = {}, { method = 'GET', originalUrl = '/api/user' } = {}) => ({
  header: (name) => headers[name] || headers[name.toLowerCase()],
  method,
  originalUrl,
});

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('middleware-auth', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionExists.mockResolvedValue({ _id: 'session-row' });
    res = createMockRes();
    next = jest.fn();
  });

  // ===================== Token manquant =====================
  describe('token manquant', () => {
    it('retourne 401 si aucun header Authorization', () => {
      req = createMockReq({});
      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ msg: 'No token, authorization denied' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ===================== Format Bearer =====================
  describe('format Bearer standard', () => {
    it('extrait le token du format "Bearer <token>"', () => {
      req = createMockReq({ Authorization: 'Bearer valid-token-123' });
      mockVerify.mockReturnValue({ user: { id: 'user1' } });

      authMiddleware(req, res, next);

      expect(mockVerify).toHaveBeenCalledWith('valid-token-123', 'test-secret-key');
    });

    it('appelle next() avec un token valide', () => {
      req = createMockReq({ Authorization: 'Bearer valid-token' });
      mockVerify.mockReturnValue({ user: { id: 'user1' } });

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('assigne req.user depuis decoded.user', () => {
      req = createMockReq({ Authorization: 'Bearer valid-token' });
      mockVerify.mockReturnValue({ user: { id: 'user1' } });

      authMiddleware(req, res, next);

      expect(req.user).toEqual({ id: 'user1' });
    });
  });

  // ===================== Format legacy =====================
  describe('format legacy (token brut)', () => {
    it('utilise le token brut si pas de prefix Bearer', () => {
      req = createMockReq({ Authorization: 'raw-token-456' });
      mockVerify.mockReturnValue({ id: 'user2' });

      authMiddleware(req, res, next);

      expect(mockVerify).toHaveBeenCalledWith('raw-token-456', 'test-secret-key');
    });

    it('assigne req.user depuis decoded.id si decoded.user absent', () => {
      req = createMockReq({ Authorization: 'raw-token' });
      mockVerify.mockReturnValue({ id: 'user2' });

      authMiddleware(req, res, next);

      expect(req.user).toBe('user2');
    });
  });

  // ===================== Header x-auth-token =====================
  describe('header x-auth-token (fallback)', () => {
    it('accepte le token depuis x-auth-token', () => {
      req = createMockReq({ 'x-auth-token': 'fallback-token' });
      mockVerify.mockReturnValue({ id: 'user3' });

      authMiddleware(req, res, next);

      expect(mockVerify).toHaveBeenCalledWith('fallback-token', 'test-secret-key');
      expect(next).toHaveBeenCalled();
    });
  });

  // ===================== Token invalide =====================
  describe('token invalide', () => {
    it('retourne 401 si jwt.verify echoue', () => {
      req = createMockReq({ Authorization: 'Bearer bad-token' });
      mockVerify.mockImplementation(() => { throw new Error('jwt malformed'); });

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ msg: 'Token is not valid' });
      expect(next).not.toHaveBeenCalled();
    });

    it('retourne 401 si le token est expire', () => {
      req = createMockReq({ Authorization: 'Bearer expired-token' });
      mockVerify.mockImplementation(() => { throw new Error('jwt expired'); });

      authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('frontiere de capacite des jetons compagnon', () => {
    const modernClaims = {
      id: 'user-companion',
      companion: true,
      companionSessionId: 'session-1',
      companionSessionAbsoluteExp: Math.floor(Date.now() / 1000) + 3600,
      companionPurpose: 'word',
      companionDocId: 'doc-1',
      jti: 'jti-current',
    };

    it('refuse toute API hors allowlist exacte', async () => {
      req = createMockReq(
        { Authorization: 'Bearer companion-token' },
        { method: 'GET', originalUrl: '/api/user' },
      );
      mockVerify.mockReturnValue(modernClaims);

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'COMPANION_TOKEN_SCOPE_FORBIDDEN',
      }));
      expect(mockSessionExists).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('valide la session Mongo puis autorise uniquement le doc lie au purpose word', async () => {
      req = createMockReq(
        { Authorization: 'Bearer companion-token' },
        { method: 'POST', originalUrl: '/api/document-locks/doc-1/heartbeat' },
      );
      mockVerify.mockReturnValue(modernClaims);

      await authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockSessionExists).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: 'session-1',
        userId: 'user-companion',
        revokedAt: null,
        absoluteExpiresAt: { $gt: expect.any(Date) },
        $or: [
          { currentJtiHash: expect.any(String) },
          {
            previousJtiHash: expect.any(String),
            previousValidUntil: { $gt: expect.any(Date) },
          },
        ],
      }));

      jest.clearAllMocks();
      mockVerify.mockReturnValue(modernClaims);
      req = createMockReq(
        { Authorization: 'Bearer companion-token' },
        { method: 'GET', originalUrl: '/api/word/doc-2/download' },
      );
      await authMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockSessionExists).not.toHaveBeenCalled();
    });

    it('autorise HEAD download pour le miroir, mais pas les verrous', async () => {
      const mirrorClaims = {
        ...modernClaims,
        companionPurpose: 'mirror',
        companionDocId: undefined,
      };
      mockVerify.mockReturnValue(mirrorClaims);
      req = createMockReq(
        { Authorization: 'Bearer companion-token' },
        { method: 'HEAD', originalUrl: '/api/word/doc-2/download' },
      );

      await authMiddleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();
      mockVerify.mockReturnValue(mirrorClaims);
      req = createMockReq(
        { Authorization: 'Bearer companion-token' },
        { method: 'POST', originalUrl: '/api/document-locks/doc-2/acquire' },
      );
      await authMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('refuse une session moderne absente, revoquee ou expiree', async () => {
      mockVerify.mockReturnValue(modernClaims);
      mockSessionExists.mockResolvedValue(null);
      req = createMockReq(
        { Authorization: 'Bearer companion-token' },
        { method: 'GET', originalUrl: '/api/word/companion/whoami' },
      );

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'COMPANION_SESSION_INVALID',
      }));
      expect(next).not.toHaveBeenCalled();
    });

    it('refuse un jeton stateful sans purpose au lieu de le traiter comme legacy global', async () => {
      const incompleteClaims = { ...modernClaims };
      delete incompleteClaims.companionPurpose;
      delete incompleteClaims.companionDocId;
      mockVerify.mockReturnValue(incompleteClaims);
      req = createMockReq(
        { Authorization: 'Bearer companion-token-incomplet' },
        { method: 'POST', originalUrl: '/api/word/doc-1/sync' },
      );

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'COMPANION_SESSION_CLAIMS_INVALID',
      }));
      expect(mockSessionExists).not.toHaveBeenCalled();
      expect(req.legacyCompanionToken).toBeUndefined();
      expect(next).not.toHaveBeenCalled();
    });

    it('autorise la revocation courante mais interdit revoke-all au compagnon', async () => {
      mockVerify.mockReturnValue(modernClaims);
      req = createMockReq(
        { Authorization: 'Bearer companion-token' },
        { method: 'POST', originalUrl: '/api/word/companion/revoke' },
      );
      await authMiddleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();
      mockVerify.mockReturnValue(modernClaims);
      req = createMockReq(
        { Authorization: 'Bearer companion-token' },
        { method: 'POST', originalUrl: '/api/word/companion/revoke-all' },
      );
      await authMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('accepte un legacy sans claims jusqu a son exp, uniquement sur l allowlist', async () => {
      mockVerify.mockReturnValue({ id: 'user-legacy', companion: true, exp: 9999999999 });
      req = createMockReq(
        { Authorization: 'Bearer legacy-token' },
        { method: 'POST', originalUrl: '/api/word/doc-legacy/sync' },
      );

      await authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockSessionExists).not.toHaveBeenCalled();
      expect(req.legacyCompanionToken).toBe(true);
    });

    it('applique aussi la validation stateful au vrai JWT en mode bypass', async () => {
      const previousBypass = process.env.KHEOPS_BYPASS_AUTH;
      process.env.KHEOPS_BYPASS_AUTH = 'true';
      jest.resetModules();
      const bypassAuth = require('../middleware-auth');
      mockVerify.mockReturnValue(modernClaims);
      mockSessionExists.mockResolvedValue(null);
      req = createMockReq(
        { Authorization: 'Bearer companion-token' },
        { method: 'GET', originalUrl: '/api/word/companion/whoami' },
      );

      await bypassAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
      if (previousBypass === undefined) delete process.env.KHEOPS_BYPASS_AUTH;
      else process.env.KHEOPS_BYPASS_AUTH = previousBypass;
      jest.resetModules();
    });
  });
});
