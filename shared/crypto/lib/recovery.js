/**
 * Mecanisme de feuille de secours (recovery sheet).
 *
 * Genere une copie protegee de la MasterKey, lisible uniquement avec un
 * mot de passe de secours imprime sur la meme feuille. Permet a un avocat
 * d'un cabinet protege de retrouver l'acces a ses documents en cas d'oubli
 * total de la phrase secrete ET de perte de tous les ordinateurs.
 *
 * Architecture (DESIGN_CHIFFREMENT_E2E.md sections 4 et 6.4bis) :
 *
 *   recoveryPassword (16 caracteres alphanumeriques non-ambigus)
 *      |
 *      | scrypt(recoveryPassword, recoverySalt, parametres OWASP)
 *      v
 *   recoveryKey (32 octets, jamais persistee, derivee a la volee)
 *      |
 *      | AES-256-GCM-wrap(MasterKey, recoveryKey)
 *      v
 *   wrappedMasterKey + iv + tag
 *
 * La feuille de secours imprimee contient :
 *   - recoveryPassword (en clair, lisible humain, type "ABCDEFGH12345678")
 *   - recoveryCode = base32(recoverySalt + iv + tag + wrappedMasterKey)
 *     en groupes de 5 caracteres separes par des tirets, pour saisie
 *     manuelle ulterieure.
 *
 * SANS le recoveryPassword, le recoveryCode est cryptographiquement
 * inutile : seul scrypt suivi du dechiffrement AES-GCM permet d'extraire
 * la MasterKey. C'est pour cela que la feuille est complete par construction.
 *
 * Securite : un attaquant qui obtiendrait la feuille (vol au cabinet)
 * pourrait dechiffrer les fichiers. C'est pour cela que la notice
 * recommande de la conserver en lieu sur (coffre, notaire, banque) et
 * en deux exemplaires dans des lieux differents.
 */

'use strict';

const crypto = require('crypto');
const aead = require('./aead');
const kdf = require('./kdf');

// Alphabet sans caracteres ambigus (pas de I, O, 0, 1, 8 vs B).
// 30 caracteres au lieu de 32 pour eviter les erreurs de saisie manuelle.
const RECOVERY_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_PASSWORD_LENGTH = 16;

const RECOVERY_SALT_LENGTH = 16;

// Alphabet base32 standard RFC 4648 (sans 0/1/8/9 ambigus, mais avec 2-7)
// Garde la compatibilite avec d'autres outils si besoin d'interop futur.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// ============================================================
// Generation du mot de passe de secours
// ============================================================

/**
 * Genere un mot de passe de secours aleatoire de 16 caracteres, lisible
 * humain (alphabet sans I, O, 0, 1).
 *
 * Entropie : log2(30^16) ~= 78 bits, equivalent a la MasterKey elle-meme.
 *
 * @returns {string} mot de passe de secours
 */
function generateRecoveryPassword() {
  let pwd = '';
  for (let i = 0; i < RECOVERY_PASSWORD_LENGTH; i++) {
    const idx = crypto.randomInt(0, RECOVERY_PASSWORD_ALPHABET.length);
    pwd += RECOVERY_PASSWORD_ALPHABET[idx];
  }
  return pwd;
}

// ============================================================
// Encodage base32 (RFC 4648, sans padding) groupe en blocs de 5
// ============================================================

function encodeBase32(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('encodeBase32: buffer attendu');
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

function decodeBase32(str) {
  if (typeof str !== 'string') throw new TypeError('decodeBase32: chaine attendue');
  const clean = str.replace(/[-\s]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const output = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx < 0) {
      throw new Error('Caractere "' + clean[i] + '" invalide dans le code de secours.');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

/**
 * Formate une chaine base32 en groupes de 5 caracteres separes par tirets.
 * Lisible / saisissable a la main. Exemple : "ABCDE-FGHIJ-KLMNO-PQRST".
 */
function groupBase32(str) {
  const groups = str.match(/.{1,5}/g) || [];
  return groups.join('-');
}

// ============================================================
// Creation de la feuille de secours
// ============================================================

/**
 * Cree une feuille de secours pour la MasterKey fournie.
 *
 * Resultat utilisable pour generer un document a imprimer :
 *   - recoveryPassword : a imprimer en clair, en gros, sur la feuille
 *   - recoveryCode : a imprimer en clair, en groupes de 5 caracteres
 *
 * @param {Buffer} masterKey MasterKey du cabinet (32 octets)
 * @returns {{ recoveryPassword: string, recoveryCode: string }}
 */
function createRecoverySheet(masterKey) {
  if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32) {
    throw new TypeError('createRecoverySheet: masterKey doit etre un Buffer de 32 octets');
  }
  const recoveryPassword = generateRecoveryPassword();
  const recoverySalt = crypto.randomBytes(RECOVERY_SALT_LENGTH);

  // Derivation scrypt (memes parametres que la MasterKey du cabinet)
  const recoveryKey = kdf.deriveMasterKey(recoveryPassword, recoverySalt);

  // Chiffrement AES-256-GCM de la MasterKey avec la recoveryKey
  const wrap = aead.encryptBuffer(masterKey, recoveryKey);

  // Blob a encoder : salt(16) + iv(12) + tag(16) + ciphertext(32) = 76 octets
  const blob = Buffer.concat([recoverySalt, wrap.iv, wrap.tag, wrap.ciphertext]);
  const recoveryCode = groupBase32(encodeBase32(blob));

  // Effacer la recoveryKey de la memoire (best-effort)
  recoveryKey.fill(0);

  return { recoveryPassword, recoveryCode };
}

/**
 * Restaure la MasterKey a partir d'une feuille de secours.
 *
 * @param {string} recoveryPassword 16 caracteres (peut contenir des espaces, sera nettoye)
 * @param {string} recoveryCode chaine base32 (avec ou sans tirets/espaces)
 * @returns {Buffer} MasterKey reconstruite (32 octets)
 * @throws Error si une des entrees est invalide ou si le dechiffrement echoue
 */
function restoreFromRecoverySheet(recoveryPassword, recoveryCode) {
  if (typeof recoveryPassword !== 'string') {
    throw new TypeError('Le mot de passe de secours doit etre une chaine.');
  }
  const cleanPassword = recoveryPassword.replace(/[\s-]/g, '').toUpperCase();
  if (cleanPassword.length !== RECOVERY_PASSWORD_LENGTH) {
    throw new Error(
      'Le mot de passe de secours doit contenir exactement ' + RECOVERY_PASSWORD_LENGTH +
      ' caracteres (recu : ' + cleanPassword.length + ').'
    );
  }
  for (const c of cleanPassword) {
    if (RECOVERY_PASSWORD_ALPHABET.indexOf(c) < 0) {
      throw new Error('Caractere "' + c + '" invalide dans le mot de passe de secours.');
    }
  }
  if (typeof recoveryCode !== 'string') {
    throw new TypeError('Le code de secours doit etre une chaine.');
  }

  const blob = decodeBase32(recoveryCode);
  if (blob.length !== 76) {
    throw new Error(
      'Le code de secours a une longueur incorrecte (' + blob.length +
      ' octets, 76 attendus). Verifiez la saisie.'
    );
  }

  const recoverySalt = blob.subarray(0, 16);
  const iv = blob.subarray(16, 28);
  const tag = blob.subarray(28, 44);
  const ciphertext = blob.subarray(44, 76);

  const recoveryKey = kdf.deriveMasterKey(cleanPassword, recoverySalt);

  let masterKey;
  try {
    masterKey = aead.decryptBuffer(ciphertext, recoveryKey, iv, tag);
  } catch (err) {
    recoveryKey.fill(0);
    throw new Error(
      'Le mot de passe de secours ou le code de secours est incorrect, ou la feuille a ete corrompue.'
    );
  }
  recoveryKey.fill(0);

  if (masterKey.length !== 32) {
    throw new Error('MasterKey reconstruite invalide (taille ' + masterKey.length + ').');
  }
  return masterKey;
}

module.exports = {
  generateRecoveryPassword,
  createRecoverySheet,
  restoreFromRecoverySheet,
  encodeBase32,
  decodeBase32,
  groupBase32,
  RECOVERY_PASSWORD_LENGTH,
  RECOVERY_PASSWORD_ALPHABET,
  RECOVERY_SALT_LENGTH,
};
