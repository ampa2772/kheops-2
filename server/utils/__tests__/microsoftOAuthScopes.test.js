const {
  MICROSOFT_LOGIN_SCOPES,
  MICROSOFT_MAIL_SCOPES,
  MICROSOFT_ONEDRIVE_SCOPES,
  MICROSOFT_SHAREPOINT_SCOPES,
  classifyMicrosoftAccountType,
} = require('../microsoftOAuthScopes');

describe('consentements OAuth Microsoft séparés', () => {
  test('la connexion Kheops demande uniquement l’identité', () => {
    const scopes = MICROSOFT_LOGIN_SCOPES.join(' ');
    expect(scopes).toMatch(/User\.Read/);
    expect(scopes).not.toMatch(/Mail\.|Calendars\.|Contacts\.|Files\.|Sites\./);
  });

  test('la connexion mail dédiée porte les droits Outlook nécessaires sans droit documentaire', () => {
    const scopes = MICROSOFT_MAIL_SCOPES.join(' ');
    expect(scopes).toMatch(/Mail\.Read/);
    expect(scopes).toMatch(/Calendars\.Read/);
    expect(scopes).not.toMatch(/Files\./);
    expect(scopes).not.toMatch(/Sites\./);
  });

  test('le consentement OneDrive est limité aux fichiers de ce service', () => {
    expect(MICROSOFT_ONEDRIVE_SCOPES).toContain('Files.ReadWrite');
    expect(MICROSOFT_ONEDRIVE_SCOPES).toEqual(expect.arrayContaining(['openid', 'profile', 'email']));
    expect(MICROSOFT_ONEDRIVE_SCOPES.join(' ')).not.toMatch(/Mail\.|Sites\./);
  });

  test('SharePoint dispose de son propre consentement sans droit mail ni OneDrive', () => {
    expect(MICROSOFT_SHAREPOINT_SCOPES).toContain('Sites.ReadWrite.All');
    expect(MICROSOFT_SHAREPOINT_SCOPES).toEqual(expect.arrayContaining(['openid', 'profile', 'email']));
    expect(MICROSOFT_SHAREPOINT_SCOPES.join(' ')).not.toMatch(/Mail\.|Files\./);
  });

  test('classe les comptes personnels et professionnels de manière conservatrice', () => {
    expect(classifyMicrosoftAccountType({ tid: '9188040d-6c67-4c5b-b112-36a304b66dad' })).toBe('personal');
    expect(classifyMicrosoftAccountType({ tid: '11111111-2222-3333-4444-555555555555' })).toBe('organization');
    expect(classifyMicrosoftAccountType({})).toBe('personal');
  });
});
