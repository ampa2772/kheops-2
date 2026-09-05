'use strict';

// Logique pure de l'audit et de la migration des references de dossier :
// analyse des references, detection des doublons (par cabinet et globaux),
// rattachement des dossiers sans cabinet via UserDossier -> User.tenantId,
// verdict sur l'index unique compose, journal et retour arriere borne au run
// (index compose, ancien index reference_1), idempotence, analyse des
// arguments et garde-fous de ciblage de base (repli sans dbTarget). Puis
// l'orchestration du script de migration (faux modele, journal sur disque) et
// la connexion des scripts (faux mongoose : aucun index ni collection cree).

const lib = require('../dossierReferenceMigration');

const T = { a: 'aaaaaaaaaaaaaaaaaaaaaaaa', b: 'bbbbbbbbbbbbbbbbbbbbbbbb' };
const U = { u1: '111111111111111111111111', u2: '222222222222222222222222', u3: '333333333333333333333333', u9: '999999999999999999999999' };

const dossier = (id, reference, tenantId = null) => ({ _id: id, reference, tenantId });

describe('parseReference', () => {
  test('lit annee et rang numerique des references "<annee><rang>"', () => {
    expect(lib.parseReference('202601')).toEqual({ year: 2026, rank: 1 });
    expect(lib.parseReference('202699')).toEqual({ year: 2026, rank: 99 });
    expect(lib.parseReference('2026100')).toEqual({ year: 2026, rank: 100 });
    expect(lib.parseReference('202512')).toEqual({ year: 2025, rank: 12 });
  });

  test('renvoie null hors format (DCM-, TEST50-, rang sur un chiffre, vide, null)', () => {
    expect(lib.parseReference('DCM-OZ1B4P')).toBeNull();
    expect(lib.parseReference('TEST50-02')).toBeNull();
    expect(lib.parseReference('20261')).toBeNull();
    expect(lib.parseReference('2026')).toBeNull();
    expect(lib.parseReference('')).toBeNull();
    expect(lib.parseReference(null)).toBeNull();
    expect(lib.parseReference(undefined)).toBeNull();
  });
});

describe('summarizeDossiers', () => {
  const dossiers = [
    dossier('d1', '202601', T.a),
    dossier('d2', '202602', T.a),
    dossier('d3', '202601', T.b),
    dossier('d4', '202512', T.b),
    dossier('d5', 'DCM-AAAAAA', null),
    dossier('d6', '202603', null),
    dossier('d7', 'TEST50-01', T.a),
  ];

  test('totaux, cabinets, sans cabinet, repartition par cabinet et par annee, hors format', () => {
    const summary = lib.summarizeDossiers(dossiers);
    expect(summary.total).toBe(7);
    expect(summary.sansTenantId).toBe(2);
    expect(summary.cabinets).toBe(2);
    expect(summary.parAnnee).toEqual({ 2026: 4, 2025: 1 });
    expect(summary.horsFormat.map((item) => item.reference)).toEqual(['DCM-AAAAAA', 'TEST50-01']);
    expect(summary.parCabinet).toEqual([
      { tenantId: T.a, dossiers: 3, parAnnee: { 2026: 2 }, horsFormat: 1 },
      { tenantId: T.b, dossiers: 2, parAnnee: { 2026: 1, 2025: 1 }, horsFormat: 0 },
      { tenantId: null, dossiers: 2, parAnnee: { 2026: 1 }, horsFormat: 1 },
    ]);
  });

  test('accepte des identifiants objets (ObjectId) et une liste vide', () => {
    const oid = { toString: () => T.a };
    const summary = lib.summarizeDossiers([{ _id: { toString: () => 'x' }, reference: '202601', tenantId: oid }]);
    expect(summary.parCabinet[0].tenantId).toBe(T.a);
    expect(lib.summarizeDossiers([])).toMatchObject({ total: 0, sansTenantId: 0, cabinets: 0, parCabinet: [], horsFormat: [] });
  });
});

describe('findDuplicateReferences', () => {
  test('par cabinet : la meme reference dans deux cabinets n est pas un doublon', () => {
    const dossiers = [dossier('d1', '202601', T.a), dossier('d2', '202601', T.b)];
    expect(lib.findDuplicateReferences(dossiers, { scope: 'cabinet' })).toEqual([]);
    expect(lib.findDuplicateReferences(dossiers, { scope: 'global' })).toEqual([{ reference: '202601', ids: ['d1', 'd2'] }]);
  });

  test('par cabinet : deux dossiers du meme cabinet avec la meme reference', () => {
    const dossiers = [dossier('d1', '202601', T.a), dossier('d2', '202601', T.a), dossier('d3', '202602', T.a)];
    expect(lib.findDuplicateReferences(dossiers, { scope: 'cabinet' })).toEqual([
      { tenantId: T.a, reference: '202601', ids: ['d1', 'd2'] },
    ]);
  });

  test('les dossiers sans cabinet forment un groupe (tenantId null) ou l index exige aussi des references distinctes', () => {
    const dossiers = [dossier('d1', 'DCM-AAAAAA', null), dossier('d2', 'DCM-AAAAAA', null), dossier('d3', 'DCM-AAAAAA', T.a)];
    expect(lib.findDuplicateReferences(dossiers, { scope: 'cabinet' })).toEqual([
      { tenantId: null, reference: 'DCM-AAAAAA', ids: ['d1', 'd2'] },
    ]);
  });

  test('ignore les references vides pour le regroupement', () => {
    expect(lib.findDuplicateReferences([dossier('d1', null, T.a), dossier('d2', undefined, T.a)], { scope: 'cabinet' })).toEqual([]);
  });
});

describe('planTenantAttachments', () => {
  const users = [
    { _id: U.u1, tenantId: T.a },
    { _id: U.u2, tenantId: T.b },
    { _id: U.u3, tenantId: null },
  ];

  test('un seul utilisateur proprietaire avec cabinet : rattachement propose, ancienne valeur journalisee', () => {
    const dossiers = [dossier('d1', '202601', null), dossier('d2', '202602', T.a)];
    const links = [{ user: U.u1, dossier: 'd1' }, { user: U.u1, dossier: 'd2' }];
    const plan = lib.planTenantAttachments({ dossiers, links, users });
    expect(plan.updates).toEqual([{ dossierId: 'd1', reference: '202601', from: null, to: T.a, userId: U.u1 }]);
    expect(plan.unresolved).toEqual([]);
    expect(plan.dejaRattaches).toBe(1);
  });

  test('un meme utilisateur lie deux fois compte pour un seul proprietaire', () => {
    const dossiers = [dossier('d1', '202601', null)];
    const links = [{ user: U.u1, dossier: 'd1' }, { user: U.u1, dossier: 'd1' }];
    expect(lib.planTenantAttachments({ dossiers, links, users }).updates).toHaveLength(1);
  });

  test('sans lien UserDossier : laisse et signale', () => {
    const plan = lib.planTenantAttachments({ dossiers: [dossier('d1', '202601', null)], links: [], users });
    expect(plan.updates).toEqual([]);
    expect(plan.unresolved).toEqual([{ dossierId: 'd1', reference: '202601', reason: 'aucun_lien_utilisateur', candidates: [] }]);
  });

  test('plusieurs proprietaires : laisse et signale avec les cabinets candidats (meme s ils convergent)', () => {
    const dossiers = [dossier('d1', '202601', null), dossier('d2', '202602', null)];
    const links = [
      { user: U.u1, dossier: 'd1' }, { user: U.u2, dossier: 'd1' },
      { user: U.u1, dossier: 'd2' }, { user: { toString: () => U.u1 }, dossier: 'd2' }, { user: U.u3, dossier: 'd2' },
    ];
    const plan = lib.planTenantAttachments({ dossiers, links, users });
    expect(plan.updates).toEqual([]);
    expect(plan.unresolved).toEqual([
      { dossierId: 'd1', reference: '202601', reason: 'plusieurs_proprietaires', candidates: [{ userId: U.u1, tenantId: T.a }, { userId: U.u2, tenantId: T.b }] },
      { dossierId: 'd2', reference: '202602', reason: 'plusieurs_proprietaires', candidates: [{ userId: U.u1, tenantId: T.a }, { userId: U.u3, tenantId: null }] },
    ]);
  });

  test('proprietaire sans cabinet ou introuvable : laisse et signale', () => {
    const dossiers = [dossier('d1', '202601', null), dossier('d2', '202602', null)];
    const links = [{ user: U.u3, dossier: 'd1' }, { user: U.u9, dossier: 'd2' }];
    const plan = lib.planTenantAttachments({ dossiers, links, users });
    expect(plan.updates).toEqual([]);
    expect(plan.unresolved.map((item) => [item.dossierId, item.reason])).toEqual([
      ['d1', 'utilisateur_sans_cabinet'],
      ['d2', 'utilisateur_introuvable'],
    ]);
  });

  test('idempotence : une fois le plan applique, une nouvelle planification ne propose plus rien', () => {
    const dossiers = [dossier('d1', '202601', null), dossier('d2', '202602', null)];
    const links = [{ user: U.u1, dossier: 'd1' }];
    const first = lib.planTenantAttachments({ dossiers, links, users });
    expect(first.updates).toHaveLength(1);
    const after = lib.applyAttachments(dossiers, first.updates);
    expect(after.find((item) => item.id === 'd1').tenantId).toBe(T.a);
    // Les documents d'origine ne sont pas modifies.
    expect(dossiers[0].tenantId).toBeNull();
    const second = lib.planTenantAttachments({ dossiers: after, links, users });
    expect(second.updates).toEqual([]);
    expect(second.unresolved).toEqual(first.unresolved);
    expect(second.dejaRattaches).toBe(1);
  });
});

describe('verdict sur l index unique compose', () => {
  test('un rattachement qui creerait un doublon dans le cabinet cible rend l index non creable', () => {
    const dossiers = [dossier('d1', '202601', T.a), dossier('d2', '202601', null)];
    const links = [{ user: U.u1, dossier: 'd2' }];
    const plan = lib.planTenantAttachments({ dossiers, links, users: [{ _id: U.u1, tenantId: T.a }] });
    const after = lib.applyAttachments(dossiers, plan.updates);
    const duplicates = lib.findDuplicateReferences(after, { scope: 'cabinet' });
    expect(duplicates).toEqual([{ tenantId: T.a, reference: '202601', ids: ['d1', 'd2'] }]);
    expect(lib.buildIndexVerdict({ duplicates })).toEqual({ creatable: false, reason: '1 doublon(s) par cabinet a traiter avant creation de l index.' });
  });

  test('sans doublon, l index est creable', () => {
    expect(lib.buildIndexVerdict({ duplicates: [] })).toEqual({ creatable: true, reason: 'aucun doublon par cabinet.' });
  });

  test('reconnaissance de l index compose parmi les index existants', () => {
    const legacy = [{ name: '_id_', key: { _id: 1 } }, { name: 'tenantId_1', key: { tenantId: 1 } }, { name: 'reference_1', key: { reference: 1 } }];
    expect(lib.hasUniqueCompoundIndex(legacy)).toBe(false);
    expect(lib.findCompoundIndex(legacy)).toBeNull();
    const withUnique = [...legacy, { name: 'tenantId_1_reference_1', key: { tenantId: 1, reference: 1 }, unique: true }];
    expect(lib.hasUniqueCompoundIndex(withUnique)).toBe(true);
    // Meme cle mais non unique : detectee comme presente, pas comme unique.
    const nonUnique = [...legacy, { name: 'custom', key: { tenantId: 1, reference: 1 } }];
    expect(lib.hasUniqueCompoundIndex(nonUnique)).toBe(false);
    expect(lib.findCompoundIndex(nonUnique)).toMatchObject({ name: 'custom' });
    expect(lib.describeIndexes(withUnique)).toEqual([
      { name: '_id_', key: { _id: 1 }, unique: false },
      { name: 'tenantId_1', key: { tenantId: 1 }, unique: false },
      { name: 'reference_1', key: { reference: 1 }, unique: false },
      { name: 'tenantId_1_reference_1', key: { tenantId: 1, reference: 1 }, unique: true },
    ]);
    expect(lib.UNIQUE_INDEX_NAME).toBe('tenantId_1_reference_1');
    expect(lib.UNIQUE_INDEX_KEY).toEqual({ tenantId: 1, reference: 1 });
  });

  test('reconnaissance de l ancien index { reference: 1 } seul, quel que soit son nom', () => {
    const legacy = [{ name: '_id_', key: { _id: 1 } }, { name: 'tenantId_1', key: { tenantId: 1 } }, { name: 'reference_1', key: { reference: 1 } }];
    expect(lib.findLegacyReferenceIndex(legacy)).toMatchObject({ name: 'reference_1', key: { reference: 1 } });
    expect(lib.findLegacyReferenceIndex([{ name: '_id_', key: { _id: 1 } }, { name: 'ref_custom', key: { reference: 1 }, unique: true }]))
      .toMatchObject({ name: 'ref_custom', unique: true });
    // L'index compose n'est pas l'ancien index ; sans index sur la reference seule : null.
    expect(lib.findLegacyReferenceIndex([{ name: 'tenantId_1_reference_1', key: { tenantId: 1, reference: 1 }, unique: true }])).toBeNull();
    expect(lib.findLegacyReferenceIndex([])).toBeNull();
    expect(lib.findLegacyReferenceIndex(undefined)).toBeNull();
    expect(lib.LEGACY_INDEX_NAME).toBe('reference_1');
    expect(lib.LEGACY_INDEX_KEY).toEqual({ reference: 1 });
  });
});

describe('buildAuditReport', () => {
  test('rapport complet en lecture seule', () => {
    const dossiers = [
      dossier('d1', '202601', T.a), dossier('d2', '202602', T.a), dossier('d3', '202601', T.b),
      dossier('d4', 'DCM-AAAAAA', null), dossier('d5', '202603', null),
    ];
    const links = [{ user: U.u1, dossier: 'd4' }];
    const users = [{ _id: U.u1, tenantId: T.a }];
    const indexes = [{ name: '_id_', key: { _id: 1 } }, { name: 'reference_1', key: { reference: 1 } }];
    const report = lib.buildAuditReport({ dossiers, links, users, indexes, target: { kind: 'dev', dbName: 'kheops2_dev', fingerprint: 'abc' } });
    expect(report.cible).toEqual({ kind: 'dev', dbName: 'kheops2_dev', fingerprint: 'abc' });
    expect(report.total).toBe(5);
    expect(report.sansTenantId).toEqual({
      total: 2,
      rattachementsProposes: [{ dossierId: 'd4', reference: 'DCM-AAAAAA', from: null, to: T.a, userId: U.u1 }],
      nonResolus: [{ dossierId: 'd5', reference: '202603', reason: 'aucun_lien_utilisateur', candidates: [] }],
    });
    expect(report.parAnnee).toEqual({ 2026: 4 });
    expect(report.referencesHorsFormat).toEqual([{ id: 'd4', reference: 'DCM-AAAAAA', tenantId: null }]);
    expect(report.doublonsParCabinet).toEqual([]);
    expect(report.doublonsGlobaux).toEqual([{ reference: '202601', ids: ['d1', 'd3'] }]);
    expect(report.doublonsApresRattachement).toEqual([]);
    expect(report.index).toEqual({
      presents: [{ name: '_id_', key: { _id: 1 }, unique: false }, { name: 'reference_1', key: { reference: 1 }, unique: false }],
      composeUniquePresent: false,
      verdict: { creatable: true, reason: 'aucun doublon par cabinet.' },
    });
    // La sortie ne contient jamais d'URI.
    expect(JSON.stringify(report)).not.toMatch(/mongodb/i);
  });
});

describe('journal et retour arriere', () => {
  const updates = [
    { dossierId: 'd1', reference: '202601', from: null, to: T.a, userId: U.u1 },
    { dossierId: 'd2', reference: '202602', from: null, to: T.b, userId: U.u2 },
  ];
  const now = new Date('2026-09-05T10:00:00.000Z');

  test('le journal conserve l ancienne valeur de chaque changement et l index vise', () => {
    const journal = lib.buildJournal({ runId: 'run-1', target: { kind: 'dev', dbName: 'kheops2_dev', fingerprint: 'abc' }, updates, now });
    expect(journal).toEqual({
      runId: 'run-1',
      createdAt: '2026-09-05T10:00:00.000Z',
      target: { kind: 'dev', dbName: 'kheops2_dev', fingerprint: 'abc' },
      status: 'planned',
      entries: [
        { dossierId: 'd1', reference: '202601', field: 'tenantId', from: null, to: T.a, userId: U.u1 },
        { dossierId: 'd2', reference: '202602', field: 'tenantId', from: null, to: T.b, userId: U.u2 },
      ],
      index: { name: 'tenantId_1_reference_1', key: { tenantId: 1, reference: 1 }, created: false },
      legacyIndex: { name: 'reference_1', key: { reference: 1 }, unique: false, dropped: false },
    });
  });

  test('retour arriere : restaure uniquement les dossiers encore a la valeur appliquee ; index compose supprime et reference_1 recree parce que le run les a crees/supprimes', () => {
    const journal = lib.buildJournal({ runId: 'run-1', target: {}, updates, now });
    journal.index.created = true;
    journal.legacyIndex = { name: 'reference_1', key: { reference: 1 }, unique: false, dropped: true };
    const dossiers = [
      dossier('d1', '202601', T.a),   // valeur appliquee -> restaure a null
      dossier('d2', '202602', T.b),   // idem
    ];
    const indexes = [{ name: 'tenantId_1_reference_1', key: { tenantId: 1, reference: 1 }, unique: true }];
    const plan = lib.planRollback({ journal, dossiers, indexes });
    expect(plan.restores).toEqual([
      { dossierId: 'd1', from: T.a, to: null, action: 'restore' },
      { dossierId: 'd2', from: T.b, to: null, action: 'restore' },
    ]);
    expect(plan.dropIndex).toBe(true);
    expect(plan.indexName).toBe('tenantId_1_reference_1');
    expect(plan.recreateLegacyIndex).toBe(true);
    expect(plan.legacyIndex).toEqual({ name: 'reference_1', key: { reference: 1 }, unique: false });
  });

  test('retour arriere borne au run : index compose non cree par le run (index.created=false) conserve, reference_1 non supprimee par le run non recreee', () => {
    const journal = lib.buildJournal({ runId: 'run-2', target: {}, updates: [], now });
    const indexes = [{ name: 'tenantId_1_reference_1', key: { tenantId: 1, reference: 1 }, unique: true }];
    const plan = lib.planRollback({ journal, dossiers: [], indexes });
    expect(plan.restores).toEqual([]);
    expect(plan.dropIndex).toBe(false);
    expect(plan.indexName).toBe('tenantId_1_reference_1');
    expect(plan.recreateLegacyIndex).toBe(false);
    expect(plan.legacyIndex).toBeNull();
    // Le run a cree l'index mais il a deja ete supprime : rien a faire.
    journal.index.created = true;
    expect(lib.planRollback({ journal, dossiers: [], indexes: [] }).dropIndex).toBe(false);
    // Le run a supprime reference_1 mais il existe deja de nouveau (autoIndex
    // de l'ancien modele) : non recree une seconde fois.
    journal.legacyIndex.dropped = true;
    expect(lib.planRollback({ journal, dossiers: [], indexes: [{ name: 'reference_1', key: { reference: 1 } }] }))
      .toMatchObject({ recreateLegacyIndex: false, legacyIndex: { name: 'reference_1', key: { reference: 1 }, unique: false } });
    expect(lib.planRollback({ journal, dossiers: [], indexes: [] })).toMatchObject({ recreateLegacyIndex: true });
    // Journal d'une version anterieure du script, sans legacyIndex : aucune recreation.
    delete journal.legacyIndex;
    expect(lib.planRollback({ journal, dossiers: [], indexes: [] })).toMatchObject({ recreateLegacyIndex: false, legacyIndex: null });
  });

  test('retour arriere idempotent et non destructif : non applique par le run, deja restaure, modifie depuis, ou dossier absent -> ignore', () => {
    const journal = lib.buildJournal({
      runId: 'run-1',
      target: {},
      updates: [
        ...updates,
        { dossierId: 'd3', reference: '202603', from: null, to: T.a, userId: U.u1 },
        { dossierId: 'd4', reference: '202604', from: null, to: T.a, userId: U.u1 },
      ],
      now,
    });
    journal.index.created = true;
    journal.entries[3].applied = false; // updateOne sans effet : rattache entre-temps par l'application
    const dossiers = [
      dossier('d1', '202601', null),  // deja restaure
      dossier('d2', '202602', T.a),   // modifie depuis (autre cabinet) : ne pas ecraser
      dossier('d4', '202604', T.a),   // porte la valeur `to`, mais le run ne l'a pas ecrite
    ];
    const plan = lib.planRollback({ journal, dossiers, indexes: [{ name: 'reference_1', key: { reference: 1 } }] });
    expect(plan.restores).toEqual([
      { dossierId: 'd1', from: null, to: null, action: 'skip_already_restored' },
      { dossierId: 'd2', from: T.a, to: null, action: 'skip_changed' },
      { dossierId: 'd3', from: undefined, to: null, action: 'skip_missing' },
      { dossierId: 'd4', from: T.a, to: null, action: 'skip_not_applied' },
    ]);
    expect(plan.dropIndex).toBe(false); // index compose absent
    expect(plan.recreateLegacyIndex).toBe(false);
  });
});

describe('parseMigrationArgs', () => {
  test('lit la cible, le mode, l identifiant de run et le retour arriere (deux syntaxes)', () => {
    expect(lib.parseMigrationArgs(['--target=dev', '--apply', '--run-id=run-1'])).toMatchObject({
      target: 'dev', apply: true, runId: 'run-1', rollback: null, confirmPreprod: false,
    });
    expect(lib.parseMigrationArgs(['--target=preprod', '--confirm-preprod', '--rollback=run-1'])).toMatchObject({
      target: 'preprod', apply: false, rollback: 'run-1', confirmPreprod: true,
    });
    expect(lib.parseMigrationArgs(['--target', 'test', '--rollback', 'run-2', '--out', 'rapport.json'])).toMatchObject({
      target: 'test', rollback: 'run-2', out: 'rapport.json',
    });
    expect(lib.parseMigrationArgs([])).toMatchObject({ target: null, apply: false, runId: null, rollback: null });
  });

  test('refuse une cible inconnue', () => {
    expect(() => lib.parseMigrationArgs(['--target=prod'])).toThrow(/--target/);
  });

  test('identifiant de run par defaut horodate', () => {
    expect(lib.buildDefaultRunId(new Date('2026-09-05T10:02:03.000Z'))).toBe('dossier-references-20260905-100203');
  });
});

describe('ciblage de base en repli (sans scripts/lib/dbTarget)', () => {
  const env = {};

  test('describeMongoUri : nom de base et empreinte, sans jamais exposer les identifiants', () => {
    const described = lib.describeMongoUri('mongodb+srv://user:secret@cluster.example.net/kheops2_dev?retryWrites=true');
    expect(described.dbName).toBe('kheops2_dev');
    expect(described.fingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(JSON.stringify(described)).not.toMatch(/secret|user:/);
    expect(lib.describeMongoUri('mongodb+srv://user:secret@cluster.example.net/?retryWrites=true').dbName).toBe('(defaut)');
    expect(lib.describeMongoUri('mongodb+srv://user:secret@cluster.example.net').dbName).toBe('(defaut)');
  });

  test('fichier d environnement selon la cible', () => {
    expect(lib.resolveFallbackEnvFile('dev')).toBe('.env.development');
    expect(lib.resolveFallbackEnvFile('test')).toBe('.env.test');
    expect(lib.resolveFallbackEnvFile('preprod')).toBe('.env');
  });

  test('dev et test exigent une base nommee explicitement', () => {
    expect(lib.checkFallbackTarget({ target: 'dev', uri: 'mongodb://localhost/kheops2_dev', deploymentUri: null, env }))
      .toMatchObject({ kind: 'dev', dbName: 'kheops2_dev' });
    expect(() => lib.checkFallbackTarget({ target: 'dev', uri: 'mongodb://localhost/kheops2', deploymentUri: null, env })).toThrow(/dev/);
    expect(() => lib.checkFallbackTarget({ target: 'dev', uri: 'mongodb://localhost/', deploymentUri: null, env })).toThrow(/dev/);
    expect(lib.checkFallbackTarget({ target: 'test', uri: 'mongodb://localhost/kheops2_test', deploymentUri: null, env })).toMatchObject({ kind: 'test' });
    expect(() => lib.checkFallbackTarget({ target: 'test', uri: 'mongodb://localhost/kheops2_dev', deploymentUri: null, env })).toThrow(/test/);
  });

  test('refuse la base de preproduction depuis un poste local (meme empreinte que server/.env)', () => {
    const preprod = 'mongodb+srv://u:p@cluster.example.net/kheops2_dev?x=1';
    expect(() => lib.checkFallbackTarget({ target: 'dev', uri: preprod, deploymentUri: preprod, env })).toThrow(/preproduction/);
  });

  test('preprod : exige --confirm-preprod, KHEOPS_DB_OVERRIDE=preprod et une raison', () => {
    const uri = 'mongodb+srv://u:p@cluster.example.net/';
    expect(() => lib.checkFallbackTarget({ target: 'preprod', uri, deploymentUri: uri, env, confirmPreprod: false })).toThrow(/--confirm-preprod/);
    expect(() => lib.checkFallbackTarget({ target: 'preprod', uri, deploymentUri: uri, env: { KHEOPS_DB_OVERRIDE: 'preprod' }, confirmPreprod: true })).toThrow(/KHEOPS_DB_OVERRIDE_REASON/);
    expect(() => lib.checkFallbackTarget({ target: 'preprod', uri, deploymentUri: uri, env: { KHEOPS_DB_OVERRIDE_REASON: 'x' }, confirmPreprod: true })).toThrow(/KHEOPS_DB_OVERRIDE/);
    expect(lib.checkFallbackTarget({
      target: 'preprod', uri, deploymentUri: uri, confirmPreprod: true,
      env: { KHEOPS_DB_OVERRIDE: 'preprod', KHEOPS_DB_OVERRIDE_REASON: 'migration autorisee' },
    })).toMatchObject({ kind: 'preprod-override', dbName: '(defaut)', override: { reason: 'migration autorisee' } });
  });
});

describe('orchestration du script migrate-dossier-references (faux modele, journal sur disque)', () => {
  // migrate()/rollback() sont exercees sans connexion : la lecture d'etat et
  // le modele Dossier sont simules, le journal est ecrit dans un repertoire
  // temporaire (KHEOPS_MIGRATION_JOURNALS_DIR).
  // Identifiants au format ObjectId : le script les convertit avant chaque ecriture.
  const D = { d1: '00000000000000000000d001', d2: '00000000000000000000d002', d3: '00000000000000000000d003', d9: '00000000000000000000d009' };
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  let journalsDir;
  let spies;

  beforeEach(() => {
    journalsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kheops-journals-'));
    process.env.KHEOPS_MIGRATION_JOURNALS_DIR = journalsDir;
    spies = ['log', 'warn', 'error'].map((name) => jest.spyOn(console, name).mockImplementation(() => {}));
    process.exitCode = undefined;
  });

  afterEach(() => {
    delete process.env.KHEOPS_MIGRATION_JOURNALS_DIR;
    spies.forEach((spy) => spy.mockRestore());
    process.exitCode = undefined;
    fs.rmSync(journalsDir, { recursive: true, force: true });
  });

  function fakeState({ dossiers, links = [], users = [], indexes = [] }) {
    const collection = { docs: dossiers.map((doc) => ({ ...doc })), indexes: indexes.map((index) => ({ ...index })) };
    const Dossier = {
      collection: {
        indexes: jest.fn(async () => collection.indexes.map((index) => ({ ...index }))),
        createIndex: jest.fn(async (key, options) => { collection.indexes.push({ name: options.name, key, unique: options.unique }); }),
        dropIndex: jest.fn(async (name) => { collection.indexes = collection.indexes.filter((index) => index.name !== name); }),
      },
      find: jest.fn((filter) => ({
        lean: async () => collection.docs
          .filter((doc) => !filter || !filter._id || filter._id.$in.map(String).includes(String(doc._id)))
          .map((doc) => ({ ...doc })),
      })),
      updateOne: jest.fn(async (filter, update) => {
        const doc = collection.docs.find((item) => String(item._id) === String(filter._id));
        const current = doc && doc.tenantId ? String(doc.tenantId) : null;
        const expected = filter.tenantId ? String(filter.tenantId) : null;
        if (!doc || current !== expected) return { matchedCount: 0, modifiedCount: 0 };
        doc.tenantId = update.$set.tenantId ? String(update.$set.tenantId) : null;
        return { matchedCount: 1, modifiedCount: 1 };
      }),
    };
    return { collection, Dossier, links, users };
  }

  function loadScript(state) {
    jest.resetModules();
    jest.doMock('../../audit-dossier-references', () => ({
      connect: jest.fn(),
      readIndexes: jest.fn(async () => state.collection.indexes.map((index) => ({ ...index }))),
      readDossierState: jest.fn(async () => ({
        Dossier: state.Dossier,
        dossiers: state.collection.docs.map((doc) => ({ ...doc })),
        links: state.links,
        users: state.users,
        indexes: state.collection.indexes.map((index) => ({ ...index })),
      })),
    }));
    jest.doMock('../../../models/Folder/Dossier', () => state.Dossier);
    return require('../../migrate-dossier-references');
  }

  const target = { kind: 'dev', dbName: 'kheops2_dev', fingerprint: 'abc' };
  const baseDossiers = () => [
    { _id: D.d1, reference: '202601', tenantId: T.a },
    { _id: D.d2, reference: 'DCM-AAAAAA', tenantId: null },
    { _id: D.d3, reference: '202603', tenantId: null },
  ];
  const baseLinks = [{ user: U.u1, dossier: D.d2 }];
  const baseUsers = [{ _id: U.u1, tenantId: T.a }];
  const legacyIndexes = [{ name: '_id_', key: { _id: 1 } }, { name: 'reference_1', key: { reference: 1 } }];
  const tenantOf = (state, id) => state.collection.docs.find((doc) => doc._id === id).tenantId;
  const readJournal = (runId) => JSON.parse(fs.readFileSync(path.join(journalsDir, `${runId}.json`), 'utf8'));

  test('dry-run : aucune ecriture, aucun journal, aucun index ; previsualisation des etapes 3 et 4', async () => {
    const state = fakeState({ dossiers: baseDossiers(), links: baseLinks, users: baseUsers, indexes: legacyIndexes });
    await loadScript(state).migrate({ args: { apply: false }, target, runId: 'run-dry' });
    expect(state.Dossier.updateOne).not.toHaveBeenCalled();
    expect(state.Dossier.collection.createIndex).not.toHaveBeenCalled();
    expect(state.Dossier.collection.dropIndex).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(journalsDir, 'run-dry.json'))).toBe(false);
    expect(process.exitCode).toBeUndefined();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('index unique tenantId_1_reference_1 serait cree'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('ancien index reference_1 { reference: 1 } serait supprime'));
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining('sans etre unique'));
  });

  test('dry-run avec un index { tenantId, reference } NON unique : avertissement explicite (blocage a venir de --apply), aucune ecriture ni journal', async () => {
    const state = fakeState({
      dossiers: baseDossiers(), links: baseLinks, users: baseUsers,
      indexes: [...legacyIndexes, { name: 'custom', key: { tenantId: 1, reference: 1 } }],
    });
    await loadScript(state).migrate({ args: { apply: false }, target, runId: 'run-dry-custom' });
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/Etape 3 : un index custom .*sans etre unique.*avant --apply/));
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('serait cree'));
    expect(state.Dossier.updateOne).not.toHaveBeenCalled();
    expect(state.Dossier.collection.createIndex).not.toHaveBeenCalled();
    expect(state.Dossier.collection.dropIndex).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(journalsDir, 'run-dry-custom.json'))).toBe(false);
    expect(process.exitCode).toBeUndefined();
  });

  test('apply : rattache, journalise l ancienne valeur, cree l index compose, supprime reference_1 ; relance idempotente ; retours arriere bornes a chaque run', async () => {
    const state = fakeState({ dossiers: baseDossiers(), links: baseLinks, users: baseUsers, indexes: legacyIndexes });
    await loadScript(state).migrate({ args: { apply: true }, target, runId: 'run-1' });

    expect(tenantOf(state, D.d2)).toBe(T.a);
    expect(tenantOf(state, D.d3)).toBeNull(); // sans lien : laisse et signale
    expect(state.Dossier.updateOne).toHaveBeenCalledWith({ _id: expect.anything(), tenantId: null }, { $set: { tenantId: expect.anything() } });
    expect(state.Dossier.collection.createIndex).toHaveBeenCalledWith({ tenantId: 1, reference: 1 }, { unique: true, name: 'tenantId_1_reference_1' });
    expect(state.Dossier.collection.dropIndex).toHaveBeenCalledWith('reference_1');
    expect(state.collection.indexes.map((index) => index.name)).toEqual(['_id_', 'tenantId_1_reference_1']);
    expect(readJournal('run-1')).toMatchObject({
      runId: 'run-1',
      status: 'applied',
      target,
      entries: [{ dossierId: D.d2, reference: 'DCM-AAAAAA', field: 'tenantId', from: null, to: T.a, userId: U.u1, applied: true }],
      index: { name: 'tenantId_1_reference_1', created: true },
      legacyIndex: { name: 'reference_1', key: { reference: 1 }, unique: false, dropped: true },
    });
    expect(process.exitCode).toBeUndefined();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('cree explicitement (createIndex)'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('ancien index reference_1 { reference: 1 } supprime'));

    // Relance avec un autre run-id : rien a rattacher, index compose deja en
    // place, ancien index deja absent (journal : created=false, dropped=false).
    await loadScript(state).migrate({ args: { apply: true }, target, runId: 'run-2' });
    expect(state.Dossier.updateOne).toHaveBeenCalledTimes(1);
    expect(state.Dossier.collection.createIndex).toHaveBeenCalledTimes(1);
    expect(state.Dossier.collection.dropIndex).toHaveBeenCalledTimes(1);
    expect(readJournal('run-2')).toMatchObject({ status: 'applied', entries: [], index: { created: false }, legacyIndex: { dropped: false } });

    // Un run-id deja journalise est refuse.
    await expect(loadScript(state).migrate({ args: { apply: true }, target, runId: 'run-1' })).rejects.toThrow(/run-id deja utilise/);

    // Retour arriere de run-2 (qui n'a rien cree ni supprime) : ne touche ni
    // aux index (crees par run-1) ni aux dossiers.
    await loadScript(state).rollback({ args: { apply: true }, target, runId: 'run-2' });
    expect(state.Dossier.collection.dropIndex).toHaveBeenCalledTimes(1);
    expect(state.Dossier.collection.createIndex).toHaveBeenCalledTimes(1);
    expect(tenantOf(state, D.d2)).toBe(T.a);
    expect(state.collection.indexes.map((index) => index.name)).toEqual(['_id_', 'tenantId_1_reference_1']);
    expect(readJournal('run-2').status).toBe('rolled_back');

    // Retour arriere de run-1 : dry-run (rien) puis apply.
    await loadScript(state).rollback({ args: { apply: false }, target, runId: 'run-1' });
    expect(tenantOf(state, D.d2)).toBe(T.a);
    expect(state.collection.indexes.map((index) => index.name)).toEqual(['_id_', 'tenantId_1_reference_1']);
    await loadScript(state).rollback({ args: { apply: true }, target, runId: 'run-1' });
    expect(tenantOf(state, D.d2)).toBeNull();
    expect(tenantOf(state, D.d1)).toBe(T.a);
    expect(state.Dossier.collection.dropIndex).toHaveBeenLastCalledWith('tenantId_1_reference_1');
    expect(state.Dossier.collection.createIndex).toHaveBeenLastCalledWith({ reference: 1 }, { name: 'reference_1', unique: false });
    expect(state.collection.indexes.map((index) => index.name)).toEqual(['_id_', 'reference_1']);
    expect(readJournal('run-1').status).toBe('rolled_back');
    const rollbackReports = fs.readdirSync(journalsDir).filter((name) => /^run-1\.rollback-.*\.json$/.test(name));
    expect(rollbackReports).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(journalsDir, rollbackReports[0]), 'utf8')))
      .toMatchObject({ runId: 'run-1', indexDropped: true, legacyIndexRecreated: true });

    // Second retour arriere de run-1 : plus rien a restaurer, index compose
    // deja absent, ancien index deja present.
    await loadScript(state).rollback({ args: { apply: true }, target, runId: 'run-1' });
    expect(state.Dossier.collection.dropIndex).toHaveBeenCalledTimes(2);
    expect(state.Dossier.collection.createIndex).toHaveBeenCalledTimes(2);
    expect(tenantOf(state, D.d2)).toBeNull();
  });

  test('doublon apparu entre la planification et la relecture : abandon (code 2) APRES ecriture, journal aborted_duplicates, rattachements annulables par --rollback', async () => {
    const state = fakeState({ dossiers: baseDossiers(), links: baseLinks, users: baseUsers, indexes: legacyIndexes });
    const original = state.Dossier.updateOne;
    // Creation concurrente d'un dossier portant deja la reference rattachee, dans le cabinet cible.
    state.Dossier.updateOne = jest.fn(async (...args) => {
      const result = await original(...args);
      state.collection.docs.push({ _id: D.d9, reference: 'DCM-AAAAAA', tenantId: T.a });
      return result;
    });
    await loadScript(state).migrate({ args: { apply: true }, target, runId: 'run-race' });
    expect(process.exitCode).toBe(2);
    expect(tenantOf(state, D.d2)).toBe(T.a);
    expect(state.Dossier.collection.createIndex).not.toHaveBeenCalled();
    expect(state.Dossier.collection.dropIndex).not.toHaveBeenCalled();
    expect(readJournal('run-race')).toMatchObject({
      status: 'aborted_duplicates',
      entries: [{ dossierId: D.d2, applied: true }],
      index: { created: false },
      legacyIndex: { dropped: false },
    });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('ABANDON'));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('--rollback=run-race --apply'));

    process.exitCode = undefined;
    state.Dossier.updateOne = original;
    await loadScript(state).rollback({ args: { apply: true }, target, runId: 'run-race' });
    expect(tenantOf(state, D.d2)).toBeNull();
    expect(state.Dossier.collection.dropIndex).not.toHaveBeenCalled();
    expect(state.Dossier.collection.createIndex).not.toHaveBeenCalled();
    expect(readJournal('run-race').status).toBe('rolled_back');
  });

  test('rattachement deja fait par l application entre-temps (modifiedCount 0) : entree applied=false, ignoree par le retour arriere (skip_not_applied)', async () => {
    const state = fakeState({ dossiers: baseDossiers(), links: baseLinks, users: baseUsers, indexes: legacyIndexes });
    const original = state.Dossier.updateOne;
    state.Dossier.updateOne = jest.fn(async (filter, update) => {
      // Rattachement paresseux de l'application vers le meme cabinet, juste
      // avant l'ecriture de la migration (filtre tenantId: null sans effet).
      const doc = state.collection.docs.find((item) => String(item._id) === String(filter._id));
      doc.tenantId = T.a;
      return original(filter, update);
    });
    await loadScript(state).migrate({ args: { apply: true }, target, runId: 'run-lazy' });
    expect(process.exitCode).toBeUndefined();
    expect(readJournal('run-lazy')).toMatchObject({
      status: 'applied',
      entries: [{ dossierId: D.d2, applied: false }],
      index: { created: true },
      legacyIndex: { dropped: true },
    });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('non modifie'));
    expect(original).toHaveBeenCalledTimes(1);

    state.Dossier.updateOne = original;
    await loadScript(state).rollback({ args: { apply: true }, target, runId: 'run-lazy' });
    // Le dossier n'a pas ete ecrit par le run : il conserve son cabinet, sans updateOne.
    expect(tenantOf(state, D.d2)).toBe(T.a);
    expect(original).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('skip_not_applied'));
    // Les index, eux, ont bien ete crees/supprimes par le run : ils sont defaits.
    expect(state.Dossier.collection.dropIndex).toHaveBeenLastCalledWith('tenantId_1_reference_1');
    expect(state.collection.indexes.map((index) => index.name)).toEqual(['_id_', 'reference_1']);
    expect(readJournal('run-lazy').status).toBe('rolled_back');
  });

  test('doublon par cabinet apres rattachement : abandon (code 2), rien n est ecrit', async () => {
    const dossiers = [
      { _id: D.d1, reference: '202601', tenantId: T.a },
      { _id: D.d2, reference: '202601', tenantId: null },
    ];
    const state = fakeState({ dossiers, links: [{ user: U.u1, dossier: D.d2 }], users: baseUsers, indexes: legacyIndexes });
    await loadScript(state).migrate({ args: { apply: true }, target, runId: 'run-dup' });
    expect(process.exitCode).toBe(2);
    expect(state.Dossier.updateOne).not.toHaveBeenCalled();
    expect(state.Dossier.collection.createIndex).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(journalsDir, 'run-dup.json'))).toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('ABANDON'));
  });

  test('index compose deja present mais non unique : erreur explicite, journal en index_failed', async () => {
    const state = fakeState({
      dossiers: baseDossiers(), links: baseLinks, users: baseUsers,
      indexes: [...legacyIndexes, { name: 'custom', key: { tenantId: 1, reference: 1 } }],
    });
    await expect(loadScript(state).migrate({ args: { apply: true }, target, runId: 'run-idx' })).rejects.toThrow(/sans etre unique/);
    expect(state.Dossier.collection.createIndex).not.toHaveBeenCalled();
    expect(state.Dossier.collection.dropIndex).not.toHaveBeenCalled(); // reference_1 conserve : l'etape 3 a echoue avant
    expect(readJournal('run-idx')).toMatchObject({ status: 'index_failed', index: { created: false }, legacyIndex: { dropped: false } });
  });
});

describe('connexion des scripts (audit-dossier-references connect) : aucun index ni collection cree, garde-fous du repli', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  let calls;
  let spies;
  const savedEnv = {};

  function fakeMongoose() {
    return {
      set: jest.fn((key, value) => { calls.push(['set', key, value]); }),
      connect: jest.fn(async (uri, options) => { calls.push(['connect', uri, options]); }),
      disconnect: jest.fn(async () => {}),
    };
  }

  // dbTarget null : simule l'absence de scripts/lib/dbTarget.js (MODULE_NOT_FOUND).
  // Le script d'audit est charge en VRAI (requireActual : le doMock du bloc
  // d'orchestration ci-dessus survit a resetModules), ses dependances
  // mongoose et dbTarget etant remplacees.
  function loadAudit({ dbTarget, mongoose }) {
    jest.resetModules();
    jest.doMock('mongoose', () => mongoose);
    jest.doMock('../dbTarget', () => {
      if (dbTarget) return dbTarget;
      const error = new Error("Cannot find module './lib/dbTarget'");
      error.code = 'MODULE_NOT_FOUND';
      throw error;
    });
    return jest.requireActual('../../audit-dossier-references');
  }

  beforeEach(() => {
    calls = [];
    spies = ['log', 'warn'].map((name) => jest.spyOn(console, name).mockImplementation(() => {}));
    for (const key of ['KHEOPS_DB_OVERRIDE', 'KHEOPS_DB_OVERRIDE_REASON']) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    spies.forEach((spy) => spy.mockRestore());
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.dontMock('mongoose');
    jest.dontMock('../dbTarget');
  });

  test('avec scripts/lib/dbTarget : argv canonique, instance mongoose et { autoIndex: false, autoCreate: false } transmis, autoIndex/autoCreate desactives AVANT la connexion', async () => {
    const mongoose = fakeMongoose();
    const connectForScript = jest.fn(async (options) => {
      calls.push(['connectForScript', options]);
      return { target: { kind: 'dev', dbName: 'kheops2_dev', fingerprint: 'abc' }, mongoose: options.mongooseInstance };
    });
    const audit = loadAudit({ dbTarget: { connectForScript }, mongoose });

    const result = await audit.connect({ target: 'dev', confirmPreprod: false, apply: true, out: 'x.json' }, 'audit-test');
    expect(connectForScript).toHaveBeenCalledTimes(1);
    expect(connectForScript).toHaveBeenCalledWith({
      argv: ['--target=dev'],
      env: process.env,
      purpose: 'audit-test',
      mongooseInstance: mongoose,
      connectOptions: { autoIndex: false, autoCreate: false },
    });
    expect(calls.map((call) => call[0])).toEqual(['set', 'set', 'connectForScript']);
    expect(mongoose.set).toHaveBeenCalledWith('autoIndex', false);
    expect(mongoose.set).toHaveBeenCalledWith('autoCreate', false);
    expect(mongoose.connect).not.toHaveBeenCalled(); // connexion deleguee a dbTarget
    expect(result).toEqual({ target: { kind: 'dev', dbName: 'kheops2_dev', fingerprint: 'abc' }, mongoose });
    expect(audit.SCRIPT_CONNECT_OPTIONS).toEqual({ autoIndex: false, autoCreate: false });

    await audit.connect({ target: 'preprod', confirmPreprod: true });
    expect(connectForScript).toHaveBeenLastCalledWith(expect.objectContaining({
      argv: ['--target=preprod', '--confirm-preprod'],
      purpose: 'audit-dossier-references',
      connectOptions: { autoIndex: false, autoCreate: false },
    }));
  });

  describe('repli sans dbTarget (fichiers d environnement temporaires, jamais les fichiers reels)', () => {
    const DEV_URI = 'mongodb://127.0.0.1:27017/kheops2_dev';
    const DEPLOY_URI = 'mongodb+srv://u:p@cluster.example.net/kheops2?retryWrites=true';
    let serverDir;
    let mongoose;
    let audit;

    const write = (name, uri) => fs.writeFileSync(path.join(serverDir, name), `MONGODB_URI=${uri}\n`, 'utf8');
    const connect = (args) => audit.connect(args, 'audit-test', { serverDir });

    beforeEach(() => {
      serverDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kheops-audit-env-'));
      mongoose = fakeMongoose();
      audit = loadAudit({ dbTarget: null, mongoose });
      write('.env', DEPLOY_URI);
    });

    afterEach(() => {
      fs.rmSync(serverDir, { recursive: true, force: true });
    });

    test('.env.development absent : erreur explicite, aucune connexion', async () => {
      await expect(connect({ target: 'dev', confirmPreprod: false })).rejects.toThrow(/absent : server\/\.env\.development/);
      expect(mongoose.connect).not.toHaveBeenCalled();
    });

    test('MONGODB_URI identique a server/.env (base de deploiement) : refus', async () => {
      write('.env.development', DEPLOY_URI);
      await expect(connect({ target: 'dev', confirmPreprod: false })).rejects.toThrow(/preproduction.*identique a server\/\.env/);
      expect(mongoose.connect).not.toHaveBeenCalled();
    });

    test('base dont le nom ne contient pas "dev" : refus', async () => {
      write('.env.development', 'mongodb://127.0.0.1:27017/kheops2');
      await expect(connect({ target: 'dev', confirmPreprod: false })).rejects.toThrow(/contenir "dev"/);
      expect(mongoose.connect).not.toHaveBeenCalled();
    });

    test('preprod sans --confirm-preprod, puis sans derogation KHEOPS_DB_OVERRIDE : refus', async () => {
      await expect(connect({ target: 'preprod', confirmPreprod: false })).rejects.toThrow(/--confirm-preprod/);
      await expect(connect({ target: 'preprod', confirmPreprod: true })).rejects.toThrow(/KHEOPS_DB_OVERRIDE/);
      expect(mongoose.connect).not.toHaveBeenCalled();
    });

    test('cible dev valide : autoIndex/autoCreate desactives avant la connexion, connexion avec { autoIndex: false, autoCreate: false }, journal [DB] sans URI', async () => {
      write('.env.development', DEV_URI);
      const result = await connect({ target: 'dev', confirmPreprod: false });
      expect(calls.map((call) => call[0])).toEqual(['set', 'set', 'connect']);
      expect(mongoose.set).toHaveBeenCalledWith('autoIndex', false);
      expect(mongoose.set).toHaveBeenCalledWith('autoCreate', false);
      expect(mongoose.connect).toHaveBeenCalledWith(DEV_URI, { autoIndex: false, autoCreate: false });
      expect(result.mongoose).toBe(mongoose);
      expect(result.target).toMatchObject({ kind: 'dev', dbName: 'kheops2_dev', override: null });
      const dbLine = console.log.mock.calls.map((call) => String(call[0])).find((line) => line.startsWith('[DB] script=audit-test'));
      expect(dbLine).toMatch(/cible=dev base=kheops2_dev empreinte=[0-9a-f]{12}/);
      expect(dbLine).not.toContain('127.0.0.1');
    });
  });
});
