const mockChokidarWatchers = [];

jest.mock('../../../electron-companion/node_modules/chokidar', () => ({
  watch: jest.fn(() => {
    const watcher = {
      on: jest.fn().mockReturnThis(),
      close: jest.fn(),
    };
    mockChokidarWatchers.push(watcher);
    return watcher;
  }),
}));

jest.mock('../../../electron-companion/lib/backendClient', () => ({
  uploadDocx: jest.fn(),
}));

const backendClient = require('../../../electron-companion/lib/backendClient');
const saveWatcher = require('../../../electron-companion/lib/saveWatcher');

describe('compagnon saveWatcher — chaîne baseVersionId', () => {
  afterEach(() => {
    saveWatcher.stopAll();
    jest.clearAllMocks();
    mockChokidarWatchers.length = 0;
  });

  test('réutilise la version renvoyée par le serveur comme base du prochain envoi', async () => {
    backendClient.uploadDocx
      .mockResolvedValueOnce({ ok: true, versionId: 'v2' })
      .mockResolvedValueOnce({ ok: true, versionId: 'v3' });
    const onVersion = jest.fn();
    const watcher = saveWatcher.watch({
      docId: 'doc-1',
      localFilePath: 'C:/tmp/doc.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'token',
      baseVersionId: 'v1',
      onVersion,
      onState: jest.fn(),
    });

    await watcher.forceUpload();
    await watcher.forceUpload();

    expect(backendClient.uploadDocx.mock.calls[0][4]).toEqual({ baseVersionId: 'v1' });
    expect(backendClient.uploadDocx.mock.calls[1][4]).toEqual({ baseVersionId: 'v2' });
    expect(onVersion).toHaveBeenNthCalledWith(1, 'v2');
    expect(onVersion).toHaveBeenNthCalledWith(2, 'v3');
  });

  test('lit le jeton courant au moment de chaque envoi apres une rotation', async () => {
    backendClient.uploadDocx.mockResolvedValue({ ok: true, versionId: 'v2' });
    let currentToken = 'token-v1';
    const watcher = saveWatcher.watch({
      docId: 'doc-token-rotation',
      localFilePath: 'C:/tmp/doc.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'ancien-token-capture',
      getToken: () => currentToken,
      baseVersionId: 'v1',
      onState: jest.fn(),
    });

    await watcher.forceUpload();
    currentToken = 'token-v2';
    await watcher.forceUpload();

    expect(backendClient.uploadDocx.mock.calls[0][1]).toBe('token-v1');
    expect(backendClient.uploadDocx.mock.calls[1][1]).toBe('token-v2');
  });

  test('signale le conflit et bloque les envois suivants de la session', async () => {
    const conflict = new Error('Les deux versions ont été conservées.');
    conflict.code = 'DOCUMENT_VERSION_CONFLICT';
    conflict.details = {
      savedConflictVersionId: 'conflict-v3',
      currentVersionId: 'current-v2',
      baseVersionId: 'base-v1',
    };
    backendClient.uploadDocx.mockRejectedValue(conflict);
    const onState = jest.fn();
    const watcher = saveWatcher.watch({
      docId: 'doc-2',
      localFilePath: 'C:/tmp/doc.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'token',
      baseVersionId: 'base-v1',
      onState,
    });

    await watcher.forceUpload();
    await watcher.forceUpload();

    expect(backendClient.uploadDocx).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenCalledWith('conflict', expect.objectContaining({
      conflict: expect.objectContaining({
        savedConflictVersionId: 'conflict-v3',
        currentVersionId: 'current-v2',
      }),
    }));
  });

  test('ignore un evenement chokidar deja en file apres l arret du watcher', async () => {
    jest.useFakeTimers();
    backendClient.uploadDocx.mockResolvedValue({ ok: true, versionId: 'v2' });
    saveWatcher.watch({
      docId: 'doc-stop-race',
      localFilePath: 'C:/tmp/doc.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'token',
      baseVersionId: 'v1',
      onState: jest.fn(),
    });
    const watcher = mockChokidarWatchers.at(-1);
    const queuedChange = watcher.on.mock.calls.find(([eventName]) => eventName === 'change')[1];

    await saveWatcher.stop('doc-stop-race');
    queuedChange();
    await jest.advanceTimersByTimeAsync(5000);

    expect(backendClient.uploadDocx).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
