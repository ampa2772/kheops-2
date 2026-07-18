'use strict';

function buildDossier(party) {
  return {
    dossier: {
      parties: {
        pour: [party],
        contre: [],
      },
    },
    markModified: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function loadHandler({
  contact,
  party,
  dossierOwnership = true,
  contactOwnership = true,
}) {
  jest.resetModules();

  const ensureDossierOwnership = jest.fn(async (req, res) => {
    if (!dossierOwnership) {
      res.status(403).json({ message: 'dossier hors cabinet' });
      return false;
    }
    return true;
  });
  const ensureContactOwnership = jest.fn(async (req, res) => {
    if (!contactOwnership) {
      res.status(403).json({ message: 'contact hors cabinet' });
      return false;
    }
    return true;
  });
  const dossier = buildDossier(party);
  const Dossier = {
    findById: jest.fn().mockResolvedValue(dossier),
    find: jest.fn(),
  };
  const Contact = { findById: jest.fn().mockResolvedValue(contact) };
  const ContactPM = { findById: jest.fn().mockResolvedValue(null) };
  const ContactPMPublique = { findById: jest.fn().mockResolvedValue(null) };

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../utils/ownershipHelpers', () => ({
    ensureDossierOwnership,
    ensureContactOwnership,
    ensureOfficeUserOwnership: jest.fn(),
    ensureDocOwnership: jest.fn(),
  }));
  jest.doMock('../../models/Folder/Dossier', () => Dossier);
  jest.doMock('../../models/Folder/Contact', () => Contact);
  jest.doMock('../../models/Folder/ContactPM', () => ContactPM);
  jest.doMock('../../models/Folder/ContactPMPublique', () => ContactPMPublique);
  jest.doMock('../../utils/auditLogger', () => ({
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  }));
  jest.doMock('../../utils/securityLogger', () => ({
    log: jest.fn(),
    EVT: { ACCESS_DENIED: 'ACCESS_DENIED' },
  }));

  const router = require('../folder/folderDossierInteraction');
  const layer = router.stack.find((item) => (
    item.route
    && item.route.path === '/addLinkedContactToParty'
    && item.route.methods.post
  ));

  return {
    handler: layer.route.stack[layer.route.stack.length - 1].handle,
    dossier,
    Dossier,
    Contact,
    ensureDossierOwnership,
    ensureContactOwnership,
  };
}

function fakeReqRes(linkedContactData) {
  const req = {
    body: {
      dossierId: 'dossier-1',
      partyId: 'party-1',
      linkedContactData,
    },
    user: 'user-1',
    method: 'POST',
    originalUrl: '/api/folder/addLinkedContactToParty',
  };
  const res = {
    statusCode: 200,
    status: jest.fn(function status(code) {
      this.statusCode = code;
      return this;
    }),
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

const baseParty = () => ({
  idPartie: 'party-1',
  partieData: { _id: 'party-1', nom: 'Client' },
  avocats: [],
  contacts: [],
});

test('refuse une nouvelle liaison avocat sans role', async () => {
  const context = loadHandler({
    contact: { _id: 'lawyer-1', type: 'Avocat', pro_contact: true },
    party: baseParty(),
  });
  const { req, res, next } = fakeReqRes({ existingContactId: 'lawyer-1' });

  await settleHandler(context.handler, req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.payload).toMatchObject({ code: 'LAWYER_ROLE_REQUIRED' });
  expect(context.dossier.save).not.toHaveBeenCalled();
});

test('persiste plaidant et postulant pour un nouvel avocat', async () => {
  const context = loadHandler({
    contact: { _id: 'lawyer-1', type: 'Avocate', pro_contact: true, nom: 'Martin' },
    party: baseParty(),
  });
  const { req, res, next } = fakeReqRes({
    existingContactId: 'lawyer-1',
    isPlaidant: true,
    isPostulant: true,
  });

  await settleHandler(context.handler, req, res, next);

  expect(res.statusCode).toBe(200);
  expect(context.dossier.save).toHaveBeenCalledTimes(1);
  const [savedParty] = context.dossier.dossier.parties.pour;
  expect(savedParty.contacts).toHaveLength(0);
  expect(savedParty.avocats).toHaveLength(1);
  expect(savedParty.avocats[0]).toMatchObject({
    _id: 'lawyer-1',
    isPlaidant: true,
    isPostulant: true,
  });
  expect(res.payload).toMatchObject({ relationType: 'avocat', rolesUpdated: true });
});

test('preserve les roles existants sans forceRoleUpdate puis deduplique les collections', async () => {
  const party = baseParty();
  party.avocats = [{
    _id: 'lawyer-1',
    type: 'Avocat',
    isPlaidant: true,
    isPostulant: false,
  }];
  party.contacts = [{ _id: 'lawyer-1', type: 'Avocat' }];
  const context = loadHandler({
    contact: { _id: 'lawyer-1', type: 'Avocat', pro_contact: true, nom: 'Actualise' },
    party,
  });
  const { req, res, next } = fakeReqRes({
    existingContactId: 'lawyer-1',
    isPlaidant: false,
    isPostulant: true,
  });

  await settleHandler(context.handler, req, res, next);

  const [savedParty] = context.dossier.dossier.parties.pour;
  expect(savedParty.avocats).toHaveLength(1);
  expect(savedParty.contacts).toHaveLength(0);
  expect(savedParty.avocats[0]).toMatchObject({
    nom: 'Actualise',
    isPlaidant: true,
    isPostulant: false,
  });
  expect(res.payload.rolesUpdated).toBe(false);
});

test('forceRoleUpdate met explicitement a jour une liaison existante', async () => {
  const party = baseParty();
  party.avocats = [{
    _id: 'lawyer-1',
    type: 'Avocat',
    isPlaidant: true,
    isPostulant: false,
  }];
  const context = loadHandler({
    contact: { _id: 'lawyer-1', type: 'Avocat', pro_contact: true },
    party,
  });
  const { req, res, next } = fakeReqRes({
    existingContactId: 'lawyer-1',
    isPlaidant: false,
    isPostulant: true,
    forceRoleUpdate: true,
  });

  await settleHandler(context.handler, req, res, next);

  expect(context.dossier.dossier.parties.pour[0].avocats[0]).toMatchObject({
    isPlaidant: false,
    isPostulant: true,
  });
  expect(res.payload.rolesUpdated).toBe(true);
});

test('refuse un contact appartenant a un autre cabinet avant toute lecture', async () => {
  const context = loadHandler({
    contact: { _id: 'contact-1', type: 'Notaire' },
    party: baseParty(),
    contactOwnership: false,
  });
  const { req, res, next } = fakeReqRes({ existingContactId: 'contact-1' });

  await settleHandler(context.handler, req, res, next);

  expect(res.status).toHaveBeenCalledWith(403);
  expect(context.Contact.findById).not.toHaveBeenCalled();
  expect(context.Dossier.findById).not.toHaveBeenCalled();
  expect(context.dossier.save).not.toHaveBeenCalled();
});

