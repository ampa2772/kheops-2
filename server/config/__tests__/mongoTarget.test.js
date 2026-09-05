'use strict';

// Cible MongoDB (server/config/mongoTarget.js) : description d'une URI sans
// l'exposer, regle de garde contre la base de deploiement depuis un poste
// local, derogation explicite, nom de base explicite en dev et en test.
//
// Les fichiers de deploiement sont des fichiers temporaires ; aucune
// connexion n'est ouverte.

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  describeMongoUri,
  readDeploymentMongoUri,
  resolveMongoTarget,
  formatMongoTargetLine,
  RESERVED_DB_NAMES,
} = require('../mongoTarget');

const PREPROD_URI = 'mongodb+srv://kheops:MotDePasseSecret@cluster0.abcd123.mongodb.net/?retryWrites=true&w=majority';
// Meme cluster que le deploiement, base par defaut du driver nommee explicitement.
const PREPROD_SAME_CLUSTER_TEST_URI = 'mongodb+srv://kheops:MotDePasseSecret@cluster0.abcd123.mongodb.net/test?retryWrites=true';
// Meme cluster, base de test distincte : donnees differentes.
const PREPROD_CLUSTER_KHEOPS2_TEST_URI = 'mongodb+srv://kheops:MotDePasseSecret@cluster0.abcd123.mongodb.net/kheops2_test?retryWrites=true';
const DEV_URI = 'mongodb://127.0.0.1:27017/kheops2_dev';
const TEST_URI = 'mongodb://127.0.0.1:27017/kheops2_test';
const OVERRIDE = { KHEOPS_DB_OVERRIDE: 'preprod', KHEOPS_DB_OVERRIDE_REASON: 'derogation de test' };

let dir;
let deploymentEnvFile;
let packagedEnvFile;
let logger;

function writeDeployment(uri, file = deploymentEnvFile) {
  fs.writeFileSync(file, `# fichier de deploiement\nMONGODB_URI="${uri}"\nJWT_SECRET=abc\n`, 'utf8');
}

function resolve(env, extra = {}) {
  return resolveMongoTarget({ env, deploymentEnvFile, packagedEnvFile, logger, ...extra });
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kheops2-mongo-'));
  deploymentEnvFile = path.join(dir, 'server.env');
  packagedEnvFile = path.join(dir, 'racine.env');
  logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('describeMongoUri', () => {
  test('URI Atlas sans base : base par defaut, hote masque, empreinte de 12 hexadecimaux', () => {
    const described = describeMongoUri(PREPROD_URI);
    expect(described.dbName).toBe('(defaut)');
    expect(described.effectiveDbName).toBe('test');
    expect(described.fingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(described.hostsFingerprint).toMatch(/^[0-9a-f]{12}$/);
    expect(described.host).toMatch(/^clu\*\*\*\.mongodb\.net$/);
    const serialized = JSON.stringify(described);
    expect(serialized).not.toContain('MotDePasseSecret');
    expect(serialized).not.toContain('kheops:');
    expect(serialized).not.toContain('abcd123');
  });

  test('URI avec base nommee et parametres', () => {
    expect(describeMongoUri('mongodb+srv://u:p@cluster0.x.mongodb.net/kheops2_dev?retryWrites=true').dbName).toBe('kheops2_dev');
    expect(describeMongoUri(DEV_URI).dbName).toBe('kheops2_dev');
    expect(describeMongoUri(DEV_URI).host).toBe('127***:27017');
    expect(describeMongoUri('mongodb://localhost/kheops2_test').host).toBe('loc***');
  });

  test('base absente avec slash final ou parametres seuls', () => {
    expect(describeMongoUri('mongodb://localhost:27017/').dbName).toBe('(defaut)');
    expect(describeMongoUri('mongodb://localhost:27017/?authSource=admin').dbName).toBe('(defaut)');
    expect(describeMongoUri('mongodb://localhost:27017').dbName).toBe('(defaut)');
  });

  test('empreinte stable, sensible a l\'URI, insensible aux espaces peripheriques', () => {
    const a = describeMongoUri(PREPROD_URI).fingerprint;
    expect(describeMongoUri(`  ${PREPROD_URI}\n`).fingerprint).toBe(a);
    expect(describeMongoUri(DEV_URI).fingerprint).not.toBe(a);
  });

  test('empreinte d\'hotes : commune a un meme cluster quels que soient base, parametres et identifiants', () => {
    const deployment = describeMongoUri(PREPROD_URI);
    expect(describeMongoUri(PREPROD_SAME_CLUSTER_TEST_URI).hostsFingerprint).toBe(deployment.hostsFingerprint);
    expect(describeMongoUri(PREPROD_CLUSTER_KHEOPS2_TEST_URI).hostsFingerprint).toBe(deployment.hostsFingerprint);
    expect(describeMongoUri('mongodb+srv://autre:secret@CLUSTER0.abcd123.mongodb.net/').hostsFingerprint).toBe(deployment.hostsFingerprint);
    expect(describeMongoUri('mongodb+srv://kheops:MotDePasseSecret@cluster1.zzz999.mongodb.net/').hostsFingerprint).not.toBe(deployment.hostsFingerprint);
    expect(describeMongoUri('mongodb://b:27017,a:27017/x').hostsFingerprint).toBe(describeMongoUri('mongodb://a:27017,b:27017/x').hostsFingerprint);
    expect(describeMongoUri(PREPROD_SAME_CLUSTER_TEST_URI).effectiveDbName).toBe('test');
    expect(describeMongoUri(PREPROD_CLUSTER_KHEOPS2_TEST_URI).effectiveDbName).toBe('kheops2_test');
  });

  test('URI vide ou de schema inconnu : refus', () => {
    expect(() => describeMongoUri('')).toThrow(/MONGODB_URI/);
    expect(() => describeMongoUri(undefined)).toThrow(/MONGODB_URI/);
    expect(() => describeMongoUri('postgres://x/y')).toThrow(/mongodb/);
  });
});

describe('readDeploymentMongoUri', () => {
  test('lit MONGODB_URI du fichier, guillemets retires', () => {
    writeDeployment(PREPROD_URI);
    expect(readDeploymentMongoUri(deploymentEnvFile)).toBe(PREPROD_URI);
  });

  test('fichier absent ou sans MONGODB_URI : null', () => {
    expect(readDeploymentMongoUri(path.join(dir, 'absent.env'))).toBeNull();
    fs.writeFileSync(deploymentEnvFile, 'JWT_SECRET=abc\n', 'utf8');
    expect(readDeploymentMongoUri(deploymentEnvFile)).toBeNull();
  });
});

describe('resolveMongoTarget hors hebergement', () => {
  test('developpement : base kheops2_dev distincte du deploiement -> cible dev', () => {
    writeDeployment(PREPROD_URI);
    const target = resolve({ MONGODB_URI: DEV_URI });
    expect(target.kind).toBe('dev');
    expect(target.dbName).toBe('kheops2_dev');
    expect(target.uri).toBe(DEV_URI);
    expect(target.fingerprint).toBe(describeMongoUri(DEV_URI).fingerprint);
    expect(target.deploymentFingerprint).toBe(describeMongoUri(PREPROD_URI).fingerprint);
    expect(target.override).toBeNull();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('meme empreinte que le fichier de deploiement sans derogation : refus', () => {
    writeDeployment(PREPROD_URI);
    expect(() => resolve({ MONGODB_URI: PREPROD_URI })).toThrow(/base de preproduction ciblee depuis un poste local/);
  });

  test('le message de refus ne contient pas l\'URI ni le mot de passe', () => {
    writeDeployment(PREPROD_URI);
    let error;
    try { resolve({ MONGODB_URI: PREPROD_URI }); } catch (e) { error = e; }
    expect(error.code).toBe('KHEOPS_CONFIG');
    expect(error.message).not.toContain('MotDePasseSecret');
    expect(error.message).not.toContain('mongodb+srv://');
    expect(error.message).toContain('KHEOPS_DB_OVERRIDE');
  });

  test('meme empreinte avec derogation : accepte, kind preprod-override, avertissement visible avec le motif', () => {
    writeDeployment(PREPROD_URI);
    const target = resolve({
      MONGODB_URI: PREPROD_URI,
      KHEOPS_DB_OVERRIDE: 'preprod',
      KHEOPS_DB_OVERRIDE_REASON: 'audit lecture seule du 2026-09-05',
    });
    expect(target.kind).toBe('preprod-override');
    expect(target.override).toEqual({ reason: 'audit lecture seule du 2026-09-05' });
    expect(target.dbName).toBe('(defaut)');
    expect(logger.warn).toHaveBeenCalled();
    const warned = logger.warn.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(warned).toContain('audit lecture seule du 2026-09-05');
    expect(warned).toMatch(/PREPRODUCTION/);
    expect(warned).not.toContain('MotDePasseSecret');
  });

  test('derogation sans motif : refus', () => {
    writeDeployment(PREPROD_URI);
    expect(() => resolve({ MONGODB_URI: PREPROD_URI, KHEOPS_DB_OVERRIDE: 'preprod' })).toThrow(/KHEOPS_DB_OVERRIDE_REASON/);
  });

  test('derogation avec une URI qui n\'est pas celle du deploiement : ignoree avec avertissement, cible dev', () => {
    writeDeployment(PREPROD_URI);
    const target = resolve({ MONGODB_URI: DEV_URI, KHEOPS_DB_OVERRIDE: 'preprod', KHEOPS_DB_OVERRIDE_REASON: 'x' });
    expect(target.kind).toBe('dev');
    expect(target.override).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/KHEOPS_DB_OVERRIDE.*ignor/));
  });

  test('empreinte egale a celle du .env racine (embarque dans Electron) : refus aussi', () => {
    writeDeployment(DEV_URI.replace('kheops2_dev', 'autre_dev'));
    writeDeployment(PREPROD_URI, packagedEnvFile);
    expect(() => resolve({ MONGODB_URI: PREPROD_URI })).toThrow(/poste local/);
  });

  test('nom de base non explicite en developpement : refus', () => {
    writeDeployment(PREPROD_URI);
    expect(() => resolve({ MONGODB_URI: 'mongodb://127.0.0.1:27017/' }))
      .toThrow(/Nom de base non explicite pour la cible dev : MONGODB_URI ne nomme aucune base/);
    expect(() => resolve({ MONGODB_URI: 'mongodb://127.0.0.1:27017/kheops2' }))
      .toThrow(/Nom de base non explicite pour la cible dev : "kheops2" doit s'appeler kheops2_dev ou contenir "_dev"/);
    expect(() => resolve({ MONGODB_URI: TEST_URI }))
      .toThrow(/Nom de base non explicite pour la cible dev : "kheops2_test"/);
  });

  test('developpement : kheops2_dev exactement ou un nom contenant "_dev" ; "dev" sans soulignement refuse', () => {
    writeDeployment(PREPROD_URI);
    expect(resolve({ MONGODB_URI: DEV_URI }).kind).toBe('dev');
    expect(resolve({ MONGODB_URI: 'mongodb://127.0.0.1:27017/kheops2_recette_dev' }).dbName).toBe('kheops2_recette_dev');
    expect(resolve({ MONGODB_URI: 'mongodb://127.0.0.1:27017/KHEOPS2_DEV' }).kind).toBe('dev');
    expect(() => resolve({ MONGODB_URI: 'mongodb://127.0.0.1:27017/devbase' }))
      .toThrow(/Nom de base non explicite pour la cible dev : "devbase"/);
    expect(() => resolve({ MONGODB_URI: 'mongodb://127.0.0.1:27017/kheops2-dev' }))
      .toThrow(/Nom de base non explicite pour la cible dev : "kheops2-dev"/);
  });

  test('test : la base doit s\'appeler kheops2_test ou contenir "_test"', () => {
    writeDeployment(PREPROD_URI);
    const target = resolve({ NODE_ENV: 'test', MONGODB_URI: TEST_URI });
    expect(target.kind).toBe('test');
    expect(target.dbName).toBe('kheops2_test');
    expect(() => resolve({ NODE_ENV: 'test', MONGODB_URI: DEV_URI }))
      .toThrow(/Nom de base non explicite pour la cible test : "kheops2_dev" doit s'appeler kheops2_test ou contenir "_test"/);
    expect(() => resolve({ NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017/testing' }))
      .toThrow(/Nom de base non explicite pour la cible test : "testing"/);
  });

  test('noms reserves du serveur MongoDB (test, admin, local, config) : refus meme sur un autre cluster', () => {
    writeDeployment(PREPROD_URI);
    expect(RESERVED_DB_NAMES).toEqual(['test', 'admin', 'local', 'config']);
    for (const name of RESERVED_DB_NAMES) {
      expect(() => resolve({ NODE_ENV: 'test', MONGODB_URI: `mongodb://127.0.0.1:27017/${name}` }))
        .toThrow(new RegExp(`Nom de base non explicite pour la cible test : "${name}" est un nom reserve du serveur MongoDB`));
      expect(() => resolve({ MONGODB_URI: `mongodb://127.0.0.1:27017/${name}` }))
        .toThrow(/nom reserve du serveur MongoDB/);
    }
    expect(() => resolve({ NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017/TEST' })).toThrow(/nom reserve/);
    expect(() => resolve({ NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017/test' })).toThrow(/Choisir kheops2_test/);
  });

  test('sans fichier de deploiement : pas de garde par empreinte, regle de nommage conservee', () => {
    const target = resolve({ MONGODB_URI: DEV_URI });
    expect(target.kind).toBe('dev');
    expect(target.deploymentFingerprint).toBeNull();
    expect(() => resolve({ MONGODB_URI: 'mongodb://127.0.0.1:27017/kheops2' }))
      .toThrow(/Nom de base non explicite pour la cible dev : "kheops2"/);
  });

  test('fichier de deploiement dont l\'URI est inexploitable : garde par empreinte exacte conservee, pas de plantage', () => {
    writeDeployment('postgres://x/y');
    expect(resolve({ MONGODB_URI: DEV_URI }).kind).toBe('dev');
    expect(() => resolve({ MONGODB_URI: 'postgres://x/y' })).toThrow(/MONGODB_URI invalide/);
  });

  test('MONGODB_URI absent : refus', () => {
    expect(() => resolve({})).toThrow(/MONGODB_URI/);
    expect(() => resolve({ MONGODB_URI: '   ' })).toThrow(/MONGODB_URI/);
  });

  test('cible attendue "preprod" (scripts) : exige la derogation et l\'URI du fichier de deploiement', () => {
    writeDeployment(PREPROD_URI);
    expect(() => resolve({ MONGODB_URI: PREPROD_URI }, { expect: 'preprod' })).toThrow(/KHEOPS_DB_OVERRIDE/);
    const override = { KHEOPS_DB_OVERRIDE: 'preprod', KHEOPS_DB_OVERRIDE_REASON: 'migration autorisee' };
    expect(() => resolve({ MONGODB_URI: DEV_URI, ...override }, { expect: 'preprod' })).toThrow(/deploiement/);
    const target = resolve({ MONGODB_URI: PREPROD_URI, ...override }, { expect: 'preprod' });
    expect(target.kind).toBe('preprod-override');
    expect(target.override.reason).toBe('migration autorisee');
  });

  test('cible attendue "dev" ou "test" (scripts) : la regle de nommage suit la cible et non NODE_ENV', () => {
    writeDeployment(PREPROD_URI);
    expect(resolve({ NODE_ENV: 'test', MONGODB_URI: DEV_URI }, { expect: 'dev' }).kind).toBe('dev');
    expect(resolve({ MONGODB_URI: TEST_URI }, { expect: 'test' }).kind).toBe('test');
    expect(() => resolve({ MONGODB_URI: PREPROD_URI }, { expect: 'dev' }))
      .toThrow(/Refus : --target=dev vise la base de preproduction depuis un poste local/);
  });
});

describe('--target=dev|test n\'atteint jamais la preproduction', () => {
  function banner() {
    return logger.warn.mock.calls.map((call) => call.join(' ')).join('\n');
  }

  test('cible dev avec derogation complete et URI de deploiement : refus, aucune banniere de derogation', () => {
    writeDeployment(PREPROD_URI);
    expect(() => resolve({ MONGODB_URI: PREPROD_URI, ...OVERRIDE }, { expect: 'dev' }))
      .toThrow(/Seul --target=preprod --confirm-preprod avec KHEOPS_DB_OVERRIDE=preprod/);
    expect(banner()).not.toMatch(/DEROGATION|PREPRODUCTION/);
  });

  test('cible test avec derogation complete et URI de deploiement : refus, aucune banniere de derogation', () => {
    writeDeployment(PREPROD_URI);
    let error;
    try { resolve({ MONGODB_URI: PREPROD_URI, ...OVERRIDE }, { expect: 'test' }); } catch (e) { error = e; }
    expect(error.code).toBe('KHEOPS_CONFIG');
    expect(error.message).toMatch(/^Refus : --target=test vise la base de preproduction depuis un poste local/);
    expect(error.message).toContain('kheops2_test');
    expect(error.message).toContain('.env.test');
    expect(error.message).not.toContain('MotDePasseSecret');
    expect(banner()).not.toMatch(/DEROGATION|PREPRODUCTION/);
  });

  test('cible dev avec derogation mais URI locale : accepte, derogation ignoree avec avertissement dedie', () => {
    writeDeployment(PREPROD_URI);
    const target = resolve({ MONGODB_URI: DEV_URI, ...OVERRIDE }, { expect: 'dev' });
    expect(target.kind).toBe('dev');
    expect(target.override).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/KHEOPS_DB_OVERRIDE=preprod ignore pour --target=dev/));
  });

  test('URI du .env racine avec cible test et derogation : refus aussi', () => {
    writeDeployment(DEV_URI.replace('kheops2_dev', 'autre_dev'));
    writeDeployment(PREPROD_URI, packagedEnvFile);
    expect(() => resolve({ MONGODB_URI: PREPROD_URI, ...OVERRIDE }, { expect: 'test' }))
      .toThrow(/Refus : --target=test vise la base de preproduction/);
  });
});

describe('derogation interdite en mode test pour le serveur', () => {
  test('NODE_ENV=test + derogation + URI de deploiement : refus "interdit en mode test", pas de banniere', () => {
    writeDeployment(PREPROD_URI);
    expect(() => resolve({ NODE_ENV: 'test', MONGODB_URI: PREPROD_URI, ...OVERRIDE })).toThrow(/interdit en mode test/);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('NODE_ENV=test + derogation + URI locale : refus aussi (meme regle que le chargeur)', () => {
    writeDeployment(PREPROD_URI);
    expect(() => resolve({ NODE_ENV: 'test', MONGODB_URI: TEST_URI, ...OVERRIDE })).toThrow(/interdit en mode test/);
  });

  test('hors mode test, la derogation du serveur reste honoree', () => {
    writeDeployment(PREPROD_URI);
    expect(resolve({ MONGODB_URI: PREPROD_URI, ...OVERRIDE }).kind).toBe('preprod-override');
  });
});

describe('garde par cluster et base effective (URI reecrite)', () => {
  test('meme cluster que le deploiement avec "/test" explicite en NODE_ENV=test : refus "poste local"', () => {
    writeDeployment(PREPROD_URI);
    expect(describeMongoUri(PREPROD_SAME_CLUSTER_TEST_URI).fingerprint).not.toBe(describeMongoUri(PREPROD_URI).fingerprint);
    let error;
    try { resolve({ NODE_ENV: 'test', MONGODB_URI: PREPROD_SAME_CLUSTER_TEST_URI }); } catch (e) { error = e; }
    expect(error.code).toBe('KHEOPS_CONFIG');
    expect(error.message).toMatch(/base de preproduction ciblee depuis un poste local/);
    expect(error.message).toContain('vise le meme cluster et la meme base ("test") que le fichier de deploiement');
    expect(error.message).not.toContain('MotDePasseSecret');
    expect(error.message).not.toContain('abcd123');
  });

  test('meme cluster avec "/test" explicite et --target=test : refus', () => {
    writeDeployment(PREPROD_URI);
    expect(() => resolve({ MONGODB_URI: PREPROD_SAME_CLUSTER_TEST_URI }, { expect: 'test' }))
      .toThrow(/Refus : --target=test vise la base de preproduction depuis un poste local/);
  });

  test('meme cluster avec "/test" explicite en developpement : refus sans derogation, derogation du serveur honoree', () => {
    writeDeployment(PREPROD_URI);
    expect(() => resolve({ MONGODB_URI: PREPROD_SAME_CLUSTER_TEST_URI })).toThrow(/poste local/);
    const target = resolve({ MONGODB_URI: PREPROD_SAME_CLUSTER_TEST_URI, ...OVERRIDE });
    expect(target.kind).toBe('preprod-override');
    expect(target.dbName).toBe('test');
  });

  test('parametres differents sans base nommee : memes donnees, refus', () => {
    writeDeployment(PREPROD_URI);
    expect(() => resolve({ MONGODB_URI: 'mongodb+srv://kheops:MotDePasseSecret@cluster0.abcd123.mongodb.net/' }))
      .toThrow(/poste local/);
  });

  test('kheops2_test sur le cluster de deploiement : base distincte, acceptee', () => {
    writeDeployment(PREPROD_URI);
    const target = resolve({ NODE_ENV: 'test', MONGODB_URI: PREPROD_CLUSTER_KHEOPS2_TEST_URI });
    expect(target.kind).toBe('test');
    expect(target.dbName).toBe('kheops2_test');
    expect(resolve({ MONGODB_URI: PREPROD_CLUSTER_KHEOPS2_TEST_URI }, { expect: 'test' }).kind).toBe('test');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('.env racine sur le meme cluster avec "/test" explicite : refus aussi', () => {
    writeDeployment(DEV_URI.replace('kheops2_dev', 'autre_dev'));
    writeDeployment(PREPROD_URI, packagedEnvFile);
    expect(() => resolve({ NODE_ENV: 'test', MONGODB_URI: PREPROD_SAME_CLUSTER_TEST_URI })).toThrow(/poste local/);
  });

  test('cible preprod : l\'URI reecrite n\'est pas celle du fichier de deploiement (ambigue)', () => {
    writeDeployment(PREPROD_URI);
    expect(() => resolve({ MONGODB_URI: PREPROD_SAME_CLUSTER_TEST_URI, ...OVERRIDE }, { expect: 'preprod' }))
      .toThrow(/Cible preprod ambigue/);
  });
});

describe('resolveMongoTarget en hebergement', () => {
  test('KHEOPS_HOSTED=true : cible hosted, aucune garde meme sur l\'URI de deploiement', () => {
    writeDeployment(PREPROD_URI);
    const target = resolve({ KHEOPS_HOSTED: 'true', NODE_ENV: 'production', MONGODB_URI: PREPROD_URI });
    expect(target.kind).toBe('hosted');
    expect(target.dbName).toBe('(defaut)');
    expect(target.override).toBeNull();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('NODE_ENV=production sans KHEOPS_HOSTED (Electron packagee) : cible hosted', () => {
    writeDeployment(PREPROD_URI);
    expect(resolve({ NODE_ENV: 'production', MONGODB_URI: PREPROD_URI }).kind).toBe('hosted');
  });

  test('hebergement sans MONGODB_URI : refus', () => {
    expect(() => resolve({ KHEOPS_HOSTED: 'true' })).toThrow(/MONGODB_URI/);
  });
});

describe('formatMongoTargetLine', () => {
  test('ligne de journal sans URI', () => {
    writeDeployment(PREPROD_URI);
    const target = resolve({ MONGODB_URI: DEV_URI });
    expect(formatMongoTargetLine(target)).toBe(`[DB] cible=dev base=kheops2_dev empreinte=${target.fingerprint}`);
  });

  test('mentionne le motif de derogation', () => {
    writeDeployment(PREPROD_URI);
    const target = resolve({ MONGODB_URI: PREPROD_URI, KHEOPS_DB_OVERRIDE: 'preprod', KHEOPS_DB_OVERRIDE_REASON: 'motif' });
    const line = formatMongoTargetLine(target);
    expect(line).toBe(`[DB] cible=preprod-override base=(defaut) empreinte=${target.fingerprint} derogation="motif"`);
    expect(line).not.toContain('mongodb');
  });
});
