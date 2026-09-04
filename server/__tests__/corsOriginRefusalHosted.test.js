// Tests cors-403 en mode heberge (KHEOPS_HOSTED=true, configuration Cloud Run) :
// les schemes Electron (app://, kheops2://, file://) ne sont plus acceptes et
// doivent recevoir le meme refus explicite 403 qu'une origine inconnue, sans
// journal console.error. La variable est fixee avant le chargement du module,
// car HOSTED est lu une seule fois a l'initialisation de server/index.js.

process.env.NODE_ENV = 'test';
process.env.KHEOPS_HOSTED = 'true';
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

afterAll(() => {
  delete process.env.KHEOPS_HOSTED;
});

test('scheme Electron en hebergement web → 403 explicite, sans en-tete CORS ni console.error', async () => {
  for (const origin of ['app://kheops', 'kheops2://app', 'file://']) {
    const r = await request('OPTIONS', '/api/health/ping', { Origin: origin, ...PREFLIGHT_HEADERS });
    expect(r.status).toBe(403);
    expect(JSON.parse(r.body)).toEqual({ message: 'Origine non autorisee.', error: 'CORS_ORIGIN_FORBIDDEN' });
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
  }
  expect(errorSpy).not.toHaveBeenCalled();
  expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[CORS] Origin refusee : app://kheops'));
});

test('origine inconnue en hebergement web → 403 sur OPTIONS et GET', async () => {
  const preflight = await request('OPTIONS', '/api/health/ping', { Origin: 'https://evil.example.com', ...PREFLIGHT_HEADERS });
  const get = await request('GET', '/api/health/ping', { Origin: 'https://evil.example.com' });
  expect(preflight.status).toBe(403);
  expect(get.status).toBe(403);
  expect(errorSpy).not.toHaveBeenCalled();
});

test('requete sans Origin en hebergement web → toujours acceptee', async () => {
  // En hebergement, la sonde de sante repond 503 tant que l'application n'est
  // pas demarree : seul compte ici le fait que CORS ne refuse pas la requete.
  const r = await request('GET', '/api/health/ping');
  expect(r.status).not.toBe(403);
  expect(() => JSON.parse(r.body)).not.toThrow();
  expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('[CORS]'));
});
