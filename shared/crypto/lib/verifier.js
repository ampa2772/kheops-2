/**
 * Calcul et verification du VERIFIER serveur.
 *
 * Le verifier est un HMAC-SHA256 de la MasterKey, stocke cote serveur Kheops.
 * Il permet au serveur de verifier qu'une phrase secrete saisie par
 * l'utilisateur est correcte, **sans** que le serveur n'apprenne jamais ni la
 * phrase, ni la MasterKey elle-meme.
 *
 * Propriete cryptographique : HMAC est a sens unique. Connaitre le verifier
 * n'aide en rien a retrouver la MasterKey.
 *
 * Voir DESIGN_CHIFFREMENT_E2E.md section 4.1 (schema cryptographique) et 6.2
 * (flux d'enrolement d'un nouvel avocat).
 */

'use strict';

const crypto = require('crypto');

// Domaine du HMAC : chaine fixe qui isole l'usage "verifier" d'eventuels
// autres usages futurs du HMAC sur la MasterKey. Versionne.
const VERIFIER_DOMAIN = 'kheops-verifier-v2';

const VERIFIER_LENGTH = 32;  // SHA-256 = 32 octets

/**
 * Calcule le verifier d'une MasterKey.
 *
 * @param {Buffer} masterKey MasterKey du cabinet (32 octets)
 * @returns {string} verifier en hexadecimal (64 caracteres)
 */
function computeVerifier(masterKey) {
  if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32) {
    throw new TypeError('computeVerifier: masterKey doit etre un Buffer de 32 octets');
  }
  const hmac = crypto.createHmac('sha256', masterKey);
  hmac.update(VERIFIER_DOMAIN);
  return hmac.digest('hex');
}

/**
 * Compare en temps constant deux verifiers. Le temps constant evite les
 * attaques par mesure de duree (timing attacks).
 *
 * @param {string} verifierA premier verifier en hex
 * @param {string} verifierB second verifier en hex
 * @returns {boolean} true si identiques
 */
function verifyVerifier(verifierA, verifierB) {
  if (typeof verifierA !== 'string' || typeof verifierB !== 'string') {
    return false;
  }
  if (verifierA.length !== verifierB.length) {
    return false;
  }
  const bufA = Buffer.from(verifierA, 'hex');
  const bufB = Buffer.from(verifierB, 'hex');
  if (bufA.length !== VERIFIER_LENGTH || bufB.length !== VERIFIER_LENGTH) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  computeVerifier,
  verifyVerifier,
  VERIFIER_DOMAIN,
  VERIFIER_LENGTH
};
