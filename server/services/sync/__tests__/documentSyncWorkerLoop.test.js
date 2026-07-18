const { makeDocumentSyncWorkerLoop } = require('../documentSyncWorkerLoop');

function candidates(value) {
  return {
    sort: jest.fn(() => ({
      limit: jest.fn(() => ({
        select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(value) })),
      })),
    })),
  };
}

describe('documentSyncWorkerLoop', () => {
  test('réclame au plus la concurrence configurée et inclut retries/baux expirés', async () => {
    const Journal = { find: jest.fn(() => candidates([
      { tenantId: 'T1', operationId: 'O1' },
      { tenantId: 'T2', operationId: 'O2' },
    ])) };
    const worker = { execute: jest.fn().mockResolvedValue({ succeeded: true }) };
    const loop = makeDocumentSyncWorkerLoop({ Journal, worker, clock: () => new Date('2026-07-10T10:00:00Z'), logger: {} });
    const results = await loop.runOnce({ concurrency: 2, workerId: 'worker-loop' });
    expect(results).toHaveLength(2);
    expect(worker.execute).toHaveBeenCalledTimes(2);
    expect(Journal.find).toHaveBeenCalledWith({ $or: [
      { status: 'queued' },
      { status: 'retry_wait', nextRetryAt: { $lte: new Date('2026-07-10T10:00:00Z') } },
      { status: 'running', 'lease.expiresAt': { $lte: new Date('2026-07-10T10:00:00Z') } },
    ] });
  });

  test('start/stop sont intégrables et n’arment qu’une seule boucle', async () => {
    const scheduled = [];
    const schedule = jest.fn((callback, delay) => {
      const handle = { callback, delay, unref: jest.fn() };
      scheduled.push(handle);
      return handle;
    });
    const cancelSchedule = jest.fn();
    const loop = makeDocumentSyncWorkerLoop({
      Journal: { find: jest.fn(() => candidates([])) },
      worker: { execute: jest.fn() }, schedule, cancelSchedule, logger: {},
    });
    expect(loop.start({ concurrency: 3, pollMs: 1000, workerId: 'W' })).toMatchObject({ started: true, running: true });
    expect(loop.start()).toMatchObject({ started: false, reason: 'already_running' });
    expect(scheduled[0].delay).toBe(0);
    await expect(loop.stop()).resolves.toMatchObject({ stopped: true, drained: true });
    expect(cancelSchedule).toHaveBeenCalledWith(scheduled[0]);
  });
});
