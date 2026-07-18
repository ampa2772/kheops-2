// Tests A3 — client Google Drive : jeton par utilisateur (refresh direct),
// dossier applicatif, upload multipart, mapping « non connecté ».

jest.mock('axios', () => ({ post: jest.fn(), get: jest.fn(), delete: jest.fn() }));
jest.mock('../../../models/App_Users/User', () => ({ findById: jest.fn(), findByIdAndUpdate: jest.fn() }));
jest.mock('../../../utils/tokenCrypto', () => ({
  decryptIfNeeded: (v) => v,
  encryptIfNeeded: (v) => v,
}));

const axios = require('axios');
const User = require('../../../models/App_Users/User');
const gdrive = require('../googleDriveClient');

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = 'gid';
  process.env.GOOGLE_CLIENT_SECRET = 'gsecret';
  // Isolation : caches mémoire (jeton + dossier applicatif) remis à zéro.
  gdrive._tokenCache.clear();
  gdrive._folderCache.clear();
  User.findById.mockReturnValue({ select: () => Promise.resolve({ googleRefreshToken: 'refresh-userA' }) });
  User.findByIdAndUpdate.mockResolvedValue({});
});
afterEach(() => jest.clearAllMocks());

describe('jeton par utilisateur', () => {
  test('getAccessTokenForUser rafraîchit via le endpoint OAuth Google avec le refresh de l\'utilisateur', async () => {
    axios.post.mockResolvedValue({ data: { access_token: 'AT-userA', expires_in: 3600 } });

    const tok = await gdrive.getAccessTokenForUser('userA');

    expect(tok).toBe('AT-userA');
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(body).toContain('refresh_token=refresh-userA');
    expect(body).toContain('grant_type=refresh_token');
  });

  test('🔒 pas de refresh token → 428 GOOGLEDRIVE_NOT_CONNECTED', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve({ googleRefreshToken: null }) });
    await expect(gdrive.getAccessTokenForUser('userA'))
      .rejects.toMatchObject({ statusCode: 428, code: 'GOOGLEDRIVE_NOT_CONNECTED' });
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('invalid_grant → purge le token et 428', async () => {
    axios.post.mockRejectedValue({ response: { data: { error: 'invalid_grant' } } });
    await expect(gdrive.getAccessTokenForUser('userA'))
      .rejects.toMatchObject({ code: 'GOOGLEDRIVE_NOT_CONNECTED' });
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith('userA', { $set: { googleRefreshToken: null } });
  });
});

describe('uploadFile', () => {
  test('crée le dossier applicatif si absent puis envoie un multipart', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { access_token: 'AT', expires_in: 3600 } }) // token
      .mockResolvedValueOnce({ data: { id: 'FOLDER1' } })                        // create folder
      .mockResolvedValueOnce({ data: { id: 'FILE1', size: '10' } });             // upload
    axios.get.mockResolvedValueOnce({ data: { files: [] } });                    // search folder → vide

    const r = await gdrive.uploadFile('userA', { name: 'doc.pdf', buffer: Buffer.from('0123456789'), mime: 'application/pdf' });

    expect(r).toEqual({ fileId: 'FILE1', size: 10, name: 'doc.pdf' });
    const uploadCall = axios.post.mock.calls[2];
    expect(uploadCall[0]).toBe('https://www.googleapis.com/upload/drive/v3/files');
    expect(uploadCall[2].headers['Content-Type']).toMatch(/^multipart\/related; boundary=/);
    expect(uploadCall[2].params).toMatchObject({ uploadType: 'multipart' });
  });

  test('réutilise le dossier applicatif existant (pas de création)', async () => {
    axios.post
      .mockResolvedValueOnce({ data: { access_token: 'AT', expires_in: 3600 } }) // token
      .mockResolvedValueOnce({ data: { id: 'FILE2', size: '3' } });              // upload
    axios.get.mockResolvedValueOnce({ data: { files: [{ id: 'EXISTING_FOLDER' }] } });

    await gdrive.uploadFile('userA', { name: 'x', buffer: Buffer.from('abc'), mime: 'text/plain' });

    // 2 POST seulement : token + upload (pas de create folder)
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  test('importe un TXT comme document Google natif sans extension trompeuse', async () => {
    gdrive._tokenCache.set('userA', { accessToken: 'AT', expiresAt: Date.now() + 60000 });
    gdrive._folderCache.set('userA', 'FOLDER1');
    axios.post.mockResolvedValue({
      data: {
        id: 'GOOGLE-DOC-1',
        name: 'notes',
        mimeType: 'application/vnd.google-apps.document',
        webViewLink: 'https://docs.google.com/document/d/GOOGLE-DOC-1/edit',
      },
    });

    const result = await gdrive.uploadFile('userA', {
      name: 'notes.txt',
      buffer: Buffer.from('Bonjour', 'utf8'),
      mime: 'text/plain; charset=utf-8',
      convertToGoogle: true,
    });

    expect(result).toMatchObject({
      fileId: 'GOOGLE-DOC-1',
      name: 'notes',
      mimeType: 'application/vnd.google-apps.document',
    });
    const multipart = axios.post.mock.calls[0][1].toString('utf8');
    expect(multipart).toContain('"name":"notes"');
    expect(multipart).toContain('"mimeType":"application/vnd.google-apps.document"');
    expect(multipart).toContain('Content-Type: text/plain; charset=utf-8');
  });
});

describe('downloadEditableFile', () => {
  test('exporte un document Google natif en texte brut et restitue une extension .txt', async () => {
    gdrive._tokenCache.set('userA', { accessToken: 'AT', expiresAt: Date.now() + 60000 });
    axios.get
      .mockResolvedValueOnce({
        data: {
          id: 'GOOGLE-DOC-1',
          name: 'notes',
          mimeType: 'application/vnd.google-apps.document',
          modifiedTime: '2026-01-02T00:00:00.000Z',
        },
      })
      .mockResolvedValueOnce({ data: Buffer.from('Texte modifié', 'utf8') });

    const result = await gdrive.downloadEditableFile('userA', 'GOOGLE-DOC-1', {
      exportMime: 'text/plain',
      exportExtension: '.txt',
    });

    expect(axios.get.mock.calls[1][0])
      .toBe('https://www.googleapis.com/drive/v3/files/GOOGLE-DOC-1/export');
    expect(axios.get.mock.calls[1][1].params).toEqual({ mimeType: 'text/plain' });
    expect(result.name).toBe('notes.txt');
    expect(result.downloadedMime).toBe('text/plain');
    expect(result.buffer.equals(Buffer.from('Texte modifié', 'utf8'))).toBe(true);
  });
});

describe('isConnected', () => {
  test('false (jamais d\'exception) si non connecté', async () => {
    User.findById.mockReturnValue({ select: () => Promise.resolve({ googleRefreshToken: null }) });
    expect(await gdrive.isConnected('userA')).toBe(false);
  });
});
