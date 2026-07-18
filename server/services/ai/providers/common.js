const { AIError } = require('../errors');

function providerError(provider, status, payload, requestId = null) {
  const rawCode = payload?.error?.code || payload?.type || payload?.error?.type || null;
  let code = 'AI_PROVIDER_ERROR';
  let message = `Le fournisseur ${provider} a refusé la requête.`;
  let retryable = status === 408 || status === 409 || status === 429 || status >= 500;
  if (status === 401 || status === 403) {
    code = 'AI_PROVIDER_KEY_INVALID';
    message = 'La clé API est invalide, révoquée ou non autorisée.';
    retryable = false;
  } else if (status === 402 || /billing|credit|quota/i.test(String(rawCode || payload?.error?.message || ''))) {
    code = 'AI_PROVIDER_BILLING_REQUIRED';
    message = 'La facturation ou le crédit API du fournisseur n’est pas actif.';
    retryable = false;
  } else if (status === 404 || /model/i.test(String(rawCode || ''))) {
    code = 'AI_PROVIDER_MODEL_NOT_AVAILABLE';
    message = 'Le modèle demandé n’est pas disponible pour cette connexion.';
    retryable = false;
  } else if (status === 429) {
    code = 'AI_PROVIDER_RATE_LIMITED';
    message = 'La limite de débit du fournisseur est atteinte.';
  } else if (status >= 500) {
    code = 'AI_PROVIDER_UNAVAILABLE';
    message = 'Le fournisseur est temporairement indisponible.';
  }
  return new AIError(code, message, {
    statusCode: status === 429 ? 429 : (status >= 500 ? 503 : 400),
    retryable,
    details: requestId ? { providerRequestId: requestId } : null,
  });
}

async function requestJson(fetchImpl, provider, url, options, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new AIError('AI_PROVIDER_TIMEOUT', 'Le fournisseur n’a pas répondu dans le délai autorisé.', { statusCode: 504, retryable: true });
    }
    throw new AIError('AI_PROVIDER_NETWORK_ERROR', 'Le fournisseur est inaccessible.', { statusCode: 503, retryable: true });
  } finally {
    clearTimeout(timeout);
  }
  const requestId = response.headers?.get?.('x-request-id')
    || response.headers?.get?.('request-id')
    || response.headers?.get?.('x-goog-request-id')
    || null;
  let payload;
  try { payload = await response.json(); } catch (_) { payload = {}; }
  if (!response.ok) throw providerError(provider, response.status, payload, requestId);
  return { payload, requestId };
}

function capabilities(overrides = {}) {
  return Object.freeze({
    text: 'available',
    streaming: 'limited',
    structuredOutput: 'limited',
    files: 'not_verified',
    images: 'not_verified',
    tokenCounting: 'limited',
    detailedUsage: 'available',
    cancellation: 'limited',
    tools: 'not_verified',
    nativeCitations: 'not_verified',
    ...overrides,
  });
}

module.exports = { requestJson, capabilities };
