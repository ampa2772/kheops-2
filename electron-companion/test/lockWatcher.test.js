const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const fakeWatchers = [];
let watcherCreationMustFail = false;
const releaseCalls = [];

function createFakeWatcher() {
  const handlers = new Map();
  const watcher = {
    closed: false,
    on(eventName, handler) {
      handlers.set(eventName, handler);
      return this;
    },
    emit(eventName, ...args) {
      const handler = handlers.get(eventName);
      if (handler) handler(...args);
    },
    close() {
      this.closed = true;
      return Promise.resolve();
    },
  };
  fakeWatchers.push(watcher);
  return watcher;
}

const chokidarPath = require.resolve('chokidar');
require.cache[chokidarPath] = {
  id: chokidarPath,
  filename: chokidarPath,
  loaded: true,
  exports: {
    watch() {
      if (watcherCreationMustFail) throw new Error('watcher indisponible');
      return createFakeWatcher();
    },
  },
};

const backendClientPath = require.resolve('../lib/backendClient');
require.cache[backendClientPath] = {
  id: backendClientPath,
  filename: backendClientPath,
  loaded: true,
  exports: {
    releaseLock(backendBaseUrl, token, docId) {
      releaseCalls.push({ backendBaseUrl, token, docId });
      return Promise.resolve({ released: true });
    },
  },
};

const lockWatcher = require('../lib/lockWatcher');

function makeDocument(testName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kheops-lock-${testName}-`));
  const localFilePath = path.join(dir, 'Document.docx');
  fs.writeFileSync(localFilePath, 'document');
  return {
    dir,
    localFilePath,
    officeLockPath: path.join(dir, '~$Document.docx'),
  };
}

async function flushPromises() {
  // releaseLock passe volontairement par plusieurs maillons Promise
  // (appel, catch, finally). Les vider sans horloge reelle garde le test 100 %
  // deterministe avec les fake timers.
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function resetFakes() {
  lockWatcher.stopAll();
  fakeWatchers.length = 0;
  releaseCalls.length = 0;
  watcherCreationMustFail = false;
}

test('Word reste ouvert au-dela de 8h : aucune finalisation avant la vraie fermeture', { concurrency: false }, async (t) => {
  resetFakes();
  t.mock.timers.enable(['setTimeout', 'setInterval']);
  const document = makeDocument('longue');
  const releasedEvents = [];
  let currentToken = 'token-test';
  t.after(() => {
    lockWatcher.stopAll();
    fs.rmSync(document.dir, { recursive: true, force: true });
  });

  lockWatcher.track({
    docId: 'doc-longue-session',
    localFilePath: document.localFilePath,
    backendBaseUrl: 'https://backend.test',
    token: 'token-test',
    getToken: () => currentToken,
    onReleased: (event) => releasedEvents.push(event),
  });

  assert.equal(fakeWatchers.length, 1);
  fs.writeFileSync(document.officeLockPath, 'office-lock');
  fakeWatchers[0].emit('add', document.officeLockPath);

  // Huit heures, puis plusieurs revalidations : le lock Office est toujours
  // present, donc le TTL ne doit ni liberer le verrou ni finaliser la session.
  t.mock.timers.tick(
    lockWatcher.ABSOLUTE_TTL_MS + (3 * lockWatcher.TTL_REVALIDATION_INTERVAL_MS),
  );
  await flushPromises();

  assert.equal(releaseCalls.length, 0);
  assert.equal(releasedEvents.length, 0);
  assert.deepEqual(lockWatcher._getStateForTesting().docIds, ['doc-longue-session']);

  // La suppression de ~$ est le vrai signal de fermeture Word.
  currentToken = 'token-renouvele';
  fs.rmSync(document.officeLockPath);
  fakeWatchers[0].emit('unlink', document.officeLockPath);
  await flushPromises();

  assert.equal(releaseCalls.length, 1);
  assert.equal(releaseCalls[0].token, 'token-renouvele');
  assert.deepEqual(releasedEvents, [{ docId: 'doc-longue-session', reason: 'office-close' }]);
  assert.equal(fakeWatchers[0].closed, true);
  assert.deepEqual(lockWatcher._getStateForTesting().docIds, []);

  // Aucun timer de revalidation orphelin ne doit rappeler la finalisation.
  t.mock.timers.tick(lockWatcher.ABSOLUTE_TTL_MS * 2);
  await flushPromises();
  assert.equal(releaseCalls.length, 1);
  assert.equal(releasedEvents.length, 1);
});

test('fallback sans chokidar : le TTL respecte un fichier encore verrouille puis libere apres fermeture', { concurrency: false }, async (t) => {
  resetFakes();
  t.mock.timers.enable(['setTimeout', 'setInterval']);
  watcherCreationMustFail = true;
  const document = makeDocument('fallback');
  const releasedEvents = [];
  const realOpenSync = fs.openSync;
  let wordStillOwnsFile = true;

  fs.openSync = (filePath, ...args) => {
    if (path.resolve(filePath) === path.resolve(document.localFilePath) && wordStillOwnsFile) {
      const error = new Error('Le fichier est utilise par Word');
      error.code = 'EBUSY';
      throw error;
    }
    return realOpenSync(filePath, ...args);
  };

  t.after(() => {
    fs.openSync = realOpenSync;
    lockWatcher.stopAll();
    fs.rmSync(document.dir, { recursive: true, force: true });
  });

  lockWatcher.track({
    docId: 'doc-fallback',
    localFilePath: document.localFilePath,
    backendBaseUrl: 'https://backend.test',
    token: 'token-test',
    onReleased: (event) => releasedEvents.push(event),
  });

  // Le watcher est indisponible : apres 30s, la sonde fallback prend le relais.
  // Meme au-dela de 8h, EBUSY reste une preuve que Word est encore ouvert.
  t.mock.timers.tick(
    lockWatcher.ABSOLUTE_TTL_MS + (2 * lockWatcher.TTL_REVALIDATION_INTERVAL_MS),
  );
  await flushPromises();
  assert.equal(releaseCalls.length, 0);
  assert.equal(releasedEvents.length, 0);
  assert.deepEqual(lockWatcher._getStateForTesting().docIds, ['doc-fallback']);

  wordStillOwnsFile = false;
  t.mock.timers.tick(lockWatcher.FALLBACK_PROBE_INTERVAL_MS);
  await flushPromises();

  assert.equal(releaseCalls.length, 1);
  assert.equal(releasedEvents.length, 1);
  assert.equal(releasedEvents[0].docId, 'doc-fallback');
  assert.match(releasedEvents[0].reason, /^fallback-probe/);
  assert.deepEqual(lockWatcher._getStateForTesting().docIds, []);

  t.mock.timers.tick(lockWatcher.ABSOLUTE_TTL_MS);
  await flushPromises();
  assert.equal(releaseCalls.length, 1);
});
