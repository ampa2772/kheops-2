// middleware-auth.test.js — Tests du middleware d'authentification JWT

// Mock jsonwebtoken
const mockVerify = jest.fn();
jest.mock('jsonwebtoken', () => ({
  verify: (...args) => mockVerify(...args),
}));

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

// Definir JWT_SECRET dans l'environnement
process.env.JWT_SECRET = 'test-secret-key';

const authMiddleware = require('../middleware-auth');

// Helpers pour creer req/res/next
const createMockReq = (headers = {}) => ({
  header: (name) => headers[name] || headers[name.toLowerCase()],
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
});
