const service = require('../mailSubscriptionService');

describe('mailSubscriptionService — sécurité des notifications', () => {
  const before = process.env.MAIL_WEBHOOK_SECRET;
  afterEach(() => {
    if (before === undefined) delete process.env.MAIL_WEBHOOK_SECRET;
    else process.env.MAIL_WEBHOOK_SECRET = before;
  });

  test('dérive un clientState stable sans stocker le secret brut', () => {
    process.env.MAIL_WEBHOOK_SECRET = 'a'.repeat(64);
    const state = service.deriveClientState({ accountId: 'account-1', resource: '/me/messages' });
    expect(state).toBe(service.deriveClientState({ accountId: 'account-1', resource: '/me/messages' }));
    expect(state).not.toContain('account-1');
    expect(service.hashClientState(state)).toHaveLength(64);
  });

  test('refuse un secret webhook trop court', () => {
    process.env.MAIL_WEBHOOK_SECRET = 'court';
    expect(() => service.assertWebhookSecret()).toThrow(/32 caractères/);
  });

  test('compare en temps constant seulement des valeurs de même longueur', () => {
    expect(service.constantTimeEqual('abc', 'abc')).toBe(true);
    expect(service.constantTimeEqual('abc', 'abd')).toBe(false);
    expect(service.constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(service.constantTimeEqual('', '')).toBe(false);
  });

  test('décode une notification Pub/Sub Gmail valide', () => {
    const payload = {
      message: {
        messageId: 'push-1',
        data: Buffer.from(JSON.stringify({ emailAddress: 'User@Example.fr', historyId: '123' })).toString('base64'),
      },
    };
    expect(service.decodeGoogleNotification(payload)).toEqual({
      emailAddress: 'user@example.fr',
      historyId: '123',
      messageId: 'push-1',
    });
    expect(() => service.decodeGoogleNotification({})).toThrow(/vide/);
  });

  test('programme le renouvellement avant expiration', () => {
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    const renew = service.renewalDate(expires, 20 * 60 * 1000);
    expect(renew.getTime()).toBeLessThan(expires.getTime());
    expect(renew.getTime()).toBeGreaterThan(Date.now());
  });
});
