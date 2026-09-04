// Tests cors-403 — refus explicite d'une origine non autorisee.
// Une origine inconnue doit recevoir 403 (corps court, sans message interne)
// sur un pre-vol OPTIONS comme sur un GET, sans journal console.error ; une
// origine autorisee, une requete sans Origin et les schemes Electron hors
// hebergement conservent leur comportement historique.
// On demarre l'app Express reelle (sans Mongo — mongoose.connect est dans
// startServer, pas au require), comme httpHardening.test.js.

process.env.NODE_ENV = 'test'; // rate-limiter skip + pas de service statique prod
const http = require('http');
const { app } = require('../index');

const PREFLIGHT_HEADERS = {
  'Access-Control-Request-Method': 'GET',
  'Access-Control-Request-Headers': 'authorization,content-type',
};

function request(method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const req = http.request(
        { method, hostname: '127.0.0.1', port: server.address().port, path, headers },
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

let errorSpy;
let warnSpy;

beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  warnSpy.mockRestore();
});

describe('origine non autorisee', () => {
  test('pre-vol OPTIONS → 403 avec corps court, sans en-tete CORS', async () => {
    const r = await request('OPTIONS', '/api/health/ping', {
      Origin: 'https://evil.example.com',
      ...PREFLIGHT_HEADERS,
    });
    expect(r.status).toBe(403);
    expect(r.headers['content-type']).toMatch(/application\/json/);
    expect(JSON.parse(r.body)).toEqual({ message: 'Origine non autorisee.', error: 'CORS_ORIGIN_FORBIDDEN' });
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    expect(r.headers['access-control-allow-credentials']).toBeUndefined();
  });

  test('GET → 403 avec le meme corps, sans en-tete CORS', async () => {
    const r = await request('GET', '/api/health/ping', { Origin: 'https://evil.example.com' });
    expect(r.status).toBe(403);
    expect(JSON.parse(r.body)).toEqual({ message: 'Origine non autorisee.', error: 'CORS_ORIGIN_FORBIDDEN' });
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('le corps ne contient ni message interne ni "Erreur interne du serveur"', async () => {
    const r = await request('OPTIONS', '/api/health/ping', {
      Origin: 'https://evil.example.com',
      ...PREFLIGHT_HEADERS,
    });
    expect(r.body).not.toContain('CORS origin not allowed');
    expect(r.body).not.toContain('Erreur interne du serveur');
    expect(r.body).not.toContain('at ');
  });

  test('refus journalise en console.warn uniquement, jamais en console.error', async () => {
    await request('OPTIONS', '/api/health/ping', {
      Origin: 'https://evil.example.com',
      ...PREFLIGHT_HEADERS,
    });
    await request('GET', '/api/health/ping', { Origin: 'https://evil.example.com' });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[CORS] Origin refusee : https://evil.example.com'));
  });
});

describe('origine autorisee et cas historiques conserves', () => {
  test('pre-vol OPTIONS d\'une origine whitelistee → 204 avec ACAO refletee et credentials', async () => {
    const r = await request('OPTIONS', '/api/health/ping', {
      Origin: 'http://localhost:3000',
      ...PREFLIGHT_HEADERS,
    });
    expect(r.status).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(r.headers['access-control-allow-credentials']).toBe('true');
    expect(r.headers['access-control-allow-methods']).toBeTruthy();
    expect(r.body).toBe('');
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('[CORS]'));
  });

  test('GET d\'une origine whitelistee → reflétée, requete traitee', async () => {
    const r = await request('GET', '/api/health/ping', { Origin: 'http://localhost:3000' });
    expect(r.status).toBe(200);
    expect(r.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(r.headers['access-control-allow-credentials']).toBe('true');
  });

  test('requete sans Origin (Electron, curl, serveur a serveur) → acceptee', async () => {
    const r = await request('GET', '/api/health/ping');
    expect(r.status).toBe(200);
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('[CORS]'));
  });

  test('scheme Electron (app://, kheops2://, file://) hors hebergement → pre-vol 204', async () => {
    // KHEOPS_HOSTED n'est pas defini dans les tests : la regle locale s'applique.
    for (const origin of ['app://kheops', 'kheops2://app', 'file://']) {
      const r = await request('OPTIONS', '/api/health/ping', { Origin: origin, ...PREFLIGHT_HEADERS });
      expect(r.status).toBe(204);
      expect(r.headers['access-control-allow-origin']).toBe(origin);
    }
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
