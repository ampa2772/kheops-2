jest.mock('../../../models/AI/AIBudgetPolicy', () => ({ findOneAndUpdate: jest.fn() }));
jest.mock('../../../models/AI/AIProviderConnection', () => ({ findOne: jest.fn() }));

const AIBudgetPolicy = require('../../../models/AI/AIBudgetPolicy');
const AIProviderConnection = require('../../../models/AI/AIProviderConnection');
const { ensureDefaultBudgetPolicy, rotateSecret, normalizeAllowedModels, refreshConnectionModels } = require('../connectionService');

describe('AI connection default budget', () => {
  beforeEach(() => jest.clearAllMocks());

  test('creates/updates a personal 5 EUR daily / 50 EUR monthly policy before first task', async () => {
    AIBudgetPolicy.findOneAndUpdate.mockResolvedValue({ _id: 'policy' });
    await ensureDefaultBudgetPolicy({
      tenantId: 'tenant', userId: 'user', ownerType: 'user',
      budget: { hardDailyLimit: 5, hardMonthlyLimit: 50, perTaskLimit: 8 },
    });
    const [filter, update, options] = AIBudgetPolicy.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ tenantId: 'tenant', scopeType: 'user', scopeId: 'user' });
    expect(update.$set).toMatchObject({ hardDailyLimit: 5, hardMonthlyLimit: 50, perTaskLimit: 8, updatedBy: 'user' });
    expect(options).toMatchObject({ upsert: true, runValidators: true });
  });

  test('requires a finite period limit when the simple budget mode is requested', async () => {
    await expect(ensureDefaultBudgetPolicy({
      tenantId: 'tenant', userId: 'user', ownerType: 'user',
      budget: { periodType: 'week', periodLimit: null },
    })).rejects.toMatchObject({ code: 'AI_BUDGET_PERIOD_LIMIT_REQUIRED' });
    expect(AIBudgetPolicy.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('a simple period replaces the legacy hidden daily and monthly limits', async () => {
    AIBudgetPolicy.findOneAndUpdate.mockResolvedValue({ _id: 'policy' });
    await ensureDefaultBudgetPolicy({
      tenantId: 'tenant', userId: 'user', ownerType: 'user',
      budget: { periodType: 'week', periodLimit: 12, customPeriodDays: 30, perTaskLimit: 4 },
    });
    const [, update] = AIBudgetPolicy.findOneAndUpdate.mock.calls[0];
    expect(update.$set).toMatchObject({
      periodType: 'week', periodLimit: 12, perTaskLimit: 4,
      hardDailyLimit: null, hardMonthlyLimit: null,
      softDailyLimit: null, softMonthlyLimit: null,
    });
  });

  test('tests a replacement key before swapping and keeps the old ref on failure', async () => {
    const doc = {
      _id: 'connection', ownerType: 'user', ownerId: 'user', provider: 'openai',
      secretRef: 'old-ref', defaultModel: 'model', allowedModels: ['model'],
      pendingSecretCleanupRefs: [], save: jest.fn(),
    };
    AIProviderConnection.findOne.mockReturnValue({ select: async () => doc });
    const secretProvider = {
      store: jest.fn(async () => ({ secretRef: 'new-ref', fingerprint: 'fingerprint' })),
      destroy: jest.fn(async () => {}),
    };
    const gateway = { testConnection: jest.fn(async () => { throw Object.assign(new Error('invalid'), { code: 'AI_PROVIDER_KEY_INVALID' }); }) };
    await expect(rotateSecret({ tenantId: 'tenant', userId: 'user', connectionId: 'connection', apiKey: 'bad-key', secretProvider, gateway }))
      .rejects.toMatchObject({ code: 'AI_PROVIDER_KEY_INVALID' });
    expect(doc.secretRef).toBe('old-ref');
    expect(doc.save).not.toHaveBeenCalled();
    expect(secretProvider.destroy).toHaveBeenCalledWith({ tenantId: 'tenant', secretRef: 'new-ref' });
  });

  test('an empty allowlist is safely replaced by the default model', () => {
    expect(normalizeAllowedModels('model-default', [])).toEqual(['model-default']);
    expect(() => normalizeAllowedModels('model-default', ['other-model']))
      .toThrow(expect.objectContaining({ code: 'AI_DEFAULT_MODEL_FORBIDDEN' }));
  });

  test('refreshes and dates models with the stored secret, then serves the cache', async () => {
    const doc = {
      _id: 'connection', ownerType: 'user', ownerId: 'user', provider: 'openai',
      secretRef: 'secret-ref', defaultModel: 'gpt-4o', allowedModels: ['gpt-4o'],
      discoveredModels: [], modelsRefreshedAt: null, save: jest.fn(async () => {}),
      toObject() { return { ...this }; },
    };
    AIProviderConnection.findOne.mockReturnValue({ select: async () => doc });
    const secretProvider = { access: jest.fn(async () => 'stored-key') };
    const gateway = { listModels: jest.fn(async () => ['text-embedding-3-small', 'gpt-4o', 'gpt-5']) };
    const first = await refreshConnectionModels({
      tenantId: 'tenant', userId: 'user', connectionId: 'connection', force: true,
      secretProvider, gateway, now: new Date('2026-07-11T10:00:00Z'),
    });
    expect(first).toMatchObject({ cached: false, models: ['gpt-5', 'gpt-4o'], recommendedModel: 'gpt-5' });
    expect(secretProvider.access).toHaveBeenCalledWith({ tenantId: 'tenant', secretRef: 'secret-ref' });
    expect(doc.save).toHaveBeenCalled();

    gateway.listModels.mockClear();
    const cached = await refreshConnectionModels({
      tenantId: 'tenant', userId: 'user', connectionId: 'connection', force: false,
      secretProvider, gateway, now: new Date('2026-07-11T10:30:00Z'),
    });
    expect(cached.cached).toBe(true);
    expect(gateway.listModels).not.toHaveBeenCalled();
  });
});
