'use strict';

// Utilitaire de reference de dossier "<annee><rang>" : calcul numerique du
// rang, lecture par lots des references de l'annee et reverification avant
// attribution. Le modele Dossier est remplace par une collection en memoire
// qui evalue les filtres reellement employes (regex, egalite, borne sur _id).

const YEAR = 2026;
const ref = (rank) => `${YEAR}${String(rank).padStart(2, '0')}`;

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

function fakeDossierModel(references, { afterRead } = {}) {
  const collection = {
    docs: references.map((reference) => ({ _id: nextId(), reference })),
    reads: 0,
    insert(reference) { this.docs.push({ _id: nextId(), reference }); },
  };
  const Dossier = {
    memory: collection,
    find: jest.fn((filter) => {
      let sortSpec = null;
      const query = {
        sort: jest.fn((spec) => { sortSpec = spec; return query; }),
        limit: jest.fn(async (count) => {
          let docs = collection.docs.filter((doc) => matchesFilter(doc, filter));
          if (sortSpec) {
            const [[field, direction]] = Object.entries(sortSpec);
            docs = [...docs].sort((a, b) => (String(a[field]) < String(b[field]) ? -1 : 1) * direction);
          }
          const page = count > 0 ? docs.slice(0, count) : docs;
          collection.reads += 1;
          if (afterRead) afterRead(collection, collection.reads);
          return page.map((doc) => ({ ...doc }));
        }),
      };
      return query;
    }),
  };
  return Dossier;
}

function loadUtil(Dossier) {
  jest.resetModules();
  jest.doMock('../../models/Folder/Dossier', () => Dossier);
  return require('../dossierReference');
}

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
    expect(parseReferenceRank('2026', 2026)).toBeNull();
    expect(parseReferenceRank('2026abc', 2026)).toBeNull();
    expect(parseReferenceRank(null, 2026)).toBeNull();
  });
});

describe('computeNextReference', () => {
  test('commence au rang 01 et conserve le remplissage sur deux chiffres', () => {
    const { computeNextReference } = loadUtil({});
    expect(computeNextReference([], YEAR)).toBe(ref(1));
    expect(computeNextReference([ref(8)], YEAR)).toBe(ref(9));
    expect(computeNextReference([ref(99)], YEAR)).toBe(ref(100));
  });

  test('retient le maximum numerique, pas le maximum lexicographique', () => {
    const { computeNextReference } = loadUtil({});
    expect(computeNextReference([ref(99), ref(100)], YEAR)).toBe(ref(101));
    expect(computeNextReference([ref(250), ref(99), ref(1000), ref(7)], YEAR)).toBe(ref(1001));
  });

  test('tolere les doublons existants et les references hors format', () => {
    const { computeNextReference } = loadUtil({});
    expect(computeNextReference([ref(5), ref(5), '202512', 'DCM-ABC123', ''], YEAR)).toBe(ref(6));
  });
});

describe('generateDossierReference', () => {
  test('lit les references de l annee par lots et retient le maximum situe au-dela du premier lot', async () => {
    const Dossier = fakeDossierModel([]);
    const { generateDossierReference, REFERENCE_BATCH_SIZE } = loadUtil(Dossier);
    for (let rank = 1; rank <= REFERENCE_BATCH_SIZE + 3; rank += 1) Dossier.memory.insert(ref(rank));

    await expect(generateDossierReference(YEAR)).resolves.toBe(ref(REFERENCE_BATCH_SIZE + 4));

    // Deux lots pour l'annee, puis la reverification du candidat.
    const yearReads = Dossier.find.mock.calls.filter(([filter]) => filter.reference instanceof RegExp);
    expect(yearReads).toHaveLength(2);
    expect(yearReads[1][0]._id).toEqual({ $gt: Dossier.memory.docs[REFERENCE_BATCH_SIZE - 1]._id });
  });

  test('regenere la reference si elle vient d etre prise entre la lecture et l attribution', async () => {
    const Dossier = fakeDossierModel([ref(1), ref(2)], {
      afterRead: (collection, readCount) => { if (readCount === 1) collection.insert(ref(3)); },
    });
    const { generateDossierReference } = loadUtil(Dossier);
    await expect(generateDossierReference(YEAR)).resolves.toBe(ref(4));
  });

  test('echoue explicitement si la reference reste prise apres le nombre maximal de tentatives', async () => {
    // Chaque reverification constate une nouvelle prise du candidat.
    const Dossier = fakeDossierModel([ref(1)], {
      afterRead: (collection, readCount) => {
        if (readCount % 2 === 1) collection.insert(ref(collection.docs.length + 1));
      },
    });
    const { generateDossierReference, REFERENCE_MAX_ATTEMPTS } = loadUtil(Dossier);
    await expect(generateDossierReference(YEAR)).rejects.toThrow(/reference/i);
    const checks = Dossier.find.mock.calls.filter(([filter]) => typeof filter.reference === 'string');
    expect(checks).toHaveLength(REFERENCE_MAX_ATTEMPTS);
  });

  test('utilise l annee courante par defaut', async () => {
    const Dossier = fakeDossierModel([]);
    const { generateDossierReference } = loadUtil(Dossier);
    await expect(generateDossierReference()).resolves.toBe(`${new Date().getFullYear()}01`);
  });
});
