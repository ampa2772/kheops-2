'use strict';

const IDS = {
  dossier: '64f000000000000000000001',
  party: '64f000000000000000000002',
  partySnapshot: '64f000000000000000000003',
  contact: '64f000000000000000000004',
  lawyer: '64f000000000000000000005',
  responsible: '64f000000000000000000006',
  foreign: '64f000000000000000000099',
};

const response = () => ({
  statusCode: 200,
  status: jest.fn(function status(code) {
    this.statusCode = code;
    return this;
  }),
  json: jest.fn(function json(payload) {
    this.payload = payload;
    return this;
  }),
});

const settleHandler = async (handler, req, res) => {
  const next = jest.fn();
  handler(req, res, next);
  for (let index = 0; index < 100; index += 1) {
    if (res.json.mock.calls.length || next.mock.calls.length) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  if (next.mock.calls.length && next.mock.calls[0][0]) throw next.mock.calls[0][0];
};

const queryWithLean = (value) => ({
  lean: jest.fn().mockResolvedValue(value),
});

function loadRoutes({ dossier, accessibleContactIds = [], accessibleOfficeUserIds = [], freshContacts = {} }) {
  jest.resetModules();

  const ensureDossierOwnership = jest.fn().mockResolvedValue(true);
  const ensureContactOwnership = jest.fn().mockResolvedValue(true);
  const getAccessibleRelationEntityIds = jest.fn().mockResolvedValue({
    contactIds: accessibleContactIds,
    officeUserIds: accessibleOfficeUserIds,
  });
  const Dossier = {
    findById: jest.fn().mockResolvedValue(dossier),
    find: jest.fn(),
  };
  const Contact = {
    findById: jest.fn((id) => queryWithLean(freshContacts[String(id)] || null)),
  };
  const ContactPM = { findById: jest.fn(() => queryWithLean(null)) };
  const ContactPMPublique = { findById: jest.fn(() => queryWithLean(null)) };

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../utils/ownershipHelpers', () => ({
    ensureDossierOwnership,
    ensureContactOwnership,
    getAccessibleRelationEntityIds,
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
  const handler = (method, path) => {
    const layer = router.stack.find((item) => (
      item.route && item.route.path === path && item.route.methods[method]
    ));
    return layer.route.stack[layer.route.stack.length - 1].handle;
  };

  return {
    getDossier: handler('get', '/dossier/:id'),
    putDossier: handler('put', '/dossier/:id'),
    removeLinked: handler('post', '/removeLinkedContactFromParty'),
    Dossier,
    Contact,
    ContactPM,
    ContactPMPublique,
    getAccessibleRelationEntityIds,
  };
}

const editableDossier = () => ({
  _id: IDS.dossier,
  reference: 'SEC-REL',
  dossier: {
    dossier: { nom: 'Dossier test' },
    parties: { pour: [], contre: [] },
  },
  markModified: jest.fn(),
  save: jest.fn().mockResolvedValue(undefined),
});

describe('PUT /dossier/:id — ownership des relations embarquees', () => {
  const ownedContacts = [IDS.party, IDS.partySnapshot, IDS.contact, IDS.lawyer];

  test.each([
    ['idPartie', (party) => { party.idPartie = IDS.foreign; }],
    ['partieData._id', (party) => { party.partieData._id = IDS.foreign; }],
    ['contacts', (party) => { party.contacts = [{ _id: IDS.foreign, type: 'Notaire' }]; }],
    ['avocats', (party) => { party.avocats = [{ _id: IDS.foreign, type: 'Avocat' }]; }],
  ])('refuse avant sauvegarde une relation hors cabinet dans %s', async (_label, mutate) => {
    const dossier = editableDossier();
    const party = {
      idPartie: IDS.party,
      partieData: { _id: IDS.partySnapshot },
      typePartie: 'Pour',
      contacts: [{ _id: IDS.contact, type: 'Notaire' }],
      avocats: [{ _id: IDS.lawyer, type: 'Avocat', isPlaidant: true }],
    };
    mutate(party);
    const routes = loadRoutes({ dossier, accessibleContactIds: ownedContacts });
    const req = {
      params: { id: IDS.dossier },
      body: { parties: { pour: [party], contre: [] } },
      user: 'user-1',
      method: 'PUT',
      originalUrl: `/api/folder/dossier/${IDS.dossier}`,
    };
    const res = response();

    await settleHandler(routes.putDossier, req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.payload).toMatchObject({ code: 'DOSSIER_RELATION_ACCESS_DENIED' });
    expect(routes.Dossier.findById).not.toHaveBeenCalled();
    expect(dossier.save).not.toHaveBeenCalled();
  });

  test('accepte un avocat responsable OfficeUser du cabinet et persiste une seule fois', async () => {
    const dossier = editableDossier();
    const routes = loadRoutes({
      dossier,
      accessibleContactIds: [IDS.party],
      accessibleOfficeUserIds: [IDS.responsible],
    });
    const req = {
      params: { id: IDS.dossier },
      body: {
        parties: {
          pour: [{
            idPartie: IDS.party,
            typePartie: 'Pour',
            avocats: [{
              _id: IDS.responsible,
              type: 'Avocat',
              fromResponsable: true,
              isPlaidant: true,
              isPostulant: true,
            }],
          }],
          contre: [],
        },
      },
      user: 'user-1',
      method: 'PUT',
      originalUrl: `/api/folder/dossier/${IDS.dossier}`,
    };
    const res = response();

    await settleHandler(routes.putDossier, req, res);

    expect(res.statusCode).toBe(200);
    expect(dossier.save).toHaveBeenCalledTimes(1);
    expect(dossier.dossier.parties.pour[0].avocats[0]).toMatchObject({
      _id: IDS.responsible,
      isPlaidant: true,
      isPostulant: true,
    });
  });

  test('refuse un identifiant malforme avant toute requete ownership ou dossier', async () => {
    const dossier = editableDossier();
    const routes = loadRoutes({ dossier });
    const req = {
      params: { id: IDS.dossier },
      body: {
        parties: {
          pour: [{ idPartie: 'id-malforme', partieData: {} }],
          contre: [],
        },
      },
      user: 'user-1',
      method: 'PUT',
      originalUrl: `/api/folder/dossier/${IDS.dossier}`,
    };
    const res = response();

    await settleHandler(routes.putDossier, req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.payload).toMatchObject({ code: 'INVALID_DOSSIER_RELATION_ID' });
    expect(routes.getAccessibleRelationEntityIds).not.toHaveBeenCalled();
    expect(routes.Dossier.findById).not.toHaveBeenCalled();
    expect(dossier.save).not.toHaveBeenCalled();
  });
});

describe('GET /dossier/:id — hydratation isolee par cabinet', () => {
  test('ne lit ni ne renvoie les contacts lies hors cabinet', async () => {
    const dossier = editableDossier();
    dossier.dossier.parties = {
      pour: [
        {
          idPartie: IDS.party,
          partieData: { _id: IDS.party, nom: 'Ancienne copie' },
          typePartie: 'Pour',
          contacts: [
            { _id: IDS.contact, type: 'Notaire', nom: 'Autorise' },
            { _id: IDS.foreign, type: 'Notaire', nom: 'Interdit' },
          ],
          avocats: [
            { _id: IDS.lawyer, type: 'Avocat', isPlaidant: true },
            { _id: IDS.foreign, type: 'Avocat', isPostulant: true },
          ],
        },
        {
          idPartie: IDS.foreign,
          partieData: { _id: IDS.foreign, nom: 'Partie tierce' },
          typePartie: 'Pour',
          contacts: [],
          avocats: [],
        },
      ],
      contre: [],
    };
    const routes = loadRoutes({
      dossier,
      accessibleContactIds: [IDS.party, IDS.contact, IDS.lawyer],
      freshContacts: {
        [IDS.party]: { _id: IDS.party, type: 'Particulier' },
        [IDS.contact]: { _id: IDS.contact, type: 'Notaire', ville: 'Rouen' },
        [IDS.lawyer]: { _id: IDS.lawyer, type: 'Avocat', nom: 'Martin' },
      },
    });
    const req = {
      params: { id: IDS.dossier },
      user: 'user-1',
      method: 'GET',
      originalUrl: `/api/folder/dossier/${IDS.dossier}`,
    };
    const res = response();

    await settleHandler(routes.getDossier, req, res);

    const [ownedParty, foreignParty] = res.payload.dossier.parties.pour;
    expect(ownedParty.partieData).toMatchObject({ _id: IDS.party });
    expect(ownedParty.contacts.map((contact) => String(contact._id))).toEqual([IDS.contact]);
    expect(ownedParty.avocats.map((lawyer) => String(lawyer._id))).toEqual([IDS.lawyer]);
    expect(foreignParty.partieData).toEqual({});
    expect(routes.Contact.findById).not.toHaveBeenCalledWith(IDS.foreign);
    expect(routes.ContactPM.findById).not.toHaveBeenCalledWith(IDS.foreign);
    expect(routes.ContactPMPublique.findById).not.toHaveBeenCalledWith(IDS.foreign);
  });
});

describe('POST /removeLinkedContactFromParty — identite legacy et roles', () => {
  test('retrouve idPartie sans partieData._id et restaure exactement un responsable postulant', async () => {
    const dossier = editableDossier();
    dossier.dossier.parties.pour = [{
      idPartie: IDS.party,
      typePartie: 'Pour',
      partieData: { nom: 'Snapshot historique sans _id' },
      avocats: [
        { _id: IDS.responsible, type: 'Avocat', fromResponsable: true, isPlaidant: true, isPostulant: false },
        { _id: IDS.lawyer, type: 'Avocat', isPlaidant: true, isPostulant: true },
      ],
      contacts: [],
    }];
    const routes = loadRoutes({ dossier });
    const req = {
      body: {
        dossierId: IDS.dossier,
        partyId: IDS.party,
        contactId: IDS.lawyer,
        isAvocat: true,
      },
      user: 'user-1',
      method: 'POST',
      originalUrl: '/api/folder/removeLinkedContactFromParty',
    };
    const res = response();

    await settleHandler(routes.removeLinked, req, res);

    expect(res.statusCode).toBe(200);
    expect(dossier.save).toHaveBeenCalledTimes(1);
    expect(dossier.dossier.parties.pour[0].avocats).toHaveLength(1);
    expect(dossier.dossier.parties.pour[0].avocats[0]).toMatchObject({
      _id: IDS.responsible,
      isPlaidant: true,
      isPostulant: true,
    });
  });

  test('retourne une erreur explicite sans sauvegarde si la personne n est pas liee', async () => {
    const dossier = editableDossier();
    dossier.dossier.parties.pour = [{
      idPartie: IDS.party,
      partieData: { _id: IDS.party },
      avocats: [],
      contacts: [],
    }];
    const routes = loadRoutes({ dossier });
    const req = {
      body: {
        dossierId: IDS.dossier,
        partyId: IDS.party,
        contactId: IDS.lawyer,
        isAvocat: true,
      },
      user: 'user-1',
      method: 'POST',
      originalUrl: '/api/folder/removeLinkedContactFromParty',
    };
    const res = response();

    await settleHandler(routes.removeLinked, req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.payload).toMatchObject({ code: 'LINKED_ENTITY_NOT_FOUND' });
    expect(dossier.save).not.toHaveBeenCalled();
  });
});
