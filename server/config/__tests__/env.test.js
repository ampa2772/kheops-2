'use strict';

// Chargeur central des variables d'environnement (server/config/env.js).
//
// Chaque cas travaille dans un repertoire temporaire qui joue le role de
// server/ (fichiers .env, .env.development, .env.test) et sur un objet env
// neuf : aucun fichier reel du depot n'est lu, process.env n'est pas touche.

const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadEnv, loadedEnv, resetForTests, FILES, PROCESS_ONLY_KEYS } = require('../env');

let cwd;

function write(name, content) {
  fs.writeFileSync(path.join(cwd, name), content, 'utf8');
}

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'kheops2-env-'));
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

describe('developpement', () => {
  test('sans .env.development : erreur explicite qui renvoie au modele', () => {
    const env = {};
    expect(() => loadEnv({ env, cwd })).toThrow(/\.env\.development\.example/);
    expect(() => loadEnv({ env, cwd })).toThrow(/\.env\.development/);
    expect(env.MONGODB_URI).toBeUndefined();
  });

  test('erreur portant le code KHEOPS_CONFIG', () => {
    let error;
    try { loadEnv({ env: {}, cwd }); } catch (e) { error = e; }
    expect(error).toBeDefined();
    expect(error.code).toBe('KHEOPS_CONFIG');
  });

  test('avec .env.development : charge le fichier (base kheops2_dev)', () => {
    write('.env.development', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_dev\nPORT=5001\n');
    const env = {};
    const result = loadEnv({ env, cwd });
    expect(result.kind).toBe('development');
    expect(result.file).toBe(path.join(cwd, '.env.development'));
    expect(result.override).toBe(false);
    expect(env.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/kheops2_dev');
    expect(env.PORT).toBe('5001');
    expect(result.loaded).toEqual(expect.arrayContaining(['MONGODB_URI', 'PORT']));
    expect(result.skipped).toEqual([]);
  });

  test('ne charge jamais server/.env meme s\'il est le seul fichier present', () => {
    write('.env', 'MONGODB_URI=mongodb+srv://u:p@cluster.mongodb.net/\n');
    const env = {};
    expect(() => loadEnv({ env, cwd })).toThrow(/\.env\.development/);
    expect(env.MONGODB_URI).toBeUndefined();
  });

  test('ignore server/.env quand .env.development existe', () => {
    write('.env', 'MONGODB_URI=mongodb+srv://u:p@cluster.mongodb.net/\nJWT_SECRET=deploiement\n');
    write('.env.development', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_dev\n');
    const env = {};
    loadEnv({ env, cwd });
    expect(env.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/kheops2_dev');
    expect(env.JWT_SECRET).toBeUndefined();
  });

  test('n\'ecrase jamais une variable deja presente dans l\'environnement', () => {
    write('.env.development', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_dev\nPORT=5001\n');
    const env = { MONGODB_URI: 'mongodb://127.0.0.1:27017/deja_la' };
    const result = loadEnv({ env, cwd });
    expect(env.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/deja_la');
    expect(env.PORT).toBe('5001');
    expect(result.skipped).toEqual(['MONGODB_URI']);
    expect(result.loaded).toEqual(['PORT']);
  });
});

describe('derogation preproduction (KHEOPS_DB_OVERRIDE)', () => {
  test('KHEOPS_DB_OVERRIDE=preprod + motif : charge server/.env, et lui seul', () => {
    write('.env', 'MONGODB_URI=mongodb+srv://u:p@cluster.mongodb.net/\n');
    write('.env.development', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_dev\n');
    const env = { KHEOPS_DB_OVERRIDE: 'preprod', KHEOPS_DB_OVERRIDE_REASON: 'audit lecture seule' };
    const result = loadEnv({ env, cwd });
    expect(result.kind).toBe('development');
    expect(result.override).toBe(true);
    expect(result.file).toBe(path.join(cwd, '.env'));
    expect(env.MONGODB_URI).toBe('mongodb+srv://u:p@cluster.mongodb.net/');
  });

  test('derogation sans motif : refus', () => {
    write('.env', 'MONGODB_URI=mongodb+srv://u:p@cluster.mongodb.net/\n');
    const env = { KHEOPS_DB_OVERRIDE: 'preprod' };
    expect(() => loadEnv({ env, cwd })).toThrow(/KHEOPS_DB_OVERRIDE_REASON/);
    expect(env.MONGODB_URI).toBeUndefined();
  });

  test('derogation avec motif vide : refus', () => {
    write('.env', 'MONGODB_URI=mongodb+srv://u:p@cluster.mongodb.net/\n');
    const env = { KHEOPS_DB_OVERRIDE: 'preprod', KHEOPS_DB_OVERRIDE_REASON: '   ' };
    expect(() => loadEnv({ env, cwd })).toThrow(/KHEOPS_DB_OVERRIDE_REASON/);
  });

  test('valeur inconnue de KHEOPS_DB_OVERRIDE : refus', () => {
    write('.env.development', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_dev\n');
    const env = { KHEOPS_DB_OVERRIDE: 'prod', KHEOPS_DB_OVERRIDE_REASON: 'x' };
    expect(() => loadEnv({ env, cwd })).toThrow(/KHEOPS_DB_OVERRIDE/);
  });

  test('derogation sans fichier de deploiement : refus explicite', () => {
    const env = { KHEOPS_DB_OVERRIDE: 'preprod', KHEOPS_DB_OVERRIDE_REASON: 'x' };
    expect(() => loadEnv({ env, cwd })).toThrow(/deploiement/);
  });

  test('derogation interdite en mode test', () => {
    write('.env.test', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_test\n');
    const env = { NODE_ENV: 'test', KHEOPS_DB_OVERRIDE: 'preprod', KHEOPS_DB_OVERRIDE_REASON: 'x' };
    expect(() => loadEnv({ env, cwd })).toThrow(/interdit en mode test/);
    expect(env.MONGODB_URI).toBeUndefined();
  });

  test('derogation interdite en mode test meme avec KHEOPS_ENV_FILE ou un fichier explicite', () => {
    write('.env', 'MONGODB_URI=mongodb+srv://u:p@cluster.mongodb.net/\n');
    write('.env.recette', 'MONGODB_URI=mongodb+srv://u:p@cluster.mongodb.net/\n');
    const viaVariable = {
      NODE_ENV: 'test', KHEOPS_ENV_FILE: '.env.recette', KHEOPS_DB_OVERRIDE: 'preprod', KHEOPS_DB_OVERRIDE_REASON: 'x',
    };
    expect(() => loadEnv({ env: viaVariable, cwd })).toThrow(/interdit en mode test/);
    expect(viaVariable.MONGODB_URI).toBeUndefined();
    const viaOption = { NODE_ENV: 'test', KHEOPS_DB_OVERRIDE: 'preprod', KHEOPS_DB_OVERRIDE_REASON: 'x' };
    expect(() => loadEnv({ env: viaOption, cwd, file: '.env' })).toThrow(/interdit en mode test/);
    expect(viaOption.MONGODB_URI).toBeUndefined();
  });
});

describe('test', () => {
  test('avec .env.test : charge ce fichier', () => {
    write('.env.test', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_test\n');
    write('.env.development', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_dev\n');
    const env = { NODE_ENV: 'test' };
    const result = loadEnv({ env, cwd });
    expect(result.kind).toBe('test');
    expect(result.file).toBe(path.join(cwd, '.env.test'));
    expect(env.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/kheops2_test');
  });

  test('sous Jest (JEST_WORKER_ID) : .env.test present mais ignore, suites hermetiques', () => {
    write('.env.test', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_test\nKHEOPS_BYPASS_AUTH=true\n');
    const env = { NODE_ENV: 'test', JEST_WORKER_ID: '1' };
    const result = loadEnv({ env, cwd });
    expect(result.kind).toBe('test');
    expect(result.file).toBeNull();
    expect(env.MONGODB_URI).toBeUndefined();
    expect(env.KHEOPS_BYPASS_AUTH).toBeUndefined();
  });

  test('sous Jest, KHEOPS_ENV_FILE force tout de meme un fichier', () => {
    write('.env.jest', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_test\n');
    const env = { NODE_ENV: 'test', JEST_WORKER_ID: '1', KHEOPS_ENV_FILE: '.env.jest' };
    expect(loadEnv({ env, cwd }).kind).toBe('explicit');
    expect(env.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/kheops2_test');
  });

  test('sans .env.test : aucun fichier requis, aucun fichier lu', () => {
    write('.env', 'MONGODB_URI=mongodb+srv://u:p@cluster.mongodb.net/\n');
    write('.env.development', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_dev\n');
    const env = { NODE_ENV: 'test' };
    const result = loadEnv({ env, cwd });
    expect(result.kind).toBe('test');
    expect(result.file).toBeNull();
    expect(result.loaded).toEqual([]);
    expect(env.MONGODB_URI).toBeUndefined();
  });
});

describe('hebergement', () => {
  test('KHEOPS_HOSTED=true : aucun fichier, variables injectees conservees', () => {
    write('.env', 'MONGODB_URI=mongodb+srv://u:p@cluster.mongodb.net/\n');
    write('.env.development', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_dev\n');
    const env = { KHEOPS_HOSTED: 'true', NODE_ENV: 'production', MONGODB_URI: 'mongodb://injecte/' };
    const result = loadEnv({ env, cwd });
    expect(result.kind).toBe('hosted');
    expect(result.file).toBeNull();
    expect(env.MONGODB_URI).toBe('mongodb://injecte/');
  });

  test('NODE_ENV=production sans KHEOPS_HOSTED (Electron packagee) : aucun fichier', () => {
    write('.env.development', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_dev\n');
    const env = { NODE_ENV: 'production' };
    const result = loadEnv({ env, cwd });
    expect(result.kind).toBe('hosted');
    expect(env.MONGODB_URI).toBeUndefined();
  });

  test('KHEOPS_HOSTED=true sans MONGODB_URI : le chargeur ne tranche pas (c\'est mongoTarget qui refuse)', () => {
    const env = { KHEOPS_HOSTED: 'true' };
    expect(loadEnv({ env, cwd }).kind).toBe('hosted');
  });
});

describe('KHEOPS_ENV_FILE explicite', () => {
  test('charge uniquement le fichier designe', () => {
    write('.env', 'MONGODB_URI=mongodb+srv://u:p@cluster.mongodb.net/\n');
    write('.env.development', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_dev\n');
    write('.env.recette', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_recette_dev\nRECETTE=1\n');
    const env = { KHEOPS_ENV_FILE: '.env.recette' };
    const result = loadEnv({ env, cwd });
    expect(result.kind).toBe('explicit');
    expect(result.file).toBe(path.join(cwd, '.env.recette'));
    expect(env.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/kheops2_recette_dev');
    expect(env.RECETTE).toBe('1');
  });

  test('prime sur l\'hebergement et sur le mode test', () => {
    write('.env.recette', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_recette_dev\n');
    const hosted = { KHEOPS_HOSTED: 'true', KHEOPS_ENV_FILE: path.join(cwd, '.env.recette') };
    expect(loadEnv({ env: hosted, cwd }).kind).toBe('explicit');
    const test = { NODE_ENV: 'test', KHEOPS_ENV_FILE: '.env.recette' };
    expect(loadEnv({ env: test, cwd }).kind).toBe('explicit');
    expect(test.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/kheops2_recette_dev');
  });

  test('fichier absent : refus', () => {
    const env = { KHEOPS_ENV_FILE: '.env.absent' };
    expect(() => loadEnv({ env, cwd })).toThrow(/\.env\.absent/);
  });
});

describe('idempotence', () => {
  test('le premier appel fait foi, les suivants renvoient le meme resultat sans relire le fichier', () => {
    write('.env.development', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_dev\n');
    const env = {};
    const first = loadEnv({ env, cwd });
    write('.env.development', 'MONGODB_URI=mongodb://127.0.0.1:27017/autre_dev\nNOUVELLE=1\n');
    const second = loadEnv({ env, cwd });
    expect(second).toBe(first);
    expect(env.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/kheops2_dev');
    expect(env.NOUVELLE).toBeUndefined();
  });

  test('un fichier explicite different apres un premier chargement est une ambiguite', () => {
    write('.env.development', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_dev\n');
    write('.env.test', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_test\n');
    const env = {};
    loadEnv({ env, cwd });
    expect(() => loadEnv({ env, cwd, file: '.env.test' })).toThrow(/deja/);
    expect(env.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/kheops2_dev');
  });

  test('le meme fichier explicite redemande est accepte', () => {
    write('.env.test', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_test\n');
    const env = {};
    const first = loadEnv({ env, cwd, file: '.env.test' });
    expect(first.kind).toBe('explicit');
    expect(loadEnv({ env, cwd, file: path.join(cwd, '.env.test') })).toBe(first);
    expect(loadEnv({ env, cwd })).toBe(first);
  });

  test('loadedEnv expose le chargement enregistre sans le declencher', () => {
    write('.env.development', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_dev\n');
    const env = {};
    expect(loadedEnv(env)).toBeNull();
    expect(env.MONGODB_URI).toBeUndefined();
    const first = loadEnv({ env, cwd });
    expect(loadedEnv(env)).toBe(first);
    resetForTests(env);
    expect(loadedEnv(env)).toBeNull();
  });

  test('resetForTests oublie le chargement precedent', () => {
    write('.env.development', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_dev\n');
    const env = {};
    const first = loadEnv({ env, cwd });
    resetForTests(env);
    const second = loadEnv({ env, cwd });
    expect(second).not.toBe(first);
    expect(second.skipped).toEqual(['MONGODB_URI']);
  });
});

describe('commutateurs de garde reserves au processus (PROCESS_ONLY_KEYS)', () => {
  const DEPLOYMENT = 'mongodb+srv://u:p@cluster.mongodb.net/';
  let logger;

  beforeEach(() => {
    logger = { warn: jest.fn() };
  });

  function warnings() {
    return logger.warn.mock.calls.map((call) => call.join(' ')).join('\n');
  }

  test('liste publiee et figee', () => {
    expect(PROCESS_ONLY_KEYS).toEqual([
      'KHEOPS_HOSTED', 'NODE_ENV', 'KHEOPS_ENV_FILE', 'KHEOPS_DB_OVERRIDE', 'KHEOPS_DB_OVERRIDE_REASON', 'JEST_WORKER_ID',
    ]);
    expect(Object.isFrozen(PROCESS_ONLY_KEYS)).toBe(true);
  });

  test('un fichier ne peut pas se declarer heberge (KHEOPS_HOSTED=true ignore avec avertissement)', () => {
    write('.env.development', `KHEOPS_HOSTED=true\nMONGODB_URI=${DEPLOYMENT}\nPORT=5001\n`);
    const env = {};
    const result = loadEnv({ env, cwd, logger });
    expect(result.kind).toBe('development');
    expect(env.KHEOPS_HOSTED).toBeUndefined();
    expect(env.MONGODB_URI).toBe(DEPLOYMENT);
    expect(env.PORT).toBe('5001');
    expect(result.ignored).toEqual(['KHEOPS_HOSTED']);
    expect(result.loaded).toEqual(['MONGODB_URI', 'PORT']);
    expect(result.skipped).toEqual([]);
    expect(warnings()).toMatch(/\[Config\] KHEOPS_HOSTED ignore/);
    expect(warnings()).toContain(path.join(cwd, '.env.development'));
  });

  test('un fichier ne peut pas passer en production (NODE_ENV ignore)', () => {
    write('.env.development', `NODE_ENV=production\nMONGODB_URI=${DEPLOYMENT}\n`);
    const env = {};
    const result = loadEnv({ env, cwd, logger });
    expect(env.NODE_ENV).toBeUndefined();
    expect(result.ignored).toEqual(['NODE_ENV']);
    expect(warnings()).toMatch(/\[Config\] NODE_ENV ignore/);
  });

  test('un fichier ne peut pas s\'accorder une derogation (KHEOPS_DB_OVERRIDE + motif ignores)', () => {
    write('.env.development', `KHEOPS_DB_OVERRIDE=preprod\nKHEOPS_DB_OVERRIDE_REASON=permanent\nMONGODB_URI=${DEPLOYMENT}\n`);
    const env = {};
    const result = loadEnv({ env, cwd, logger });
    expect(result.override).toBe(false);
    expect(env.KHEOPS_DB_OVERRIDE).toBeUndefined();
    expect(env.KHEOPS_DB_OVERRIDE_REASON).toBeUndefined();
    expect(result.ignored).toEqual(['KHEOPS_DB_OVERRIDE', 'KHEOPS_DB_OVERRIDE_REASON']);
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });

  test('KHEOPS_ENV_FILE et JEST_WORKER_ID dans un fichier explicite : ignores aussi', () => {
    write('.env.recette', 'KHEOPS_ENV_FILE=.env.autre\nJEST_WORKER_ID=9\nMONGODB_URI=mongodb://127.0.0.1:27017/kheops2_recette_dev\n');
    const env = { KHEOPS_ENV_FILE: '.env.recette' };
    const result = loadEnv({ env, cwd, logger });
    expect(result.kind).toBe('explicit');
    expect(env.KHEOPS_ENV_FILE).toBe('.env.recette');
    expect(env.JEST_WORKER_ID).toBeUndefined();
    expect(result.ignored).toEqual(['KHEOPS_ENV_FILE', 'JEST_WORKER_ID']);
  });

  test('sans commutateur dans le fichier : aucun avertissement, ignored vide', () => {
    write('.env.development', 'MONGODB_URI=mongodb://127.0.0.1:27017/kheops2_dev\n');
    const result = loadEnv({ env: {}, cwd, logger });
    expect(result.ignored).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('constantes', () => {
  test('noms de fichiers publies', () => {
    expect(FILES).toEqual({
      deployment: '.env',
      development: '.env.development',
      test: '.env.test',
      developmentExample: '.env.development.example',
      testExample: '.env.test.example',
    });
  });
});
