// Tests A3 — client Graph OneDrive : mapping du jeton par utilisateur + erreurs.
// On mocke axios et le résolveur de jeton MS (partagé avec la messagerie Graph).

jest.mock('axios', () => ({ put: jest.fn(), get: jest.fn(), delete: jest.fn() }));
jest.mock('../../../utils/microsoftGraphMail', () => ({ getAccessTokenForUser: jest.fn() }));

const axios = require('axios');
const { getAccessTokenForUser } = require('../../../utils/microsoftGraphMail');
const oneDrive = require('../oneDriveClient');

afterEach(() => jest.clearAllMocks());

describe('résolution de jeton par utilisateur', () => {
  test('uploadFile utilise le jeton de l\'utilisateur passé (isolation par compte)', async () => {
    getAccessTokenForUser.mockResolvedValue('TOKEN-userA');
    axios.put.mockResolvedValue({ data: { id: 'IT1', size: 3, webUrl: 'u', name: 'f' } });

    const r = await oneDrive.uploadFile('userA', { path: 'Kheops2/a b/é.pdf', buffer: Buffer.from('abc'), mime: 'application/pdf' });

    expect(getAccessTokenForUser).toHaveBeenCalledWith('userA');
    const [url, body, cfg] = axios.put.mock.calls[0];
    // segments encodés (espace, accent), '/' préservés
    expect(url).toContain('/me/drive/root:/Kheops2/a%20b/%C3%A9.pdf:/content');
    expect(cfg.headers.Authorization).toBe('Bearer TOKEN-userA');
    expect(r).toEqual({ itemId: 'IT1', size: 3, webUrl: 'u', name: 'f' });
  });
});

describe('mapping « OneDrive non connecté »', () => {
  test.each(['AUTH_REQUIRED', 'AUTH_REFRESH_FAILED'])(
    'getAccessTokenForUser lève %s → 428 ONEDRIVE_NOT_CONNECTED',
    async (reason) => {
      getAccessTokenForUser.mockRejectedValue(new Error(reason));
      await expect(
        oneDrive.uploadFile('userA', { path: 'x', buffer: Buffer.from('x'), mime: 'application/pdf' }),
      ).rejects.toMatchObject({ statusCode: 428, code: 'ONEDRIVE_NOT_CONNECTED' });
      expect(axios.put).not.toHaveBeenCalled();
    },
  );

  test('une autre erreur de jeton est propagée telle quelle', async () => {
    getAccessTokenForUser.mockRejectedValue(new Error('network boom'));
    await expect(
      oneDrive.downloadFile('userA', 'IT1'),
    ).rejects.toThrow('network boom');
  });
});

describe('isConnected', () => {
  test('true si /me/drive répond', async () => {
    getAccessTokenForUser.mockResolvedValue('TOK');
    axios.get.mockResolvedValue({ data: { id: 'drive1' } });
    expect(await oneDrive.isConnected('userA')).toBe(true);
  });

  test('false (jamais d\'exception) si pas de jeton', async () => {
    getAccessTokenForUser.mockRejectedValue
      ? getAccessTokenForUser.mockRejectedValue(new Error('AUTH_REQUIRED'))
      : getAccessTokenForUser.mockImplementation(() => Promise.reject(new Error('AUTH_REQUIRED')));
    expect(await oneDrive.isConnected('userA')).toBe(false);
  });
});
