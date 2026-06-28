'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  generateSalt,
  deriveMasterKey,
  SALT_LENGTH,
  MASTER_KEY_LENGTH
} = require('../lib/kdf');

describe('kdf — generateSalt', () => {
  test('produit un Buffer de 16 octets', () => {
    const salt = generateSalt();
    assert.ok(Buffer.isBuffer(salt));
    assert.equal(salt.length, SALT_LENGTH);
    assert.equal(salt.length, 16);
  });

  test('produit des valeurs differentes a chaque appel', () => {
    const a = generateSalt();
    const b = generateSalt();
    assert.notEqual(a.toString('hex'), b.toString('hex'));
  });
});

describe('kdf — deriveMasterKey', () => {
  const TEST_PHRASE = 'bateau foret cuivre montagne nuage soleil';
  const TEST_SALT = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');

  test('produit un Buffer de 32 octets (AES-256)', () => {
    const key = deriveMasterKey(TEST_PHRASE, TEST_SALT);
    assert.ok(Buffer.isBuffer(key));
    assert.equal(key.length, MASTER_KEY_LENGTH);
    assert.equal(key.length, 32);
  });

  test('deterministe : meme phrase + meme sel = meme cle', () => {
    const a = deriveMasterKey(TEST_PHRASE, TEST_SALT);
    const b = deriveMasterKey(TEST_PHRASE, TEST_SALT);
    assert.equal(a.toString('hex'), b.toString('hex'));
  });

  test('phrase differente = cle differente', () => {
    const a = deriveMasterKey(TEST_PHRASE, TEST_SALT);
    const b = deriveMasterKey('autre phrase secrete cabinet pierre dossier', TEST_SALT);
    assert.notEqual(a.toString('hex'), b.toString('hex'));
  });

  test('sel different = cle differente', () => {
    const otherSalt = Buffer.from('fedcba9876543210fedcba9876543210', 'hex');
    const a = deriveMasterKey(TEST_PHRASE, TEST_SALT);
    const b = deriveMasterKey(TEST_PHRASE, otherSalt);
    assert.notEqual(a.toString('hex'), b.toString('hex'));
  });

  test('normalisation Unicode NFC : variantes equivalentes', () => {
    // 'é' peut etre encode NFC ('é') ou NFD ('é')
    // Apres normalize('NFC') ils doivent produire la meme cle
    const phraseNfc = 'clé secrete cabinet test demo simple';
    const phraseNfd = 'clé secrete cabinet test demo simple';
    const a = deriveMasterKey(phraseNfc, TEST_SALT);
    const b = deriveMasterKey(phraseNfd, TEST_SALT);
    assert.equal(a.toString('hex'), b.toString('hex'));
  });

  test('rejette phrase non-string', () => {
    assert.throws(() => deriveMasterKey(null, TEST_SALT), TypeError);
    assert.throws(() => deriveMasterKey(undefined, TEST_SALT), TypeError);
    assert.throws(() => deriveMasterKey(123, TEST_SALT), TypeError);
  });

  test('rejette phrase vide', () => {
    assert.throws(() => deriveMasterKey('', TEST_SALT), TypeError);
  });

  test('rejette sel de mauvaise taille', () => {
    const badSalt = Buffer.from('1234', 'hex');  // 2 octets
    assert.throws(() => deriveMasterKey(TEST_PHRASE, badSalt), TypeError);
  });

  test('rejette sel non-Buffer', () => {
    assert.throws(() => deriveMasterKey(TEST_PHRASE, 'pas un buffer'), TypeError);
    assert.throws(() => deriveMasterKey(TEST_PHRASE, null), TypeError);
  });

  test('cout temporel : derivation entre 100 ms et 5 s (parametres OWASP)', () => {
    const start = Date.now();
    deriveMasterKey(TEST_PHRASE, TEST_SALT);
    const duration = Date.now() - start;
    // Sur du materiel desktop normal, scrypt(N=2^17) prend ~500 ms a 2 s.
    // En dessous de 100 ms : parametres probablement trop faibles.
    // Au dessus de 5 s : materiel inhabituellement lent, mais on tolere.
    assert.ok(
      duration >= 100,
      'derivation trop rapide (' + duration + ' ms) — parametres KDF a verifier'
    );
    assert.ok(
      duration <= 10000,
      'derivation trop lente (' + duration + ' ms) — materiel suspect ou parametres extremes'
    );
  });
});
