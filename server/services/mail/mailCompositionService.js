const MailSignature = require('../../models/Mail/MailSignature');
const MailTemplate = require('../../models/Mail/MailTemplate');
const { sanitizeArchivedHtml, stripHtml } = require('./messageNormalization');

function keyOf(value, fallback = '') {
  return String(value || fallback)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function toClient(row) {
  if (!row) return null;
  const value = row.toObject ? row.toObject() : { ...row };
  return {
    ...value,
    id: String(value._id || value.id),
    tenantId: String(value.tenantId),
    ownerUserId: value.ownerUserId ? String(value.ownerUserId) : null,
    accountId: value.accountId ? String(value.accountId) : null,
    scope: value.ownerUserId ? 'personal' : 'cabinet',
  };
}

async function latestVersions(Model, filter, keyField) {
  const rows = await Model.find(filter).sort({ [keyField]: 1, version: -1 }).lean();
  const seen = new Set();
  return rows.filter((row) => {
    const scope = `${row.ownerUserId || 'cabinet'}:${row.accountId || ''}:${row[keyField]}`;
    if (seen.has(scope)) return false;
    seen.add(scope);
    return true;
  });
}

async function listSignatures({ tenantId, userId, includeInactive = false }) {
  return (await latestVersions(MailSignature, {
    tenantId,
    ownerUserId: { $in: [userId, null] },
    ...(includeInactive ? {} : { active: true }),
  }, 'signatureKey')).map(toClient);
}

async function resolveSignature({ tenantId, userId, accountId = null }) {
  const rows = await latestVersions(MailSignature, {
    tenantId,
    ownerUserId: { $in: [userId, null] },
    active: true,
    $or: [{ accountId }, { accountId: null }],
  }, 'signatureKey');
  const rank = (row) => (
    (String(row.ownerUserId || '') === String(userId) ? 100 : 0)
    + (accountId && String(row.accountId || '') === String(accountId) ? 20 : 0)
    + (row.isDefault ? 5 : 0)
    + Math.min(4, Number(row.version || 0) / 1000)
  );
  return rows.sort((a, b) => rank(b) - rank(a))[0] || null;
}

async function createSignatureVersion({ tenantId, userId, payload = {}, shared = false }) {
  const signatureKey = keyOf(payload.signatureKey || payload.name, 'signature');
  const ownerUserId = shared ? null : userId;
  const accountId = payload.accountId || null;
  const latest = await MailSignature.findOne({ tenantId, ownerUserId, accountId, signatureKey }).sort({ version: -1 }).lean();
  const version = Number(latest?.version || 0) + 1;
  if (payload.isDefault) {
    await MailSignature.updateMany(
      { tenantId, ownerUserId, accountId, active: true },
      { $set: { isDefault: false } },
    );
  }
  return MailSignature.create({
    tenantId,
    ownerUserId,
    accountId,
    signatureKey,
    version,
    name: String(payload.name || latest?.name || 'Signature').slice(0, 200),
    bodyHtml: sanitizeArchivedHtml(payload.bodyHtml ?? latest?.bodyHtml ?? ''),
    bodyText: String(payload.bodyText ?? latest?.bodyText ?? stripHtml(payload.bodyHtml || '')).slice(0, 100000),
    isDefault: payload.isDefault ?? latest?.isDefault ?? false,
    active: payload.active !== false,
    supersedesVersion: latest?.version || null,
    changeComment: String(payload.changeComment || '').slice(0, 1000),
    createdBy: userId,
  });
}

async function listTemplates({ tenantId, userId, includeInactive = false }) {
  return (await latestVersions(MailTemplate, {
    tenantId,
    ownerUserId: { $in: [userId, null] },
    ...(includeInactive ? {} : { active: true }),
  }, 'templateKey')).map(toClient);
}

async function createTemplateVersion({ tenantId, userId, payload = {}, shared = false }) {
  const templateKey = keyOf(payload.templateKey || payload.name, 'message');
  const ownerUserId = shared ? null : userId;
  const latest = await MailTemplate.findOne({ tenantId, ownerUserId, templateKey }).sort({ version: -1 }).lean();
  return MailTemplate.create({
    tenantId,
    ownerUserId,
    templateKey,
    version: Number(latest?.version || 0) + 1,
    name: String(payload.name || latest?.name || 'Message').slice(0, 200),
    subject: String(payload.subject ?? latest?.subject ?? '').slice(0, 4000),
    bodyHtml: sanitizeArchivedHtml(payload.bodyHtml ?? latest?.bodyHtml ?? ''),
    bodyText: String(payload.bodyText ?? latest?.bodyText ?? stripHtml(payload.bodyHtml || '')).slice(0, 200000),
    active: payload.active !== false,
    supersedesVersion: latest?.version || null,
    changeComment: String(payload.changeComment || '').slice(0, 1000),
    createdBy: userId,
  });
}

function appendSignature(draft, signature) {
  if (!signature) return { ...draft, signature: null };
  const bodyText = [draft.bodyText, signature.bodyText].filter(Boolean).join('\n\n');
  const bodyHtml = [draft.bodyHtml, signature.bodyHtml].filter(Boolean).join('<br><br>');
  return {
    ...draft,
    bodyText,
    bodyHtml,
    signature: {
      id: String(signature._id),
      key: signature.signatureKey,
      version: signature.version,
      name: signature.name,
    },
  };
}

module.exports = {
  keyOf,
  toClient,
  latestVersions,
  listSignatures,
  resolveSignature,
  createSignatureVersion,
  listTemplates,
  createTemplateVersion,
  appendSignature,
};
