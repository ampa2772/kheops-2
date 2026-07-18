const mockAccount = { _id: 'a1', tenantId: 't1', ownerUserId: 'u1', provider: 'google' };
const mockProvider = {
  findSentOperation: jest.fn(),
  send: jest.fn(),
};
const mockArchiveSyncedMessage = jest.fn();

jest.mock('../../../models/Mail/OAuthMailAccount', () => ({
  findOne: jest.fn(() => ({ select: jest.fn().mockResolvedValue(mockAccount) })),
}));
jest.mock('../../../models/Mail/MailMatterLink', () => ({ findOneAndUpdate: jest.fn() }));
jest.mock('../../../models/Mail/ArchivedMailMessage', () => ({}));
jest.mock('../providerFactory', () => ({ createMailProvider: jest.fn().mockResolvedValue(mockProvider) }));
jest.mock('../mailSyncService', () => ({ archiveSyncedMessage: (...args) => mockArchiveSyncedMessage(...args) }));

const service = require('../mailSendService');

describe('mailSendService — reprise après réponse réseau perdue', () => {
  beforeEach(() => {
    mockProvider.findSentOperation.mockReset();
    mockProvider.send.mockReset();
    mockArchiveSyncedMessage.mockReset().mockResolvedValue({ row: { _id: 'archived-1' } });
  });

  test('reconnaît le message déjà présent dans Envoyés et ne le renvoie jamais', async () => {
    mockProvider.findSentOperation.mockResolvedValue({
      providerMessageId: 'provider-1', providerThreadId: 'thread-1', providerStatus: 'reconciled',
    });
    const operation = {
      _id: 'op-1', tenantId: 't1', accountId: 'a1', ownerUserId: 'u1', provider: 'google',
      idempotencyKey: 'stable-key', stableMessageId: '<stable@example>', attemptCount: 2,
      status: 'preparing', providerMessageId: null, providerThreadId: null,
      from: { email: 'sender@example.fr' }, to: [{ email: 'recipient@example.fr' }], cc: [], bcc: [],
      subject: 'Objet', bodyText: 'Texte', bodyHtml: '', attachments: [], dossierId: null,
      save: jest.fn().mockResolvedValue(undefined),
    };
    const result = await service.runClaimedOperation(operation);
    expect(mockProvider.findSentOperation).toHaveBeenCalledWith(operation);
    expect(mockProvider.send).not.toHaveBeenCalled();
    expect(result.status).toBe('reconciled');
    expect(result.providerMessageId).toBe('provider-1');
    expect(result.archivedMessageId).toBe('archived-1');
  });
});
