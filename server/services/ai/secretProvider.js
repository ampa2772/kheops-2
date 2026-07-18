const crypto = require('crypto');
const AISecretRecord = require('../../models/AI/AISecretRecord');
const { AIError } = require('./errors');

function fingerprint(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex').slice(-12);
}

function masterKeyFromEnv(env = process.env) {
  const raw = env.AI_SECRET_MASTER_KEY;
  if (!raw) throw new AIError('AI_SECRET_VAULT_NOT_CONFIGURED', 'Le coffre de secrets IA n’est pas configuré.', { statusCode: 503 });
  let key;
  if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex');
  else {
    try { key = Buffer.from(raw, 'base64'); } catch (_) { key = null; }
  }
  if (!key || key.length !== 32) {
    throw new AIError('AI_SECRET_MASTER_KEY_INVALID', 'La clé maître du coffre IA doit contenir exactement 32 octets.', { statusCode: 503 });
  }
  return key;
}

class EncryptedMongoSecretProvider {
  constructor({ model = AISecretRecord, env = process.env } = {}) {
    this.model = model;
    this.env = env;
  }

  async store({ tenantId, secret, createdBy }) {
    if (!secret || String(secret).length < 8) throw new AIError('AI_SECRET_INVALID', 'La clé API est invalide.', { statusCode: 400 });
    if (String(secret).length > 10000) throw new AIError('AI_SECRET_TOO_LARGE', 'La clé API dépasse la taille autorisée.', { statusCode: 413 });
    const key = masterKeyFromEnv(this.env);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(String(tenantId)));
    const encrypted = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
    const secretRef = `mongo-ai://${crypto.randomUUID()}`;
    await this.model.create({
      secretRef,
      tenantId,
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      keyVersion: this.env.AI_SECRET_MASTER_KEY_VERSION || 'v1',
      createdBy,
    });
    return { secretRef, fingerprint: fingerprint(secret) };
  }

  async access({ tenantId, secretRef }) {
    const doc = await this.model.findOne({ secretRef, tenantId, destroyedAt: null })
      .select('+ciphertext +iv +authTag')
      .lean();
    if (!doc) throw new AIError('AI_SECRET_NOT_FOUND', 'Le secret de cette connexion est introuvable ou révoqué.', { statusCode: 410 });
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', masterKeyFromEnv(this.env), Buffer.from(doc.iv, 'base64'));
      decipher.setAAD(Buffer.from(String(tenantId)));
      decipher.setAuthTag(Buffer.from(doc.authTag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(doc.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch (_) {
      throw new AIError('AI_SECRET_DECRYPTION_FAILED', 'Le coffre IA ne peut pas ouvrir ce secret.', { statusCode: 503 });
    }
  }

  async destroy({ tenantId, secretRef }) {
    await this.model.updateOne(
      { tenantId, secretRef, destroyedAt: null },
      { $set: { destroyedAt: new Date() }, $unset: { ciphertext: 1, iv: 1, authTag: 1 } },
    );
  }
}

async function gcpAccessToken(fetchImpl, env) {
  if (env.GCP_SECRET_MANAGER_ACCESS_TOKEN) return env.GCP_SECRET_MANAGER_ACCESS_TOKEN;
  const response = await fetchImpl(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok) throw new AIError('GCP_SECRET_AUTH_FAILED', 'Secret Manager n’est pas accessible.', { statusCode: 503 });
  return (await response.json()).access_token;
}

class GcpSecretManagerProvider {
  constructor({ fetchImpl = global.fetch, env = process.env } = {}) {
    if (typeof fetchImpl !== 'function') throw new Error('fetch natif requis');
    this.fetch = fetchImpl;
    this.env = env;
    this.project = env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT || env.GCP_PROJECT;
    if (!this.project) throw new AIError('GCP_PROJECT_MISSING', 'Le projet Google Cloud du coffre IA est absent.', { statusCode: 503 });
  }

  async _request(url, options = {}) {
    const token = await gcpAccessToken(this.fetch, this.env);
    const response = await this.fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
      signal: options.signal || AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new AIError('GCP_SECRET_MANAGER_ERROR', 'Secret Manager a refusé l’opération.', { statusCode: 503, retryable: response.status >= 500 });
    return response.status === 204 ? null : response.json();
  }

  async store({ tenantId, secret }) {
    if (!secret || String(secret).length < 8) throw new AIError('AI_SECRET_INVALID', 'La clé API est invalide.', { statusCode: 400 });
    if (String(secret).length > 10000) throw new AIError('AI_SECRET_TOO_LARGE', 'La clé API dépasse la taille autorisée.', { statusCode: 413 });
    const tenantSegment = String(tenantId).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
    const secretId = `kheops-ai-${tenantSegment}-${crypto.randomUUID()}`.slice(0, 240);
    const parent = `projects/${this.project}`;
    const base = 'https://secretmanager.googleapis.com/v1';
    await this._request(`${base}/${parent}/secrets?secretId=${encodeURIComponent(secretId)}`, {
      method: 'POST', body: JSON.stringify({ replication: { automatic: {} }, labels: { service: 'kheops-ai' } }),
    });
    await this._request(`${base}/${parent}/secrets/${secretId}:addVersion`, {
      method: 'POST', body: JSON.stringify({ payload: { data: Buffer.from(String(secret)).toString('base64') } }),
    });
    return { secretRef: `gcp-sm://${parent}/secrets/${secretId}`, fingerprint: fingerprint(secret) };
  }

  _resourceForTenant(secretRef, tenantId) {
    const resource = String(secretRef).replace(/^gcp-sm:\/\//, '');
    const tenantSegment = String(tenantId).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
    const expectedPrefix = `projects/${this.project}/secrets/kheops-ai-${tenantSegment}-`;
    if (!resource.startsWith(expectedPrefix) || !/^projects\/[a-zA-Z0-9_.:-]+\/secrets\/[a-zA-Z0-9_-]+$/.test(resource)) {
      throw new AIError('AI_SECRET_SCOPE_INVALID', 'Référence de secret invalide pour ce cabinet.', { statusCode: 403 });
    }
    return resource;
  }

  async access({ secretRef, tenantId }) {
    const resource = this._resourceForTenant(secretRef, tenantId);
    const data = await this._request(`https://secretmanager.googleapis.com/v1/${resource}/versions/latest:access`);
    return Buffer.from(data.payload.data, 'base64').toString('utf8');
  }

  async destroy({ secretRef, tenantId }) {
    const resource = this._resourceForTenant(secretRef, tenantId);
    // On détruit les versions au lieu de supprimer la ressource Secret : le
    // runtime n'a donc pas besoin de secretmanager.secrets.delete.
    const listing = await this._request(`https://secretmanager.googleapis.com/v1/${resource}/versions?filter=state%3AENABLED`);
    for (const version of listing.versions || []) {
      if (!version.name || !version.name.startsWith(`${resource}/versions/`)) continue;
      await this._request(`https://secretmanager.googleapis.com/v1/${version.name}:destroy`, {
        method: 'POST', body: '{}',
      });
    }
  }
}

function createSecretProvider(options = {}) {
  const env = options.env || process.env;
  const selected = String(env.AI_SECRET_PROVIDER || (env.GOOGLE_CLOUD_PROJECT ? 'gcp' : 'encrypted-mongo')).toLowerCase();
  if (selected === 'gcp' || selected === 'google-secret-manager') return new GcpSecretManagerProvider(options);
  if (selected === 'encrypted-mongo' || selected === 'mongodb') return new EncryptedMongoSecretProvider(options);
  throw new AIError('AI_SECRET_PROVIDER_UNSUPPORTED', 'Le fournisseur de coffre IA n’est pas supporté.', { statusCode: 503 });
}

module.exports = {
  createSecretProvider,
  EncryptedMongoSecretProvider,
  GcpSecretManagerProvider,
  masterKeyFromEnv,
  fingerprint,
};
