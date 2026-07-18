const fs = require('fs');
const os = require('os');
const path = require('path');

function makeWatcherRegistry() {
  const watchers = [];
  const chokidar = {
    watch: jest.fn(() => {
      const watcher = {
        handlers: {},
        on: jest.fn(function on(event, handler) {
          this.handlers[event] = handler;
          return this;
        }),
        close: jest.fn(),
      };
      watchers.push(watcher);
      return watcher;
    }),
  };
  return { chokidar, watchers };
}

function loadMirror(backend) {
  jest.resetModules();
  const { chokidar, watchers } = makeWatcherRegistry();
  const companionLib = path.resolve(__dirname, '..', '..', '..', 'electron-companion', 'lib');
  const chokidarPath = require.resolve('chokidar', { paths: [companionLib] });
  jest.doMock(chokidarPath, () => chokidar);
  jest.doMock('../../../electron-companion/lib/backendClient', () => backend);
  jest.doMock('../../../electron-companion/lib/config', () => ({ UPLOAD_DEBOUNCE_MS: 5 }));
  const mirror = require('../../../electron-companion/lib/mirror');
  loadedMirrors.push(mirror);
  return { mirror, watchers };
}

function manifest(docId, name = 'Document.docx', label = 'Dossier A') {
  return {
    mirrorEnabled: true,
    dossiers: [{
      dossierId: 'matter-1',
      label,
      documents: [{ docId, name, subfolder: null }],
    }],
  };
}

function writeLocalDocument(root, label, name, content = 'local') {
  const filePath = path.join(root, 'Kheops2', 'Dossiers', label, name);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

const roots = [];
const loadedMirrors = [];

afterEach(() => {
  for (const mirror of loadedMirrors.splice(0)) {
    try { mirror.stopAll(); } catch (_) {}
  }
  jest.useRealTimers();
  jest.clearAllMocks();
  for (const root of roots.splice(0)) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  }
});

test('index v1 : HEAD recupere la base sans ecraser le local, puis versionId est persiste', async () => {
  jest.useFakeTimers();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kheops-mirror-v1-'));
  roots.push(root);
  const localFile = writeLocalDocument(root, 'Dossier A', 'Document.docx', 'contenu-local-a-garder');
  fs.writeFileSync(path.join(root, '.kheops-mirror.json'), JSON.stringify({
    version: 1,
    files: { docA: path.join('Dossier A', 'Document.docx') },
  }));

  const backend = {
    getMirrorManifest: jest.fn().mockResolvedValue(manifest('docA')),
    getDocumentBaseVersion: jest.fn().mockResolvedValue('server-v7'),
    downloadDocx: jest.fn(),
    uploadDocx: jest.fn().mockResolvedValue({ versionId: 'server-v8' }),
  };
  const { mirror, watchers } = loadMirror(backend);

  const report = await mirror.sync({
    backendBaseUrl: 'https://backend.example',
    token: 'jwt-kheops',
    rootPath: root,
    electronClient: true,
  });

  expect(report.existing).toBe(1);
  expect(fs.readFileSync(localFile, 'utf8')).toBe('contenu-local-a-garder');
  expect(backend.downloadDocx).not.toHaveBeenCalled();
  expect(backend.getDocumentBaseVersion).toHaveBeenCalledWith(
    'https://backend.example', 'jwt-kheops', 'docA',
  );
  expect(backend.getMirrorManifest).toHaveBeenCalledWith(
    'https://backend.example', 'jwt-kheops', { electronClient: true },
  );

  watchers.at(-1).handlers.change(localFile);
  await jest.advanceTimersByTimeAsync(10);

  expect(backend.uploadDocx).toHaveBeenCalledWith(
    'https://backend.example',
    'jwt-kheops',
    'docA',
    localFile,
    { baseVersionId: 'server-v7' },
  );
  const index = JSON.parse(fs.readFileSync(path.join(root, '.kheops-mirror.json'), 'utf8'));
  expect(index.version).toBe(2);
  expect(index.baseVersions.docA).toBe('server-v8');
  mirror.stopAll();
});

test('un upload du compte A termine apres passage au compte B ne modifie jamais index B', async () => {
  jest.useFakeTimers();
  const rootA = fs.mkdtempSync(path.join(os.tmpdir(), 'kheops-mirror-A-'));
  const rootB = fs.mkdtempSync(path.join(os.tmpdir(), 'kheops-mirror-B-'));
  roots.push(rootA, rootB);

  let activeManifest = manifest('docA', 'A.docx', 'Dossier A');
  let resolveUploadA;
  const backend = {
    getMirrorManifest: jest.fn().mockImplementation(async () => activeManifest),
    getDocumentBaseVersion: jest.fn(),
    downloadDocx: jest.fn().mockImplementation(async (_url, _token, docId, destination) => {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, docId);
      return { filePath: destination, baseVersionId: `${docId}-v1` };
    }),
    uploadDocx: jest.fn().mockImplementation(() => new Promise((resolve) => {
      resolveUploadA = resolve;
    })),
  };
  const { mirror, watchers } = loadMirror(backend);

  await mirror.sync({
    backendBaseUrl: 'https://backend.example', token: 'jwt-A', rootPath: rootA,
    electronClient: true,
  });
  const fileA = path.join(rootA, 'Kheops2', 'Dossiers', 'Dossier A', 'A.docx');
  watchers.at(-1).handlers.change(fileA);
  await jest.advanceTimersByTimeAsync(10);
  expect(backend.uploadDocx).toHaveBeenCalledTimes(1);

  activeManifest = manifest('docB', 'B.docx', 'Dossier B');
  await mirror.sync({
    backendBaseUrl: 'https://backend.example', token: 'jwt-B', rootPath: rootB,
    electronClient: true,
  });

  resolveUploadA({ versionId: 'docA-v2' });
  await Promise.resolve();
  await Promise.resolve();

  const indexB = JSON.parse(fs.readFileSync(path.join(rootB, '.kheops-mirror.json'), 'utf8'));
  expect(indexB.files).toEqual({ docB: path.join('Dossier B', 'B.docx') });
  expect(indexB.baseVersions).toEqual({ docB: 'docB-v1' });
  expect(indexB.baseVersions.docA).toBeUndefined();
  expect(mirror.getStatus()).toEqual(expect.objectContaining({ root: path.resolve(rootB), files: 1 }));
  mirror.stopAll();
});

test('le miroir tourne son jeton avant 8h et les uploads utilisent aussitot le nouveau', async () => {
  jest.useFakeTimers({ now: new Date('2026-07-10T00:00:00.000Z') });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kheops-mirror-rotation-'));
  roots.push(root);
  const backend = {
    getMirrorManifest: jest.fn().mockResolvedValue(manifest('docRotation')),
    getDocumentBaseVersion: jest.fn(),
    downloadDocx: jest.fn().mockImplementation(async (_url, _token, docId, destination) => {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, docId);
      return { filePath: destination, baseVersionId: 'server-v1' };
    }),
    uploadDocx: jest.fn().mockResolvedValue({ versionId: 'server-v2' }),
    refreshCompanionSession: jest.fn().mockResolvedValue({
      companionToken: 'jeton-miroir-v2',
      expiresAt: Date.now() + (8 * 60 * 60 * 1000),
      sessionAbsoluteExpiresAt: Date.now() + (14 * 24 * 60 * 60 * 1000),
      backendBaseUrl: 'https://backend.example',
      userId: 'user-1',
    }),
    revokeCompanionSession: jest.fn().mockResolvedValue({ revoked: true }),
  };
  const { mirror, watchers } = loadMirror(backend);

  await mirror.sync({
    backendBaseUrl: 'https://backend.example',
    token: 'jeton-miroir-v1',
    tokenExpiresAt: Date.now() + (8 * 60 * 60 * 1000),
    sessionAbsoluteExpiresAt: Date.now() + (14 * 24 * 60 * 60 * 1000),
    userId: 'user-1',
    rootPath: root,
  });

  await jest.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
  expect(backend.refreshCompanionSession).toHaveBeenCalledWith(
    'https://backend.example',
    'jeton-miroir-v1',
    { purpose: 'mirror' },
  );

  const localFile = path.join(root, 'Kheops2', 'Dossiers', 'Dossier A', 'Document.docx');
  watchers.at(-1).handlers.change(localFile);
  await jest.advanceTimersByTimeAsync(10);
  expect(backend.uploadDocx).toHaveBeenCalledWith(
    'https://backend.example',
    'jeton-miroir-v2',
    'docRotation',
    localFile,
    { baseVersionId: 'server-v1' },
  );
});

test('un nouveau jeton miroir revoque l ancienne chaine et un pull identique ne repousse pas la rotation', async () => {
  jest.useFakeTimers({ now: new Date('2026-07-10T00:00:00.000Z') });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kheops-mirror-replace-'));
  roots.push(root);
  const backend = {
    getMirrorManifest: jest.fn().mockResolvedValue({ mirrorEnabled: true, dossiers: [] }),
    getDocumentBaseVersion: jest.fn(),
    downloadDocx: jest.fn(),
    uploadDocx: jest.fn(),
    refreshCompanionSession: jest.fn().mockResolvedValue({
      companionToken: 'jeton-tourne',
      expiresAt: Date.now() + (8 * 60 * 60 * 1000),
      backendBaseUrl: 'https://backend.example',
      userId: 'user-1',
    }),
    revokeCompanionSession: jest.fn().mockResolvedValue({ revoked: true }),
  };
  const { mirror } = loadMirror(backend);
  const firstExpiry = Date.now() + (8 * 60 * 60 * 1000);

  await mirror.sync({
    backendBaseUrl: 'https://backend.example', token: 'jeton-a',
    tokenExpiresAt: firstExpiry, userId: 'user-1', rootPath: root,
  });
  await jest.advanceTimersByTimeAsync(5 * 60 * 60 * 1000);
  await mirror.sync({
    backendBaseUrl: 'https://backend.example', token: 'jeton-a',
    tokenExpiresAt: firstExpiry, userId: 'user-1', rootPath: root,
  });
  await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
  expect(backend.refreshCompanionSession).toHaveBeenCalledTimes(1);

  await mirror.sync({
    backendBaseUrl: 'https://backend.example', token: 'jeton-b',
    tokenExpiresAt: Date.now() + (8 * 60 * 60 * 1000), userId: 'user-1', rootPath: root,
  });
  expect(backend.revokeCompanionSession).toHaveBeenCalledWith(
    'https://backend.example',
    'jeton-tourne',
  );
});
