// documents.test.js — Tests des routes /api/documents

// Mock du middleware auth — laisse passer toutes les requetes
jest.mock('../../middlewares/middleware-auth', () => (req, res, next) => {
  req.user = 'user-id-123';
  next();
});

// Mock des modeles Mongoose
const mockJsonDocumentFind = jest.fn();
const mockJsonDocumentFindById = jest.fn();
const mockJsonDocumentFindOneAndUpdate = jest.fn();
const mockJsonDocumentFindOneAndDelete = jest.fn();
const mockJsonDocumentSave = jest.fn();

jest.mock('../../models/JsonDocuments/JsonDocument', () => {
  const MockJsonDocument = jest.fn().mockImplementation(function (data) {
    Object.assign(this, data);
    this.save = mockJsonDocumentSave.mockResolvedValue(this);
  });
  MockJsonDocument.find = (...args) => mockJsonDocumentFind(...args);
  MockJsonDocument.findById = (...args) => mockJsonDocumentFindById(...args);
  MockJsonDocument.findOneAndUpdate = (...args) => mockJsonDocumentFindOneAndUpdate(...args);
  MockJsonDocument.findOneAndDelete = (...args) => mockJsonDocumentFindOneAndDelete(...args);
  return MockJsonDocument;
});

const mockJsonTemplateFind = jest.fn();
jest.mock('../../models/JsonDocuments/JsonTemplate', () => ({
  find: (...args) => mockJsonTemplateFind(...args),
}));

// Importer express + supertest-like approach avec le router
const express = require('express');
const router = require('../documents');

// Creer une mini app Express pour tester les routes
const app = express();
app.use(express.json());
app.use('/api/documents', router);

// Simuler un handler pour les erreurs non capturees
app.use((err, req, res, next) => {
  res.status(500).json({ message: err.message });
});

// Helper pour faire des requetes HTTP sans supertest
const http = require('http');
let server;
let baseUrl;

beforeAll((done) => {
  server = app.listen(0, () => {
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
    done();
  });
});

afterAll((done) => {
  server.close(done);
});

// Helper pour les requetes HTTP
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
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('Routes /api/documents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===================== GET /templates =====================
  describe('GET /api/documents/templates', () => {
    it('retourne la liste des templates', async () => {
      const mockSelect = jest.fn().mockResolvedValue([
        { _id: 't1', name: 'Template A', description: 'Desc A' },
      ]);
      mockJsonTemplateFind.mockReturnValue({ select: mockSelect });

      const res = await makeRequest('GET', '/api/documents/templates');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Template A');
    });
  });

  // ===================== GET /dossier/:dossierId =====================
  describe('GET /api/documents/dossier/:dossierId', () => {
    it('retourne les documents d un dossier', async () => {
      const mockSort = jest.fn().mockResolvedValue([
        { _id: 'd1', name: 'Doc 1' },
        { _id: 'd2', name: 'Doc 2' },
      ]);
      const mockSelect = jest.fn().mockReturnValue({ sort: mockSort });
      mockJsonDocumentFind.mockReturnValue({ select: mockSelect });

      const res = await makeRequest('GET', '/api/documents/dossier/dossierId123');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  // ===================== GET /:id =====================
  describe('GET /api/documents/:id', () => {
    it('retourne un document par ID', async () => {
      mockJsonDocumentFindById.mockResolvedValue({
        _id: 'doc1', name: 'Mon document', encryptedContent: 'data...',
      });

      const res = await makeRequest('GET', '/api/documents/doc1');

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Mon document');
    });

    it('retourne 404 si le document n existe pas', async () => {
      mockJsonDocumentFindById.mockResolvedValue(null);

      const res = await makeRequest('GET', '/api/documents/inexistant');

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Document non trouvé');
    });
  });

  // ===================== POST / =====================
  describe('POST /api/documents', () => {
    it('cree un nouveau document avec succes', async () => {
      mockJsonDocumentSave.mockImplementation(function () { return Promise.resolve(this); });

      const res = await makeRequest('POST', '/api/documents', {
        name: 'Nouveau doc',
        encryptedContent: 'encrypted-data',
        dossierId: 'dossier-123',
      });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Nouveau doc');
    });

    it('retourne 400 si des champs requis manquent', async () => {
      const res = await makeRequest('POST', '/api/documents', {
        name: 'Doc sans contenu',
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('requis');
    });
  });

  // ===================== PUT /:id =====================
  describe('PUT /api/documents/:id', () => {
    it('met a jour un document existant', async () => {
      mockJsonDocumentFindOneAndUpdate.mockResolvedValue({
        _id: 'doc1', name: 'Nom modifie', encryptedContent: 'new-data',
      });

      const res = await makeRequest('PUT', '/api/documents/doc1', {
        name: 'Nom modifie',
      });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Nom modifie');
    });

    it('retourne 404 si le document n existe pas ou pas autorise', async () => {
      mockJsonDocumentFindOneAndUpdate.mockResolvedValue(null);

      const res = await makeRequest('PUT', '/api/documents/inexistant', {
        name: 'Test',
      });

      expect(res.status).toBe(404);
    });

    it('retourne 400 si aucune donnee a mettre a jour', async () => {
      const res = await makeRequest('PUT', '/api/documents/doc1', {});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Aucune donnée');
    });
  });

  // ===================== DELETE /:id =====================
  describe('DELETE /api/documents/:id', () => {
    it('supprime un document avec succes', async () => {
      mockJsonDocumentFindOneAndDelete.mockResolvedValue({ _id: 'doc1' });

      const res = await makeRequest('DELETE', '/api/documents/doc1');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('supprimé avec succès');
    });

    it('retourne 404 si le document n existe pas ou pas autorise', async () => {
      mockJsonDocumentFindOneAndDelete.mockResolvedValue(null);

      const res = await makeRequest('DELETE', '/api/documents/inexistant');

      expect(res.status).toBe(404);
    });
  });
});
