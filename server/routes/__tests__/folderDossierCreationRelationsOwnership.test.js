'use strict';

const IDS = {
  contact: '111111111111111111111111',
  contactLie: '222222222222222222222222',
  partie: '333333333333333333333333',
  dossier: '444444444444444444444444',
  role: '555555555555555555555555',
  primaryContact: '666666666666666666666666',
  foreignContact: '777777777777777777777777',
  legacyDossier: '888888888888888888888888',
};

const queryResult = (value) => ({
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(value),
});

const modelConstructor = () => jest.fn(function Model(payload) {
  Object.assign(this, payload);
  this.save = jest.fn().mockResolvedValue(this);
});

function loadRoutes({
  partie = { _id: IDS.partie, contact: IDS.primaryContact },
  legacyDossierLinks = [],
  accessibleLegacyLink = null,
  foreignContacts = [],
  foreignDossiers = [],
  roleExists = true,
} = {}) {
  jest.resetModules();

  const ensureContactOwnership = jest.fn(async (req, res, contactId) => {
    if (foreignContacts.includes(String(contactId))) {
      res.status(403).json({ message: 'contact hors cabinet' });
      return false;
    }
    return true;
  });
  const ensureDossierOwnership = jest.fn(async (req, res, dossierId) => {
    if (foreignDossiers.includes(String(dossierId))) {
      res.status(403).json({ message: 'dossier hors cabinet' });
      return false;
    }
    return true;
  });

  const ContactPartie = modelConstructor();
  const DossierPartie = modelConstructor();
  const ContactRole = modelConstructor();
  const DossierContact = modelConstructor();
  DossierPartie.find = jest.fn(() => queryResult(legacyDossierLinks));

  const Partie = modelConstructor();
  Partie.findById = jest.fn(() => queryResult(partie));
  const Role = modelConstructor();
  Role.exists = jest.fn().mockResolvedValue(roleExists ? { _id: IDS.role } : null);
  const Dossier = modelConstructor();
  Dossier.find = jest.fn();
  const UserDossier = modelConstructor();
  UserDossier.findOne = jest.fn(() => queryResult(accessibleLegacyLink));

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../middlewares/validateBody', () => () => (req, res, next) => next());
  jest.doMock('../../validation/dossierSchemas', () => ({ createDossierSchema: {} }));
  jest.doMock('../../utils/ownershipHelpers', () => ({
    ensureDossierOwnership,
    ensureContactOwnership,
  }));
  jest.doMock('../../models/Folder/Dossier', () => Dossier);
  jest.doMock('../../models/Folder/Partie', () => Partie);
  jest.doMock('../../models/Folder/Role', () => Role);
  jest.doMock('../../models/Folder/modelsLiaisons/UserDossier', () => UserDossier);
  jest.doMock('../../models/Folder/modelsLiaisons/DossierPartie', () => DossierPartie);
  jest.doMock('../../models/Folder/modelsLiaisons/ContactPartie', () => ContactPartie);
  jest.doMock('../../models/Folder/modelsLiaisons/ContactRole', () => ContactRole);
  jest.doMock('../../models/Folder/modelsLiaisons/DossierContact', () => DossierContact);
  jest.doMock('../../models/Folder/Contact', () => modelConstructor());
  jest.doMock('../../models/Folder/ContactPM', () => modelConstructor());
  jest.doMock('../../models/Folder/ContactPMPublique', () => modelConstructor());
  jest.doMock('../../services/snapshotService', () => ({}));
  jest.doMock('../../services/cabinetAccess', () => ({
    getAccessibleUserIds: jest.fn().mockResolvedValue(['aaaaaaaaaaaaaaaaaaaaaaaa']),
  }));
  jest.doMock('../../services/storage/matterFolderMaterializer', () => ({
    materializeMatterFolder: jest.fn().mockResolvedValue({ ok: false }),
  }));
  jest.doMock('../../services/tenantService', () => ({
    resolveTenantId: jest.fn().mockResolvedValue('999999999999999999999999'),
  }));
  jest.doMock('../../services/dossierPartyRelations', () => ({
    normalizeDossierParties: jest.fn((value) => value),
  }));
  jest.doMock('../../utils/auditLogger', () => ({ create: jest.fn() }));

  const router = require('../folder/folderDossierCreation');
  const handlerFor = (path) => {
    const layer = router.stack.find((item) => (
      item.route && item.route.path === path && item.route.methods.post
    ));
    return layer.route.stack[layer.route.stack.length - 1].handle;
  };

  return {
    handlerFor,
    ensureContactOwnership,
    ensureDossierOwnership,
    ContactPartie,
    DossierPartie,
    ContactRole,
    Partie,
    Role,
    UserDossier,
  };
}

function fakeReqRes(path, body) {
  const req = {
    body,
    user: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    method: 'POST',
    originalUrl: `/api/folder${path}`,
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

test('/contactpartie contrôle le contact et le contact propriétaire de la partie', async () => {
  const context = loadRoutes();
  const { req, res, next } = fakeReqRes('/contactpartie', {
    contact: IDS.contact,
    partie: IDS.partie,
  });

  await settleHandler(context.handlerFor('/contactpartie'), req, res, next);

  expect(res.statusCode).toBe(200);
  expect(context.ensureContactOwnership.mock.calls.map((call) => String(call[2]))).toEqual([
    IDS.contact,
    IDS.primaryContact,
  ]);
  expect(context.ContactPartie).toHaveBeenCalledTimes(1);
  expect(context.ContactPartie.mock.instances[0].save).toHaveBeenCalledTimes(1);
});

test('/contactpartie refuse une partie dont le contact principal est hors cabinet', async () => {
  const context = loadRoutes({ foreignContacts: [IDS.foreignContact] });
  context.Partie.findById.mockReturnValue(queryResult({
    _id: IDS.partie,
    contact: IDS.foreignContact,
  }));
  const { req, res, next } = fakeReqRes('/contactpartie', {
    contact: IDS.contact,
    partie: IDS.partie,
  });

  await settleHandler(context.handlerFor('/contactpartie'), req, res, next);

  expect(res.status).toHaveBeenCalledWith(403);
  expect(context.ContactPartie).not.toHaveBeenCalled();
});

test('/dossierpartie refuse un dossier hors cabinet avant de lire la partie', async () => {
  const context = loadRoutes({ foreignDossiers: [IDS.dossier] });
  const { req, res, next } = fakeReqRes('/dossierpartie', {
    dossier: IDS.dossier,
    partie: IDS.partie,
  });

  await settleHandler(context.handlerFor('/dossierpartie'), req, res, next);

  expect(res.status).toHaveBeenCalledWith(403);
  expect(context.Partie.findById).not.toHaveBeenCalled();
  expect(context.DossierPartie).not.toHaveBeenCalled();
});

test('/dossierpartie accepte une partie legacy prouvée par un dossier déjà accessible', async () => {
  const context = loadRoutes({
    partie: { _id: IDS.partie, contact: null },
    legacyDossierLinks: [{ dossier: IDS.legacyDossier }],
    accessibleLegacyLink: { user: 'aaaaaaaaaaaaaaaaaaaaaaaa', dossier: IDS.legacyDossier },
  });
  const { req, res, next } = fakeReqRes('/dossierpartie', {
    dossier: IDS.dossier,
    partie: IDS.partie,
  });

  await settleHandler(context.handlerFor('/dossierpartie'), req, res, next);

  expect(res.statusCode).toBe(200);
  expect(context.UserDossier.findOne).toHaveBeenCalledWith({
    user: { $in: ['aaaaaaaaaaaaaaaaaaaaaaaa'] },
    dossier: { $in: [IDS.legacyDossier] },
  });
  expect(context.DossierPartie).toHaveBeenCalledTimes(1);
});

test('/contactrole refuse un contact lié hors cabinet avant la partie et le rôle', async () => {
  const context = loadRoutes({ foreignContacts: [IDS.contactLie] });
  const { req, res, next } = fakeReqRes('/contactrole', {
    contact: IDS.contact,
    contactLie: IDS.contactLie,
    partie: IDS.partie,
    role: IDS.role,
  });

  await settleHandler(context.handlerFor('/contactrole'), req, res, next);

  expect(res.status).toHaveBeenCalledWith(403);
  expect(context.Partie.findById).not.toHaveBeenCalled();
  expect(context.Role.exists).not.toHaveBeenCalled();
  expect(context.ContactRole).not.toHaveBeenCalled();
});

test('/contactrole refuse un identifiant de rôle global inexistant', async () => {
  const context = loadRoutes({ roleExists: false });
  const { req, res, next } = fakeReqRes('/contactrole', {
    contact: IDS.contact,
    contactLie: IDS.contactLie,
    partie: IDS.partie,
    role: IDS.role,
  });

  await settleHandler(context.handlerFor('/contactrole'), req, res, next);

  expect(res.status).toHaveBeenCalledWith(404);
  expect(context.ContactRole).not.toHaveBeenCalled();
});

test('/contactrole conserve la forme historique contact vers contact sans partie', async () => {
  const context = loadRoutes();
  const { req, res, next } = fakeReqRes('/contactrole', {
    contact: IDS.contact,
    contactLie: IDS.contactLie,
    role: IDS.role,
  });

  await settleHandler(context.handlerFor('/contactrole'), req, res, next);

  expect(res.statusCode).toBe(200);
  expect(context.ensureContactOwnership.mock.calls.map((call) => String(call[2]))).toEqual([
    IDS.contact,
    IDS.contactLie,
  ]);
  expect(context.Partie.findById).not.toHaveBeenCalled();
  expect(context.ContactRole).toHaveBeenCalledTimes(1);
});

test('/contactrole conserve la forme historique contact vers partie sans contactLie', async () => {
  const context = loadRoutes();
  const { req, res, next } = fakeReqRes('/contactrole', {
    contact: IDS.contact,
    partie: IDS.partie,
    role: IDS.role,
  });

  await settleHandler(context.handlerFor('/contactrole'), req, res, next);

  expect(res.statusCode).toBe(200);
  expect(context.ensureContactOwnership.mock.calls.map((call) => String(call[2]))).toEqual([
    IDS.contact,
    IDS.primaryContact,
  ]);
  expect(context.ContactRole).toHaveBeenCalledTimes(1);
});

test('les extrémités manquantes sont refusées avant tout contrôle ownership', async () => {
  const context = loadRoutes();
  const { req, res, next } = fakeReqRes('/contactrole', {
    contact: IDS.contact,
    role: IDS.role,
  });

  await settleHandler(context.handlerFor('/contactrole'), req, res, next);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(context.ensureContactOwnership).not.toHaveBeenCalled();
  expect(context.ContactRole).not.toHaveBeenCalled();
});
