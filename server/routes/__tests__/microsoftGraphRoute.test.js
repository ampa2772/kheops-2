// Tests HTTP des routes /api/microsoft (agenda + contacts Outlook, lecture seule).
// On simule le modèle User et le module graph étendu ; on extrait les handlers
// du routeur et on les appelle avec req/res factices.

const VALID_USER = 'U1';

function loadHandlers({ microsoftRefreshToken = 'rt', listEventsImpl, listContactsImpl } = {}) {
  jest.resetModules();

  const User = {
    findById: jest.fn().mockReturnValue({
      select: () => ({ lean: async () => (microsoftRefreshToken ? { microsoftRefreshToken } : null) }),
    }),
  };
  const graphExt = {
    listCalendarEvents: jest.fn(listEventsImpl || (async () => ({ events: [], nextPageToken: null }))),
    listContacts: jest.fn(listContactsImpl || (async () => ({ contacts: [], nextPageToken: null }))),
  };

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../models/App_Users/User', () => User);
  jest.doMock('../../utils/microsoftGraphExtended', () => graphExt);

  const router = require('../microsoftGraph');
  function handlerOf(method, path) {
    const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
    if (!layer) throw new Error(`route introuvable : ${method} ${path}`);
    return layer.route.stack[layer.route.stack.length - 1].handle;
  }
  return {
    graphExt,
    calendar: handlerOf('get', '/calendar/events'),
    contacts: handlerOf('get', '/contacts'),
  };
}

function fakeReqRes(query = {}) {
  const req = { user: VALID_USER, query, headers: {}, method: 'GET', originalUrl: '/api/microsoft/x' };
  const res = {
    statusCode: 200,
    status: jest.fn(function (c) { this.statusCode = c; return this; }),
    json: jest.fn(function (p) { this.payload = p; return this; }),
  };
  return { req, res };
}

afterEach(() => jest.clearAllMocks());

// ── Agenda ──────────────────────────────────────────────────────────────────
describe('GET /microsoft/calendar/events', () => {
  test('sans compte Microsoft → 401 MICROSOFT_NOT_CONNECTED', async () => {
    const h = loadHandlers({ microsoftRefreshToken: null });
    const { req, res } = fakeReqRes();
    await h.calendar(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.payload.error).toBe('MICROSOFT_NOT_CONNECTED');
    expect(h.graphExt.listCalendarEvents).not.toHaveBeenCalled();
  });

  test('from/to absents → fenêtre par défaut (maintenant → +30j) fournie', async () => {
    const h = loadHandlers({});
    const { req, res } = fakeReqRes();
    await h.calendar(req, res);
    expect(h.graphExt.listCalendarEvents).toHaveBeenCalledWith(
      VALID_USER,
      expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
    );
    const arg = h.graphExt.listCalendarEvents.mock.calls[0][1];
    expect(new Date(arg.to).getTime()).toBeGreaterThan(new Date(arg.from).getTime());
    expect(res.statusCode).toBe(200);
  });

  test('from/to fournis → transmis tels quels', async () => {
    const h = loadHandlers({});
    const { req, res } = fakeReqRes({ from: '2026-07-01T00:00:00Z', to: '2026-07-02T00:00:00Z' });
    await h.calendar(req, res);
    expect(h.graphExt.listCalendarEvents).toHaveBeenCalledWith(
      VALID_USER,
      expect.objectContaining({ from: '2026-07-01T00:00:00Z', to: '2026-07-02T00:00:00Z' }),
    );
  });

  test('🔒 scope manquant → 403 MICROSOFT_SCOPE_MISSING', async () => {
    const h = loadHandlers({ listEventsImpl: async () => { throw new Error('AUTH_SCOPE_MISSING'); } });
    const { req, res } = fakeReqRes();
    await h.calendar(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.payload.error).toBe('MICROSOFT_SCOPE_MISSING');
  });

  test('jeton expiré → 401 MICROSOFT_REAUTH_REQUIRED', async () => {
    const h = loadHandlers({ listEventsImpl: async () => { throw new Error('AUTH_REFRESH_FAILED'); } });
    const { req, res } = fakeReqRes();
    await h.calendar(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.payload.error).toBe('MICROSOFT_REAUTH_REQUIRED');
  });

  test('erreur Graph transverse → 502 MICROSOFT_GRAPH_ERROR', async () => {
    const h = loadHandlers({ listEventsImpl: async () => { throw new Error('timeout'); } });
    const { req, res } = fakeReqRes();
    await h.calendar(req, res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.payload.error).toBe('MICROSOFT_GRAPH_ERROR');
  });

  test('succès → renvoie la charge du service', async () => {
    const payload = { events: [{ id: 'E1' }], nextPageToken: null };
    const h = loadHandlers({ listEventsImpl: async () => payload });
    const { req, res } = fakeReqRes();
    await h.calendar(req, res);
    expect(res.json).toHaveBeenCalledWith(payload);
  });
});

// ── Contacts ────────────────────────────────────────────────────────────────
describe('GET /microsoft/contacts', () => {
  test('sans compte Microsoft → 401 MICROSOFT_NOT_CONNECTED', async () => {
    const h = loadHandlers({ microsoftRefreshToken: null });
    const { req, res } = fakeReqRes();
    await h.contacts(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.payload.error).toBe('MICROSOFT_NOT_CONNECTED');
    expect(h.graphExt.listContacts).not.toHaveBeenCalled();
  });

  test('succès → transmet le pageToken et renvoie la charge', async () => {
    const payload = { contacts: [{ id: 'C1' }], nextPageToken: 'https://graph/next' };
    const h = loadHandlers({ listContactsImpl: async () => payload });
    const { req, res } = fakeReqRes({ pageToken: 'https://graph/next' });
    await h.contacts(req, res);
    expect(h.graphExt.listContacts).toHaveBeenCalledWith(VALID_USER, { pageToken: 'https://graph/next' });
    expect(res.json).toHaveBeenCalledWith(payload);
  });

  test('🔒 scope manquant → 403 MICROSOFT_SCOPE_MISSING', async () => {
    const h = loadHandlers({ listContactsImpl: async () => { throw new Error('AUTH_SCOPE_MISSING'); } });
    const { req, res } = fakeReqRes();
    await h.contacts(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.payload.error).toBe('MICROSOFT_SCOPE_MISSING');
  });
});
