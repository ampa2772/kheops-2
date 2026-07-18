const aiRouter = require('../ai');
const { taskLeaseMs, contentRetentionDays, workerConcurrency, pricingEntryForTask } = require('../../services/ai/taskService');
const AITask = require('../../models/AI/AITask');

function routePaths(router) {
  return router.stack.filter((layer) => layer.route).map((layer) => ({
    path: layer.route.path,
    methods: Object.keys(layer.route.methods),
  }));
}

describe('AI route contract', () => {
  test('normalizes the frontend assistant payload', () => {
    const normalized = aiRouter._normalizeTaskBody({
      taskType: 'draft-letter', prompt: 'Prépare le courrier', connectionId: 'connection', model: 'model',
      context: {
        sources: [{ documentId: 'doc-1', kind: 'document', version: 'v3' }],
        selection: { documentId: 'doc-1', text: 'passage' }, metadata: true, contacts: true, timeline: true, versions: 'all',
      },
      humanValidationRequired: true,
    });
    expect(normalized.userInstruction).toBe('Prépare le courrier');
    expect(normalized.contextManifest).toMatchObject({
      documentIds: ['doc-1'], currentDocumentId: 'doc-1', selectedText: 'passage',
      includeMatterData: true, includeContacts: true, includeTimeline: true,
      includeAllVersions: true, requestedVersions: { 'doc-1': 'v3' },
    });
  });

  test('treats current/latest version markers as the current version, never as an id', () => {
    const normalized = aiRouter._normalizeTaskBody({
      taskType: 'summary', connectionId: 'connection',
      context: { sources: [{ documentId: 'doc-1', version: 'courante' }, { documentId: 'doc-2', version: 'latest' }] },
      contextManifest: { requestedVersions: { 'doc-3': 'current', 'doc-4': 'v8' } },
    });
    expect(normalized.contextManifest.requestedVersions).toEqual({ 'doc-4': 'v8' });
  });

  test('exposes all frontend and human-validation endpoints', () => {
    const routes = routePaths(aiRouter);
    const has = (method, path) => routes.some((route) => route.path === path && route.methods.includes(method));
    expect(has('get', '/ai/providers')).toBe(true);
    expect(has('get', '/ai/cost-notice')).toBe(true);
    expect(has('put', '/ai/cost-notice/consent')).toBe(true);
    expect(has('post', '/ai/providers/detect')).toBe(true);
    expect(has('post', '/ai/providers/:provider/discover-models')).toBe(true);
    expect(has('get', '/ai/connections/:id/models')).toBe(true);
    expect(has('post', '/ai/connections/:id/refresh-models')).toBe(true);
    expect(has('post', '/matters/:matterId/ai/preflight')).toBe(true);
    expect(has('post', '/matters/:matterId/ai/tasks')).toBe(true);
    expect(has('get', '/ai/tasks/:id')).toBe(true);
    expect(has('get', '/ai/tasks/:id/events')).toBe(true);
    expect(has('get', '/ai/tasks/:id/result')).toBe(true);
    expect(has('post', '/ai/tasks/:id/cancel')).toBe(true);
    expect(has('post', '/ai/tasks/:id/create-document')).toBe(true);
    expect(has('post', '/documents/:id/ai/apply-proposal')).toBe(true);
    expect(has('post', '/documents/:id/ai/validate')).toBe(true);
    expect(has('get', '/ai/budgets')).toBe(true);
  });

  test('honours bounded deployment controls for leases, retention and concurrency', () => {
    expect(taskLeaseMs({ AI_TASK_LEASE_MS: '900000' })).toBe(900000);
    expect(contentRetentionDays({ rules: { retentionDays: 90 } }, { AI_CONTENT_RETENTION_DAYS: '30' })).toBe(30);
    expect(workerConcurrency({ AI_TASK_CONCURRENCY: '99' })).toBe(10);
  });

  test('provider descriptors always expose models as an array', async () => {
    const providers = await aiRouter._providerDescriptors();
    expect(providers).toHaveLength(3);
    for (const provider of providers) {
      expect(Array.isArray(provider.models)).toBe(true);
      expect(provider.modelDiscovery).toBe('after-connection');
    }
  });

  test('task source anchors persist citation and native block identifiers', () => {
    const anchorSchema = AITask.schema.path('sourceAnchors').schema;
    expect(anchorSchema.path('sourceId').isRequired).toBe(true);
    expect(anchorSchema.path('blockId')).toBeDefined();
  });

  test('full result exposes both flat frontend fields and structured artifact data', () => {
    const result = aiRouter._publicTaskResult(
      { _id: 'task', actualUsage: { outputTokens: 5 }, actualCost: 0.01, currency: 'EUR' },
      { _id: 'artifact', title: 'Résultat', content: { text: 'Texte complet' }, sourceAnchors: [{ sourceId: 'S1' }], validationStatus: 'ai_draft_pending_validation' },
    );
    expect(result).toMatchObject({ text: 'Texte complet', sourceAnchors: [{ sourceId: 'S1' }], actualUsage: { outputTokens: 5 }, actualCost: 0.01, currency: 'EUR' });
  });

  test('budget edit rights never allow another user policy', () => {
    expect(aiRouter._canManageBudgetPolicy({ scopeType: 'user', scopeId: 'user-a' }, 'user-a', 'avocat')).toBe(true);
    expect(aiRouter._canManageBudgetPolicy({ scopeType: 'user', scopeId: 'user-b' }, 'user-a', 'avocat')).toBe(false);
    expect(aiRouter._canManageBudgetPolicy({ scopeType: 'tenant', scopeId: null }, 'user-a', 'avocat')).toBe(false);
    expect(aiRouter._canManageBudgetPolicy({ scopeType: 'tenant' }, 'admin', 'admin')).toBe(true);
  });

  test('worker cost uses the pricing snapshot persisted at enqueue time', async () => {
    const entry = await pricingEntryForTask({
      provider: 'openai', model: 'model',
      pricingSnapshot: {
        catalogueVersion: 'catalogue-A', currency: 'EUR',
        inputPerMillion: 1, outputPerMillion: 2, cachedInputPerMillion: 0.5, minimumCharge: 0,
      },
    });
    expect(entry).toMatchObject({ version: 'catalogue-A', inputPerMillion: 1, outputPerMillion: 2 });
  });
});
