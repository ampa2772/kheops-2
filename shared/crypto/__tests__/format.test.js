'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  encryptToString,
  decryptFromString,
  encryptToBlob,
  decryptFromBlob,
  readBlobHeader,
  FORMAT_VERSION,
  TEXT_PREFIX,
  BINARY_MAGIC
} = require('../lib/format');

const TEST_KEY = crypto.randomBytes(32);

describe('format — encryptToString / decryptFromString', () => {
  test('round-trip texte UTF-8', () => {
    const plaintext = Buffer.from('Bonjour Pierre, voici les conclusions Dupont.', 'utf8');
    const encoded = encryptToString(plaintext, TEST_KEY);
    const decoded = decryptFromString(encoded, TEST_KEY);
    assert.equal(decoded.toString('utf8'), plaintext.toString('utf8'));
  });

  test('prefixe correct', () => {
    const encoded = encryptToString(Buffer.from('x'), TEST_KEY);
    assert.ok(encoded.startsWith(TEXT_PREFIX));
    assert.equal(TEXT_PREFIX, 'enc:v2:');
  });

  test('format = 6 segments separes par deux-points apres le prefixe', () => {
    const encoded = encryptToString(Buffer.from('x'), TEST_KEY);
    const parts = encoded.slice(TEXT_PREFIX.length).split(':');
    assert.equal(parts.length, 6);
  });

  test('round-trip avec buffer binaire (PJ chat base64)', () => {
    const plaintext = crypto.randomBytes(8192);
    const encoded = encryptToString(plaintext, TEST_KEY);
    const decoded = decryptFromString(encoded, TEST_KEY);
    assert.ok(decoded.equals(plaintext));
  });

  test('round-trip avec emojis et caracteres speciaux', () => {
    const plaintext = Buffer.from('aile, Évangile, 🔐 secret, 中文', 'utf8');
    const encoded = encryptToString(plaintext, TEST_KEY);
    const decoded = decryptFromString(encoded, TEST_KEY);
    assert.equal(decoded.toString('utf8'), plaintext.toString('utf8'));
  });

  test('rejette une chaine sans prefixe enc:v2:', () => {
    assert.throws(() => decryptFromString('pas-un-blob-chiffre', TEST_KEY));
    assert.throws(() => decryptFromString('enc:v1:something', TEST_KEY));
  });

  test('rejette une chaine avec mauvais nombre de segments', () => {
    assert.throws(() => decryptFromString('enc:v2:abc:def', TEST_KEY));
  });

  test('dechiffrement avec mauvaise cle = erreur', () => {
    const encoded = encryptToString(Buffer.from('secret'), TEST_KEY);
    const wrongKey = crypto.randomBytes(32);
    assert.throws(() => decryptFromString(encoded, wrongKey));
  });
});

describe('format — encryptToBlob / decryptFromBlob', () => {
  test('round-trip binaire simple', () => {
    const plaintext = Buffer.from('contenu du courrier en .docx', 'utf8');
    const blob = encryptToBlob(plaintext, TEST_KEY);
    const { plaintext: recovered } = decryptFromBlob(blob, TEST_KEY);
    assert.ok(recovered.equals(plaintext));
  });

  test('round-trip avec gros buffer (5 Mo, simulant un PDF scan)', () => {
    const plaintext = crypto.randomBytes(5 * 1024 * 1024);
    const blob = encryptToBlob(plaintext, TEST_KEY);
    const { plaintext: recovered } = decryptFromBlob(blob, TEST_KEY);
    assert.ok(recovered.equals(plaintext));
  });

  test('le blob commence par "KBX2"', () => {
    const blob = encryptToBlob(Buffer.from('x'), TEST_KEY);
    assert.ok(blob.subarray(0, 4).equals(BINARY_MAGIC));
    assert.equal(blob.subarray(0, 4).toString('ascii'), 'KBX2');
  });

  test('metadonnees preservees dans le header', () => {
    const meta = {
      originalName: 'Conclusions Dupont c. Martin.docx',
      originalMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      cabinetId: 'cab_abc123',
      createdAt: '2026-05-20T10:30:00Z'
    };
    const blob = encryptToBlob(Buffer.from('x'), TEST_KEY, meta);
    const { meta: recovered } = decryptFromBlob(blob, TEST_KEY);
    assert.equal(recovered.originalName, meta.originalName);
    assert.equal(recovered.originalMime, meta.originalMime);
    assert.equal(recovered.cabinetId, meta.cabinetId);
    assert.equal(recovered.createdAt, meta.createdAt);
  });

  test('createdAt est rempli automatiquement si absent', () => {
    const blob = encryptToBlob(Buffer.from('x'), TEST_KEY);
    const { meta } = decryptFromBlob(blob, TEST_KEY);
    assert.ok(meta.createdAt);
    assert.match(meta.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  });

  test('readBlobHeader sans dechiffrement', () => {
    const meta = { originalName: 'test.docx', cabinetId: 'c1' };
    const blob = encryptToBlob(Buffer.from('contenu sensible'), TEST_KEY, meta);
    const header = readBlobHeader(blob);
    assert.equal(header.v, FORMAT_VERSION);
    assert.equal(header.original_name, 'test.docx');
    assert.equal(header.cabinet_id, 'c1');
  });

  test('readBlobHeader ne dechiffre PAS le contenu', () => {
    // Si on appelle readBlobHeader avec une cle invalide, ca doit marcher
    // (le header est en clair, seul le ciphertext est protege)
    const blob = encryptToBlob(Buffer.from('secret'), TEST_KEY);
    const header = readBlobHeader(blob);  // pas de cle passee
    assert.ok(header);
    assert.equal(header.v, FORMAT_VERSION);
  });

  test('rejette un blob sans magic', () => {
    const fake = Buffer.from('PASUNBLOBKHEOPS');
    assert.throws(() => decryptFromBlob(fake, TEST_KEY), /magic/);
  });

  test('rejette un blob trop court', () => {
    assert.throws(() => decryptFromBlob(Buffer.alloc(4), TEST_KEY));
  });

  test('rejette un blob avec version differente', () => {
    const blob = encryptToBlob(Buffer.from('x'), TEST_KEY);
    // Modifie la version dans le header
    const headerLen = blob.readUInt32BE(4);
    const header = JSON.parse(blob.subarray(8, 8 + headerLen).toString('utf8'));
    header.v = 999;
    const newHeaderJson = Buffer.from(JSON.stringify(header), 'utf8');
    const newLen = Buffer.alloc(4);
    newLen.writeUInt32BE(newHeaderJson.length, 0);
    const tampered = Buffer.concat([
      BINARY_MAGIC,
      newLen,
      newHeaderJson,
      blob.subarray(8 + headerLen)
    ]);
    assert.throws(() => decryptFromBlob(tampered, TEST_KEY), /version/);
  });

  test('dechiffrement avec mauvaise cle = erreur', () => {
    const blob = encryptToBlob(Buffer.from('secret'), TEST_KEY);
    const wrongKey = crypto.randomBytes(32);
    assert.throws(() => decryptFromBlob(blob, wrongKey));
  });

  test('ciphertext modifie = erreur (integrite)', () => {
    const plaintext = Buffer.from('document de cabinet');
    const blob = encryptToBlob(plaintext, TEST_KEY);
    const tampered = Buffer.from(blob);
    tampered[tampered.length - 1] = tampered[tampered.length - 1] ^ 0xff;
    assert.throws(() => decryptFromBlob(tampered, TEST_KEY));
  });
});

describe('format — constantes', () => {
  test('FORMAT_VERSION = 2', () => {
    assert.equal(FORMAT_VERSION, 2);
  });

  test('TEXT_PREFIX = enc:v2:', () => {
    assert.equal(TEXT_PREFIX, 'enc:v2:');
  });

  test('BINARY_MAGIC = "KBX2" en ASCII', () => {
    assert.equal(BINARY_MAGIC.toString('ascii'), 'KBX2');
    assert.equal(BINARY_MAGIC.length, 4);
  });
});
