// verifyToken.test.js — Tests du middleware verifyToken

// Mock jsonwebtoken
const mockVerify = jest.fn();
jest.mock('jsonwebtoken', () => ({
  verify: (...args) => mockVerify(...args),
}));

// Mock du modele User
const mockFindById = jest.fn();
jest.mock('../../models/App_Users/User', () => ({
  findById: (...args) => mockFindById(...args),
}));

process.env.JWT_SECRET = 'test-secret-key';

const verifyToken = require('../verifyToken');

const createMockReq = (headers = {}) => ({
  header: (name) => headers[name],
});

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('verifyToken', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    res = createMockRes();
    next = jest.fn();
  });

  // ===================== Token manquant =====================
  describe('token manquant', () => {
    it('retourne 401 si aucun header Authorization', async () => {
      req = createMockReq({});
      await verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ msg: 'Aucun token, autorisation refusée' });
      expect(next).not.toHaveBeenCalled();
    });

    it('retourne 401 si le header ne commence pas par Bearer', async () => {
      req = createMockReq({ Authorization: 'raw-token' });
      await verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ===================== Token valide =====================
  describe('token valide', () => {
    it('assigne l utilisateur complet a req.user et appelle next()', async () => {
      req = createMockReq({ Authorization: 'Bearer valid-token' });
      const fakeUser = { _id: 'u1', firstName: 'Jean', lastName: 'Dupont', email: 'jean@test.com' };
      mockVerify.mockReturnValue({ id: 'u1' });
      mockFindById.mockResolvedValue(fakeUser);

      await verifyToken(req, res, next);

      expect(mockVerify).toHaveBeenCalledWith('valid-token', 'test-secret-key');
      expect(mockFindById).toHaveBeenCalledWith('u1');
      expect(req.user).toEqual(fakeUser);
      expect(next).toHaveBeenCalled();
    });
  });

  // ===================== Utilisateur non trouve =====================
  describe('utilisateur non trouve', () => {
    it('retourne 404 si User.findById retourne null', async () => {
      req = createMockReq({ Authorization: 'Bearer valid-token' });
      mockVerify.mockReturnValue({ id: 'u-inconnu' });
      mockFindById.mockResolvedValue(null);

      await verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ msg: 'Utilisateur non trouvé' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ===================== Token invalide =====================
  describe('token invalide', () => {
    it('retourne 401 si jwt.verify echoue', async () => {
      req = createMockReq({ Authorization: 'Bearer bad-token' });
      mockVerify.mockImplementation(() => { throw new Error('jwt malformed'); });

      await verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ msg: 'Token non valide' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
