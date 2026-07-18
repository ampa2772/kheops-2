const {
  detectProviderHint,
  buildModelDiscovery,
  cacheIsFresh,
} = require('../modelDiscoveryService');

describe('AI cautious provider and model discovery', () => {
  test('detects only distinctive local prefixes and never guesses a generic sk key', () => {
    expect(detectProviderHint(`sk-ant-${'a'.repeat(24)}`)).toMatchObject({ provider: 'anthropic', manualRequired: false });
    expect(detectProviderHint(`AIza${'a'.repeat(28)}`)).toMatchObject({ provider: 'gemini', manualRequired: false });
    expect(detectProviderHint(`sk-proj-${'a'.repeat(24)}`)).toMatchObject({ provider: 'openai', manualRequired: false });
    expect(detectProviderHint(`sk-${'a'.repeat(24)}`)).toMatchObject({ provider: null, confidence: 'ambiguous', manualRequired: true });
  });

  test('filters non-assistant models and marks one compatible model as recommended', () => {
    const result = buildModelDiscovery('openai', [
      'text-embedding-3-large',
      'gpt-4o-mini',
      'gpt-5',
      'dall-e-3',
    ], { now: new Date('2026-07-11T10:00:00Z') });
    expect(result.models).toEqual(['gpt-5', 'gpt-4o-mini']);
    expect(result.recommendedModel).toBe('gpt-5');
    expect(result.modelOptions[0]).toMatchObject({ id: 'gpt-5', recommended: true, capabilities: { text: true } });
  });

  test('uses a bounded dated cache without exposing any secret', () => {
    const now = new Date('2026-07-11T12:00:00Z');
    expect(cacheIsFresh({
      modelsRefreshedAt: new Date('2026-07-11T11:30:00Z'),
      discoveredModels: [{ id: 'model' }],
    }, { now, env: { AI_MODEL_DISCOVERY_TTL_MS: String(60 * 60 * 1000) } })).toBe(true);
    expect(cacheIsFresh({
      modelsRefreshedAt: new Date('2026-07-11T09:00:00Z'),
      discoveredModels: [{ id: 'model' }],
    }, { now, env: { AI_MODEL_DISCOVERY_TTL_MS: String(60 * 60 * 1000) } })).toBe(false);
  });
});
