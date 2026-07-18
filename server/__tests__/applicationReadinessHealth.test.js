process.env.NODE_ENV = 'test';

const http = require('http');
const readiness = require('../services/applicationReadiness');
const { app } = require('../index');

function get(path) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const req = http.request({
        method: 'GET',
        hostname: '127.0.0.1',
        port: server.address().port,
        path,
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => server.close(() => resolve({
          status: res.statusCode,
          body: JSON.parse(body),
        })));
      });
      req.on('error', (error) => server.close(() => reject(error)));
      req.end();
    });
  });
}

const originalAiWorker = process.env.AI_TASK_WORKER_ENABLED;
const originalSyncWorker = process.env.DOCUMENT_SYNC_WORKER_ENABLED;
const originalMailWorker = process.env.MAIL_WORKER_ENABLED;

beforeEach(() => {
  process.env.AI_TASK_WORKER_ENABLED = 'false';
  process.env.DOCUMENT_SYNC_WORKER_ENABLED = 'false';
  process.env.MAIL_WORKER_ENABLED = 'false';
});

afterEach(() => {
  readiness.resetForTests({});
});

afterAll(() => {
  if (originalAiWorker === undefined) delete process.env.AI_TASK_WORKER_ENABLED;
  else process.env.AI_TASK_WORKER_ENABLED = originalAiWorker;
  if (originalSyncWorker === undefined) delete process.env.DOCUMENT_SYNC_WORKER_ENABLED;
  else process.env.DOCUMENT_SYNC_WORKER_ENABLED = originalSyncWorker;
  if (originalMailWorker === undefined) delete process.env.MAIL_WORKER_ENABLED;
  else process.env.MAIL_WORKER_ENABLED = originalMailWorker;
});

test('/api/health/ping renvoie seulement des booleens de readiness', async () => {
  const env = { KHEOPS_HOSTED: 'true', GCS_BUCKET: 'secret-name' };
  readiness.beginStartup(env);
  await readiness.checkHostedGcs({
    env,
    storageFactory: () => ({
      kind: 'gcs',
      checkReadiness: jest.fn().mockResolvedValue({ metadata: true, signing: true }),
    }),
    logger: { log: jest.fn(), error: jest.fn() },
  });
  readiness.markStartupReady();

  const response = await get('/api/health/ping');
  expect(response.status).toBe(200);
  expect(response.body.ok).toBe(true);
  expect(response.body.ready).toEqual({
    build: true,
    startup: true,
    gcs: true,
    aiWorker: true,
    documentSyncWorker: true,
    mailWorker: true,
  });
  expect(JSON.stringify(response.body)).not.toContain('secret-name');
  expect(JSON.stringify(response.body)).not.toContain('https://');
});

test('/api/health/ping renvoie 503 si GCS n\'est pas pret', async () => {
  const env = { KHEOPS_HOSTED: 'true', GCS_BUCKET: 'secret-name' };
  readiness.beginStartup(env);
  await readiness.checkHostedGcs({
    env,
    storageFactory: () => ({
      kind: 'gcs',
      checkReadiness: jest.fn().mockRejectedValue(Object.assign(new Error('secret detail'), { code: 403 })),
    }),
    logger: { log: jest.fn(), error: jest.fn() },
  });
  readiness.markStartupReady();

  const response = await get('/api/health/ping');
  expect(response.status).toBe(503);
  expect(response.body.ok).toBe(false);
  expect(response.body.ready.gcs).toBe(false);
  expect(JSON.stringify(response.body)).not.toContain('secret detail');
});

test('/api/health/ping signale les workers requis qui ne tournent pas', async () => {
  process.env.AI_TASK_WORKER_ENABLED = 'true';
  process.env.DOCUMENT_SYNC_WORKER_ENABLED = 'true';
  readiness.resetForTests({});

  const response = await get('/api/health/ping');
  expect(response.status).toBe(503);
  expect(response.body.ready).toEqual({
    build: true,
    startup: true,
    gcs: true,
    aiWorker: false,
    documentSyncWorker: false,
    mailWorker: true,
  });
});

test('/api/health/ping signale aussi le worker mail requis', async () => {
  process.env.MAIL_WORKER_ENABLED = 'true';
  readiness.resetForTests({});
  const response = await get('/api/health/ping');
  expect(response.status).toBe(503);
  expect(response.body.ready.mailWorker).toBe(false);
});
