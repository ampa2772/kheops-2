const {
  GoogleMailProvider,
  MESSAGE_FETCH_CONCURRENCY,
} = require('../providers/googleMailProvider');

function unauthorized(message = 'Login Required.') {
  const error = new Error(message);
  error.response = { status: 401 };
  return error;
}

describe('GoogleMailProvider authentication resilience', () => {
  test('retries a Gmail request once after a coordinated refresh', async () => {
    const provider = new GoogleMailProvider({ refreshToken: 'refresh-token' });
    provider.ensureAuthenticated = jest.fn().mockResolvedValue(undefined);
    provider.refreshAuthentication = jest.fn().mockResolvedValue(undefined);
    const operation = jest.fn()
      .mockRejectedValueOnce(unauthorized())
      .mockResolvedValueOnce({ data: { ok: true } });

    await expect(provider.withAuthRetry(operation, 'test')).resolves.toEqual({ data: { ok: true } });
    expect(provider.refreshAuthentication).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  test('shares one refresh between concurrent 401 recoveries', async () => {
    const provider = new GoogleMailProvider({ refreshToken: 'refresh-token' });
    provider.auth.refreshAccessToken = jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { credentials: { access_token: 'fresh-token', expiry_date: Date.now() + 3600000 } };
    });

    await Promise.all([
      provider.refreshAuthentication(),
      provider.refreshAuthentication(),
      provider.refreshAuthentication(),
    ]);

    expect(provider.auth.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(provider.auth.credentials.refresh_token).toBe('refresh-token');
    expect(provider.auth.credentials.access_token).toBe('fresh-token');
  });

  test('pre-authenticates concurrent calls only once', async () => {
    const provider = new GoogleMailProvider({ refreshToken: 'refresh-token' });
    provider.auth.getAccessToken = jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      provider.auth.credentials.access_token = 'initial-token';
      provider.auth.credentials.expiry_date = Date.now() + 3600000;
      return { token: 'initial-token' };
    });

    await Promise.all([
      provider.ensureAuthenticated(),
      provider.ensureAuthenticated(),
      provider.ensureAuthenticated(),
    ]);

    expect(provider.auth.getAccessToken).toHaveBeenCalledTimes(1);
  });

  test('bounds parallel Gmail message reads', async () => {
    const provider = new GoogleMailProvider({ refreshToken: 'refresh-token' });
    let active = 0;
    let maximum = 0;
    provider.gmail = {
      users: {
        messages: {
          get: jest.fn(async ({ id }) => {
            active += 1;
            maximum = Math.max(maximum, active);
            await new Promise((resolve) => setTimeout(resolve, 3));
            active -= 1;
            return {
              data: {
                id,
                threadId: `thread-${id}`,
                internalDate: String(Date.now()),
                labelIds: ['INBOX'],
                payload: {
                  mimeType: 'text/plain',
                  headers: [
                    { name: 'From', value: 'sender@example.com' },
                    { name: 'To', value: 'recipient@example.com' },
                    { name: 'Subject', value: `Message ${id}` },
                  ],
                  body: { data: Buffer.from('Test').toString('base64url') },
                },
              },
            };
          }),
        },
      },
    };
    provider.withAuthRetry = (operation) => operation();
    const ids = Array.from({ length: MESSAGE_FETCH_CONCURRENCY * 2 + 5 }, (_, index) => String(index + 1));

    const messages = await provider.getMessages(ids, {
      _id: 'account-1',
      tenantId: 'tenant-1',
      ownerUserId: 'user-1',
    });

    expect(messages).toHaveLength(ids.length);
    expect(maximum).toBeGreaterThan(1);
    expect(maximum).toBeLessThanOrEqual(MESSAGE_FETCH_CONCURRENCY);
  });
});
