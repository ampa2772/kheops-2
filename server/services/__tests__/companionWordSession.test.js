const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../../../electron-companion/node_modules/electron', () => ({
  app: { getPath: jest.fn(() => 'C:/tmp') },
  shell: {
    openPath: jest.fn().mockResolvedValue(''),
    showItemInFolder: jest.fn(),
  },
  Notification: Object.assign(
    jest.fn().mockImplementation(function MockNotification(options) {
      this.options = options;
      this.on = jest.fn();
      this.show = jest.fn();
    }),
    { isSupported: jest.fn(() => true) },
  ),
}));

jest.mock('../../../electron-companion/lib/backendClient', () => ({
  downloadDocx: jest.fn(),
  refreshCompanionSession: jest.fn(),
  revokeCompanionSession: jest.fn().mockResolvedValue({ revoked: true }),
  heartbeat: jest.fn().mockResolvedValue({}),
  releaseLock: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../../electron-companion/lib/saveWatcher', () => ({
  watch: jest.fn(),
  stop: jest.fn().mockResolvedValue(),
  finalUpload: jest.fn().mockResolvedValue(true),
  stopAll: jest.fn(),
}));

jest.mock('../../../electron-companion/lib/lockWatcher', () => ({
  track: jest.fn(),
  stop: jest.fn(),
  stopAll: jest.fn(),
}));

const backendClient = require('../../../electron-companion/lib/backendClient');
const saveWatcher = require('../../../electron-companion/lib/saveWatcher');
const config = require('../../../electron-companion/lib/config');
const recoveryStore = require('../../../electron-companion/lib/recoveryStore');
const wordSession = require('../../../electron-companion/lib/wordSession');
const electron = require('../../../electron-companion/node_modules/electron');

describe('compagnon wordSession — synchronisation finale sure', () => {
  let testRoot;

  beforeEach(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kheops-word-session-'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(config, 'getTempDir').mockReturnValue(path.join(testRoot, 'temp'));
    jest.spyOn(config, 'getRecoveryDir').mockReturnValue(path.join(testRoot, 'Documents', 'recuperation'));
    backendClient.downloadDocx.mockImplementation(async (_base, _token, _docId, destinationPath) => {
      await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
      await fs.promises.writeFile(destinationPath, Buffer.from('faux-docx-modifie'));
      return { filePath: destinationPath, baseVersionId: 'server-v1' };
    });
    saveWatcher.stop.mockResolvedValue();
    saveWatcher.finalUpload.mockResolvedValue(true);
    backendClient.refreshCompanionSession.mockResolvedValue({
      companionToken: 'token-renouvele-defaut',
      expiresAt: Date.now() + (8 * 60 * 60 * 1000),
      sessionAbsoluteExpiresAt: Date.now() + (14 * 24 * 60 * 60 * 1000),
      backendBaseUrl: 'https://kheops.test',
      userId: 'user-1',
    });
    backendClient.revokeCompanionSession.mockResolvedValue({ revoked: true });
  });

  afterEach(() => {
    wordSession.stopAll();
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    if (testRoot) fs.rmSync(testRoot, { recursive: true, force: true });
  });

  test('transmet au watcher la baseVersionId reçue avec le téléchargement', async () => {
    backendClient.downloadDocx.mockResolvedValue({
      filePath: 'C:/tmp/kheops-companion/doc-1/Acte.docx',
      baseVersionId: 'server-current-v4',
    });

    await wordSession.open({
      docId: 'doc-1',
      fileName: 'Acte.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'token',
    });

    expect(saveWatcher.watch).toHaveBeenCalledWith(expect.objectContaining({
      docId: 'doc-1',
      baseVersionId: 'server-current-v4',
      onVersion: expect.any(Function),
    }));
  });

  test('la rotation remplace le jeton utilise par sauvegarde, heartbeat et liberation', async () => {
    await wordSession.open({
      docId: 'doc-rotation',
      fileName: 'Acte.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'ancien-token',
      tokenExpiresAt: Date.now() + (8 * 60 * 60 * 1000),
      userId: 'user-1',
    });
    const watcherOptions = saveWatcher.watch.mock.calls.at(-1)[0];
    const lockOptions = require('../../../electron-companion/lib/lockWatcher').track.mock.calls.at(-1)[0];

    await expect(wordSession._refreshSessionTokenForTesting('doc-rotation')).resolves.toBe(true);

    expect(backendClient.refreshCompanionSession).toHaveBeenCalledWith(
      'https://kheops.test',
      'ancien-token',
      { purpose: 'word', docId: 'doc-rotation' },
    );
    expect(watcherOptions.getToken()).toBe('token-renouvele-defaut');
    expect(lockOptions.getToken()).toBe('token-renouvele-defaut');

    await wordSession.closeCleanup('doc-rotation');
    expect(saveWatcher.finalUpload).toHaveBeenCalledWith(expect.objectContaining({
      token: 'token-renouvele-defaut',
      getToken: expect.any(Function),
    }));
    expect(backendClient.releaseLock).toHaveBeenCalledWith(
      'https://kheops.test',
      'token-renouvele-defaut',
      'doc-rotation',
    );
    expect(backendClient.revokeCompanionSession).toHaveBeenCalledWith(
      'https://kheops.test',
      'token-renouvele-defaut',
    );
  });

  test('reouvrir le meme document remplace aussi le jeton capture par les getters', async () => {
    await wordSession.open({
      docId: 'doc-reopen-token',
      fileName: 'Acte.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'token-initial',
      userId: 'user-1',
    });
    const watcherOptions = saveWatcher.watch.mock.calls.at(-1)[0];

    const result = await wordSession.open({
      docId: 'doc-reopen-token',
      fileName: 'Acte.docx',
      backendBaseUrl: 'https://kheops.test/',
      token: 'token-plus-recent',
      tokenExpiresAt: Date.now() + (8 * 60 * 60 * 1000),
      userId: 'user-1',
    });

    expect(result).toEqual({ ok: true, reopened: true });
    expect(watcherOptions.getToken()).toBe('token-plus-recent');
    expect(backendClient.revokeCompanionSession).toHaveBeenCalledWith(
      'https://kheops.test',
      'token-initial',
    );
    expect(backendClient.downloadDocx).toHaveBeenCalledTimes(1);
  });

  test('reouvrir pose la nouvelle borne absolue avant de replanifier la rotation', async () => {
    jest.useFakeTimers({ now: new Date('2026-07-10T00:00:00.000Z') });
    await wordSession.open({
      docId: 'doc-reopen-expiry',
      fileName: 'Acte.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'token-ancienne-chaine',
      tokenExpiresAt: Date.now() + (10 * 60 * 1000),
      sessionAbsoluteExpiresAt: Date.now() + (10 * 60 * 1000),
      userId: 'user-1',
    });

    await wordSession.open({
      docId: 'doc-reopen-expiry',
      fileName: 'Acte.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'token-nouvelle-chaine',
      tokenExpiresAt: Date.now() + (8 * 60 * 60 * 1000),
      sessionAbsoluteExpiresAt: Date.now() + (14 * 24 * 60 * 60 * 1000),
      userId: 'user-1',
    });

    await jest.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(backendClient.refreshCompanionSession).toHaveBeenCalledWith(
      'https://kheops.test',
      'token-nouvelle-chaine',
      { purpose: 'word', docId: 'doc-reopen-expiry' },
    );
  });

  test('serialise deux reouvertures et revoque chaque chaine remplacee', async () => {
    let releaseFirstRevoke;
    backendClient.revokeCompanionSession
      .mockImplementationOnce(() => new Promise((resolve) => { releaseFirstRevoke = resolve; }))
      .mockResolvedValue({ revoked: true });
    await wordSession.open({
      docId: 'doc-double-reopen',
      fileName: 'Acte.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'token-initial',
      userId: 'user-1',
    });

    const first = wordSession.open({
      docId: 'doc-double-reopen',
      fileName: 'Acte.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'token-chaine-a',
      userId: 'user-1',
    });
    const second = wordSession.open({
      docId: 'doc-double-reopen',
      fileName: 'Acte.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'token-chaine-b',
      userId: 'user-1',
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(backendClient.revokeCompanionSession).toHaveBeenCalledTimes(1);
    releaseFirstRevoke({ revoked: true });
    await Promise.all([first, second]);

    expect(backendClient.revokeCompanionSession.mock.calls.slice(0, 2)).toEqual([
      ['https://kheops.test', 'token-initial'],
      ['https://kheops.test', 'token-chaine-a'],
    ]);
    expect(wordSession._getSessionForTesting('doc-double-reopen').token).toBe('token-chaine-b');
  });

  test('une fermeture attend une rotation deja en vol puis utilise le nouveau jeton', async () => {
    let releaseRefresh;
    backendClient.refreshCompanionSession.mockImplementationOnce(() => new Promise((resolve) => {
      releaseRefresh = resolve;
    }));
    await wordSession.open({
      docId: 'doc-close-during-refresh',
      fileName: 'Acte.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'token-avant-rotation',
      userId: 'user-1',
    });

    const rotation = wordSession._refreshSessionTokenForTesting('doc-close-during-refresh');
    const closing = wordSession.closeCleanup('doc-close-during-refresh');
    await Promise.resolve();
    expect(saveWatcher.finalUpload).not.toHaveBeenCalled();

    releaseRefresh({
      companionToken: 'token-apres-rotation',
      expiresAt: Date.now() + (8 * 60 * 60 * 1000),
      backendBaseUrl: 'https://kheops.test',
      userId: 'user-1',
    });
    await expect(rotation).resolves.toBe(true);
    await expect(closing).resolves.toEqual(expect.objectContaining({ synced: true }));

    expect(saveWatcher.finalUpload).toHaveBeenCalledWith(expect.objectContaining({
      token: 'token-apres-rotation',
    }));
  });

  test('un arret pendant une rotation revoque aussi le jeton revenu trop tard', async () => {
    let releaseRefresh;
    backendClient.refreshCompanionSession.mockImplementationOnce(() => new Promise((resolve) => {
      releaseRefresh = resolve;
    }));
    await wordSession.open({
      docId: 'doc-stop-during-refresh',
      fileName: 'Acte.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'token-avant-arret',
      userId: 'user-1',
    });

    const rotation = wordSession._refreshSessionTokenForTesting('doc-stop-during-refresh');
    wordSession.stopAll();
    releaseRefresh({
      companionToken: 'token-revenu-apres-arret',
      expiresAt: Date.now() + (8 * 60 * 60 * 1000),
      backendBaseUrl: 'https://kheops.test',
      userId: 'user-1',
    });
    await expect(rotation).resolves.toBe(false);

    expect(backendClient.revokeCompanionSession).toHaveBeenCalledWith(
      'https://kheops.test',
      'token-avant-arret',
    );
    expect(backendClient.revokeCompanionSession).toHaveBeenCalledWith(
      'https://kheops.test',
      'token-revenu-apres-arret',
    );
  });

  test('planifie la rotation avant huit heures et reessaie une panne reseau transitoire', async () => {
    jest.useFakeTimers({ now: new Date('2026-07-10T00:00:00.000Z') });
    backendClient.refreshCompanionSession
      .mockRejectedValueOnce(new Error('reseau temporairement indisponible'))
      .mockResolvedValueOnce({
        companionToken: 'token-apres-retry',
        expiresAt: Date.now() + (8 * 60 * 60 * 1000),
        sessionAbsoluteExpiresAt: Date.now() + (14 * 24 * 60 * 60 * 1000),
        backendBaseUrl: 'https://kheops.test',
        userId: 'user-1',
      });
    await wordSession.open({
      docId: 'doc-refresh-retry',
      fileName: 'Acte.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'token-initial',
      tokenExpiresAt: Date.now() + (8 * 60 * 60 * 1000),
      sessionAbsoluteExpiresAt: Date.now() + (14 * 24 * 60 * 60 * 1000),
      userId: 'user-1',
    });
    const watcherOptions = saveWatcher.watch.mock.calls.at(-1)[0];

    await jest.advanceTimersByTimeAsync((6 * 60 * 60 * 1000) - 1);
    expect(backendClient.refreshCompanionSession).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(backendClient.refreshCompanionSession).toHaveBeenCalledTimes(1);
    expect(watcherOptions.getToken()).toBe('token-initial');

    await jest.advanceTimersByTimeAsync(60 * 1000);
    expect(backendClient.refreshCompanionSession).toHaveBeenCalledTimes(2);
    expect(watcherOptions.getToken()).toBe('token-apres-retry');
  });

  test('ne supprime le temporaire qu apres confirmation de la synchronisation finale', async () => {
    await wordSession.open({
      docId: 'doc-success',
      fileName: 'Acte.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'token',
    });
    const localFilePath = saveWatcher.watch.mock.calls.at(-1)[0].localFilePath;
    expect(fs.existsSync(localFilePath)).toBe(true);

    const result = await wordSession.closeCleanup('doc-success');

    expect(result).toEqual(expect.objectContaining({ ok: true, synced: true, state: 'closed', recovery: null }));
    expect(fs.existsSync(localFilePath)).toBe(false);
    expect(wordSession.getStatus('doc-success').state).toBe('closed');
  });

  test('une panne reseau conserve une copie durable et signale son emplacement', async () => {
    saveWatcher.finalUpload.mockImplementation(async ({ onState }) => {
      onState('error', { error: 'Session expiree (HTTP 401)' });
      return false;
    });
    await wordSession.open({
      docId: 'doc-offline',
      fileName: 'Convention.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'token-expire',
    });
    const localFilePath = saveWatcher.watch.mock.calls.at(-1)[0].localFilePath;

    const result = await wordSession.closeCleanup('doc-offline');

    expect(result.synced).toBe(false);
    expect(result.state).toBe('error');
    expect(result.recovery).toEqual(expect.objectContaining({ available: true, durable: true }));
    expect(result.recovery.path).toContain(path.join('Documents', 'recuperation'));
    expect(fs.readFileSync(result.recovery.path, 'utf8')).toBe('faux-docx-modifie');
    expect(fs.existsSync(localFilePath)).toBe(false);
    expect(wordSession.getStatus('doc-offline')).toEqual(expect.objectContaining({
      state: 'error',
      error: expect.stringContaining('Une copie recuperable a ete conservee'),
      recovery: expect.objectContaining({ available: true, durable: true }),
    }));
    expect(electron.Notification).toHaveBeenCalledTimes(1);
    const notification = electron.Notification.mock.instances[0];
    expect(notification.show).toHaveBeenCalledTimes(1);
    const clickHandler = notification.on.mock.calls.find(([eventName]) => eventName === 'click')?.[1];
    expect(clickHandler).toEqual(expect.any(Function));
    clickHandler();
    expect(electron.shell.showItemInFolder).toHaveBeenCalledWith(result.recovery.path);
  });

  test('un conflit bloque tout nouvel envoi et garde le temporaire pour un reessai manuel', async () => {
    await wordSession.open({
      docId: 'doc-conflict',
      fileName: 'Conclusions.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'token',
    });
    const watcherOptions = saveWatcher.watch.mock.calls.at(-1)[0];
    const localFilePath = watcherOptions.localFilePath;
    watcherOptions.onState('conflict', {
      error: 'Une version plus recente existe.',
      conflict: { currentVersionId: 'server-v2', baseVersionId: 'server-v1' },
    });

    const result = await wordSession.closeCleanup('doc-conflict');

    expect(saveWatcher.finalUpload).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      synced: false,
      state: 'conflict',
      recovery: expect.objectContaining({ available: true, durable: true }),
    }));
    expect(fs.existsSync(result.recovery.path)).toBe(true);
    expect(fs.existsSync(localFilePath)).toBe(true);
    expect(wordSession.getStatus('doc-conflict')).toEqual(expect.objectContaining({
      state: 'conflict',
      conflict: expect.objectContaining({ currentVersionId: 'server-v2' }),
    }));
  });

  test('si la copie de secours echoue, ne supprime jamais le fichier local', async () => {
    saveWatcher.finalUpload.mockImplementation(async ({ onState }) => {
      onState('error', { error: 'Reseau indisponible' });
      return false;
    });
    jest.spyOn(recoveryStore, 'preserve').mockRejectedValueOnce(new Error('Disque Documents indisponible'));
    await wordSession.open({
      docId: 'doc-recovery-failure',
      fileName: 'Projet.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'token',
    });
    const localFilePath = saveWatcher.watch.mock.calls.at(-1)[0].localFilePath;

    const result = await wordSession.closeCleanup('doc-recovery-failure');

    expect(result.recovery).toEqual(expect.objectContaining({
      available: true,
      durable: false,
      path: localFilePath,
    }));
    expect(fs.existsSync(localFilePath)).toBe(true);
    expect(fs.readFileSync(localFilePath, 'utf8')).toBe('faux-docx-modifie');

    // Une nouvelle ouverture utilise un autre dossier : l'ancienne copie ne
    // peut donc pas etre ecrasee, meme avant toute intervention manuelle.
    await wordSession.open({
      docId: 'doc-recovery-failure',
      fileName: 'Projet.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'nouveau-token',
    });
    const newLocalFilePath = saveWatcher.watch.mock.calls.at(-1)[0].localFilePath;
    expect(newLocalFilePath).not.toBe(localFilePath);
    expect(fs.existsSync(localFilePath)).toBe(true);
  });

  test('refuse une copie de secours dont le contenu SHA-256 differe de la source', async () => {
    const sourcePath = path.join(testRoot, 'source.docx');
    const recoveryDir = path.join(testRoot, 'recovery-hash');
    await fs.promises.writeFile(sourcePath, 'contenu-original');
    jest.spyOn(fs.promises, 'copyFile').mockImplementation(async (_source, destination) => {
      await fs.promises.writeFile(destination, 'contenu-corrompu');
    });

    await expect(recoveryStore.preserve({
      sourcePath,
      recoveryDir,
      docId: 'doc-hash',
    })).rejects.toThrow(/verification|integrite/i);

    expect(fs.existsSync(sourcePath)).toBe(true);
    expect(fs.readdirSync(recoveryDir)).toEqual([]);
  });

  test('deux demandes de fermeture simultanees ne lancent qu un seul envoi final', async () => {
    let releaseUpload;
    saveWatcher.finalUpload.mockImplementation(() => new Promise((resolve) => { releaseUpload = resolve; }));
    await wordSession.open({
      docId: 'doc-double-close',
      fileName: 'Acte.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'token',
    });

    const first = wordSession.closeCleanup('doc-double-close');
    const second = wordSession.closeCleanup('doc-double-close');
    await Promise.resolve();
    await Promise.resolve();
    expect(saveWatcher.finalUpload).toHaveBeenCalledTimes(1);
    await expect(wordSession.open({
      docId: 'doc-double-close',
      fileName: 'Acte.docx',
      backendBaseUrl: 'https://kheops.test',
      token: 'nouveau-token',
    })).rejects.toMatchObject({ code: 'SYNC_IN_PROGRESS' });
    expect(backendClient.downloadDocx).toHaveBeenCalledTimes(1);
    releaseUpload(true);

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.synced).toBe(true);
    expect(secondResult.synced).toBe(true);
    expect(saveWatcher.finalUpload).toHaveBeenCalledTimes(1);
  });
});
