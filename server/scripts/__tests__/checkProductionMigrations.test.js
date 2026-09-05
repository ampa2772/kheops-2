'use strict';

// Garde de deploiement (server/scripts/check-production-migrations.js) :
// appelee sans argument par scripts/gcp/deploy.sh, elle lit toujours le
// fichier de deploiement designe, journalise "[DB] script=... cible=preprod"
// sans URI, et refuse toute cible autre que preprod avant toute connexion.
// mongoose est espionne (aucune base reelle), le modele des runs est simule.

const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');

jest.mock('../../models/Documents/DataMigrationRun', () => ({ find: jest.fn() }));

const DataMigrationRun = require('../../models/Documents/DataMigrationRun');
const { describeMongoUri } = require('../../config/mongoTarget');
const { main, DEPLOYMENT_ENV_PATH } = require('../check-production-migrations');

const DEPLOYMENT_URI = 'mongodb+srv://kheops:MotDePasseSecret@cluster0.abcd123.mongodb.net/?retryWrites=true';

let dir;
let envPath;
let logger;
let connectSpy;
let setSpy;

function argv(...args) {
  return ['node', 'check-production-migrations.js', ...args];
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kheops2-checkmig-'));
  envPath = path.join(dir, '.env');
  fs.writeFileSync(envPath, `MONGODB_URI="${DEPLOYMENT_URI}"\nJWT_SECRET=abc\n`, 'utf8');
  logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  connectSpy = jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
  setSpy = jest.spyOn(mongoose, 'set').mockImplementation(() => mongoose);
  DataMigrationRun.find.mockReset();
  DataMigrationRun.find.mockReturnValue({ select: () => ({ lean: async () => [] }) });
});

afterEach(() => {
  connectSpy.mockRestore();
  setSpy.mockRestore();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('le chemin par defaut est server/.env (fichier de deploiement)', () => {
  expect(DEPLOYMENT_ENV_PATH).toBe(path.resolve(__dirname, '..', '..', '.env'));
});

test('--target=dev : refus avant toute lecture de fichier et toute connexion', async () => {
  await expect(main({ argv: argv('--target=dev'), envPath: path.join(dir, 'absent.env'), logger }))
    .rejects.toThrow(/--target=dev refuse ; seul --target=preprod est accepte/);
  expect(connectSpy).not.toHaveBeenCalled();
  expect(logger.log).not.toHaveBeenCalled();
});

test('--target=test et --target=preprod melanges : refus', async () => {
  await expect(main({ argv: argv('--target=preprod', '--target=test'), envPath, logger }))
    .rejects.toThrow(/seul --target=preprod est accepte/);
  expect(connectSpy).not.toHaveBeenCalled();
});

test('sans argument (deploy.sh) : journalise la cible preprod sans URI puis se connecte a la base du fichier', async () => {
  await expect(main({ argv: argv(), envPath, logger }))
    .rejects.toThrow(/migrations de production non validées/);
  const described = describeMongoUri(DEPLOYMENT_URI);
  expect(logger.log).toHaveBeenCalledWith(
    `[DB] script=check-production-migrations cible=preprod base=(defaut) empreinte=${described.fingerprint}`,
  );
  const logged = logger.log.mock.calls.map((call) => call.join(' ')).join('\n');
  expect(logged).not.toContain('mongodb');
  expect(logged).not.toContain('MotDePasseSecret');
  expect(connectSpy).toHaveBeenCalledWith(DEPLOYMENT_URI, { autoIndex: false });
  expect(setSpy).toHaveBeenCalledWith('autoIndex', false);
});

test('--target=preprod explicite : accepte comme l\'appel sans argument', async () => {
  await expect(main({ argv: argv('--target=preprod'), envPath, logger })).rejects.toThrow(/non validées/);
  expect(logger.log).toHaveBeenCalledWith(expect.stringMatching(/^\[DB\] script=check-production-migrations cible=preprod /));
  expect(connectSpy).toHaveBeenCalledTimes(1);
});

test('MONGODB_URI present dans le processus : ignore, seul le fichier de deploiement compte', async () => {
  const previous = process.env.MONGODB_URI;
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/kheops2_dev';
  try {
    await expect(main({ argv: argv(), envPath, logger })).rejects.toThrow(/non validées/);
    expect(connectSpy).toHaveBeenCalledWith(DEPLOYMENT_URI, { autoIndex: false });
  } finally {
    if (previous === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previous;
  }
});

test('fichier de deploiement absent ou sans MONGODB_URI : refus sans connexion', async () => {
  await expect(main({ argv: argv(), envPath: path.join(dir, 'absent.env'), logger }))
    .rejects.toThrow(/fichier d'environnement absent/);
  fs.writeFileSync(envPath, 'JWT_SECRET=abc\n', 'utf8');
  await expect(main({ argv: argv(), envPath, logger })).rejects.toThrow(/MONGODB_URI absent/);
  expect(connectSpy).not.toHaveBeenCalled();
});
