const sync = require('../mailSyncService');

describe('mailSyncService — décisions pures', () => {
  test('sépare les curseurs Inbox/Sent Microsoft et unifie Gmail', () => {
    expect(sync.syncFolders({ provider: 'microsoft' })).toEqual(['inbox', 'sentitems']);
    expect(sync.syncFolders({ provider: 'google' })).toEqual(['mailbox']);
  });

  test('ne relance pas une autorisation révoquée, mais relance une panne fournisseur', () => {
    expect(sync.isRetryable({ code: 'MAIL_REAUTH_REQUIRED' })).toBe(false);
    expect(sync.isRetryable({ response: { status: 503 } })).toBe(true);
    expect(sync.isRetryable({ response: { status: 400 } })).toBe(false);
    expect(sync.isRetryable({ requiresFullSync: true, response: { status: 404 } })).toBe(true);
  });

  test('réduit les erreurs à un diagnostic sans contenu confidentiel additionnel', () => {
    const result = sync.safeError({ code: 'QUOTA', message: 'Quota temporaire' });
    expect(result).toMatchObject({ code: 'QUOTA', message: 'Quota temporaire' });
    expect(result.at).toBeInstanceOf(Date);
  });
});
