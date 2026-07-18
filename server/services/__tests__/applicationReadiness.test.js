const readiness = require('../applicationReadiness');

const silentLogger = { log: jest.fn(), error: jest.fn() };

afterEach(() => {
  readiness.resetForTests({});
  jest.clearAllMocks();
});

describe('applicationReadiness', () => {
  test('hors hebergement, GCS et les workers desactives ne bloquent pas', async () => {
    readiness.beginStartup({});
    await expect(readiness.checkHostedGcs({ env: {}, logger: silentLogger })).resolves.toBe(true);
    readiness.markStartupReady();

    expect(readiness.snapshot()).toEqual({
      ok: true,
      ready: {
        build: true,
        startup: true,
        gcs: true,
        aiWorker: true,
        documentSyncWorker: true,
        mailWorker: true,
      },
    });
  });

  test('en hebergement, metadata et signature GCS sont toutes deux requises', async () => {
    const env = { KHEOPS_HOSTED: 'true', GCS_BUCKET: 'private-bucket' };
    const checkReadiness = jest.fn().mockResolvedValue({ metadata: true, signing: true });
    readiness.beginStartup(env);

    await expect(readiness.checkHostedGcs({
      env,
      storageFactory: () => ({ kind: 'gcs', checkReadiness }),
      logger: silentLogger,
    })).resolves.toBe(true);
    readiness.markStartupReady();

    expect(checkReadiness).toHaveBeenCalledTimes(1);
    expect(readiness.snapshot({
      aiWorkerRequired: true,
      aiWorkerRunning: true,
      syncWorkerRequired: true,
      syncWorkerRunning: true,
    }).ok).toBe(true);
  });

  test('un echec GCS donne un etat non pret sans exposer le detail', async () => {
    const env = { KHEOPS_HOSTED: 'true', GCS_BUCKET: 'private-bucket' };
    readiness.beginStartup(env);
    await expect(readiness.checkHostedGcs({
      env,
      storageFactory: () => ({
        kind: 'gcs',
        checkReadiness: jest.fn().mockRejectedValue(new Error('credential tres sensible')),
      }),
      logger: silentLogger,
    })).resolves.toBe(false);
    readiness.markStartupReady();

    expect(readiness.snapshot()).toEqual({
      ok: false,
      ready: {
        build: true,
        startup: true,
        gcs: false,
        aiWorker: true,
        documentSyncWorker: true,
        mailWorker: true,
      },
    });
    expect(silentLogger.error.mock.calls.flat().join(' ')).not.toContain('credential tres sensible');
  });

  test('un worker requis mais non demarre rend le service non pret', () => {
    readiness.resetForTests({});
    const result = readiness.snapshot({
      aiWorkerRequired: true,
      aiWorkerRunning: false,
      syncWorkerRequired: true,
      syncWorkerRunning: true,
    });

    expect(result.ok).toBe(false);
    expect(result.ready.aiWorker).toBe(false);
    expect(result.ready.documentSyncWorker).toBe(true);
  });

  test('le worker mail durable requis participe à la readiness', () => {
    const stopped = readiness.snapshot({ mailWorkerRequired: true, mailWorkerRunning: false });
    const running = readiness.snapshot({ mailWorkerRequired: true, mailWorkerRunning: true });
    expect(stopped.ok).toBe(false);
    expect(stopped.ready.mailWorker).toBe(false);
    expect(running.ready.mailWorker).toBe(true);
  });

  test('un manifeste incohérent bloque uniquement une image où il est obligatoire', () => {
    expect(readiness.snapshot({ buildRequired: true, buildReady: false }).ready.build).toBe(false);
    expect(readiness.snapshot({ buildRequired: true, buildReady: true }).ready.build).toBe(true);
    expect(readiness.snapshot({ buildRequired: false, buildReady: false }).ready.build).toBe(true);
  });
});
