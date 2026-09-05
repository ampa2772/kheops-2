// server/config/mongoTarget.js
//
// Identifie la base MongoDB visee par un processus sans jamais exposer l'URI
// (nom de base, empreinte courte, hote masque) et applique la regle de garde :
// hors hebergement, un poste local ne doit pas cibler la base du fichier de
// deploiement (server/.env, ou le .env racine embarque dans l'app Electron
// packagee) sauf derogation explicite KHEOPS_DB_OVERRIDE=preprod accompagnee
// d'un motif KHEOPS_DB_OVERRIDE_REASON, journalisee de facon tres visible.
//
// La garde compare l'empreinte exacte de l'URI ET le couple hote(s)+base
// effective : une URI reecrite sur le meme cluster avec la meme base (par
// exemple "/test" explicite, base par defaut du driver quand l'URI n'en nomme
// aucune) vise les memes donnees et est refusee de la meme facon.
//
// En developpement la base doit s'appeler kheops2_dev ou contenir "_dev", en
// test kheops2_test ou contenir "_test". Une URI sans base nommee (base par
// defaut "test" du driver) et les noms reserves du serveur MongoDB (test,
// admin, local, config) sont refuses en local.
//
// La derogation KHEOPS_DB_OVERRIDE=preprod n'est honoree que par le serveur
// (cible deduite de l'environnement) hors mode test. Un script avec
// --target=dev ou --target=test n'atteint JAMAIS la preproduction : seule la
// cible explicite --target=preprod (avec --confirm-preprod, voir
// scripts/lib/dbTarget.js) l'autorise.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { readOverride, isHostedLike, configError, parseEnvContent, FILES, SERVER_DIR } = require('./env');

const DEPLOYMENT_ENV_FILE = path.join(SERVER_DIR, FILES.deployment);
// .env racine : charge par electron-app/main.js et embarque dans l'installeur.
const PACKAGED_ENV_FILE = path.join(SERVER_DIR, '..', '.env');

// Marqueur exige dans le nom de base selon la cible (kheops2_dev, kheops2_test).
const NAME_MARKERS = Object.freeze({ dev: '_dev', test: '_test' });
// Base par defaut du driver MongoDB quand l'URI n'en nomme aucune.
const DRIVER_DEFAULT_DB = 'test';
// Noms de base jamais acceptes en local : base par defaut du driver et bases
// systeme du serveur.
const RESERVED_DB_NAMES = Object.freeze(['test', 'admin', 'local', 'config']);
// Nom affiche quand l'URI ne nomme aucune base.
const UNNAMED_DB = '(defaut)';

function fingerprintOf(uri) {
  return crypto.createHash('sha256').update(String(uri).trim()).digest('hex').slice(0, 12);
}

// Empreinte de la liste d'hotes seule (sans identifiants, base ni parametres),
// insensible a la casse et a l'ordre : deux URI sur le meme cluster ont la
// meme empreinte d'hotes.
function hostsFingerprintOf(hosts) {
  const normalized = String(hosts)
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(',');
  return fingerprintOf(normalized);
}

// "cluster0.abcd123.mongodb.net:27017" -> "clu***.mongodb.net:27017"
function maskHost(hosts) {
  return String(hosts)
    .split(',')
    .map((entry) => {
      const [hostname, port] = entry.trim().split(':');
      const labels = hostname.split('.').filter(Boolean);
      const head = `${(labels[0] || '').slice(0, 3)}***`;
      const numeric = /^[\d.]+$/.test(hostname);
      const tail = numeric ? '' : (labels.length >= 3 ? labels.slice(-2).join('.') : (labels.length === 2 ? labels[1] : ''));
      return `${tail ? `${head}.${tail}` : head}${port ? `:${port}` : ''}`;
    })
    .join(',');
}

/**
 * Decrit une URI MongoDB sans la restituer.
 * @param {string} uri
 * @returns {{ dbName: string, effectiveDbName: string, fingerprint: string, hostsFingerprint: string, host: string }}
 *   dbName          : base nommee dans l'URI, ou "(defaut)" ;
 *   effectiveDbName : base reellement ouverte par le driver ("test" si aucune n'est nommee) ;
 *   fingerprint     : empreinte de l'URI exacte ; hostsFingerprint : empreinte des hotes seuls.
 */
function describeMongoUri(uri) {
  const text = String(uri || '').trim();
  if (!text) throw configError('MONGODB_URI absent ou vide.');
  const match = /^mongodb(?:\+srv)?:\/\/(.*)$/i.exec(text);
  if (!match) throw configError('MONGODB_URI invalide : schema attendu mongodb:// ou mongodb+srv://.');
  const rest = match[1];
  const query = rest.indexOf('?');
  const beforeQuery = query >= 0 ? rest.slice(0, query) : rest;
  const slash = beforeQuery.indexOf('/');
  const authority = slash >= 0 ? beforeQuery.slice(0, slash) : beforeQuery;
  const rawDb = slash >= 0 ? beforeQuery.slice(slash + 1) : '';
  let dbName = rawDb;
  try { dbName = decodeURIComponent(rawDb); } catch (_) { /* nom laisse tel quel */ }
  const at = authority.lastIndexOf('@');
  const hosts = at >= 0 ? authority.slice(at + 1) : authority;
  return {
    dbName: dbName || UNNAMED_DB,
    effectiveDbName: dbName || DRIVER_DEFAULT_DB,
    fingerprint: fingerprintOf(text),
    hostsFingerprint: hostsFingerprintOf(hosts),
    host: maskHost(hosts),
  };
}

// Description d'une URI de fichier de deploiement, ou null si elle est absente.
// Une URI inexploitable garde une empreinte exacte : un fichier de deploiement
// invalide ne doit pas desactiver la garde.
function describeDeploymentUri(uri) {
  if (!uri) return null;
  try {
    return describeMongoUri(uri);
  } catch (_) {
    return { fingerprint: fingerprintOf(uri), hostsFingerprint: null, effectiveDbName: null };
  }
}

// Le fichier de deploiement designe-t-il les memes donnees que l'URI active ?
// 'exact' si l'URI est identique, 'hosts-db' si elle vise le meme cluster et
// la meme base effective (URI reecrite, parametres differents, "/test"
// explicite a la place de la base par defaut), null sinon.
function sameDeploymentData(described, deployment) {
  if (!deployment) return null;
  if (deployment.fingerprint === described.fingerprint) return 'exact';
  if (deployment.hostsFingerprint
    && deployment.hostsFingerprint === described.hostsFingerprint
    && deployment.effectiveDbName === described.effectiveDbName) {
    return 'hosts-db';
  }
  return null;
}

/**
 * MONGODB_URI d'un fichier .env de deploiement, sans le charger dans
 * l'environnement. null si le fichier ou la cle manquent.
 */
function readDeploymentMongoUri(file = DEPLOYMENT_ENV_FILE) {
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch (_) {
    return null;
  }
  const value = String(parseEnvContent(content).MONGODB_URI || '').trim();
  return value || null;
}

function warnOverride(logger, { dbName, fingerprint, host }, matchedFile, reason) {
  const tag = '[DB]';
  logger.warn(`${tag} ============================================================`);
  logger.warn(`${tag} DEROGATION : base de PREPRODUCTION ciblee depuis un poste local.`);
  logger.warn(`${tag} base=${dbName} empreinte=${fingerprint} hote=${host}`);
  if (matchedFile) logger.warn(`${tag} fichier de deploiement correspondant : ${matchedFile}`);
  logger.warn(`${tag} motif (KHEOPS_DB_OVERRIDE_REASON) : ${reason}`);
  logger.warn(`${tag} Toute ecriture touche les donnees en ligne.`);
  logger.warn(`${tag} ============================================================`);
}

/**
 * Resout la cible MongoDB du processus.
 * @param {object} [options]
 * @param {object} [options.env=process.env]
 * @param {string} [options.deploymentEnvFile]  server/.env par defaut
 * @param {string|null} [options.packagedEnvFile] .env racine par defaut (null pour ignorer)
 * @param {'dev'|'test'|'preprod'|null} [options.expect] cible attendue (scripts) ; null = deduite de l'environnement
 * @param {{ warn: Function }} [options.logger=console]
 * @returns {{ uri: string, kind: 'hosted'|'dev'|'test'|'preprod-override', dbName: string, effectiveDbName: string,
 *             fingerprint: string, hostsFingerprint: string, host: string, deploymentFingerprint: string|null,
 *             override: { reason: string }|null }}
 *
 * Derogation (kind preprod-override) : uniquement expect === 'preprod' (script
 * --target=preprod) ou expect === null hors NODE_ENV=test (serveur). Avec
 * expect 'dev' ou 'test', une URI de deploiement est toujours refusee.
 */
function resolveMongoTarget({
  env = process.env,
  deploymentEnvFile = DEPLOYMENT_ENV_FILE,
  packagedEnvFile = PACKAGED_ENV_FILE,
  expect = null,
  logger = console,
} = {}) {
  const uri = String(env.MONGODB_URI || '').trim();
  if (!uri) throw configError('MONGODB_URI absent : aucune base MongoDB n\'est designee pour ce processus.');
  const described = describeMongoUri(uri);
  const base = { uri, ...described, deploymentFingerprint: null, override: null };

  if (expect === null && isHostedLike(env)) {
    return { ...base, kind: 'hosted' };
  }
  if (expect !== null && !['dev', 'test', 'preprod'].includes(expect)) {
    throw configError(`Cible attendue inconnue : ${expect}.`);
  }

  const override = readOverride(env);
  // Meme regle que config/env.js : aucune derogation en mode test pour le
  // serveur, quel que soit le fichier charge (KHEOPS_ENV_FILE compris).
  if (expect === null && override && env.NODE_ENV === 'test') {
    throw configError('KHEOPS_DB_OVERRIDE=preprod est interdit en mode test (NODE_ENV=test).');
  }

  const deployment = describeDeploymentUri(readDeploymentMongoUri(deploymentEnvFile));
  const deploymentFingerprint = deployment ? deployment.fingerprint : null;
  const packaged = packagedEnvFile ? describeDeploymentUri(readDeploymentMongoUri(packagedEnvFile)) : null;
  let matchedFile = null;
  let matchKind = sameDeploymentData(described, deployment);
  if (matchKind) {
    matchedFile = deploymentEnvFile;
  } else {
    matchKind = sameDeploymentData(described, packaged);
    if (matchKind) matchedFile = packagedEnvFile;
  }
  const matchLabel = matchKind === 'exact'
    ? `est celui du fichier de deploiement ${matchedFile}`
    : `vise le meme cluster et la meme base ("${described.effectiveDbName}") que le fichier de deploiement ${matchedFile}`;

  if (expect === 'preprod') {
    if (!override) {
      throw configError('Cible preprod : KHEOPS_DB_OVERRIDE=preprod et KHEOPS_DB_OVERRIDE_REASON="motif" sont obligatoires.');
    }
    // La cible preprod exige l'URI exacte du fichier de deploiement : une URI
    // reecrite (meme cluster, meme base) reste ambigue pour un script.
    if (!deploymentFingerprint || matchedFile !== deploymentEnvFile || matchKind !== 'exact') {
      throw configError(
        `Cible preprod ambigue : MONGODB_URI actif (empreinte ${described.fingerprint}) n'est pas celui du fichier `
        + `de deploiement ${deploymentEnvFile}${deploymentFingerprint ? ` (empreinte ${deploymentFingerprint})` : ' (absent ou sans MONGODB_URI)'}.`,
      );
    }
    warnOverride(logger, described, matchedFile, override.reason);
    return { ...base, kind: 'preprod-override', deploymentFingerprint, override };
  }

  if (matchedFile) {
    // Serveur (cible deduite) hors mode test : la derogation est honoree.
    // Script --target=dev|test : jamais, derogation ou non.
    if (override && expect === null) {
      warnOverride(logger, described, matchedFile, override.reason);
      return { ...base, kind: 'preprod-override', deploymentFingerprint, override };
    }
    if (expect !== null) {
      throw configError(
        `Refus : --target=${expect} vise la base de preproduction depuis un poste local. MONGODB_URI actif `
        + `(base=${described.dbName}, empreinte ${described.fingerprint}) ${matchLabel}. `
        + 'Seul --target=preprod --confirm-preprod avec KHEOPS_DB_OVERRIDE=preprod et KHEOPS_DB_OVERRIDE_REASON="motif" '
        + `atteint cette base ; pour la cible ${expect}, renseigner une base locale nommee kheops2_${expect} `
        + `dans ${expect === 'dev' ? FILES.development : FILES.test}.`,
      );
    }
    throw configError(
      `Refus : base de preproduction ciblee depuis un poste local. MONGODB_URI actif (base=${described.dbName}, `
      + `empreinte ${described.fingerprint}) ${matchLabel}. `
      + `Renseigner une base locale nommee (kheops2_dev / kheops2_test) dans ${FILES.development} ou ${FILES.test}, `
      + 'et verifier qu\'aucune variable MONGODB_URI n\'est deja definie dans le processus (shell, launch.json, .env racine '
      + 'charge par Electron). Derogation ponctuelle (hors mode test) : KHEOPS_DB_OVERRIDE=preprod KHEOPS_DB_OVERRIDE_REASON="motif".',
    );
  }

  if (override) {
    logger.warn(expect !== null
      ? `[DB] KHEOPS_DB_OVERRIDE=preprod ignore pour --target=${expect} : seule la cible --target=preprod honore la derogation.`
      : `[DB] KHEOPS_DB_OVERRIDE=preprod ignore : l'URI active (empreinte ${described.fingerprint}) n'est pas celle du fichier de deploiement.`);
  }

  const kind = expect || (env.NODE_ENV === 'test' ? 'test' : 'dev');
  const marker = NAME_MARKERS[kind];
  const lowerName = described.dbName.toLowerCase();
  if (described.dbName === UNNAMED_DB) {
    throw configError(
      `Nom de base non explicite pour la cible ${kind} : MONGODB_URI ne nomme aucune base et viserait la base `
      + `par defaut du driver ("${DRIVER_DEFAULT_DB}"), refusee en local. Nommer la base kheops2${marker}.`,
    );
  }
  if (RESERVED_DB_NAMES.includes(lowerName)) {
    throw configError(
      `Nom de base non explicite pour la cible ${kind} : "${described.dbName}" est un nom reserve du serveur MongoDB `
      + `(${RESERVED_DB_NAMES.join(', ')}), refuse en local. Choisir kheops2${marker}.`,
    );
  }
  if (!lowerName.includes(marker)) {
    throw configError(
      `Nom de base non explicite pour la cible ${kind} : "${described.dbName}" doit s'appeler kheops2${marker} `
      + `ou contenir "${marker}".`,
    );
  }
  return { ...base, kind, deploymentFingerprint };
}

/** Ligne de journal, sans URI : "[DB] cible=dev base=kheops2_dev empreinte=xxxxxxxxxxxx". */
function formatMongoTargetLine(target) {
  const line = `[DB] cible=${target.kind} base=${target.dbName} empreinte=${target.fingerprint}`;
  return target.override ? `${line} derogation="${target.override.reason}"` : line;
}

module.exports = {
  describeMongoUri,
  readDeploymentMongoUri,
  resolveMongoTarget,
  formatMongoTargetLine,
  DEPLOYMENT_ENV_FILE,
  PACKAGED_ENV_FILE,
  RESERVED_DB_NAMES,
};
