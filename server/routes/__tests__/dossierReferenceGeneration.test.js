'use strict';

// POST /createDossier : attribution de la reference "<annee><rang>" PAR
// CABINET, puis PUT /dossier/:id (la reference n'est jamais reecrite),
// POST /dossier (route historique : reference attribuee par le serveur),
// contrat HTTP 409 DOSSIER_REFERENCE_CONFLICT du gestionnaire d'erreurs global
// et POST /api/divorce-cm (reference "DCM-XXXXXX" regeneree apres un conflit,
// dossier rattache au cabinet du createur).
//
// Le modele Dossier est remplace par une collection en memoire qui evalue
// reellement les filtres employes (egalite sur tenantId, regex ou egalite sur
// reference, borne sur _id), le tri (ordre binaire des chaines, comme MongoDB
// sans collation) et la limite, et dont save() applique la contrainte de
// l'index unique { tenantId, reference } en levant l'erreur MongoDB 11000.

// Chaque cas recharge le module de routes complet (jest.resetModules + doMock).
jest.setTimeout(20000);

// Le gestionnaire d'erreurs global de server/index.js est charge UNE fois, en
// tete de fichier et avant tout doMock, pour verifier le contrat HTTP du 409
// avec le vrai gestionnaire (aucune connexion : mongoose.connect vit dans
// startServer, pas au require ; meme approche que corsOriginRefusal.test.js).
process.env.NODE_ENV = 'test';
const { app: realApp } = require('../../index');

const YEAR = new Date().getFullYear();
const ref = (rank) => `${YEAR}${String(rank).padStart(2, '0')}`;

const IDS = {
  user: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  otherUser: 'cccccccccccccccccccccccc',
  tenant: '999999999999999999999999',
  otherTenant: '888888888888888888888888',
};

// Identifiants croissants : la pagination par _id doit rester deterministe.
let idCounter = 0;
const nextId = () => String((idCounter += 1)).padStart(24, '0');

function matchesCondition(value, condition) {
  if (condition instanceof RegExp) return condition.test(String(value ?? ''));
  if (condition && typeof condition === 'object') {
    return Object.entries(condition).every(([operator, operand]) => {
      if (operator === '$regex') return new RegExp(operand).test(String(value ?? ''));
      if (operator === '$gt') return String(value) > String(operand);
      if (operator === '$in') return operand.map(String).includes(String(value));
      throw new Error(`Operateur non simule : ${operator}`);
    });
  }
  return String(value) === String(condition);
}

const matchesFilter = (doc, filter) => Object.entries(filter || {})
  .every(([field, condition]) => matchesCondition(doc[field], condition));

const duplicateKeyError = (tenantId, reference) => {
  const error = new Error(`E11000 duplicate key error collection: kheops.dossiers index: tenantId_1_reference_1 dup key: { tenantId: ${tenantId}, reference: "${reference}" }`);
  error.code = 11000;
  error.codeName = 'DuplicateKey';
  error.keyPattern = { tenantId: 1, reference: 1 };
  error.keyValue = { tenantId, reference };
  return error;
};

function fakeQuery(collection, filter, { afterRead }) {
  let sortSpec = null;
  const query = {
    sort: jest.fn((spec) => { sortSpec = spec; return query; }),
    limit: jest.fn(async (count) => {
      let docs = collection.docs.filter((doc) => matchesFilter(doc, filter));
      if (sortSpec) {
        const [[field, direction]] = Object.entries(sortSpec);
        docs = [...docs].sort((a, b) => {
          const left = String(a[field]);
          const right = String(b[field]);
          if (left === right) return 0;
          return (left < right ? -1 : 1) * direction;
        });
      }
      const page = count > 0 ? docs.slice(0, count) : docs;
      collection.reads += 1;
      if (afterRead) afterRead(collection, collection.reads);
      return page.map((doc) => ({ ...doc }));
    }),
  };
  return query;
}

/**
 * Faux modele Dossier : constructeur + save() qui alimente la collection en
 * appliquant l'unicite { tenantId, reference } (11000 sinon ; un document
 * deja enregistre est remplace par _id), et find() evalue sur cette
 * collection. `afterRead` est appele apres chaque lecture (numero de lecture
 * en second argument) pour simuler une creation concurrente survenue entre
 * deux requetes. `saveConflicts` force 11000 sur les N premiers save().
 */
function fakeDossierModel(initialDocs, { afterRead, saveConflicts = 0 } = {}) {
  const collection = {
    docs: initialDocs.map((doc) => ({ _id: nextId(), tenantId: IDS.tenant, ...doc })),
    reads: 0,
    saves: 0,
    forcedConflicts: saveConflicts,
    insert(doc) { this.docs.push({ _id: nextId(), tenantId: IDS.tenant, ...doc }); },
    references(tenantId = IDS.tenant) {
      return this.docs.filter((doc) => String(doc.tenantId) === String(tenantId)).map((doc) => doc.reference);
    },
  };
  const Dossier = jest.fn(function Dossier(payload) {
    Object.assign(this, payload);
    if (!this._id) this._id = nextId();
    this.markModified = jest.fn();
    this.toObject = () => ({ _id: this._id, reference: this.reference, tenantId: this.tenantId, dossier: this.dossier });
    this.save = jest.fn(async () => {
      collection.saves += 1;
      if (collection.forcedConflicts > 0) {
        collection.forcedConflicts -= 1;
        throw duplicateKeyError(this.tenantId, this.reference);
      }
      const clash = collection.docs.some((doc) => (
        String(doc._id) !== String(this._id)
        && String(doc.tenantId) === String(this.tenantId)
        && doc.reference === this.reference
      ));
      if (clash) throw duplicateKeyError(this.tenantId, this.reference);
      const stored = { _id: this._id, reference: this.reference, tenantId: this.tenantId };
      const index = collection.docs.findIndex((doc) => String(doc._id) === String(this._id));
      if (index >= 0) collection.docs[index] = stored; else collection.docs.push(stored);
      return this;
    });
  });
  Dossier.find = jest.fn((filter) => fakeQuery(collection, filter, { afterRead }));
  Dossier.findById = jest.fn(async () => null);
  Dossier.deleteOne = jest.fn(async () => ({ deletedCount: 1 }));
  Dossier.memory = collection;
  return Dossier;
}

const modelConstructor = () => jest.fn(function Model(payload) {
  Object.assign(this, payload);
  if (!this._id) this._id = nextId();
  this.save = jest.fn().mockResolvedValue(this);
});

function loadRoute({ dossiers = [], afterRead, saveConflicts, tenantId = IDS.tenant, Dossier: existing } = {}) {
  jest.resetModules();

  const Dossier = existing || fakeDossierModel(dossiers, { afterRead, saveConflicts });

  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../middlewares/validateBody', () => () => (req, res, next) => next());
  jest.doMock('../../validation/dossierSchemas', () => ({ createDossierSchema: {} }));
  jest.doMock('../../utils/ownershipHelpers', () => ({
    ensureDossierOwnership: jest.fn(async () => true),
    ensureContactOwnership: jest.fn(async () => true),
    getAccessibleRelationEntityIds: jest.fn(async () => ({ contactIds: [], officeUserIds: [] })),
  }));
  jest.doMock('../../models/Folder/Dossier', () => Dossier);
  jest.doMock('../../models/Folder/Partie', () => modelConstructor());
  jest.doMock('../../models/Folder/Role', () => modelConstructor());
  jest.doMock('../../models/Folder/modelsLiaisons/UserDossier', () => modelConstructor());
  jest.doMock('../../models/Folder/modelsLiaisons/DossierPartie', () => modelConstructor());
  jest.doMock('../../models/Folder/modelsLiaisons/ContactPartie', () => modelConstructor());
  jest.doMock('../../models/Folder/modelsLiaisons/ContactRole', () => modelConstructor());
  jest.doMock('../../models/Folder/modelsLiaisons/DossierContact', () => modelConstructor());
  jest.doMock('../../models/Folder/modelsLiaisons/UserContact', () => modelConstructor());
  jest.doMock('../../models/Folder/modelsLiaisons/UserContactPM', () => modelConstructor());
  jest.doMock('../../models/Folder/modelsLiaisons/UserContactPMPublique', () => modelConstructor());
  jest.doMock('../../models/Folder/Contact', () => modelConstructor());
  jest.doMock('../../models/Folder/ContactPM', () => modelConstructor());
  jest.doMock('../../models/Folder/ContactPMPublique', () => modelConstructor());
  jest.doMock('../../services/snapshotService', () => ({}));
  jest.doMock('../../services/cabinetAccess', () => ({
    getAccessibleUserIds: jest.fn().mockResolvedValue([IDS.user]),
  }));
  jest.doMock('../../services/storage/matterFolderMaterializer', () => ({
    materializeMatterFolder: jest.fn().mockResolvedValue({ ok: false, reason: 'test' }),
  }));
  jest.doMock('../../services/tenantService', () => ({
    resolveTenantId: jest.fn().mockResolvedValue(tenantId),
  }));
  jest.doMock('../../services/dossierPartyRelations', () => ({
    normalizeDossierParties: jest.fn((value) => value),
  }));
  jest.doMock('../../utils/auditLogger', () => ({ create: jest.fn() }));

  const router = require('../folder/folderDossierCreation');
  const layer = router.stack.find((item) => (
    item.route && item.route.path === '/createDossier' && item.route.methods.post
  ));
  return { handler: layer.route.stack[layer.route.stack.length - 1].handle, Dossier, router };
}

function fakeReqRes(nom = 'Dossier reference') {
  const req = {
    body: {
      dossierData: {
        dossier: { nom, type_dossier: 'tgi' },
        parties: { pour: [], contre: [] },
        contactsDuDossier: [],
        avocatsResponsables: [],
      },
    },
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
  for (let index = 0; index < 400; index += 1) {
    if (res.json.mock.calls.length || next.mock.calls.length) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  if (next.mock.calls.length && next.mock.calls[0][0]) throw next.mock.calls[0][0];
}

async function createDossier(options) {
  const { handler, Dossier } = loadRoute(options);
  const { req, res, next } = fakeReqRes();
  await settleHandler(handler, req, res, next);
  expect(res.status).toHaveBeenCalledWith(201);
  return { reference: res.payload.dossier.reference, Dossier, handler };
}

const duplicates = (values) => values.filter((value, index) => values.indexOf(value) !== index);

let logSpy;
let warnSpy;
beforeEach(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  logSpy.mockRestore();
  warnSpy.mockRestore();
});

describe('POST /createDossier — sequence par cabinet', () => {
  test('premier dossier de l annee pour un cabinet neuf : rang 01 sur deux chiffres', async () => {
    const { reference, Dossier } = await createDossier({ dossiers: [] });
    expect(reference).toBe(ref(1));
    expect(Dossier.memory.docs).toHaveLength(1);
    expect(String(Dossier.memory.docs[0].tenantId)).toBe(IDS.tenant);
  });

  test('plusieurs dossiers du meme cabinet se suivent', async () => {
    const first = await createDossier({ dossiers: [] });
    const second = await createDossier({ Dossier: first.Dossier });
    const third = await createDossier({ Dossier: first.Dossier });
    expect([first.reference, second.reference, third.reference]).toEqual([ref(1), ref(2), ref(3)]);
    expect(duplicates(first.Dossier.memory.references())).toEqual([]);
  });

  test('deux cabinets distincts : sequences independantes, la meme reference peut exister dans chacun', async () => {
    const a1 = await createDossier({ dossiers: [], tenantId: IDS.tenant });
    const b1 = await createDossier({ Dossier: a1.Dossier, tenantId: IDS.otherTenant });
    const a2 = await createDossier({ Dossier: a1.Dossier, tenantId: IDS.tenant });
    const b2 = await createDossier({ Dossier: a1.Dossier, tenantId: IDS.otherTenant });
    expect([a1.reference, a2.reference]).toEqual([ref(1), ref(2)]);
    expect([b1.reference, b2.reference]).toEqual([ref(1), ref(2)]);
    expect(a1.Dossier.memory.references(IDS.tenant)).toEqual([ref(1), ref(2)]);
    expect(a1.Dossier.memory.references(IDS.otherTenant)).toEqual([ref(1), ref(2)]);
    // Chaque lecture est cloisonnee par cabinet.
    for (const [filter] of a1.Dossier.find.mock.calls) expect(filter).toHaveProperty('tenantId');
  });

  test('un cabinet neuf obtient le rang 01 meme si d autres cabinets ont deja numerote', async () => {
    const { reference } = await createDossier({
      dossiers: [
        { reference: ref(44), tenantId: IDS.otherTenant },
        { reference: ref(49), tenantId: IDS.otherTenant },
      ],
      tenantId: IDS.tenant,
    });
    expect(reference).toBe(ref(1));
  });

  test('passage du rang 9 au rang 10', async () => {
    const { reference } = await createDossier({ dossiers: [{ reference: ref(9) }] });
    expect(reference).toBe(ref(10));
  });

  test('passage du rang 99 au rang 100 sans remplissage supplementaire', async () => {
    const { reference } = await createDossier({ dossiers: [{ reference: ref(99) }] });
    expect(reference).toBe(ref(100));
  });

  test('le rang suivant est calcule numeriquement : apres "202699" puis "2026100", la reference est "2026101"', async () => {
    const { reference, Dossier } = await createDossier({
      dossiers: [{ reference: ref(98) }, { reference: ref(99) }, { reference: ref(100) }],
    });
    expect(reference).toBe(ref(101));
    expect(duplicates(Dossier.memory.references())).toEqual([]);
  });

  test('references historiques preservees : le prochain rang est le maximum du cabinet + 1, sans renumerotation', async () => {
    const { reference, Dossier } = await createDossier({
      dossiers: [{ reference: ref(44) }, { reference: ref(49) }, { reference: ref(45), tenantId: IDS.otherTenant }],
    });
    expect(reference).toBe(ref(50));
    expect(Dossier.memory.references()).toEqual([ref(44), ref(49), ref(50)]);
    expect(Dossier.memory.references(IDS.otherTenant)).toEqual([ref(45)]);
  });

  test('references mal formees ignorees : autre annee, espace "DCM-", ancien format "TEST50-", valeurs vides', async () => {
    const { reference } = await createDossier({
      dossiers: [
        { reference: `${YEAR - 1}12` },
        { reference: 'DCM-ABC123' },
        { reference: 'TEST50-09' },
        { reference: '' },
        { reference: ref(3) },
      ],
    });
    expect(reference).toBe(ref(4));
  });

  test('au changement d annee, la numerotation du cabinet repart a 01', async () => {
    const { reference } = await createDossier({
      dossiers: [{ reference: `${YEAR - 1}150` }, { reference: `${YEAR - 1}151` }],
    });
    expect(reference).toBe(ref(1));
  });

  test('reverifie la reference juste avant l attribution : une reference prise entre-temps dans le cabinet est regeneree', async () => {
    const { reference, Dossier } = await createDossier({
      dossiers: [{ reference: ref(1) }, { reference: ref(2) }, { reference: ref(3) }],
      afterRead: (collection, readCount) => {
        if (readCount === 1) collection.insert({ reference: ref(4) });
      },
    });
    expect(reference).toBe(ref(5));
    expect(duplicates(Dossier.memory.references())).toEqual([]);
  });

  test('absence de cabinet resolu : erreur explicite, aucun dossier construit', async () => {
    const { handler, Dossier } = loadRoute({ dossiers: [], tenantId: null });
    const { req, res, next } = fakeReqRes();
    await expect(settleHandler(handler, req, res, next)).rejects.toThrow(/cabinet/i);
    expect(Dossier).not.toHaveBeenCalled();
    expect(Dossier.memory.docs).toHaveLength(0);
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('POST /createDossier — conflit d unicite a l enregistrement', () => {
  test('reverification passee puis 11000 a l enregistrement : nouvelle generation, nouveau save, aucun doublon', async () => {
    // La creation concurrente survient APRES la reverification (lecture 2) :
    // seul l'index unique la signale, par l'erreur 11000 au save.
    const { reference, Dossier } = await createDossier({
      dossiers: [{ reference: ref(1) }],
      afterRead: (collection, readCount) => {
        if (readCount === 2) collection.insert({ reference: ref(2) });
      },
    });
    expect(reference).toBe(ref(3));
    expect(Dossier.memory.references()).toEqual([ref(1), ref(2), ref(3)]);
    expect(duplicates(Dossier.memory.references())).toEqual([]);
    expect(Dossier.memory.saves).toBe(2);
  });

  test('nouvelle tentative apres un conflit signale par l index seul (11000 force une fois)', async () => {
    const { reference, Dossier } = await createDossier({ dossiers: [{ reference: ref(1) }], saveConflicts: 1 });
    expect(reference).toBe(ref(2));
    expect(Dossier.memory.references()).toEqual([ref(1), ref(2)]);
    expect(Dossier.memory.saves).toBe(2);
    expect(warnSpy).toHaveBeenCalled();
  });

  test('creations paralleles sur le meme cabinet : aucune reference dupliquee, les deux dossiers sont crees', async () => {
    const { handler, Dossier } = loadRoute({ dossiers: [{ reference: ref(1) }] });
    const first = fakeReqRes('Parallele 1');
    const second = fakeReqRes('Parallele 2');
    await Promise.all([
      settleHandler(handler, first.req, first.res, first.next),
      settleHandler(handler, second.req, second.res, second.next),
    ]);
    expect(first.res.status).toHaveBeenCalledWith(201);
    expect(second.res.status).toHaveBeenCalledWith(201);
    const references = [first.res.payload.dossier.reference, second.res.payload.dossier.reference].sort();
    expect(references).toEqual([ref(2), ref(3)]);
    expect(Dossier.memory.references().sort()).toEqual([ref(1), ref(2), ref(3)]);
    expect(duplicates(Dossier.memory.references())).toEqual([]);
  });

  test('contrainte d unicite persistante : erreur explicite, aucun dossier ecrit', async () => {
    const { handler, Dossier } = loadRoute({ dossiers: [{ reference: ref(1) }], saveConflicts: 99 });
    const { req, res, next } = fakeReqRes();
    await expect(settleHandler(handler, req, res, next)).rejects.toMatchObject({ code: 'DOSSIER_REFERENCE_CONFLICT' });
    expect(res.status).not.toHaveBeenCalledWith(201);
    expect(res.json).not.toHaveBeenCalled();
    expect(Dossier.memory.references()).toEqual([ref(1)]);
    expect(Dossier.memory.saves).toBeGreaterThanOrEqual(3);
    expect(Dossier.memory.saves).toBeLessThanOrEqual(8);
  });

  test('apres trois reverifications infructueuses, la route echoue sans ecrire de dossier ni de doublon', async () => {
    // Une creation concurrente prend systematiquement la reference calculee
    // entre la lecture des references de l'annee et la reverification.
    const { handler, Dossier } = loadRoute({
      dossiers: [{ reference: ref(1) }],
      afterRead: (collection, readCount) => {
        if (readCount % 2 === 1) {
          const ranks = collection.references().map((value) => Number(String(value).slice(4))).filter(Number.isFinite);
          collection.insert({ reference: ref(Math.max(...ranks) + 1) });
        }
      },
    });
    const { req, res, next } = fakeReqRes();
    await expect(settleHandler(handler, req, res, next)).rejects.toThrow(/Impossible d'attribuer une reference/);
    expect(next).toHaveBeenCalledTimes(1);
    expect(Dossier).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(201);
    expect(res.json).not.toHaveBeenCalled();
    expect(duplicates(Dossier.memory.references())).toEqual([]);
  });
});

describe('PUT /dossier/:id — la reference n est jamais reecrite', () => {
  function loadPutRoute(Dossier) {
    jest.resetModules();
    jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
    jest.doMock('../../utils/ownershipHelpers', () => ({
      ensureDossierOwnership: jest.fn(async () => true),
      ensureContactOwnership: jest.fn(async () => true),
      getAccessibleRelationEntityIds: jest.fn(async () => ({ contactIds: [], officeUserIds: [] })),
    }));
    jest.doMock('../../models/Folder/Dossier', () => Dossier);
    jest.doMock('../../models/Folder/Contact', () => modelConstructor());
    jest.doMock('../../models/Folder/ContactPM', () => modelConstructor());
    jest.doMock('../../models/Folder/ContactPMPublique', () => modelConstructor());
    jest.doMock('../../utils/auditLogger', () => ({ create: jest.fn(), update: jest.fn(), delete: jest.fn() }));
    jest.doMock('../../utils/securityLogger', () => ({ log: jest.fn(), EVT: { ACCESS_DENIED: 'ACCESS_DENIED' } }));
    const router = require('../folder/folderDossierInteraction');
    const layer = router.stack.find((item) => (
      item.route && item.route.path === '/dossier/:id' && item.route.methods.put
    ));
    return layer.route.stack[layer.route.stack.length - 1].handle;
  }

  test('creation puis modification : le nom change, la reference (meme fournie dans le corps) reste celle attribuee', async () => {
    const { reference, Dossier } = await createDossier({ dossiers: [{ reference: ref(1) }] });
    expect(reference).toBe(ref(2));
    const created = Dossier.mock.instances[0];
    Dossier.findById = jest.fn(async () => created);

    const putDossier = loadPutRoute(Dossier);
    const req = {
      params: { id: created._id },
      body: { reference: ref(77), tenantId: IDS.otherTenant, dossier: { nom: 'Nom modifie' } },
      user: IDS.user,
      method: 'PUT',
      originalUrl: `/api/folder/dossier/${created._id}`,
    };
    const res = {
      statusCode: 200,
      status: jest.fn(function status(code) { this.statusCode = code; return this; }),
      json: jest.fn(function json(payload) { this.payload = payload; return this; }),
    };
    const next = jest.fn();
    await settleHandler(putDossier, req, res, next);

    expect(res.statusCode).toBe(200);
    expect(created.reference).toBe(ref(2));
    expect(String(created.tenantId)).toBe(IDS.tenant);
    expect(created.dossier.dossier.nom).toBe('Nom modifie');
    expect(created.save).toHaveBeenCalledTimes(2);
    expect(Dossier.memory.references()).toEqual([ref(1), ref(2)]);
    // Une seule generation (a la creation) : le PUT ne relit pas les references.
    expect(Dossier.find.mock.calls.filter(([filter]) => filter.reference instanceof RegExp)).toHaveLength(1);
  });
});

describe('POST /dossier (route historique) — reference attribuee par le serveur, jamais par le client', () => {
  function loadLegacyRoute(options) {
    const { router, Dossier } = loadRoute(options);
    const layer = router.stack.find((item) => item.route && item.route.path === '/dossier' && item.route.methods.post);
    return { handler: layer.route.stack[layer.route.stack.length - 1].handle, Dossier };
  }

  const legacyReqRes = (body) => {
    const req = { body, user: IDS.user, method: 'POST', originalUrl: '/api/folder/dossier' };
    const res = {
      statusCode: 200,
      status: jest.fn(function status(code) { this.statusCode = code; return this; }),
      json: jest.fn(function json(payload) { this.payload = payload; return this; }),
    };
    return { req, res, next: jest.fn() };
  };

  test('la reference et le tenantId du corps sont ignores : sequence du cabinet du createur', async () => {
    const { handler, Dossier } = loadLegacyRoute({ dossiers: [{ reference: ref(1) }] });
    const { req, res, next } = legacyReqRes({ reference: ref(77), tenantId: IDS.otherTenant, dossier: { dossier: { nom: 'Historique' } } });
    await settleHandler(handler, req, res, next);
    expect(res.json).toHaveBeenCalledTimes(1);
    expect(res.payload.reference).toBe(ref(2));
    expect(String(res.payload.tenantId)).toBe(IDS.tenant);
    expect(res.payload.dossier.dossier.nom).toBe('Historique');
    expect(Dossier.memory.references()).toEqual([ref(1), ref(2)]);
    expect(Dossier.memory.references(IDS.otherTenant)).toEqual([]);
  });

  test('conflit persistant : erreur 409 DOSSIER_REFERENCE_CONFLICT (plus de 11000 brut), aucun dossier ecrit', async () => {
    const { handler, Dossier } = loadLegacyRoute({ dossiers: [{ reference: ref(1) }], saveConflicts: 99 });
    const { req, res, next } = legacyReqRes({ dossier: { dossier: { nom: 'Conflit' } } });
    await expect(settleHandler(handler, req, res, next)).rejects.toMatchObject({ code: 'DOSSIER_REFERENCE_CONFLICT', status: 409 });
    expect(res.json).not.toHaveBeenCalled();
    expect(Dossier.memory.references()).toEqual([ref(1)]);
  });

  test('absence de cabinet resolu : erreur explicite, aucun dossier construit', async () => {
    const { handler, Dossier } = loadLegacyRoute({ dossiers: [], tenantId: null });
    const { req, res, next } = legacyReqRes({ dossier: { dossier: { nom: 'Sans cabinet' } } });
    await expect(settleHandler(handler, req, res, next)).rejects.toThrow(/cabinet/i);
    expect(Dossier).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('409 DOSSIER_REFERENCE_CONFLICT — contrat HTTP du gestionnaire d erreurs global (server/index.js)', () => {
  // Dernier gestionnaire a quatre parametres de la pile Express de l'app
  // reelle : celui de server/index.js (charge en tete de fichier).
  const errorHandler = realApp._router.stack
    .map((layer) => layer.handle)
    .filter((handle) => typeof handle === 'function' && handle.length === 4)
    .pop();

  const fakeRes = () => ({
    statusCode: 200,
    status: jest.fn(function status(code) { this.statusCode = code; return this; }),
    json: jest.fn(function json(payload) { this.payload = payload; return this; }),
  });

  let errorSpy;
  beforeEach(() => { errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { errorSpy.mockRestore(); });

  test('l erreur levee par saveDossierWithReference apres un conflit persistant est rendue 409 { message, error: DOSSIER_REFERENCE_CONFLICT }', async () => {
    expect(typeof errorHandler).toBe('function');
    jest.resetModules();
    const Dossier = fakeDossierModel([{ reference: ref(1) }], { saveConflicts: 99 });
    jest.doMock('../../models/Folder/Dossier', () => Dossier);
    const { saveDossierWithReference } = require('../../utils/dossierReference');
    let failure = null;
    try {
      await saveDossierWithReference({ tenantId: IDS.tenant, buildDossier: (reference) => new Dossier({ reference, tenantId: IDS.tenant }) });
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: 'DOSSIER_REFERENCE_CONFLICT', status: 409 });

    const res = fakeRes();
    const next = jest.fn();
    errorHandler(failure, { method: 'POST', originalUrl: '/api/folder/createDossier' }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(409);
    expect(res.payload).toEqual({ message: failure.message, error: 'DOSSIER_REFERENCE_CONFLICT' });
    expect(res.payload.message).toMatch(/reste en conflit/);
    expect(res.payload.message).not.toMatch(/E11000|dup key/);
  });

  test('un doublon 11000 brut (sans statut) reste une erreur interne 500 generique, sans message interne', () => {
    const res = fakeRes();
    errorHandler(duplicateKeyError(IDS.tenant, ref(1)), { method: 'POST', originalUrl: '/api/folder/dossier' }, res, jest.fn());
    expect(res.statusCode).toBe(500);
    expect(res.payload).toEqual({ message: 'Erreur interne du serveur' });
  });
});

describe('POST /api/divorce-cm — reference "DCM-XXXXXX" regeneree apres un conflit d unicite, dossier rattache au cabinet', () => {
  const DCM_FORMAT = /^DCM-[0-9A-Z]{6}$/;

  function loadDivorceRoute({ saveConflicts = 0 } = {}) {
    jest.resetModules();
    const Dossier = fakeDossierModel([], { saveConflicts });
    const resolveTenantId = jest.fn().mockResolvedValue(IDS.tenant);
    const UserDossier = modelConstructor();
    UserDossier.deleteOne = jest.fn(async () => ({ deletedCount: 1 }));
    const leanModel = () => {
      const Model = modelConstructor();
      Model.find = jest.fn(() => ({ lean: async () => [] }));
      Model.findById = jest.fn(async () => null);
      Model.findOne = jest.fn(() => ({ lean: async () => null }));
      return Model;
    };

    jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
    jest.doMock('../../utils/auditLogger', () => ({ create: jest.fn(), update: jest.fn(), delete: jest.fn() }));
    jest.doMock('../../models/Folder/Dossier', () => Dossier);
    jest.doMock('../../models/Folder/modelsLiaisons/UserDossier', () => UserDossier);
    jest.doMock('../../models/Folder/Contact', () => leanModel());
    jest.doMock('../../models/Folder/PersonneCharge', () => leanModel());
    jest.doMock('../../models/Folder/modelsLiaisons/ContactPersonneCharge', () => leanModel());
    jest.doMock('../../models/Folder/modelsLiaisons/UserContact', () => leanModel());
    jest.doMock('../../services/cabinetAccess', () => ({ getAccessibleUserIds: jest.fn().mockResolvedValue([IDS.user]) }));
    jest.doMock('../../services/storage/matterFolderMaterializer', () => ({
      materializeMatterFolder: jest.fn().mockResolvedValue({ ok: false, reason: 'test' }),
    }));
    jest.doMock('../../services/tenantService', () => ({ resolveTenantId }));

    const DivorceCMData = require('../../models/Divorce/DivorceCMData');
    const divorceSave = jest.spyOn(DivorceCMData.prototype, 'save').mockResolvedValue(undefined);
    const router = require('../divorceCM');
    const layer = router.stack.find((item) => item.route && item.route.path === '/' && item.route.methods.post);
    return { handler: layer.route.stack[layer.route.stack.length - 1].handle, Dossier, UserDossier, divorceSave, resolveTenantId };
  }

  const divorceReqRes = () => {
    const req = {
      body: {
        divorceData: {
          epoux1: { civilite: 'M.', nom: 'EPOUX', prenoms: 'Jean' },
          epoux2: { civilite: 'Mme', nom: 'EPOUSE', prenoms: 'Marie' },
          mariage: { lieu: 'Paris' },
        },
      },
      user: IDS.user,
      method: 'POST',
      originalUrl: '/api/divorce-cm',
    };
    const res = {
      statusCode: 200,
      status: jest.fn(function status(code) { this.statusCode = code; return this; }),
      json: jest.fn(function json(payload) { this.payload = payload; return this; }),
    };
    return { req, res, next: jest.fn() };
  };

  test('sans conflit : une seule reference au format historique, dossier rattache au cabinet du createur', async () => {
    const { handler, Dossier, divorceSave, resolveTenantId } = loadDivorceRoute();
    const { req, res, next } = divorceReqRes();
    await settleHandler(handler, req, res, next);
    expect(res.statusCode).toBe(201);
    expect(res.payload.dossier.reference).toMatch(DCM_FORMAT);
    expect(Dossier).toHaveBeenCalledTimes(1);
    expect(Dossier.memory.docs).toHaveLength(1);
    // Le dossier de divorce porte le cabinet du createur des sa creation :
    // la reference "DCM-" est unique PAR CABINET, comme les autres.
    expect(resolveTenantId).toHaveBeenCalledWith(IDS.user);
    expect(String(Dossier.mock.calls[0][0].tenantId)).toBe(IDS.tenant);
    expect(String(Dossier.memory.docs[0].tenantId)).toBe(IDS.tenant);
    expect(String(res.payload.dossier.tenantId)).toBe(IDS.tenant);
    expect(String(divorceSave.mock.instances[0].dossierId)).toBe(String(Dossier.memory.docs[0]._id));
    divorceSave.mockRestore();
  });

  test('11000 a l enregistrement : nouvelle reference du meme format, un seul dossier ecrit', async () => {
    const { handler, Dossier, UserDossier, divorceSave } = loadDivorceRoute({ saveConflicts: 1 });
    const { req, res, next } = divorceReqRes();
    await settleHandler(handler, req, res, next);
    expect(res.statusCode).toBe(201);
    expect(res.payload.dossier.reference).toMatch(DCM_FORMAT);
    expect(Dossier).toHaveBeenCalledTimes(2);
    for (const [payload] of Dossier.mock.calls) {
      expect(payload.reference).toMatch(DCM_FORMAT);
      expect(String(payload.tenantId)).toBe(IDS.tenant); // chaque essai porte le cabinet
    }
    expect(Dossier.memory.docs).toHaveLength(1);
    expect(String(Dossier.memory.docs[0].tenantId)).toBe(IDS.tenant);
    expect(Dossier.memory.docs[0].reference).toBe(res.payload.dossier.reference);
    expect(UserDossier).toHaveBeenCalledTimes(1);
    expect(String(UserDossier.mock.calls[0][0].dossier)).toBe(String(Dossier.memory.docs[0]._id));
    expect(String(divorceSave.mock.instances[0].dossierId)).toBe(String(Dossier.memory.docs[0]._id));
    divorceSave.mockRestore();
  });

  test('conflit persistant : erreur remontee, aucun dossier, aucun lien ni fiche divorce ecrits', async () => {
    const { handler, Dossier, UserDossier, divorceSave } = loadDivorceRoute({ saveConflicts: 99 });
    const { req, res, next } = divorceReqRes();
    await expect(settleHandler(handler, req, res, next)).rejects.toMatchObject({ code: 11000 });
    expect(res.json).not.toHaveBeenCalled();
    expect(Dossier.memory.docs).toHaveLength(0);
    expect(Dossier.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(Dossier.mock.calls.length).toBeLessThanOrEqual(5);
    expect(UserDossier).not.toHaveBeenCalled();
    expect(divorceSave).not.toHaveBeenCalled();
    divorceSave.mockRestore();
  });
});
