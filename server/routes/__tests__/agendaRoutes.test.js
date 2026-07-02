// agendaRoutes.test.js — Tests des routes /api/agenda

// Mock du middleware auth
jest.mock('../../middlewares/middleware-auth', () => (req, res, next) => {
  req.user = 'user-id-123';
  next();
});

// Mock mongoose pour ObjectId.isValid
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    Types: {
      ...actual.Types,
      ObjectId: {
        ...actual.Types.ObjectId,
        isValid: jest.fn().mockReturnValue(true),
      },
    },
  };
});

// Mock des modeles
const mockAgendaEventFind = jest.fn();
const mockAgendaEventFindById = jest.fn();
const mockAgendaEventFindByIdAndDelete = jest.fn();
const mockAgendaEventSave = jest.fn();

jest.mock('../../models/AgendaEvents/AgendaEvent', () => {
  const MockAgendaEvent = jest.fn().mockImplementation(function (data) {
    Object.assign(this, data);
    this.save = jest.fn().mockImplementation(() => {
      mockAgendaEventSave(this);
      return Promise.resolve(this);
    });
    this.populate = jest.fn().mockImplementation(() => Promise.resolve(this));
  });
  MockAgendaEvent.find = (...args) => mockAgendaEventFind(...args);
  MockAgendaEvent.findById = (...args) => mockAgendaEventFindById(...args);
  MockAgendaEvent.findByIdAndDelete = (...args) => mockAgendaEventFindByIdAndDelete(...args);
  return MockAgendaEvent;
});

const mockDossierEventLinkDeleteMany = jest.fn();
jest.mock('../../models/AgendaEvents/DossierEventLink', () => ({
  deleteMany: (...args) => mockDossierEventLinkDeleteMany(...args),
}));

const mockDossierFindById = jest.fn();
jest.mock('../../models/Folder/Dossier', () => ({
  findById: (...args) => mockDossierFindById(...args),
}));

// rc37/A1 : les routes vérifient l'appartenance au dossier via
// ensureDossierOwnership (qui écrit lui-même la réponse en cas de refus).
// Par défaut on autorise ; les tests d'accès refusé surchargent.
const mockEnsureDossierOwnership = jest.fn();
jest.mock('../../utils/ownershipHelpers', () => ({
  ensureDossierOwnership: (...args) => mockEnsureDossierOwnership(...args),
}));
jest.mock('../../utils/auditLogger', () => ({ create: jest.fn(), update: jest.fn(), delete: jest.fn() }));

const mongoose = require('mongoose');
const express = require('express');
const router = require('../agendaRoutes');

const app = express();
app.use(express.json());
app.use('/api/agenda', router);
app.use((err, req, res, next) => {
  res.status(500).json({ message: err.message });
});

const http = require('http');
let server;
let baseUrl;

beforeAll((done) => {
  server = app.listen(0, () => {
    baseUrl = `http://localhost:${server.address().port}`;
    done();
  });
});

afterAll((done) => {
  server.close(done);
});

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('Routes /api/agenda', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mongoose.Types.ObjectId.isValid.mockReturnValue(true);
    mockEnsureDossierOwnership.mockResolvedValue(true); // dossier accessible par défaut
  });

  // ===================== GET /tasks =====================
  describe('GET /api/agenda/tasks', () => {
    it('retourne les 25 taches les plus urgentes', async () => {
      const mockLimit = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue([{ _id: 't1', title: 'Tache 1' }]) });
      const mockSort = jest.fn().mockReturnValue({ limit: mockLimit });
      mockAgendaEventFind.mockReturnValue({ sort: mockSort });

      const res = await makeRequest('GET', '/api/agenda/tasks');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  // ===================== GET /dossier/:dossierId =====================
  describe('GET /api/agenda/dossier/:dossierId', () => {
    it('retourne les evenements d un dossier', async () => {
      const mockSort = jest.fn().mockResolvedValue([{ _id: 'e1', title: 'Evenement dossier' }]);
      const mockPopulate = jest.fn().mockReturnValue({ sort: mockSort });
      mockAgendaEventFind.mockReturnValue({ populate: mockPopulate });

      const res = await makeRequest('GET', '/api/agenda/dossier/dossier123');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('retourne 400 si l ID du dossier est invalide', async () => {
      mongoose.Types.ObjectId.isValid.mockReturnValue(false);

      const res = await makeRequest('GET', '/api/agenda/dossier/invalid-id');

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('invalide');
    });
  });

  // ===================== GET /events =====================
  describe('GET /api/agenda/events', () => {
    it('retourne tous les evenements de l utilisateur', async () => {
      const mockSort = jest.fn().mockResolvedValue([
        { _id: 'e1', title: 'Event 1' },
        { _id: 'e2', title: 'Event 2' },
      ]);
      const mockPopulate = jest.fn().mockReturnValue({ sort: mockSort });
      mockAgendaEventFind.mockReturnValue({ populate: mockPopulate });

      const res = await makeRequest('GET', '/api/agenda/events');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  // ===================== POST /events =====================
  describe('POST /api/agenda/events', () => {
    it('cree un nouvel evenement avec succes', async () => {
      const res = await makeRequest('POST', '/api/agenda/events', {
        title: 'Reunion',
        startDate: '2025-01-15T10:00:00Z',
        endDate: '2025-01-15T11:00:00Z',
        description: 'Reunion importante',
        type: 'event',
      });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Reunion');
    });

    it('retourne 400 si le titre manque', async () => {
      const res = await makeRequest('POST', '/api/agenda/events', {
        startDate: '2025-01-15T10:00:00Z',
        endDate: '2025-01-15T11:00:00Z',
      });

      // La validation passe désormais par validateBody(createEventSchema) (Joi),
      // qui renvoie un message générique « Données invalides. ».
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalides|titre/i);
    });

    it('retourne 400 pour une tache sans deadline', async () => {
      const res = await makeRequest('POST', '/api/agenda/events', {
        title: 'Tache',
        type: 'task',
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('échéance');
    });

    it('retourne 400 pour un evenement sans dates', async () => {
      const res = await makeRequest('POST', '/api/agenda/events', {
        title: 'Event sans dates',
        type: 'event',
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('dates');
    });

    it('retourne 400 si dossierId fourni est invalide', async () => {
      mongoose.Types.ObjectId.isValid.mockReturnValue(false);

      const res = await makeRequest('POST', '/api/agenda/events', {
        title: 'Event',
        startDate: '2025-01-15T10:00:00Z',
        endDate: '2025-01-15T11:00:00Z',
        dossierId: 'invalid',
      });

      expect(res.status).toBe(400);
    });

    it('retourne 403 si le dossier n appartient pas au cabinet', async () => {
      // A1 : la liaison à un dossier passe par ensureDossierOwnership, qui
      // refuse (403) un dossier inaccessible — remplace l'ancien 404 « existe pas ».
      mockEnsureDossierOwnership.mockImplementation(async (req, res) => {
        res.status(403).json({ message: 'Acces refuse.' });
        return false;
      });

      const res = await makeRequest('POST', '/api/agenda/events', {
        title: 'Event',
        startDate: '2025-01-15T10:00:00Z',
        endDate: '2025-01-15T11:00:00Z',
        dossierId: '507f1f77bcf86cd799439011',
      });

      expect(res.status).toBe(403);
    });
  });

  // ===================== PUT /events/:eventId =====================
  describe('PUT /api/agenda/events/:eventId', () => {
    it('met a jour un evenement existant', async () => {
      const mockEvent = {
        _id: 'e1',
        title: 'Ancien titre',
        description: '',
        type: 'event',
        startDate: new Date(),
        endDate: new Date(),
        createdBy: { toString: () => 'user-id-123' },
        save: jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
        populate: jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      };
      mockAgendaEventFindById.mockResolvedValue(mockEvent);

      const res = await makeRequest('PUT', '/api/agenda/events/e1', {
        title: 'Nouveau titre',
      });

      expect(res.status).toBe(200);
    });

    it('retourne 400 si l ID evenement est invalide', async () => {
      mongoose.Types.ObjectId.isValid.mockReturnValue(false);

      const res = await makeRequest('PUT', '/api/agenda/events/bad-id', {
        title: 'Test',
      });

      expect(res.status).toBe(400);
    });

    it('retourne 404 si l evenement n existe pas', async () => {
      mockAgendaEventFindById.mockResolvedValue(null);

      const res = await makeRequest('PUT', '/api/agenda/events/inexistant', {
        title: 'Test',
      });

      expect(res.status).toBe(404);
    });

    it('retourne 403 si l utilisateur n est pas le createur', async () => {
      const mockEvent = {
        _id: 'e1',
        createdBy: { toString: () => 'other-user-id' },
      };
      mockAgendaEventFindById.mockResolvedValue(mockEvent);

      const res = await makeRequest('PUT', '/api/agenda/events/e1', {
        title: 'Test',
      });

      expect(res.status).toBe(403);
    });
  });

  // ===================== DELETE /events/:eventId =====================
  describe('DELETE /api/agenda/events/:eventId', () => {
    it('supprime un evenement et ses liaisons', async () => {
      const mockEvent = {
        _id: 'e1',
        createdBy: { toString: () => 'user-id-123' },
      };
      mockAgendaEventFindById.mockResolvedValue(mockEvent);
      mockAgendaEventFindByIdAndDelete.mockResolvedValue(true);
      mockDossierEventLinkDeleteMany.mockResolvedValue({ deletedCount: 2 });

      const res = await makeRequest('DELETE', '/api/agenda/events/e1');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('supprimés avec succès');
    });

    it('retourne 400 si l ID est invalide', async () => {
      mongoose.Types.ObjectId.isValid.mockReturnValue(false);

      const res = await makeRequest('DELETE', '/api/agenda/events/bad-id');

      expect(res.status).toBe(400);
    });

    it('retourne 404 si l evenement n existe pas', async () => {
      mockAgendaEventFindById.mockResolvedValue(null);

      const res = await makeRequest('DELETE', '/api/agenda/events/inexistant');

      expect(res.status).toBe(404);
    });

    it('retourne 403 si l utilisateur n est pas autorise', async () => {
      const mockEvent = {
        _id: 'e1',
        createdBy: { toString: () => 'other-user' },
      };
      mockAgendaEventFindById.mockResolvedValue(mockEvent);

      const res = await makeRequest('DELETE', '/api/agenda/events/e1');

      expect(res.status).toBe(403);
    });
  });
});
