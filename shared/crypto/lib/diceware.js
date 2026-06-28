/**
 * Generation de phrases secretes par tirage aleatoire de mots francais
 * (methode Diceware).
 *
 * Voir DESIGN_CHIFFREMENT_E2E.md section 4.3.
 */

'use strict';

const crypto = require('crypto');
const { WORDLIST_FR, WORDLIST_FR_SIZE, IS_PLACEHOLDER } = require('./wordlist-fr');

const DEFAULT_WORD_COUNT = 6;
const SEPARATOR = ' ';

/**
 * Tire un mot au hasard dans la wordlist, avec un alea cryptographiquement sur.
 *
 * Utilise crypto.randomInt qui fait du rejection sampling pour garantir une
 * distribution uniforme sans biais modulo. Crucial pour l'entropie cible.
 *
 * @returns {string} un mot de la wordlist
 */
function pickRandomWord() {
  const index = crypto.randomInt(0, WORDLIST_FR_SIZE);
  return WORDLIST_FR[index];
}

/**
 * Genere une phrase secrete de N mots francais tires au hasard.
 *
 * @param {number} wordCount nombre de mots (par defaut 6)
 * @returns {string} phrase secrete, mots separes par un espace simple
 *
 * @example
 *   generatePassphrase()   // "bateau foret cuivre montagne nuage soleil"
 *   generatePassphrase(8)  // 8 mots
 */
function generatePassphrase(wordCount = DEFAULT_WORD_COUNT) {
  if (!Number.isInteger(wordCount) || wordCount < 4 || wordCount > 12) {
    throw new RangeError(
      'generatePassphrase: wordCount doit etre un entier entre 4 et 12 (recu : ' + wordCount + ')'
    );
  }
  const words = [];
  for (let i = 0; i < wordCount; i++) {
    words.push(pickRandomWord());
  }
  return words.join(SEPARATOR);
}

/**
 * Verifie qu'une phrase secrete est correctement formee (6 mots de la wordlist).
 *
 * Tolerant aux espaces multiples et a la casse (les mots sont normalises en
 * minuscules avant comparaison). Ne fait PAS de verification cryptographique
 * (c'est le role du verifier), seulement une validation syntaxique pour
 * detecter une saisie utilisateur visiblement incorrecte.
 *
 * @param {string} phrase phrase secrete saisie par l'utilisateur
 * @param {number} expectedWordCount nombre de mots attendu (par defaut 6)
 * @returns {{ valid: boolean, normalized: string|null, error: string|null }}
 */
function validatePassphrase(phrase, expectedWordCount = DEFAULT_WORD_COUNT) {
  if (typeof phrase !== 'string') {
    return { valid: false, normalized: null, error: 'La phrase doit etre une chaine de caracteres.' };
  }
  const words = phrase.trim().toLowerCase().split(/\s+/);
  if (words.length !== expectedWordCount) {
    return {
      valid: false,
      normalized: null,
      error: 'La phrase doit contenir exactement ' + expectedWordCount +
             ' mots (recu : ' + words.length + ').'
    };
  }
  const wordSet = new Set(WORDLIST_FR);
  for (const word of words) {
    if (!wordSet.has(word)) {
      return {
        valid: false,
        normalized: null,
        error: 'Le mot "' + word + '" ne fait pas partie de la liste de mots Kheops. ' +
               'Verifier l\'orthographe et les accents.'
      };
    }
  }
  return { valid: true, normalized: words.join(SEPARATOR), error: null };
}

/**
 * Calcule l'entropie en bits d'une phrase de N mots tires dans la wordlist
 * courante. Utile pour les tests et l'affichage UI ("votre phrase a X bits
 * de protection").
 *
 * @param {number} wordCount nombre de mots
 * @returns {number} bits d'entropie
 */
function entropyBits(wordCount = DEFAULT_WORD_COUNT) {
  return Math.log2(Math.pow(WORDLIST_FR_SIZE, wordCount));
}

module.exports = {
  generatePassphrase,
  validatePassphrase,
  entropyBits,
  pickRandomWord,
  DEFAULT_WORD_COUNT,
  WORDLIST_IS_PLACEHOLDER: IS_PLACEHOLDER
};
