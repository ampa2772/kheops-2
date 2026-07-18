const AICatalogueEntry = require('../../models/AI/AICatalogueEntry');
const { AIError } = require('./errors');

const FALLBACK_VERSION = 'fallback-config-v1';

function normalizeDimensionRates(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const normalized = {};
  for (const [key, raw] of Object.entries(value).slice(0, 64)) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(key)) continue;
    const candidate = typeof raw === 'number' ? { amount: raw, unit: 'per_unit' } : raw;
    const amount = Number(candidate?.amount);
    const unit = candidate?.unit === 'per_million' ? 'per_million' : 'per_unit';
    if (!Number.isFinite(amount) || amount < 0) continue;
    normalized[key] = { amount: Math.min(amount, 1e12), unit };
  }
  return normalized;
}

function tokenEstimate(text) {
  const characters = String(text || '').length;
  return Math.max(1, Math.ceil(characters / 3.5));
}

function fallbackEntry(provider, model, env = process.env) {
  return {
    provider,
    model,
    version: env.AI_PRICING_FALLBACK_VERSION || FALLBACK_VERSION,
    currency: env.AI_PRICING_CURRENCY === 'USD' ? 'USD' : 'EUR',
    inputPerMillion: Number(env.AI_FALLBACK_INPUT_PER_MILLION || 5),
    outputPerMillion: Number(env.AI_FALLBACK_OUTPUT_PER_MILLION || 15),
    cachedInputPerMillion: null,
    dimensionRates: {},
    minimumCharge: Number(env.AI_FALLBACK_MINIMUM_CHARGE || 0),
    capabilities: {},
    fallback: true,
  };
}

async function getCatalogueEntry(provider, model, { tenantId, at = new Date(), env = process.env } = {}) {
  const entry = await AICatalogueEntry.findOne({
    tenantId,
    provider,
    model,
    active: true,
    effectiveFrom: { $lte: at },
    $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: at } }],
  }).sort({ effectiveFrom: -1 }).lean();
  if (entry) return entry;
  if (env.AI_ALLOW_FALLBACK_PRICING === 'false') {
    throw new AIError('AI_MODEL_PRICING_NOT_CONFIGURED', 'La tarification de ce modèle doit être configurée avant son utilisation.', { statusCode: 409 });
  }
  return fallbackEntry(provider, model, env);
}

function calculateCost(entry, usage) {
  const officialCost = Number(usage?.officialCost);
  if (Number.isFinite(officialCost) && officialCost >= 0) return officialCost;
  const input = Math.max(0, Number(usage.inputTokens || 0));
  const output = Math.max(0, Number(usage.outputTokens || 0));
  const cached = Math.min(input, Math.max(0, Number(usage.cachedInputTokens || 0)));
  const normalInput = input - cached;
  const cachedRate = entry.cachedInputPerMillion == null ? entry.inputPerMillion : entry.cachedInputPerMillion;
  let cost = (normalInput * entry.inputPerMillion / 1_000_000)
    + (cached * cachedRate / 1_000_000)
    + (output * entry.outputPerMillion / 1_000_000);
  const rates = normalizeDimensionRates(entry.dimensionRates);
  for (const [key, rate] of Object.entries(rates)) {
    const amount = Math.max(0, Number(usage?.[key] || 0));
    cost += rate.unit === 'per_million' ? amount * rate.amount / 1_000_000 : amount * rate.amount;
  }
  return Math.max(Number(entry.minimumCharge || 0), Math.ceil(cost * 1_000_000) / 1_000_000);
}

async function estimateRequest({ tenantId, provider, model, inputText, maxOutputTokens, env = process.env }) {
  const entry = await getCatalogueEntry(provider, model, { tenantId, env });
  const usage = { inputTokens: tokenEstimate(inputText), outputTokens: Math.max(1, Number(maxOutputTokens || 1024)), cachedInputTokens: 0 };
  return {
    usage,
    cost: calculateCost(entry, usage),
    currency: entry.currency,
    catalogueVersion: entry.version,
    entry,
  };
}

function ledgerRates(entry, costNature = 'calculated') {
  return {
    catalogueVersion: entry.version,
    inputUnitCost: entry.inputPerMillion,
    outputUnitCost: entry.outputPerMillion,
    dimensionUnitCosts: normalizeDimensionRates(entry.dimensionRates),
    costNature,
  };
}

module.exports = {
  tokenEstimate,
  fallbackEntry,
  getCatalogueEntry,
  calculateCost,
  estimateRequest,
  ledgerRates,
  normalizeDimensionRates,
};
