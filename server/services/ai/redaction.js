const crypto = require('crypto');

const SECRET_KEY_PATTERN = /(secret|api[_-]?key|authorization|password|credential|private[_-]?key|access[_-]?token|refresh[_-]?token)/i;
const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*\b/gi,
  /\b(?:sk|key|api)[-_][A-Za-z0-9_-]{12,}\b/gi,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
];

function redactString(value) {
  let result = String(value);
  for (const pattern of SECRET_VALUE_PATTERNS) result = result.replace(pattern, '[SECRET_REDACTED]');
  return result;
}

function redactSecrets(value, seen = new WeakSet()) {
  if (typeof value === 'string') return redactString(value);
  if (value == null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, seen));
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SECRET_KEY_PATTERN.test(key) ? '[SECRET_REDACTED]' : redactSecrets(item, seen);
  }
  return output;
}

const DATA_PATTERNS = Object.freeze({
  email: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  iban: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/gi,
  frenchSocialSecurity: /\b[12]\s?\d{2}\s?(?:0\d|1[0-2])\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{2}\b/g,
  phone: /(?<!\d)(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}(?!\d)/g,
});

function redactPersonalData(text, categories = Object.keys(DATA_PATTERNS)) {
  let output = redactString(text == null ? '' : text);
  for (const category of categories) {
    const pattern = DATA_PATTERNS[category];
    if (pattern) output = output.replace(pattern, `[${category.toUpperCase()}_REDACTED]`);
  }
  return output;
}

function safeAuditDetails(details) {
  const redacted = redactSecrets(details || {});
  const walk = (value, depth = 0) => {
    if (depth > 5) return '[TRUNCATED]';
    if (typeof value === 'string') return redactString(value).slice(0, 500);
    if (Array.isArray(value)) return value.slice(0, 50).map((entry) => walk(entry, depth + 1));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).slice(0, 50).map(([k, v]) => [k, walk(v, depth + 1)]));
    }
    return value;
  };
  return walk(redacted);
}

function hashForAudit(value, salt = process.env.AI_AUDIT_HASH_SALT || process.env.JWT_SECRET || '') {
  if (!value || !salt) return null;
  return crypto.createHmac('sha256', salt).update(String(value)).digest('hex').slice(0, 32);
}

module.exports = {
  redactSecrets,
  redactPersonalData,
  safeAuditDetails,
  hashForAudit,
  DATA_PATTERNS,
};
