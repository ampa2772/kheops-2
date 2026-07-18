const crypto = require('crypto');

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const AAD = Buffer.from('kheops:microsoft-oauth-state:v1', 'utf8');

function stateSecret(explicitSecret) {
  const secret = explicitSecret
    || process.env.MICROSOFT_OAUTH_STATE_SECRET
    || process.env.JWT_SECRET;
  if (!secret || String(secret).length < 24) {
    const err = new Error('MICROSOFT_OAUTH_STATE_SECRET ou JWT_SECRET doit contenir au moins 24 caractères.');
    err.code = 'MICROSOFT_STATE_CONFIG_MISSING';
    throw err;
  }
  return crypto.createHash('sha256').update(`microsoft-oauth-state:${secret}`).digest();
}

function encode(buffer) {
  return buffer.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function decode(value) {
  const input = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = input.padEnd(input.length + ((4 - (input.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64');
}

function createMicrosoftOAuthState(payload, options = {}) {
  const flow = payload?.flow;
  const verifier = String(payload?.verifier || '');
  const browserNonce = String(payload?.browserNonce || '');
  if (!['login', 'mail', 'onedrive', 'sharepoint'].includes(flow)
    || verifier.length < 32
    || verifier.length > 180
    || browserNonce.length < 32
    || browserNonce.length > 180) {
    const err = new Error('Charge OAuth Microsoft invalide.');
    err.code = 'MICROSOFT_STATE_PAYLOAD_INVALID';
    throw err;
  }
  if (flow !== 'login' && !payload.connectUserId) {
    const err = new Error('Utilisateur Kheops absent du consentement de stockage Microsoft.');
    err.code = 'MICROSOFT_STATE_PAYLOAD_INVALID';
    throw err;
  }

  const now = Number(options.now || Date.now());
  const ttlMs = Math.min(15 * 60 * 1000, Math.max(60 * 1000, Number(options.ttlMs) || DEFAULT_TTL_MS));
  const body = Buffer.from(JSON.stringify({
    version: VERSION,
    flow,
    verifier,
    ...(flow !== 'login' ? { connectUserId: String(payload.connectUserId) } : {}),
    browserNonce,
    nonce: encode(crypto.randomBytes(16)),
    issuedAt: now,
    expiresAt: now + ttlMs,
  }), 'utf8');
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', stateSecret(options.secret), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(body), cipher.final()]);
  const tag = cipher.getAuthTag();
  return encode(Buffer.concat([Buffer.from([VERSION]), iv, tag, ciphertext]));
}

function readMicrosoftOAuthState(value, options = {}) {
  try {
    const packed = decode(value);
    if (packed.length <= 1 + IV_BYTES + TAG_BYTES || packed[0] !== VERSION) throw new Error('format');
    const ivStart = 1;
    const tagStart = ivStart + IV_BYTES;
    const dataStart = tagStart + TAG_BYTES;
    const decipher = crypto.createDecipheriv('aes-256-gcm', stateSecret(options.secret), packed.subarray(ivStart, tagStart));
    decipher.setAAD(AAD);
    decipher.setAuthTag(packed.subarray(tagStart, dataStart));
    const decoded = JSON.parse(Buffer.concat([
      decipher.update(packed.subarray(dataStart)),
      decipher.final(),
    ]).toString('utf8'));
    const now = Number(options.now || Date.now());
    if (decoded.version !== VERSION
      || !['login', 'mail', 'onedrive', 'sharepoint'].includes(decoded.flow)
      || typeof decoded.verifier !== 'string'
      || decoded.verifier.length < 32
      || typeof decoded.browserNonce !== 'string'
      || decoded.browserNonce.length < 32
      || decoded.browserNonce.length > 180
      || !Number.isFinite(decoded.issuedAt)
      || !Number.isFinite(decoded.expiresAt)
      || decoded.expiresAt < now
      || decoded.issuedAt > now + 60 * 1000
      || decoded.expiresAt - decoded.issuedAt > 15 * 60 * 1000
      || (decoded.flow !== 'login' && !decoded.connectUserId)) {
      throw new Error('claims');
    }
    return decoded;
  } catch (cause) {
    if (cause?.code === 'MICROSOFT_STATE_CONFIG_MISSING') throw cause;
    const err = new Error('État OAuth Microsoft invalide ou expiré.');
    err.code = 'MICROSOFT_STATE_INVALID';
    throw err;
  }
}

module.exports = {
  createMicrosoftOAuthState,
  readMicrosoftOAuthState,
};
