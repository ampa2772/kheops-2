'use strict';

// POST /createDossier : attribution de la reference "<annee><rang>".
//
// Le modele Dossier est remplace par une collection en memoire qui evalue
// reellement les filtres employes (regex sur reference, egalite, borne sur
// _id), le tri (ordre binaire des chaines, comme MongoDB sans collation) et la
// limite. Le meme faux modele sert donc a demontrer le defaut du tri de chaine
// ("202699" > "2026100") et a verifier la reverification anti-doublon.

// Chaque cas recharge le module de routes complet (jest.resetModules + doMock).
jest.setTimeout(20000);

const YEAR = new Date().getFullYear();
const ref = (rank) => `${YEAR}${String(rank).padStart(2, '0')}`;

const IDS = {
  user: 'aaaaaaaaaaaaaaaaaaaaaaaa',
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
 * Faux modele Dossier : constructeur + save() qui alimente la collection, et
 * find() evalue sur cette collection. `afterRead` est appele apres chaque
 * lecture (numero de lecture en second argument) pour simuler une creation
 * concurrente survenue entre la lecture et l'enregistrement.
 */
function fakeDossierModel(initialDocs, { afterRead } = {}) {
  const collection = {
    docs: initialDocs.map((doc) => ({ _id: nextId(), ...doc })),
    reads: 0,
    insert(doc) { this.docs.push({ _id: nextId(), ...doc }); },
    references() { return this.docs.map((doc) => doc.reference); },
  };
  const Dossier = jest.fn(function Dossier(payload) {
    Object.assign(this, payload);
    if (!this._id) this._id = nextId();
    this.save = jest.fn(async () => {
      collection.docs.push({ _id: this._id, reference: this.reference, tenantId: this.tenantId });
      return this;
    });
  });
  Dossier.find = jest.fn((filter) => fakeQuery(collection, filter, { afterRead }));
  Dossier.memory = collection;
  return Dossier;
}

const modelConstructor = () => jest.fn(function Model(payload) {
  Object.assign(this, payload);
  if (!this._id) this._id = nextId();
  this.save = jest.fn().mockResolvedValue(this);
});

function loadRoute({ dossiers = [], afterRead, tenantId = IDS.tenant } = {}) {
  jest.resetModules();

  const Dossier = fakeDossierModel(dossiers, { afterRead });

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
  return { handler: layer.route.stack[layer.route.stack.length - 1].handle, Dossier };
}

function fakeReqRes() {
  const req = {
    body: {
      dossierData: {
        dossier: { nom: 'Dossier reference', type_dossier: 'tgi' },
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
  for (let index = 0; index < 200; index += 1) {
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
  return { reference: res.payload.dossier.reference, Dossier };
}

const duplicates = (values) => values.filter((value, index) => values.indexOf(value) !== index);

test('premiere reference de l annee : rang 01 sur deux chiffres', async () => {
  const { reference } = await createDossier({ dossiers: [] });
  expect(reference).toBe(ref(1));
});

test('passage du rang 99 au rang 100 sans remplissage supplementaire', async () => {
  const { reference } = await createDossier({ dossiers: [{ reference: ref(99) }] });
  expect(reference).toBe(ref(100));
});

test('le rang suivant est calcule numeriquement : apres "202699" puis "2026100", la reference est "2026101"', async () => {
  // Tri de chaine : "202699" > "2026100", donc l'ancien calcul repartait de
  // 99 + 1 = 100 et attribuait une reference deja prise.
  const { reference, Dossier } = await createDossier({
    dossiers: [{ reference: ref(98) }, { reference: ref(99) }, { reference: ref(100) }],
  });
  expect(reference).toBe(ref(101));
  expect(duplicates(Dossier.memory.references())).toEqual([]);
});

test('le rang maximal est retenu meme lorsque des references a plus de chiffres precedent lexicographiquement', async () => {
  const { reference } = await createDossier({
    dossiers: [{ reference: ref(250) }, { reference: ref(99) }, { reference: ref(1000) }, { reference: ref(7) }],
  });
  expect(reference).toBe(ref(1001));
});

test('ignore les references d une autre annee et celles de l espace "DCM-"', async () => {
  const { reference } = await createDossier({
    dossiers: [{ reference: `${YEAR - 1}12` }, { reference: 'DCM-ABC123' }, { reference: ref(3) }],
  });
  expect(reference).toBe(ref(4));
});

test('reverifie la reference juste avant l attribution : une reference prise entre-temps est regeneree', async () => {
  // Une creation concurrente enregistre le rang 4 juste apres la premiere
  // lecture des references de l'annee.
  const { reference, Dossier } = await createDossier({
    dossiers: [{ reference: ref(1) }, { reference: ref(2) }, { reference: ref(3) }],
    afterRead: (collection, readCount) => {
      if (readCount === 1) collection.insert({ reference: ref(4), tenantId: IDS.otherTenant });
    },
  });
  expect(reference).toBe(ref(5));
  expect(duplicates(Dossier.memory.references())).toEqual([]);
});

test('la sequence est globale : un autre cabinet continue la numerotation (comportement actuel, decision en attente)', async () => {
  const { reference, Dossier } = await createDossier({
    dossiers: [
      { reference: ref(1), tenantId: IDS.otherTenant },
      { reference: ref(2), tenantId: IDS.otherTenant },
    ],
    tenantId: IDS.tenant,
  });
  expect(reference).toBe(ref(3));
  // Aucune requete ne filtre par cabinet.
  for (const [filter] of Dossier.find.mock.calls) expect(filter).not.toHaveProperty('tenantId');
});

test('apres trois tentatives infructueuses, la route echoue sans ecrire de dossier ni de doublon', async () => {
  // Une creation concurrente prend systematiquement la reference calculee
  // entre la lecture des references de l'annee et la reverification.
  const { handler, Dossier } = loadRoute({
    dossiers: [{ reference: ref(1) }],
    afterRead: (collection, readCount) => {
      if (readCount % 2 === 1) {
        const ranks = collection.references().map((value) => Number(String(value).slice(4))).filter(Number.isFinite);
        collection.insert({ reference: ref(Math.max(...ranks) + 1), tenantId: IDS.otherTenant });
      }
    },
  });
  const { req, res, next } = fakeReqRes();
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await expect(settleHandler(handler, req, res, next)).rejects.toThrow(/Impossible d'attribuer une reference/);
  } finally {
    warnSpy.mockRestore();
  }
  expect(next).toHaveBeenCalledTimes(1);
  expect(Dossier).not.toHaveBeenCalled();
  expect(res.status).not.toHaveBeenCalledWith(201);
  expect(res.json).not.toHaveBeenCalled();
  expect(duplicates(Dossier.memory.references())).toEqual([]);
});

test('au changement d annee, la numerotation repart a 01 sans tenir compte de l annee precedente', async () => {
  const { reference } = await createDossier({
    dossiers: [{ reference: `${YEAR - 1}150` }, { reference: `${YEAR - 1}151` }],
  });
  expect(reference).toBe(ref(1));
});
