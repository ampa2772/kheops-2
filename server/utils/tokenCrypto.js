// server/utils/tokenCrypto.js
//
// Chiffrement au repos des refresh tokens OAuth (Google / Microsoft) avec
// AES-256-GCM. La clef vient de la variable d'environnement
// TOKEN_ENCRYPTION_KEY (32 bytes hex = 64 chars) ou, en absence, est derivee
// par PBKDF2 du JWT_SECRET (fallback dev — moins fort mais evite le crash).
//
// Format des valeurs chiffrees : `enc:v1:<iv-hex>:<tag-hex>:<ciphertext-hex>`.
// Le prefixe `enc:v1:` permet :
//   - de detecter les valeurs en clair (legacy) lors de la lecture
//   - de migrer les schemas plus tard (v2, v3...) sans casser l'existant
//
// Migration : appeler `encryptIfNeeded(value)` avant ecriture en DB,
// `decryptIfNeeded(value)` apres lecture. Les valeurs existantes en clair
// sont retournees telles quelles par decryptIfNeeded ; lors d'une re-ecriture
// elles seront alors chiffrees automatiquement.

const crypto = require('crypto');

const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;     // recommande pour GCM
const TAG_LEN = 16;

let cachedKey = null;

function deriveKey() {
    if (cachedKey) return cachedKey;
    const envKey = process.env.TOKEN_ENCRYPTION_KEY;
    if (envKey && /^[0-9a-fA-F]{64}$/.test(envKey)) {
        cachedKey = Buffer.from(envKey, 'hex');
        return cachedKey;
    }
    // Fallback : derive d'un secret existant via PBKDF2.
    // Pas ideal en prod (la clef est liee au JWT_SECRET), mais permet de
    // tourner en dev sans avoir a generer une clef separee.
    const seed = process.env.JWT_SECRET || 'kheops-fallback-seed';
    cachedKey = crypto.pbkdf2Sync(seed, 'kheops-token-salt', 100000, KEY_LEN, 'sha256');
    console.warn('[tokenCrypto] TOKEN_ENCRYPTION_KEY absent ou invalide. Derivation PBKDF2 du JWT_SECRET (fallback dev).');
    return cachedKey;
}

function isEncrypted(s) {
    return typeof s === 'string' && s.startsWith(PREFIX);
}

function encrypt(plaintext) {
    if (plaintext == null || plaintext === '') return plaintext;
    if (typeof plaintext !== 'string') {
        console.warn(`[tokenCrypto] encrypt: type non-string (${typeof plaintext}), retour tel quel.`);
        return plaintext;
    }
    if (isEncrypted(plaintext)) return plaintext; // deja chiffre
    const key = deriveKey();
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + iv.toString('hex') + ':' + tag.toString('hex') + ':' + enc.toString('hex');
}

function decrypt(ciphertext) {
    if (ciphertext == null || ciphertext === '') return ciphertext;
    if (typeof ciphertext !== 'string') return ciphertext;
    if (!isEncrypted(ciphertext)) return ciphertext; // legacy en clair
    const parts = ciphertext.slice(PREFIX.length).split(':');
    if (parts.length !== 3) {
        console.warn(`[tokenCrypto] decrypt: format invalide, ${parts.length} parts au lieu de 3.`);
        return ciphertext;
    }
    try {
        const [ivHex, tagHex, encHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        const enc = Buffer.from(encHex, 'hex');
        const key = deriveKey();
        const decipher = crypto.createDecipheriv(ALGO, key, iv);
        decipher.setAuthTag(tag);
        const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
        return dec.toString('utf8');
    } catch (err) {
        console.error(`[tokenCrypto] decrypt: echec dechiffrement (${err.message}).`);
        return null; // valeur indechiffrable (clef rotee ?) → forcer un re-OAuth
    }
}

// Helpers idempotents : safe a appeler partout
function encryptIfNeeded(v) { return isEncrypted(v) ? v : encrypt(v); }
function decryptIfNeeded(v) { return isEncrypted(v) ? decrypt(v) : v; }

module.exports = {
    encrypt,
    decrypt,
    encryptIfNeeded,
    decryptIfNeeded,
    isEncrypted,
};
