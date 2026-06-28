'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  generateDek,
  encryptBuffer,
  decryptBuffer,
  wrapDek,
  unwrapDek,
  KEY_LENGTH,
  IV_LENGTH,
  TAG_LENGTH,
  DEK_LENGTH
} = require('../lib/aead');

const TEST_KEY = crypto.randomBytes(KEY_LENGTH);

describe('aead — generateDek', () => {
  test('produit un Buffer de 32 octets', () => {
    const dek = generateDek();
    assert.ok(Buffer.isBuffer(dek));
    assert.equal(dek.length, DEK_LENGTH);
  });

  test('produit des DEK differentes a chaque appel', () => {
    const a = generateDek();
    const b = generateDek();
    assert.notEqual(a.toString('hex'), b.toString('hex'));
  });
});

describe('aead — encryptBuffer / decryptBuffer (round-trip)', () => {
  test('chiffrement puis dechiffrement = identite (texte court)', () => {
    const plaintext = Buffer.from('Conclusions Dupont c. Martin', 'utf8');
    const { iv, tag, ciphertext } = encryptBuffer(plaintext, TEST_KEY);
    const decrypted = decryptBuffer(ciphertext, TEST_KEY, iv, tag);
    assert.equal(decrypted.toString('utf8'), plaintext.toString('utf8'));
  });

  test('chiffrement puis dechiffrement = identite (buffer vide)', () => {
    const plaintext = Buffer.alloc(0);
    const { iv, tag, ciphertext } = encryptBuffer(plaintext, TEST_KEY);
    const decrypted = decryptBuffer(ciphertext, TEST_KEY, iv, tag);
    assert.equal(decrypted.length, 0);
  });

  test('chiffrement puis dechiffrement = identite (buffer 1 Mo)', () => {
    const plaintext = crypto.randomBytes(1024 * 1024);
    const { iv, tag, ciphertext } = encryptBuffer(plaintext, TEST_KEY);
    const decrypted = decryptBuffer(ciphertext, TEST_KEY, iv, tag);
    assert.ok(decrypted.equals(plaintext));
  });

  test('produit des ciphertexts differents pour le meme plaintext (IV aleatoire)', () => {
    const plaintext = Buffer.from('texte test');
    const a = encryptBuffer(plaintext, TEST_KEY);
    const b = encryptBuffer(plaintext, TEST_KEY);
    assert.notEqual(a.iv.toString('hex'), b.iv.toString('hex'));
    assert.notEqual(a.ciphertext.toString('hex'), b.ciphertext.toString('hex'));
  });

  test('IV de 12 octets, tag de 16 octets', () => {
    const { iv, tag } = encryptBuffer(Buffer.from('x'), TEST_KEY);
    assert.equal(iv.length, IV_LENGTH);
    assert.equal(iv.length, 12);
    assert.equal(tag.length, TAG_LENGTH);
    assert.equal(tag.length, 16);
  });

  test('dechiffrement avec mauvaise cle = erreur', () => {
    const plaintext = Buffer.from('secret');
    const { iv, tag, ciphertext } = encryptBuffer(plaintext, TEST_KEY);
    const wrongKey = crypto.randomBytes(KEY_LENGTH);
    assert.throws(() => decryptBuffer(ciphertext, wrongKey, iv, tag));
  });

  test('dechiffrement avec ciphertext modifie = erreur (integrite)', () => {
    const plaintext = Buffer.from('integrite');
    const { iv, tag, ciphertext } = encryptBuffer(plaintext, TEST_KEY);
    const corrupted = Buffer.from(ciphertext);
    corrupted[0] = corrupted[0] ^ 0xff;  // flip byte
    assert.throws(() => decryptBuffer(corrupted, TEST_KEY, iv, tag));
  });

  test('dechiffrement avec tag modifie = erreur (authenticite)', () => {
    const plaintext = Buffer.from('integrite');
    const { iv, tag, ciphertext } = encryptBuffer(plaintext, TEST_KEY);
    const corruptedTag = Buffer.from(tag);
    corruptedTag[0] = corruptedTag[0] ^ 0xff;
    assert.throws(() => decryptBuffer(ciphertext, TEST_KEY, iv, corruptedTag));
  });

  test('rejette plaintext non-Buffer', () => {
    assert.throws(() => encryptBuffer('pas un buffer', TEST_KEY), TypeError);
    assert.throws(() => encryptBuffer(null, TEST_KEY), TypeError);
  });

  test('rejette cle de mauvaise taille', () => {
    const shortKey = crypto.randomBytes(16);  // AES-128, pas AES-256
    assert.throws(() => encryptBuffer(Buffer.from('x'), shortKey), TypeError);
  });
});

describe('aead — wrapDek / unwrapDek', () => {
  test('round-trip wrap/unwrap', () => {
    const dek = generateDek();
    const { iv, tag, wrapped } = wrapDek(dek, TEST_KEY);
    const recovered = unwrapDek(wrapped, TEST_KEY, iv, tag);
    assert.ok(recovered.equals(dek));
  });

  test('rejette DEK de mauvaise taille', () => {
    const badDek = crypto.randomBytes(16);
    assert.throws(() => wrapDek(badDek, TEST_KEY), TypeError);
  });

  test('unwrap avec mauvaise MasterKey = erreur', () => {
    const dek = generateDek();
    const { iv, tag, wrapped } = wrapDek(dek, TEST_KEY);
    const otherKey = crypto.randomBytes(KEY_LENGTH);
    assert.throws(() => unwrapDek(wrapped, otherKey, iv, tag));
  });
});
