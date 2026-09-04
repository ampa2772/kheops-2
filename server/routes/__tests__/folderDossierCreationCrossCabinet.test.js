'use strict';

// POST /createDossier : un contact d'un AUTRE cabinet reference dans le
// snapshot ne doit jamais etre ecrase ni embarque. Le schema Contact ne porte
// pas de userId : l'appartenance passe par les tables de liaison.

const IDS = {
  user: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  tenant: '999999999999999999999999',
  ownContact: '111111111111111111111111',
  foreignContact: '777777777777777777777777',
  newContact: '222222222222222222222222',
  internalLawyer: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  dossier: '444444444444444444444444',
};

const modelConstructor = () => jest.fn(function Model(payload) {
  Object.assign(this, payload);
  if (!this._id) this._id = IDS.dossier;
  this.save = jest.fn().mockResolvedValue(this);
});

function loadRoute({ accessibleContactIds = [IDS.ownContact], internalLawyerIds = [IDS.internalLawyer], existingContactIds = [IDS.ownContact, IDS.foreignContact] } = {}) {
  jest.resetModules();

  const Dossier = modelConstructor();
  Dossier.find = jest.fn(() => ({ sort: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue([]) }));
  const UserDossier = modelConstructor();
  const DossierContact = modelConstructor();
  const UserContact = modelConstructor();
  const UserContactPM = modelConstructor();
  const UserContactPMPublique = modelConstructor();
  const contactModel = () => {
    const Model = modelConstructor();
    Model.exists = jest.fn(async ({ _id }) => (existingContactIds.includes(String(_id)) ? { _id } : null));
    Model.updateOne = jest.fn().mockResolvedValue({});
    Model.create = jest.fn().mockResolvedValue({});
    return Model;
  };
  const Contact = contactModel();
  const ContactPM = contactModel();
  const ContactPMPublique = contactModel();
  const getAccessibleRelationEntityIds = jest.fn(async (userId, ids) => ({
    contactIds: ids.map(String).filter((id) => accessibleContactIds.includes(id)),
    officeUserIds: ids.map(String).filter((id) => internalLawyerIds.includes(id)),
  }));

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../middlewares/validateBody', () => () => (req, res, next) => next());
  jest.doMock('../../validation/dossierSchemas', () => ({ createDossierSchema: {} }));
  jest.doMock('../../utils/ownershipHelpers', () => ({
    ensureDossierOwnership: jest.fn(async () => true),
    ensureContactOwnership: jest.fn(async () => true),
    getAccessibleRelationEntityIds,
  }));
  jest.doMock('../../models/Folder/Dossier', () => Dossier);
  jest.doMock('../../models/Folder/Partie', () => modelConstructor());
  jest.doMock('../../models/Folder/Role', () => modelConstructor());
  jest.doMock('../../models/Folder/modelsLiaisons/UserDossier', () => UserDossier);
  jest.doMock('../../models/Folder/modelsLiaisons/DossierPartie', () => modelConstructor());
  jest.doMock('../../models/Folder/modelsLiaisons/ContactPartie', () => modelConstructor());
  jest.doMock('../../models/Folder/modelsLiaisons/ContactRole', () => modelConstructor());
  jest.doMock('../../models/Folder/modelsLiaisons/DossierContact', () => DossierContact);
  jest.doMock('../../models/Folder/modelsLiaisons/UserContact', () => UserContact);
  jest.doMock('../../models/Folder/modelsLiaisons/UserContactPM', () => UserContactPM);
  jest.doMock('../../models/Folder/modelsLiaisons/UserContactPMPublique', () => UserContactPMPublique);
  jest.doMock('../../models/Folder/Contact', () => Contact);
  jest.doMock('../../models/Folder/ContactPM', () => ContactPM);
  jest.doMock('../../models/Folder/ContactPMPublique', () => ContactPMPublique);
  jest.doMock('../../services/snapshotService', () => ({}));
  jest.doMock('../../services/cabinetAccess', () => ({
    getAccessibleUserIds: jest.fn().mockResolvedValue([IDS.user]),
  }));
  jest.doMock('../../services/storage/matterFolderMaterializer', () => ({
    materializeMatterFolder: jest.fn().mockResolvedValue({ ok: false, reason: 'test' }),
  }));
  jest.doMock('../../services/tenantService', () => ({
    resolveTenantId: jest.fn().mockResolvedValue(IDS.tenant),
  }));
  jest.doMock('../../utils/auditLogger', () => ({ create: jest.fn() }));

  const router = require('../folder/folderDossierCreation');
  const layer = router.stack.find((item) => (
    item.route && item.route.path === '/createDossier' && item.route.methods.post
  ));
  return {
    handler: layer.route.stack[layer.route.stack.length - 1].handle,
    Dossier,
    UserDossier,
    Contact,
    ContactPM,
    UserContact,
    getAccessibleRelationEntityIds,
  };
}

function fakeReqRes(dossierData) {
  const req = {
    body: { dossierData },
    user: IDS.user,
    method: 'POST',
    originalUrl: '/api/folder/createDossier',
  };
  const res = {
    statusCode: 200,
    status: jest.fn(function status(code) { this.statusCode = code; return this; }),
    json: jest.fn(function json(payload) { this.payload = payload; return this; }),
  };
  return { req, res, next: jest.fn() };
}

async function settleHandler(handler, req, res, next) {
  handler(req, res, next);
  for (let index = 0; index < 200; index += 1) {
    if (res.json.mock.calls.length || next.mock.calls.length) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  if (next.mock.calls.length && next.mock.calls[0][0]) throw next.mock.calls[0][0];
}

const snapshotWith = (linked) => ({
  dossier: { nom: 'Dossier test', type_dossier: 'tgi' },
  parties: {
    pour: [{
      idPartie: IDS.ownContact,
      nomPartie: 'Client Propre',
      partieData: { _id: IDS.ownContact, nom: 'Propre', prenoms: 'Client' },
      avocats: linked.avocats || [],
      contacts: linked.contacts || [],
    }],
    contre: [],
  },
  contactsDuDossier: [],
  avocatsResponsables: [],
});

test('refuse un contact lie appartenant a un autre cabinet AVANT toute ecriture', async () => {
  const context = loadRoute();
  const { req, res, next } = fakeReqRes(snapshotWith({
    contacts: [{ _id: IDS.foreignContact, nom: 'Victime', prenoms: 'Autre cabinet', type: 'Partie (Client/Adversaire)' }],
  }));

  await settleHandler(context.handler, req, res, next);

  expect(res.status).toHaveBeenCalledWith(403);
  expect(context.Dossier).not.toHaveBeenCalled();
  expect(context.UserDossier).not.toHaveBeenCalled();
  expect(context.Contact.updateOne).not.toHaveBeenCalled();
  expect(context.Contact.create).not.toHaveBeenCalled();
});

test('refuse un identifiant de relation malforme (400) sans resoudre l appartenance', async () => {
  const context = loadRoute();
  const { req, res, next } = fakeReqRes(snapshotWith({
    contacts: [{ _id: 'pas-un-objectid', nom: 'Temoin' }],
  }));

  await settleHandler(context.handler, req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.payload).toMatchObject({ code: 'INVALID_DOSSIER_RELATION_ID' });
  expect(context.getAccessibleRelationEntityIds).not.toHaveBeenCalled();
  expect(context.Dossier).not.toHaveBeenCalled();
});

test('cree le dossier avec une fiche du cabinet (mise a jour), une fiche sans _id (creee ET rattachee au cabinet) et un avocat interne (aucune ecriture carnet)', async () => {
  const context = loadRoute();
  const { req, res, next } = fakeReqRes(snapshotWith({
    avocats: [{ _id: IDS.internalLawyer, nomOfficeUser: 'Responsable', isAvocat: true, fromResponsable: true, isPlaidant: true, isPostulant: true }],
    contacts: [{ nom: 'Nouveau', prenoms: 'Temoin', type: 'Partie (Client/Adversaire)', contactType: 'physique' }],
  }));

  await settleHandler(context.handler, req, res, next);

  expect(res.statusCode).toBe(201);
  expect(context.Dossier).toHaveBeenCalledTimes(1);
  const updatedIds = context.Contact.updateOne.mock.calls.map((call) => String(call[0]._id));
  const createdIds = context.Contact.create.mock.calls.map((call) => String(call[0]._id));
  expect(updatedIds).toEqual([IDS.ownContact]);
  expect(createdIds).toHaveLength(1);
  // L'_id de la fiche creee est genere par le serveur (ObjectId), pas par le client.
  expect(createdIds[0]).toMatch(/^[0-9a-f]{24}$/);
  // La fiche creee appartient immediatement au cabinet (lien UserContact).
  expect(context.UserContact).toHaveBeenCalledTimes(1);
  expect(String(context.UserContact.mock.calls[0][0].contact)).toBe(createdIds[0]);
  expect(String(context.UserContact.mock.calls[0][0].user)).toBe(IDS.user);
  // L'avocat interne (User/OfficeUser du cabinet) n'est jamais ecrit dans le carnet.
  expect([...updatedIds, ...createdIds]).not.toContain(IDS.internalLawyer);
  // Les relations embarquees restent canoniques (avocats / contacts, roles).
  const saved = context.Dossier.mock.instances[0];
  expect(saved.dossier.parties.pour[0].avocats[0]).toMatchObject({ _id: IDS.internalLawyer, isPlaidant: true, isPostulant: true });
  expect(saved.dossier.parties.pour[0].contacts).toHaveLength(1);
});

test('refuse un _id inconnu choisi par le client (400) : aucune fiche plantee, aucun dossier cree', async () => {
  const context = loadRoute();
  const { req, res, next } = fakeReqRes(snapshotWith({
    contacts: [{ _id: IDS.newContact, nom: 'Plantee', prenoms: 'Fiche', type: 'Avocat', contactType: 'physique' }],
  }));

  await settleHandler(context.handler, req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.payload).toMatchObject({ code: 'UNKNOWN_DOSSIER_RELATION' });
  expect(context.Contact.create).not.toHaveBeenCalled();
  expect(context.UserContact).not.toHaveBeenCalled();
  expect(context.Dossier).not.toHaveBeenCalled();
});
