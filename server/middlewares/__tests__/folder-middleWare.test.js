// folder-middleWare.test.js — Tests des middlewares de validation folder

// Mock mongoose
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    Types: {
      ObjectId: {
        isValid: jest.fn(),
      },
    },
  };
});

// Mock des modeles
const mockFindOneTypeContact = jest.fn();
const mockFindOneContact = jest.fn();

jest.mock('../../models/Folder/TypeContact', () => ({
  findOne: (...args) => mockFindOneTypeContact(...args),
}));

jest.mock('../../models/Folder/Contact', () => ({
  findOne: (...args) => mockFindOneContact(...args),
}));

const mongoose = require('mongoose');
const {
  validateObjectIdParam,
  validateTypeContactData,
  checkTypeContactExists,
  validateContactData,
  checkContactExists,
  asyncHandler,
  validateContactPMData,
  validateContactPMPubliqueData,
} = require('../folder-middleWare');

// Helpers
const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe('folder-middleWare', () => {
  let res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    res = createMockRes();
    next = jest.fn();
  });

  // ===================== validateObjectIdParam =====================
  describe('validateObjectIdParam', () => {
    it('appelle next() si l ID dans params est valide', () => {
      mongoose.Types.ObjectId.isValid.mockReturnValue(true);
      const req = { params: { id: '507f1f77bcf86cd799439011' }, body: {} };

      validateObjectIdParam('id')(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('retourne 400 si l ID dans params est invalide', () => {
      mongoose.Types.ObjectId.isValid.mockReturnValue(false);
      const req = { params: { id: 'invalid-id' }, body: {} };

      validateObjectIdParam('id')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'ID invalide' });
      expect(next).not.toHaveBeenCalled();
    });

    it('cherche l ID dans body si absent de params', () => {
      mongoose.Types.ObjectId.isValid.mockReturnValue(true);
      const req = { params: {}, body: { contactId: '507f1f77bcf86cd799439011' } };

      validateObjectIdParam('contactId')(req, res, next);

      expect(mongoose.Types.ObjectId.isValid).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(next).toHaveBeenCalled();
    });
  });

  // ===================== validateTypeContactData =====================
  describe('validateTypeContactData', () => {
    it('appelle next() si masculin est present', () => {
      const req = { body: { masculin: 'Avocat' } };

      validateTypeContactData(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('retourne 400 si masculin est absent', () => {
      const req = { body: {} };

      validateTypeContactData(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith('Le champ Masculin au moins doit être rempli.');
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ===================== checkTypeContactExists =====================
  describe('checkTypeContactExists', () => {
    it('appelle next() si le type de contact n existe pas', async () => {
      mockFindOneTypeContact.mockResolvedValue(null);
      const req = { body: { masculin: 'Notaire' } };

      await checkTypeContactExists(req, res, next);

      expect(mockFindOneTypeContact).toHaveBeenCalledWith({ masculin: 'Notaire' });
      expect(next).toHaveBeenCalled();
    });

    it('retourne 400 si le type de contact existe deja', async () => {
      mockFindOneTypeContact.mockResolvedValue({ _id: 'tc1', masculin: 'Avocat' });
      const req = { body: { masculin: 'Avocat' } };

      await checkTypeContactExists(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith('Ce type de contact existe déjà.');
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ===================== validateContactData =====================
  describe('validateContactData', () => {
    it('appelle next() si contact.nom est present', () => {
      const req = { body: { contact: { nom: 'Dupont' } } };

      validateContactData(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('retourne 400 si contact est absent', () => {
      const req = { body: {} };

      validateContactData(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith('Le champ nom du contact est requis.');
    });

    it('retourne 400 si contact.nom est absent', () => {
      const req = { body: { contact: { email: 'test@test.com' } } };

      validateContactData(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith('Le champ nom du contact est requis.');
    });
  });

  // ===================== checkContactExists =====================
  describe('checkContactExists', () => {
    it('appelle next() si aucun contact existant', async () => {
      mockFindOneContact.mockResolvedValue(null);
      const req = { body: { contact: { nom: 'Dupont', email: 'a@b.com', dateNaissance: '1990-01-01' } } };

      await checkContactExists(req, res, next);

      expect(mockFindOneContact).toHaveBeenCalledWith({
        nom: 'Dupont',
        email: 'a@b.com',
        dateNaissance: '1990-01-01',
      });
      expect(next).toHaveBeenCalled();
    });

    it('retourne 400 si le contact existe deja', async () => {
      mockFindOneContact.mockResolvedValue({ _id: 'c1' });
      const req = { body: { contact: { nom: 'Dupont', email: 'a@b.com', dateNaissance: '1990-01-01' } } };

      await checkContactExists(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        msg: 'Un contact avec le même nom, email et date de naissance existe déjà',
      });
    });
  });

  // ===================== validateContactPMData =====================
  describe('validateContactPMData', () => {
    it('appelle next() si raisonSociale est presente', () => {
      const req = { body: { contact: { raisonSociale: 'SAS Test' } } };

      validateContactPMData(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('retourne 400 si raisonSociale est absente', () => {
      const req = { body: { contact: {} } };

      validateContactPMData(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith('Le champ raison sociale est requis.');
    });

    it('retourne 400 si contact est absent du body', () => {
      const req = { body: {} };

      validateContactPMData(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // ===================== validateContactPMPubliqueData =====================
  describe('validateContactPMPubliqueData', () => {
    it('appelle next() si denomination est presente', () => {
      const req = { body: { contactData: { denomination: 'Ministere' } } };

      validateContactPMPubliqueData(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('retourne 400 si denomination est absente', () => {
      const req = { body: { contactData: {} } };

      validateContactPMPubliqueData(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.send).toHaveBeenCalledWith('Le champ dénomination est requis.');
    });

    it('retourne 400 si contactData est absent du body', () => {
      const req = { body: {} };

      validateContactPMPubliqueData(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // ===================== asyncHandler =====================
  describe('asyncHandler', () => {
    it('appelle la fonction wrappee avec req, res, next', async () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const req = {};

      await asyncHandler(fn)(req, res, next);

      expect(fn).toHaveBeenCalledWith(req, res, next);
    });

    it('appelle next avec l erreur si la promesse est rejetee', async () => {
      const error = new Error('Async error');
      const fn = jest.fn().mockRejectedValue(error);
      const req = {};

      await asyncHandler(fn)(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('ne crash pas si la fonction synchrone ne retourne pas de promesse', async () => {
      const fn = jest.fn().mockReturnValue('sync result');
      const req = {};

      await asyncHandler(fn)(req, res, next);

      expect(fn).toHaveBeenCalledWith(req, res, next);
    });
  });
});
