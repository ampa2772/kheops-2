const mockCreate = jest.fn();
jest.mock('../../../models/AI/AIAuditEvent', () => ({ create: (...args) => mockCreate(...args) }));

const audit = require('../auditService');

describe('AI audit retention', () => {
  test('uses bounded AI_AUDIT_RETENTION_DAYS and never stores secret details', async () => {
    const previous = process.env.AI_AUDIT_RETENTION_DAYS;
    process.env.AI_AUDIT_RETENTION_DAYS = '730';
    mockCreate.mockImplementation(async (payload) => payload);
    const before = Date.now();
    await audit.record({
      tenantId: 'tenant', actorUserId: 'user', action: 'test', resourceType: 'AITask',
      details: { apiKey: 'sk-secret-never-store', model: 'model' },
    });
    const payload = mockCreate.mock.calls[0][0];
    expect(payload.details.apiKey).toBe('[SECRET_REDACTED]');
    expect(payload.retentionUntil.getTime()).toBeGreaterThanOrEqual(before + 729 * 86400000);
    if (previous === undefined) delete process.env.AI_AUDIT_RETENTION_DAYS;
    else process.env.AI_AUDIT_RETENTION_DAYS = previous;
  });
});
