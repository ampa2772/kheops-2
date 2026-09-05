'use strict';

// Cible explicite des scripts d'exploitation (server/scripts/lib/dbTarget.js) :
// --target=dev|test|preprod obligatoire, --confirm-preprod et derogation pour
// la preproduction, chargement du seul fichier correspondant, journal [DB]
// et connexion via une instance mongoose factice (aucune base reelle).

const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseScriptTarget, resolveScriptTarget, connectForScript } = require('../dbTarget');
const { describeMongoUri } = require('../../../config/mongoTarget');
const { loadEnv } = require('../../../config/env');

const PREPROD_URI = 'mongodb+srv://kheops:Secret@cluster0.abcd123.mongodb.net/?retryWrites=true';
// Meme cluster que le deploiement, base par defaut du driver nommee explicitement.
const PREPROD_SAME_CLUSTER_TEST_URI = 'mongodb+srv://kheops:Secret@cluster0.abcd123.mongodb.net/test';
const DEV_URI = 'mongodb://127.0.0.1:27017/kheops2_dev';
const TEST_URI = 'mongodb://127.0.0.1:27017/kheops2_test';
const OVERRIDE = { KHEOPS_DB_OVERRIDE: 'preprod', KHEOPS_DB_OVERRIDE_REASON: 'derogation exportee dans le shell' };

let serverDir;
let logger;

function argv(...args) {
  return ['node', 'script.js', ...args];
}

function write(name, uri, dir = serverDir) {
  fs.writeFileSync(path.join(dir, name), `MONGODB_URI=${uri}\n`, 'utf8');
}

function writeAll() {
  write('.env', PREPROD_URI);
  write('.env.development', DEV_URI);
  write('.env.test', TEST_URI);
}

beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kheops2-dbtarget-'));
  serverDir = path.join(root, 'server');
  fs.mkdirSync(serverDir);
  logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
});

afterEach(() => {
  fs.rmSync(path.dirname(serverDir), { recursive: true, force: true });
});

describe('parseScriptTarget', () => {
  test('--target absent : refus explicite', () => {
    expect(() => parseScriptTarget(argv('--apply'))).toThrow(/--target=dev\|test\|preprod/);
    expect(() => parseScriptTarget(argv())).toThrow(/obligatoire/);
  });

  test('valeur inconnue ou vide : refus', () => {
    expect(() => parseScriptTarget(argv('--target=prod'))).toThrow(/--target/);
    expect(() => parseScriptTarget(argv('--target='))).toThrow(/--target/);
    expect(() => parseScriptTarget(argv('--target', 'dev'))).toThrow(/--target/);
  });

  test('deux valeurs contradictoires : refus', () => {
    expect(() => parseScriptTarget(argv('--target=dev', '--target=preprod'))).toThrow(/--target/);
  });

  test('cibles valides et confirmation', () => {
    expect(parseScriptTarget(argv('--target=dev', '--apply'))).toEqual({ target: 'dev', confirmPreprod: false });
    expect(parseScriptTarget(argv('--target=test'))).toEqual({ target: 'test', confirmPreprod: false });
    expect(parseScriptTarget(argv('--confirm-preprod', '--target=preprod'))).toEqual({ target: 'preprod', confirmPreprod: true });
  });

  test('les autres options du script sont conservees telles quelles', () => {
    const args = argv('--target=dev', '--apply', '--tenant=abc', '--dry-run');
    parseScriptTarget(args);
    expect(args).toEqual(argv('--target=dev', '--apply', '--tenant=abc', '--dry-run'));
  });
});

describe('resolveScriptTarget', () => {
  test('--target absent : refus avant toute lecture de fichier', () => {
    writeAll();
    const env = {};
    expect(() => resolveScriptTarget({ argv: argv('--apply'), env, serverDir, logger })).toThrow(/--target/);
    expect(env.MONGODB_URI).toBeUndefined();
  });

  test('dev : charge .env.development et cible kheops2_dev', () => {
    writeAll();
    const env = {};
    const target = resolveScriptTarget({ argv: argv('--target=dev'), env, serverDir, logger });
    expect(target.target).toBe('dev');
    expect(target.kind).toBe('dev');
    expect(target.file).toBe(path.join(serverDir, '.env.development'));
    expect(target.dbName).toBe('kheops2_dev');
    expect(target.uri).toBe(DEV_URI);
    expect(env.MONGODB_URI).toBe(DEV_URI);
  });

  test('dev sans .env.development : refus qui renvoie au modele', () => {
    write('.env', PREPROD_URI);
    expect(() => resolveScriptTarget({ argv: argv('--target=dev'), env: {}, serverDir, logger })).toThrow(/\.env\.development\.example/);
  });

  test('test : charge .env.test et cible kheops2_test', () => {
    writeAll();
    const env = {};
    const target = resolveScriptTarget({ argv: argv('--target=test'), env, serverDir, logger });
    expect(target.kind).toBe('test');
    expect(target.dbName).toBe('kheops2_test');
    expect(env.MONGODB_URI).toBe(TEST_URI);
  });

  test('test sans .env.test : refus (un script exige une cible materialisee)', () => {
    write('.env.development', DEV_URI);
    expect(() => resolveScriptTarget({ argv: argv('--target=test'), env: {}, serverDir, logger })).toThrow(/\.env\.test/);
  });

  test('dev dont l\'URI est celle du fichier de deploiement : refus par la garde', () => {
    write('.env', PREPROD_URI);
    write('.env.development', PREPROD_URI);
    expect(() => resolveScriptTarget({ argv: argv('--target=dev'), env: {}, serverDir, logger }))
      .toThrow(/Refus : --target=dev vise la base de preproduction depuis un poste local/);
  });

  test('dev avec derogation complete dans l\'environnement et URI de deploiement : refus, aucune banniere', () => {
    write('.env', PREPROD_URI);
    write('.env.development', PREPROD_URI);
    const env = { ...OVERRIDE };
    expect(() => resolveScriptTarget({ argv: argv('--target=dev', '--apply'), env, serverDir, logger }))
      .toThrow(/Seul --target=preprod --confirm-preprod avec KHEOPS_DB_OVERRIDE=preprod/);
    const warned = logger.warn.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(warned).not.toMatch(/DEROGATION|PREPRODUCTION/);
  });

  test('test avec derogation complete et URI de deploiement : refus meme avec --confirm-preprod', () => {
    write('.env', PREPROD_URI);
    write('.env.test', PREPROD_URI);
    const env = { ...OVERRIDE };
    expect(() => resolveScriptTarget({ argv: argv('--target=test', '--confirm-preprod'), env, serverDir, logger }))
      .toThrow(/Refus : --target=test vise la base de preproduction/);
  });

  test('dev avec derogation dans l\'environnement mais URI locale : accepte, derogation ignoree et signalee', () => {
    writeAll();
    const env = { ...OVERRIDE };
    const target = resolveScriptTarget({ argv: argv('--target=dev'), env, serverDir, logger });
    expect(target.kind).toBe('dev');
    expect(target.override).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/KHEOPS_DB_OVERRIDE=preprod ignore pour --target=dev/));
  });

  test('test dont .env.test vise le cluster de deploiement avec "/test" explicite : refus', () => {
    write('.env', PREPROD_URI);
    write('.env.test', PREPROD_SAME_CLUSTER_TEST_URI);
    expect(() => resolveScriptTarget({ argv: argv('--target=test'), env: {}, serverDir, logger }))
      .toThrow(/vise le meme cluster et la meme base \("test"\) que le fichier de deploiement/);
  });

  test('derogation ecrite dans .env.development : ignoree avec avertissement, la garde refuse', () => {
    write('.env', PREPROD_URI);
    fs.writeFileSync(
      path.join(serverDir, '.env.development'),
      `KHEOPS_DB_OVERRIDE=preprod\nKHEOPS_DB_OVERRIDE_REASON=permanent\nMONGODB_URI=${PREPROD_URI}\n`,
      'utf8',
    );
    const env = {};
    expect(() => resolveScriptTarget({ argv: argv('--target=dev'), env, serverDir, logger }))
      .toThrow(/Refus : --target=dev vise la base de preproduction/);
    expect(env.KHEOPS_DB_OVERRIDE).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/\[Config\] KHEOPS_DB_OVERRIDE ignore/));
  });

  test('environnement deja charge depuis un autre fichier avant la resolution : erreur actionnable', () => {
    writeAll();
    const env = {};
    loadEnv({ env, cwd: serverDir });
    expect(() => resolveScriptTarget({ argv: argv('--target=test'), env, serverDir, logger }))
      .toThrow(/deja charge depuis .*\.env\.development avant la resolution de --target=test .*importer \.\/lib\/dbTarget et appeler resolveScriptTarget avant tout module de server\/config, server\/middlewares ou server\/services/);
    expect(env.MONGODB_URI).toBe(DEV_URI);
  });

  test('environnement deja charge depuis le fichier de la cible : accepte', () => {
    writeAll();
    const env = {};
    loadEnv({ env, cwd: serverDir });
    expect(resolveScriptTarget({ argv: argv('--target=dev'), env, serverDir, logger }).kind).toBe('dev');
  });

  test('preprod sans --confirm-preprod : refus, server/.env non charge', () => {
    writeAll();
    const env = { KHEOPS_DB_OVERRIDE: 'preprod', KHEOPS_DB_OVERRIDE_REASON: 'x' };
    expect(() => resolveScriptTarget({ argv: argv('--target=preprod'), env, serverDir, logger })).toThrow(/--confirm-preprod/);
    expect(env.MONGODB_URI).toBeUndefined();
  });

  test('preprod avec --confirm-preprod mais sans derogation : refus', () => {
    writeAll();
    const env = {};
    expect(() => resolveScriptTarget({ argv: argv('--target=preprod', '--confirm-preprod'), env, serverDir, logger })).toThrow(/KHEOPS_DB_OVERRIDE/);
    expect(env.MONGODB_URI).toBeUndefined();
  });

  test('preprod avec derogation sans motif : refus', () => {
    writeAll();
    const env = { KHEOPS_DB_OVERRIDE: 'preprod' };
    expect(() => resolveScriptTarget({ argv: argv('--target=preprod', '--confirm-preprod'), env, serverDir, logger })).toThrow(/KHEOPS_DB_OVERRIDE_REASON/);
  });

  test('preprod complet : charge server/.env, cible preprod-override, avertissement avec motif', () => {
    writeAll();
    const env = { KHEOPS_DB_OVERRIDE: 'preprod', KHEOPS_DB_OVERRIDE_REASON: 'backfill autorise le 2026-09-05' };
    const target = resolveScriptTarget({ argv: argv('--target=preprod', '--confirm-preprod', '--apply'), env, serverDir, logger });
    expect(target.target).toBe('preprod');
    expect(target.kind).toBe('preprod-override');
    expect(target.file).toBe(path.join(serverDir, '.env'));
    expect(target.override).toEqual({ reason: 'backfill autorise le 2026-09-05' });
    expect(target.dbName).toBe('(defaut)');
    expect(env.MONGODB_URI).toBe(PREPROD_URI);
    const warned = logger.warn.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(warned).toContain('backfill autorise le 2026-09-05');
  });

  test('preprod sans server/.env : refus explicite', () => {
    write('.env.development', DEV_URI);
    const env = { KHEOPS_DB_OVERRIDE: 'preprod', KHEOPS_DB_OVERRIDE_REASON: 'x' };
    expect(() => resolveScriptTarget({ argv: argv('--target=preprod', '--confirm-preprod'), env, serverDir, logger }))
      .toThrow(/Fichier d'environnement absent pour --target=preprod/);
    expect(env.MONGODB_URI).toBeUndefined();
  });

  test('MONGODB_URI deja present dans l\'environnement : la valeur du fichier est ignoree et signalee', () => {
    writeAll();
    const env = { MONGODB_URI: 'mongodb://127.0.0.1:27017/shell_dev' };
    const target = resolveScriptTarget({ argv: argv('--target=dev'), env, serverDir, logger });
    expect(target.dbName).toBe('shell_dev');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/MONGODB_URI deja present/));
  });

  test('idempotent pour un meme environnement ; une cible differente est une ambiguite', () => {
    writeAll();
    const env = {};
    const first = resolveScriptTarget({ argv: argv('--target=dev'), env, serverDir, logger });
    expect(resolveScriptTarget({ argv: argv('--target=dev'), env, serverDir, logger })).toBe(first);
    expect(() => resolveScriptTarget({ argv: argv('--target=test'), env, serverDir, logger })).toThrow(/deja/);
  });
});

describe('connectForScript', () => {
  function fakeMongoose() {
    return { connect: jest.fn().mockResolvedValue(undefined) };
  }

  test('journalise la cible sans URI puis connecte mongoose avec l\'URI et les options', async () => {
    writeAll();
    const env = {};
    const mongooseInstance = fakeMongoose();
    const { target, mongoose } = await connectForScript({
      argv: argv('--target=dev', '--apply'),
      env,
      serverDir,
      purpose: 'backfill-tenant-id',
      logger,
      mongooseInstance,
      connectOptions: { autoIndex: false },
    });
    expect(mongoose).toBe(mongooseInstance);
    expect(target.kind).toBe('dev');
    expect(mongooseInstance.connect).toHaveBeenCalledWith(DEV_URI, { autoIndex: false });
    const expected = `[DB] script=backfill-tenant-id cible=dev base=kheops2_dev empreinte=${describeMongoUri(DEV_URI).fingerprint}`;
    expect(logger.log).toHaveBeenCalledWith(expected);
    const logged = logger.log.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).not.toContain('mongodb://');
  });

  test('sans options de connexion : connect(uri) seul', async () => {
    writeAll();
    const mongooseInstance = fakeMongoose();
    await connectForScript({ argv: argv('--target=test'), env: {}, serverDir, purpose: 'diag', logger, mongooseInstance });
    expect(mongooseInstance.connect).toHaveBeenCalledWith(TEST_URI);
  });

  test('cible refusee : aucune connexion tentee', async () => {
    writeAll();
    const mongooseInstance = fakeMongoose();
    await expect(connectForScript({ argv: argv('--apply'), env: {}, serverDir, purpose: 'x', logger, mongooseInstance }))
      .rejects.toThrow(/--target/);
    await expect(connectForScript({ argv: argv('--target=preprod'), env: {}, serverDir, purpose: 'x', logger, mongooseInstance }))
      .rejects.toThrow(/--confirm-preprod/);
    expect(mongooseInstance.connect).not.toHaveBeenCalled();
  });

  test('--target=dev avec derogation exportee et .env.development sur la preproduction : aucune connexion', async () => {
    write('.env', PREPROD_URI);
    write('.env.development', PREPROD_URI);
    const mongooseInstance = fakeMongoose();
    await expect(connectForScript({
      argv: argv('--target=dev', '--apply'), env: { ...OVERRIDE }, serverDir, purpose: 'x', logger, mongooseInstance,
    })).rejects.toThrow(/Seul --target=preprod --confirm-preprod/);
    expect(mongooseInstance.connect).not.toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
  });

  test('preprod complet : connexion a l\'URI de deploiement, journal cible=preprod-override', async () => {
    writeAll();
    const mongooseInstance = fakeMongoose();
    const env = { KHEOPS_DB_OVERRIDE: 'preprod', KHEOPS_DB_OVERRIDE_REASON: 'motif' };
    const { target } = await connectForScript({
      argv: argv('--target=preprod', '--confirm-preprod'), env, serverDir, purpose: 'migrate', logger, mongooseInstance,
    });
    expect(target.kind).toBe('preprod-override');
    expect(mongooseInstance.connect).toHaveBeenCalledWith(PREPROD_URI);
    expect(logger.log).toHaveBeenCalledWith(expect.stringMatching(/^\[DB\] script=migrate cible=preprod-override base=\(defaut\) empreinte=[0-9a-f]{12}$/));
  });
});
