const DocumentTemplate = require('../models/DocumentEditor/DocumentTemplate');

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function templateKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function normalizeDocumentType(value) {
  return templateKey(value) || 'generic';
}

function valueOf(doc, key) {
  return typeof doc?.get === 'function' ? doc.get(key) : doc?.[key];
}

function templateToClient(template) {
  if (!template) return null;
  return {
    id: String(valueOf(template, '_id')),
    templateKey: valueOf(template, 'templateKey'),
    version: valueOf(template, 'version'),
    name: valueOf(template, 'name'),
    description: valueOf(template, 'description') || '',
    documentType: valueOf(template, 'documentType') || 'generic',
    scope: clone(valueOf(template, 'scope') || {}),
    priority: Number(valueOf(template, 'priority') || 0),
    layout: clone(valueOf(template, 'layout') || {}),
    styles: clone(valueOf(template, 'styles') || {}),
    header: clone(valueOf(template, 'header') || {}),
    footer: clone(valueOf(template, 'footer') || {}),
    signature: clone(valueOf(template, 'signature') || {}),
    body: clone(valueOf(template, 'body')),
    active: valueOf(template, 'active') !== false,
    supersedesVersion: valueOf(template, 'supersedesVersion') || null,
    changeComment: valueOf(template, 'changeComment') || '',
    createdAt: valueOf(template, 'createdAt') || null,
    createdBy: valueOf(template, 'createdBy') ? String(valueOf(template, 'createdBy')) : null,
  };
}

function normalizedContext(context = {}) {
  return {
    documentType: normalizeDocumentType(context.documentType),
    jurisdiction: String(context.jurisdiction || '').trim().toLowerCase(),
    team: String(context.team || '').trim().toLowerCase(),
    responsibleLawyerId: String(context.responsibleLawyerId || ''),
    language: String(context.language || 'fr').trim().toLowerCase(),
    tags: new Set((Array.isArray(context.tags) ? context.tags : []).map((tag) => String(tag).trim().toLowerCase())),
  };
}

function scoreTemplate(template, context = {}) {
  const candidate = templateToClient(template);
  const requested = normalizedContext(context);
  if (!candidate || candidate.active === false) return Number.NEGATIVE_INFINITY;
  if (![requested.documentType, 'generic'].includes(normalizeDocumentType(candidate.documentType))) {
    return Number.NEGATIVE_INFINITY;
  }
  let score = Number(candidate.priority || 0) * 100;
  if (normalizeDocumentType(candidate.documentType) === requested.documentType) score += 50;
  const scope = candidate.scope || {};
  const exact = [
    ['jurisdiction', requested.jurisdiction, 20],
    ['team', requested.team, 15],
    ['responsibleLawyerId', requested.responsibleLawyerId, 30],
    ['language', requested.language, 5],
  ];
  for (const [field, actual, weight] of exact) {
    const expected = String(scope[field] || '').trim().toLowerCase();
    if (!expected) continue;
    if (!actual || expected !== actual.toLowerCase()) return Number.NEGATIVE_INFINITY;
    score += weight;
  }
  for (const tag of scope.tags || []) {
    if (!requested.tags.has(String(tag).trim().toLowerCase())) return Number.NEGATIVE_INFINITY;
    score += 2;
  }
  return score + Math.min(9, Number(candidate.version || 0) / 1000);
}

async function resolveTemplate({ tenantId, context = {} }) {
  const requestedType = normalizeDocumentType(context.documentType);
  const rows = await DocumentTemplate.find({
    tenantId,
    active: true,
    documentType: { $in: [requestedType, 'generic'] },
  }).sort({ version: -1 }).lean();
  const latestByKey = [];
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.templateKey)) continue;
    seen.add(row.templateKey);
    latestByKey.push(row);
  }
  return latestByKey
    .map((row) => ({ row, score: scoreTemplate(row, context) }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((left, right) => right.score - left.score || Number(right.row.version) - Number(left.row.version))[0]?.row || null;
}

async function createTemplateVersion({ tenantId, userId, payload = {}, key = null, attempt = 0 }) {
  const normalizedKey = templateKey(key || payload.templateKey || payload.name);
  if (!normalizedKey) {
    const error = new Error('Le nom ou la clé du modèle est requis.');
    error.statusCode = 400;
    error.code = 'TEMPLATE_KEY_REQUIRED';
    throw error;
  }
  const latest = await DocumentTemplate.findOne({ tenantId, templateKey: normalizedKey }).sort({ version: -1 }).lean();
  const version = latest ? Number(latest.version) + 1 : 1;
  try {
    return await DocumentTemplate.create({
      tenantId,
      templateKey: normalizedKey,
      version,
      name: String(payload.name || latest?.name || normalizedKey).trim(),
      description: payload.description ?? latest?.description ?? '',
      documentType: normalizeDocumentType(payload.documentType ?? latest?.documentType),
      scope: clone(payload.scope ?? latest?.scope ?? { language: 'fr' }),
      priority: Number(payload.priority ?? latest?.priority ?? 0),
      layout: clone(payload.layout ?? latest?.layout ?? {}),
      styles: clone(payload.styles ?? latest?.styles ?? {}),
      header: clone(payload.header ?? latest?.header ?? {}),
      footer: clone(payload.footer ?? latest?.footer ?? {}),
      signature: clone(payload.signature ?? latest?.signature ?? {}),
      body: clone(payload.body ?? latest?.body ?? null),
      active: payload.active !== false,
      supersedesVersion: latest?.version || null,
      changeComment: String(payload.changeComment || '').slice(0, 1000),
      createdBy: userId,
    });
  } catch (error) {
    if (error?.code === 11000 && attempt < 2) {
      return createTemplateVersion({ tenantId, userId, payload, key: normalizedKey, attempt: attempt + 1 });
    }
    throw error;
  }
}

function regionBlocks(region, variant = 'default') {
  const value = region?.[variant];
  if (value && Array.isArray(value.blocks)) return clone(value);
  if (Array.isArray(value)) return { blocks: clone(value) };
  return null;
}

function applyTemplateToDocument(document, rawTemplate, options = {}) {
  const template = templateToClient(rawTemplate);
  if (!template) throw new TypeError('Modèle documentaire requis.');
  const next = clone(document || {});
  const sections = new Set(options.sections?.length
    ? options.sections
    : ['layout', 'header', 'footer', 'signature', 'styles']);
  const overrides = { ...(options.localOverrides || {}) };
  next.page = next.page || {};

  if (sections.has('layout') && !overrides.layout) {
    next.page = { ...next.page, ...clone(template.layout || {}) };
  }
  if (sections.has('header') && !overrides.header) {
    const normal = regionBlocks(template.header, 'default');
    const first = regionBlocks(template.header, 'firstPage');
    const even = regionBlocks(template.header, 'evenPages');
    if (normal) next.page.header = normal;
    if (first) next.page.firstPageHeader = first;
    if (even) next.page.evenPageHeader = even;
    if (template.header?.distanceMm != null) next.page.headerDistance = template.header.distanceMm;
  }
  if (sections.has('footer') && !overrides.footer) {
    const normal = regionBlocks(template.footer, 'default');
    const first = regionBlocks(template.footer, 'firstPage');
    const even = regionBlocks(template.footer, 'evenPages');
    if (normal) next.page.footer = normal;
    if (first) next.page.firstPageFooter = first;
    if (even) next.page.evenPageFooter = even;
    if (template.footer?.distanceMm != null) next.page.footerDistance = template.footer.distanceMm;
  }
  if (sections.has('signature') && !overrides.signature) next.signature = clone(template.signature || {});
  if (sections.has('styles') && !overrides.styles) next.styles = clone(template.styles || {});
  if (sections.has('body') && Array.isArray(template.body?.blocks)) next.blocks = clone(template.body.blocks);
  next.documentType = normalizeDocumentType(next.documentType || template.documentType);
  next.templateBinding = {
    templateKey: template.templateKey,
    version: template.version,
    appliedAt: new Date().toISOString(),
  };
  next.localOverrides = overrides;
  return next;
}

module.exports = {
  applyTemplateToDocument,
  createTemplateVersion,
  normalizeDocumentType,
  resolveTemplate,
  scoreTemplate,
  templateKey,
  templateToClient,
};
