const RESERVED_USAGE_KEYS = new Set(['inputTokens', 'outputTokens', 'cachedInputTokens']);

function safeDimensionKey(value) {
  const key = String(value || '').trim();
  return /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(key) ? key : null;
}

function safeCounter(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.min(number, 1e15);
}

/**
 * Conserve un ensemble borné de compteurs numériques fournisseur. Le schéma
 * reste extensible sans persister arbitrairement des objets ou du texte reçus
 * d’une API tierce.
 */
function normalizeUsageDimensions(usage = {}) {
  const output = {};
  const visit = (value, prefix = '', depth = 0) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 2) return;
    for (const [rawKey, rawValue] of Object.entries(value)) {
      if (Object.keys(output).length >= 64) break;
      const keyPart = safeDimensionKey(rawKey);
      if (!keyPart) continue;
      const key = prefix ? `${prefix}.${keyPart}` : keyPart;
      if (!prefix && RESERVED_USAGE_KEYS.has(key)) continue;
      const counter = safeCounter(rawValue);
      if (counter != null) output[key] = counter;
      else if (rawValue && typeof rawValue === 'object') visit(rawValue, key, depth + 1);
    }
  };
  visit(usage);
  return output;
}

module.exports = { normalizeUsageDimensions, safeDimensionKey, safeCounter };
