const {
  eligibleNotificationEmails,
  isEligibleNotificationSender,
  normalizeEmail,
} = require('../mailNotificationEligibility');

function contactData(...contexts) {
  return { contexts, fullContact: {} };
}

describe('éligibilité des expéditeurs pour la cloche e-mail', () => {
  const currentUserEmail = 'User@Example.com ';

  test('normalise les adresses sans modifier les valeurs invalides', () => {
    expect(normalizeEmail(' User@Example.com ')).toBe('user@example.com');
    expect(normalizeEmail(null)).toBe('');
  });

  test('accepte un tiers connu, même sans dossier', () => {
    const contacts = new Map([
      ['client@example.com', contactData({ dossierId: null })],
    ]);
    expect(isEligibleNotificationSender('CLIENT@example.com', currentUserEmail, contacts)).toBe(true);
  });

  test('accepte un auto-message seulement quand le contact est lié à un dossier', () => {
    const contacts = new Map([
      ['user@example.com', contactData(
        { dossierId: null, source: 'Contact Global' },
        { dossierId: 'dossier-123', source: 'Contexte Dossier' },
      )],
    ]);
    expect(isEligibleNotificationSender('USER@example.com', currentUserEmail, contacts)).toBe(true);
  });

  test('refuse un auto-message pour un contact uniquement global', () => {
    const contacts = new Map([
      ['user@example.com', contactData({ dossierId: null, source: 'Contact Global' })],
    ]);
    expect(isEligibleNotificationSender('user@example.com', currentUserEmail, contacts)).toBe(false);
  });

  test('refuse un expéditeur absent ou invalide', () => {
    const contacts = new Map();
    expect(isEligibleNotificationSender('missing@example.com', currentUserEmail, contacts)).toBe(false);
    expect(isEligibleNotificationSender('', currentUserEmail, contacts)).toBe(false);
  });

  test('construit le même ensemble éligible pour le badge Gmail et Microsoft', () => {
    const contacts = new Map([
      ['user@example.com', contactData({ dossierId: 'dossier-123' })],
      ['client@example.com', contactData({ dossierId: null })],
      ['global-self@example.com', contactData({ dossierId: null })],
    ]);
    expect(eligibleNotificationEmails(contacts, currentUserEmail)).toEqual([
      'user@example.com',
      'client@example.com',
      'global-self@example.com',
    ]);
  });
});
