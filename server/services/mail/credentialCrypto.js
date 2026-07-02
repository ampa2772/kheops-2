const crypto = require('crypto');

const PREFIX = 'mailenc:v1:';
const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const KEY_ENV = 'TOKEN_ENCRYPTION_KEY';

let cachedKey = null;

function resetKeyCacheForTests() {
  cachedKey = null;
}

function getKey() {
  if (cachedKey) return cachedKey;
  const envKey = process.env[KEY_ENV];
  if (!envKey || !/^[0-9a-fA-F]{64}$/.test(envKey)) {
    const err = new Error(`${KEY_ENV} doit etre defini en hex 32 bytes pour chiffrer les credentials mail.`);
    err.code = 'MAIL_CREDENTIAL_KEY_MISSING';
    err.statusCode = 500;
    throw err;
  }
  cachedKey = Buffer.from(envKey, 'hex');
  if (cachedKey.length !== KEY_LEN) {
    const err = new Error(`${KEY_ENV} invalide.`);
    err.code = 'MAIL_CREDENTIAL_KEY_INVALID';
    err.statusCode = 500;
    throw err;
  }
  return cachedKey;
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function encrypt(plain) {
  if (typeof plain !== 'string' || plain.length === 0) {
    const err = new Error('Credential mail vide ou invalide.');
    err.code = 'MAIL_CREDENTIAL_EMPTY';
    err.statusCode = 400;
    throw err;
  }
  if (isEncrypted(plain)) return plain;

  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

function decrypt(blob) {
  if (!isEncrypted(blob)) {
    const err = new Error('Credential mail non chiffre ou format invalide.');
    err.code = 'MAIL_CREDENTIAL_NOT_ENCRYPTED';
    err.statusCode = 500;
    throw err;
  }

  const parts = blob.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    const err = new Error('Format credential mail invalide.');
    err.code = 'MAIL_CREDENTIAL_FORMAT_INVALID';
    err.statusCode = 500;
    throw err;
  }

  const [ivHex, tagHex, ciphertextHex] = parts;
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}

module.exports = {
  KEY_ENV,
  decrypt,
  encrypt,
  isEncrypted,
  resetKeyCacheForTests,
};
