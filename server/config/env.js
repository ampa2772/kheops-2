// server/config/env.js
//
// Chargeur central des variables d'environnement. Remplace les appels epars a
// require('dotenv').config() qui chargeaient server/.env — le fichier de
// DEPLOIEMENT, celui que scripts/gcp/deploy.sh lit pour epingler les secrets
// Secret Manager — dans n'importe quel processus local (API, tests, scripts).
//
// Regles, dans cet ordre :
//   1. KHEOPS_ENV_FILE defini            -> ce fichier uniquement        (kind 'explicit')
//   2. KHEOPS_HOSTED=true ou production  -> aucun fichier, variables
//                                           injectees (Cloud Run, Electron
//                                           packagee)                    (kind 'hosted')
//   3. NODE_ENV=test                     -> server/.env.test s'il existe,
//                                           sinon rien                   (kind 'test')
//      Sous Jest (JEST_WORKER_ID), .env.test n'est PAS lu : les suites
//      simulent les modeles et doivent rester hermetiques (un fichier local
//      posant par exemple KHEOPS_BYPASS_AUTH=true changerait leurs resultats).
//      Seul KHEOPS_ENV_FILE force un fichier dans ce cas.
//   4. sinon (developpement)             -> server/.env.development
//                                           OBLIGATOIRE                  (kind 'development')
//      sauf derogation KHEOPS_DB_OVERRIDE=preprod + KHEOPS_DB_OVERRIDE_REASON,
//      auquel cas server/.env est charge a la place (voir mongoTarget.js pour
//      la garde et l'avertissement).
//
// Une variable deja presente dans l'environnement n'est jamais ecrasee
// (Cloud Run, launch.json, shell). Le chargement est idempotent : le premier
// appel fait foi, les suivants renvoient le meme resultat sans relire le
// fichier ; demander ensuite un autre fichier explicite est une ambiguite.
//
// Les commutateurs dont dependent ces regles (PROCESS_ONLY_KEYS : KHEOPS_HOSTED,
// NODE_ENV, KHEOPS_ENV_FILE, KHEOPS_DB_OVERRIDE, KHEOPS_DB_OVERRIDE_REASON,
// JEST_WORKER_ID) sont lus dans l'environnement du processus AVANT le
// chargement et ne sont JAMAIS copies depuis un fichier : un .env.* qui les
// contient ne peut ni se declarer heberge, ni s'accorder une derogation. Ces
// cles sont ignorees avec un avertissement.
'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const dotenv = require('dotenv');

const SERVER_DIR = path.resolve(__dirname, '..');

// Analyse d'un contenu .env. dotenv.parse en premier ; certains tests
// remplacent le module dotenv par un faux sans parse, on retombe alors sur
// util.parseEnv (Node >= 20.12, memes regles).
function parseEnvContent(content) {
  if (typeof dotenv.parse === 'function') return dotenv.parse(content);
  if (typeof util.parseEnv === 'function') return util.parseEnv(String(content));
  throw new Error('Aucun analyseur .env disponible (dotenv.parse / util.parseEnv).');
}

const FILES = Object.freeze({
  deployment: '.env',
  development: '.env.development',
  test: '.env.test',
  developmentExample: '.env.development.example',
  testExample: '.env.test.example',
});

// Commutateurs de garde : seul l'environnement du processus peut les fournir.
const PROCESS_ONLY_KEYS = Object.freeze([
  'KHEOPS_HOSTED',
  'NODE_ENV',
  'KHEOPS_ENV_FILE',
  'KHEOPS_DB_OVERRIDE',
  'KHEOPS_DB_OVERRIDE_REASON',
  'JEST_WORKER_ID',
]);

// Resultats par objet d'environnement (process.env en pratique, objets neufs
// dans les tests).
const cache = new WeakMap();

function configError(message) {
  const error = new Error(message);
  error.code = 'KHEOPS_CONFIG';
  return error;
}

function isHostedLike(env = process.env) {
  return env.KHEOPS_HOSTED === 'true' || env.NODE_ENV === 'production';
}

// Lit la derogation preproduction : null si absente, { reason } si complete,
// erreur si la valeur est inconnue ou si le motif manque.
function readOverride(env = process.env) {
  const value = env.KHEOPS_DB_OVERRIDE;
  if (value === undefined || value === null || String(value).trim() === '') return null;
  if (value !== 'preprod') {
    throw configError(`KHEOPS_DB_OVERRIDE="${value}" inconnu : seule la valeur "preprod" est acceptee.`);
  }
  const reason = String(env.KHEOPS_DB_OVERRIDE_REASON || '').trim();
  if (!reason) {
    throw configError('KHEOPS_DB_OVERRIDE=preprod exige KHEOPS_DB_OVERRIDE_REASON="motif" (motif non vide).');
  }
  return { reason };
}

function fileExists(file) {
  try {
    return fs.statSync(file).isFile();
  } catch (_) {
    return false;
  }
}

// Copie dans env les cles du fichier qui n'y sont pas encore. Les commutateurs
// de garde (PROCESS_ONLY_KEYS) ne sont jamais copies, meme absents de env : la
// selection du fichier les a deja lus dans le processus et un fichier ne doit
// pas pouvoir la rejouer a son avantage.
function applyFile(env, file, logger) {
  const parsed = parseEnvContent(fs.readFileSync(file, 'utf8'));
  const loaded = [];
  const skipped = [];
  const ignored = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (PROCESS_ONLY_KEYS.includes(key)) {
      ignored.push(key);
      logger.warn(`[Config] ${key} ignore : ce commutateur ne peut venir que de l'environnement du processus, pas de ${file}.`);
    } else if (Object.prototype.hasOwnProperty.call(env, key)) {
      skipped.push(key);
    } else {
      env[key] = value;
      loaded.push(key);
    }
  }
  return { loaded, skipped, ignored };
}

function selectFile({ env, cwd, file }) {
  // La derogation preproduction est interdite en mode test quel que soit le
  // fichier, y compris un fichier explicite (KHEOPS_ENV_FILE ou option file).
  if (env.NODE_ENV === 'test' && readOverride(env)) {
    throw configError('KHEOPS_DB_OVERRIDE=preprod est interdit en mode test (NODE_ENV=test).');
  }

  const explicit = file || env.KHEOPS_ENV_FILE;
  if (explicit) {
    const resolved = path.resolve(cwd, String(explicit));
    if (!fileExists(resolved)) {
      throw configError(`Fichier d'environnement explicite introuvable : ${resolved}.`);
    }
    return { file: resolved, kind: 'explicit', override: false };
  }

  if (isHostedLike(env)) {
    return { file: null, kind: 'hosted', override: false };
  }

  if (env.NODE_ENV === 'test') {
    const testFile = path.join(cwd, FILES.test);
    const underJest = env.JEST_WORKER_ID !== undefined;
    return { file: !underJest && fileExists(testFile) ? testFile : null, kind: 'test', override: false };
  }

  if (readOverride(env)) {
    const deploymentFile = path.join(cwd, FILES.deployment);
    if (!fileExists(deploymentFile)) {
      throw configError(`Derogation KHEOPS_DB_OVERRIDE=preprod : fichier de deploiement introuvable (${deploymentFile}).`);
    }
    return { file: deploymentFile, kind: 'development', override: true };
  }

  const developmentFile = path.join(cwd, FILES.development);
  if (!fileExists(developmentFile)) {
    throw configError(
      `Fichier ${FILES.development} introuvable dans ${cwd}. En developpement local, ce fichier est obligatoire `
      + `et doit designer une base nommee kheops2_dev : copier ${FILES.developmentExample} en ${FILES.development} `
      + `puis renseigner MONGODB_URI. Le fichier ${FILES.deployment} (deploiement) n'est jamais charge en local.`,
    );
  }
  return { file: developmentFile, kind: 'development', override: false };
}

/**
 * Charge l'environnement selon les regles ci-dessus.
 * @param {object} [options]
 * @param {object} [options.env=process.env]  objet cible (jamais ecrase)
 * @param {string} [options.cwd]              repertoire des fichiers .env (server/ par defaut)
 * @param {string} [options.file]             fichier explicite (scripts), relatif a cwd ou absolu
 * @param {{ warn: Function }} [options.logger=console] destinataire des avertissements [Config]
 * @returns {{ file: string|null, kind: 'hosted'|'test'|'development'|'explicit', override: boolean,
 *             loaded: string[], skipped: string[], ignored: string[] }}
 *   loaded  : cles copiees depuis le fichier ; skipped : cles deja presentes dans env ;
 *   ignored : commutateurs de garde (PROCESS_ONLY_KEYS) trouves dans le fichier et refuses.
 */
function loadEnv({ env = process.env, cwd = SERVER_DIR, file, logger = console } = {}) {
  const previous = cache.get(env);
  if (previous) {
    if (file) {
      const requested = path.resolve(cwd, String(file));
      if (previous.file !== requested) {
        throw configError(
          `Environnement deja charge depuis ${previous.file || '(aucun fichier)'} : `
          + `impossible de charger ensuite ${requested}.`,
        );
      }
    }
    return previous;
  }

  const selection = selectFile({ env, cwd, file });
  const applied = selection.file
    ? applyFile(env, selection.file, logger)
    : { loaded: [], skipped: [], ignored: [] };
  const result = Object.freeze({ ...selection, ...applied });
  cache.set(env, result);
  return result;
}

// Chargement deja enregistre pour cet objet d'environnement, ou null. Permet a
// un appelant (scripts/lib/dbTarget.js) de detecter qu'un module a charge un
// autre fichier avant lui et de l'expliquer, sans relancer loadEnv.
function loadedEnv(env = process.env) {
  return cache.get(env) || null;
}

// Reserve aux tests : oublie le chargement enregistre pour cet objet.
function resetForTests(env = process.env) {
  cache.delete(env);
}

module.exports = {
  loadEnv,
  loadedEnv,
  resetForTests,
  readOverride,
  isHostedLike,
  configError,
  parseEnvContent,
  FILES,
  PROCESS_ONLY_KEYS,
  SERVER_DIR,
};
