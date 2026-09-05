'use strict';

// Logique pure du nettoyage des donnees de recette ZZTEST
// (scripts/lib/zztestCleanup.js). Aucune base : les jeux de donnees sont des
// instantanes en memoire de la forme { <collection>: [lignes] }, avec des
// identifiants en chaines. Le script scripts/cleanup-zztest-data.js ne fait
// qu'alimenter ces fonctions depuis MongoDB ; ses parties d'orchestration
// (connexion, cycle complet) sont exercees ici avec mongoose et lib/dbTarget
// remplaces par des doublures : aucune connexion reelle.

jest.mock('mongoose', () => ({
  set: jest.fn(),
  connect: jest.fn(async () => {}),
  disconnect: jest.fn(async () => {}),
}));
jest.mock('../dbTarget', () => ({
  resolveScriptTarget: jest.fn(),
  connectForScript: jest.fn(),
}));

const {
  DEFAULT_PREFIX,
  COLLECTIONS,
  matchesPrefix,
  validateAccounts,
  buildSelection,
  planCleanup,
  applyPlanInMemory,
  deletedIdsFromPlan,
  detectOrphans,
  compareSnapshots,
  summarizeSnapshot,
} = require('../zztestCleanup');

// Identifiants lisibles : u = user, t = tenant, d = dossier, c = contact,
// p = partie, r = role, e = evenement, ext = hors selection.
const U = { a: 'user-a', ext: 'user-ext' };
const T = { a: 'tenant-a', ext: 'tenant-ext' };

const ACCOUNT_A = { email: 'zztest.recette.abc@example.com', userId: U.a, tenantIds: [T.a] };
const SELECTION = buildSelection([ACCOUNT_A]);

/** Instantane vide : toutes les collections du registre, sans ligne. */
function emptySnapshot() {
  const snapshot = {};
  for (const entry of COLLECTIONS) snapshot[entry.key] = [];
  return snapshot;
}

/** Instantane de base : un compte, un dossier complet, deux contacts ZZTEST. */
function baseSnapshot() {
  const s = emptySnapshot();
  s.dossiers.push({
    _id: 'd1',
    tenantId: T.a,
    reference: '202601',
    dossier: { dossier: { nom: 'ZZTEST Dossier 1' }, documents: [{ _id: 'doc1' }] },
  });
  s.userDossiers.push({ _id: 'ud1', user: U.a, dossier: 'd1' });
  s.contacts.push(
    { _id: 'c1', nom: 'ZZTEST', prenoms: 'Alice', email: 'zztest.alice@example.com' },
    { _id: 'c2', nom: 'ZZTEST', prenoms: 'Bob', email: 'zztest.bob@example.com' },
  );
  s.userContacts.push(
    { _id: 'uc1', user: U.a, contact: 'c1' },
    { _id: 'uc2', user: U.a, contact: 'c2' },
  );
  s.dossierContacts.push({ _id: 'dc1', dossier: 'd1', contact: 'c1' });
  s.parties.push({ _id: 'p1', type: 'pour', contact: 'c1' });
  s.dossierParties.push({ _id: 'dp1', dossier: 'd1', partie: 'p1' });
  s.contactParties.push({ _id: 'cp1', contact: 'c2', partie: 'p1' });
  s.roles.push({ _id: 'r1', type: 'avocat' });
  s.contactRoles.push({ _id: 'cr1', contact: 'c2', partie: 'p1', role: 'r1' });
  s.agendaEvents.push({ _id: 'e1', dossier: 'd1', createdBy: U.a, title: 'Audience' });
  s.dossierEventLinks.push({ _id: 'del1', dossier: 'd1', agendaEvent: 'e1', linkedBy: U.a });
  s.carpaOperations.push({ _id: 'op1', dossierId: 'd1', ownerUserId: U.a, beneficiaireContactId: 'c1' });
  s.carpaAuditLogs.push({ _id: 'log1', operationId: 'op1', dossierId: 'd1', ownerUserId: U.a });
  s.divorceCMData.push({ _id: 'dv1', dossierId: 'd1', ownerUserId: U.a, epoux1: { contactId: 'c1' } });
  s.storedDocuments.push({ _id: 'sd1', dossierId: 'd1', ownerUserId: U.a, tenantId: T.a, versions: [] });
  s.documentEditorStates.push({ _id: 'des1', tenantId: T.a, documentId: 'doc1' });
  return s;
}

/** Ajoute un second dossier d2 (avec sa liaison) qui doit toujours etre supprime. */
function withSecondDossier(s) {
  s.dossiers.push({ _id: 'd2', tenantId: T.a, reference: '202602', dossier: { dossier: { nom: 'ZZTEST Dossier 2' }, documents: [] } });
  s.userDossiers.push({ _id: 'ud2', user: U.a, dossier: 'd2' });
  s.agendaEvents.push({ _id: 'e2', dossier: 'd2', createdBy: U.a, title: 'Rendez-vous' });
  s.dossierEventLinks.push({ _id: 'del2', dossier: 'd2', agendaEvent: 'e2', linkedBy: U.a });
  return s;
}

const stepFor = (plan, key) => plan.steps.find((step) => step.key === key);
const stepIds = (plan, key) => (stepFor(plan, key) ? stepFor(plan, key).ids : []);
const keepReasons = (list, id) => (list.find((item) => item.id === id) || { reasons: [] }).reasons.join(' | ');
const position = (plan, key) => plan.steps.findIndex((step) => step.key === key);

describe('matchesPrefix', () => {
  test('reconnait le prefixe en tete de valeur ou apres un separateur', () => {
    expect(matchesPrefix('ZZTEST Dupont', DEFAULT_PREFIX)).toBe(true);
    expect(matchesPrefix('zztest.alice@example.com', DEFAULT_PREFIX)).toBe(true);
    expect(matchesPrefix('contact-zztest@example.com', DEFAULT_PREFIX)).toBe(true);
    expect(matchesPrefix('  zztest', DEFAULT_PREFIX)).toBe(true);
  });
  test('ignore une valeur vide ou un prefixe noye dans un mot', () => {
    expect(matchesPrefix('', DEFAULT_PREFIX)).toBe(false);
    expect(matchesPrefix(null, DEFAULT_PREFIX)).toBe(false);
    expect(matchesPrefix('Dezztestin', DEFAULT_PREFIX)).toBe(false);
    expect(matchesPrefix('Dupont', DEFAULT_PREFIX)).toBe(false);
  });
  test('accepte un prefixe personnalise', () => {
    expect(matchesPrefix('TEST50-01', 'TEST50')).toBe(true);
    expect(matchesPrefix('ZZTEST Dupont', 'TEST50')).toBe(false);
  });
});

describe('validateAccounts', () => {
  const users = [
    { _id: U.a, email: 'zztest.recette.abc@example.com', tenantId: T.a },
    { _id: 'user-v', email: 'verif.compte.local.20260904@example.com', tenantId: null },
    { _id: 'user-real', email: 'avocat.reel@example.com', tenantId: 'tenant-real' },
  ];
  const tenants = [
    { _id: T.a, ownerUserId: U.a },
    { _id: 'tenant-v', ownerUserId: 'user-v' },
    { _id: 'tenant-real', ownerUserId: 'user-real' },
  ];

  test('accepte les comptes du motif et resout le cabinet par user.tenantId ou Tenant.ownerUserId', () => {
    const result = validateAccounts({
      requestedEmails: ['ZZTEST.recette.abc@example.com', 'verif.compte.local.20260904@example.com'],
      users,
      tenants,
    });
    expect(result.rejected).toEqual([]);
    expect(result.accounts).toEqual([
      { email: 'zztest.recette.abc@example.com', userId: U.a, tenantIds: [T.a] },
      { email: 'verif.compte.local.20260904@example.com', userId: 'user-v', tenantIds: ['tenant-v'] },
    ]);
  });

  test('refuse un compte hors motif, meme s il existe (compte non autorise)', () => {
    const result = validateAccounts({ requestedEmails: ['avocat.reel@example.com'], users, tenants });
    expect(result.accounts).toEqual([]);
    expect(result.rejected).toEqual([
      { email: 'avocat.reel@example.com', reason: 'email hors motif autorise (utiliser --allow-account-pattern pour forcer)' },
    ]);
  });

  test('--allow-account-pattern leve le refus de motif', () => {
    const result = validateAccounts({
      requestedEmails: ['avocat.reel@example.com'],
      users,
      tenants,
      allowAccountPattern: true,
    });
    expect(result.rejected).toEqual([]);
    expect(result.accounts[0].tenantIds).toEqual(['tenant-real']);
  });

  test('refuse un compte introuvable et signale les doublons', () => {
    const result = validateAccounts({
      requestedEmails: ['zztest.inconnu@example.com', 'zztest.recette.abc@example.com', 'zztest.recette.abc@example.com'],
      users,
      tenants,
    });
    expect(result.accounts).toHaveLength(1);
    expect(result.rejected).toEqual([{ email: 'zztest.inconnu@example.com', reason: 'compte introuvable' }]);
  });

  test('sans aucun compte demande, rien n est selectionne', () => {
    const result = validateAccounts({ requestedEmails: [], users, tenants });
    expect(result.accounts).toEqual([]);
    expect(result.rejected).toEqual([]);
  });
});

describe('planCleanup : cas nominal', () => {
  const plan = planCleanup({ selection: SELECTION, snapshot: baseSnapshot() });

  test('le dossier et ses dependances sont planifies, les contacts ZZTEST aussi', () => {
    expect(plan.dossiers.delete.map((d) => d.id)).toEqual(['d1']);
    expect(plan.dossiers.keep).toEqual([]);
    expect(plan.contacts.delete.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    expect(plan.contacts.keep).toEqual([]);
    expect(stepIds(plan, 'userDossiers')).toEqual(['ud1']);
    expect(stepIds(plan, 'dossierContacts')).toEqual(['dc1']);
    expect(stepIds(plan, 'dossierParties')).toEqual(['dp1']);
    expect(stepIds(plan, 'contactParties')).toEqual(['cp1']);
    expect(stepIds(plan, 'contactRoles')).toEqual(['cr1']);
    expect(stepIds(plan, 'parties')).toEqual(['p1']);
    expect(stepIds(plan, 'roles')).toEqual(['r1']);
    expect(stepIds(plan, 'dossierEventLinks')).toEqual(['del1']);
    expect(stepIds(plan, 'agendaEvents')).toEqual(['e1']);
    expect(stepIds(plan, 'carpaAuditLogs')).toEqual(['log1']);
    expect(stepIds(plan, 'carpaOperations')).toEqual(['op1']);
    expect(stepIds(plan, 'divorceCMData')).toEqual(['dv1']);
    expect(stepIds(plan, 'storedDocuments')).toEqual(['sd1']);
    expect(stepIds(plan, 'documentEditorStates')).toEqual(['des1']);
    expect(stepIds(plan, 'userContacts').sort()).toEqual(['uc1', 'uc2']);
    expect(stepIds(plan, 'contacts').sort()).toEqual(['c1', 'c2']);
    expect(stepIds(plan, 'dossiers')).toEqual(['d1']);
  });

  test('le plan est ordonne : liaisons, puis dependances, puis entites, puis contacts, puis dossiers', () => {
    const orders = plan.steps.map((step) => step.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    expect(position(plan, 'userDossiers')).toBeLessThan(position(plan, 'dossiers'));
    expect(position(plan, 'dossierParties')).toBeLessThan(position(plan, 'parties'));
    expect(position(plan, 'contactRoles')).toBeLessThan(position(plan, 'roles'));
    expect(position(plan, 'dossierEventLinks')).toBeLessThan(position(plan, 'agendaEvents'));
    expect(position(plan, 'carpaAuditLogs')).toBeLessThan(position(plan, 'carpaOperations'));
    expect(position(plan, 'userContacts')).toBeLessThan(position(plan, 'contacts'));
    expect(position(plan, 'contacts')).toBeLessThan(position(plan, 'dossiers'));
  });

  test('chaque etape porte des identifiants explicites (jamais de suppression sans filtre)', () => {
    expect(plan.steps.length).toBeGreaterThan(0);
    for (const step of plan.steps) {
      expect(Array.isArray(step.ids)).toBe(true);
      expect(step.ids.length).toBeGreaterThan(0);
      expect(typeof step.model).toBe('string');
      expect(typeof step.modelPath).toBe('string');
    }
    expect(plan.summary.totalRows).toBe(plan.steps.reduce((sum, step) => sum + step.ids.length, 0));
  });

  test('les users, tenants, memberships et officeUsers ne font jamais partie du plan', () => {
    const keys = plan.steps.map((step) => step.key);
    expect(keys).not.toContain('users');
    expect(keys).not.toContain('tenants');
    expect(keys).not.toContain('memberships');
    expect(keys).not.toContain('officeUsers');
    expect(COLLECTIONS.map((entry) => entry.model)).not.toContain('User');
    expect(COLLECTIONS.map((entry) => entry.model)).not.toContain('Tenant');
  });

  test('le registre couvre le budget et le grand livre d usage IA', () => {
    const models = COLLECTIONS.map((entry) => entry.model);
    expect(models).toContain('AIBudgetReservation');
    expect(models).toContain('AIUsageLedgerEntry');
    for (const entry of COLLECTIONS) expect(typeof entry.modelPath).toBe('string');
  });
});

describe('planCleanup : dependances externes', () => {
  test('contact partage avec un utilisateur hors selection : conserve, ses liaisons aussi', () => {
    const s = baseSnapshot();
    s.userContacts.push({ _id: 'uc-ext', user: U.ext, contact: 'c2' });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.contacts.delete.map((c) => c.id)).toEqual(['c1']);
    expect(plan.contacts.keep.map((c) => c.id)).toEqual(['c2']);
    expect(keepReasons(plan.contacts.keep, 'c2')).toMatch(/conserve : dependance externe/);
    expect(keepReasons(plan.contacts.keep, 'c2')).toMatch(/utilisateur hors selection/);
    expect(stepIds(plan, 'userContacts')).toEqual(['uc1']);
    expect(stepIds(plan, 'contacts')).toEqual(['c1']);
  });

  test('dossier co-detenu par un utilisateur hors selection : conserve avec tout son contenu', () => {
    const s = baseSnapshot();
    s.userDossiers.push({ _id: 'ud-ext', user: U.ext, dossier: 'd1' });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.dossiers.delete).toEqual([]);
    expect(plan.dossiers.keep.map((d) => d.id)).toEqual(['d1']);
    expect(keepReasons(plan.dossiers.keep, 'd1')).toMatch(/conserve : dependance externe/);
    expect(keepReasons(plan.dossiers.keep, 'd1')).toMatch(/UserDossier/);
    for (const key of ['userDossiers', 'dossierContacts', 'dossierParties', 'parties', 'contactParties',
      'contactRoles', 'roles', 'agendaEvents', 'dossierEventLinks', 'carpaOperations', 'carpaAuditLogs',
      'divorceCMData', 'storedDocuments', 'documentEditorStates', 'dossiers']) {
      expect(stepFor(plan, key)).toBeUndefined();
    }
    // Les contacts references par ce dossier conserve sont conserves a leur tour.
    expect(plan.contacts.delete).toEqual([]);
    expect(keepReasons(plan.contacts.keep, 'c1')).toMatch(/DossierContact/);
    expect(keepReasons(plan.contacts.keep, 'c2')).toMatch(/ContactPartie|ContactRole/);
  });

  test('dossier d un autre cabinet atteint par UserDossier : conserve (cabinet hors selection)', () => {
    const s = baseSnapshot();
    s.dossiers.push({ _id: 'd-ext', tenantId: T.ext, reference: '202602', dossier: { dossier: { nom: 'ZZTEST autre cabinet' } } });
    s.userDossiers.push({ _id: 'ud2', user: U.a, dossier: 'd-ext' });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.dossiers.delete.map((d) => d.id)).toEqual(['d1']);
    expect(keepReasons(plan.dossiers.keep, 'd-ext')).toMatch(/cabinet hors selection/);
    expect(stepIds(plan, 'userDossiers')).toEqual(['ud1']);
  });

  test('dossier sans tenantId mais detenu par le compte : supprime', () => {
    const s = baseSnapshot();
    s.dossiers[0].tenantId = null;
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.dossiers.delete.map((d) => d.id)).toEqual(['d1']);
  });

  test('dossier du cabinet sans UserDossier : supprime (selection par tenant)', () => {
    const s = baseSnapshot();
    s.userDossiers = [];
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.dossiers.delete.map((d) => d.id)).toEqual(['d1']);
  });

  test('partie partagee avec un dossier conserve : la partie et ses contacts restent, seule notre liaison part', () => {
    const s = baseSnapshot();
    s.dossierParties.push({ _id: 'dp-ext', dossier: 'd-ext', partie: 'p1' });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.dossiers.delete.map((d) => d.id)).toEqual(['d1']);
    expect(stepIds(plan, 'dossierParties')).toEqual(['dp1']);
    expect(stepFor(plan, 'parties')).toBeUndefined();
    expect(stepFor(plan, 'contactParties')).toBeUndefined();
    expect(stepFor(plan, 'contactRoles')).toBeUndefined();
    expect(stepFor(plan, 'roles')).toBeUndefined();
    expect(keepReasons(plan.entities.parties.keep, 'p1')).toMatch(/DossierPartie/);
    // c1 est le contact de la partie conservee, c2 y est lie : tous deux conserves.
    expect(plan.contacts.delete).toEqual([]);
    expect(keepReasons(plan.contacts.keep, 'c1')).toMatch(/Partie/);
    expect(keepReasons(plan.contacts.keep, 'c2')).toMatch(/ContactPartie|ContactRole/);
  });

  test('role referentiel global : conserve tant qu une autre liaison l utilise', () => {
    const s = baseSnapshot();
    s.contactRoles.push({ _id: 'cr-ext', contact: 'c-ext', partie: 'p-ext', role: 'r1' });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(stepIds(plan, 'contactRoles')).toEqual(['cr1']);
    expect(stepFor(plan, 'roles')).toBeUndefined();
    expect(keepReasons(plan.entities.roles.keep, 'r1')).toMatch(/ContactRole/);
  });

  test('evenement d agenda partage avec un dossier hors selection : conserve, et le dossier qu il reference aussi', () => {
    const s = withSecondDossier(baseSnapshot());
    s.dossierEventLinks.push({ _id: 'del-ext', dossier: 'd-ext', agendaEvent: 'e1', linkedBy: U.ext });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    // e1.dossier = d1 : tant que e1 survit, d1 n'est pas supprime (la dependance est signalee).
    expect(plan.dossiers.delete.map((d) => d.id)).toEqual(['d2']);
    expect(plan.dossiers.keep.map((d) => d.id)).toEqual(['d1']);
    expect(keepReasons(plan.dossiers.keep, 'd1')).toMatch(/reference par AgendaEvent e1 conserve/);
    expect(keepReasons(plan.dossiers.keep, 'd1')).toMatch(/DossierEventLink/);
    expect(stepFor(plan, 'agendaEvents')).toEqual(expect.objectContaining({ ids: ['e2'] }));
    expect(stepIds(plan, 'dossierEventLinks')).toEqual(['del2']);
    expect(stepIds(plan, 'dossiers')).toEqual(['d2']);
    const after = applyPlanInMemory(s, plan);
    expect(after.agendaEvents.map((e) => e._id)).toEqual(['e1']);
    expect(detectOrphans({ snapshot: after, selection: SELECTION, deleted: deletedIdsFromPlan(plan) })).toEqual([]);
  });

  test('evenement cree par un utilisateur hors selection : conserve, le dossier aussi (dependance signalee)', () => {
    const s = withSecondDossier(baseSnapshot());
    s.agendaEvents[0].createdBy = U.ext;
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.dossiers.delete.map((d) => d.id)).toEqual(['d2']);
    expect(plan.dossiers.keep.map((d) => d.id)).toEqual(['d1']);
    expect(keepReasons(plan.dossiers.keep, 'd1')).toMatch(/AgendaEvent/);
    expect(keepReasons(plan.dossiers.keep, 'd1')).toMatch(/utilisateur hors selection/);
    expect(stepIds(plan, 'agendaEvents')).toEqual(['e2']);
    expect(stepIds(plan, 'dossierEventLinks')).toEqual(['del2']);
    // Le contenu de d1 (liaisons, parties, contacts) reste intact.
    expect(stepIds(plan, 'userDossiers')).toEqual(['ud2']);
    expect(plan.contacts.delete).toEqual([]);
    const after = applyPlanInMemory(s, plan);
    expect(after.dossiers.map((d) => d._id)).toEqual(['d1']);
    expect(after.agendaEvents.map((e) => e._id)).toEqual(['e1']);
    expect(detectOrphans({ snapshot: after, selection: SELECTION, deleted: deletedIdsFromPlan(plan) })).toEqual([]);
  });

  test('evenement rattache directement a un dossier hors selection : conserve, notre dossier part', () => {
    const s = baseSnapshot();
    s.agendaEvents[0].dossier = 'd-ext';
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.dossiers.delete.map((d) => d.id)).toEqual(['d1']);
    expect(stepIds(plan, 'dossierEventLinks')).toEqual(['del1']);
    expect(stepFor(plan, 'agendaEvents')).toBeUndefined();
    const after = applyPlanInMemory(s, plan);
    expect(detectOrphans({ snapshot: after, selection: SELECTION, deleted: deletedIdsFromPlan(plan) })).toEqual([]);
  });

  test('fiche divorce dont le proprietaire est hors selection : le dossier est conserve', () => {
    const s = baseSnapshot();
    s.divorceCMData[0].ownerUserId = U.ext;
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.dossiers.delete).toEqual([]);
    expect(keepReasons(plan.dossiers.keep, 'd1')).toMatch(/DivorceCMData/);
  });

  test('ligne portant un tenantId egal a l ancien repli (userId) : acceptee', () => {
    const s = baseSnapshot();
    s.storedDocuments[0].tenantId = U.a;
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.dossiers.delete.map((d) => d.id)).toEqual(['d1']);
    expect(stepIds(plan, 'storedDocuments')).toEqual(['sd1']);
  });

  test('ligne d un autre cabinet rattachee au dossier : le dossier est conserve', () => {
    const s = baseSnapshot();
    s.documentEditorStates[0].tenantId = T.ext;
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.dossiers.delete).toEqual([]);
    expect(keepReasons(plan.dossiers.keep, 'd1')).toMatch(/DocumentEditorState/);
  });

  test('reference documentaire vers un dossier hors selection : le dossier source est conserve', () => {
    const s = baseSnapshot();
    s.documentReferences.push({ _id: 'ref1', tenantId: T.a, sourceDossierId: 'd1', targetDossierId: 'd-ext', createdBy: U.a, updatedBy: U.a });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.dossiers.delete).toEqual([]);
    expect(keepReasons(plan.dossiers.keep, 'd1')).toMatch(/DocumentReference/);
  });

  test('deux dossiers candidats lies par une reference : la conservation de l un entraine l autre', () => {
    const s = baseSnapshot();
    s.dossiers.push({ _id: 'd2', tenantId: T.a, reference: '202603', dossier: { dossier: { nom: 'ZZTEST Dossier 2' } } });
    s.userDossiers.push({ _id: 'ud2', user: U.a, dossier: 'd2' }, { _id: 'ud2-ext', user: U.ext, dossier: 'd2' });
    s.documentReferences.push({ _id: 'ref1', tenantId: T.a, sourceDossierId: 'd1', targetDossierId: 'd2', createdBy: U.a, updatedBy: U.a });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.dossiers.delete).toEqual([]);
    expect(keepReasons(plan.dossiers.keep, 'd2')).toMatch(/UserDossier/);
    expect(keepReasons(plan.dossiers.keep, 'd1')).toMatch(/dossier conserve/);
  });

  test('relation d entites d un autre cabinet visant notre contact : contact conserve', () => {
    const s = baseSnapshot();
    s.entityRelations.push({
      _id: 'er-ext',
      tenantId: T.ext,
      subject: { entityType: 'dossier', entityId: 'd-ext' },
      object: { entityType: 'contact', entityId: 'c2' },
      createdBy: U.ext,
    });
    s.entityRelations.push({
      _id: 'er-in',
      tenantId: T.a,
      subject: { entityType: 'matter', entityId: 'd1' },
      object: { entityType: 'contact', entityId: 'c1' },
      createdBy: U.a,
    });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.contacts.delete.map((c) => c.id)).toEqual(['c1']);
    expect(keepReasons(plan.contacts.keep, 'c2')).toMatch(/EntityRelation/);
    expect(stepIds(plan, 'entityRelations')).toEqual(['er-in']);
  });

  test('liaison de role vers un contact hors selection : le contact ZZTEST est conserve', () => {
    const s = baseSnapshot();
    s.contactRoles.push({ _id: 'cr2', contact: 'c2', contactLie: 'c-ext', partie: null, role: 'r1' });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.contacts.delete.map((c) => c.id)).toEqual(['c1']);
    expect(keepReasons(plan.contacts.keep, 'c2')).toMatch(/contact hors selection/);
    expect(stepIds(plan, 'contactRoles')).toEqual(['cr1']);
  });
});

describe('planCleanup : enregistrements IA (budget, grand livre)', () => {
  function aiSnapshot() {
    const s = baseSnapshot();
    s.aiTasks.push({ _id: 'ai1', matterId: 'd1', tenantId: T.a, userId: U.a });
    s.aiTaskEvents.push({ _id: 'aiev1', taskId: 'ai1', tenantId: T.a });
    s.aiBudgetReservations.push({ _id: 'res1', taskId: 'ai1', matterId: 'd1', tenantId: T.a, userId: U.a });
    s.aiUsageLedgerEntries.push({ _id: 'led1', taskId: 'ai1', matterId: 'd1', tenantId: T.a, userId: U.a });
    return s;
  }

  test('reservation et ecriture de grand livre partent avant la tache IA, puis le dossier ; aucun orphelin', () => {
    const s = aiSnapshot();
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(stepIds(plan, 'aiBudgetReservations')).toEqual(['res1']);
    expect(stepIds(plan, 'aiUsageLedgerEntries')).toEqual(['led1']);
    expect(stepIds(plan, 'aiTaskEvents')).toEqual(['aiev1']);
    expect(stepIds(plan, 'aiTasks')).toEqual(['ai1']);
    expect(position(plan, 'aiBudgetReservations')).toBeLessThan(position(plan, 'aiTasks'));
    expect(position(plan, 'aiUsageLedgerEntries')).toBeLessThan(position(plan, 'aiTasks'));
    expect(position(plan, 'aiTasks')).toBeLessThan(position(plan, 'dossiers'));
    expect(deletedIdsFromPlan(plan).aiTask).toEqual(['ai1']);
    const after = applyPlanInMemory(s, plan);
    expect(after.aiBudgetReservations).toEqual([]);
    expect(after.aiUsageLedgerEntries).toEqual([]);
    expect(detectOrphans({ snapshot: after, selection: SELECTION, deleted: deletedIdsFromPlan(plan) })).toEqual([]);
  });

  test('ecriture de grand livre d un utilisateur hors selection : le dossier est conserve', () => {
    const s = aiSnapshot();
    s.aiUsageLedgerEntries[0].userId = U.ext;
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.dossiers.delete).toEqual([]);
    expect(keepReasons(plan.dossiers.keep, 'd1')).toMatch(/AIUsageLedgerEntry/);
    expect(stepFor(plan, 'aiTasks')).toBeUndefined();
    expect(stepFor(plan, 'aiBudgetReservations')).toBeUndefined();
  });

  test('detectOrphans signale une reservation ou une ecriture survivante vers une tache ou un dossier supprime', () => {
    const s = emptySnapshot();
    s.aiBudgetReservations.push({ _id: 'res-orphan', taskId: 'ai-gone', matterId: 'd-gone', tenantId: T.a, userId: U.a });
    s.aiUsageLedgerEntries.push({ _id: 'led-orphan', taskId: 'ai-gone', matterId: 'd1', tenantId: T.a, userId: U.a });
    const orphans = detectOrphans({ snapshot: s, selection: SELECTION, deleted: { aiTask: ['ai-gone'], dossier: ['d-gone'] } });
    expect(orphans.map((o) => `${o.collection}:${o.id}:${o.field}`).sort()).toEqual([
      'aiBudgetReservations:res-orphan:matterId',
      'aiBudgetReservations:res-orphan:taskId',
      'aiUsageLedgerEntries:led-orphan:taskId',
    ]);
  });
});

describe('planCleanup : snapshot embarque des dossiers conserves', () => {
  const contact = (id, prenoms) => ({ _id: id, nom: 'ZZTEST', prenoms, email: '' });

  function embeddedSnapshot({ keepDossier }) {
    const s = emptySnapshot();
    s.dossiers.push({
      _id: 'd1',
      tenantId: T.a,
      reference: '202601',
      dossier: {
        dossier: { nom: 'ZZTEST Dossier parties' },
        documents: [],
        parties: {
          pour: [{
            idPartie: 'c5',
            partieData: { nom: 'ZZTEST', prenoms: 'Partie' },
            avocats: [{ _id: 'c1', nom: 'ZZTEST', prenoms: 'Alice', isAvocat: true }],
            linkedContacts: [{ contactId: 'c7' }],
          }],
          contre: [{
            partieData: { _id: 'c6', nom: 'ZZTEST' },
            linkedAvocats: [{ id: 'pm1', raisonSociale: 'ZZTEST SARL' }],
            contacts: [null, 'texte', { nom: 'sans identifiant' }],
          }],
        },
        contactsDuDossier: [{ _id: 'c8' }],
        avocatsResponsables: [{ id: 'c9' }],
      },
    });
    s.userDossiers.push({ _id: 'ud1', user: U.a, dossier: 'd1' });
    if (keepDossier) s.userDossiers.push({ _id: 'ud-ext', user: U.ext, dossier: 'd1' });
    for (const [id, prenoms] of [['c1', 'Alice'], ['c2', 'Bob'], ['c5', 'Partie'], ['c6', 'Contre'], ['c7', 'Lie'], ['c8', 'Dossier'], ['c9', 'Responsable']]) {
      s.contacts.push(contact(id, prenoms));
      s.userContacts.push({ _id: `uc-${id}`, user: U.a, contact: id });
    }
    s.contactPMs.push({ _id: 'pm1', raisonSociale: 'ZZTEST SARL', emailEntreprise: '' });
    s.userContactPMs.push({ _id: 'upm1', user: U.a, contactPM: 'pm1' });
    return s;
  }

  test('dossier conserve (co-detenu) : tout contact ZZTEST de son snapshot embarque est conserve, sans aucune liaison', () => {
    const s = embeddedSnapshot({ keepDossier: true });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.dossiers.delete).toEqual([]);
    expect(plan.contacts.delete.map((c) => c.id)).toEqual(['c2']);
    expect(plan.contacts.keep.map((c) => c.id).sort()).toEqual(['c1', 'c5', 'c6', 'c7', 'c8', 'c9', 'pm1']);
    for (const id of ['c1', 'c5', 'c6', 'c7', 'c8', 'c9', 'pm1']) {
      expect(keepReasons(plan.contacts.keep, id)).toBe('conserve : reference par le dossier conserve (parties embarquees)');
    }
    expect(stepIds(plan, 'contacts')).toEqual(['c2']);
    expect(stepIds(plan, 'userContacts')).toEqual(['uc-c2']);
    expect(stepFor(plan, 'contactPMs')).toBeUndefined();
  });

  test('dossier supprime : son snapshot embarque ne retient aucun contact', () => {
    const s = embeddedSnapshot({ keepDossier: false });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.dossiers.delete.map((d) => d.id)).toEqual(['d1']);
    expect(plan.contacts.keep).toEqual([]);
    expect(plan.contacts.delete.map((c) => c.id).sort()).toEqual(['c1', 'c2', 'c5', 'c6', 'c7', 'c8', 'c9', 'pm1']);
  });

  test('la projection des dossiers lit les parties, contacts du dossier et avocats responsables', () => {
    const entry = COLLECTIONS.find((e) => e.key === 'dossiers');
    for (const field of ['dossier.parties', 'dossier.contactsDuDossier', 'dossier.avocatsResponsables']) {
      expect(entry.select.split(' ')).toContain(field);
    }
    expect(entry.embeddedContacts({})).toEqual([]);
    expect(entry.embeddedContacts({ dossier: { parties: { pour: 'invalide' } } })).toEqual([]);
  });
});

describe('planCleanup : prefixe et contacts sans prefixe', () => {
  test('un contact du compte sans prefixe est liste mais non supprime', () => {
    const s = baseSnapshot();
    s.contacts.push({ _id: 'c3', nom: 'Durand', prenoms: 'Paul', email: 'paul@example.com' });
    s.userContacts.push({ _id: 'uc3', user: U.a, contact: 'c3' });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.contacts.delete.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    expect(plan.contacts.unprefixed).toEqual([{ id: 'c3', kind: 'Contact', label: 'Durand Paul' }]);
    expect(stepIds(plan, 'userContacts').sort()).toEqual(['uc1', 'uc2']);
  });

  test('--include-unprefixed supprime aussi les contacts sans prefixe', () => {
    const s = baseSnapshot();
    s.contacts.push({ _id: 'c3', nom: 'Durand', prenoms: 'Paul', email: 'paul@example.com' });
    s.userContacts.push({ _id: 'uc3', user: U.a, contact: 'c3' });
    const plan = planCleanup({ selection: SELECTION, snapshot: s, includeUnprefixed: true });
    expect(plan.contacts.delete.map((c) => c.id).sort()).toEqual(['c1', 'c2', 'c3']);
    expect(plan.contacts.unprefixed).toEqual([]);
  });

  test('un contact sans prefixe n est jamais « conserve » avec une raison, meme atteint par une liaison peer', () => {
    const s = baseSnapshot();
    s.contacts.push({ _id: 'c3', nom: 'Durand', prenoms: 'Paul', email: 'paul@example.com' });
    s.userContacts.push({ _id: 'uc3', user: U.a, contact: 'c3' });
    s.contactRoles.push({ _id: 'cr-peer', contact: 'c3', contactLie: 'c-ext', partie: null, role: 'r1' });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.contacts.keep).toEqual([]);
    expect(plan.contacts.unprefixed.map((c) => c.id)).toEqual(['c3']);
    expect(plan.contacts.delete.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    expect(stepIds(plan, 'contactRoles')).toEqual(['cr1']);
    // --include-unprefixed : c3 redevient candidat, et la liaison peer vers un contact hors selection le conserve.
    const forced = planCleanup({ selection: SELECTION, snapshot: s, includeUnprefixed: true });
    expect(forced.contacts.delete.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    expect(keepReasons(forced.contacts.keep, 'c3')).toMatch(/contact hors selection/);
  });

  test('le prefixe est reconnu sur la raison sociale, la denomination et les emails', () => {
    const s = baseSnapshot();
    s.contactPMs.push(
      { _id: 'pm1', raisonSociale: 'ZZTEST SARL', emailEntreprise: '' },
      { _id: 'pm2', raisonSociale: 'Societe reelle', emailEntreprise: 'compta-zztest@example.com' },
      { _id: 'pm3', raisonSociale: 'Societe reelle', emailEntreprise: 'compta@example.com' },
    );
    s.userContactPMs.push(
      { _id: 'upm1', user: U.a, contactPM: 'pm1' },
      { _id: 'upm2', user: U.a, contactPM: 'pm2' },
      { _id: 'upm3', user: U.a, contactPM: 'pm3' },
    );
    s.contactPMPubliques.push({ _id: 'pub1', denomination: 'ZZTEST Mairie', email: '' });
    s.userContactPMPubliques.push({ _id: 'upub1', user: U.a, contactPMPublique: 'pub1' });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.contacts.delete.map((c) => c.id).sort()).toEqual(['c1', 'c2', 'pm1', 'pm2', 'pub1']);
    expect(plan.contacts.unprefixed.map((c) => c.id)).toEqual(['pm3']);
    expect(stepIds(plan, 'contactPMs').sort()).toEqual(['pm1', 'pm2']);
    expect(stepIds(plan, 'userContactPMs').sort()).toEqual(['upm1', 'upm2']);
    expect(stepIds(plan, 'contactPMPubliques')).toEqual(['pub1']);
    expect(stepIds(plan, 'userContactPMPubliques')).toEqual(['upub1']);
  });

  test('un prefixe personnalise change la selection', () => {
    const s = baseSnapshot();
    s.contacts.push({ _id: 'c3', nom: 'TEST50 Martin', prenoms: '', email: '' });
    s.userContacts.push({ _id: 'uc3', user: U.a, contact: 'c3' });
    const plan = planCleanup({ selection: SELECTION, snapshot: s, prefix: 'TEST50' });
    expect(plan.contacts.delete.map((c) => c.id)).toEqual(['c3']);
    expect(plan.contacts.unprefixed.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
  });

  test('un contact du carnet lie a un dossier hors selection est conserve', () => {
    const s = baseSnapshot();
    s.dossierContacts.push({ _id: 'dc-ext', dossier: 'd-ext', contact: 'c2' });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.contacts.delete.map((c) => c.id)).toEqual(['c1']);
    expect(keepReasons(plan.contacts.keep, 'c2')).toMatch(/DossierContact/);
  });
});

describe('planCleanup : sous-liaisons des contacts', () => {
  function familySnapshot() {
    const s = baseSnapshot();
    s.personneCharges.push({ _id: 'pch1' });
    s.contactPersonneCharges.push({ _id: 'cpc1', contact: 'c1', personneCharge: 'pch1' });
    s.detailMariages.push({ _id: 'dm1' });
    s.contactDetailMariages.push({ _id: 'cdm1', contact: 'c1', detailMariage: 'dm1' });
    s.contacts.push({ _id: 'notaire', nom: 'ZZTEST', prenoms: 'Notaire', email: '' });
    s.userContacts.push({ _id: 'uc-not', user: U.a, contact: 'notaire' });
    s.contactNotaireMariages.push({ _id: 'cnm1', contact: 'c1', detailMariage: 'dm1', notary: 'notaire' });
    return s;
  }

  test('personnes a charge, details de mariage et lien notaire partent avec l epoux', () => {
    const plan = planCleanup({ selection: SELECTION, snapshot: familySnapshot() });
    expect(stepIds(plan, 'contactPersonneCharges')).toEqual(['cpc1']);
    expect(stepIds(plan, 'personneCharges')).toEqual(['pch1']);
    expect(stepIds(plan, 'contactDetailMariages')).toEqual(['cdm1']);
    expect(stepIds(plan, 'contactNotaireMariages')).toEqual(['cnm1']);
    expect(stepIds(plan, 'detailMariages')).toEqual(['dm1']);
    expect(plan.contacts.delete.map((c) => c.id).sort()).toEqual(['c1', 'c2', 'notaire']);
    expect(position(plan, 'contactPersonneCharges')).toBeLessThan(position(plan, 'personneCharges'));
    expect(position(plan, 'contactNotaireMariages')).toBeLessThan(position(plan, 'detailMariages'));
    expect(position(plan, 'personneCharges')).toBeLessThan(position(plan, 'contacts'));
  });

  test('epoux conserve (sans prefixe) : son mariage, ses enfants et son notaire restent', () => {
    const s = familySnapshot();
    s.contacts[0].nom = 'Dupont';
    s.contacts[0].email = 'dupont@example.com';
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.contacts.unprefixed.map((c) => c.id)).toEqual(['c1']);
    expect(stepFor(plan, 'contactPersonneCharges')).toBeUndefined();
    expect(stepFor(plan, 'personneCharges')).toBeUndefined();
    expect(stepFor(plan, 'detailMariages')).toBeUndefined();
    expect(stepFor(plan, 'contactNotaireMariages')).toBeUndefined();
    expect(keepReasons(plan.contacts.keep, 'notaire')).toMatch(/ContactNotaireMariage/);
  });

  test('personne morale : representant legal et contact direct partent avec la fiche', () => {
    const s = baseSnapshot();
    s.contactPMs.push({ _id: 'pm1', raisonSociale: 'ZZTEST SARL', emailEntreprise: '' });
    s.userContactPMs.push({ _id: 'upm1', user: U.a, contactPM: 'pm1' });
    s.representantLegals.push({ _id: 'rl1' });
    s.contactRepresentantLegals.push({ _id: 'crl1', contactPM: 'pm1', representantLegal: 'rl1' });
    s.contactDirects.push({ _id: 'cd1' });
    s.contactContactDirects.push({ _id: 'ccd1', contactPM: 'pm1', contactDirect: 'cd1' });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(stepIds(plan, 'contactRepresentantLegals')).toEqual(['crl1']);
    expect(stepIds(plan, 'representantLegals')).toEqual(['rl1']);
    expect(stepIds(plan, 'contactContactDirects')).toEqual(['ccd1']);
    expect(stepIds(plan, 'contactDirects')).toEqual(['cd1']);
    expect(stepIds(plan, 'contactPMs')).toEqual(['pm1']);
  });

  test('un document de fusion du contact et sa liaison utilisateur partent avec lui', () => {
    const s = baseSnapshot();
    s.fusionDocuments.push({ _id: 'fd1', client: 'c1', nomDocument: 'Courrier' });
    s.userDocuments.push({ _id: 'udoc1', user: U.a, document: 'fd1' });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(stepIds(plan, 'userDocuments')).toEqual(['udoc1']);
    expect(stepIds(plan, 'fusionDocuments')).toEqual(['fd1']);
  });
});

describe('planCleanup : stockage distant', () => {
  test('document stocke portant des objets de stockage : liste, dossier conserve, stockage jamais appele', () => {
    const s = baseSnapshot();
    s.storedDocuments[0].versions = [{ versionId: 'v1', storageKey: 'tenant/x/y.docx', size: 12 }];
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.dossiers.delete).toEqual([]);
    expect(keepReasons(plan.dossiers.keep, 'd1')).toMatch(/objets de stockage/);
    expect(plan.storage).toEqual([
      { key: 'storedDocuments', model: 'StoredDocument', id: 'sd1', dossierId: 'd1', objects: 1 },
    ]);
    expect(stepFor(plan, 'storedDocuments')).toBeUndefined();
  });

  test('documents logiques : versions, copies, emplacements et journal partent avec le dossier', () => {
    const s = baseSnapshot();
    s.logicalDocuments.push({ _id: 'ld1', tenantId: T.a, dossierId: 'd1', createdBy: U.a, updatedBy: U.a });
    s.logicalDocumentVersions.push({ _id: 'ldv1', tenantId: T.a, logicalDocumentId: 'ld1', createdBy: U.a, storageRef: { storageKey: '' } });
    s.documentCopies.push({ _id: 'cp1', tenantId: T.a, logicalDocumentId: 'ld1', createdBy: U.a, lastModifiedBy: U.a });
    s.documentLocations.push({ _id: 'loc1', tenantId: T.a, logicalDocumentId: 'ld1', copyId: 'cp1', createdBy: U.a, storageKey: '', externalFileId: '' });
    s.documentSyncJournals.push({ _id: 'sj1', tenantId: T.a, logicalDocumentId: 'ld1', requestedBy: U.a });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(stepIds(plan, 'logicalDocumentVersions')).toEqual(['ldv1']);
    expect(stepIds(plan, 'documentCopies')).toEqual(['cp1']);
    expect(stepIds(plan, 'documentLocations')).toEqual(['loc1']);
    expect(stepIds(plan, 'documentSyncJournals')).toEqual(['sj1']);
    expect(stepIds(plan, 'logicalDocuments')).toEqual(['ld1']);
    expect(position(plan, 'logicalDocumentVersions')).toBeLessThan(position(plan, 'logicalDocuments'));
    expect(position(plan, 'logicalDocuments')).toBeLessThan(position(plan, 'dossiers'));
  });

  test('version logique avec objet de stockage : le dossier entier est conserve', () => {
    const s = baseSnapshot();
    s.logicalDocuments.push({ _id: 'ld1', tenantId: T.a, dossierId: 'd1', createdBy: U.a, updatedBy: U.a });
    s.logicalDocumentVersions.push({ _id: 'ldv1', tenantId: T.a, logicalDocumentId: 'ld1', createdBy: U.a, storageRef: { storageKey: 'k/v1.docx' } });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.dossiers.delete).toEqual([]);
    expect(plan.storage.map((item) => item.id)).toEqual(['ldv1']);
    expect(keepReasons(plan.dossiers.keep, 'd1')).toMatch(/objets de stockage/);
  });
});

describe('idempotence, comparaison et orphelins', () => {
  test('appliquer le plan puis replanifier ne trouve plus aucun candidat', () => {
    const before = baseSnapshot();
    before.contacts.push({ _id: 'c3', nom: 'Durand', prenoms: 'Paul', email: '' });
    before.userContacts.push({ _id: 'uc3', user: U.a, contact: 'c3' });
    const plan = planCleanup({ selection: SELECTION, snapshot: before });
    const after = applyPlanInMemory(before, plan);
    expect(after.dossiers).toEqual([]);
    expect(after.contacts.map((c) => c._id)).toEqual(['c3']);
    expect(after.userContacts.map((l) => l._id)).toEqual(['uc3']);
    const rerun = planCleanup({ selection: SELECTION, snapshot: after });
    expect(rerun.steps).toEqual([]);
    expect(rerun.summary.totalRows).toBe(0);
    expect(rerun.contacts.unprefixed.map((c) => c.id)).toEqual(['c3']);
    expect(detectOrphans({ snapshot: after, selection: SELECTION, deleted: deletedIdsFromPlan(plan) })).toEqual([]);
  });

  test('un plan reapplique sur un instantane deja nettoye est vide (idempotence)', () => {
    const plan = planCleanup({ selection: SELECTION, snapshot: baseSnapshot() });
    const after = applyPlanInMemory(baseSnapshot(), plan);
    const again = applyPlanInMemory(after, planCleanup({ selection: SELECTION, snapshot: after }));
    expect(summarizeSnapshot(again)).toEqual(summarizeSnapshot(after));
  });

  test('objets a proprietaire externe (agenda) : aucun orphelin apres application, relance vide', () => {
    const s = withSecondDossier(baseSnapshot());
    s.agendaEvents[0].createdBy = U.ext;
    s.dossierEventLinks.push({ _id: 'del-ext', dossier: 'd-ext', agendaEvent: 'e2', linkedBy: U.ext });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    expect(plan.dossiers.delete).toEqual([]);
    expect(plan.dossiers.keep.map((d) => d.id).sort()).toEqual(['d1', 'd2']);
    const after = applyPlanInMemory(s, plan);
    expect(detectOrphans({ snapshot: after, selection: SELECTION, deleted: deletedIdsFromPlan(plan) })).toEqual([]);
    expect(planCleanup({ selection: SELECTION, snapshot: after }).steps).toEqual([]);
  });

  test('deletedIdsFromPlan regroupe les identifiants supprimes par entite', () => {
    const plan = planCleanup({ selection: SELECTION, snapshot: baseSnapshot() });
    const deleted = deletedIdsFromPlan(plan);
    expect(deleted.dossier).toEqual(['d1']);
    expect(deleted.contact.sort()).toEqual(['c1', 'c2']);
    expect(deleted.partie).toEqual(['p1']);
    expect(deleted.role).toEqual(['r1']);
    expect(deleted.agendaEvent).toEqual(['e1']);
    expect(deleted.carpaOperation).toEqual(['op1']);
    expect(deleted.document).toEqual(['doc1']);
  });

  test('compareSnapshots donne les comptes avant/apres par collection', () => {
    const before = baseSnapshot();
    const plan = planCleanup({ selection: SELECTION, snapshot: before });
    const after = applyPlanInMemory(before, plan);
    const diff = compareSnapshots(before, after);
    expect(diff.dossiers).toEqual({ before: 1, after: 0, delta: -1 });
    expect(diff.contacts).toEqual({ before: 2, after: 0, delta: -2 });
    expect(diff.roles).toEqual({ before: 1, after: 0, delta: -1 });
    expect(diff.parties).toEqual({ before: 1, after: 0, delta: -1 });
    expect(Object.keys(diff).sort()).toEqual(COLLECTIONS.map((entry) => entry.key).sort());
  });

  test('detectOrphans : liaisons vers des documents supprimes, dossier sans UserDossier, UserContact sans contact', () => {
    const s = emptySnapshot();
    s.userDossiers.push({ _id: 'ud-orphan', user: U.a, dossier: 'd-gone' });
    s.dossierContacts.push({ _id: 'dc-orphan', dossier: 'd-gone', contact: 'c-gone' });
    s.dossiers.push({ _id: 'd-alone', tenantId: T.a, reference: '202609', dossier: { dossier: { nom: 'ZZTEST seul' } } });
    s.userContacts.push({ _id: 'uc-orphan', user: U.a, contact: 'c-missing' });
    const orphans = detectOrphans({
      snapshot: s,
      selection: SELECTION,
      deleted: { dossier: ['d-gone'], contact: ['c-gone'] },
    });
    const short = orphans.map((o) => `${o.collection}:${o.id}:${o.reason}`).sort();
    expect(short).toEqual([
      'dossierContacts:dc-orphan:reference un contact supprime (contact)',
      'dossierContacts:dc-orphan:reference un dossier supprime (dossier)',
      'dossiers:d-alone:dossier sans UserDossier',
      'userContacts:uc-orphan:UserContact sans contact',
      'userDossiers:ud-orphan:UserDossier sans dossier',
      'userDossiers:ud-orphan:reference un dossier supprime (dossier)',
    ]);
  });

  test('detectOrphans : rien a signaler sur un instantane coherent', () => {
    expect(detectOrphans({ snapshot: baseSnapshot(), selection: SELECTION, deleted: {} })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Parties pures du script d'orchestration (scripts/cleanup-zztest-data.js) :
// arguments, fichier de comptes, cible de repli, chargement borne et cycle
// complet sur de faux modeles en memoire. mongoose et lib/dbTarget sont des
// doublures (jest.mock en tete de fichier) : aucune connexion.
// ---------------------------------------------------------------------------

const os = require('os');
const fs = require('fs');
const path = require('path');
const mongooseMock = require('mongoose');
const dbTargetMock = require('../dbTarget');
const { getPath } = require('../zztestCleanup');
const script = require('../../cleanup-zztest-data');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kheops-zztest-'));
const anyId = () => true;

describe('script : parseArgs', () => {
  test('exige --target et refuse une cible inconnue', () => {
    expect(() => script.parseArgs(['--account', 'a@example.com'])).toThrow(/--target/);
    expect(() => script.parseArgs(['--target=prod', '--account', 'a@example.com'])).toThrow(/invalide/);
  });
  test('accepte les formes --option valeur et --option=valeur, --account repetable', () => {
    const options = script.parseArgs(['--target', 'dev', '--account', 'a@example.com', '--account=b@example.com', '--report=r.json', '--prefix', 'TEST50', '--apply', '--include-unprefixed', '--allow-account-pattern', '--confirm-preprod', '--verbose']);
    expect(options).toMatchObject({
      target: 'dev', accounts: ['a@example.com', 'b@example.com'], report: 'r.json', prefix: 'TEST50',
      apply: true, includeUnprefixed: true, allowAccountPattern: true, confirmPreprod: true, verbose: true,
    });
  });
  test('simulation par defaut, prefixe ZZTEST par defaut', () => {
    const options = script.parseArgs(['--target=test']);
    expect(options.apply).toBe(false);
    expect(options.prefix).toBe(DEFAULT_PREFIX);
  });
  test('refuse un argument inconnu, une valeur manquante et un prefixe vide', () => {
    expect(() => script.parseArgs(['--target=dev', '--drop-all'])).toThrow(/inconnu/);
    expect(() => script.parseArgs(['--target=dev', '--account'])).toThrow(/valeur manquante/);
    expect(() => script.parseArgs(['--target=dev', '--prefix', ''])).toThrow(/vide/);
  });
  test('--help ne demande pas de cible', () => {
    expect(script.parseArgs(['--help']).help).toBe(true);
  });
});

describe('script : readAccountsFile', () => {
  test('accepte un tableau d emails, d objets { email } ou { accounts: [...] }', () => {
    const dir = tmpDir();
    const write = (name, content) => { const file = path.join(dir, name); fs.writeFileSync(file, JSON.stringify(content)); return file; };
    expect(script.readAccountsFile(write('a.json', ['a@example.com', 'b@example.com']))).toEqual(['a@example.com', 'b@example.com']);
    expect(script.readAccountsFile(write('b.json', [{ email: 'a@example.com' }, { nom: 'sans email' }]))).toEqual(['a@example.com']);
    expect(script.readAccountsFile(write('c.json', { accounts: ['a@example.com'] }))).toEqual(['a@example.com']);
    expect(() => script.readAccountsFile(write('d.json', { comptes: [] }))).toThrow(/tableau/);
  });
});

const uriDev = 'mongodb+srv://user:secret@cluster.example.net/kheops2_dev?retryWrites=true';
const uriTest = 'mongodb://localhost:27017/kheops2_test';
const uriPreprod = 'mongodb+srv://user:secret@cluster.example.net/?retryWrites=true';

function serverDirWith(files) {
  const dir = tmpDir();
  for (const [name, uri] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), `MONGODB_URI=${uri}\nJWT_SECRET=x\n`);
  return dir;
}

describe('script : cible de repli (sans lib/dbTarget)', () => {
  test('describeMongoUri donne le nom de base et une empreinte sans exposer l URI', () => {
    expect(script.describeMongoUri(uriDev)).toEqual({ dbName: 'kheops2_dev', fingerprint: expect.stringMatching(/^[0-9a-f]{12}$/) });
    expect(script.describeMongoUri(uriTest).dbName).toBe('kheops2_test');
    expect(script.describeMongoUri(uriPreprod).dbName).toBe('(defaut)');
    expect(JSON.stringify(script.describeMongoUri(uriDev))).not.toMatch(/secret|cluster/);
  });

  test('dev : lit .env.development, exige un nom contenant "dev"', () => {
    const dir = serverDirWith({ '.env.development': uriDev, '.env': uriPreprod });
    const target = script.resolveFallbackTarget({ options: { target: 'dev', confirmPreprod: false }, env: {}, serverDir: dir });
    expect(target).toMatchObject({ kind: 'dev', dbName: 'kheops2_dev', override: null });
    expect(target.deploymentFingerprint).toBe(script.describeMongoUri(uriPreprod).fingerprint);
    const wrong = serverDirWith({ '.env.development': uriTest });
    expect(() => script.resolveFallbackTarget({ options: { target: 'dev', confirmPreprod: false }, env: {}, serverDir: wrong })).toThrow(/contenant "dev"/);
  });

  test('dev : refuse la base de deploiement (meme empreinte que server/.env)', () => {
    const same = uriPreprod.replace('/?', '/kheops_dev?');
    const dir = serverDirWith({ '.env.development': same, '.env': same });
    expect(() => script.resolveFallbackTarget({ options: { target: 'dev', confirmPreprod: false }, env: {}, serverDir: dir })).toThrow(/preproduction ciblee depuis un poste local/);
  });

  test('test : lit .env.test et exige un nom contenant "test" ; fichier absent = erreur explicite', () => {
    const dir = serverDirWith({ '.env.test': uriTest });
    expect(script.resolveFallbackTarget({ options: { target: 'test', confirmPreprod: false }, env: {}, serverDir: dir })).toMatchObject({ kind: 'test', dbName: 'kheops2_test' });
    expect(() => script.resolveFallbackTarget({ options: { target: 'dev', confirmPreprod: false }, env: {}, serverDir: dir })).toThrow(/\.env\.development introuvable/);
  });

  test('preprod : exige --confirm-preprod, KHEOPS_DB_OVERRIDE=preprod et une raison', () => {
    const dir = serverDirWith({ '.env': uriPreprod });
    const options = { target: 'preprod', confirmPreprod: false };
    expect(() => script.resolveFallbackTarget({ options, env: {}, serverDir: dir })).toThrow(/--confirm-preprod/);
    expect(() => script.resolveFallbackTarget({ options: { ...options, confirmPreprod: true }, env: {}, serverDir: dir })).toThrow(/KHEOPS_DB_OVERRIDE=preprod/);
    expect(() => script.resolveFallbackTarget({ options: { ...options, confirmPreprod: true }, env: { KHEOPS_DB_OVERRIDE: 'preprod' }, serverDir: dir })).toThrow(/KHEOPS_DB_OVERRIDE_REASON/);
    const target = script.resolveFallbackTarget({
      options: { ...options, confirmPreprod: true },
      env: { KHEOPS_DB_OVERRIDE: 'preprod', KHEOPS_DB_OVERRIDE_REASON: 'nettoyage recette' },
      serverDir: dir,
    });
    expect(target).toMatchObject({ kind: 'preprod-override', dbName: '(defaut)', override: { reason: 'nettoyage recette' } });
    expect(target.uri).toBe(uriPreprod);
  });
});

describe('script : chargement de lib/dbTarget et connexion (doublures, aucune base)', () => {
  const resolvedDev = { target: 'dev', kind: 'dev', dbName: 'kheops2_dev', fingerprint: 'abc123def456', uri: uriDev };

  beforeEach(() => {
    jest.clearAllMocks();
    dbTargetMock.resolveScriptTarget.mockReturnValue(resolvedDev);
    dbTargetMock.connectForScript.mockResolvedValue({ target: resolvedDev, mongoose: mongooseMock });
  });

  test('loadDbTarget : module absent = repli (null) ; module present mais dependance cassee = erreur explicite, pas de repli', () => {
    const dir = tmpDir();
    expect(script.loadDbTarget(path.join(dir, 'dbTarget.js'))).toBeNull();
    const broken = path.join(dir, 'dbTarget.js');
    fs.writeFileSync(broken, "module.exports = require('./config-env-absent');\n");
    expect(() => script.loadDbTarget(broken)).toThrow(/Cannot find module/);
    // Chemin par defaut : le module partage reel (ici sa doublure jest).
    expect(script.DB_TARGET_PATH).toBe(path.join(path.dirname(require.resolve('../../cleanup-zztest-data')), 'lib', 'dbTarget.js'));
    expect(script.loadDbTarget()).toBe(dbTargetMock);
  });

  test('connect via dbTarget : autoIndex/autoCreate desactives (mongoose.set) AVANT la connexion, et passes en options de connexion', async () => {
    const log = jest.fn();
    const result = await script.connect({ options: { target: 'dev', confirmPreprod: false }, env: {}, log });
    expect(result.via).toBe('dbTarget');
    expect(result.target).toBe(resolvedDev);
    expect(mongooseMock.set).toHaveBeenCalledWith('autoIndex', false);
    expect(mongooseMock.set).toHaveBeenCalledWith('autoCreate', false);
    expect(dbTargetMock.connectForScript).toHaveBeenCalledTimes(1);
    const call = dbTargetMock.connectForScript.mock.calls[0][0];
    expect(call).toMatchObject({
      argv: ['--target=dev'],
      purpose: 'cleanup-zztest',
      mongooseInstance: mongooseMock,
      connectOptions: { autoIndex: false, autoCreate: false },
    });
    const setOrders = mongooseMock.set.mock.invocationCallOrder;
    const connectOrder = dbTargetMock.connectForScript.mock.invocationCallOrder[0];
    expect(setOrders.length).toBeGreaterThanOrEqual(2);
    for (const order of setOrders) expect(order).toBeLessThan(connectOrder);
    // La resolution precede la connexion.
    expect(dbTargetMock.resolveScriptTarget.mock.invocationCallOrder[0]).toBeLessThan(connectOrder);
    expect(mongooseMock.connect).not.toHaveBeenCalled();
  });

  test('connect via dbTarget : --target=preprod attend le type preprod-override et transmet --confirm-preprod', async () => {
    const resolvedPreprod = { ...resolvedDev, target: 'preprod', kind: 'preprod-override', dbName: '(defaut)' };
    dbTargetMock.resolveScriptTarget.mockReturnValue(resolvedPreprod);
    dbTargetMock.connectForScript.mockResolvedValue({ target: resolvedPreprod, mongoose: mongooseMock });
    const result = await script.connect({ options: { target: 'preprod', confirmPreprod: true }, env: {}, log: jest.fn() });
    expect(result.target.kind).toBe('preprod-override');
    expect(dbTargetMock.connectForScript.mock.calls[0][0].argv).toEqual(['--target=preprod', '--confirm-preprod']);
  });

  test('connect via dbTarget : refus si le type resolu ne correspond pas a --target (derogation restee dans le shell), avant toute connexion', async () => {
    dbTargetMock.resolveScriptTarget.mockReturnValue({ ...resolvedDev, kind: 'preprod-override', dbName: '(defaut)' });
    await expect(script.connect({ options: { target: 'dev', confirmPreprod: false }, env: {}, log: jest.fn() }))
      .rejects.toThrow(/Cible incoherente : --target=dev mais la base resolue est de type preprod-override .*\.env\.development.*KHEOPS_DB_OVERRIDE/);
    expect(dbTargetMock.connectForScript).not.toHaveBeenCalled();
    expect(mongooseMock.connect).not.toHaveBeenCalled();

    dbTargetMock.resolveScriptTarget.mockReturnValue({ ...resolvedDev, kind: 'dev' });
    await expect(script.connect({ options: { target: 'test', confirmPreprod: false }, env: {}, log: jest.fn() }))
      .rejects.toThrow(/--target=test mais la base resolue est de type dev/);
    dbTargetMock.resolveScriptTarget.mockReturnValue({ ...resolvedDev, kind: 'dev' });
    await expect(script.connect({ options: { target: 'preprod', confirmPreprod: true }, env: {}, log: jest.fn() }))
      .rejects.toThrow(/--target=preprod mais la base resolue est de type dev .*attendu preprod-override/);
    expect(dbTargetMock.connectForScript).not.toHaveBeenCalled();
    expect(script.expectedKindFor('dev')).toBe('dev');
    expect(script.expectedKindFor('test')).toBe('test');
    expect(script.expectedKindFor('preprod')).toBe('preprod-override');
  });

  test('connect en repli (module absent) : options autoIndex/autoCreate a la connexion, journal sans URI', async () => {
    const dir = serverDirWith({ '.env.development': uriDev, '.env': uriPreprod });
    const log = jest.fn();
    const result = await script.connect({
      options: { target: 'dev', confirmPreprod: false },
      env: {},
      log,
      serverDir: dir,
      dbTargetPath: path.join(dir, 'absent-dbTarget.js'),
    });
    expect(result.via).toBe('fallback');
    expect(result.target).toEqual({ kind: 'dev', dbName: 'kheops2_dev', fingerprint: expect.stringMatching(/^[0-9a-f]{12}$/) });
    expect(dbTargetMock.connectForScript).not.toHaveBeenCalled();
    expect(mongooseMock.connect).toHaveBeenCalledWith(uriDev, { autoIndex: false, autoCreate: false });
    expect(mongooseMock.set).toHaveBeenCalledWith('autoIndex', false);
    expect(mongooseMock.set).toHaveBeenCalledWith('autoCreate', false);
    for (const order of mongooseMock.set.mock.invocationCallOrder) expect(order).toBeLessThan(mongooseMock.connect.mock.invocationCallOrder[0]);
    expect(log.mock.calls.map((c) => c.join(' ')).join('\n')).toMatch(/\[DB\] script=cleanup-zztest cible=dev base=kheops2_dev/);
    expect(log.mock.calls.map((c) => c.join(' ')).join('\n')).not.toMatch(/secret|cluster\.example/);
  });
});

// Faux modele : find(filter) evalue sur des documents en memoire (champs
// pointes, tableaux, $in de valeurs ou d'expressions regulieres, $or),
// deleteMany par _id.
function matchCondition(value, condition) {
  const values = Array.isArray(value) ? value : [value];
  if (condition && typeof condition === 'object' && !(condition instanceof RegExp) && Array.isArray(condition.$in)) {
    return values.some((v) => condition.$in.some((c) => (c instanceof RegExp ? c.test(String(v)) : String(c) === String(v))));
  }
  return values.some((v) => String(v) === String(condition));
}
function matchFilter(doc, filter) {
  return Object.entries(filter).every(([field, condition]) => {
    if (field === '$or') return condition.some((sub) => matchFilter(doc, sub));
    return matchCondition(getPath(doc, field), condition);
  });
}
function fakeModel(docs) {
  const model = {
    docs,
    find: jest.fn((filter) => {
      const result = docs.filter((doc) => matchFilter(doc, filter));
      const query = { select: jest.fn(() => query), lean: jest.fn(async () => result.map((doc) => ({ ...doc }))) };
      return query;
    }),
    deleteMany: jest.fn(async (filter) => {
      if (!filter || !filter._id || !Array.isArray(filter._id.$in) || !filter._id.$in.length) throw new Error('filtre vide');
      const ids = new Set(filter._id.$in.map(String));
      const before = docs.length;
      for (let index = docs.length - 1; index >= 0; index -= 1) if (ids.has(String(docs[index]._id))) docs.splice(index, 1);
      return { deletedCount: before - docs.length };
    }),
  };
  return model;
}

function fakeDatabase() {
  const data = baseSnapshot();
  // Hors selection : un dossier d'un autre cabinet partageant la partie p1,
  // un contact d'un autre utilisateur, un contact du carnet partage.
  data.dossiers.push({ _id: 'd-ext', tenantId: T.ext, reference: '202650', dossier: { dossier: { nom: 'Autre cabinet' }, documents: [{ _id: 'doc-ext' }] } });
  data.userDossiers.push({ _id: 'ud-ext', user: U.ext, dossier: 'd-ext' });
  data.dossierParties.push({ _id: 'dp-ext', dossier: 'd-ext', partie: 'p1' });
  data.contacts.push({ _id: 'c-ext', nom: 'ZZTEST', prenoms: 'Externe', email: '' });
  data.userContacts.push({ _id: 'uc-ext', user: U.ext, contact: 'c-ext' }, { _id: 'uc-ext2', user: U.ext, contact: 'c2' });
  data.documentEditorStates.push({ _id: 'des-ext', tenantId: T.ext, documentId: 'doc-ext' });
  data.users = [
    { _id: U.a, email: ACCOUNT_A.email, tenantId: T.a },
    { _id: U.ext, email: 'avocat.reel@example.com', tenantId: T.ext },
  ];
  data.tenants = [{ _id: T.a, ownerUserId: U.a }, { _id: T.ext, ownerUserId: U.ext }];
  const models = {};
  for (const entry of COLLECTIONS) models[entry.key] = fakeModel(data[entry.key]);
  models.User = fakeModel(data.users);
  models.Tenant = fakeModel(data.tenants);
  return { data, models };
}

describe('script : chargement borne (loadSnapshot) et cycle complet', () => {
  test('ne lit que ce qui touche la selection : dossiers et contacts hors selection absents, liaisons partagees presentes', async () => {
    const { models } = fakeDatabase();
    const snapshot = await script.loadSnapshot({ models, selection: SELECTION, log: () => {}, isObjectId: anyId });
    expect(snapshot.dossiers.map((d) => d._id)).toEqual(['d1']);
    expect(snapshot.contacts.map((c) => c._id).sort()).toEqual(['c1', 'c2']);
    expect(snapshot.dossierParties.map((l) => l._id).sort()).toEqual(['dp-ext', 'dp1']);
    expect(snapshot.userContacts.map((l) => l._id).sort()).toEqual(['uc-ext2', 'uc1', 'uc2']);
    expect(snapshot.userDossiers.map((l) => l._id)).toEqual(['ud1']);
    expect(snapshot.documentEditorStates.map((l) => l._id)).toEqual(['des1']);
    for (const entry of COLLECTIONS) {
      for (const call of models[entry.key].find.mock.calls) {
        const [filter] = call;
        expect(Object.values(filter).some((condition) => Array.isArray(condition.$in) && condition.$in.length > 0)).toBe(true);
      }
    }
  });

  test('identifiants : seule la forme ObjectId hexadecimale (24) est envoyee dans un filtre sur un champ ObjectId', async () => {
    expect(script.isObjectIdString('507f1f77bcf86cd799439011')).toBe(true);
    expect(script.isObjectIdString('507F1F77BCF86CD799439011')).toBe(true);
    // 12 caracteres : accepte par ObjectId.isValid (12 octets), refuse ici.
    expect(script.isObjectIdString('matter-00042')).toBe(false);
    expect(script.isObjectIdString('abcdefghijkl')).toBe(false);
    expect(script.isObjectIdString('d1')).toBe(false);
    expect(script.isObjectIdString('')).toBe(false);
    expect(script.isObjectIdString(null)).toBe(false);
    expect(script.OBJECT_ID_PATTERN.test('507f1f77bcf86cd79943901')).toBe(false);

    const hex = { u: '64a000000000000000000001', t: '64a000000000000000000002', d: '64a000000000000000000003', ud: '64a000000000000000000004' };
    const data = emptySnapshot();
    data.dossiers.push({ _id: hex.d, tenantId: hex.t, reference: '202601', dossier: { dossier: { nom: 'ZZTEST hex' }, documents: [] } });
    data.userDossiers.push({ _id: hex.ud, user: hex.u, dossier: hex.d });
    data.entityRelations.push({ _id: 'er-text', tenantId: hex.t, subject: { entityType: 'matter', entityId: 'matter-00042' }, object: { entityType: 'contact', entityId: 'contact-0001' }, createdBy: hex.u });
    const models = {};
    for (const entry of COLLECTIONS) models[entry.key] = fakeModel(data[entry.key]);
    const selection = buildSelection([{ email: 'zztest.hex@example.com', userId: hex.u, tenantIds: [hex.t] }]);
    const snapshot = await script.loadSnapshot({ models, selection, seeds: { dossier: ['matter-00042'] }, log: () => {} });
    expect(snapshot.dossiers.map((d) => d._id)).toEqual([hex.d]);
    expect(snapshot.userDossiers.map((l) => l._id)).toEqual([hex.ud]);
    // La relation v2 (extremite textuelle) est bien lue par son champ chaine...
    expect(snapshot.entityRelations.map((r) => r._id)).toEqual(['er-text']);
    // ...mais aucun identifiant textuel n'atteint un filtre _id / champ ObjectId.
    for (const entry of COLLECTIONS) {
      if (entry.key === 'entityRelations') continue;
      for (const [filter] of models[entry.key].find.mock.calls) {
        for (const condition of Object.values(filter)) {
          if (Array.isArray(condition.$in)) for (const id of condition.$in) expect(id).toMatch(script.OBJECT_ID_PATTERN);
        }
      }
    }
    // Avec un predicat permissif (tests en memoire), l'identifiant textuel est interroge.
    const permissive = {};
    for (const entry of COLLECTIONS) permissive[entry.key] = fakeModel(data[entry.key]);
    await script.loadSnapshot({ models: permissive, selection, seeds: { dossier: ['matter-00042'] }, log: () => {}, isObjectId: anyId });
    const queried = permissive.dossiers.find.mock.calls.flatMap(([filter]) => (filter._id ? filter._id.$in : []));
    expect(queried).toContain('matter-00042');
  });

  test('cycle complet : plan, suppression par identifiants, relecture, orphelins nuls, relance vide', async () => {
    const { models } = fakeDatabase();
    const before = await script.loadSnapshot({ models, selection: SELECTION, log: () => {}, isObjectId: anyId });
    const plan = planCleanup({ selection: SELECTION, snapshot: before });
    // p1 est partagee avec d-ext : partie, liaisons et contacts conserves ; c2 partage aussi.
    expect(plan.dossiers.delete.map((d) => d.id)).toEqual(['d1']);
    expect(stepFor(plan, 'parties')).toBeUndefined();
    expect(plan.contacts.delete).toEqual([]);
    expect(keepReasons(plan.contacts.keep, 'c2')).toMatch(/utilisateur hors selection/);
    for (const step of plan.steps) {
      const deletedCount = await script.deleteByIds(models[step.key], step.ids);
      expect(deletedCount).toBe(step.ids.length);
    }
    expect(models.dossiers.docs.map((d) => d._id)).toEqual(['d-ext']);
    expect(models.dossierParties.docs.map((l) => l._id)).toEqual(['dp-ext']);
    const deleted = deletedIdsFromPlan(plan);
    const after = await script.loadSnapshot({ models, selection: SELECTION, seeds: deleted, log: () => {}, isObjectId: anyId });
    expect(detectOrphans({ snapshot: after, selection: SELECTION, deleted })).toEqual([]);
    const rerun = planCleanup({ selection: SELECTION, snapshot: after });
    expect(rerun.steps).toEqual([]);
  });

  test('deleteByIds refuse une liste vide et publicPlan expose des comptes par etape', async () => {
    const model = fakeModel([{ _id: 'x' }]);
    await expect(script.deleteByIds(model, [])).rejects.toThrow(/vide/);
    expect(model.deleteMany).not.toHaveBeenCalled();
    const s = baseSnapshot();
    s.contacts.push({ _id: 'c3', nom: 'Durand', prenoms: 'Paul', email: 'paul@example.com' });
    s.userContacts.push({ _id: 'uc3', user: U.a, contact: 'c3' });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    const shown = script.publicPlan(plan);
    expect(shown.steps.find((step) => step.key === 'dossiers')).toEqual({ order: 60, key: 'dossiers', model: 'Dossier', count: 1, ids: ['d1'] });
    expect(shown.contacts.unprefixed).toEqual([{ id: 'c3', kind: 'Contact' }]);
    expect(JSON.stringify(shown)).not.toMatch(/Durand|paul@example|mongodb|password|MONGODB_URI/i);
  });

  test('publicPlan et printPlan : un contact sans prefixe atteint par une liaison peer n apparait que par identifiant et type', () => {
    const s = baseSnapshot();
    s.contacts.push({ _id: 'c3', nom: 'Durand', prenoms: 'Paul', email: 'paul@example.com' });
    s.userContacts.push({ _id: 'uc3', user: U.a, contact: 'c3' });
    s.contactRoles.push({ _id: 'cr-peer', contact: 'c3', contactLie: 'c-ext', partie: null, role: 'r1' });
    const plan = planCleanup({ selection: SELECTION, snapshot: s });
    const shown = script.publicPlan(plan);
    expect(shown.contacts.keep).toEqual([]);
    expect(shown.contacts.unprefixed).toEqual([{ id: 'c3', kind: 'Contact' }]);
    expect(JSON.stringify(shown)).not.toMatch(/Durand|paul@example/i);
    const lines = [];
    script.printPlan(plan, { verbose: true, log: (...args) => lines.push(args.join(' ')) });
    const output = lines.join('\n');
    expect(output).not.toMatch(/Durand|paul@example/i);
    expect(output).toMatch(/liste Contact c3 \(sans prefixe, conserve\)/);
    expect(output).toMatch(/1 sans prefixe \(listes, conserves\)/);
  });

  test('applyPlan consigne chaque etape des qu elle est terminee (onStep)', async () => {
    const { models } = fakeDatabase();
    const before = await script.loadSnapshot({ models, selection: SELECTION, log: () => {}, isObjectId: anyId });
    const plan = planCleanup({ selection: SELECTION, snapshot: before });
    const seen = [];
    const executed = await script.applyPlan({ plan, models, log: () => {}, onStep: (step) => seen.push(step) });
    expect(executed).toEqual(seen);
    expect(executed.map((step) => step.key)).toEqual(plan.steps.map((step) => step.key));
    for (const step of executed) expect(step.deletedCount).toBe(step.requested);
  });
});

describe('script : main() de bout en bout (dbTarget, mongoose et modeles remplaces)', () => {
  const resolvedDev = { target: 'dev', kind: 'dev', dbName: 'kheops2_dev', fingerprint: 'abc123def456', uri: uriDev };
  let lines;
  let deps;
  let db;
  let reportFile;

  const output = () => lines.join('\n');
  const readReport = () => JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const run = (args) => script.main(['--target=dev', ...args], {}, deps);

  beforeEach(() => {
    jest.clearAllMocks();
    dbTargetMock.resolveScriptTarget.mockReturnValue(resolvedDev);
    dbTargetMock.connectForScript.mockResolvedValue({ target: resolvedDev, mongoose: mongooseMock });
    lines = [];
    db = fakeDatabase();
    reportFile = path.join(tmpDir(), 'rapport.json');
    // Identifiants courts de la base factice : predicat ObjectId permissif (voir le test dedie au filtre strict).
    deps = { log: (...args) => lines.push(args.join(' ')), loadModels: jest.fn(() => db.models), isObjectId: anyId };
  });

  test('--help : aide affichee, aucune connexion', async () => {
    expect(await script.main(['--help'], {}, deps)).toBe(0);
    expect(output()).toMatch(/Usage/);
    expect(dbTargetMock.connectForScript).not.toHaveBeenCalled();
  });

  test('compte hors motif : refus (code 1) AVANT toute connexion, rapport ecrit avec le refus', async () => {
    const code = await run(['--account', 'avocat.reel@example.com', '--account', ACCOUNT_A.email, '--report', reportFile]);
    expect(code).toBe(1);
    expect(dbTargetMock.resolveScriptTarget).not.toHaveBeenCalled();
    expect(dbTargetMock.connectForScript).not.toHaveBeenCalled();
    expect(mongooseMock.set).not.toHaveBeenCalled();
    expect(deps.loadModels).not.toHaveBeenCalled();
    expect(output()).toMatch(/REFUS avocat\.reel@example\.com : email hors motif autorise/);
    expect(output()).toMatch(/abandon sans connexion/);
    const report = readReport();
    expect(report.status).toBe('refuse');
    expect(report.rejected).toEqual([{ email: 'avocat.reel@example.com', reason: 'email hors motif autorise (utiliser --allow-account-pattern pour forcer)' }]);
    expect(report.target).toBeUndefined();
  });

  test('--allow-account-pattern : le motif n est plus verifie avant connexion, le compte est resolu en base', async () => {
    const code = await run(['--account', 'avocat.reel@example.com', '--allow-account-pattern']);
    expect(code).toBe(0);
    expect(dbTargetMock.connectForScript).toHaveBeenCalledTimes(1);
    expect(output()).toMatch(/Compte avocat\.reel@example\.com : user=user-ext/);
  });

  test('compte introuvable : refus (code 1) apres connexion, sans lecture des donnees', async () => {
    const code = await run(['--account', 'zztest.inconnu@example.com', '--report', reportFile]);
    expect(code).toBe(1);
    expect(dbTargetMock.connectForScript).toHaveBeenCalledTimes(1);
    expect(mongooseMock.disconnect).toHaveBeenCalledTimes(1);
    expect(readReport()).toMatchObject({ status: 'refuse', rejected: [{ email: 'zztest.inconnu@example.com', reason: 'compte introuvable' }] });
    expect(db.models.dossiers.find).not.toHaveBeenCalled();
  });

  test('simulation : plan calcule, rien n est supprime, code 0, rapport sans URI', async () => {
    const code = await run(['--account', ACCOUNT_A.email.toUpperCase(), '--report', reportFile]);
    expect(code).toBe(0);
    expect(deps.loadModels).toHaveBeenCalledWith({ mongoose: mongooseMock });
    expect(mongooseMock.disconnect).toHaveBeenCalledTimes(1);
    for (const entry of COLLECTIONS) expect(db.models[entry.key].deleteMany).not.toHaveBeenCalled();
    const report = readReport();
    expect(report).toMatchObject({ status: 'simulation', mode: 'simulation', target: { kind: 'dev', dbName: 'kheops2_dev', fingerprint: 'abc123def456' } });
    expect(report.before.orphans).toEqual([]);
    expect(report.plan.steps.find((step) => step.key === 'dossiers')).toMatchObject({ count: 1, ids: ['d1'] });
    expect(report.apply).toBeUndefined();
    expect(JSON.stringify(report)).not.toMatch(/mongodb|secret|cluster\.example|MONGODB_URI/i);
    expect(output()).toMatch(/SIMULATION : rien n a ete ecrit/);
  });

  test('application : suppressions par identifiants, controle conforme, code 0, etapes consignees', async () => {
    const code = await run(['--account', ACCOUNT_A.email, '--apply', '--report', reportFile]);
    expect(code).toBe(0);
    const report = readReport();
    expect(report.status).toBe('applique');
    expect(report.apply.steps.length).toBe(report.plan.steps.length);
    for (const step of report.apply.steps) expect(step.deletedCount).toBe(step.requested);
    expect(report.after.orphans).toEqual([]);
    expect(report.after.newOrphans).toEqual([]);
    expect(report.after.rerun.totalRows).toBe(0);
    expect(report.after.diff.dossiers).toEqual({ before: 1, after: 0, delta: -1 });
    expect(db.models.dossiers.docs.map((d) => d._id)).toEqual(['d-ext']);
    expect(output()).toMatch(/Controle conforme/);
    // Relance : plus rien a faire.
    lines = [];
    expect(await run(['--account', ACCOUNT_A.email, '--apply'])).toBe(0);
    expect(output()).toMatch(/Rien a supprimer/);
  });

  test('orphelins preexistants : listes avant, non imputes au nettoyage (code 0), toujours listes apres', async () => {
    db.data.userDossiers.push({ _id: 'ud-old', user: U.a, dossier: 'd-gone' });
    const code = await run(['--account', ACCOUNT_A.email, '--apply', '--report', reportFile]);
    expect(code).toBe(0);
    const report = readReport();
    expect(report.status).toBe('applique');
    expect(report.before.orphans).toEqual([expect.objectContaining({ collection: 'userDossiers', id: 'ud-old', reason: 'UserDossier sans dossier' })]);
    expect(report.after.orphans).toEqual([expect.objectContaining({ id: 'ud-old', reason: 'UserDossier sans dossier' })]);
    expect(report.after.newOrphans).toEqual([]);
    expect(output()).toMatch(/ORPHELIN PREEXISTANT UserDossier ud-old : UserDossier sans dossier/);
    expect(output()).toMatch(/1 orphelin\(s\) dont 0 nouveau\(x\)/);
  });

  test('controle non conforme : un orphelin nouveau apres application donne le code 2', async () => {
    // La suppression des UserDossier n'a aucun effet : la liaison ud1 survit a son dossier.
    db.models.userDossiers.deleteMany.mockImplementation(async () => ({ deletedCount: 0 }));
    const code = await run(['--account', ACCOUNT_A.email, '--apply', '--report', reportFile]);
    expect(code).toBe(2);
    const report = readReport();
    expect(report.status).toBe('controle-non-conforme');
    expect(report.apply.steps.find((step) => step.key === 'userDossiers')).toMatchObject({ requested: 1, deletedCount: 0 });
    expect(report.after.newOrphans.map((o) => `${o.collection}:${o.id}:${o.reason}`).sort()).toEqual([
      'userDossiers:ud1:UserDossier sans dossier',
      'userDossiers:ud1:reference un dossier supprime (dossier)',
    ]);
    expect(output()).toMatch(/Controle NON conforme/);
  });

  test('echec d un deleteMany en cours d application : rapport ecrit (plan complet, etapes executees, statut erreur), sans URI', async () => {
    // Echec sur une etape intermediaire (ordre 30) : les liaisons (10) et le
    // journal CARPA (20) sont deja partis, le dossier (60) reste.
    db.models.carpaOperations.deleteMany.mockImplementation(async () => { throw new Error('reseau indisponible'); });
    await expect(run(['--account', ACCOUNT_A.email, '--apply', '--report', reportFile])).rejects.toThrow(/reseau indisponible/);
    expect(mongooseMock.disconnect).toHaveBeenCalledTimes(1);
    const report = readReport();
    expect(report.status).toBe('erreur');
    expect(report.error).toBe('reseau indisponible');
    expect(report.plan.steps.length).toBeGreaterThan(0);
    const planKeys = report.plan.steps.map((step) => step.key);
    expect(planKeys).toContain('carpaOperations');
    const executedKeys = report.apply.steps.map((step) => step.key);
    expect(executedKeys.length).toBeGreaterThan(0);
    expect(executedKeys).toEqual(planKeys.slice(0, planKeys.indexOf('carpaOperations')));
    expect(executedKeys).toContain('userDossiers');
    expect(executedKeys).toContain('carpaAuditLogs');
    expect(executedKeys).not.toContain('carpaOperations');
    expect(executedKeys).not.toContain('dossiers');
    expect(db.models.dossiers.docs.map((d) => d._id).sort()).toEqual(['d-ext', 'd1']);
    // La graine UserDossier est partie : le plan ecrit avant application reste la trace des identifiants.
    expect(db.models.userDossiers.docs.map((l) => l._id)).toEqual(['ud-ext']);
    expect(report.plan.steps.find((step) => step.key === 'dossiers').ids).toEqual(['d1']);
    expect(report.after).toBeUndefined();
    expect(JSON.stringify(report)).not.toMatch(/mongodb|secret|cluster\.example|MONGODB_URI/i);
  });

  test('erreur de cible (type resolu incoherent) : aucune connexion, rapport en erreur, exception propagee', async () => {
    dbTargetMock.resolveScriptTarget.mockReturnValue({ ...resolvedDev, kind: 'preprod-override' });
    await expect(run(['--account', ACCOUNT_A.email, '--report', reportFile])).rejects.toThrow(/Cible incoherente/);
    expect(dbTargetMock.connectForScript).not.toHaveBeenCalled();
    expect(mongooseMock.disconnect).not.toHaveBeenCalled();
    expect(readReport()).toMatchObject({ status: 'erreur', error: expect.stringMatching(/Cible incoherente/) });
  });
});
