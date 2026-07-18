jest.mock('axios', () => {
  const axios = jest.fn();
  axios.post = jest.fn();
  return axios;
});

jest.mock('../../models/App_Users/User', () => ({
  findById: jest.fn(),
  updateOne: jest.fn(),
}));

jest.mock('../tokenCrypto', () => ({
  encryptIfNeeded: jest.fn((token) => `enc:${token}`),
  decryptIfNeeded: jest.fn((token) => String(token).replace(/^enc:/, '')),
}));

const axios = require('axios');
const User = require('../../models/App_Users/User');
const {
  clearOneDriveTokenCache,
  getAccessTokenForOneDriveUser,
} = require('../microsoftGraphMail');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function userQuery(value) {
  return { select: jest.fn().mockResolvedValue(value) };
}

function tokenResponse(accessToken, refreshToken) {
  return {
    data: {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
    },
  };
}

async function waitForCalls(mock, count) {
  for (let index = 0; index < 20 && mock.mock.calls.length < count; index += 1) {
    // Cède uniquement la boucle d'événements : aucune attente temporelle
    // aléatoire, les tests restent entièrement déterministes.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setImmediate(resolve));
  }
  expect(mock).toHaveBeenCalledTimes(count);
}

describe('microsoftGraphMail — courses refresh OneDrive / changement de connexion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.updateOne.mockResolvedValue({ matchedCount: 1 });
  });

  test("un refresh ancien ne persiste rien et son finally n'efface pas la nouvelle promesse", async () => {
    const userId = 'race-user-1';
    const oldRefresh = deferred();
    const newRefresh = deferred();
    User.findById
      .mockReturnValueOnce(userQuery({
        microsoftOneDriveRefreshToken: 'enc:old-rt',
        microsoftRefreshToken: null,
        microsoftOneDriveAccount: { disconnectedAt: null },
      }))
      .mockReturnValueOnce(userQuery({
        microsoftOneDriveRefreshToken: 'enc:new-rt',
        microsoftRefreshToken: null,
        microsoftOneDriveAccount: { disconnectedAt: null },
      }));
    axios.post
      .mockReturnValueOnce(oldRefresh.promise)
      .mockReturnValueOnce(newRefresh.promise);

    const oldPromise = getAccessTokenForOneDriveUser(userId);
    await waitForCalls(axios.post, 1);

    // Simule la déconnexion/reconnexion : l'ancien refresh continue côté HTTP,
    // mais sa génération est désormais caduque.
    clearOneDriveTokenCache(userId);
    const newPromise = getAccessTokenForOneDriveUser(userId);
    await waitForCalls(axios.post, 2);

    const oldRejected = expect(oldPromise).rejects.toMatchObject({ code: 'AUTH_CONTEXT_CHANGED' });
    oldRefresh.resolve(tokenResponse('old-access', 'old-rotated'));
    await oldRejected;
    expect(User.updateOne).not.toHaveBeenCalled();

    // Si le finally de l'ancien refresh supprimait aveuglément l'entrée, cet
    // appel lancerait un troisième échange OAuth au lieu de rejoindre le nouveau.
    const joinedPromise = getAccessTokenForOneDriveUser(userId);
    await new Promise((resolve) => setImmediate(resolve));
    expect(axios.post).toHaveBeenCalledTimes(2);

    newRefresh.resolve(tokenResponse('new-access', 'new-rotated'));
    await expect(newPromise).resolves.toBe('new-access');
    await expect(joinedPromise).resolves.toBe('new-access');
    expect(User.updateOne).toHaveBeenCalledTimes(1);
    expect(User.updateOne).toHaveBeenCalledWith(
      {
        _id: userId,
        microsoftOneDriveRefreshToken: 'enc:new-rt',
        'microsoftOneDriveAccount.connectedAt': null,
        'microsoftOneDriveAccount.disconnectedAt': null,
      },
      { $set: { microsoftOneDriveRefreshToken: 'enc:new-rotated' } },
    );
  });

  test("l'échec tardif d'une ancienne génération ne supprime pas le cache reconnecté", async () => {
    const userId = 'race-user-2';
    const oldRefresh = deferred();
    const newRefresh = deferred();
    User.findById
      .mockReturnValueOnce(userQuery({
        microsoftOneDriveRefreshToken: 'enc:old-rt',
        microsoftRefreshToken: null,
        microsoftOneDriveAccount: { disconnectedAt: null },
      }))
      .mockReturnValueOnce(userQuery({
        microsoftOneDriveRefreshToken: 'enc:new-rt',
        microsoftRefreshToken: null,
        microsoftOneDriveAccount: { disconnectedAt: null },
      }));
    axios.post
      .mockReturnValueOnce(oldRefresh.promise)
      .mockReturnValueOnce(newRefresh.promise);

    const oldPromise = getAccessTokenForOneDriveUser(userId);
    await waitForCalls(axios.post, 1);
    clearOneDriveTokenCache(userId);
    const newPromise = getAccessTokenForOneDriveUser(userId);
    await waitForCalls(axios.post, 2);

    newRefresh.resolve(tokenResponse('new-access', 'new-rotated'));
    await expect(newPromise).resolves.toBe('new-access');

    const oldRejected = expect(oldPromise).rejects.toMatchObject({ code: 'AUTH_CONTEXT_CHANGED' });
    oldRefresh.resolve(tokenResponse('old-access', 'old-rotated'));
    await oldRejected;

    // Doit provenir du cache de la nouvelle génération : aucun troisième read
    // utilisateur ni troisième POST OAuth.
    await expect(getAccessTokenForOneDriveUser(userId)).resolves.toBe('new-access');
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(User.findById).toHaveBeenCalledTimes(2);
    expect(User.updateOne).toHaveBeenCalledTimes(1);
  });

  test('le fallback Outlook est protégé en base par le contexte OneDrive observé', async () => {
    const userId = 'race-user-legacy';
    const connectedAt = new Date('2026-07-01T12:00:00.000Z');
    User.findById.mockReturnValueOnce(userQuery({
      microsoftOneDriveRefreshToken: null,
      microsoftRefreshToken: 'enc:legacy-mail-rt',
      microsoftOneDriveAccount: { connectedAt, disconnectedAt: null },
    }));
    axios.post.mockResolvedValueOnce(tokenResponse('legacy-access', 'legacy-rotated'));

    await expect(getAccessTokenForOneDriveUser(userId)).resolves.toBe('legacy-access');

    expect(User.updateOne).toHaveBeenCalledWith(
      {
        _id: userId,
        microsoftRefreshToken: 'enc:legacy-mail-rt',
        microsoftOneDriveRefreshToken: null,
        'microsoftOneDriveAccount.connectedAt': connectedAt,
        'microsoftOneDriveAccount.disconnectedAt': null,
      },
      { $set: { microsoftRefreshToken: 'enc:legacy-rotated' } },
    );
  });
});
