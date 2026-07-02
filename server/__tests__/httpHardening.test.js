// Tests A12 — durcissement HTTP : en-têtes de sécurité + CORS.
// On démarre l'app Express réelle (sans Mongo — mongoose.connect est dans
// startServer, pas au require) et on inspecte les en-têtes de réponse.

process.env.NODE_ENV = 'test'; // rate-limiter skip + pas de service statique prod
const http = require('http');
const { app } = require('../index');

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const req = http.request(
        { method: 'GET', hostname: '127.0.0.1', port: server.address().port, path, headers },
        (res) => {
          let data = '';
          res.on('data', (c) => { data += c; });
          res.on('end', () => { server.close(); resolve({ status: res.statusCode, headers: res.headers, body: data }); });
        },
      );
      req.on('error', (e) => { server.close(); reject(e); });
      req.end();
    });
  });
}

describe('en-têtes de sécurité', () => {
  test('HSTS, nosniff, frame-options, referrer-policy, permissions-policy, pas de x-powered-by', async () => {
    const r = await get('/api/health/ping');
    expect(r.status).toBe(200);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['strict-transport-security']).toMatch(/max-age=31536000/);
    expect(r.headers['strict-transport-security']).toMatch(/includeSubDomains/i);
    expect(r.headers['x-frame-options']).toBeTruthy();
    expect(r.headers['referrer-policy']).toBeTruthy();
    expect(r.headers['permissions-policy']).toContain('geolocation=()');
    expect(r.headers['permissions-policy']).toContain('payment=()');
    // A12 : le micro reste autorisé (messages vocaux) → pas de microphone=() .
    expect(r.headers['permissions-policy']).not.toContain('microphone=()');
    expect(r.headers['x-powered-by']).toBeUndefined();
  });
});

describe('CORS', () => {
  test('origine whitelistée → reflétée', async () => {
    const r = await get('/api/health/ping', { Origin: 'http://localhost:3000' });
    expect(r.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(r.headers['access-control-allow-credentials']).toBe('true');
  });

  test('🔒 origine inconnue → NON reflétée (pas d\'ACAO attaquant)', async () => {
    const r = await get('/api/health/ping', { Origin: 'https://evil.example.com' });
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });
});
