#!/usr/bin/env node
// server/scripts/audit-dossier-references.js
//
// AUDIT en LECTURE SEULE des references de dossier, prealable a l'unicite PAR
// CABINET (regle canonique en tete de server/utils/dossierReference.js).
//
// Sortie JSON (stdout, et copie dans --out) : total, dossiers sans tenantId
// avec la resolution proposee (UserDossier -> User.tenantId), repartition par
// cabinet et par annee, references hors format, doublons par cabinet et
// globaux, index presents, verdict "index unique creable : oui/non".
//
// Usage :
//   node scripts/audit-dossier-references.js --target=dev [--out=rapport.json]
//   node scripts/audit-dossier-references.js --target=test
//   node scripts/audit-dossier-references.js --target=preprod --confirm-preprod
//     (exige aussi KHEOPS_DB_OVERRIDE=preprod et KHEOPS_DB_OVERRIDE_REASON="...")
//
// Ciblage de la base : scripts/lib/dbTarget.js (connectForScript) lorsqu'il
// existe ; sinon repli local : dev -> server/.env.development, test ->
// server/.env.test, preprod -> server/.env (fichier de deploiement) avec les
// memes garde-fous. Aucune ecriture : ni document, ni index, ni collection.
// La connexion (les deux chemins) est ouverte avec autoIndex:false et
// autoCreate:false, poses aussi globalement AVANT la connexion : le modele
// Dossier declare l'index unique compose que Mongoose creerait sinon a la
// connexion, et seuls les modeles necessaires (Dossier, UserDossier, User)
// sont charges, apres la connexion (readDossierState). La migration
// (migrate-dossier-references.js) reutilise connect() et ne touche aux index
// qu'explicitement.

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const lib = require('./lib/dossierReferenceMigration');

const SERVER_DIR = path.join(__dirname, '..');
const PURPOSE = 'audit-dossier-references';
// Options de connexion des scripts : aucun index ni collection cree par le
// chargement des modeles (posees aussi globalement, avant la connexion).
const SCRIPT_CONNECT_OPTIONS = Object.freeze({ autoIndex: false, autoCreate: false });
const USAGE = [
  'Usage : node scripts/audit-dossier-references.js --target=dev|test|preprod [--confirm-preprod] [--out=rapport.json]',
  '  Lecture seule. --target est obligatoire ; preprod exige --confirm-preprod,',
  '  KHEOPS_DB_OVERRIDE=preprod et KHEOPS_DB_OVERRIDE_REASON.',
].join('\n');

function loadDbTarget() {
  try {
    return require('./lib/dbTarget');
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND' && /dbTarget/.test(String(error.message))) return null;
    throw error;
  }
}

function readEnvFile(file, serverDir = SERVER_DIR) {
  const fullPath = path.join(serverDir, file);
  if (!fs.existsSync(fullPath)) return null;
  return require('dotenv').parse(fs.readFileSync(fullPath, 'utf8'));
}

// Repli sans scripts/lib/dbTarget.js : memes regles, aucun fichier charge dans
// process.env (les valeurs sont seulement lues). `serverDir` (tests) designe
// le repertoire des fichiers d'environnement, server/ par defaut.
async function connectFallback(args, { serverDir = SERVER_DIR, purpose = PURPOSE } = {}) {
  const file = lib.resolveFallbackEnvFile(args.target);
  const parsed = readEnvFile(file, serverDir);
  if (!parsed) {
    throw new Error(`fichier d'environnement absent : server/${file}${args.target === 'dev' ? ' (copier server/.env.development.example)' : ''}.`);
  }
  const deployment = file === '.env' ? parsed : readEnvFile('.env', serverDir);
  const target = lib.checkFallbackTarget({
    target: args.target,
    uri: parsed.MONGODB_URI,
    deploymentUri: deployment ? deployment.MONGODB_URI : null,
    env: process.env,
    confirmPreprod: args.confirmPreprod,
  });
  if (target.override) {
    console.warn('==============================================================');
    console.warn(`  AVERTISSEMENT : base de PREPRODUCTION ciblee volontairement.`);
    console.warn(`  Motif : ${target.override.reason}`);
    console.warn('==============================================================');
  }
  await mongoose.connect(parsed.MONGODB_URI, { ...SCRIPT_CONNECT_OPTIONS });
  console.log(`[DB] script=${purpose} cible=${target.kind} base=${target.dbName} empreinte=${target.fingerprint}`);
  return { target, mongoose };
}

async function connect(args, purpose = PURPOSE, { serverDir = SERVER_DIR } = {}) {
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  const dbTarget = loadDbTarget();
  if (dbTarget && typeof dbTarget.connectForScript === 'function') {
    // Cible transmise sous sa forme canonique (--target=<cible>) ; les autres
    // options du script ne concernent pas dbTarget.
    const argv = [`--target=${args.target}`, ...(args.confirmPreprod ? ['--confirm-preprod'] : [])];
    return dbTarget.connectForScript({
      argv,
      env: process.env,
      purpose,
      mongooseInstance: mongoose,
      connectOptions: { ...SCRIPT_CONNECT_OPTIONS },
    });
  }
  return connectFallback(args, { serverDir, purpose });
}

async function readIndexes(Model) {
  try {
    return await Model.collection.indexes();
  } catch (error) {
    // Collection absente (base neuve) : aucun index.
    if (error && (error.code === 26 || error.codeName === 'NamespaceNotFound')) return [];
    throw error;
  }
}

/** Lecture des donnees necessaires a l'audit et a la migration (lecture seule). */
async function readDossierState() {
  const Dossier = require('../models/Folder/Dossier');
  const UserDossier = require('../models/Folder/modelsLiaisons/UserDossier');
  const User = require('../models/App_Users/User');
  const dossiers = await Dossier.find({}, { reference: 1, tenantId: 1 }).lean();
  const orphanIds = dossiers.filter((doc) => !doc.tenantId).map((doc) => doc._id);
  const links = orphanIds.length
    ? await UserDossier.find({ dossier: { $in: orphanIds } }, { user: 1, dossier: 1 }).lean()
    : [];
  const userIds = [...new Set(links.map((link) => String(link.user)))];
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }, { tenantId: 1 }).lean()
    : [];
  const indexes = await readIndexes(Dossier);
  return { Dossier, dossiers, links, users, indexes };
}

async function main() {
  const argv = process.argv.slice(2);
  const args = lib.parseMigrationArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return;
  }
  if (!args.target) throw new Error(`--target obligatoire (${lib.SCRIPT_TARGETS.join('|')}).\n${USAGE}`);

  const { target, mongoose: connection } = await connect(args);
  try {
    const { dossiers, links, users, indexes } = await readDossierState();
    const report = lib.buildAuditReport({ dossiers, links, users, indexes, target });
    const json = JSON.stringify(report, null, 2);
    if (args.out) {
      fs.writeFileSync(args.out, `${json}\n`);
      console.log(`[audit] rapport ecrit : ${args.out}`);
    }
    console.log(json);
    console.log(`[audit] index unique creable : ${report.index.verdict.creatable ? 'oui' : 'non'} (${report.index.verdict.reason})`);
  } finally {
    await (connection || mongoose).disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[audit] ERREUR : ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { connect, readDossierState, readIndexes, loadDbTarget, SCRIPT_CONNECT_OPTIONS };
