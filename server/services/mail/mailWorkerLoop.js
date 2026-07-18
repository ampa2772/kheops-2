const mailSync = require('./mailSyncService');
const mailSend = require('./mailSendService');
const mailSubscriptions = require('./mailSubscriptionService');

let timer = null;
let cyclePromise = null;
let cycleNumber = 0;

function integer(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

async function runOnce({ concurrency = integer(process.env.MAIL_WORKER_CONCURRENCY, 2, 1, 10) } = {}) {
  await Promise.all([
    mailSync.resetExpiredLeases(),
    mailSend.resetExpiredLeases(),
  ]);
  const results = await Promise.all(Array.from({ length: concurrency }, async () => {
    const sent = await mailSend.runNextOperation().catch((error) => ({ error: error?.code || error?.name || 'ERROR' }));
    const synced = await mailSync.runNextJob().catch((error) => ({ error: error?.code || error?.name || 'ERROR' }));
    return { sent, synced };
  }));
  cycleNumber += 1;
  if (cycleNumber % 12 === 1) {
    await Promise.all([
      mailSync.enqueueCatchups().catch(() => []),
      mailSubscriptions.renewDueSubscriptions().catch(() => []),
    ]);
  }
  return results;
}

function start({ pollMs = integer(process.env.MAIL_WORKER_POLL_MS, 5000, 500, 60000) } = {}) {
  if (timer) return status();
  const tick = () => {
    if (cyclePromise) return;
    cyclePromise = runOnce()
      .catch((error) => console.error('[Mail worker]', error?.code || error?.name || 'ERROR'))
      .finally(() => { cyclePromise = null; });
  };
  tick();
  timer = setInterval(tick, pollMs);
  timer.unref?.();
  return status();
}

async function stop({ drainMs = 7000 } = {}) {
  if (timer) clearInterval(timer);
  timer = null;
  const running = cyclePromise;
  if (running) {
    await Promise.race([
      running,
      new Promise((resolve) => {
        const timeout = setTimeout(resolve, drainMs);
        timeout.unref?.();
      }),
    ]);
  }
  return status();
}

function status() {
  return { running: Boolean(timer), cycleRunning: Boolean(cyclePromise), cycleNumber };
}

module.exports = { runOnce, start, stop, status };
