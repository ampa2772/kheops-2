// Tests du service frontend agenda + contacts Outlook (Microsoft Graph).
// apiClient est simulé : on vérifie les appels de route, le passage des
// paramètres et la classification des erreurs.

jest.mock('../apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

import apiClient from '../apiClient';
import {
  getCalendarEvents,
  getOutlookContacts,
  classifyMicrosoftError,
} from '../microsoftGraphClient';

afterEach(() => jest.clearAllMocks());

describe('getCalendarEvents', () => {
  test('appelle la route agenda et renvoie les données', async () => {
    apiClient.get.mockResolvedValue({ data: { events: [{ id: 'E1' }], nextPageToken: null } });
    const res = await getCalendarEvents({ from: 'F', to: 'T' });
    expect(apiClient.get).toHaveBeenCalledWith('/api/microsoft/calendar/events', { params: { from: 'F', to: 'T' } });
    expect(res.events).toHaveLength(1);
  });

  test('sans from/to → aucun paramètre superflu transmis (le serveur applique le défaut)', async () => {
    apiClient.get.mockResolvedValue({ data: { events: [], nextPageToken: null } });
    await getCalendarEvents();
    expect(apiClient.get).toHaveBeenCalledWith('/api/microsoft/calendar/events', { params: {} });
  });

  test('transmet le pageToken quand présent', async () => {
    apiClient.get.mockResolvedValue({ data: { events: [], nextPageToken: null } });
    await getCalendarEvents({ pageToken: 'https://graph/next' });
    expect(apiClient.get).toHaveBeenCalledWith('/api/microsoft/calendar/events', { params: { pageToken: 'https://graph/next' } });
  });
});

describe('getOutlookContacts', () => {
  test('appelle la route contacts et renvoie les données', async () => {
    apiClient.get.mockResolvedValue({ data: { contacts: [{ id: 'C1' }], nextPageToken: null } });
    const res = await getOutlookContacts();
    expect(apiClient.get).toHaveBeenCalledWith('/api/microsoft/contacts', { params: {} });
    expect(res.contacts).toHaveLength(1);
  });
});

describe('classifyMicrosoftError', () => {
  const mk = (code, message) => ({ response: { data: { error: code, message } } });

  test('non connecté → notConnected, pas de reconnexion', () => {
    const r = classifyMicrosoftError(mk('MICROSOFT_NOT_CONNECTED', 'x'));
    expect(r).toEqual(expect.objectContaining({ notConnected: true, needsReconnect: false }));
  });

  test('jeton expiré → needsReconnect', () => {
    const r = classifyMicrosoftError(mk('MICROSOFT_REAUTH_REQUIRED'));
    expect(r.needsReconnect).toBe(true);
  });

  test('scope manquant → needsReconnect', () => {
    const r = classifyMicrosoftError(mk('MICROSOFT_SCOPE_MISSING'));
    expect(r.needsReconnect).toBe(true);
  });

  test('erreur inconnue / réseau → générique, aucun drapeau', () => {
    const r = classifyMicrosoftError(new Error('offline'));
    expect(r).toEqual(expect.objectContaining({
      code: 'MICROSOFT_GRAPH_ERROR', needsReconnect: false, notConnected: false,
    }));
    expect(typeof r.message).toBe('string');
  });

  test('conserve le message du serveur quand présent', () => {
    const r = classifyMicrosoftError(mk('MICROSOFT_SCOPE_MISSING', 'Reconnectez-vous.'));
    expect(r.message).toBe('Reconnectez-vous.');
  });
});
