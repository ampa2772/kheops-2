// Tests de GET /api/health/db (cible MongoDB effective, sans URI).
// On demarre l'app Express reelle (sans Mongo — mongoose.connect et la
// resolution de la cible sont dans startServer, pas au require), comme
// applicationReadinessHealth.test.js. La route est authentifiee : 401 sans
// jeton ; avec un jeton valide, 503 tant que la cible n'est pas resolue ; la
// reponse ne contient jamais d'URI.

process.env.NODE_ENV = 'test'; // rate-limiter skip + pas de service statique prod
process.env.KHEOPS_BYPASS_AUTH = 'false'; // controle JWT strict, lu au chargement du middleware
const JWT_SECRET = 'secret-de-test-health-db-0123456789abcdef';
const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = JWT_SECRET;

const http = require('http');
const jwt = require('jsonwebtoken');
const { app } = require('../index');

afterAll(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const req = http.request(
        { method: 'GET', hostname: '127.0.0.1', port: server.address().port, path, headers },
        (res) => {
          let data = '';
          res.on('data', (c) => { data += c; });
          res.on('end', () => { server.close(); resolve({ status: res.statusCode, body: data }); });
        },
      );
      req.on('error', (e) => { server.close(); reject(e); });
      req.end();
    });
  });
}

test('/api/health/db sans jeton : 401, aucune information sur la base', async () => {
  const r = await get('/api/health/db');
  expect(r.status).toBe(401);
  expect(JSON.parse(r.body)).toEqual({ msg: 'No token, authorization denied' });
  expect(r.body).not.toContain('mongodb');
  expect(r.body).not.toContain('fingerprint');
});

test('/api/health/db avec un jeton invalide : 401', async () => {
  const forged = jwt.sign({ id: 'utilisateur' }, 'autre-secret');
  const r = await get('/api/health/db', { Authorization: `Bearer ${forged}` });
  expect(r.status).toBe(401);
  expect(r.body).not.toContain('fingerprint');
});

test('/api/health/db avec un jeton valide avant la resolution de la cible : 503 { ok:false }, sans URI', async () => {
  const token = jwt.sign({ id: 'utilisateur' }, JWT_SECRET);
  const r = await get('/api/health/db', { Authorization: `Bearer ${token}` });
  expect(r.status).toBe(503);
  expect(JSON.parse(r.body)).toEqual({ ok: false, message: 'Cible MongoDB non resolue.' });
  expect(r.body).not.toContain('mongodb://');
  expect(r.body).not.toContain('mongodb+srv://');
});
