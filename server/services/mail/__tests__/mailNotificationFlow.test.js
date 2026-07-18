const mockEnqueueSync = jest.fn();
const mockSubscription = {
  findOne: jest.fn(),
};

jest.mock('../../../models/Mail/MailSubscription', () => mockSubscription);
jest.mock('../../../models/Mail/OAuthMailAccount', () => ({ find: jest.fn() }));
jest.mock('../mailSyncService', () => ({ enqueueSync: (...args) => mockEnqueueSync(...args) }));

const service = require('../mailSubscriptionService');

describe('mailSubscriptionService — notifications Microsoft', () => {
  beforeEach(() => {
    mockEnqueueSync.mockReset().mockResolvedValue({ job: { _id: 'job-1' }, reused: false });
    mockSubscription.findOne.mockReset();
  });

  test('valide clientState puis enfile une seule synchronisation idempotente', async () => {
    const clientState = 'secret-state';
    const subscription = {
      tenantId: 't1', accountId: 'a1', providerSubscriptionId: 'sub-1',
      clientStateHash: service.hashClientState(clientState),
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockSubscription.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(subscription) });
    const result = await service.processMicrosoftNotifications({
      value: [{ subscriptionId: 'sub-1', clientState, changeType: 'updated', resourceData: { id: 'message-9' } }],
    });
    expect(result.rejected).toEqual([]);
    expect(mockEnqueueSync).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'a1', trigger: 'notification', idempotencyKey: 'ms:sub-1:message-9:updated',
    }));
    expect(subscription.save).toHaveBeenCalled();
  });

  test('rejette silencieusement un clientState falsifié sans créer de tâche', async () => {
    mockSubscription.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({ clientStateHash: service.hashClientState('attendu') }),
    });
    const result = await service.processMicrosoftNotifications({
      value: [{ subscriptionId: 'sub-1', clientState: 'faux', changeType: 'created' }],
    });
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(mockEnqueueSync).not.toHaveBeenCalled();
  });
});
