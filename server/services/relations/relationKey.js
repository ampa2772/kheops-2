const crypto = require('crypto');

const VALID_STATUSES = new Set(['pending', 'active', 'inactive', 'disputed', 'superseded', 'archived']);
const VALID_DIRECTIONS = new Set(['directed', 'undirected']);

function cleanToken(value, label, max = 180) {
  const token = String(value == null ? '' : value).trim();
  if (!token) throw Object.assign(new Error(`${label} requis.`), { statusCode: 400, code: 'RELATION_VALIDATION' });
  if (token.length > max) throw Object.assign(new Error(`${label} trop long.`), { statusCode: 400, code: 'RELATION_VALIDATION' });
  return token;
}

function normalizeType(value, label = 'type') {
  const token = cleanToken(value, label, 100).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]*$/.test(token)) {
    throw Object.assign(new Error(`${label} invalide.`), { statusCode: 400, code: 'RELATION_VALIDATION' });
  }
  return token;
}

function normalizeEndpoint(endpoint, label) {
  if (!endpoint || typeof endpoint !== 'object') {
    throw Object.assign(new Error(`${label} requis.`), { statusCode: 400, code: 'RELATION_VALIDATION' });
  }
  return {
    entityType: normalizeType(endpoint.entityType, `${label}.entityType`),
    entityId: cleanToken(endpoint.entityId, `${label}.entityId`),
    labelSnapshot: String(endpoint.labelSnapshot || '').trim().slice(0, 300),
  };
}

function endpointKey(endpoint) {
  return `${endpoint.entityType}:${endpoint.entityId}`;
}

function safeObject(value, depth = 0) {
  if (depth > 8) return null;
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 5000);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => safeObject(item, depth + 1));
  if (typeof value !== 'object') return String(value).slice(0, 5000);
  const result = {};
  Object.keys(value).sort().slice(0, 200).forEach((key) => {
    if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor') return;
    result[key.slice(0, 120)] = safeObject(value[key], depth + 1);
  });
  return result;
}

function normalizeRoles(roles) {
  return (Array.isArray(roles) ? roles : []).slice(0, 100).map((role) => ({
    side: ['subject', 'object', 'both'].includes(role && role.side) ? role.side : 'both',
    code: normalizeType(role && role.code, 'role.code'),
    label: String((role && role.label) || '').trim().slice(0, 200),
    jurisdiction: String((role && role.jurisdiction) || '').trim().slice(0, 160),
  })).sort((a, b) => `${a.side}:${a.code}`.localeCompare(`${b.side}:${b.code}`));
}

function normalizeProvenance(value = {}) {
  const allowed = new Set(['user', 'import', 'migration', 'api', 'sync', 'system', 'inference']);
  return {
    source: allowed.has(value.source) ? value.source : 'user',
    sourceCollection: String(value.sourceCollection || '').trim().slice(0, 160),
    sourceId: String(value.sourceId || '').trim().slice(0, 220),
    importBatchId: String(value.importBatchId || '').trim().slice(0, 160),
    observedAt: value.observedAt ? new Date(value.observedAt) : new Date(),
    confidence: Math.max(0, Math.min(1, Number.isFinite(Number(value.confidence)) ? Number(value.confidence) : 1)),
    note: String(value.note || '').slice(0, 1000),
  };
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeRelationInput(input = {}) {
  const direction = VALID_DIRECTIONS.has(input.direction) ? input.direction : 'directed';
  let subject = normalizeEndpoint(input.subject, 'subject');
  let object = normalizeEndpoint(input.object, 'object');
  if (endpointKey(subject) === endpointKey(object)) {
    throw Object.assign(new Error('Une relation ne peut pas relier une entité à elle-même.'), { statusCode: 400, code: 'RELATION_SELF_LINK' });
  }
  if (direction === 'undirected' && endpointKey(subject).localeCompare(endpointKey(object)) > 0) {
    [subject, object] = [object, subject];
  }
  const status = VALID_STATUSES.has(input.status) ? input.status : 'active';
  const validFrom = input.validFrom ? new Date(input.validFrom) : null;
  const validTo = input.validTo ? new Date(input.validTo) : null;
  if ((validFrom && Number.isNaN(validFrom.valueOf())) || (validTo && Number.isNaN(validTo.valueOf()))) {
    throw Object.assign(new Error('Période de validité invalide.'), { statusCode: 400, code: 'RELATION_VALIDATION' });
  }
  if (validFrom && validTo && validTo < validFrom) {
    throw Object.assign(new Error('validTo doit être postérieur à validFrom.'), { statusCode: 400, code: 'RELATION_VALIDATION' });
  }
  return {
    relationType: normalizeType(input.relationType, 'relationType'),
    direction,
    subject,
    object,
    roles: normalizeRoles(input.roles),
    status,
    validFrom,
    validTo,
    attributes: safeObject(input.attributes || {}),
    provenance: normalizeProvenance(input.provenance || {}),
    idempotencyKey: input.idempotencyKey ? cleanToken(input.idempotencyKey, 'idempotencyKey', 240) : null,
  };
}

function relationDedupeKey(normalized) {
  const identity = {
    relationType: normalized.relationType,
    direction: normalized.direction,
    subject: endpointKey(normalized.subject),
    object: endpointKey(normalized.object),
  };
  return sha256(stable(identity));
}

function relationContentHash(normalized) {
  return sha256(stable({
    status: normalized.status,
    roles: normalized.roles,
    validFrom: normalized.validFrom ? normalized.validFrom.toISOString() : null,
    validTo: normalized.validTo ? normalized.validTo.toISOString() : null,
    attributes: normalized.attributes,
    provenance: {
      source: normalized.provenance.source,
      sourceCollection: normalized.provenance.sourceCollection,
      sourceId: normalized.provenance.sourceId,
      importBatchId: normalized.provenance.importBatchId,
      confidence: normalized.provenance.confidence,
      note: normalized.provenance.note,
    },
  }));
}

module.exports = {
  endpointKey,
  normalizeEndpoint,
  normalizeRelationInput,
  relationContentHash,
  relationDedupeKey,
  safeObject,
  sha256,
  stable,
};
