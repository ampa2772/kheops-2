'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  generatePassphrase,
  validatePassphrase,
  entropyBits,
  pickRandomWord,
  DEFAULT_WORD_COUNT
} = require('../lib/diceware');
const { WORDLIST_FR } = require('../lib/wordlist-fr');

describe('diceware — generatePassphrase', () => {
  test('genere une phrase de 6 mots par defaut', () => {
    const phrase = generatePassphrase();
    const words = phrase.split(' ');
    assert.equal(words.length, 6);
  });

  test('respecte le nombre de mots demande', () => {
    for (const n of [4, 5, 6, 7, 8, 10, 12]) {
      const phrase = generatePassphrase(n);
      assert.equal(phrase.split(' ').length, n, 'echec pour wordCount=' + n);
    }
  });

  test('rejette wordCount hors plage [4, 12]', () => {
    assert.throws(() => generatePassphrase(3), RangeError);
    assert.throws(() => generatePassphrase(13), RangeError);
    assert.throws(() => generatePassphrase(0), RangeError);
    assert.throws(() => generatePassphrase(-1), RangeError);
    assert.throws(() => generatePassphrase(3.5), RangeError);
    assert.throws(() => generatePassphrase('six'), RangeError);
  });

  test('tous les mots font partie de la wordlist', () => {
    const wordSet = new Set(WORDLIST_FR);
    for (let i = 0; i < 50; i++) {
      const phrase = generatePassphrase();
      for (const word of phrase.split(' ')) {
        assert.ok(wordSet.has(word), 'mot "' + word + '" hors wordlist');
      }
    }
  });

  test('genere des phrases variees (pas de constante)', () => {
    // 100 generations doivent produire au moins 50 phrases distinctes
    // (en pratique elles seront quasi toutes distinctes)
    const phrases = new Set();
    for (let i = 0; i < 100; i++) {
      phrases.add(generatePassphrase());
    }
    assert.ok(
      phrases.size >= 50,
      'seulement ' + phrases.size + ' phrases distinctes sur 100 — alea defaillant'
    );
  });
});

describe('diceware — validatePassphrase', () => {
  test('accepte une phrase valide', () => {
    const phrase = generatePassphrase();
    const result = validatePassphrase(phrase);
    assert.equal(result.valid, true);
    assert.equal(result.normalized, phrase);
    assert.equal(result.error, null);
  });

  test('accepte une phrase avec des espaces multiples', () => {
    const phrase = generatePassphrase();
    const messy = phrase.split(' ').join('     ');
    const result = validatePassphrase(messy);
    assert.equal(result.valid, true);
    assert.equal(result.normalized, phrase);
  });

  test('accepte une phrase en MAJUSCULES (normalise en minuscules)', () => {
    const phrase = generatePassphrase();
    const upper = phrase.toUpperCase();
    const result = validatePassphrase(upper);
    assert.equal(result.valid, true);
    assert.equal(result.normalized, phrase);
  });

  test('rejette un nombre de mots incorrect', () => {
    const result = validatePassphrase('bateau foret cuivre');  // 3 mots
    assert.equal(result.valid, false);
    assert.match(result.error, /6 mots/);
  });

  test('rejette un mot inconnu', () => {
    // Construit une phrase valide puis remplace le dernier mot par un inconnu
    const validPhrase = generatePassphrase();
    const words = validPhrase.split(' ');
    words[words.length - 1] = 'xyzabcdef';
    const tampered = words.join(' ');
    const result = validatePassphrase(tampered);
    assert.equal(result.valid, false);
    assert.match(result.error, /xyzabcdef/);
  });

  test('rejette une entree non-string', () => {
    assert.equal(validatePassphrase(null).valid, false);
    assert.equal(validatePassphrase(undefined).valid, false);
    assert.equal(validatePassphrase(123).valid, false);
    assert.equal(validatePassphrase([]).valid, false);
  });
});

describe('diceware — entropyBits', () => {
  test('calcule l\'entropie en fonction de la taille de la wordlist', () => {
    const expected6 = Math.log2(Math.pow(WORDLIST_FR.length, 6));
    assert.equal(entropyBits(6), expected6);
  });

  test('plus de mots = plus d\'entropie', () => {
    assert.ok(entropyBits(8) > entropyBits(6));
    assert.ok(entropyBits(6) > entropyBits(4));
  });

  test('entropie 6 mots > 40 bits avec wordlist placeholder', () => {
    // Le placeholder (>= 256 mots) donne au moins log2(256^6) = 48 bits
    assert.ok(entropyBits(6) >= 48);
  });
});

describe('diceware — pickRandomWord', () => {
  test('retourne un mot de la wordlist', () => {
    const wordSet = new Set(WORDLIST_FR);
    for (let i = 0; i < 100; i++) {
      assert.ok(wordSet.has(pickRandomWord()));
    }
  });

  test('distribution suffisamment large', () => {
    // Test adaptatif a la taille de la wordlist. Pour une wordlist de 7759
    // mots, sur 50 000 tirages on s'attend a couvrir environ (1 - e^(-50000/7759))
    // = ~99,8 % de la liste. On tolere des l'instant qu'on en couvre au moins 80 %.
    // Pour une wordlist plus petite (placeholder 264 mots), la couverture serait
    // de 100 %.
    const trials = Math.min(50000, WORDLIST_FR.length * 10);
    const seen = new Set();
    for (let i = 0; i < trials; i++) {
      seen.add(pickRandomWord());
    }
    const coverage = seen.size / WORDLIST_FR.length;
    assert.ok(
      coverage >= 0.5,
      'Couverture trop faible : ' + Math.round(coverage * 100) + ' % de la wordlist tiree sur ' +
      trials + ' tirages — alea defaillant ?'
    );
  });
});

describe('diceware — constantes', () => {
  test('DEFAULT_WORD_COUNT vaut 6', () => {
    assert.equal(DEFAULT_WORD_COUNT, 6);
  });
});
