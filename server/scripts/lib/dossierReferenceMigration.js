// server/scripts/lib/dossierReferenceMigration.js
//
// Logique PURE (sans base de donnees) de l'audit et de la migration des
// references de dossier vers l'unicite PAR CABINET (regle canonique en tete de
// server/utils/dossierReference.js). Testee dans
// __tests__/dossierReferenceMigration.test.js. L'orchestration reelle
// (connexion, lecture, ecriture, journal) vit dans
// server/scripts/audit-dossier-references.js et
// server/scripts/migrate-dossier-references.js et ne fait qu'appeler ces
// fonctions.
//
// ETAPES de la migration :
//   1. rattacher les dossiers sans tenantId a leur cabinet, deduit de
//      UserDossier -> User.tenantId lorsqu'un SEUL utilisateur en est
//      proprietaire (sinon laisser et signaler), en journalisant l'ancienne
//      valeur ;
//   2. verifier l'absence de doublon (tenantId, reference) sur l'etat obtenu ;
//   3. creer l'index unique compose { tenantId: 1, reference: 1 } ;
//   4. supprimer l'ancien index non unique { reference: 1 } (reference_1,
//      declare par l'ancien modele et absent du nouveau).
// Le retour arriere ne defait que ce que le run annule a reellement fait :
// il restaure les anciennes valeurs de tenantId depuis le journal (uniquement
// pour les entrees que le run a appliquees et si le dossier porte encore la
// valeur appliquee), supprime l'index compose seulement si le run l'a cree
// (index.created) et recree l'ancien index reference_1 seulement si le run
// l'a supprime (legacyIndex.dropped). Aucune reference n'est jamais
// renumerotee.

const crypto = require('crypto');

const UNIQUE_INDEX_NAME = 'tenantId_1_reference_1';
const UNIQUE_INDEX_KEY = { tenantId: 1, reference: 1 };
// Ancien index non unique sur la reference seule (DossierSchema.index({ reference: 1 })
// de l'ancien modele) : supprime par la migration, recree par le retour arriere.
const LEGACY_INDEX_NAME = 'reference_1';
const LEGACY_INDEX_KEY = { reference: 1 };
const SCRIPT_TARGETS = ['dev', 'test', 'preprod'];

// Reference "<annee><rang>" : quatre chiffres d'annee puis un rang d'au
// moins deux chiffres (padStart(2)). Tout le reste est "hors format"
// (espace "DCM-" des divorces, anciens "TEST50-NN", valeurs vides).
const REFERENCE_PATTERN = /^(\d{4})(\d{2,})$/;

/** Normalise un id (ObjectId | string | {toString}) en chaine, ou null. */
function idStr(value) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length ? text : null;
}

/** { year, rank } d'une reference "<annee><rang>", ou null hors format. */
function parseReference(reference) {
  const match = REFERENCE_PATTERN.exec(String(reference ?? ''));
  return match ? { year: Number(match[1]), rank: Number(match[2]) } : null;
}

/** Vue normalisee d'un document Dossier : { id, reference, tenantId } (accepte une vue deja normalisee). */
function normalizeDossier(doc) {
  return {
    id: idStr(doc && (doc._id !== undefined && doc._id !== null ? doc._id : doc.id)),
    reference: doc && doc.reference !== undefined && doc.reference !== null ? String(doc.reference) : null,
    tenantId: idStr(doc && doc.tenantId),
  };
}

const normalizeAll = (dossiers) => (dossiers || []).map(normalizeDossier);

const cabinetKey = (tenantId) => (tenantId === null ? 'null' : tenantId);

/**
 * Repartition des dossiers : totaux, cabinets distincts, dossiers sans
 * cabinet, repartition par cabinet (tries par effectif decroissant, le groupe
 * "sans cabinet" en dernier) et par annee, references hors format.
 */
function summarizeDossiers(dossiers) {
  const list = normalizeAll(dossiers);
  const byCabinet = new Map();
  const parAnnee = {};
  const horsFormat = [];
  for (const item of list) {
    const key = cabinetKey(item.tenantId);
    if (!byCabinet.has(key)) byCabinet.set(key, { tenantId: item.tenantId, dossiers: 0, parAnnee: {}, horsFormat: 0 });
    const group = byCabinet.get(key);
    group.dossiers += 1;
    const parsed = parseReference(item.reference);
    if (parsed) {
      group.parAnnee[parsed.year] = (group.parAnnee[parsed.year] || 0) + 1;
      parAnnee[parsed.year] = (parAnnee[parsed.year] || 0) + 1;
    } else {
      group.horsFormat += 1;
      horsFormat.push({ id: item.id, reference: item.reference, tenantId: item.tenantId });
    }
  }
  const parCabinet = [...byCabinet.values()].sort((a, b) => {
    if (a.tenantId === null) return 1;
    if (b.tenantId === null) return -1;
    if (b.dossiers !== a.dossiers) return b.dossiers - a.dossiers;
    return a.tenantId < b.tenantId ? -1 : 1;
  });
  return {
    total: list.length,
    sansTenantId: list.filter((item) => item.tenantId === null).length,
    cabinets: parCabinet.filter((group) => group.tenantId !== null).length,
    parCabinet,
    parAnnee,
    horsFormat,
  };
}

/**
 * Doublons de reference. scope 'cabinet' : meme (tenantId, reference), le
 * groupe tenantId null compris (l'index unique traite null comme une valeur) ;
 * scope 'global' : meme reference tous cabinets confondus (informatif).
 */
function findDuplicateReferences(dossiers, { scope = 'cabinet' } = {}) {
  const groups = new Map();
  for (const item of normalizeAll(dossiers)) {
    if (!item.reference) continue;
    const key = scope === 'global' ? item.reference : `${cabinetKey(item.tenantId)}|${item.reference}`;
    if (!groups.has(key)) groups.set(key, { tenantId: item.tenantId, reference: item.reference, ids: [] });
    groups.get(key).ids.push(item.id);
  }
  const duplicates = [];
  for (const group of groups.values()) {
    if (group.ids.length < 2) continue;
    duplicates.push(scope === 'global'
      ? { reference: group.reference, ids: group.ids }
      : { tenantId: group.tenantId, reference: group.reference, ids: group.ids });
  }
  return duplicates;
}

/**
 * Rattachement des dossiers sans cabinet : UserDossier -> User.tenantId.
 * Un dossier est rattache seulement s'il a UN SEUL utilisateur proprietaire,
 * connu et pourvu d'un cabinet ; sinon il est laisse tel quel et signale.
 *
 * @param {Array} dossiers  documents { _id, reference, tenantId }
 * @param {Array} links     documents UserDossier { user, dossier }
 * @param {Array} users     documents User { _id, tenantId }
 */
function planTenantAttachments({ dossiers, links, users }) {
  const tenantOfUser = new Map((users || []).map((user) => [idStr(user._id), idStr(user.tenantId)]));
  const ownersOfDossier = new Map();
  for (const link of links || []) {
    const dossierId = idStr(link && link.dossier);
    const userId = idStr(link && link.user);
    if (!dossierId || !userId) continue;
    if (!ownersOfDossier.has(dossierId)) ownersOfDossier.set(dossierId, []);
    const owners = ownersOfDossier.get(dossierId);
    if (!owners.includes(userId)) owners.push(userId);
  }

  const updates = [];
  const unresolved = [];
  let dejaRattaches = 0;
  for (const item of normalizeAll(dossiers)) {
    if (item.tenantId !== null) {
      dejaRattaches += 1;
      continue;
    }
    const owners = ownersOfDossier.get(item.id) || [];
    const candidates = owners.map((userId) => ({
      userId,
      tenantId: tenantOfUser.has(userId) ? tenantOfUser.get(userId) : null,
    }));
    let reason = null;
    if (owners.length === 0) reason = 'aucun_lien_utilisateur';
    else if (owners.length > 1) reason = 'plusieurs_proprietaires';
    else if (!tenantOfUser.has(owners[0])) reason = 'utilisateur_introuvable';
    else if (!tenantOfUser.get(owners[0])) reason = 'utilisateur_sans_cabinet';
    if (reason) {
      unresolved.push({ dossierId: item.id, reference: item.reference, reason, candidates });
      continue;
    }
    updates.push({ dossierId: item.id, reference: item.reference, from: null, to: tenantOfUser.get(owners[0]), userId: owners[0] });
  }
  return { updates, unresolved, dejaRattaches };
}

/** Etat des dossiers une fois les rattachements appliques (copie, sans effet de bord). */
function applyAttachments(dossiers, updates) {
  const target = new Map((updates || []).map((update) => [update.dossierId, update.to]));
  return normalizeAll(dossiers).map((item) => (
    target.has(item.id) ? { ...item, tenantId: target.get(item.id) } : { ...item }
  ));
}

function buildIndexVerdict({ duplicates }) {
  const count = (duplicates || []).length;
  if (count === 0) return { creatable: true, reason: 'aucun doublon par cabinet.' };
  return { creatable: false, reason: `${count} doublon(s) par cabinet a traiter avant creation de l index.` };
}

const sameKey = (left, right) => {
  const a = Object.entries(left || {});
  const b = Object.entries(right || {});
  return a.length === b.length && a.every(([field, order], index) => b[index][0] === field && Number(b[index][1]) === Number(order));
};

/** Index existant portant la cle composee { tenantId, reference }, unique ou non. */
function findCompoundIndex(indexes) {
  return (indexes || []).find((index) => sameKey(index.key, UNIQUE_INDEX_KEY)) || null;
}

function hasUniqueCompoundIndex(indexes) {
  const index = findCompoundIndex(indexes);
  return Boolean(index && index.unique === true);
}

/** Ancien index portant la cle { reference: 1 } seule (quel que soit son nom), ou null. */
function findLegacyReferenceIndex(indexes) {
  return (indexes || []).find((index) => sameKey(index.key, LEGACY_INDEX_KEY)) || null;
}

function describeIndexes(indexes) {
  return (indexes || []).map((index) => ({ name: index.name, key: index.key, unique: index.unique === true }));
}

/** Rapport d'audit (lecture seule) ; ne contient jamais d'URI de connexion. */
function buildAuditReport({ dossiers, links, users, indexes, target }) {
  const summary = summarizeDossiers(dossiers);
  const attachments = planTenantAttachments({ dossiers, links, users });
  const afterAttachments = applyAttachments(dossiers, attachments.updates);
  const duplicatesAfter = findDuplicateReferences(afterAttachments, { scope: 'cabinet' });
  return {
    cible: target ? { kind: target.kind, dbName: target.dbName, fingerprint: target.fingerprint } : null,
    total: summary.total,
    cabinets: summary.cabinets,
    sansTenantId: {
      total: summary.sansTenantId,
      rattachementsProposes: attachments.updates,
      nonResolus: attachments.unresolved,
    },
    repartitionParCabinet: summary.parCabinet,
    parAnnee: summary.parAnnee,
    referencesHorsFormat: summary.horsFormat,
    doublonsParCabinet: findDuplicateReferences(dossiers, { scope: 'cabinet' }),
    doublonsGlobaux: findDuplicateReferences(dossiers, { scope: 'global' }),
    doublonsApresRattachement: duplicatesAfter,
    index: {
      presents: describeIndexes(indexes),
      composeUniquePresent: hasUniqueCompoundIndex(indexes),
      verdict: buildIndexVerdict({ duplicates: duplicatesAfter }),
    },
  };
}

/**
 * Journal d'un run : chaque changement avec son ancienne valeur, l'index vise
 * et l'ancien index a supprimer. `index.created` et `legacyIndex.dropped` sont
 * poses par le script au moment ou il agit reellement (false = rien fait).
 */
function buildJournal({ runId, target, updates, now = new Date() }) {
  return {
    runId,
    createdAt: now.toISOString(),
    target: target ? { kind: target.kind, dbName: target.dbName, fingerprint: target.fingerprint } : {},
    status: 'planned',
    entries: (updates || []).map((update) => ({
      dossierId: update.dossierId,
      reference: update.reference,
      field: 'tenantId',
      from: update.from,
      to: update.to,
      userId: update.userId,
    })),
    index: { name: UNIQUE_INDEX_NAME, key: { ...UNIQUE_INDEX_KEY }, created: false },
    legacyIndex: { name: LEGACY_INDEX_NAME, key: { ...LEGACY_INDEX_KEY }, unique: false, dropped: false },
  };
}

/**
 * Plan de retour arriere, borne a ce que le run a reellement fait :
 *   - un dossier n'est restaure que si le run a applique son rattachement
 *     (entree applied !== false) et s'il porte encore la valeur appliquee
 *     ('restore') ; non applique par le run, deja restaure, modifie depuis ou
 *     absent, il est ignore (idempotent, jamais d'ecrasement) ;
 *   - l'index compose n'est supprime que si le run l'a cree (index.created)
 *     et s'il existe encore ;
 *   - l'ancien index reference_1 n'est recree que si le run l'a supprime
 *     (legacyIndex.dropped) et s'il est encore absent.
 */
function planRollback({ journal, dossiers, indexes }) {
  const current = new Map(normalizeAll(dossiers).map((item) => [item.id, item.tenantId]));
  const restores = (journal && journal.entries ? journal.entries : []).map((entry) => {
    const exists = current.has(entry.dossierId);
    const value = current.get(entry.dossierId);
    let action = 'skip_changed';
    if (!exists) action = 'skip_missing';
    else if (entry.applied === false) action = 'skip_not_applied';
    else if (value === idStr(entry.from)) action = 'skip_already_restored';
    else if (value === idStr(entry.to)) action = 'restore';
    return { dossierId: entry.dossierId, from: value, to: idStr(entry.from), action };
  });
  const compound = findCompoundIndex(indexes);
  const indexCreated = Boolean(journal && journal.index && journal.index.created === true);
  const legacy = journal && journal.legacyIndex ? journal.legacyIndex : null;
  const legacyDropped = Boolean(legacy && legacy.dropped === true);
  return {
    restores,
    dropIndex: indexCreated && Boolean(compound),
    indexName: (compound || {}).name || UNIQUE_INDEX_NAME,
    recreateLegacyIndex: legacyDropped && !findLegacyReferenceIndex(indexes),
    legacyIndex: legacyDropped
      ? { name: legacy.name || LEGACY_INDEX_NAME, key: { ...(legacy.key || LEGACY_INDEX_KEY) }, unique: legacy.unique === true }
      : null,
  };
}

/** Arguments des scripts : --target=dev|test|preprod (ou "--target dev"), --apply, --run-id, --rollback, --out, --confirm-preprod. */
function parseMigrationArgs(argv) {
  const args = { target: null, confirmPreprod: false, apply: false, runId: null, rollback: null, out: null, help: false };
  const list = argv || [];
  const valueOf = (index) => (list[index + 1] && !list[index + 1].startsWith('--') ? list[index + 1] : null);
  for (let index = 0; index < list.length; index += 1) {
    const arg = list[index];
    const [name, inlineValue] = arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined];
    const value = () => (inlineValue !== undefined ? inlineValue : valueOf(index));
    switch (name) {
      case '--target': args.target = value(); break;
      case '--run-id': args.runId = value(); break;
      case '--rollback': args.rollback = value(); break;
      case '--out': args.out = value(); break;
      case '--apply': args.apply = true; break;
      case '--confirm-preprod': args.confirmPreprod = true; break;
      case '--help': case '-h': args.help = true; break;
      default: break;
    }
  }
  if (args.target !== null && !SCRIPT_TARGETS.includes(args.target)) {
    throw new Error(`--target invalide (${args.target}) : valeurs acceptees ${SCRIPT_TARGETS.join('|')}.`);
  }
  return args;
}

function buildDefaultRunId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `dossier-references-${stamp}`;
}

// ---------------------------------------------------------------------------
// Ciblage de base en REPLI, lorsque scripts/lib/dbTarget.js n'est pas encore
// disponible : memes regles (fichier par cible, base nommee explicitement,
// refus de la preproduction depuis un poste local sauf derogation explicite).
// ---------------------------------------------------------------------------

/** { dbName, fingerprint } d'une URI MongoDB sans jamais l'exposer. */
function describeMongoUri(uri) {
  const text = String(uri || '');
  const withoutQuery = text.split('?')[0];
  const afterScheme = withoutQuery.replace(/^[a-z+]+:\/\//i, '');
  const slash = afterScheme.indexOf('/');
  const dbName = slash >= 0 ? afterScheme.slice(slash + 1) : '';
  return {
    dbName: dbName || '(defaut)',
    fingerprint: crypto.createHash('sha256').update(text).digest('hex').slice(0, 12),
  };
}

function resolveFallbackEnvFile(target) {
  return { dev: '.env.development', test: '.env.test', preprod: '.env' }[target];
}

/**
 * Applique les garde-fous de ciblage et decrit la cible retenue, ou leve une
 * erreur explicite. `deploymentUri` est MONGODB_URI du fichier de deploiement
 * server/.env lorsqu'il existe (null sinon).
 */
function checkFallbackTarget({ target, uri, deploymentUri, env = {}, confirmPreprod = false }) {
  if (!SCRIPT_TARGETS.includes(target)) throw new Error(`--target obligatoire (${SCRIPT_TARGETS.join('|')}).`);
  if (!uri) throw new Error(`MONGODB_URI absent du fichier ${resolveFallbackEnvFile(target)}.`);
  const described = describeMongoUri(uri);
  const deployment = deploymentUri ? describeMongoUri(deploymentUri) : null;
  if (target === 'preprod') {
    if (!confirmPreprod) throw new Error('cible preprod : --confirm-preprod obligatoire.');
    if (env.KHEOPS_DB_OVERRIDE !== 'preprod') throw new Error('cible preprod : KHEOPS_DB_OVERRIDE=preprod obligatoire.');
    const reason = String(env.KHEOPS_DB_OVERRIDE_REASON || '').trim();
    if (!reason) throw new Error('cible preprod : KHEOPS_DB_OVERRIDE_REASON (motif non vide) obligatoire.');
    return { kind: 'preprod-override', dbName: described.dbName, fingerprint: described.fingerprint, override: { reason } };
  }
  if (deployment && deployment.fingerprint === described.fingerprint) {
    throw new Error('base de preproduction ciblee depuis un poste local : MONGODB_URI identique a server/.env (deploiement). Utiliser --target=preprod --confirm-preprod avec KHEOPS_DB_OVERRIDE=preprod et KHEOPS_DB_OVERRIDE_REASON.');
  }
  const expected = target === 'dev' ? 'dev' : 'test';
  if (described.dbName === '(defaut)' || !described.dbName.toLowerCase().includes(expected)) {
    throw new Error(`cible ${target} : le nom de la base doit contenir "${expected}" (ex. kheops2_${expected}), base actuelle : ${described.dbName}.`);
  }
  return { kind: target, dbName: described.dbName, fingerprint: described.fingerprint, override: null };
}

module.exports = {
  UNIQUE_INDEX_NAME,
  UNIQUE_INDEX_KEY,
  LEGACY_INDEX_NAME,
  LEGACY_INDEX_KEY,
  SCRIPT_TARGETS,
  idStr,
  parseReference,
  normalizeDossier,
  summarizeDossiers,
  findDuplicateReferences,
  planTenantAttachments,
  applyAttachments,
  buildIndexVerdict,
  findCompoundIndex,
  hasUniqueCompoundIndex,
  findLegacyReferenceIndex,
  describeIndexes,
  buildAuditReport,
  buildJournal,
  planRollback,
  parseMigrationArgs,
  buildDefaultRunId,
  describeMongoUri,
  resolveFallbackEnvFile,
  checkFallbackTarget,
};
