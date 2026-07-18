const {
  createMicrosoftOAuthState,
  readMicrosoftOAuthState,
} = require('../microsoftOAuthState');

const secret = 'test-secret-long-enough-for-oauth-state-2026';
const verifier = 'v'.repeat(64);
const browserNonce = 'b'.repeat(48);

describe('microsoftOAuthState', () => {
  test('transporte le PKCE de connexion sans stockage mémoire', () => {
    const state = createMicrosoftOAuthState({ flow: 'login', verifier, browserNonce }, { secret, now: 1_000_000 });
    const decoded = readMicrosoftOAuthState(state, { secret, now: 1_000_100 });
    expect(decoded).toMatchObject({ flow: 'login', verifier, browserNonce });
    expect(decoded.nonce).toBeTruthy();
    expect(state).not.toContain(verifier);
  });

  test('lie le consentement OneDrive à l’utilisateur Kheops authentifié', () => {
    const state = createMicrosoftOAuthState({ flow: 'onedrive', verifier, browserNonce, connectUserId: 'user-42' }, { secret, now: 2_000_000 });
    expect(readMicrosoftOAuthState(state, { secret, now: 2_000_500 })).toMatchObject({
      flow: 'onedrive', verifier, connectUserId: 'user-42',
    });
  });

  test('lie aussi le consentement SharePoint à l’utilisateur Kheops authentifié', () => {
    const token = createMicrosoftOAuthState({
      flow: 'sharepoint',
      verifier: 's'.repeat(64),
      browserNonce: 'n'.repeat(43),
      connectUserId: '64b64b64b64b64b64b64b64b',
    }, { secret, now: 1000 });
    expect(readMicrosoftOAuthState(token, { secret, now: 2000 })).toEqual(expect.objectContaining({
      flow: 'sharepoint',
      connectUserId: '64b64b64b64b64b64b64b64b',
    }));
  });

  test('lie une boîte Outlook additionnelle sans changer le login Kheops', () => {
    const state = createMicrosoftOAuthState({
      flow: 'mail', verifier, browserNonce, connectUserId: 'user-99',
    }, { secret, now: 2_500_000 });
    expect(readMicrosoftOAuthState(state, { secret, now: 2_500_500 })).toMatchObject({
      flow: 'mail', verifier, connectUserId: 'user-99',
    });
  });

  test('refuse une modification, une mauvaise clé et un état expiré', () => {
    const state = createMicrosoftOAuthState({ flow: 'login', verifier, browserNonce }, { secret, now: 3_000_000, ttlMs: 60_000 });
    const altered = `${state.slice(0, -2)}aa`;
    expect(() => readMicrosoftOAuthState(altered, { secret, now: 3_000_100 })).toThrow(/invalide/i);
    expect(() => readMicrosoftOAuthState(state, { secret: `${secret}-different`, now: 3_000_100 })).toThrow(/invalide/i);
    expect(() => readMicrosoftOAuthState(state, { secret, now: 3_060_001 })).toThrow(/expiré/i);
  });
});
