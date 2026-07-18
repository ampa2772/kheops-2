const mockState = {
  _id: 'state-1',
  initialSyncComplete: false,
  cursor: null,
  continuation: null,
  failureCount: 0,
  leaseOwner: null,
  leaseUntil: null,
  save: jest.fn().mockResolvedValue(undefined),
};

const mockSyncState = {
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  updateMany: jest.fn(),
};

jest.mock('../../../models/Mail/MailSyncState', () => mockSyncState);
jest.mock('../../../models/Mail/ArchivedMailMessage', () => ({
  findOne: jest.fn(), create: jest.fn(), updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
}));

const service = require('../mailSyncService');

function prepareState(overrides = {}) {
  Object.assign(mockState, {
    initialSyncComplete: false,
    cursor: null,
    continuation: null,
    failureCount: 0,
    leaseOwner: null,
    leaseUntil: null,
    lastErrorCode: null,
    ...overrides,
  });
  mockState.save.mockClear();
  mockSyncState.findOneAndUpdate.mockReset();
  mockSyncState.findOneAndUpdate.mockResolvedValueOnce(mockState).mockResolvedValueOnce(mockState);
  mockSyncState.updateOne.mockClear();
}

describe('mailSyncService — reprise des curseurs', () => {
  test('termine une synchronisation initiale paginée et garde le curseur final', async () => {
    prepareState();
    const provider = {
      initialSync: jest.fn()
        .mockResolvedValueOnce({ messages: [], deletedProviderIds: [], continuation: 'page-2', cursor: null })
        .mockResolvedValueOnce({ messages: [], deletedProviderIds: [], continuation: null, cursor: 'history-20' }),
      incrementalSync: jest.fn(),
    };
    const result = await service.syncFolder({
      account: { _id: 'a1', tenantId: 't1', provider: 'google' },
      provider,
      folderKey: 'mailbox',
      forceFull: false,
      owner: 'worker-1',
      leaseMs: 60000,
      maxPages: 5,
      pageSize: 100,
    });
    expect(result).toMatchObject({ pages: 2, needsContinuation: false });
    expect(provider.initialSync).toHaveBeenNthCalledWith(2, expect.objectContaining({ continuation: 'page-2' }));
    expect(mockState.initialSyncComplete).toBe(true);
    expect(mockState.cursor).toBe('history-20');
    const leaseQuery = mockSyncState.findOneAndUpdate.mock.calls[1][0];
    expect(leaseQuery.$or).toEqual([
      { leaseUntil: null },
      { leaseUntil: { $lt: expect.any(Date) } },
    ]);
    expect(JSON.stringify(leaseQuery)).not.toContain('leaseOwner');
    expect(mockSyncState.updateOne).toHaveBeenCalledWith(expect.any(Object), { $set: { leaseOwner: null, leaseUntil: null } });
  });

  test('un curseur expiré bascule vers une synchronisation complète', async () => {
    prepareState({ initialSyncComplete: true, cursor: 'expired-history' });
    const expired = Object.assign(new Error('expired'), { code: 'MAIL_CURSOR_EXPIRED', requiresFullSync: true });
    const provider = {
      incrementalSync: jest.fn().mockRejectedValue(expired),
      initialSync: jest.fn().mockResolvedValue({ messages: [], deletedProviderIds: [], continuation: null, cursor: 'fresh-history' }),
    };
    await service.syncFolder({
      account: { _id: 'a1', tenantId: 't1', provider: 'google' },
      provider,
      folderKey: 'mailbox',
      forceFull: false,
      owner: 'worker-1',
      leaseMs: 60000,
      maxPages: 2,
      pageSize: 100,
    });
    expect(provider.incrementalSync).toHaveBeenCalledWith(expect.objectContaining({ cursor: 'expired-history' }));
    expect(provider.initialSync).toHaveBeenCalledWith(expect.objectContaining({ continuation: null }));
    expect(mockState.cursor).toBe('fresh-history');
    expect(mockState.initialSyncComplete).toBe(true);
  });
});
