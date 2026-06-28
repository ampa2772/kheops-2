/**
 * Derivation de cle (Key Derivation Function) a partir de la phrase secrete.
 *
 * Implementation scrypt natif Node (RFC 7914), recommandation OWASP 2024
 * comme alternative directe a Argon2id sans dependance native a compiler.
 *
 * Voir DESIGN_CHIFFREMENT_E2E.md section 4.3.
 */

'use strict';

const crypto = require('crypto');

// Parametres scrypt (recommandation OWASP 2024)
// N = 2^17 = 131072 (facteur cout CPU/RAM)
// r = 8 (facteur de taille de bloc)
// p = 1 (parallelisme)
// Memoire requise : 128 * N * r = 128 * 131072 * 8 = ~134 Mo
// Duree typique : 0.5 a 2 secondes selon le CPU
const SCRYPT_PARAMS = {
  N: 1 << 17,        // 131072
  r: 8,
  p: 1,
  maxmem: 256 * 1024 * 1024  // 256 Mo (marge confortable)
};

const MASTER_KEY_LENGTH = 32;   // AES-256 = cle de 32 octets
const SALT_LENGTH = 16;          // 16 octets aleatoires par cabinet

/**
 * Genere un sel aleatoire de 16 octets pour un nouveau cabinet.
 * Le sel est public (stocke en clair cote serveur), il sert uniquement a
 * empecher les attaques par rainbow tables.
 *
 * @returns {Buffer} sel de 16 octets
 */
function generateSalt() {
  return crypto.randomBytes(SALT_LENGTH);
}

/**
 * Derive la MasterKey du cabinet a partir de la phrase secrete et du sel.
 *
 * Fonction deterministe : la meme (phrase, sel) produit toujours la meme
 * MasterKey. C'est ce qui permet a deux avocats du meme cabinet, sur deux
 * machines differentes, d'obtenir la meme cle a partir de la meme phrase.
 *
 * @param {string} passphrase phrase secrete (six mots francais)
 * @param {Buffer} salt sel du cabinet (16 octets)
 * @returns {Buffer} MasterKey de 32 octets
 */
function deriveMasterKey(passphrase, salt) {
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new TypeError('deriveMasterKey: passphrase doit etre une chaine non vide');
  }
  if (!Buffer.isBuffer(salt) || salt.length !== SALT_LENGTH) {
    throw new TypeError(
      'deriveMasterKey: salt doit etre un Buffer de ' + SALT_LENGTH + ' octets'
    );
  }

  // Normalisation Unicode pour eviter les variations d'encodage entre OS
  // (NFC = forme canonique composee, recommandee pour les mots de passe).
  const normalized = passphrase.normalize('NFC');

  return crypto.scryptSync(normalized, salt, MASTER_KEY_LENGTH, SCRYPT_PARAMS);
}

module.exports = {
  generateSalt,
  deriveMasterKey,
  SALT_LENGTH,
  MASTER_KEY_LENGTH,
  SCRYPT_PARAMS
};
