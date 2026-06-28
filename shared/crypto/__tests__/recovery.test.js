'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  generateRecoveryPassword,
  createRecoverySheet,
  restoreFromRecoverySheet,
  encodeBase32,
  decodeBase32,
  groupBase32,
  RECOVERY_PASSWORD_LENGTH,
  RECOVERY_PASSWORD_ALPHABET,
} = require('../lib/recovery');

describe('recovery — generateRecoveryPassword', () => {
  test('produit une chaine de 16 caracteres', () => {
    const pwd = generateRecoveryPassword();
    assert.equal(typeof pwd, 'string');
    assert.equal(pwd.length, RECOVERY_PASSWORD_LENGTH);
  });

  test('tous les caracteres appartiennent a l\'alphabet sans ambiguite', () => {
    for (let i = 0; i < 50; i++) {
      const pwd = generateRecoveryPassword();
      for (const c of pwd) {
        assert.ok(
          RECOVERY_PASSWORD_ALPHABET.indexOf(c) >= 0,
          'caractere "' + c + '" hors alphabet'
        );
      }
    }
  });

  test('produit des mots de passe varies', () => {
    const set = new Set();
    for (let i = 0; i < 50; i++) {
      set.add(generateRecoveryPassword());
    }
    assert.ok(set.size >= 49, 'collision suspecte sur 50 generations');
  });

  test('exclut les caracteres ambigus I, O, 0, 1', () => {
    // L'alphabet ne contient pas ces caracteres
    assert.equal(RECOVERY_PASSWORD_ALPHABET.indexOf('I'), -1);
    assert.equal(RECOVERY_PASSWORD_ALPHABET.indexOf('O'), -1);
    assert.equal(RECOVERY_PASSWORD_ALPHABET.indexOf('0'), -1);
    assert.equal(RECOVERY_PASSWORD_ALPHABET.indexOf('1'), -1);
  });
});

describe('recovery — encodeBase32 / decodeBase32', () => {
  test('round-trip avec un buffer connu', () => {
    const data = Buffer.from('Hello, world!', 'utf8');
    const encoded = encodeBase32(data);
    const decoded = decodeBase32(encoded);
    assert.ok(decoded.equals(data));
  });

  test('round-trip avec des octets aleatoires (32 octets)', () => {
    for (let i = 0; i < 20; i++) {
      const data = crypto.randomBytes(32);
      const encoded = encodeBase32(data);
      const decoded = decodeBase32(encoded);
      assert.ok(decoded.equals(data));
    }
  });

  test('groupBase32 met des tirets tous les 5 caracteres', () => {
    const grouped = groupBase32('ABCDEFGHIJKLMNOP');
    assert.equal(grouped, 'ABCDE-FGHIJ-KLMNO-P');
  });

  test('decodeBase32 accepte les tirets et espaces', () => {
    const data = Buffer.from('test');
    const encoded = encodeBase32(data);
    const grouped = groupBase32(encoded);
    const decoded = decodeBase32(grouped);
    assert.ok(decoded.equals(data));
    const withSpaces = grouped.replace(/-/g, ' ');
    const decoded2 = decodeBase32(withSpaces);
    assert.ok(decoded2.equals(data));
  });

  test('decodeBase32 accepte la casse minuscule', () => {
    const data = Buffer.from('test');
    const encoded = encodeBase32(data);
    const decoded = decodeBase32(encoded.toLowerCase());
    assert.ok(decoded.equals(data));
  });

  test('decodeBase32 rejette les caracteres invalides', () => {
    assert.throws(() => decodeBase32('ABC!DEF'));
    assert.throws(() => decodeBase32('ABC0DEF'));  // 0 n'est pas dans la base32
    assert.throws(() => decodeBase32('ABC1DEF'));  // 1 n'est pas dans la base32
  });
});

describe('recovery — round-trip complet creation et restauration', () => {
  test('cree une feuille puis restaure la meme MasterKey', () => {
    const masterKey = crypto.randomBytes(32);
    const sheet = createRecoverySheet(masterKey);
    assert.equal(typeof sheet.recoveryPassword, 'string');
    assert.equal(sheet.recoveryPassword.length, 16);
    assert.equal(typeof sheet.recoveryCode, 'string');
    const restored = restoreFromRecoverySheet(sheet.recoveryPassword, sheet.recoveryCode);
    assert.ok(restored.equals(masterKey));
  });

  test('rejette une feuille avec mot de passe modifie', () => {
    const masterKey = crypto.randomBytes(32);
    const sheet = createRecoverySheet(masterKey);
    const tampered = 'AAAA' + sheet.recoveryPassword.slice(4);
    assert.throws(() => restoreFromRecoverySheet(tampered, sheet.recoveryCode));
  });

  test('rejette un code modifie (alteration d\'un caractere)', () => {
    const masterKey = crypto.randomBytes(32);
    const sheet = createRecoverySheet(masterKey);
    // Modifier un caractere du code (pas un tiret)
    const positions = [];
    for (let i = 0; i < sheet.recoveryCode.length; i++) {
      if (sheet.recoveryCode[i] !== '-') positions.push(i);
    }
    // Inverser le premier caractere
    const idx = positions[0];
    const original = sheet.recoveryCode[idx];
    const alt = original === 'A' ? 'B' : 'A';
    const tampered = sheet.recoveryCode.slice(0, idx) + alt + sheet.recoveryCode.slice(idx + 1);
    assert.throws(() => restoreFromRecoverySheet(sheet.recoveryPassword, tampered));
  });

  test('accepte mot de passe avec espaces et tirets supplementaires', () => {
    const masterKey = crypto.randomBytes(32);
    const sheet = createRecoverySheet(masterKey);
    // Ajouter des espaces/tirets au mdp (saisie utilisateur typique)
    const messy = sheet.recoveryPassword.split('').join(' ');  // espaces entre chaque caractere
    const restored = restoreFromRecoverySheet(messy, sheet.recoveryCode);
    assert.ok(restored.equals(masterKey));
  });

  test('accepte code avec tirets et espaces variables', () => {
    const masterKey = crypto.randomBytes(32);
    const sheet = createRecoverySheet(masterKey);
    // Retirer tous les tirets
    const noTirets = sheet.recoveryCode.replace(/-/g, '');
    const restored = restoreFromRecoverySheet(sheet.recoveryPassword, noTirets);
    assert.ok(restored.equals(masterKey));
  });

  test('rejette un code de longueur incorrecte', () => {
    assert.throws(() => restoreFromRecoverySheet('A'.repeat(16), 'AAAAA-BBBBB'));
  });

  test('rejette un mot de passe de longueur incorrecte', () => {
    const masterKey = crypto.randomBytes(32);
    const sheet = createRecoverySheet(masterKey);
    assert.throws(() => restoreFromRecoverySheet('TROP-COURT', sheet.recoveryCode));
    assert.throws(() => restoreFromRecoverySheet('A'.repeat(20), sheet.recoveryCode));
  });

  test('rejette un mot de passe avec caracteres ambigus', () => {
    const masterKey = crypto.randomBytes(32);
    const sheet = createRecoverySheet(masterKey);
    // Remplacer un caractere par I qui n'est pas dans l'alphabet
    const tampered = 'I' + sheet.recoveryPassword.slice(1);
    assert.throws(() => restoreFromRecoverySheet(tampered, sheet.recoveryCode));
  });

  test('produit des feuilles differentes pour la meme MasterKey (salt aleatoire)', () => {
    const masterKey = crypto.randomBytes(32);
    const sheet1 = createRecoverySheet(masterKey);
    const sheet2 = createRecoverySheet(masterKey);
    assert.notEqual(sheet1.recoveryPassword, sheet2.recoveryPassword);
    assert.notEqual(sheet1.recoveryCode, sheet2.recoveryCode);
    // Mais les deux restaurent la meme MasterKey
    const r1 = restoreFromRecoverySheet(sheet1.recoveryPassword, sheet1.recoveryCode);
    const r2 = restoreFromRecoverySheet(sheet2.recoveryPassword, sheet2.recoveryCode);
    assert.ok(r1.equals(masterKey));
    assert.ok(r2.equals(masterKey));
  });

  test('rejette createRecoverySheet avec MasterKey de mauvaise taille', () => {
    assert.throws(() => createRecoverySheet(crypto.randomBytes(16)), TypeError);
    assert.throws(() => createRecoverySheet('pas un buffer'), TypeError);
  });
});
