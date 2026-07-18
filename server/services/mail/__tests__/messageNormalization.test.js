const {
  normalizeEmail,
  normalizeRecipients,
  stripHtml,
  sanitizeArchivedHtml,
  stableMessageId,
  messageFingerprint,
  retryDelayMs,
} = require('../messageNormalization');

describe('messageNormalization', () => {
  test('normalise les adresses sans inventer de destinataire', () => {
    expect(normalizeEmail('Pierre <PIERRE@example.fr>')).toBe('pierre@example.fr');
    expect(normalizeRecipients('Alice <a@example.fr>; invalide; b@example.fr')).toEqual([
      { name: 'Alice', email: 'a@example.fr' },
      { name: '', email: 'b@example.fr' },
    ]);
  });

  test('assainit le HTML archivé et produit un texte lisible', () => {
    const html = '<style>x</style><p onclick="steal()">Bonjour &amp; bienvenue</p><script>alert(1)</script>';
    expect(stripHtml(html)).toBe('Bonjour & bienvenue');
    const safe = sanitizeArchivedHtml(html);
    expect(safe).not.toMatch(/script|onclick/i);
    expect(safe).toContain('Bonjour');
  });

  test('la clé idempotente donne un Message-ID stable et isolé par cabinet', () => {
    const one = stableMessageId({ tenantId: 't1', ownerUserId: 'u1', idempotencyKey: 'send-1' });
    const replay = stableMessageId({ tenantId: 't1', ownerUserId: 'u1', idempotencyKey: 'send-1' });
    const other = stableMessageId({ tenantId: 't2', ownerUserId: 'u1', idempotencyKey: 'send-1' });
    expect(one).toBe(replay);
    expect(one).not.toBe(other);
    expect(one).toMatch(/^<kheops-[a-f0-9]{40}@mail\.kheops\.local>$/);
  });

  test('l’empreinte déduplique une représentation identique', () => {
    const base = {
      internetMessageId: '<m1@example.fr>',
      from: 'A@example.fr',
      to: ['b@example.fr'],
      subject: 'Objet',
      sentAt: '2026-07-11T10:00:00Z',
      bodyText: 'Bonjour',
    };
    expect(messageFingerprint(base)).toBe(messageFingerprint({ ...base }));
    expect(messageFingerprint(base)).not.toBe(messageFingerprint({ ...base, subject: 'Autre' }));
  });

  test('la temporisation exponentielle reste bornée', () => {
    expect(retryDelayMs(1)).toBeGreaterThanOrEqual(5000);
    expect(retryDelayMs(20)).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(retryDelayMs(20)).toBeLessThan(60 * 60 * 1000 + 5000);
  });
});
