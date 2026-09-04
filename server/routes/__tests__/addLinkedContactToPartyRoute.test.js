'use strict';

// Chaque cas recharge le module de routes complet (jest.resetModules + doMock) :
// sous charge (suite complete en parallele), le delai par defaut de 5 s est
// depasse alors que la logique est correcte.
jest.setTimeout(20000);

// Identifiants ObjectId valides : la route refuse desormais (400) tout id
// malforme avant la moindre lecture en base.
const IDS = {
  dossier: 'd1d1d1d1d1d1d1d1d1d1d1d1',
  party: 'a1a1a1a1a1a1a1a1a1a1a1a1',
  lawyer: 'b1b1b1b1b1b1b1b1b1b1b1b1',
  contact: 'c1c1c1c1c1c1c1c1c1c1c1c1',
  internalLawyer: 'e1e1e1e1e1e1e1e1e1e1e1e1',
  foreign: 'f1f1f1f1f1f1f1f1f1f1f1f1',
};

function buildDossier(party) {
  return {
    __v: 3,
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
  // Sequence de resultats forces pour findOneAndUpdate (null = conflit de version).
  findOneAndUpdateOutcomes = [],
  // Identifiants resolus comme fiches du carnet / avocats internes du cabinet.
  cabinetContactIds = [IDS.lawyer, IDS.contact],
  internalLawyerIds = [IDS.internalLawyer],
  officeUser = null,
  user = null,
}) {
  jest.resetModules();

  const ensureDossierOwnership = jest.fn(async (req, res) => {
    if (!dossierOwnership) {
      res.status(403).json({ message: 'dossier hors cabinet' });
      return false;
    }
    return true;
  });
  const ensureContactOwnership = jest.fn(async () => true);
  const getAccessibleRelationEntityIds = jest.fn(async (userId, ids) => ({
    contactIds: ids.map(String).filter((id) => cabinetContactIds.includes(id)),
    officeUserIds: ids.map(String).filter((id) => internalLawyerIds.includes(id)),
  }));
  const dossier = buildDossier(party);
  const Dossier = {
    findById: jest.fn().mockResolvedValue(dossier),
    find: jest.fn(),
    // Verrou optimiste : la mise a jour applique le $set sur le document
    // relu et incremente __v, comme MongoDB le ferait.
    findOneAndUpdate: jest.fn(async (filter, update) => {
      if (findOneAndUpdateOutcomes.length) {
        const outcome = findOneAndUpdateOutcomes.shift();
        if (outcome === null) return null;
      }
      dossier.dossier.parties = update.$set['dossier.parties'];
      dossier.__v += 1;
      return dossier;
    }),
  };
  const Contact = { findById: jest.fn().mockResolvedValue(contact) };
  const ContactPM = { findById: jest.fn().mockResolvedValue(null) };
  const ContactPMPublique = { findById: jest.fn().mockResolvedValue(null) };
  const leanQuery = (value) => ({ lean: jest.fn().mockResolvedValue(value), select: jest.fn().mockReturnThis() });
  const OfficeUser = { findById: jest.fn(() => leanQuery(officeUser)) };
  const User = { findById: jest.fn(() => leanQuery(user)) };

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../utils/ownershipHelpers', () => ({
    ensureDossierOwnership,
    ensureContactOwnership,
    getAccessibleRelationEntityIds,
    ensureOfficeUserOwnership: jest.fn(),
    ensureDocOwnership: jest.fn(),
  }));
  jest.doMock('../../models/Folder/Dossier', () => Dossier);
  jest.doMock('../../models/Folder/Contact', () => Contact);
  jest.doMock('../../models/Folder/ContactPM', () => ContactPM);
  jest.doMock('../../models/Folder/ContactPMPublique', () => ContactPMPublique);
  jest.doMock('../../models/App_Users/OfficeUser', () => OfficeUser);
  jest.doMock('../../models/App_Users/User', () => User);
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
    OfficeUser,
    User,
    ensureDossierOwnership,
    getAccessibleRelationEntityIds,
  };
}

function fakeReqRes(linkedContactData, overrides = {}) {
  const req = {
    body: {
      dossierId: IDS.dossier,
      partyId: IDS.party,
      linkedContactData,
      ...overrides,
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
  idPartie: IDS.party,
  partieData: { _id: IDS.party, nom: 'Client' },
  avocats: [],
  contacts: [],
});

test('refuse une nouvelle liaison avocat sans role', async () => {
  const context = loadHandler({
    contact: { _id: IDS.lawyer, type: 'Avocat', pro_contact: true },
    party: baseParty(),
  });
  const { req, res, next } = fakeReqRes({ existingContactId: IDS.lawyer });

  await settleHandler(context.handler, req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.payload).toMatchObject({ code: 'LAWYER_ROLE_REQUIRED' });
  expect(context.Dossier.findOneAndUpdate).not.toHaveBeenCalled();
});

test('persiste plaidant et postulant pour un nouvel avocat', async () => {
  const context = loadHandler({
    contact: { _id: IDS.lawyer, type: 'Avocate', pro_contact: true, nom: 'Martin' },
    party: baseParty(),
  });
  const { req, res, next } = fakeReqRes({
    existingContactId: IDS.lawyer,
    isPlaidant: true,
    isPostulant: true,
  });

  await settleHandler(context.handler, req, res, next);

  expect(res.statusCode).toBe(200);
  expect(context.Dossier.findOneAndUpdate).toHaveBeenCalledTimes(1);
  const [savedParty] = context.dossier.dossier.parties.pour;
  expect(savedParty.contacts).toHaveLength(0);
  expect(savedParty.avocats).toHaveLength(1);
  expect(savedParty.avocats[0]).toMatchObject({
    _id: IDS.lawyer,
    isPlaidant: true,
    isPostulant: true,
  });
  expect(res.payload).toMatchObject({ relationType: 'avocat', rolesUpdated: true });
  // Relations renvoyees deja filtrees par l'acces cabinet (forme privilegiee par le client).
  expect(res.payload.partyRelations).toEqual({
    avocats: [expect.objectContaining({ _id: IDS.lawyer, isPlaidant: true, isPostulant: true })],
    contacts: [],
  });
});

test('la reponse ne renvoie jamais une relation hors cabinet presente dans un ancien snapshot', async () => {
  const party = baseParty();
  party.contacts = [{ _id: IDS.foreign, type: 'Notaire', nom: 'Hors cabinet' }];
  const context = loadHandler({
    contact: { _id: IDS.contact, type: 'Notaire', nom: 'Du cabinet' },
    party,
  });
  const { req, res, next } = fakeReqRes({ existingContactId: IDS.contact });

  await settleHandler(context.handler, req, res, next);

  expect(res.statusCode).toBe(200);
  expect(res.payload.partyRelations.contacts.map((c) => String(c._id))).toEqual([IDS.contact]);
  // Le snapshot persiste, lui, reste intact (aucune suppression silencieuse).
  expect(context.dossier.dossier.parties.pour[0].contacts.map((c) => String(c._id))).toEqual([IDS.foreign, IDS.contact]);
});

test('preserve les roles existants sans forceRoleUpdate puis deduplique les collections', async () => {
  const party = baseParty();
  party.avocats = [{
    _id: IDS.lawyer,
    type: 'Avocat',
    isPlaidant: true,
    isPostulant: false,
  }];
  party.contacts = [{ _id: IDS.lawyer, type: 'Avocat' }];
  const context = loadHandler({
    contact: { _id: IDS.lawyer, type: 'Avocat', pro_contact: true, nom: 'Actualise' },
    party,
  });
  const { req, res, next } = fakeReqRes({
    existingContactId: IDS.lawyer,
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
    _id: IDS.lawyer,
    type: 'Avocat',
    isPlaidant: true,
    isPostulant: false,
  }];
  const context = loadHandler({
    contact: { _id: IDS.lawyer, type: 'Avocat', pro_contact: true },
    party,
  });
  const { req, res, next } = fakeReqRes({
    existingContactId: IDS.lawyer,
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

test('forceRoleUpdate ne peut pas retirer les deux roles d un avocat lie', async () => {
  const party = baseParty();
  party.avocats = [{ _id: IDS.lawyer, type: 'Avocat', isPlaidant: true, isPostulant: false }];
  const context = loadHandler({
    contact: { _id: IDS.lawyer, type: 'Avocat', pro_contact: true },
    party,
  });
  const { req, res, next } = fakeReqRes({
    existingContactId: IDS.lawyer,
    isPlaidant: false,
    isPostulant: false,
    forceRoleUpdate: true,
  });

  await settleHandler(context.handler, req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.payload).toMatchObject({ code: 'LAWYER_ROLE_REQUIRED' });
  expect(context.Dossier.findOneAndUpdate).not.toHaveBeenCalled();
  expect(context.dossier.dossier.parties.pour[0].avocats[0]).toMatchObject({ isPlaidant: true });
});

test('refuse un contact appartenant a un autre cabinet avant toute lecture', async () => {
  const context = loadHandler({
    contact: { _id: IDS.foreign, type: 'Notaire' },
    party: baseParty(),
  });
  const { req, res, next } = fakeReqRes({ existingContactId: IDS.foreign });

  await settleHandler(context.handler, req, res, next);

  expect(res.status).toHaveBeenCalledWith(403);
  expect(context.Contact.findById).not.toHaveBeenCalled();
  expect(context.Dossier.findById).not.toHaveBeenCalled();
  expect(context.Dossier.findOneAndUpdate).not.toHaveBeenCalled();
});

test('refuse un identifiant malforme sans lire la base (400, pas de CastError)', async () => {
  const context = loadHandler({ contact: null, party: baseParty() });
  const { req, res, next } = fakeReqRes({ existingContactId: 'lawyer-1' }, { partyId: 'party-1' });

  await settleHandler(context.handler, req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.payload).toMatchObject({ code: 'INVALID_RELATION_ID' });
  expect(context.getAccessibleRelationEntityIds).not.toHaveBeenCalled();
  expect(context.Dossier.findById).not.toHaveBeenCalled();
});

test('refuse de lier la partie a elle-meme', async () => {
  const context = loadHandler({
    contact: { _id: IDS.party, type: 'Partie (Client/Adversaire)' },
    party: baseParty(),
    cabinetContactIds: [IDS.party],
  });
  const { req, res, next } = fakeReqRes({ existingContactId: IDS.party });

  await settleHandler(context.handler, req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.payload).toMatchObject({ code: 'SELF_LINK_FORBIDDEN' });
  expect(context.Dossier.findOneAndUpdate).not.toHaveBeenCalled();
});

test('met a jour les roles d un avocat interne (responsable) deja embarque sans passer par le carnet', async () => {
  const party = baseParty();
  party.avocats = [{
    _id: IDS.internalLawyer,
    nomOfficeUser: 'Responsable',
    prenomOfficeUser: 'Interne',
    isAvocat: true,
    fromResponsable: true,
    isPlaidant: true,
    isPostulant: true,
  }];
  const context = loadHandler({ contact: null, party });
  const { req, res, next } = fakeReqRes({
    existingContactId: IDS.internalLawyer,
    isPlaidant: true,
    isPostulant: false,
    forceRoleUpdate: true,
  });

  await settleHandler(context.handler, req, res, next);

  expect(res.statusCode).toBe(200);
  expect(context.Contact.findById).not.toHaveBeenCalled();
  expect(context.OfficeUser.findById).not.toHaveBeenCalled();
  const [savedParty] = context.dossier.dossier.parties.pour;
  expect(savedParty.avocats).toHaveLength(1);
  // Partie POUR sans postulant externe : la regle metier garde exactement un
  // responsable interne postulant, la relation reste donc coherente.
  expect(savedParty.avocats[0]).toMatchObject({
    _id: IDS.internalLawyer,
    fromResponsable: true,
    nomOfficeUser: 'Responsable',
    isPlaidant: true,
    isPostulant: true,
  });
  expect(res.payload).toMatchObject({ relationType: 'avocat' });
});

test('lie un avocat interne absent de la partie a partir de sa fiche OfficeUser', async () => {
  const context = loadHandler({
    contact: null,
    party: baseParty(),
    officeUser: { _id: IDS.internalLawyer, prenomOfficeUser: 'Jeanne', nomOfficeUser: 'Cabinet', genre: 'Feminin', roleOfficeUser: 'Avocate', isAvocat: true },
  });
  const { req, res, next } = fakeReqRes({
    existingContactId: IDS.internalLawyer,
    isPlaidant: true,
    isPostulant: false,
  });

  await settleHandler(context.handler, req, res, next);

  expect(res.statusCode).toBe(200);
  expect(context.OfficeUser.findById).toHaveBeenCalledWith(IDS.internalLawyer);
  const [savedParty] = context.dossier.dossier.parties.pour;
  expect(savedParty.avocats[0]).toMatchObject({
    _id: IDS.internalLawyer,
    nomOfficeUser: 'Cabinet',
    isAvocat: true,
    fromResponsable: true,
  });
});

test('le verrou optimiste rejoue la mutation apres un conflit de version puis persiste', async () => {
  const context = loadHandler({
    contact: { _id: IDS.lawyer, type: 'Avocat', pro_contact: true },
    party: baseParty(),
    findOneAndUpdateOutcomes: [null],
  });
  const { req, res, next } = fakeReqRes({ existingContactId: IDS.lawyer, isPlaidant: true });

  await settleHandler(context.handler, req, res, next);

  expect(res.statusCode).toBe(200);
  expect(context.Dossier.findById).toHaveBeenCalledTimes(2);
  expect(context.Dossier.findOneAndUpdate).toHaveBeenCalledTimes(2);
  const [filter, update] = context.Dossier.findOneAndUpdate.mock.calls[0];
  expect(filter).toMatchObject({ _id: IDS.dossier, __v: 3 });
  expect(update.$inc).toEqual({ __v: 1 });
  expect(context.dossier.dossier.parties.pour[0].avocats).toHaveLength(1);
});

test('un conflit persistant repond 409 sans rien persister', async () => {
  const context = loadHandler({
    contact: { _id: IDS.lawyer, type: 'Avocat', pro_contact: true },
    party: baseParty(),
    findOneAndUpdateOutcomes: [null, null, null, null, null],
  });
  const { req, res, next } = fakeReqRes({ existingContactId: IDS.lawyer, isPlaidant: true });

  await settleHandler(context.handler, req, res, next);

  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.payload).toMatchObject({ code: 'CONCURRENT_UPDATE' });
  expect(context.dossier.dossier.parties.pour[0].avocats).toHaveLength(0);
});

test('transfere le role postulant vers le responsable interne choisi par l utilisateur', async () => {
  const second = 'e2e2e2e2e2e2e2e2e2e2e2e2';
  const party = baseParty();
  party.typePartie = 'Pour';
  party.avocats = [
    { _id: IDS.internalLawyer, nomOfficeUser: 'Premier', isAvocat: true, fromResponsable: true, isPlaidant: true, isPostulant: true },
    { _id: second, nomOfficeUser: 'Second', isAvocat: true, fromResponsable: true, isPlaidant: true, isPostulant: false },
  ];
  const context = loadHandler({ contact: null, party, internalLawyerIds: [IDS.internalLawyer, second] });
  const { req, res, next } = fakeReqRes({
    existingContactId: second,
    isPlaidant: true,
    isPostulant: true,
    forceRoleUpdate: true,
  });

  await settleHandler(context.handler, req, res, next);

  expect(res.statusCode).toBe(200);
  const avocats = context.dossier.dossier.parties.pour[0].avocats;
  // Ordre conserve, un seul postulant : celui que l'utilisateur vient de choisir.
  expect(avocats.map((a) => String(a._id))).toEqual([IDS.internalLawyer, second]);
  expect(avocats[0]).toMatchObject({ isPlaidant: true, isPostulant: false });
  expect(avocats[1]).toMatchObject({ isPlaidant: true, isPostulant: true });
  expect(res.payload.contactLier).toMatchObject({ isPostulant: true });
});

test('refuse de lier un membre du cabinet qui n est pas avocat', async () => {
  const context = loadHandler({
    contact: null,
    party: baseParty(),
    officeUser: { _id: IDS.internalLawyer, prenomOfficeUser: 'Sam', nomOfficeUser: 'Secretariat', genre: 'Masculin', roleOfficeUser: 'Secretaire', isAvocat: false },
  });
  const { req, res, next } = fakeReqRes({ existingContactId: IDS.internalLawyer, isPlaidant: true });

  await settleHandler(context.handler, req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.payload).toMatchObject({ code: 'INTERNAL_MEMBER_NOT_LAWYER' });
  expect(context.Dossier.findOneAndUpdate).not.toHaveBeenCalled();
});
