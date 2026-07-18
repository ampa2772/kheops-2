const crypto = require('crypto');

function normalizeEmail(value) {
  const match = String(value || '').match(/<([^>]+)>/);
  return String(match ? match[1] : value || '').trim().toLowerCase();
}

function normalizeRecipients(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[;,]/);
  return source
    .map((entry) => {
      if (typeof entry === 'object' && entry) {
        return {
          name: String(entry.name || entry.emailAddress?.name || '').trim().slice(0, 300),
          email: normalizeEmail(entry.email || entry.address || entry.emailAddress?.address),
        };
      }
      const raw = String(entry || '').trim();
      const email = normalizeEmail(raw);
      const name = raw.includes('<') ? raw.slice(0, raw.indexOf('<')).trim().replace(/^"|"$/g, '') : '';
      return { name: name.slice(0, 300), email };
    })
    .filter((entry) => entry.email && entry.email.includes('@'));
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeArchivedHtml(value) {
  return String(value || '')
    .replace(/<(script|style|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, '')
    .slice(0, 4000000);
}

function stableMessageId({ tenantId, ownerUserId, idempotencyKey }) {
  const digest = crypto.createHash('sha256')
    .update(`${tenantId}:${ownerUserId}:${idempotencyKey}`)
    .digest('hex')
    .slice(0, 40);
  return `<kheops-${digest}@mail.kheops.local>`;
}

function messageFingerprint(message) {
  const canonical = [
    String(message.internetMessageId || '').trim().toLowerCase(),
    normalizeEmail(message.from),
    normalizeRecipients(message.to).map((item) => item.email).sort().join(','),
    String(message.subject || '').trim().toLowerCase(),
    new Date(message.sentAt || message.receivedAt || 0).toISOString(),
    String(message.bodyText || stripHtml(message.bodyHtml || '')).replace(/\s+/g, ' ').trim().slice(0, 4000),
  ].join('|');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function retryDelayMs(attempt) {
  const base = Math.min(60 * 60 * 1000, 5000 * (2 ** Math.max(0, Number(attempt || 1) - 1)));
  return base + Math.floor(Math.random() * Math.min(5000, base / 5));
}

module.exports = {
  normalizeEmail,
  normalizeRecipients,
  stripHtml,
  sanitizeArchivedHtml,
  stableMessageId,
  messageFingerprint,
  retryDelayMs,
};

