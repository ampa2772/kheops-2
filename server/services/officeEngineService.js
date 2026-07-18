const crypto = require('crypto');

const DISCOVERY_TTL_MS = 5 * 60 * 1000;
let discoveryCache = null;

function normalizedBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function publicUrl() {
  return normalizedBaseUrl(process.env.OFFICE_ENGINE_PUBLIC_URL || process.env.OFFICE_ENGINE_URL);
}

function internalUrl() {
  return normalizedBaseUrl(process.env.OFFICE_ENGINE_INTERNAL_URL || publicUrl());
}

function isConfigured() {
  return Boolean(publicUrl() && internalUrl());
}

function supportedExtension(filename) {
  const match = String(filename || '').trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  const extension = match ? match[1] : '';
  return ['doc', 'docx', 'odt', 'rtf'].includes(extension) ? extension : null;
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseAttributes(fragment) {
  const attributes = {};
  String(fragment || '').replace(/([\w:-]+)=(['"])(.*?)\2/g, (_match, key, _quote, value) => {
    attributes[key] = decodeXml(value);
    return _match;
  });
  return attributes;
}

function stripDiscoveryPlaceholders(url) {
  // Les placeholders optionnels de discovery (`<ui=...&>`) ne doivent pas être
  // transmis tels quels au navigateur. WOPISrc est ajouté explicitement.
  return String(url || '').replace(/<[^>]+>/g, '');
}

function parseDiscovery(xml) {
  const actions = [];
  const actionPattern = /<action\b([^>]*)\/?\s*>/gi;
  let match;
  while ((match = actionPattern.exec(String(xml || '')))) {
    const attributes = parseAttributes(match[1]);
    if (!attributes.ext || !attributes.urlsrc) continue;
    actions.push({
      ext: String(attributes.ext).toLowerCase(),
      name: String(attributes.name || '').toLowerCase(),
      urlsrc: stripDiscoveryPlaceholders(attributes.urlsrc),
    });
  }
  return actions;
}

async function fetchDiscovery({ force = false } = {}) {
  if (!isConfigured()) {
    const error = new Error('Le moteur bureautique n’est pas configuré.');
    error.code = 'OFFICE_ENGINE_NOT_CONFIGURED';
    throw error;
  }
  if (!force && discoveryCache && discoveryCache.expiresAt > Date.now()) return discoveryCache.actions;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${internalUrl()}/hosting/discovery`, {
      headers: { Accept: 'application/xml,text/xml' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Discovery HTTP ${response.status}`);
    const actions = parseDiscovery(await response.text());
    if (actions.length === 0) throw new Error('Discovery ne contient aucune action exploitable.');
    discoveryCache = { actions, expiresAt: Date.now() + DISCOVERY_TTL_MS };
    return actions;
  } finally {
    clearTimeout(timeout);
  }
}

function publicizeActionUrl(value) {
  const source = new URL(String(value));
  const publicBase = new URL(`${publicUrl()}/`);
  source.protocol = publicBase.protocol;
  source.host = publicBase.host;
  return source.toString();
}

async function resolveEditAction(filename) {
  const ext = supportedExtension(filename);
  if (!ext) return null;
  const override = String(process.env.OFFICE_ENGINE_ACTION_URL || '').trim();
  if (override) return { ext, actionUrl: override };
  const actions = await fetchDiscovery();
  const action = actions.find((entry) => entry.ext === ext && entry.name === 'edit')
    || actions.find((entry) => entry.ext === ext && ['view', 'editnew'].includes(entry.name));
  return action ? { ext, actionUrl: publicizeActionUrl(action.urlsrc) } : null;
}

function operationKey(sessionJti, buffer) {
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32);
  return `office:${String(sessionJti).slice(0, 80)}:${checksum}`;
}

function _resetForTesting() {
  discoveryCache = null;
}

module.exports = {
  fetchDiscovery,
  internalUrl,
  isConfigured,
  operationKey,
  parseDiscovery,
  publicUrl,
  resolveEditAction,
  supportedExtension,
  _resetForTesting,
};
