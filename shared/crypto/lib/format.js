/**
 * Serialisation et deserialisation du format `enc:v2:...`.
 *
 * Le format est versionne pour permettre une evolution future (passage a
 * Argon2id, changement d'algorithme, ajout de metadonnees). La premiere
 * version utilisee par Kheops 2 pour les donnees E2E est `v2` (la `v1`
 * etant deja occupee par `server/utils/tokenCrypto.js` pour les refresh
 * tokens OAuth chiffres cote serveur).
 *
 * Format texte (pour Atlas) :
 *
 *   enc:v2:<iv_data-hex>:<tag_data-hex>:<iv_dek-hex>:<tag_dek-hex>:<dek_wrapped-hex>:<ciphertext-b64>
 *
 * Format binaire (pour Drive — fichiers .kbox) :
 *
 *   [4 octets ASCII "KBX2"]                magic
 *   [4 octets uint32 BE]                   longueur du header JSON
 *   [N octets UTF-8]                       header JSON (voir DESIGN section 5.1)
 *   [M octets]                             ciphertext brut
 *
 * Voir DESIGN_CHIFFREMENT_E2E.md sections 4.4 et 5.
 */

'use strict';

const aead = require('./aead');

const FORMAT_VERSION = 2;
const TEXT_PREFIX = 'enc:v2:';
const BINARY_MAGIC = Buffer.from('KBX2', 'ascii');

// -- Format texte (pour Atlas et chat) ----------------------------------

/**
 * Chiffre un Buffer et serialise au format texte `enc:v2:...`.
 *
 * @param {Buffer} plaintext donnees a chiffrer
 * @param {Buffer} masterKey MasterKey du cabinet (32 octets)
 * @returns {string} chaine prefixee `enc:v2:` pretes a stocker en Atlas
 */
function encryptToString(plaintext, masterKey) {
  const dek = aead.generateDek();
  const wrap = aead.wrapDek(dek, masterKey);
  const data = aead.encryptBuffer(plaintext, dek);
  return [
    TEXT_PREFIX,
    data.iv.toString('hex'),
    ':',
    data.tag.toString('hex'),
    ':',
    wrap.iv.toString('hex'),
    ':',
    wrap.tag.toString('hex'),
    ':',
    wrap.wrapped.toString('hex'),
    ':',
    data.ciphertext.toString('base64')
  ].join('');
}

/**
 * Deserialise une chaine `enc:v2:...` et dechiffre avec la MasterKey.
 *
 * @param {string} encoded chaine au format texte
 * @param {Buffer} masterKey MasterKey du cabinet
 * @returns {Buffer} plaintext
 */
function decryptFromString(encoded, masterKey) {
  if (typeof encoded !== 'string' || !encoded.startsWith(TEXT_PREFIX)) {
    throw new Error('decryptFromString: prefixe manquant ou invalide (attendu : ' + TEXT_PREFIX + ')');
  }
  const parts = encoded.slice(TEXT_PREFIX.length).split(':');
  if (parts.length !== 6) {
    throw new Error('decryptFromString: format invalide (attendu 6 segments, recu ' + parts.length + ')');
  }
  const [ivDataHex, tagDataHex, ivDekHex, tagDekHex, wrappedHex, ciphertextB64] = parts;
  const ivData = Buffer.from(ivDataHex, 'hex');
  const tagData = Buffer.from(tagDataHex, 'hex');
  const ivDek = Buffer.from(ivDekHex, 'hex');
  const tagDek = Buffer.from(tagDekHex, 'hex');
  const wrapped = Buffer.from(wrappedHex, 'hex');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  const dek = aead.unwrapDek(wrapped, masterKey, ivDek, tagDek);
  return aead.decryptBuffer(ciphertext, dek, ivData, tagData);
}

// -- Format binaire (pour Drive — fichiers .kbox) ----------------------

/**
 * Chiffre un Buffer et le serialise au format binaire `.kbox`.
 *
 * @param {Buffer} plaintext contenu du fichier
 * @param {Buffer} masterKey MasterKey du cabinet
 * @param {object} meta metadonnees additionnelles (originalName, originalMime, cabinetId, createdAt)
 * @returns {Buffer} blob binaire au format .kbox
 */
function encryptToBlob(plaintext, masterKey, meta = {}) {
  const dek = aead.generateDek();
  const wrap = aead.wrapDek(dek, masterKey);
  const data = aead.encryptBuffer(plaintext, dek);

  const header = {
    v: FORMAT_VERSION,
    alg: aead.ALGO,
    iv_data: data.iv.toString('hex'),
    tag_data: data.tag.toString('hex'),
    iv_dek: wrap.iv.toString('hex'),
    tag_dek: wrap.tag.toString('hex'),
    dek_wrapped: wrap.wrapped.toString('hex'),
    original_name: meta.originalName || null,
    original_mime: meta.originalMime || null,
    cabinet_id: meta.cabinetId || null,
    created_at: meta.createdAt || new Date().toISOString()
  };

  const headerJson = Buffer.from(JSON.stringify(header), 'utf8');
  const headerLength = Buffer.alloc(4);
  headerLength.writeUInt32BE(headerJson.length, 0);

  return Buffer.concat([BINARY_MAGIC, headerLength, headerJson, data.ciphertext]);
}

/**
 * Lit un blob binaire `.kbox` et dechiffre avec la MasterKey.
 *
 * @param {Buffer} blob contenu du fichier .kbox
 * @param {Buffer} masterKey MasterKey du cabinet
 * @returns {{ plaintext: Buffer, meta: object }} contenu dechiffre et metadonnees du header
 */
function decryptFromBlob(blob, masterKey) {
  if (!Buffer.isBuffer(blob)) {
    throw new TypeError('decryptFromBlob: blob doit etre un Buffer');
  }
  if (blob.length < 8) {
    throw new Error('decryptFromBlob: blob trop court (< 8 octets, en-tete impossible)');
  }
  if (!blob.subarray(0, 4).equals(BINARY_MAGIC)) {
    throw new Error('decryptFromBlob: magic invalide (attendu "KBX2")');
  }
  const headerLength = blob.readUInt32BE(4);
  if (blob.length < 8 + headerLength) {
    throw new Error('decryptFromBlob: blob trop court pour le header annonce');
  }
  let header;
  try {
    header = JSON.parse(blob.subarray(8, 8 + headerLength).toString('utf8'));
  } catch (e) {
    throw new Error('decryptFromBlob: header JSON invalide : ' + e.message);
  }
  if (header.v !== FORMAT_VERSION) {
    throw new Error('decryptFromBlob: version de format non supportee (' + header.v + ')');
  }

  const ciphertext = blob.subarray(8 + headerLength);

  const ivData = Buffer.from(header.iv_data, 'hex');
  const tagData = Buffer.from(header.tag_data, 'hex');
  const ivDek = Buffer.from(header.iv_dek, 'hex');
  const tagDek = Buffer.from(header.tag_dek, 'hex');
  const wrapped = Buffer.from(header.dek_wrapped, 'hex');

  const dek = aead.unwrapDek(wrapped, masterKey, ivDek, tagDek);
  const plaintext = aead.decryptBuffer(ciphertext, dek, ivData, tagData);

  return {
    plaintext,
    meta: {
      originalName: header.original_name,
      originalMime: header.original_mime,
      cabinetId: header.cabinet_id,
      createdAt: header.created_at
    }
  };
}

/**
 * Lit uniquement le header d'un blob `.kbox` sans dechiffrer le contenu.
 * Utile pour l'UI (afficher le nom original, le type MIME, la date sans
 * payer le cout de dechiffrement).
 *
 * @param {Buffer} blob contenu du fichier .kbox
 * @returns {object} header
 */
function readBlobHeader(blob) {
  if (!Buffer.isBuffer(blob) || blob.length < 8) {
    throw new Error('readBlobHeader: blob trop court');
  }
  if (!blob.subarray(0, 4).equals(BINARY_MAGIC)) {
    throw new Error('readBlobHeader: magic invalide');
  }
  const headerLength = blob.readUInt32BE(4);
  return JSON.parse(blob.subarray(8, 8 + headerLength).toString('utf8'));
}

module.exports = {
  encryptToString,
  decryptFromString,
  encryptToBlob,
  decryptFromBlob,
  readBlobHeader,
  FORMAT_VERSION,
  TEXT_PREFIX,
  BINARY_MAGIC
};
