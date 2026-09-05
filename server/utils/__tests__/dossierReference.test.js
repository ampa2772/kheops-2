'use strict';

// Utilitaire de reference de dossier "<annee><rang>" : sequence PAR CABINET
// (lecture filtree par tenantId), calcul numerique du rang, lecture par lots,
// reverification avant attribution et reprise apres un conflit d'unicite
// (erreur MongoDB 11000 sur l'index compose { tenantId, reference }).
// Le modele Dossier est remplace par une collection en memoire qui evalue les
// filtres reellement employes (egalite sur tenantId, regex ou egalite sur
// reference, borne sur _id) et dont save() applique la contrainte d'unicite.

const YEAR = 2026;
const ref = (rank) => `${YEAR}${String(rank).padStart(2, '0')}`;

const TENANT_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

let idCounter = 0;
const nextId = () => String((idCounter += 1)).padStart(24, '0');

function matchesCondition(value, condition) {
  if (condition instanceof RegExp) return condition.test(String(value ?? ''));
  if (condition && typeof condition === 'object') {
    return Object.entries(condition).every(([operator, operand]) => {
      if (operator === '$regex') return new RegExp(operand).test(String(value ?? ''));
      if (operator === '$gt') return String(value) > String(operand);
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

/**
 * Faux modele Dossier. `docs` : [{ reference, tenantId }]. `afterRead` est
 * appele apres chaque lecture (numero de lecture en second argument) pour
 * simuler une creation concurrente entre deux requetes. `saveConflicts`
 * force save() a renvoyer 11000 sur les N premiers enregistrements meme sans
 * doublon (simulation d'un conflit signale par l'index seul).
 */
function fakeDossierModel(docs, { afterRead, saveConflicts = 0 } = {}) {
  const collection = {
    docs: docs.map((doc) => ({ _id: nextId(), tenantId: TENANT_A, ...doc })),
    reads: 0,
    saves: 0,
    forcedConflicts: saveConflicts,
    insert(doc) { this.docs.push({ _id: nextId(), tenantId: TENANT_A, ...doc }); },
    references(tenantId = TENANT_A) {
      return this.docs.filter((doc) => String(doc.tenantId) === String(tenantId)).map((doc) => doc.reference);
    },
  };
  const Dossier = jest.fn(function Dossier(payload) {
    Object.assign(this, payload);
    if (!this._id) this._id = nextId();
    this.save = jest.fn(async () => {
      collection.saves += 1;
      if (collection.forcedConflicts > 0) {
        collection.forcedConflicts -= 1;
        throw duplicateKeyError(this.tenantId, this.reference);
      }
      const clash = collection.docs.some((doc) => (
        String(doc.tenantId) === String(this.tenantId) && doc.reference === this.reference
      ));
      if (clash) throw duplicateKeyError(this.tenantId, this.reference);
      collection.docs.push({ _id: this._id, reference: this.reference, tenantId: this.tenantId });
      return this;
    });
  });
  Dossier.find = jest.fn((filter) => {
    let sortSpec = null;
    const query = {
      sort: jest.fn((spec) => { sortSpec = spec; return query; }),
      limit: jest.fn(async (count) => {
        let found = collection.docs.filter((doc) => matchesFilter(doc, filter));
        if (sortSpec) {
          const [[field, direction]] = Object.entries(sortSpec);
          found = [...found].sort((a, b) => (String(a[field]) < String(b[field]) ? -1 : 1) * direction);
        }
        const page = count > 0 ? found.slice(0, count) : found;
        collection.reads += 1;
        if (afterRead) afterRead(collection, collection.reads);
        return page.map((doc) => ({ ...doc }));
      }),
    };
    return query;
  });
  Dossier.memory = collection;
  return Dossier;
}

function loadUtil(Dossier) {
  jest.resetModules();
  jest.doMock('../../models/Folder/Dossier', () => Dossier);
  return require('../dossierReference');
}

const duplicates = (values) => values.filter((value, index) => values.indexOf(value) !== index);

let warnSpy;
beforeEach(() => { warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { warnSpy.mockRestore(); });

describe('parseReferenceRank', () => {
  test('lit le rang numerique d une reference de l annee', () => {
    const { parseReferenceRank } = loadUtil({});
    expect(parseReferenceRank('202601', 2026)).toBe(1);
    expect(parseReferenceRank('202699', 2026)).toBe(99);
    expect(parseReferenceRank('2026100', 2026)).toBe(100);
  });

  test('ignore les autres annees, les autres espaces et les valeurs malformees', () => {
    const { parseReferenceRank } = loadUtil({});
    expect(parseReferenceRank('202512', 2026)).toBeNull();
    expect(parseReferenceRank('DCM-ABC123', 2026)).toBeNull();
    expect(parseReferenceRank('TEST50-02', 2026)).toBeNull();
    expect(parseReferenceRank('2026', 2026)).toBeNull();
    expect(parseReferenceRank('2026abc', 2026)).toBeNull();
    expect(parseReferenceRank(' 202601', 2026)).toBeNull();
    expect(parseReferenceRank(null, 2026)).toBeNull();
    // Rang sur un seul chiffre : hors format, comme pour l'audit et la
    // migration (REFERENCE_PATTERN de scripts/lib/dossierReferenceMigration.js).
    expect(parseReferenceRank('20261', 2026)).toBeNull();
    expect(parseReferenceRank('20260', 2026)).toBeNull();
  });

  test('classe une reference exactement comme l audit et la migration (regle canonique partagee)', () => {
    const { parseReferenceRank } = loadUtil({});
    const { parseReference } = jest.requireActual('../../scripts/lib/dossierReferenceMigration');
    for (const reference of ['202601', '202699', '2026100', '20261', '2026', '202512', 'DCM-ABC123', 'TEST50-02', '', ' 202601']) {
      const parsed = parseReference(reference);
      const expected = parsed && parsed.year === 2026 ? parsed.rank : null;
      expect(parseReferenceRank(reference, 2026)).toBe(expected);
    }
  });
});

describe('computeNextReference', () => {
  test('commence au rang 01 et conserve le remplissage sur deux chiffres', () => {
    const { computeNextReference } = loadUtil({});
    expect(computeNextReference([], YEAR)).toBe(ref(1));
    expect(computeNextReference([ref(8)], YEAR)).toBe(ref(9));
    expect(computeNextReference([ref(9)], YEAR)).toBe(ref(10));
    expect(computeNextReference([ref(99)], YEAR)).toBe(ref(100));
  });

  test('retient le maximum numerique, pas le maximum lexicographique', () => {
    const { computeNextReference } = loadUtil({});
    expect(computeNextReference([ref(99), ref(100)], YEAR)).toBe(ref(101));
    expect(computeNextReference([ref(250), ref(99), ref(1000), ref(7)], YEAR)).toBe(ref(1001));
  });

  test('ne renumerote jamais : les trous de la sequence historique sont conserves', () => {
    const { computeNextReference } = loadUtil({});
    expect(computeNextReference([ref(44), ref(49)], YEAR)).toBe(ref(50));
  });

  test('tolere les doublons existants et les references hors format', () => {
    const { computeNextReference } = loadUtil({});
    expect(computeNextReference([ref(5), ref(5), '202512', 'DCM-ABC123', 'TEST50-01', '', `${YEAR}9`], YEAR)).toBe(ref(6));
  });
});

describe('generateDossierReference', () => {
  test('exige un cabinet resolu : sans tenantId, erreur explicite avant toute lecture', async () => {
    const Dossier = fakeDossierModel([{ reference: ref(1) }]);
    const { generateDossierReference } = loadUtil(Dossier);
    await expect(generateDossierReference({ year: YEAR })).rejects.toThrow(/cabinet/i);
    await expect(generateDossierReference({ tenantId: null, year: YEAR })).rejects.toThrow(/cabinet/i);
    await expect(generateDossierReference()).rejects.toThrow(/cabinet/i);
    // L'ancienne signature (annee seule) n'est plus acceptee.
    await expect(generateDossierReference(YEAR)).rejects.toThrow(/cabinet/i);
    expect(Dossier.find).not.toHaveBeenCalled();
  });

  test('premier dossier de l annee pour un cabinet neuf : rang 01', async () => {
    const Dossier = fakeDossierModel([]);
    const { generateDossierReference } = loadUtil(Dossier);
    await expect(generateDossierReference({ tenantId: TENANT_A, year: YEAR })).resolves.toBe(ref(1));
  });

  test('chaque cabinet suit sa propre sequence : toutes les lectures sont filtrees par tenantId', async () => {
    const Dossier = fakeDossierModel([
      { reference: ref(44), tenantId: TENANT_A },
      { reference: ref(49), tenantId: TENANT_A },
      { reference: ref(1), tenantId: TENANT_B },
      { reference: ref(2), tenantId: TENANT_B },
    ]);
    const { generateDossierReference } = loadUtil(Dossier);
    await expect(generateDossierReference({ tenantId: TENANT_A, year: YEAR })).resolves.toBe(ref(50));
    await expect(generateDossierReference({ tenantId: TENANT_B, year: YEAR })).resolves.toBe(ref(3));
    for (const [filter] of Dossier.find.mock.calls) {
      expect(filter).toHaveProperty('tenantId');
      expect([TENANT_A, TENANT_B]).toContain(String(filter.tenantId));
    }
  });

  test('la meme reference peut exister dans deux cabinets', async () => {
    const Dossier = fakeDossierModel([{ reference: ref(1), tenantId: TENANT_B }]);
    const { generateDossierReference } = loadUtil(Dossier);
    await expect(generateDossierReference({ tenantId: TENANT_A, year: YEAR })).resolves.toBe(ref(1));
  });

  test('les dossiers historiques sans cabinet (tenantId null) ne participent a aucune sequence', async () => {
    const Dossier = fakeDossierModel([{ reference: ref(7), tenantId: null }]);
    const { generateDossierReference } = loadUtil(Dossier);
    await expect(generateDossierReference({ tenantId: TENANT_A, year: YEAR })).resolves.toBe(ref(1));
  });

  test('lit les references de l annee par lots et retient le maximum situe au-dela du premier lot', async () => {
    const Dossier = fakeDossierModel([]);
    const { generateDossierReference, REFERENCE_BATCH_SIZE } = loadUtil(Dossier);
    for (let rank = 1; rank <= REFERENCE_BATCH_SIZE + 3; rank += 1) Dossier.memory.insert({ reference: ref(rank) });

    await expect(generateDossierReference({ tenantId: TENANT_A, year: YEAR })).resolves.toBe(ref(REFERENCE_BATCH_SIZE + 4));

    // Deux lots pour l'annee, puis la reverification du candidat.
    const yearReads = Dossier.find.mock.calls.filter(([filter]) => filter.reference instanceof RegExp);
    expect(yearReads).toHaveLength(2);
    expect(yearReads[1][0]._id).toEqual({ $gt: Dossier.memory.docs[REFERENCE_BATCH_SIZE - 1]._id });
  });

  test('regenere la reference si elle vient d etre prise dans le cabinet entre la lecture et l attribution', async () => {
    const Dossier = fakeDossierModel([{ reference: ref(1) }, { reference: ref(2) }], {
      afterRead: (collection, readCount) => { if (readCount === 1) collection.insert({ reference: ref(3) }); },
    });
    const { generateDossierReference } = loadUtil(Dossier);
    await expect(generateDossierReference({ tenantId: TENANT_A, year: YEAR })).resolves.toBe(ref(4));
  });

  test('une prise concurrente dans un AUTRE cabinet ne perturbe pas la sequence', async () => {
    const Dossier = fakeDossierModel([{ reference: ref(1) }], {
      afterRead: (collection, readCount) => {
        if (readCount === 1) collection.insert({ reference: ref(2), tenantId: TENANT_B });
      },
    });
    const { generateDossierReference } = loadUtil(Dossier);
    await expect(generateDossierReference({ tenantId: TENANT_A, year: YEAR })).resolves.toBe(ref(2));
  });

  test('echoue explicitement si la reference reste prise apres le nombre maximal de tentatives', async () => {
    // Chaque reverification constate une nouvelle prise du candidat.
    const Dossier = fakeDossierModel([{ reference: ref(1) }], {
      afterRead: (collection, readCount) => {
        if (readCount % 2 === 1) collection.insert({ reference: ref(collection.docs.length + 1) });
      },
    });
    const { generateDossierReference, REFERENCE_MAX_ATTEMPTS } = loadUtil(Dossier);
    await expect(generateDossierReference({ tenantId: TENANT_A, year: YEAR })).rejects.toThrow(/reference/i);
    const checks = Dossier.find.mock.calls.filter(([filter]) => typeof filter.reference === 'string');
    expect(checks).toHaveLength(REFERENCE_MAX_ATTEMPTS);
  });

  test('utilise l annee courante par defaut', async () => {
    const Dossier = fakeDossierModel([]);
    const { generateDossierReference } = loadUtil(Dossier);
    await expect(generateDossierReference({ tenantId: TENANT_A })).resolves.toBe(`${new Date().getFullYear()}01`);
  });

  test('au changement d annee, la sequence du cabinet repart a 01', async () => {
    const Dossier = fakeDossierModel([{ reference: `${YEAR - 1}150` }, { reference: `${YEAR - 1}151` }]);
    const { generateDossierReference } = loadUtil(Dossier);
    await expect(generateDossierReference({ tenantId: TENANT_A, year: YEAR })).resolves.toBe(ref(1));
  });
});

describe('isReferenceConflict', () => {
  test('reconnait l erreur 11000 de l index compose, avec ou sans keyPattern', () => {
    const { isReferenceConflict } = loadUtil({});
    expect(isReferenceConflict(duplicateKeyError(TENANT_A, ref(1)))).toBe(true);
    expect(isReferenceConflict(Object.assign(new Error('E11000'), { code: 11000 }))).toBe(true);
    expect(isReferenceConflict(Object.assign(new Error('dup'), { codeName: 'DuplicateKey' }))).toBe(true);
  });

  test('ignore les autres erreurs et les doublons d un autre index', () => {
    const { isReferenceConflict } = loadUtil({});
    expect(isReferenceConflict(null)).toBe(false);
    expect(isReferenceConflict(new Error('ValidationError'))).toBe(false);
    expect(isReferenceConflict(Object.assign(new Error('E11000'), { code: 11000, keyPattern: { email: 1 } }))).toBe(false);
  });

  test('lit keyPattern porte par error.cause (erreur du pilote enveloppee)', () => {
    const { isReferenceConflict } = loadUtil({});
    const wrapped = (keyPattern) => Object.assign(new Error('E11000 enveloppee'), { code: 11000, cause: { keyPattern } });
    expect(isReferenceConflict(wrapped({ tenantId: 1, reference: 1 }))).toBe(true);
    expect(isReferenceConflict(wrapped({ email: 1 }))).toBe(false);
    // cause sans keyPattern : doublon 11000 retenu (keyPattern non exige).
    expect(isReferenceConflict(Object.assign(new Error('E11000'), { code: 11000, cause: new Error('pilote') }))).toBe(true);
  });
});

describe('saveDossierWithReference', () => {
  const build = (Dossier, tenantId) => (reference) => new Dossier({ reference, tenantId, dossier: { dossier: { nom: 'x' } } });

  test('enregistre le dossier avec la reference fournie lorsqu elle est libre', async () => {
    const Dossier = fakeDossierModel([{ reference: ref(1) }]);
    const { saveDossierWithReference } = loadUtil(Dossier);
    const saved = await saveDossierWithReference({
      tenantId: TENANT_A, year: YEAR, reference: ref(2), buildDossier: build(Dossier, TENANT_A),
    });
    expect(saved.reference).toBe(ref(2));
    expect(Dossier.memory.references()).toEqual([ref(1), ref(2)]);
  });

  test('genere la reference si aucune n est fournie', async () => {
    const Dossier = fakeDossierModel([{ reference: ref(1) }]);
    const { saveDossierWithReference } = loadUtil(Dossier);
    const saved = await saveDossierWithReference({ tenantId: TENANT_A, year: YEAR, buildDossier: build(Dossier, TENANT_A) });
    expect(saved.reference).toBe(ref(2));
  });

  test('exige un cabinet resolu', async () => {
    const Dossier = fakeDossierModel([]);
    const { saveDossierWithReference } = loadUtil(Dossier);
    await expect(saveDossierWithReference({ year: YEAR, buildDossier: build(Dossier, null) })).rejects.toThrow(/cabinet/i);
    expect(Dossier).not.toHaveBeenCalled();
  });

  test('reference fournie pour une autre annee (changement d annee entre generation et enregistrement) : honoree au premier essai, regeneree pour l annee courante apres un conflit', async () => {
    const previous = `${YEAR - 1}99`;
    // Libre : la reference deja attribuee par la route (dans la sequence de
    // son annee) est conservee telle quelle, sans nouvelle generation.
    const free = fakeDossierModel([{ reference: `${YEAR - 1}98` }]);
    const util = loadUtil(free);
    const saved = await util.saveDossierWithReference({ tenantId: TENANT_A, year: YEAR, reference: previous, buildDossier: build(free, TENANT_A) });
    expect(saved.reference).toBe(previous);
    expect(free.memory.saves).toBe(1);
    expect(free.find).not.toHaveBeenCalled();
    // Prise entre-temps : la nouvelle reference suit la sequence de `year`.
    const taken = fakeDossierModel([{ reference: previous }]);
    const util2 = loadUtil(taken);
    const regenerated = await util2.saveDossierWithReference({ tenantId: TENANT_A, year: YEAR, reference: previous, buildDossier: build(taken, TENANT_A) });
    expect(regenerated.reference).toBe(ref(1));
    expect(taken.memory.references()).toEqual([previous, ref(1)]);
    expect(duplicates(taken.memory.references())).toEqual([]);
  });

  test('conflit d unicite (11000) a l enregistrement : nouvelle generation puis nouveau save, sans doublon', async () => {
    // Le candidat fourni est pris par une creation concurrente du meme cabinet
    // apres la reverification : seul l'index le signale (11000).
    const Dossier = fakeDossierModel([{ reference: ref(1) }]);
    const { saveDossierWithReference } = loadUtil(Dossier);
    Dossier.memory.insert({ reference: ref(2) });
    const saved = await saveDossierWithReference({
      tenantId: TENANT_A, year: YEAR, reference: ref(2), buildDossier: build(Dossier, TENANT_A),
    });
    expect(saved.reference).toBe(ref(3));
    expect(Dossier.memory.saves).toBe(2);
    expect(duplicates(Dossier.memory.references())).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  test('conflit signale par l index sans doublon visible : reprise jusqu a un enregistrement reussi', async () => {
    const Dossier = fakeDossierModel([{ reference: ref(1) }], { saveConflicts: 2 });
    const { saveDossierWithReference, REFERENCE_SAVE_MAX_ATTEMPTS } = loadUtil(Dossier);
    expect(REFERENCE_SAVE_MAX_ATTEMPTS).toBeGreaterThanOrEqual(3);
    expect(REFERENCE_SAVE_MAX_ATTEMPTS).toBeLessThanOrEqual(8);
    const saved = await saveDossierWithReference({ tenantId: TENANT_A, year: YEAR, buildDossier: build(Dossier, TENANT_A) });
    expect(saved.reference).toBe(ref(2));
    expect(Dossier.memory.saves).toBe(3);
    expect(Dossier.memory.references()).toEqual([ref(1), ref(2)]);
  });

  test('conflit persistant : erreur explicite apres le nombre maximal d essais, aucun dossier ecrit', async () => {
    const Dossier = fakeDossierModel([{ reference: ref(1) }], { saveConflicts: 99 });
    const { saveDossierWithReference, REFERENCE_SAVE_MAX_ATTEMPTS } = loadUtil(Dossier);
    await expect(saveDossierWithReference({ tenantId: TENANT_A, year: YEAR, buildDossier: build(Dossier, TENANT_A) }))
      .rejects.toMatchObject({ code: 'DOSSIER_REFERENCE_CONFLICT', status: 409 });
    expect(Dossier.memory.saves).toBe(REFERENCE_SAVE_MAX_ATTEMPTS);
    expect(Dossier.memory.references()).toEqual([ref(1)]);
  });

  test('toute autre erreur d enregistrement remonte telle quelle, sans nouvelle tentative', async () => {
    const Dossier = fakeDossierModel([]);
    const { saveDossierWithReference } = loadUtil(Dossier);
    const failing = (reference) => {
      const dossier = new Dossier({ reference, tenantId: TENANT_A });
      dossier.save = jest.fn().mockRejectedValue(Object.assign(new Error('Validation'), { name: 'ValidationError' }));
      return dossier;
    };
    await expect(saveDossierWithReference({ tenantId: TENANT_A, year: YEAR, buildDossier: failing }))
      .rejects.toMatchObject({ name: 'ValidationError' });
    expect(Dossier).toHaveBeenCalledTimes(1);
  });
});

describe('modele Dossier (schema reel, sans base) : index unique compose et trace d echec de creation', () => {
  // Seule protection contre une regression silencieuse du modele : les suites
  // de routes remplacent le modele par une collection en memoire. Le modele
  // est compile sur une instance mongoose isolee, sans connexion.
  let Dossier;
  beforeAll(() => {
    jest.isolateModules(() => {
      Dossier = jest.requireActual('../../models/Folder/Dossier');
    });
  });

  test('declare { tenantId: 1, reference: 1 } unique (tenantId_1_reference_1) et plus aucun index { reference: 1 } seul', () => {
    const indexes = Dossier.schema.indexes();
    expect(indexes).toContainEqual([
      { tenantId: 1, reference: 1 },
      expect.objectContaining({ unique: true, name: 'tenantId_1_reference_1' }),
    ]);
    const referenceAlone = indexes.filter(([key]) => Object.keys(key).length === 1 && key.reference !== undefined);
    expect(referenceAlone).toEqual([]);
    // Un seul index unique porte la reference : celui du cabinet.
    const uniqueOnReference = indexes.filter(([key, options]) => key.reference !== undefined && options.unique === true);
    expect(uniqueOnReference).toHaveLength(1);
  });

  test('un echec de creation des index (evenement "index" de Mongoose, seul signal une fois Model.init() intercepte) est journalise en console.error ; un succes ne l est pas', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      Dossier.emit('index', new Error('E11000 duplicate key error collection: kheops.dossiers index: tenantId_1_reference_1'));
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const line = errorSpy.mock.calls[0][0];
      expect(line).toMatch(/^\[Dossier\] Creation des index echouee/);
      expect(line).toMatch(/tenantId_1_reference_1/);
      expect(line).toMatch(/E11000 duplicate key/);
      expect(line).toMatch(/audit-dossier-references/);
      Dossier.emit('index');
      Dossier.emit('index', null);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
    }
  });
});


describe('attente entre deux essais apres un conflit d unicite', () => {
  test('le delai croit avec le rang de l essai et reste borne', () => {
    jest.resetModules();
    jest.doMock('../../models/Folder/Dossier', () => ({ find: jest.fn() }));
    const { retryBackoffDelay, REFERENCE_RETRY_BACKOFF_MS } = require('../dossierReference');
    for (const attempt of [1, 3, 8]) {
      const d = retryBackoffDelay(attempt);
      expect(d).toBeGreaterThanOrEqual(REFERENCE_RETRY_BACKOFF_MS.base * attempt);
      expect(d).toBeLessThanOrEqual((REFERENCE_RETRY_BACKOFF_MS.base + REFERENCE_RETRY_BACKOFF_MS.spread) * attempt);
    }
  });

  test('sous Jest l attente est nulle sauf KHEOPS_REFERENCE_BACKOFF=1', async () => {
    jest.resetModules();
    jest.doMock('../../models/Folder/Dossier', () => ({ find: jest.fn() }));
    const { retryBackoff, REFERENCE_RETRY_BACKOFF_MS } = require('../dossierReference');
    const t0 = Date.now();
    await retryBackoff(5);
    expect(Date.now() - t0).toBeLessThan(REFERENCE_RETRY_BACKOFF_MS.base);
    process.env.KHEOPS_REFERENCE_BACKOFF = '1';
    try {
      const t1 = Date.now();
      await retryBackoff(2);
      expect(Date.now() - t1).toBeGreaterThanOrEqual(REFERENCE_RETRY_BACKOFF_MS.base * 2 - 5);
    } finally {
      delete process.env.KHEOPS_REFERENCE_BACKOFF;
    }
  });
});


describe('generateDossierReference : contention persistante a la generation', () => {
  test('epuisement des tentatives -> erreur 409 DOSSIER_REFERENCE_CONFLICT, jamais une erreur interne', async () => {
    const Dossier = { find: jest.fn((filter) => ({ sort: () => ({ limit: async () => (filter.reference instanceof RegExp ? [{ _id: 'a', reference: ref(1) }] : [{ _id: 'b' }]) }), limit: async () => [{ _id: 'b' }] })) };
    const { generateDossierReference, REFERENCE_MAX_ATTEMPTS } = loadUtil(Dossier);
    await expect(generateDossierReference({ tenantId: 't1', year: YEAR })).rejects.toMatchObject({ code: 'DOSSIER_REFERENCE_CONFLICT', status: 409 });
    expect(REFERENCE_MAX_ATTEMPTS).toBeGreaterThanOrEqual(3);
  });
});
