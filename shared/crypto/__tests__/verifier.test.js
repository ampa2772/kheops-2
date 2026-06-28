'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  computeVerifier,
  verifyVerifier,
  VERIFIER_DOMAIN,
  VERIFIER_LENGTH
} = require('../lib/verifier');

const TEST_KEY = crypto.randomBytes(32);

describe('verifier — computeVerifier', () => {
  test('produit une chaine hex de 64 caracteres (SHA-256)', () => {
    const v = computeVerifier(TEST_KEY);
    assert.equal(typeof v, 'string');
    assert.equal(v.length, 64);
    assert.match(v, /^[0-9a-f]+$/);
  });

  test('deterministe : meme cle = meme verifier', () => {
    const a = computeVerifier(TEST_KEY);
    const b = computeVerifier(TEST_KEY);
    assert.equal(a, b);
  });

  test('cle differente = verifier different', () => {
    const otherKey = crypto.randomBytes(32);
    const a = computeVerifier(TEST_KEY);
    const b = computeVerifier(otherKey);
    assert.notEqual(a, b);
  });

  test('rejette cle de mauvaise taille', () => {
    assert.throws(() => computeVerifier(crypto.randomBytes(16)), TypeError);
    assert.throws(() => computeVerifier(crypto.randomBytes(64)), TypeError);
  });

  test('rejette cle non-Buffer', () => {
    assert.throws(() => computeVerifier('pas un buffer'), TypeError);
    assert.throws(() => computeVerifier(null), TypeError);
  });
});

describe('verifier — verifyVerifier', () => {
  test('compare correctement deux verifiers identiques', () => {
    const v = computeVerifier(TEST_KEY);
    assert.equal(verifyVerifier(v, v), true);
  });

  test('rejette deux verifiers differents', () => {
    const a = computeVerifier(TEST_KEY);
    const b = computeVerifier(crypto.randomBytes(32));
    assert.equal(verifyVerifier(a, b), false);
  });

  test('rejette une chaine de mauvaise longueur', () => {
    const v = computeVerifier(TEST_KEY);
    assert.equal(verifyVerifier(v, v.slice(0, 32)), false);
    assert.equal(verifyVerifier(v.slice(0, 32), v), false);
  });

  test('rejette des entrees non-string', () => {
    const v = computeVerifier(TEST_KEY);
    assert.equal(verifyVerifier(v, null), false);
    assert.equal(verifyVerifier(null, v), false);
    assert.equal(verifyVerifier(v, 123), false);
  });

  test('rejette du hex de bonne longueur mais aleatoire', () => {
    const v = computeVerifier(TEST_KEY);
    const random = crypto.randomBytes(32).toString('hex');
    assert.equal(verifyVerifier(v, random), false);
  });
});

describe('verifier — constantes', () => {
  test('domaine est versionne', () => {
    assert.equal(VERIFIER_DOMAIN, 'kheops-verifier-v2');
  });

  test('longueur SHA-256 = 32', () => {
    assert.equal(VERIFIER_LENGTH, 32);
  });
});
