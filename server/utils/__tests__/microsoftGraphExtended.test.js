// Tests A17-A19 (volet Graph étendu) — agenda + contacts Outlook, lecture seule.
// On simule _graphCall (le bas niveau authentifié de microsoftGraphMail) pour
// tester le formatage, la pagination et la traduction d'erreurs sans réseau.

jest.mock('../microsoftGraphMail', () => ({ _graphCall: jest.fn() }));

const { _graphCall } = require('../microsoftGraphMail');
const {
  listCalendarEvents, listContacts,
  _formatEvent, _formatContact, _translateScopeError,
} = require('../microsoftGraphExtended');

afterEach(() => jest.clearAllMocks());

describe('_formatEvent', () => {
  test('projette un événement Graph vers une forme sobre', () => {
    const ev = {
      id: 'E1',
      subject: 'RDV client',
      start: { dateTime: '2026-07-10T09:00:00', timeZone: 'Europe/Paris' },
      end: { dateTime: '2026-07-10T10:00:00', timeZone: 'Europe/Paris' },
      isAllDay: false,
      location: { displayName: 'Cabinet' },
      organizer: { emailAddress: { name: 'Me', address: 'me@x.fr' } },
      attendees: [{ emailAddress: { name: 'Client', address: 'c@x.fr' }, type: 'required' }],
      onlineMeeting: { joinUrl: 'https://teams/x' },
      webLink: 'https://outlook/x',
    };
    expect(_formatEvent(ev)).toEqual({
      id: 'E1',
      subject: 'RDV client',
      start: '2026-07-10T09:00:00',
      end: '2026-07-10T10:00:00',
      timeZone: 'Europe/Paris',
      isAllDay: false,
      location: 'Cabinet',
      organizer: { name: 'Me', email: 'me@x.fr', type: null },
      attendees: [{ name: 'Client', email: 'c@x.fr', type: 'required' }],
      onlineMeetingUrl: 'https://teams/x',
      webLink: 'https://outlook/x',
    });
  });

  test('valeurs manquantes → défauts sûrs, jamais de crash', () => {
    expect(_formatEvent({ id: 'E2' })).toEqual(expect.objectContaining({
      id: 'E2', subject: '(Sans objet)', start: null, end: null,
      location: null, organizer: null, attendees: [], onlineMeetingUrl: null,
    }));
    expect(_formatEvent(null)).toBeNull();
  });
});

describe('_formatContact', () => {
  test('agrège les e-mails et téléphones, déduit le nom affiché', () => {
    const c = {
      id: 'C1', givenName: 'Marie', surname: 'Durand',
      companyName: 'ACME', jobTitle: 'DG',
      emailAddresses: [{ address: 'marie@acme.fr' }, { address: 'm.durand@acme.fr' }],
      mobilePhone: '0600000000', businessPhones: ['0140000000'], homePhones: [],
    };
    expect(_formatContact(c)).toEqual({
      id: 'C1', displayName: 'Marie Durand', givenName: 'Marie', surname: 'Durand',
      company: 'ACME', jobTitle: 'DG',
      emails: ['marie@acme.fr', 'm.durand@acme.fr'],
      phones: ['0600000000', '0140000000'],
    });
  });

  test('sans nom explicite → composé prénom+nom ; listes vides tolérées', () => {
    expect(_formatContact({ id: 'C2', displayName: 'X' })).toEqual(expect.objectContaining({
      id: 'C2', displayName: 'X', emails: [], phones: [],
    }));
    expect(_formatContact(null)).toBeNull();
  });
});

describe('_translateScopeError', () => {
  test('403 → AUTH_SCOPE_MISSING', () => {
    const e = _translateScopeError({ response: { status: 403, data: {} } });
    expect(e.message).toBe('AUTH_SCOPE_MISSING');
  });
  test('code ErrorAccessDenied → AUTH_SCOPE_MISSING', () => {
    const e = _translateScopeError({ response: { status: 500, data: { error: { code: 'ErrorAccessDenied' } } } });
    expect(e.message).toBe('AUTH_SCOPE_MISSING');
  });
  test('autre erreur → renvoyée telle quelle', () => {
    const orig = new Error('boom');
    expect(_translateScopeError(orig)).toBe(orig);
  });
});

describe('listCalendarEvents', () => {
  test('exige from ET to', async () => {
    await expect(listCalendarEvents('U1', { from: '2026-07-01' })).rejects.toThrow('CALENDAR_RANGE_REQUIRED');
    expect(_graphCall).not.toHaveBeenCalled();
  });

  test('appelle calendarView et renvoie événements + page suivante', async () => {
    _graphCall.mockResolvedValue({
      data: {
        value: [{ id: 'E1', subject: 'A', start: { dateTime: 't1' }, end: { dateTime: 't2' } }],
        '@odata.nextLink': 'https://graph/next',
      },
    });
    const res = await listCalendarEvents('U1', { from: 'F', to: 'T' });
    expect(_graphCall).toHaveBeenCalledWith('U1', 'get', '/me/calendarView', expect.objectContaining({
      params: expect.objectContaining({ startDateTime: 'F', endDateTime: 'T' }),
    }));
    expect(res.events).toHaveLength(1);
    expect(res.events[0].id).toBe('E1');
    expect(res.nextPageToken).toBe('https://graph/next');
  });

  test('pageToken http → suit le lien directement (pas de reconstruction)', async () => {
    _graphCall.mockResolvedValue({ data: { value: [] } });
    await listCalendarEvents('U1', { from: 'F', to: 'T', pageToken: 'https://graph/page2' });
    expect(_graphCall).toHaveBeenCalledWith('U1', 'get', 'https://graph/page2');
  });

  test('🔒 403 Graph → AUTH_SCOPE_MISSING (traduit)', async () => {
    _graphCall.mockRejectedValue({ response: { status: 403, data: {} } });
    await expect(listCalendarEvents('U1', { from: 'F', to: 'T' })).rejects.toThrow('AUTH_SCOPE_MISSING');
  });
});

describe('listContacts', () => {
  test('appelle /me/contacts et renvoie contacts + page suivante', async () => {
    _graphCall.mockResolvedValue({
      data: {
        value: [{ id: 'C1', displayName: 'Marie', emailAddresses: [{ address: 'm@x.fr' }] }],
        '@odata.nextLink': null,
      },
    });
    const res = await listContacts('U1', {});
    expect(_graphCall).toHaveBeenCalledWith('U1', 'get', '/me/contacts', expect.any(Object));
    expect(res.contacts[0]).toEqual(expect.objectContaining({ id: 'C1', emails: ['m@x.fr'] }));
    expect(res.nextPageToken).toBeNull();
  });

  test('🔒 403 Graph → AUTH_SCOPE_MISSING (traduit)', async () => {
    _graphCall.mockRejectedValue({ response: { status: 403, data: { error: { code: 'AccessDenied' } } } });
    await expect(listContacts('U1', {})).rejects.toThrow('AUTH_SCOPE_MISSING');
  });
});
