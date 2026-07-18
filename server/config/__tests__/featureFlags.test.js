const { all, enabled, envName } = require('../featureFlags');

describe('featureFlags', () => {
  test('fournit des valeurs sûres et réversibles', () => {
    expect(all({})).toEqual({
      aiAssistant: true,
      responsiveEditor: true,
      relationGraph: true,
      documentSyncV2: true,
      officeEngine: true,
    });
  });

  test('interprète les désactivations explicites', () => {
    expect(envName('aiAssistant')).toBe('KHEOPS_FEATURE_AI_ASSISTANT');
    expect(enabled('aiAssistant', { KHEOPS_FEATURE_AI_ASSISTANT: 'false' })).toBe(false);
    expect(enabled('aiAssistant', { KHEOPS_FEATURE_AI_ASSISTANT: '1' })).toBe(true);
    expect(envName('officeEngine')).toBe('KHEOPS_FEATURE_OFFICE_ENGINE');
    expect(enabled('officeEngine', { KHEOPS_FEATURE_OFFICE_ENGINE: 'false' })).toBe(false);
  });
});
