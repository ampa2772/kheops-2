'use strict';

// server/config/keys.js : secret Passport en mode test. Sans JWT_SECRET, le
// secret est tire au hasard pour le processus (passport-jwt s'initialise,
// aucun jeton ne peut etre forge contre une constante publique) ; avec
// JWT_SECRET, c'est lui qui sert. Sous Jest, le chargeur ne lit aucun fichier.

const originalNodeEnv = process.env.NODE_ENV;
const originalJwtSecret = process.env.JWT_SECRET;

function loadKeys() {
  let keys;
  jest.isolateModules(() => {
    keys = require('../keys');
  });
  return keys;
}

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  delete process.env.JWT_SECRET;
});

afterAll(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

test('NODE_ENV=test sans JWT_SECRET : secret defini, aleatoire, propre au processus', () => {
  const first = loadKeys();
  expect(typeof first.secretOrKey).toBe('string');
  expect(first.secretOrKey).toMatch(/^[0-9a-f]{64}$/);
  expect(first.secretOrKey).not.toBe('kheops2-test-only-jwt-secret');
  const second = loadKeys();
  expect(second.secretOrKey).toMatch(/^[0-9a-f]{64}$/);
  expect(second.secretOrKey).not.toBe(first.secretOrKey);
});

test('JWT_SECRET present : utilise tel quel', () => {
  process.env.JWT_SECRET = 'secret-configure';
  expect(loadKeys().secretOrKey).toBe('secret-configure');
});

test('hors mode test sans JWT_SECRET : aucun secret de repli', () => {
  process.env.NODE_ENV = 'production';
  expect(loadKeys().secretOrKey).toBeUndefined();
});
