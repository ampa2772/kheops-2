const { AIError } = require('./errors');

const DISCOVERY_VERSION = 'assistant-text-v1';
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const PROVIDER_LABELS = Object.freeze({
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  gemini: 'Google Gemini',
  'openai-compatible': 'Fournisseur compatible OpenAI',
});

function requireApiKey(apiKey) {
  const value = String(apiKey || '').trim();
  if (value.length < 8 || value.length > 1000) {
    throw new AIError('AI_SECRET_INVALID', 'La clé API doit être renseignée.', { statusCode: 400 });
  }
  return value;
}

/**
 * Détection volontairement locale et prudente. Aucune clé n'est testée auprès
 * de plusieurs fournisseurs : un motif ambigu impose un choix humain.
 */
function detectProviderHint(apiKey) {
  const key = requireApiKey(apiKey);
  if (/^sk-ant-[A-Za-z0-9_-]{12,}$/.test(key)) {
    return { provider: 'anthropic', confidence: 'high', manualRequired: false, reasonCode: 'ANTHROPIC_PREFIX' };
  }
  if (/^AIza[A-Za-z0-9_-]{20,}$/.test(key)) {
    return { provider: 'gemini', confidence: 'high', manualRequired: false, reasonCode: 'GOOGLE_API_KEY_PREFIX' };
  }
  if (/^sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{12,}$/.test(key)) {
    return { provider: 'openai', confidence: 'high', manualRequired: false, reasonCode: 'OPENAI_SCOPED_PREFIX' };
  }
  if (/^xai-[A-Za-z0-9_-]{12,}$/i.test(key)) {
    return {
      provider: null,
      confidence: 'ambiguous',
      manualRequired: true,
      candidates: ['openai-compatible'],
      reasonCode: 'COMPATIBLE_PROVIDER_REQUIRES_ADMIN_CONFIGURATION',
    };
  }
  if (/^sk-[A-Za-z0-9_-]{12,}$/.test(key)) {
    return {
      provider: null,
      confidence: 'ambiguous',
      manualRequired: true,
      candidates: ['openai', 'anthropic'],
      reasonCode: 'GENERIC_SK_PREFIX',
    };
  }
  return {
    provider: null,
    confidence: 'unknown',
    manualRequired: true,
    candidates: ['openai', 'anthropic', 'gemini'],
    reasonCode: 'NO_RELIABLE_LOCAL_PATTERN',
  };
}

function isAssistantTextModel(provider, modelId) {
  const id = String(modelId || '').trim().toLowerCase();
  if (!id) return false;
  const commonExcluded = /(embedding|moderation|rerank|whisper|transcri|text-to-speech|\btts\b|realtime|image|imagen|veo|aqa)/;
  if (commonExcluded.test(id)) return false;
  if (provider === 'openai') return /^(gpt|o[1-9](?:-|$)|chatgpt)/.test(id);
  if (provider === 'anthropic') return /^claude/.test(id);
  if (provider === 'gemini') return /^gemini/.test(id);
  return true;
}

function inferredCapabilities(provider, modelId) {
  const id = String(modelId || '').toLowerCase();
  const vision = provider === 'gemini'
    || (provider === 'anthropic' && /claude-(?:3|4)/.test(id))
    || (provider === 'openai' && /(gpt-4o|gpt-4\.1|gpt-5)/.test(id));
  return {
    text: true,
    vision,
    // L'adaptateur Kheops actuel n'envoie pas encore de fichiers binaires aux
    // fournisseurs. Ne pas promettre une capacité que la passerelle n'expose pas.
    files: false,
    structuredOutput: provider !== 'anthropic',
  };
}

function recommendationScore(provider, modelId) {
  const id = String(modelId || '').toLowerCase();
  let score = 0;
  if (provider === 'openai') {
    if (/^gpt-5(?:\.|-|$)/.test(id)) score += 500;
    else if (/^gpt-4\.1(?:-|$)/.test(id)) score += 420;
    else if (/^gpt-4o(?:-|$)/.test(id)) score += 350;
    else if (/^o[1-9](?:-|$)/.test(id)) score += 300;
  } else if (provider === 'anthropic') {
    if (/sonnet.*(?:4|3-7|3\.7)/.test(id) || /claude-(?:4|3-7).*sonnet/.test(id)) score += 500;
    else if (/opus/.test(id)) score += 420;
    else if (/haiku/.test(id)) score += 300;
  } else if (provider === 'gemini') {
    if (/gemini-2\.5-pro/.test(id)) score += 500;
    else if (/gemini-2\.5-flash/.test(id)) score += 450;
    else if (/gemini-2(?:\.|-).*pro/.test(id)) score += 400;
    else if (/gemini-2(?:\.|-).*flash/.test(id)) score += 350;
  }
  if (/latest|stable/.test(id)) score += 25;
  if (/preview|experimental|exp/.test(id)) score -= 60;
  if (/nano|mini|haiku|flash-lite/.test(id)) score -= 15;
  if (/\d{4}[-_]\d{2}[-_]\d{2}/.test(id)) score -= 5;
  return score;
}

function buildModelDiscovery(provider, modelIds, { requiredCapabilities = ['text'], now = new Date() } = {}) {
  const unique = [...new Set((modelIds || []).map((item) => String(item?.id || item || '').trim()).filter(Boolean))]
    .slice(0, 2000);
  const options = unique
    .filter((id) => isAssistantTextModel(provider, id))
    .map((id) => ({
      id,
      label: id,
      capabilities: inferredCapabilities(provider, id),
      recommendationScore: recommendationScore(provider, id),
    }))
    .filter((item) => requiredCapabilities.every((capability) => item.capabilities[capability] === true))
    .sort((left, right) => right.recommendationScore - left.recommendationScore || left.id.localeCompare(right.id));
  if (!options.length) {
    throw new AIError('AI_MODEL_DISCOVERY_EMPTY', 'Aucun modèle texte compatible avec l’assistant Kheops n’a été trouvé.', { statusCode: 409 });
  }
  const recommendedModel = options[0].id;
  const modelOptions = options.map((item, index) => ({
    id: item.id,
    label: item.label,
    capabilities: item.capabilities,
    recommended: index === 0,
  }));
  return {
    provider,
    providerLabel: PROVIDER_LABELS[provider] || provider,
    models: modelOptions.map((item) => item.id),
    modelOptions,
    recommendedModel,
    refreshedAt: now,
    discoveryVersion: DISCOVERY_VERSION,
  };
}

function discoveryCacheTtlMs(env = process.env) {
  return Math.max(60 * 1000, Math.min(7 * 24 * 60 * 60 * 1000, Number(env.AI_MODEL_DISCOVERY_TTL_MS || DEFAULT_CACHE_TTL_MS)));
}

function cacheIsFresh(connection, { now = new Date(), env = process.env } = {}) {
  const refreshedAt = connection?.modelsRefreshedAt ? new Date(connection.modelsRefreshedAt) : null;
  return Boolean(
    refreshedAt
    && !Number.isNaN(refreshedAt.getTime())
    && Array.isArray(connection.discoveredModels)
    && connection.discoveredModels.length
    && now.getTime() - refreshedAt.getTime() < discoveryCacheTtlMs(env),
  );
}

module.exports = {
  DISCOVERY_VERSION,
  PROVIDER_LABELS,
  requireApiKey,
  detectProviderHint,
  isAssistantTextModel,
  inferredCapabilities,
  recommendationScore,
  buildModelDiscovery,
  discoveryCacheTtlMs,
  cacheIsFresh,
};
