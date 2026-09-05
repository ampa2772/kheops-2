// server/scripts/lib/dbTarget.js
//
// Cible de base explicite pour les scripts d'exploitation de server/scripts.
// Chaque script exige --target=dev|test|preprod ; le fichier correspondant est
// le seul charge (dev -> server/.env.development, test -> server/.env.test,
// preprod -> server/.env) et la cible est verifiee par config/mongoTarget.js
// avant toute connexion. La preproduction exige en plus --confirm-preprod,
// KHEOPS_DB_OVERRIDE=preprod et KHEOPS_DB_OVERRIDE_REASON="motif".
//
//   node scripts/<script>.js --target=dev [--apply]
//   KHEOPS_DB_OVERRIDE=preprod KHEOPS_DB_OVERRIDE_REASON="motif" \
//     node scripts/<script>.js --target=preprod --confirm-preprod [--apply]
//
// --target=dev et --target=test n'atteignent JAMAIS la preproduction : une
// derogation presente dans l'environnement est ignoree (avertissement) et une
// URI de deploiement dans .env.development / .env.test est refusee.
//
// ORDRE D'IMPORT : importer ./lib/dbTarget et appeler resolveScriptTarget ou
// connectForScript AVANT tout module de server/config, server/middlewares ou
// server/services. Ces modules appellent loadEnv() sans fichier au chargement
// (config/keys.js, middlewares/middleware-auth.js, utils/sendEmail.js,
// services/chatSocketHandler.js...) et figeraient .env.development avant que
// la cible soit connue ; resolveScriptTarget le detecte et refuse.
'use strict';

const fs = require('fs');
const path = require('path');
const { loadEnv, loadedEnv, readOverride, configError, FILES } = require('../../config/env');
const { resolveMongoTarget } = require('../../config/mongoTarget');

const SERVER_DIR = path.resolve(__dirname, '..', '..');

const TARGET_FILES = Object.freeze({
  dev: FILES.development,
  test: FILES.test,
  preprod: FILES.deployment,
});

const USAGE = '--target=dev|test|preprod est obligatoire (preprod exige aussi --confirm-preprod, '
  + 'KHEOPS_DB_OVERRIDE=preprod et KHEOPS_DB_OVERRIDE_REASON="motif").';

// Une resolution par objet d'environnement (process.env en pratique).
const resolved = new WeakMap();

/**
 * Lit --target=... et --confirm-preprod dans argv (process.argv complet ou
 * deja tronque). Les autres options sont laissees au script.
 */
function parseScriptTarget(argv = process.argv) {
  const values = [];
  let confirmPreprod = false;
  for (const arg of argv) {
    if (arg === '--confirm-preprod') confirmPreprod = true;
    else if (arg === '--target') throw configError(`Option --target sans valeur : ${USAGE}`);
    else if (String(arg).startsWith('--target=')) values.push(arg.slice('--target='.length).trim());
  }
  if (values.length === 0) throw configError(`Cible absente : ${USAGE}`);
  const distinct = [...new Set(values)];
  if (distinct.length > 1) throw configError(`Cibles contradictoires (--target=${distinct.join(', --target=')}) : ${USAGE}`);
  const target = distinct[0];
  if (!Object.prototype.hasOwnProperty.call(TARGET_FILES, target)) {
    throw configError(`Cible --target=${target || '(vide)'} inconnue : ${USAGE}`);
  }
  return { target, confirmPreprod };
}

/**
 * Charge le fichier de la cible puis verifie la base visee. Aucune connexion.
 * @returns {{ target: 'dev'|'test'|'preprod', file: string, uri: string, kind: string, dbName: string,
 *             fingerprint: string, deploymentFingerprint: string|null, override: { reason: string }|null }}
 */
function resolveScriptTarget({ argv = process.argv, env = process.env, serverDir = SERVER_DIR, logger = console } = {}) {
  const { target, confirmPreprod } = parseScriptTarget(argv);
  const previous = resolved.get(env);
  if (previous) {
    if (previous.target !== target) {
      throw configError(`Cible deja resolue (--target=${previous.target}) : impossible de passer a --target=${target}.`);
    }
    return previous;
  }

  if (target === 'preprod') {
    if (!confirmPreprod) throw configError('--target=preprod exige --confirm-preprod.');
    if (!readOverride(env)) {
      throw configError('--target=preprod exige KHEOPS_DB_OVERRIDE=preprod et KHEOPS_DB_OVERRIDE_REASON="motif" dans l\'environnement.');
    }
  }

  const file = path.join(serverDir, TARGET_FILES[target]);
  if (!fs.existsSync(file)) {
    const hint = target === 'dev'
      ? ` Copier ${FILES.developmentExample} en ${FILES.development} puis renseigner MONGODB_URI (base kheops2_dev).`
      : target === 'test'
        ? ` Copier ${FILES.testExample} en ${FILES.test} puis renseigner MONGODB_URI (base kheops2_test).`
        : ' Le fichier de deploiement server/.env est requis pour la cible preprod.';
    throw configError(`Fichier d'environnement absent pour --target=${target} : ${file}.${hint}`);
  }

  // Un module de server/config, server/middlewares ou server/services importe
  // avant la resolution a deja charge un autre fichier : le signaler de facon
  // actionnable plutot que par l'ambiguite generique de loadEnv.
  const previousLoad = loadedEnv(env);
  if (previousLoad && previousLoad.file !== file) {
    throw configError(
      `Environnement deja charge depuis ${previousLoad.file || '(aucun fichier)'} avant la resolution de `
      + `--target=${target} (${file}) : importer ./lib/dbTarget et appeler resolveScriptTarget avant tout module `
      + 'de server/config, server/middlewares ou server/services.',
    );
  }

  const loaded = loadEnv({ env, cwd: serverDir, file, logger });
  if (loaded.skipped.includes('MONGODB_URI')) {
    logger.warn(`[DB] MONGODB_URI deja present dans l'environnement : la valeur de ${file} est ignoree.`);
  }

  const mongo = resolveMongoTarget({
    env,
    deploymentEnvFile: path.join(serverDir, FILES.deployment),
    packagedEnvFile: path.join(serverDir, '..', '.env'),
    expect: target,
    logger,
  });
  const result = Object.freeze({ target, file, ...mongo });
  resolved.set(env, result);
  return result;
}

/**
 * Resout la cible, journalise "[DB] script=<purpose> cible=<kind> base=<dbName>
 * empreinte=<fp>" puis connecte mongoose. Toute erreur de cible survient avant
 * la connexion.
 */
async function connectForScript({
  argv = process.argv,
  env = process.env,
  serverDir = SERVER_DIR,
  purpose = 'script',
  logger = console,
  mongooseInstance = null,
  connectOptions = undefined,
} = {}) {
  const target = resolveScriptTarget({ argv, env, serverDir, logger });
  const mongoose = mongooseInstance || require('mongoose');
  logger.log(`[DB] script=${purpose} cible=${target.kind} base=${target.dbName} empreinte=${target.fingerprint}`);
  if (connectOptions === undefined) await mongoose.connect(target.uri);
  else await mongoose.connect(target.uri, connectOptions);
  return { target, mongoose };
}

module.exports = {
  parseScriptTarget,
  resolveScriptTarget,
  connectForScript,
  TARGET_FILES,
  USAGE,
};
