/**
 * Chiffrement authentifie AES-256-GCM.
 *
 * Utilise le module `crypto` natif de Node. C'est le meme algorithme que
 * `server/utils/tokenCrypto.js` deja en production pour les refresh tokens
 * OAuth.
 *
 * Voir DESIGN_CHIFFREMENT_E2E.md section 4.3.
 */

'use strict';

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const KEY_LENGTH = 32;     // AES-256
const IV_LENGTH = 12;      // GCM standard
const TAG_LENGTH = 16;     // Tag d'authentification GCM
const DEK_LENGTH = 32;     // Data Encryption Key par objet

/**
 * Genere une DEK aleatoire de 32 octets pour un nouvel objet (fichier ou
 * message). Chaque objet a sa propre DEK pour minimiser l'impact d'une
 * compromission isolee.
 *
 * @returns {Buffer} DEK de 32 octets
 */
function generateDek() {
  return crypto.randomBytes(DEK_LENGTH);
}

/**
 * Chiffre un buffer avec une cle de 32 octets.
 *
 * @param {Buffer} plaintext donnees a chiffrer
 * @param {Buffer} key cle de 32 octets (MasterKey ou DEK)
 * @returns {{ iv: Buffer, tag: Buffer, ciphertext: Buffer }}
 */
function encryptBuffer(plaintext, key) {
  if (!Buffer.isBuffer(plaintext)) {
    throw new TypeError('encryptBuffer: plaintext doit etre un Buffer');
  }
  if (!Buffer.isBuffer(key) || key.length !== KEY_LENGTH) {
    throw new TypeError('encryptBuffer: key doit etre un Buffer de ' + KEY_LENGTH + ' octets');
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, tag, ciphertext };
}

/**
 * Dechiffre un buffer avec une cle de 32 octets. Verifie l'authenticite
 * via le tag GCM. Lance une erreur si le tag est invalide (donnees
 * corrompues ou cle incorrecte).
 *
 * @param {Buffer} ciphertext donnees chiffrees
 * @param {Buffer} key cle de 32 octets
 * @param {Buffer} iv vecteur d'initialisation (12 octets)
 * @param {Buffer} tag tag d'authentification (16 octets)
 * @returns {Buffer} plaintext
 */
function decryptBuffer(ciphertext, key, iv, tag) {
  if (!Buffer.isBuffer(ciphertext)) {
    throw new TypeError('decryptBuffer: ciphertext doit etre un Buffer');
  }
  if (!Buffer.isBuffer(key) || key.length !== KEY_LENGTH) {
    throw new TypeError('decryptBuffer: key doit etre un Buffer de ' + KEY_LENGTH + ' octets');
  }
  if (!Buffer.isBuffer(iv) || iv.length !== IV_LENGTH) {
    throw new TypeError('decryptBuffer: iv doit etre un Buffer de ' + IV_LENGTH + ' octets');
  }
  if (!Buffer.isBuffer(tag) || tag.length !== TAG_LENGTH) {
    throw new TypeError('decryptBuffer: tag doit etre un Buffer de ' + TAG_LENGTH + ' octets');
  }
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Enveloppe (wrap) une DEK avec la MasterKey. C'est un cas particulier de
 * chiffrement, sans difference algorithmique avec encryptBuffer, mais on
 * expose une API explicite pour la lisibilite du code appelant.
 *
 * @param {Buffer} dek cle a envelopper (32 octets)
 * @param {Buffer} masterKey MasterKey du cabinet (32 octets)
 * @returns {{ iv: Buffer, tag: Buffer, wrapped: Buffer }}
 */
function wrapDek(dek, masterKey) {
  if (!Buffer.isBuffer(dek) || dek.length !== DEK_LENGTH) {
    throw new TypeError('wrapDek: dek doit etre un Buffer de ' + DEK_LENGTH + ' octets');
  }
  const result = encryptBuffer(dek, masterKey);
  return { iv: result.iv, tag: result.tag, wrapped: result.ciphertext };
}

/**
 * Inverse de wrapDek : extrait la DEK a partir de sa version enveloppee.
 *
 * @param {Buffer} wrapped DEK enveloppee
 * @param {Buffer} masterKey MasterKey du cabinet
 * @param {Buffer} iv IV utilise lors du wrap
 * @param {Buffer} tag tag d'authentification du wrap
 * @returns {Buffer} DEK (32 octets)
 */
function unwrapDek(wrapped, masterKey, iv, tag) {
  return decryptBuffer(wrapped, masterKey, iv, tag);
}

module.exports = {
  generateDek,
  encryptBuffer,
  decryptBuffer,
  wrapDek,
  unwrapDek,
  ALGO,
  KEY_LENGTH,
  IV_LENGTH,
  TAG_LENGTH,
  DEK_LENGTH
};
