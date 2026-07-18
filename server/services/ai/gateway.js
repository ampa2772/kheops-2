const dns = require('dns').promises;
const net = require('net');
const OpenAIAdapter = require('./providers/openai');
const AnthropicAdapter = require('./providers/anthropic');
const GeminiAdapter = require('./providers/gemini');
const { AIError } = require('./errors');

function isPrivateIp(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd')
      || normalized.startsWith('fe80:') || normalized === '::';
  }
  return true;
}

async function validateCompatibleBaseUrl(rawUrl, { env = process.env, lookup = dns.lookup } = {}) {
  let url;
  try { url = new URL(rawUrl); } catch (_) {
    throw new AIError('AI_PROVIDER_BASE_URL_INVALID', 'L’URL du fournisseur compatible est invalide.', { statusCode: 400 });
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new AIError('AI_PROVIDER_BASE_URL_FORBIDDEN', 'Une URL HTTPS sans identifiants intégrés est obligatoire.', { statusCode: 400 });
  }
  const allowlist = String(env.AI_COMPATIBLE_BASE_URL_ALLOWLIST || '')
    .split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  if (!allowlist.includes(url.hostname.toLowerCase())) {
    throw new AIError('AI_PROVIDER_BASE_URL_NOT_ALLOWED', 'Ce domaine n’est pas autorisé pour le mode compatible OpenAI.', { statusCode: 403 });
  }
  const resolved = await lookup(url.hostname, { all: true });
  if (!resolved.length || resolved.some((entry) => isPrivateIp(entry.address))) {
    throw new AIError('AI_PROVIDER_BASE_URL_PRIVATE', 'Cette adresse réseau n’est pas autorisée.', { statusCode: 403 });
  }
  return url.toString().replace(/\/+$/, '');
}

class AIGateway {
  constructor({ fetchImpl = global.fetch, env = process.env } = {}) {
    if (typeof fetchImpl !== 'function') throw new Error('Ce serveur Node doit fournir fetch.');
    this.fetch = fetchImpl;
    this.env = env;
  }

  async adapter(provider, connection = {}) {
    if (provider === 'openai') return new OpenAIAdapter({ fetchImpl: this.fetch });
    if (provider === 'anthropic') return new AnthropicAdapter({ fetchImpl: this.fetch });
    if (provider === 'gemini') return new GeminiAdapter({ fetchImpl: this.fetch });
    if (provider === 'openai-compatible') {
      const baseUrl = await validateCompatibleBaseUrl(connection.baseUrl, { env: this.env });
      return new OpenAIAdapter({ fetchImpl: this.fetch, baseUrl, providerName: provider });
    }
    throw new AIError('AI_PROVIDER_UNSUPPORTED', 'Ce fournisseur IA n’est pas pris en charge.', { statusCode: 400 });
  }

  assertModelAllowed(connection, model) {
    if (!model) throw new AIError('AI_MODEL_REQUIRED', 'Un modèle IA doit être sélectionné.', { statusCode: 400 });
    const allowed = Array.isArray(connection.allowedModels) && connection.allowedModels.length
      ? connection.allowedModels
      : [connection.defaultModel].filter(Boolean);
    if (!allowed.length || !allowed.includes(model)) {
      throw new AIError('AI_MODEL_FORBIDDEN', 'Ce modèle n’est pas autorisé pour cette connexion.', { statusCode: 403 });
    }
  }

  async capabilities(connection) {
    return (await this.adapter(connection.provider, connection)).describeCapabilities();
  }

  async listModels(connection, apiKey) {
    return (await this.adapter(connection.provider, connection)).listModels({ apiKey });
  }

  async testConnection(connection, apiKey) {
    this.assertModelAllowed(connection, connection.defaultModel);
    return (await this.adapter(connection.provider, connection)).testConnection({ apiKey, model: connection.defaultModel });
  }

  async generate(connection, apiKey, request) {
    const model = request.model || connection.defaultModel;
    this.assertModelAllowed(connection, model);
    return (await this.adapter(connection.provider, connection)).generate({
      ...request,
      apiKey,
      model,
      maxOutputTokens: Math.min(
        Number(request.maxOutputTokens || connection.rules?.maxOutputTokens || 4096),
        Number(connection.rules?.maxOutputTokens || 4096),
      ),
    });
  }
}

module.exports = { AIGateway, validateCompatibleBaseUrl, isPrivateIp };
