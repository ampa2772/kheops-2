// Normalize fetch/Axios/provider failures without retaining their request config
// (which can contain OAuth credentials).
function statusOf(error) {
  return Number(error?.response?.status || error?.statusCode || error?.status || 0);
}

function retryable(error) {
  if (error?.retryable === false) return false;
  if (error?.retryable === true) return true;
  const status = statusOf(error);
  return [408, 429].includes(status) || status >= 500
    || ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'ENETUNREACH', 'ECONNREFUSED'].includes(error?.code);
}

function retryAfterMs(error, now = Date.now()) {
  const headers = error?.response?.headers || error?.headers;
  const value = headers?.get?.('retry-after') ?? headers?.['retry-after'] ?? headers?.['Retry-After'];
  if (value == null || String(value).trim() === '') return 0;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Number(now);
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

module.exports = { statusOf, retryable, retryAfterMs };
