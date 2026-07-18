function loadClient(user) {
  jest.resetModules();
  const findById = jest.fn(() => ({
    select: jest.fn().mockResolvedValue(user),
  }));
  const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
  const post = jest.fn().mockResolvedValue({
    data: {
      access_token: 'sharepoint-access',
      refresh_token: 'rotated-refresh',
      expires_in: 3600,
      scope: 'User.Read Sites.ReadWrite.All',
    },
  });
  jest.doMock('../../../models/App_Users/User', () => ({ findById, updateOne }));
  jest.doMock('../../../utils/tokenCrypto', () => ({
    decryptIfNeeded: (value) => String(value).replace(/^enc:/, ''),
    encryptIfNeeded: (value) => `enc:${value}`,
  }));
  jest.doMock('axios', () => ({ post, get: jest.fn(), put: jest.fn(), delete: jest.fn() }));
  const client = require('../sharePointClient');
  return { client, findById, updateOne, post };
}

describe('authentification SharePoint dédiée', () => {
  test('préfère le refresh token SharePoint et fait tourner uniquement ce champ', async () => {
    const { client, updateOne, post } = loadClient({
      microsoftSharePointRefreshToken: 'enc:sharepoint-refresh',
      microsoftRefreshToken: 'enc:mail-refresh',
    });

    await expect(client.isConnected('user-1')).resolves.toBe(true);

    expect(post.mock.calls[0][1]).toContain('refresh_token=sharepoint-refresh');
    expect(post.mock.calls[0][1]).toContain('Sites.ReadWrite.All');
    expect(post.mock.calls[0][1]).not.toContain('Mail.Read');
    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'user-1', microsoftSharePointRefreshToken: 'enc:sharepoint-refresh' },
      { $set: { microsoftSharePointRefreshToken: 'enc:rotated-refresh' } },
    );
  });

  test('conserve le repli historique sur le jeton Microsoft déjà consenti', async () => {
    const { client, updateOne, post } = loadClient({
      microsoftSharePointRefreshToken: null,
      microsoftRefreshToken: 'enc:legacy-refresh',
    });

    await expect(client.isConnected('user-2')).resolves.toBe(true);

    expect(post.mock.calls[0][1]).toContain('refresh_token=legacy-refresh');
    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'user-2', microsoftRefreshToken: 'enc:legacy-refresh' },
      { $set: { microsoftRefreshToken: 'enc:rotated-refresh' } },
    );
  });
});

