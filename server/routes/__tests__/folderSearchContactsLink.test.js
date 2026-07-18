'use strict';

function selectableResult(items) {
  return {
    select: jest.fn().mockResolvedValue(items),
  };
}

function loadHandler({ physiques = [], morales = [], publiques = [] } = {}) {
  jest.resetModules();

  const Contact = { find: jest.fn().mockResolvedValue(physiques) };
  const ContactPM = { find: jest.fn().mockResolvedValue(morales) };
  const ContactPMPublique = { find: jest.fn().mockResolvedValue(publiques) };
  const UserContact = {
    find: jest.fn(() => selectableResult(
      physiques.map((contact) => ({ contact: contact._id })),
    )),
  };
  const UserContactPM = {
    find: jest.fn(() => selectableResult(
      morales.map((contact) => ({ contactPM: contact._id })),
    )),
  };
  const UserContactPMPublique = {
    find: jest.fn(() => selectableResult(
      publiques.map((contact) => ({ contactPMPublique: contact._id })),
    )),
  };

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../models/Folder/Contact', () => Contact);
  jest.doMock('../../models/Folder/ContactPM', () => ContactPM);
  jest.doMock('../../models/Folder/ContactPMPublique', () => ContactPMPublique);
  jest.doMock('../../models/Folder/modelsLiaisons/UserContact', () => UserContact);
  jest.doMock('../../models/Folder/modelsLiaisons/UserContactPM', () => UserContactPM);
  jest.doMock('../../models/Folder/modelsLiaisons/UserContactPMPublique', () => UserContactPMPublique);
  jest.doMock('../../services/cabinetAccess', () => ({
    getAccessibleUserIds: jest.fn().mockResolvedValue(['user-1']),
  }));

  const router = require('../folder/folderSearch');
  const layer = router.stack.find((item) => (
    item.route
    && item.route.path === '/rechercherContactsLink'
    && item.route.methods.post
  ));

  return {
    handler: layer.route.stack[layer.route.stack.length - 1].handle,
    Contact,
    ContactPM,
    ContactPMPublique,
  };
}

function fakeReqRes(body) {
  const req = {
    body,
    user: 'user-1',
    method: 'POST',
    originalUrl: '/api/folder/rechercherContactsLink',
  };
  const res = {
    json: jest.fn(function json(payload) {
      this.payload = payload;
      return this;
    }),
  };
  return { req, res, next: jest.fn() };
}

async function settleHandler(handler, req, res, next) {
  handler(req, res, next);
  for (let index = 0; index < 100; index += 1) {
    if (res.json.mock.calls.length || next.mock.calls.length) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  if (next.mock.calls.length && next.mock.calls[0][0]) throw next.mock.calls[0][0];
}

test('selectedContactIds absent produit toujours un $nin vide', async () => {
  const context = loadHandler();
  const { req, res, next } = fakeReqRes({ searchTerm: 'Martin' });

  await settleHandler(context.handler, req, res, next);

  expect(context.Contact.find.mock.calls[0][0]._id).toEqual({ $nin: [] });
  expect(context.ContactPM.find.mock.calls[0][0]._id).toEqual({ $nin: [] });
  expect(context.ContactPMPublique.find.mock.calls[0][0]._id).toEqual({ $nin: [] });
  expect(res.payload).toEqual([]);
});

test('trie deux personnes morales publiques avec la denomination de b', async () => {
  const context = loadHandler({
    publiques: [
      { _id: 'public-2', denomination: 'Zulu Administration' },
      { _id: 'public-1', denomination: 'Alpha Administration' },
    ],
  });
  const { req, res, next } = fakeReqRes({
    searchTerm: 'Administration',
    selectedContactIds: [],
  });

  await settleHandler(context.handler, req, res, next);

  expect(res.payload.map((contact) => contact.denomination)).toEqual([
    'Alpha Administration',
    'Zulu Administration',
  ]);
});

