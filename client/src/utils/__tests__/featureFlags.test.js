import { getFeatureFlags, isFeatureEnabled } from '../featureFlags';

describe('featureFlags', () => {
  const previous = window.__KHEOPS_CONFIG__;

  afterEach(() => {
    window.__KHEOPS_CONFIG__ = previous;
    delete process.env.REACT_APP_FEATURE_AI_ASSISTANT;
  });

  test('active les lots livrés par défaut', () => {
    window.__KHEOPS_CONFIG__ = {};
    expect(getFeatureFlags()).toEqual(expect.objectContaining({
      aiAssistant: true,
      responsiveEditor: true,
      relationGraph: true,
      documentSyncV2: true,
    }));
  });

  test('la configuration runtime peut désactiver immédiatement une fonction', () => {
    window.__KHEOPS_CONFIG__ = { features: { aiAssistant: false } };
    expect(isFeatureEnabled('aiAssistant')).toBe(false);
  });

  test('la configuration runtime est prioritaire sur la valeur de build', () => {
    process.env.REACT_APP_FEATURE_AI_ASSISTANT = 'true';
    window.__KHEOPS_CONFIG__ = { features: { aiAssistant: false } };
    expect(isFeatureEnabled('aiAssistant')).toBe(false);
  });
});
