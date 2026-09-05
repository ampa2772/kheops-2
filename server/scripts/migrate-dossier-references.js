#!/usr/bin/env node
// server/scripts/migrate-dossier-references.js
//
// MIGRATION vers l'unicite des references de dossier PAR CABINET (regle
// canonique en tete de server/utils/dossierReference.js). Aucune reference
// n'est renumerotee.
//
// Etapes (logique pure dans ./lib/dossierReferenceMigration.js) :
//   1. rattacher le tenantId des dossiers sans cabinet a partir de
//      UserDossier -> User.tenantId (un seul utilisateur proprietaire ;
//      sinon laisser et signaler), chaque changement etant journalise avec
//      son ancienne valeur dans scripts/journals/<run-id>.json ;
//   2. verifier l'absence de doublon (tenantId, reference) sur l'etat obtenu
//      (abandon sinon : liste deterministe, rien n'est ecrase) ;
//   3. creer EXPLICITEMENT l'index unique compose { tenantId: 1, reference: 1 }
//      (createIndex idempotent, journalise dans index.created) ;
//   4. supprimer l'ancien index non unique reference_1 (journalise dans
//      legacyIndex.dropped) : le nouveau modele ne le declare plus et l'index
//      compose sert les lectures par cabinet.
//
// ORDRE D'EXPLOITATION (imperatif) :
//   a. audit    : node scripts/audit-dossier-references.js --target=<cible>
//                 -> verdict "index unique creable : oui" attendu ;
//   b. migrer   : node scripts/migrate-dossier-references.js --target=<cible> --apply --run-id=<id>
//                 AVANT de mettre en ligne la version dont le modele Dossier
//                 declare l'index unique. Raison : a la connexion, Mongoose
//                 (autoIndex) tenterait de creer l'index lui-meme et un echec
//                 (doublon apparu entre-temps) resterait SANS journal de son
//                 cote (Model.init() est intercepte des la compilation du
//                 modele ; seul l'ecouteur 'index' du modele Dossier le trace).
//                 La migration, elle, refuse d'avancer tant qu'un doublon
//                 existe et journalise chaque etape ;
//   c. deployer la nouvelle version ;
//   d. controle : relancer l'audit et exiger index.composeUniquePresent === true.
//
// RETOUR ARRIERE (--rollback=<run-id> [--apply]) : borne au perimetre du run
// annule. Il restaure les anciennes valeurs de tenantId (uniquement les
// entrees que le run a appliquees et dont le dossier porte encore la valeur
// appliquee), supprime l'index compose seulement si le run l'a cree
// (index.created) et recree l'ancien index reference_1 seulement si le run
// l'a supprime (legacyIndex.dropped). Il ne detruit aucune donnee.
// ATTENTION : execute pendant que la version portant le nouveau modele est
// servie, il est annule au redemarrage suivant (autoIndex recree l'index
// compose) ; il n'a de sens qu'accompagne du retour a la revision precedente
// (dont le modele redeclare reference_1, recree par autoIndex).
//
// SECURITE : DRY-RUN par defaut (aucune ecriture). --apply pour ecrire.
//   Previsualiser : node scripts/migrate-dossier-references.js --target=dev
//   Appliquer     : node scripts/migrate-dossier-references.js --target=dev --apply --run-id=dossier-references-20260905-01
//   Retour arriere: node scripts/migrate-dossier-references.js --target=dev --rollback=dossier-references-20260905-01 [--apply]
//   Preproduction : --target=preprod --confirm-preprod, avec KHEOPS_DB_OVERRIDE=preprod
//                   et KHEOPS_DB_OVERRIDE_REASON="..." dans l'environnement.
//
// Idempotent : relancable sans degat (dossiers deja rattaches ignores, index
// compose deja present conserve, ancien index deja absent ignore). Connexion
// avec autoIndex:false et autoCreate:false (voir audit-dossier-references.js) :
// aucun index ni collection n'est cree par le simple chargement des modeles ;
// seules les etapes 3 et 4 touchent aux index, explicitement.
//
// Codes de sortie : 0 succes ou dry-run, 1 erreur, 2 abandon pour doublons.

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const lib = require('./lib/dossierReferenceMigration');
const { connect, readDossierState, readIndexes } = require('./audit-dossier-references');

// Repertoire des journaux (ignore par git, voir journals/.gitignore) ;
// redirigeable par KHEOPS_MIGRATION_JOURNALS_DIR (tests, archivage).
const JOURNALS_DIR = process.env.KHEOPS_MIGRATION_JOURNALS_DIR || path.join(__dirname, 'journals');
const USAGE = [
  'Usage : node scripts/migrate-dossier-references.js --target=dev|test|preprod [--apply] [--run-id=<id>] [--rollback=<run-id>] [--confirm-preprod]',
  '  DRY-RUN par defaut. --target obligatoire ; preprod exige --confirm-preprod,',
  '  KHEOPS_DB_OVERRIDE=preprod et KHEOPS_DB_OVERRIDE_REASON.',
].join('\n');

const log = (...parts) => console.log(...parts);
const toObjectId = (value) => (value ? new mongoose.Types.ObjectId(String(value)) : null);
const journalPath = (runId) => path.join(JOURNALS_DIR, `${runId}.json`);

function writeJournal(filePath, journal) {
  fs.mkdirSync(JOURNALS_DIR, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(journal, null, 2)}\n`);
}

function readJournal(runId) {
  const filePath = journalPath(runId);
  if (!fs.existsSync(filePath)) throw new Error(`journal introuvable pour le run ${runId} : ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function printAttachments(plan) {
  log(`— Etape 1 : ${plan.updates.length} rattachement(s) de cabinet, ${plan.unresolved.length} dossier(s) sans cabinet laisse(s), ${plan.dejaRattaches} deja rattache(s).`);
  for (const update of plan.updates) {
    log(`   ${update.dossierId} (${update.reference}) : tenantId ${update.from} -> ${update.to} (utilisateur ${update.userId})`);
  }
  for (const item of plan.unresolved) {
    const candidates = item.candidates.map((candidate) => `${candidate.userId}->${candidate.tenantId}`).join(', ');
    console.warn(`   laisse : ${item.dossierId} (${item.reference}) motif=${item.reason}${candidates ? ` candidats=[${candidates}]` : ''}`);
  }
}

function printDuplicates(duplicates) {
  console.error(`— Etape 2 : ${duplicates.length} doublon(s) (tenantId, reference) : ABANDON, rien n'est ecrit.`);
  const sorted = [...duplicates].sort((a, b) => `${a.tenantId}|${a.reference}`.localeCompare(`${b.tenantId}|${b.reference}`));
  for (const group of sorted) {
    console.error(`   cabinet=${group.tenantId} reference=${group.reference} dossiers=[${group.ids.join(', ')}]`);
  }
  console.error('   Plan : traiter chaque groupe a la main (conserver la reference du dossier le plus ancien, reattribuer les autres par l application), puis relancer.');
}

/** Previsualisation (dry-run) des etapes 3 et 4 : previent d'un blocage a l'--apply. */
function previewIndexSteps(indexes) {
  const existing = lib.findCompoundIndex(indexes);
  if (existing && !lib.hasUniqueCompoundIndex(indexes)) {
    console.warn(`— Etape 3 : un index ${existing.name} porte la cle { tenantId, reference } sans etre unique : le supprimer manuellement avant --apply (sinon --apply echouera apres avoir ecrit les rattachements).`);
  } else {
    log(`— Etape 3 : index unique ${lib.UNIQUE_INDEX_NAME} ${existing ? 'deja en place' : 'serait cree'}.`);
  }
  const legacy = lib.findLegacyReferenceIndex(indexes);
  log(`— Etape 4 : ancien index ${legacy ? `${legacy.name} { reference: 1 } serait supprime` : `${lib.LEGACY_INDEX_NAME} deja absent`}.`);
}

/** Cree explicitement l'index unique compose (idempotent) ; vrai si ce run l'a cree. */
async function ensureUniqueIndex(Dossier, indexes) {
  if (lib.hasUniqueCompoundIndex(indexes)) {
    log(`— Etape 3 : index unique ${lib.UNIQUE_INDEX_NAME} deja en place, conserve.`);
    return false;
  }
  const existing = lib.findCompoundIndex(indexes);
  if (existing) {
    throw new Error(`un index ${existing.name} porte deja la cle { tenantId, reference } sans etre unique : le supprimer manuellement avant de relancer.`);
  }
  await Dossier.collection.createIndex(lib.UNIQUE_INDEX_KEY, { unique: true, name: lib.UNIQUE_INDEX_NAME });
  log(`— Etape 3 : index unique ${lib.UNIQUE_INDEX_NAME} cree explicitement (createIndex).`);
  return true;
}

/** Supprime l'ancien index { reference: 1 } s'il existe ; renvoie sa description pour le journal, ou null. */
async function dropLegacyIndex(Dossier, indexes) {
  const legacy = lib.findLegacyReferenceIndex(indexes);
  if (!legacy) {
    log(`— Etape 4 : ancien index ${lib.LEGACY_INDEX_NAME} deja absent.`);
    return null;
  }
  await Dossier.collection.dropIndex(legacy.name);
  log(`— Etape 4 : ancien index ${legacy.name} { reference: 1 } supprime (recree par --rollback).`);
  return { name: legacy.name, key: { ...legacy.key }, unique: legacy.unique === true, dropped: true };
}

async function migrate({ args, target, runId }) {
  const apply = args.apply;
  const { Dossier, dossiers, links, users, indexes } = await readDossierState();
  const plan = lib.planTenantAttachments({ dossiers, links, users });
  printAttachments(plan);

  const afterAttachments = lib.applyAttachments(dossiers, plan.updates);
  const duplicates = lib.findDuplicateReferences(afterAttachments, { scope: 'cabinet' });
  if (duplicates.length) {
    printDuplicates(duplicates);
    process.exitCode = 2;
    return;
  }
  log('— Etape 2 : aucun doublon (tenantId, reference) apres rattachement.');

  if (!apply) {
    previewIndexSteps(indexes);
    log(`\nDRY-RUN : rien n'a ete ecrit. Relancer avec --apply --run-id=${runId} pour appliquer.`);
    return;
  }

  const filePath = journalPath(runId);
  if (fs.existsSync(filePath)) throw new Error(`run-id deja utilise (${filePath}) : choisir un autre --run-id.`);
  const journal = lib.buildJournal({ runId, target, updates: plan.updates });
  writeJournal(filePath, journal);
  log(`— Journal : ${filePath}`);

  let applied = 0;
  for (const entry of journal.entries) {
    // Filtre sur l'ancienne valeur : un dossier rattache entre-temps n'est pas
    // ecrase ; l'entree reste journalisee avec applied=false et le retour
    // arriere l'ignore (skip_not_applied).
    const result = await Dossier.updateOne(
      { _id: toObjectId(entry.dossierId), tenantId: null },
      { $set: { tenantId: toObjectId(entry.to) } },
    );
    entry.applied = (result.modifiedCount || 0) > 0;
    if (entry.applied) applied += 1;
    else console.warn(`   ${entry.dossierId} : non modifie (tenantId deja renseigne entre-temps).`);
  }
  journal.status = 'attachments_applied';
  writeJournal(filePath, journal);
  log(`   ${applied}/${journal.entries.length} rattachement(s) applique(s).`);

  // Verification defensive sur l'etat reel avant l'index.
  const fresh = await Dossier.find({}, { reference: 1, tenantId: 1 }).lean();
  const freshDuplicates = lib.findDuplicateReferences(fresh, { scope: 'cabinet' });
  if (freshDuplicates.length) {
    journal.status = 'aborted_duplicates';
    writeJournal(filePath, journal);
    printDuplicates(freshDuplicates);
    console.error(`   Les rattachements restent journalises ; --rollback=${runId} --apply les annule.`);
    process.exitCode = 2;
    return;
  }

  // Etapes 3 et 4 : chaque action est journalisee des qu'elle est faite, pour
  // que le retour arriere ne defasse que ce qui a reellement ete fait.
  try {
    journal.index.created = await ensureUniqueIndex(Dossier, await readIndexes(Dossier));
    writeJournal(filePath, journal);
    const dropped = await dropLegacyIndex(Dossier, await readIndexes(Dossier));
    if (dropped) journal.legacyIndex = dropped;
  } catch (error) {
    journal.status = 'index_failed';
    journal.index.error = error.message;
    writeJournal(filePath, journal);
    throw error;
  }
  journal.status = 'applied';
  journal.completedAt = new Date().toISOString();
  writeJournal(filePath, journal);
  log(`\nMigration appliquee (run ${runId}).`);
}

async function rollback({ args, runId }) {
  const apply = args.apply;
  const journal = readJournal(runId);
  const Dossier = require('../models/Folder/Dossier');
  const ids = journal.entries.map((entry) => toObjectId(entry.dossierId));
  const dossiers = ids.length ? await Dossier.find({ _id: { $in: ids } }, { reference: 1, tenantId: 1 }).lean() : [];
  const indexes = await readIndexes(Dossier);
  const plan = lib.planRollback({ journal, dossiers, indexes });

  const restores = plan.restores.filter((item) => item.action === 'restore');
  const indexAction = plan.dropIndex ? `${plan.indexName} a supprimer` : 'compose conserve (non cree par ce run, ou deja absent)';
  const legacyAction = plan.recreateLegacyIndex
    ? `${plan.legacyIndex.name} a recreer`
    : `${lib.LEGACY_INDEX_NAME} inchange (non supprime par ce run, ou deja present)`;
  log(`— Retour arriere du run ${runId} (statut ${journal.status}) : ${restores.length} restauration(s), ${plan.restores.length - restores.length} ignoree(s), index ${indexAction}, ancien index ${legacyAction}.`);
  for (const item of plan.restores) log(`   ${item.dossierId} : ${item.action} (tenantId ${item.from} -> ${item.to})`);

  if (!apply) {
    log('\nDRY-RUN : rien n\'a ete ecrit. Relancer avec --apply pour executer le retour arriere.');
    return;
  }

  const report = { runId, rolledBackAt: new Date().toISOString(), restores: plan.restores, indexDropped: false, legacyIndexRecreated: false };
  for (const item of restores) {
    await Dossier.updateOne(
      { _id: toObjectId(item.dossierId), tenantId: toObjectId(item.from) },
      { $set: { tenantId: toObjectId(item.to) } },
    );
  }
  if (plan.dropIndex) {
    await Dossier.collection.dropIndex(plan.indexName);
    report.indexDropped = true;
    log(`   index ${plan.indexName} supprime.`);
  }
  if (plan.recreateLegacyIndex) {
    await Dossier.collection.createIndex(plan.legacyIndex.key, { name: plan.legacyIndex.name, unique: plan.legacyIndex.unique });
    report.legacyIndexRecreated = true;
    log(`   ancien index ${plan.legacyIndex.name} { reference: 1 } recree.`);
  }
  const stamp = report.rolledBackAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-');
  writeJournal(path.join(JOURNALS_DIR, `${runId}.rollback-${stamp}.json`), report);
  journal.status = 'rolled_back';
  journal.rolledBackAt = report.rolledBackAt;
  writeJournal(journalPath(runId), journal);
  log(`\nRetour arriere execute (${restores.length} restauration(s)).`);
}

async function main() {
  const argv = process.argv.slice(2);
  const args = lib.parseMigrationArgs(argv);
  if (args.help) {
    log(USAGE);
    return;
  }
  if (!args.target) throw new Error(`--target obligatoire (${lib.SCRIPT_TARGETS.join('|')}).\n${USAGE}`);
  if (args.rollback && args.runId && args.rollback !== args.runId) {
    throw new Error('--rollback et --run-id designent deux runs differents.');
  }
  const runId = args.rollback || args.runId || lib.buildDefaultRunId();
  log('==============================================================');
  log(`  Migration references de dossier — ${args.rollback ? 'RETOUR ARRIERE' : 'MIGRATION'} — mode ${args.apply ? 'APPLY (ecriture reelle)' : 'DRY-RUN (aucune ecriture)'}`);
  log(`  run-id : ${runId}`);
  log('==============================================================');

  const { target, mongoose: connection } = await connect(args, 'migrate-dossier-references');
  try {
    if (args.rollback) await rollback({ args, target, runId });
    else await migrate({ args, target, runId });
  } finally {
    await (connection || mongoose).disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[migration] ERREUR : ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { migrate, rollback, journalPath };
