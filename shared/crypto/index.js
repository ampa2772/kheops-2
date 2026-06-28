/**
 * @kheops/crypto — point d'entree du module de chiffrement E2E.
 *
 * Reexporte les fonctions publiques des sous-modules pour offrir une API
 * unique aux consommateurs (client React, serveur Express, agent Electron).
 *
 * Usage typique cote client (creation d'un cabinet) :
 *
 *   const crypto = require('@kheops/crypto');
 *
 *   // Generation
 *   const phrase = crypto.generatePassphrase();
 *   const salt = crypto.generateSalt();
 *   const masterKey = crypto.deriveMasterKey(phrase, salt);
 *   const verifier = crypto.computeVerifier(masterKey);
 *
 *   // Envoyer { salt, verifier } au serveur. La phrase et la MasterKey ne
 *   // quittent JAMAIS la machine.
 *
 * Usage typique cote agent Electron (chiffrement avant upload Drive) :
 *
 *   const blob = crypto.encryptToBlob(buffer, masterKey, {
 *     originalName: 'Conclusions_Dupont.docx',
 *     originalMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 *     cabinetId: cabinet._id
 *   });
 *   await uploadFileToCloud(blob, '<uuid>.kbox', folderId);
 *
 * Usage typique apres download Drive :
 *
 *   const { plaintext, meta } = crypto.decryptFromBlob(downloadedBlob, masterKey);
 *   // ecrire plaintext dans le cache local et ouvrir avec l'app systeme
 *
 * Voir DESIGN_CHIFFREMENT_E2E.md sections 6 et 7.
 */

'use strict';

const diceware = require('./lib/diceware');
const kdf = require('./lib/kdf');
const aead = require('./lib/aead');
const verifier = require('./lib/verifier');
const format = require('./lib/format');
const recovery = require('./lib/recovery');

module.exports = {
  // -- Diceware (generation de phrase) --
  generatePassphrase: diceware.generatePassphrase,
  validatePassphrase: diceware.validatePassphrase,
  entropyBits: diceware.entropyBits,
  WORDLIST_IS_PLACEHOLDER: diceware.WORDLIST_IS_PLACEHOLDER,

  // -- KDF (derivation de cle) --
  generateSalt: kdf.generateSalt,
  deriveMasterKey: kdf.deriveMasterKey,
  SALT_LENGTH: kdf.SALT_LENGTH,
  MASTER_KEY_LENGTH: kdf.MASTER_KEY_LENGTH,

  // -- AEAD (chiffrement bas niveau) --
  generateDek: aead.generateDek,
  encryptBuffer: aead.encryptBuffer,
  decryptBuffer: aead.decryptBuffer,
  wrapDek: aead.wrapDek,
  unwrapDek: aead.unwrapDek,

  // -- Verifier serveur --
  computeVerifier: verifier.computeVerifier,
  verifyVerifier: verifier.verifyVerifier,

  // -- Format de stockage --
  encryptToString: format.encryptToString,
  decryptFromString: format.decryptFromString,
  encryptToBlob: format.encryptToBlob,
  decryptFromBlob: format.decryptFromBlob,
  readBlobHeader: format.readBlobHeader,
  FORMAT_VERSION: format.FORMAT_VERSION,
  TEXT_PREFIX: format.TEXT_PREFIX,
  BINARY_MAGIC: format.BINARY_MAGIC,

  // -- Feuille de secours (recovery sheet) --
  createRecoverySheet: recovery.createRecoverySheet,
  restoreFromRecoverySheet: recovery.restoreFromRecoverySheet,
  generateRecoveryPassword: recovery.generateRecoveryPassword,
  RECOVERY_PASSWORD_LENGTH: recovery.RECOVERY_PASSWORD_LENGTH,
};
