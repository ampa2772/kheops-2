const mockTaskFindOneAndUpdate = jest.fn();
const mockTaskFindById = jest.fn();
const mockTaskUpdateOne = jest.fn();
const mockEventCreate = jest.fn();
const mockSettle = jest.fn();
const mockRelease = jest.fn();
const mockCreateArtifact = jest.fn();

jest.mock('../../../models/AI/AITask', () => ({
  findOneAndUpdate: (...args) => mockTaskFindOneAndUpdate(...args),
  findById: (...args) => mockTaskFindById(...args),
  updateOne: (...args) => mockTaskUpdateOne(...args),
}));
jest.mock('../../../models/AI/AITaskEvent', () => ({ create: (...args) => mockEventCreate(...args) }));
jest.mock('../../../models/AI/AIArtifact', () => ({}));
jest.mock('../../../models/AI/AIBudgetReservation', () => ({ findById: jest.fn(async () => ({ _id: 'reservation', state: 'active' })) }));
jest.mock('../connectionService', () => ({
  loadUsableConnection: jest.fn(async () => ({ _id: 'connection', provider: 'openai', defaultModel: 'model', secretRef: 'secret', rules: { maxOutputTokens: 100 } })),
  recordConnectionSuccess: jest.fn(async () => {}), recordConnectionFailure: jest.fn(async () => {}),
}));
jest.mock('../secretProvider', () => ({ createSecretProvider: jest.fn() }));
jest.mock('../gateway', () => ({ AIGateway: jest.fn() }));
jest.mock('../contextService', () => ({
  buildContext: jest.fn(async () => ({ contextText: '<SOURCE id="S1">fait</SOURCE>', anchors: [{ sourceId: 'S1' }], warnings: [] })),
  citedAnchors: jest.fn(() => [{ sourceId: 'S1' }]),
}));
jest.mock('../promptRegistry', () => ({
  getPrompt: jest.fn(async () => ({ templateId: 't', version: 1, systemInstruction: 'system', userTemplate: '{{context}} {{instruction}}' })),
  renderPrompt: jest.fn(() => 'prompt'), normalizeTaskType: jest.fn((value) => value),
}));
jest.mock('../catalogueService', () => ({
  getCatalogueEntry: jest.fn(async () => ({ version: 'v1', inputPerMillion: 1, outputPerMillion: 1, currency: 'EUR' })),
  calculateCost: jest.fn(() => 0.01), ledgerRates: jest.fn(() => ({ catalogueVersion: 'v1', inputUnitCost: 1, outputUnitCost: 1 })),
  estimateRequest: jest.fn(),
}));
jest.mock('../budgetService', () => ({
  settle: (...args) => mockSettle(...args), release: (...args) => mockRelease(...args),
  renew: jest.fn(async () => ({ _id: 'reservation', state: 'active' })),
  getOrCreatePolicy: jest.fn(), budgetPreview: jest.fn(), reserve: jest.fn(), releaseExpired: jest.fn(),
}));
jest.mock('../artifactService', () => ({ createResponseArtifact: (...args) => mockCreateArtifact(...args) }));
jest.mock('../auditService', () => ({ record: jest.fn(async () => null) }));
jest.mock('../tenantRoleService', () => ({ getTenantRole: jest.fn(async () => 'owner') }));

const { runClaimedTask } = require('../taskService');

describe('durable AI task cancellation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    let sequence = 0;
    mockTaskFindOneAndUpdate.mockImplementation(async () => ({ tenantId: 'tenant', eventSequence: ++sequence, retentionUntil: new Date(Date.now() + 100000) }));
    mockTaskUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mockEventCreate.mockResolvedValue({});
    let cancellationCheck = 0;
    mockTaskFindById.mockImplementation(() => ({
      select: () => ({
        lean: async () => ({ status: ++cancellationCheck >= 3 ? 'cancel_requested' : 'running', cancellationRequestedAt: cancellationCheck >= 3 ? new Date() : null }),
      }),
    }));
    mockSettle.mockResolvedValue({ state: 'settled' });
    mockRelease.mockResolvedValue({ state: 'released' });
  });

  test('settles provider usage but never creates an artifact after cancellation wins', async () => {
    const task = {
      _id: 'task', tenantId: 'tenant', matterId: 'matter', userId: 'user', connectionId: 'connection',
      provider: 'openai', model: 'model', taskType: 'summary', status: 'preparing',
      contextManifest: {}, userInstruction: '', estimatedUsage: { outputTokens: 100 },
      currency: 'EUR', budgetReservationId: 'reservation', attempts: 1, maxAttempts: 3,
      retentionUntil: new Date(Date.now() + 100000), leaseOwner: 'worker',
    };
    const secretProvider = { access: jest.fn(async () => 'api-key') };
    const gateway = { generate: jest.fn(async () => ({ text: 'Résultat [S1]', usage: { inputTokens: 10, outputTokens: 4 }, providerRequestId: 'request' })) };
    await runClaimedTask(task, { secretProvider, gateway });
    expect(mockSettle).toHaveBeenCalledTimes(1);
    expect(mockCreateArtifact).not.toHaveBeenCalled();
    expect(mockTaskUpdateOne.mock.calls.some((call) => call[1]?.$set?.status === 'cancelled')).toBe(true);
  });
});
