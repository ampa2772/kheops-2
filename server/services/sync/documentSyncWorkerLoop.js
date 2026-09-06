const os = require('os');
const DocumentSyncJournal = require('../../models/Documents/DocumentSyncJournal');
const documentSyncWorker = require('./documentSyncWorker');

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function makeDocumentSyncWorkerLoop({
  Journal = DocumentSyncJournal,
  worker = documentSyncWorker,
  clock = () => new Date(),
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
  logger = console,
  projection = null,
} = {}) {
  const state = {
    running: false,
    timer: null,
    inFlight: new Set(),
    options: null,
  };

  function readyQuery(now) {
    return {
      $or: [
        { status: 'queued' },
        { status: 'retry_wait', nextRetryAt: { $lte: now } },
        { status: 'running', 'lease.expiresAt': { $lte: now } },
      ],
    };
  }

  async function runOnce(options = state.options || {}) {
    const concurrency = clamp(options.concurrency, 1, 16, 2);
    const capacity = Math.max(0, concurrency - state.inFlight.size);
    if (!capacity) return [];
    if(projection && !state.inFlight.has('history-projection')) {
      state.inFlight.add('history-projection');
      try { await projection.runOnce(); } finally { state.inFlight.delete('history-projection'); }
    }
    const candidates = await Journal.find(readyQuery(clock()))
      .sort({ createdAt: 1, _id: 1 })
      .limit(capacity)
      .select('tenantId operationId')
      .lean();
    const started = candidates.map((candidate) => {
      const key = `${candidate.tenantId}:${candidate.operationId}`;
      if (state.inFlight.has(key)) return Promise.resolve({ skipped: true, operationId: candidate.operationId });
      state.inFlight.add(key);
      return worker.execute({
        tenantId: candidate.tenantId,
        operationId: candidate.operationId,
        workerId: options.workerId,
      }).catch((error) => {
        logger.error?.('[documentSyncWorkerLoop]', candidate.operationId, error?.message || error);
        return { failed: true, operationId: candidate.operationId, error };
      }).finally(() => state.inFlight.delete(key));
    });
    return Promise.all(started);
  }

  function arm(delay) {
    if (!state.running) return;
    state.timer = schedule(async () => {
      state.timer = null;
      try { await runOnce(state.options); } catch (error) {
        logger.error?.('[documentSyncWorkerLoop] lecture de la file impossible:', error?.message || error);
      }
      arm(state.options.pollMs);
    }, delay);
    if (typeof state.timer?.unref === 'function') state.timer.unref();
  }

  function start(options = {}) {
    if (state.running) return { started: false, reason: 'already_running', ...status() };
    state.options = {
      concurrency: clamp(options.concurrency ?? process.env.DOCUMENT_SYNC_CONCURRENCY, 1, 16, 2),
      pollMs: clamp(options.pollMs ?? process.env.DOCUMENT_SYNC_POLL_MS, 250, 60000, 2000),
      workerId: String(options.workerId || process.env.DOCUMENT_SYNC_WORKER_ID || `${os.hostname()}-${process.pid}`).slice(0, 180),
    };
    state.running = true;
    arm(0);
    return { started: true, ...status() };
  }

  async function stop({ drainMs = 30000 } = {}) {
    state.running = false;
    if (state.timer) cancelSchedule(state.timer);
    state.timer = null;
    const pending = [...state.inFlight].length;
    if (pending) {
      const deadline = new Promise((resolve) => schedule(resolve, clamp(drainMs, 0, 60000, 30000)));
      while (state.inFlight.size) {
        // Les promesses réelles sont attendues dans runOnce ; ici on laisse un
        // court tour d'événement puis on réévalue, avec une borne globale.
        const drained = new Promise((resolve) => schedule(resolve, 25));
        const winner = await Promise.race([drained.then(() => 'poll'), deadline.then(() => 'deadline')]);
        if (winner === 'deadline') break;
      }
    }
    return { stopped: true, drained: state.inFlight.size === 0, pending: state.inFlight.size };
  }

  function status() {
    return {
      running: state.running,
      inFlight: state.inFlight.size,
      concurrency: state.options?.concurrency || null,
      pollMs: state.options?.pollMs || null,
      workerId: state.options?.workerId || null,
    };
  }

  return { readyQuery, runOnce, start, status, stop };
}

const singleton = makeDocumentSyncWorkerLoop({projection:require('./documentHistoryProjection')});

module.exports = {
  makeDocumentSyncWorkerLoop,
  runOnce: (...args) => singleton.runOnce(...args),
  start: (...args) => singleton.start(...args),
  status: (...args) => singleton.status(...args),
  stop: (...args) => singleton.stop(...args),
};
