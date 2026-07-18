const crypto = require('crypto');
const { redactSecrets, redactPersonalData, safeAuditDetails } = require('../redaction');
const { EncryptedMongoSecretProvider, GcpSecretManagerProvider } = require('../secretProvider');

describe('AI redaction and secret vault', () => {
  test('redacts secrets recursively without mutating safe metadata', () => {
    const input = { provider: 'openai', apiKey: 'sk-test-abcdefghijklmnopqrstuvwxyz', nested: { Authorization: 'Bearer abc.def.ghi', model: 'x' } };
    const output = redactSecrets(input);
    expect(output.provider).toBe('openai');
    expect(output.apiKey).toBe('[SECRET_REDACTED]');
    expect(output.nested.Authorization).toBe('[SECRET_REDACTED]');
    expect(JSON.stringify(safeAuditDetails(input))).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  test('optionally redacts common personal-data categories', () => {
    const result = redactPersonalData('Contact test@example.com au 06 12 34 56 78.', ['email', 'phone']);
    expect(result).toContain('[EMAIL_REDACTED]');
    expect(result).toContain('[PHONE_REDACTED]');
    expect(result).not.toContain('test@example.com');
  });

  test('encrypted Mongo vault round-trips AES-256-GCM with tenant AAD', async () => {
    let stored;
    const model = {
      create: jest.fn(async (doc) => { stored = { ...doc }; return doc; }),
      findOne: jest.fn(() => ({
        select: () => ({ lean: async () => stored }),
      })),
      updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
    };
    const env = { AI_SECRET_MASTER_KEY: crypto.randomBytes(32).toString('base64') };
    const vault = new EncryptedMongoSecretProvider({ model, env });
    const created = await vault.store({ tenantId: 'tenant-a', secret: 'api-key-never-plain-in-db', createdBy: 'user-a' });
    expect(stored.ciphertext).not.toContain('api-key-never');
    await expect(vault.access({ tenantId: 'tenant-a', secretRef: created.secretRef })).resolves.toBe('api-key-never-plain-in-db');
    await expect(vault.access({ tenantId: 'tenant-b', secretRef: created.secretRef })).rejects.toMatchObject({ code: 'AI_SECRET_DECRYPTION_FAILED' });
  });

  test('GCP vault rejects altered refs outside the tenant kheops-ai prefix', () => {
    const vault = new GcpSecretManagerProvider({ fetchImpl: jest.fn(), env: { GOOGLE_CLOUD_PROJECT: 'project-1' } });
    expect(() => vault._resourceForTenant('gcp-sm://projects/project-1/secrets/JWT_SECRET', 'abc')).toThrow(expect.objectContaining({ code: 'AI_SECRET_SCOPE_INVALID' }));
    expect(vault._resourceForTenant('gcp-sm://projects/project-1/secrets/kheops-ai-abc-1234', 'abc')).toBe('projects/project-1/secrets/kheops-ai-abc-1234');
  });
});
