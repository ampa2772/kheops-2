const { Readable } = require('stream');

describe('imapClient', () => {
  function loadWithClient(client) {
    jest.resetModules();
    jest.doMock('imapflow', () => ({
      ImapFlow: jest.fn(() => client),
    }));
    return {
      imapClient: require('../imapClient'),
      ImapFlow: require('imapflow').ImapFlow,
    };
  }

  function account() {
    return {
      _id: '64f000000000000000000001',
      username: 'user@example.com',
      imap: { host: 'imap.example.com', port: 993, security: 'ssl_tls' },
    };
  }

  async function* asyncMessages(messages) {
    for (const message of messages) yield message;
  }

  test('testImap connecte puis logout', async () => {
    const client = {
      usable: true,
      connect: jest.fn().mockResolvedValue(undefined),
      logout: jest.fn().mockResolvedValue(undefined),
    };
    const { imapClient, ImapFlow } = loadWithClient(client);

    await expect(imapClient.testImap(account(), 'secret')).resolves.toEqual({ ok: true });

    expect(ImapFlow).toHaveBeenCalledWith(expect.objectContaining({
      host: 'imap.example.com',
      port: 993,
      secure: true,
      auth: { user: 'user@example.com', pass: 'secret' },
    }));
    expect(client.connect).toHaveBeenCalled();
    expect(client.logout).toHaveBeenCalled();
  });

  test('testImap propage les erreurs de connexion', async () => {
    const client = {
      usable: false,
      connect: jest.fn().mockRejectedValue(new Error('login failed')),
      logout: jest.fn(),
    };
    const { imapClient } = loadWithClient(client);

    await expect(imapClient.testImap(account(), 'bad')).rejects.toThrow('login failed');
    expect(client.logout).not.toHaveBeenCalled();
  });

  test('fetchMessages pagine les derniers messages sans download massif', async () => {
    const fetch = jest.fn(() => asyncMessages([
      {
        uid: 25,
        flags: new Set(['\\Seen']),
        envelope: { subject: 'A', from: [{ address: 'a@example.com' }] },
        internalDate: new Date('2026-06-01T10:00:00Z'),
        size: 123,
        bodyStructure: null,
      },
      {
        uid: 24,
        flags: new Set(),
        envelope: { subject: 'B', from: [{ address: 'b@example.com' }] },
        internalDate: new Date('2026-06-01T09:00:00Z'),
        size: 456,
        bodyStructure: null,
      },
    ]));
    const client = {
      usable: true,
      connect: jest.fn().mockResolvedValue(undefined),
      logout: jest.fn().mockResolvedValue(undefined),
      mailboxOpen: jest.fn().mockResolvedValue({ exists: 25 }),
      fetch,
    };
    const { imapClient } = loadWithClient(client);

    const result = await imapClient.fetchMessages(account(), 'secret', {
      folder: 'INBOX',
      page: 1,
      pageSize: 10,
    });

    expect(client.mailboxOpen).toHaveBeenCalledWith('INBOX', { readOnly: true });
    expect(fetch.mock.calls[0][0]).toEqual([25, 24, 23, 22, 21, 20, 19, 18, 17, 16]);
    expect(result).toMatchObject({ page: 1, pageSize: 10, total: 25, hasMore: true });
    expect(result.messages.map((message) => message.uid)).toEqual([25, 24]);
  });

  test('encode/decode message id', () => {
    const { imapClient } = loadWithClient({});
    const id = imapClient.encodeMessageId({
      accountId: '64f000000000000000000001',
      folder: 'INBOX',
      uid: 42,
    });

    expect(imapClient.decodeMessageId(id)).toEqual({
      accountId: '64f000000000000000000001',
      folder: 'INBOX',
      uid: 42,
    });
    expect(() => imapClient.decodeMessageId('bad')).toThrow('Identifiant de message invalide');
  });
});
