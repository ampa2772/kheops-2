// server/scripts/cleanup-zztest-data.js
//
// NETTOYAGE des donnees de recette ZZTEST sur des comptes de test passes
// explicitement. Les users, tenants, memberships et officeUsers de ces comptes
// sont TOUJOURS conserves (ils servent aux recettes futures) ; sont supprimes,
// pour chaque compte selectionne (user + ses cabinets) :
//   - les dossiers du cabinet ou detenus par le compte (UserDossier) et tout ce
//     qui les reference : liaisons (UserDossier, DossierContact, DossierPartie,
//     ContactPartie, ContactRole), parties, roles devenus inutilises, agenda
//     (DossierEventLink, AgendaEvent), CARPA (operations + journal), fiches
//     divorce, documents stockes et logiques (versions, copies, emplacements,
//     journal de synchronisation), editeur documentaire, courriers, liens de
//     messagerie, depenses rattachees, taches IA, relations v2 ; les factures
//     et sous-dossiers sont embarques dans le dossier ;
//   - les contacts du carnet du compte (Contact, ContactPM, ContactPMPublique)
//     dont le nom, la raison sociale ou l'email porte le prefixe (ZZTEST par
//     defaut), avec leurs sous-liaisons (personnes a charge, details et
//     notaire de mariage, representants legaux, contacts directs, documents de
//     fusion, liaisons User*). Les contacts du compte SANS prefixe sont listes
//     mais conserves, sauf --include-unprefixed.
//
// SECURITE :
//   - SIMULATION PAR DEFAUT : rien n'est ecrit sans --apply.
//   - Aucune ecriture de schema : autoIndex et autoCreate sont desactives
//     (mongoose.set global AVANT tout chargement de modele, et options de
//     connexion) pour que Model.init() ne cree ni collection ni index — en
//     particulier l'index unique { tenantId, reference } du modele Dossier,
//     dont la creation reste pilotee par scripts/migrate-dossier-references.js.
//   - Un compte dont l'email ne correspond pas a /^(zztest\.|verif\.compte\.local)/i
//     est refuse (sauf --allow-account-pattern) AVANT toute connexion ; un
//     compte introuvable interrompt le script avant toute lecture de donnees.
//   - Un objet rattache a un utilisateur, un cabinet, un dossier ou un contact
//     hors selection (contact partage, dossier co-detenu, partie ou role
//     partages...) n'est pas supprime : « conserve : dependance externe ».
//     Un dossier n'est jamais supprime tant qu'un objet conserve (evenement
//     d'agenda cree par un autre utilisateur ou partage avec un autre dossier)
//     le reference encore : le dossier est conserve et la dependance signalee.
//   - Un contact ZZTEST reference par le snapshot embarque d'un dossier
//     conserve (parties, contacts du dossier, avocats responsables) est
//     conserve, meme sans table de liaison.
//   - Objets de stockage distants (GCS, OneDrive, Google Drive) : le stockage
//     n'est JAMAIS appele ; les documents qui en referencent sont listes et le
//     dossier porteur est conserve pour traitement manuel.
//   - Aucune suppression sans filtre : chaque etape est un deleteMany sur une
//     liste explicite d'_id issue du plan.
//   - Rapport (--report) : le plan est ecrit AVANT la premiere suppression et
//     chaque etape appliquee y est ajoutee au fil de l'eau ; en cas d'erreur,
//     le rapport porte le plan complet et les etapes reellement executees.
//   - Controle d'orphelins sur le perimetre (liaisons vers des documents
//     supprimes, dossiers sans UserDossier, liaisons utilisateur sans contact)
//     AVANT (orphelins preexistants, listes dans before.orphans, jamais imputes
//     au nettoyage) et APRES --apply (seuls les orphelins nouveaux, ou une
//     relance a blanc trouvant encore des candidats, donnent le code 2).
//   - Cible obligatoire (--target=dev|test|preprod) via scripts/lib/dbTarget.js
//     (charge s'il existe ; une erreur de chargement remonte, pas de repli
//     silencieux) : le type de base resolu doit correspondre exactement a
//     --target (dev -> dev, test -> test, preprod -> preprod-override), sinon
//     refus avant toute connexion — une derogation KHEOPS_DB_OVERRIDE restee
//     dans le shell ne peut pas faire passer --target=dev sur la preproduction.
//     Si le module n'existe pas, repli : lecture du fichier
//     server/.env.development (dev), server/.env.test (test) ou server/.env
//     (preprod, avec --confirm-preprod ET KHEOPS_DB_OVERRIDE=preprod ET
//     KHEOPS_DB_OVERRIDE_REASON), refus si la base ne porte pas le nom attendu
//     ou si elle est la base de deploiement depuis un poste local.
//
// USAGE (depuis Kheops_2/server) :
//   Simulation :
//     node scripts/cleanup-zztest-data.js --target=dev --account zztest.recette.xxx@example.com
//   Plusieurs comptes (option repetable ou fichier JSON : ["email", ...],
//   [{ "email": "..." }], ou { "accounts": [...] }) :
//     node scripts/cleanup-zztest-data.js --target=test --account a@example.com --account b@example.com
//     node scripts/cleanup-zztest-data.js --target=test --accounts-file comptes-zztest.json
//   Rapport JSON avant/apres (sans donnee sensible : identifiants, noms ZZTEST, comptes) :
//     node scripts/cleanup-zztest-data.js --target=dev --account ... --report rapport-zztest.json
//   Application reelle :
//     node scripts/cleanup-zztest-data.js --target=dev --account ... --apply --report rapport-zztest.json
//   Preproduction (jamais sans decision explicite ; simulation d'abord) :
//     $env:KHEOPS_DB_OVERRIDE = "preprod" ; $env:KHEOPS_DB_OVERRIDE_REASON = "nettoyage recette 2026-09-05"
//     node scripts/cleanup-zztest-data.js --target=preprod --confirm-preprod --account ... --report rapport.json
//     ... puis la meme commande avec --apply, puis IMPERATIVEMENT :
//     Remove-Item Env:KHEOPS_DB_OVERRIDE, Env:KHEOPS_DB_OVERRIDE_REASON
//     (la derogation vaut pour toute la session du shell). Ne jamais copier
//     server/.env vers server/.env.development, et verifier qu'aucune variable
//     MONGODB_URI n'est posee dans le shell (elle primerait sur le fichier).
//   Autres options : --prefix ZZTEST (defaut), --include-unprefixed,
//   --allow-account-pattern, --verbose, --help.
//
// Codes de sortie : 0 succes ; 1 refus, erreur ou argument invalide ;
// 2 controle apres application non conforme (orphelins nouveaux ou candidats
// restants).
//
// Logique pure (selection, dependances, plan ordonne, orphelins, comparaison)
// dans scripts/lib/zztestCleanup.js, testee en memoire.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  DEFAULT_ACCOUNT_PATTERN,
  DEFAULT_PREFIX,
  ENTITIES,
  COLLECTIONS,
  idStr,
  refValues,
  validateAccounts,
  buildSelection,
  planCleanup,
  deletedIdsFromPlan,
  detectOrphans,
  compareSnapshots,
  summarizeSnapshot,
} = require('./lib/zztestCleanup');

const SERVER_DIR = path.join(__dirname, '..');
const DB_TARGET_PATH = path.join(__dirname, 'lib', 'dbTarget.js');
const SCRIPT_PURPOSE = 'cleanup-zztest';
const TARGETS = ['dev', 'test', 'preprod'];
const QUERY_CHUNK = 500;
const MAX_LOAD_ROUNDS = 40;
// Identifiants acceptes dans un filtre sur un champ ObjectId : la forme
// hexadecimale de 24 caracteres uniquement (ObjectId.isValid accepte aussi
// toute chaine de 12 octets, ce qui laisserait passer des identifiants
// textuels de relations v2 vers une requete sur _id).
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;
const SCHEMA_SIDE_EFFECT_OPTIONS = Object.freeze({ autoIndex: false, autoCreate: false });

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const HELP = `Usage : node scripts/cleanup-zztest-data.js --target=dev|test|preprod (--account <email> ... | --accounts-file <json>) [options]
Options :
  --apply                   applique les suppressions (simulation par defaut)
  --report <chemin>         ecrit un rapport JSON avant/apres
  --prefix <PREFIXE>        prefixe des contacts a supprimer (defaut ${DEFAULT_PREFIX})
  --include-unprefixed      supprime aussi les contacts du compte sans prefixe
  --allow-account-pattern   accepte un compte dont l'email n'est pas un compte de test
  --confirm-preprod         requis avec --target=preprod (plus KHEOPS_DB_OVERRIDE=preprod et KHEOPS_DB_OVERRIDE_REASON)
  --verbose                 detaille chaque objet du plan
  --help                    affiche cette aide`;

/** Analyse les arguments ; leve une erreur explicite sur un argument invalide. */
function parseArgs(argv) {
  const options = {
    accounts: [],
    accountsFile: null,
    apply: false,
    report: null,
    prefix: DEFAULT_PREFIX,
    includeUnprefixed: false,
    allowAccountPattern: false,
    target: null,
    confirmPreprod: false,
    verbose: false,
    help: false,
  };
  const items = [...argv];
  const takeValue = (name) => {
    const value = items.shift();
    if (value === undefined || value.startsWith('--')) throw new Error(`Argument ${name} : valeur manquante.`);
    return value;
  };
  while (items.length) {
    const item = items.shift();
    const eq = item.indexOf('=');
    const name = eq === -1 ? item : item.slice(0, eq);
    const inline = eq === -1 ? null : item.slice(eq + 1);
    const value = () => (inline !== null ? inline : takeValue(name));
    switch (name) {
      case '--account': options.accounts.push(value()); break;
      case '--accounts-file': options.accountsFile = value(); break;
      case '--apply': options.apply = true; break;
      case '--report': options.report = value(); break;
      case '--prefix': options.prefix = value(); break;
      case '--include-unprefixed': options.includeUnprefixed = true; break;
      case '--allow-account-pattern': options.allowAccountPattern = true; break;
      case '--target': options.target = value(); break;
      case '--confirm-preprod': options.confirmPreprod = true; break;
      case '--verbose': options.verbose = true; break;
      case '--help': case '-h': options.help = true; break;
      default: throw new Error(`Argument inconnu : ${item}`);
    }
  }
  if (options.help) return options;
  if (!options.target) throw new Error('--target=dev|test|preprod est obligatoire.');
  if (!TARGETS.includes(options.target)) throw new Error(`--target invalide : ${options.target} (attendu : ${TARGETS.join('|')}).`);
  if (!String(options.prefix || '').trim()) throw new Error('--prefix ne peut pas etre vide.');
  return options;
}

/** Lit le fichier de comptes (tableau d'emails, d'objets { email } ou { accounts: [...] }). */
function readAccountsFile(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.accounts) ? raw.accounts : null;
  if (!list) throw new Error(`Fichier de comptes ${filePath} : tableau d'emails ou { "accounts": [...] } attendu.`);
  return list.map((item) => (typeof item === 'string' ? item : item && item.email)).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Cible de base : lib/dbTarget.js si present, sinon repli local
// ---------------------------------------------------------------------------

/** Nom de base et empreinte d'une URI Mongo, sans jamais exposer l'URI. */
function describeMongoUri(uri) {
  const text = String(uri || '');
  const withoutQuery = text.split('?')[0];
  const afterHost = withoutQuery.replace(/^[a-z+]+:\/\/[^/]*/i, '');
  const dbName = afterHost.startsWith('/') && afterHost.length > 1 ? afterHost.slice(1) : '(defaut)';
  const fingerprint = crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
  return { dbName, fingerprint };
}

function readEnvFile(filePath) {
  const dotenv = require('dotenv');
  return dotenv.parse(fs.readFileSync(filePath));
}

/**
 * Repli lorsque scripts/lib/dbTarget.js n'existe pas : resout l'URI a partir
 * du fichier d'environnement de la cible, avec les memes gardes de principe
 * (nom de base explicite, refus de la base de deploiement hors preprod).
 * Ne se connecte pas.
 */
function resolveFallbackTarget({ options, env = process.env, serverDir = SERVER_DIR }) {
  const files = { dev: '.env.development', test: '.env.test', preprod: '.env' };
  const expected = { dev: 'dev', test: 'test' };
  const { target } = options;
  if (target === 'preprod') {
    if (!options.confirmPreprod) throw new Error('Cible preprod refusee : --confirm-preprod est requis.');
    if (env.KHEOPS_DB_OVERRIDE !== 'preprod') throw new Error('Cible preprod refusee : KHEOPS_DB_OVERRIDE=preprod est requis.');
    if (!String(env.KHEOPS_DB_OVERRIDE_REASON || '').trim()) throw new Error('Cible preprod refusee : KHEOPS_DB_OVERRIDE_REASON doit expliquer la raison.');
  }
  const filePath = path.join(serverDir, files[target]);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fichier ${files[target]} introuvable dans ${serverDir} (cible ${target}). Copier .env.development.example ou definir la cible.`);
  }
  const parsed = readEnvFile(filePath);
  const uri = parsed.MONGODB_URI;
  if (!uri) throw new Error(`MONGODB_URI absent de ${files[target]}.`);
  const { dbName, fingerprint } = describeMongoUri(uri);
  if (expected[target] && !dbName.toLowerCase().includes(expected[target])) {
    throw new Error(`Cible ${target} refusee : la base doit porter un nom explicite contenant "${expected[target]}" (base=${dbName}).`);
  }
  const deploymentFile = path.join(serverDir, '.env');
  let deploymentFingerprint = null;
  if (fs.existsSync(deploymentFile)) {
    const deployment = readEnvFile(deploymentFile);
    if (deployment.MONGODB_URI) deploymentFingerprint = describeMongoUri(deployment.MONGODB_URI).fingerprint;
  }
  if (target !== 'preprod' && deploymentFingerprint && deploymentFingerprint === fingerprint) {
    throw new Error('Refus : base de preproduction ciblee depuis un poste local (empreinte identique a server/.env).');
  }
  const kind = target === 'preprod' ? 'preprod-override' : target;
  return {
    uri,
    kind,
    dbName,
    fingerprint,
    deploymentFingerprint,
    override: target === 'preprod' ? { reason: String(env.KHEOPS_DB_OVERRIDE_REASON) } : null,
  };
}

/**
 * Module partage scripts/lib/dbTarget.js : charge s'il existe (toute erreur de
 * chargement — dependance config/env ou config/mongoTarget absente — remonte
 * telle quelle), null s'il n'existe pas encore (repli local).
 */
function loadDbTarget(dbTargetPath = DB_TARGET_PATH) {
  if (!fs.existsSync(dbTargetPath)) return null;
  return require(dbTargetPath); // eslint-disable-line global-require
}

/**
 * Desactive globalement la creation automatique de collections et d'index :
 * a appeler AVANT toute connexion et AVANT tout chargement de modele, pour que
 * Model.init() (Mongoose 7 : createCollection puis ensureIndexes, options
 * lues dans le schema, la connexion puis mongoose.options) reste sans effet.
 */
function disableSchemaSideEffects(mongoose) {
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
}

/** Type de base attendu pour une cible : dev -> dev, test -> test, preprod -> preprod-override. */
function expectedKindFor(target) {
  return target === 'preprod' ? 'preprod-override' : target;
}

async function connect({ options, env = process.env, log, serverDir = SERVER_DIR, dbTargetPath = DB_TARGET_PATH }) {
  const mongoose = require('mongoose'); // eslint-disable-line global-require
  disableSchemaSideEffects(mongoose);
  const dbTarget = loadDbTarget(dbTargetPath);
  const argv = [`--target=${options.target}`, ...(options.confirmPreprod ? ['--confirm-preprod'] : [])];
  if (dbTarget && typeof dbTarget.connectForScript === 'function') {
    // Resolution AVANT connexion (mise en cache par objet env : connectForScript
    // ne relit rien) et controle strict du type de base resolu.
    const resolved = dbTarget.resolveScriptTarget({ argv, env, serverDir });
    const expectedKind = expectedKindFor(options.target);
    if (resolved.kind !== expectedKind) {
      const file = options.target === 'dev' ? '.env.development' : options.target === 'test' ? '.env.test' : '.env';
      throw new Error(`Cible incoherente : --target=${options.target} mais la base resolue est de type ${resolved.kind} `
        + `(base=${resolved.dbName}, empreinte=${resolved.fingerprint}, attendu ${expectedKind}). `
        + `Verifier server/${file} et retirer KHEOPS_DB_OVERRIDE / KHEOPS_DB_OVERRIDE_REASON du shell `
        + '(Remove-Item Env:KHEOPS_DB_OVERRIDE, Env:KHEOPS_DB_OVERRIDE_REASON).');
    }
    const { target } = await dbTarget.connectForScript({
      argv,
      env,
      serverDir,
      purpose: SCRIPT_PURPOSE,
      mongooseInstance: mongoose,
      connectOptions: { ...SCHEMA_SIDE_EFFECT_OPTIONS },
    });
    return { target, mongoose, via: 'dbTarget' };
  }
  const target = resolveFallbackTarget({ options, env, serverDir });
  if (target.kind === 'preprod-override') {
    log('');
    log('***********************************************************************');
    log(`*** ATTENTION : base de PREPRODUCTION ciblee (${target.dbName}) — raison : ${target.override.reason}`);
    log('***********************************************************************');
  }
  log(`[DB] script=${SCRIPT_PURPOSE} cible=${target.kind} base=${target.dbName} empreinte=${target.fingerprint} (repli sans lib/dbTarget)`);
  await mongoose.connect(target.uri, { ...SCHEMA_SIDE_EFFECT_OPTIONS });
  return { target: { kind: target.kind, dbName: target.dbName, fingerprint: target.fingerprint }, mongoose, via: 'fallback' };
}

// ---------------------------------------------------------------------------
// Chargement borne de l'instantane
// ---------------------------------------------------------------------------

/**
 * Compile les modeles du registre (plus User et Tenant, jamais supprimes).
 * autoIndex/autoCreate sont (re)desactives juste avant : un modele compile
 * apres la connexion ne doit creer ni collection ni index.
 */
function loadModels({ mongoose = require('mongoose') } = {}) { // eslint-disable-line global-require
  disableSchemaSideEffects(mongoose);
  const models = {};
  for (const entry of COLLECTIONS) {
    models[entry.key] = require(path.join(SERVER_DIR, 'models', entry.modelPath)); // eslint-disable-line global-require
  }
  models.User = require(path.join(SERVER_DIR, 'models', 'App_Users', 'User')); // eslint-disable-line global-require
  models.Tenant = require(path.join(SERVER_DIR, 'models', 'Cabinet', 'Tenant')); // eslint-disable-line global-require
  return models;
}

/** Vrai pour un identifiant utilisable dans un filtre sur un champ ObjectId. */
function isObjectIdString(id) {
  return OBJECT_ID_PATTERN.test(String(id || ''));
}

function chunk(list, size) {
  const chunks = [];
  for (let index = 0; index < list.length; index += size) chunks.push(list.slice(index, index + size));
  return chunks;
}

/**
 * Charge, par requetes filtrees sur des identifiants connus, toutes les
 * lignes utiles a la planification : les entites ancrees (dossiers, contacts)
 * ne sont decouvertes que par la selection (cabinets, liaisons utilisateur),
 * les entites secondaires par les liaisons « child » et les documents
 * embarques. Aucune lecture non filtree.
 */
async function loadSnapshot({ models, selection, seeds = {}, log, isObjectId = isObjectIdString }) {
  const known = new Map();
  const ensure = (entity) => { if (!known.has(entity)) known.set(entity, new Set()); return known.get(entity); };
  for (const id of selection.userIds) ensure('user').add(id);
  for (const id of selection.tenantIds) ensure('tenant').add(id);
  for (const [entity, ids] of Object.entries(seeds)) for (const id of ids || []) if (idStr(id)) ensure(entity).add(idStr(id));

  const rows = new Map();
  for (const entry of COLLECTIONS) rows.set(entry.key, new Map());
  const queried = new Map();
  let queries = 0;

  const pending = (slot, entity) => {
    if (!queried.has(slot)) queried.set(slot, new Set());
    const done = queried.get(slot);
    const ids = [...ensure(entity)].filter((id) => !done.has(id));
    for (const id of ids) done.add(id);
    return ids;
  };
  const addKnown = (entity, value) => {
    const id = idStr(value);
    if (!id) return false;
    const set = ensure(entity);
    if (set.has(id)) return false;
    set.add(id);
    return true;
  };
  const absorb = (entry, docs, expandAnchored) => {
    let added = false;
    const map = rows.get(entry.key);
    for (const doc of docs) {
      const id = idStr(doc._id);
      if (!id) continue;
      if (!map.has(id)) map.set(id, doc);
      if (entry.entity && (!ENTITIES[entry.entity].anchored || expandAnchored) && addKnown(entry.entity, id)) added = true;
      for (const reference of entry.refs) {
        const meta = ENTITIES[reference.entity];
        const follow = reference.policy === 'child' || (meta.anchored && !meta.selection && expandAnchored);
        if (!follow) continue;
        for (const value of refValues(doc, reference)) if (addKnown(reference.entity, value)) added = true;
      }
      if (entry.derive) {
        for (const [entity, ids] of Object.entries(entry.derive(doc))) for (const value of ids) if (addKnown(entity, value)) added = true;
      }
    }
    return added;
  };
  const find = async (Model, field, ids, entry, stringIds) => {
    const valid = stringIds ? ids : ids.filter((id) => isObjectId(id));
    const docs = [];
    for (const part of chunk(valid, QUERY_CHUNK)) {
      const filter = { [field]: { $in: part } };
      if (entry.typeField) filter[entry.typeField] = { $in: entry.types };
      queries += 1;
      docs.push(...await Model.find(filter).select(entry.select || undefined).lean());
    }
    return docs;
  };

  for (let round = 0; round < MAX_LOAD_ROUNDS; round += 1) {
    let added = false;
    for (const entry of COLLECTIONS) {
      const Model = models[entry.key];
      if (entry.entity && ENTITIES[entry.entity].key === entry.key) {
        const ids = pending(`${entry.key}|_id`, entry.entity);
        if (ids.length && absorb(entry, await find(Model, '_id', ids, entry, false), false)) added = true;
      }
      for (const reference of entry.refs) {
        if (!reference.load) continue;
        const slot = `${entry.key}|${reference.field}|${(reference.types || []).join('/')}`;
        const ids = pending(slot, reference.entity);
        if (!ids.length) continue;
        const docs = await find(Model, reference.field, ids, { ...entry, typeField: reference.typeField, types: reference.types }, reference.idType === 'string');
        if (absorb(entry, docs, ENTITIES[reference.entity].selection === true)) added = true;
      }
    }
    if (!added) {
      const snapshot = {};
      for (const entry of COLLECTIONS) snapshot[entry.key] = [...rows.get(entry.key).values()];
      log(`[lecture] ${queries} requete(s) filtrees, ${round + 1} passe(s).`);
      return snapshot;
    }
  }
  throw new Error(`Chargement non borne apres ${MAX_LOAD_ROUNDS} passes : abandon.`);
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

/** Suppression par liste explicite d'identifiants : refuse tout filtre vide. */
async function deleteByIds(Model, ids) {
  if (!Array.isArray(ids) || !ids.length) throw new Error('deleteByIds : liste d identifiants vide, suppression refusee.');
  let deletedCount = 0;
  for (const part of chunk(ids, QUERY_CHUNK)) {
    const result = await Model.deleteMany({ _id: { $in: part } });
    deletedCount += result.deletedCount || 0;
  }
  return deletedCount;
}

/**
 * Applique le plan etape par etape ; onStep est appele des qu'une etape est
 * terminee (le rapport la consigne aussitot : en cas d'echec au milieu, les
 * etapes deja executees sont connues).
 */
async function applyPlan({ plan, models, log, onStep = () => {} }) {
  const executed = [];
  for (const step of plan.steps) {
    const deletedCount = await deleteByIds(models[step.key], step.ids);
    const done = { key: step.key, model: step.model, requested: step.ids.length, deletedCount };
    executed.push(done);
    onStep(done);
    log(`  - ${step.model} : ${deletedCount}/${step.ids.length} supprime(s)`);
  }
  return executed;
}

// ---------------------------------------------------------------------------
// Sortie et rapport
// ---------------------------------------------------------------------------

function nonZero(counts) {
  return Object.entries(counts).filter(([, count]) => count > 0).map(([key, count]) => `${key}=${count}`).join(', ') || 'aucune';
}

function printPlan(plan, { verbose, log }) {
  log(`Dossiers : ${plan.dossiers.candidates} candidat(s), ${plan.dossiers.delete.length} a supprimer, ${plan.dossiers.keep.length} conserve(s).`);
  for (const item of plan.dossiers.keep) log(`  conserve dossier ${item.id} ref=${item.reference} « ${item.nom} » : ${item.reasons.join(' ; ')}`);
  if (verbose) for (const item of plan.dossiers.delete) log(`  supprime dossier ${item.id} ref=${item.reference} « ${item.nom} »`);
  log(`Contacts : ${plan.contacts.candidates} candidat(s), ${plan.contacts.delete.length} a supprimer, ${plan.contacts.keep.length} conserve(s), ${plan.contacts.unprefixed.length} sans prefixe (listes, conserves).`);
  for (const item of plan.contacts.keep) log(`  conserve ${item.kind} ${item.id} « ${item.label} » : ${item.reasons.join(' ; ')}`);
  if (verbose) {
    for (const item of plan.contacts.delete) log(`  supprime ${item.kind} ${item.id} « ${item.label} »`);
    // Contacts sans prefixe : identifiant et type seulement, leur nom n'est
    // pas une donnee de recette (meme regle que publicPlan).
    for (const item of plan.contacts.unprefixed) log(`  liste ${item.kind} ${item.id} (sans prefixe, conserve)`);
  }
  for (const [key, group] of Object.entries(plan.entities)) {
    for (const item of group.keep) log(`  conserve ${key} ${item.id} : ${item.reasons.join(' ; ')}`);
  }
  if (plan.storage.length) {
    log(`Objets de stockage references (NON traites, stockage jamais appele) : ${plan.storage.length}`);
    for (const item of plan.storage) log(`  ${item.model} ${item.id} dossier=${item.dossierId} objets=${item.objects}`);
  }
  log(`Plan : ${plan.summary.totalRows} ligne(s) sur ${plan.steps.length} collection(s) : ${nonZero(plan.summary.byCollection)}.`);
}

// Forme du plan dans le rapport : identifiants, noms des dossiers et contacts
// ZZTEST, comptes. Les contacts sans prefixe (non supprimes) n'y figurent que
// par identifiant et type : leur nom n'est pas une donnee de recette.
function publicPlan(plan) {
  return {
    dossiers: plan.dossiers,
    contacts: { ...plan.contacts, unprefixed: plan.contacts.unprefixed.map(({ id, kind }) => ({ id, kind })) },
    entities: plan.entities,
    storage: plan.storage,
    steps: plan.steps.map((step) => ({ order: step.order, key: step.key, model: step.model, count: step.ids.length, ids: step.ids })),
    summary: plan.summary,
  };
}

function writeReport(filePath, report) {
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------

const orphanKey = (orphan) => `${orphan.collection}:${orphan.id}:${orphan.field || ''}:${orphan.target || ''}:${orphan.reason}`;

/**
 * Programme principal. deps (tests uniquement) permet de remplacer la
 * connexion, le chargement des modeles et le journal sans base reelle.
 */
async function main(argv = process.argv.slice(2), env = process.env, deps = {}) {
  const log = deps.log || ((...args) => console.log(...args));
  const connectImpl = deps.connect || connect;
  const loadModelsImpl = deps.loadModels || loadModels;
  const isObjectId = deps.isObjectId || isObjectIdString;
  const options = parseArgs(argv);
  if (options.help) { log(HELP); return 0; }

  const requestedEmails = [...options.accounts, ...(options.accountsFile ? readAccountsFile(options.accountsFile) : [])];
  if (!requestedEmails.length) throw new Error('Aucun compte : utiliser --account <email> (repetable) ou --accounts-file <json>.');

  const report = {
    script: SCRIPT_PURPOSE,
    generatedAt: new Date().toISOString(),
    mode: options.apply ? 'application' : 'simulation',
    options: { prefix: options.prefix, includeUnprefixed: options.includeUnprefixed, allowAccountPattern: options.allowAccountPattern, target: options.target },
    requestedAccounts: requestedEmails.map((email) => String(email).trim().toLowerCase()),
    status: 'en cours',
  };
  const finish = (status, code) => {
    report.status = status;
    if (options.report) { writeReport(options.report, report); log(`Rapport ecrit : ${options.report}`); }
    return code;
  };

  log('==============================================================');
  log(`  Nettoyage ZZTEST — mode ${options.apply ? 'APPLICATION (suppressions reelles)' : 'SIMULATION (aucune ecriture)'}`);
  log('==============================================================');

  // 0. Motif des comptes : refus AVANT toute connexion (donc avant toute
  //    derogation preprod et toute lecture de users/tenants).
  const offPattern = options.allowAccountPattern
    ? []
    : [...new Set(report.requestedAccounts)].filter((email) => !DEFAULT_ACCOUNT_PATTERN.test(email));
  if (offPattern.length) {
    report.accounts = [];
    report.rejected = offPattern.map((email) => ({ email, reason: 'email hors motif autorise (utiliser --allow-account-pattern pour forcer)' }));
    for (const item of report.rejected) log(`REFUS ${item.email} : ${item.reason}`);
    log('Au moins un compte est hors motif : abandon sans connexion a la base.');
    return finish('refuse', 1);
  }

  let mongoose = null;
  try {
    const connection = await connectImpl({ options, env, log });
    mongoose = connection.mongoose;
    report.target = { kind: connection.target.kind, dbName: connection.target.dbName, fingerprint: connection.target.fingerprint };
    const models = loadModelsImpl({ mongoose });

    // 1. Comptes : refus strict avant toute lecture de donnees.
    const users = await models.User.find({ email: { $in: requestedEmails.map((email) => new RegExp(`^${email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) } })
      .select('_id email tenantId').lean();
    const tenants = await models.Tenant.find({
      $or: [
        { _id: { $in: users.map((u) => u.tenantId).filter(Boolean) } },
        { ownerUserId: { $in: users.map((u) => u._id) } },
      ],
    }).select('_id ownerUserId').lean();
    const validation = validateAccounts({ requestedEmails, users, tenants, allowAccountPattern: options.allowAccountPattern });
    report.accounts = validation.accounts;
    report.rejected = validation.rejected;
    if (validation.rejected.length) {
      for (const item of validation.rejected) log(`REFUS ${item.email} : ${item.reason}`);
      log('Au moins un compte est refuse : abandon sans lecture des donnees.');
      return finish('refuse', 1);
    }
    if (!validation.accounts.length) throw new Error('Aucun compte valide.');
    const selection = buildSelection(validation.accounts);
    for (const account of selection.accounts) log(`Compte ${account.email} : user=${account.userId} cabinets=[${account.tenantIds.join(', ')}]`);

    // 2. Instantane avant, orphelins preexistants (jamais imputes au
    //    nettoyage) et plan.
    const before = await loadSnapshot({ models, selection, log, isObjectId });
    const orphansBefore = detectOrphans({ snapshot: before, selection, deleted: {} });
    report.before = { counts: summarizeSnapshot(before), orphans: orphansBefore };
    if (orphansBefore.length) {
      log(`Orphelins preexistants sur le perimetre (etat anterieur au nettoyage) : ${orphansBefore.length}`);
      for (const orphan of orphansBefore) log(`  ORPHELIN PREEXISTANT ${orphan.model} ${orphan.id} : ${orphan.reason}${orphan.target ? ` -> ${orphan.target}` : ''}`);
    }
    const plan = planCleanup({ selection, snapshot: before, prefix: options.prefix, includeUnprefixed: options.includeUnprefixed });
    printPlan(plan, { verbose: options.verbose, log });
    report.plan = publicPlan(plan);

    if (!options.apply) {
      log('\nSIMULATION : rien n a ete ecrit. Relancer avec --apply pour appliquer ce plan.');
      return finish('simulation', 0);
    }
    if (!plan.steps.length) {
      log('\nRien a supprimer : base deja propre pour cette selection.');
      report.apply = { steps: [] };
      return finish('rien-a-faire', 0);
    }

    // 3. Application par listes d'identifiants (plan ecrit avant la premiere
    //    suppression, etapes consignees au fil de l'eau), puis controles.
    log('\nAPPLICATION :');
    report.apply = { steps: [] };
    if (options.report) writeReport(options.report, report);
    await applyPlan({ plan, models, log, onStep: (step) => { report.apply.steps.push(step); } });

    const deleted = deletedIdsFromPlan(plan);
    const after = await loadSnapshot({ models, selection, seeds: deleted, log, isObjectId });
    const orphans = detectOrphans({ snapshot: after, selection, deleted });
    const known = new Set(orphansBefore.map(orphanKey));
    const newOrphans = orphans.filter((orphan) => !known.has(orphanKey(orphan)));
    const rerun = planCleanup({ selection, snapshot: after, prefix: options.prefix, includeUnprefixed: options.includeUnprefixed });
    report.after = {
      counts: summarizeSnapshot(after),
      diff: compareSnapshots(before, after),
      orphans,
      newOrphans,
      rerun: { totalRows: rerun.summary.totalRows, byCollection: rerun.summary.byCollection, dossiers: rerun.dossiers.delete.length, contacts: rerun.contacts.delete.length },
    };
    log(`\nControle apres application : ${orphans.length} orphelin(s) dont ${newOrphans.length} nouveau(x), relance a blanc = ${rerun.summary.totalRows} candidat(s).`);
    for (const orphan of orphans) {
      const tag = known.has(orphanKey(orphan)) ? 'ORPHELIN PREEXISTANT' : 'ORPHELIN';
      log(`  ${tag} ${orphan.model} ${orphan.id} : ${orphan.reason}${orphan.target ? ` -> ${orphan.target}` : ''}`);
    }
    if (newOrphans.length || rerun.summary.totalRows > 0) {
      log('Controle NON conforme : examiner le rapport avant toute nouvelle action.');
      return finish('controle-non-conforme', 2);
    }
    log('Controle conforme : aucun orphelin nouveau, aucun candidat restant.');
    return finish('applique', 0);
  } catch (err) {
    report.error = err && err.message ? err.message : String(err);
    finish('erreur', 1);
    throw err;
  } finally {
    if (mongoose) await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }).catch((err) => {
    console.error(`[${SCRIPT_PURPOSE}] ERREUR : ${err && err.message ? err.message : err}`);
    process.exitCode = 1;
  });
}

module.exports = {
  HELP,
  TARGETS,
  DB_TARGET_PATH,
  OBJECT_ID_PATTERN,
  SCHEMA_SIDE_EFFECT_OPTIONS,
  parseArgs,
  readAccountsFile,
  describeMongoUri,
  resolveFallbackTarget,
  loadDbTarget,
  disableSchemaSideEffects,
  expectedKindFor,
  connect,
  loadModels,
  isObjectIdString,
  loadSnapshot,
  deleteByIds,
  applyPlan,
  printPlan,
  publicPlan,
  main,
};
