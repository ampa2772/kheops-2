const crypto = require('crypto');
const mongoose = require('mongoose');
const ContactIdentity = require('../../models/Relations/ContactIdentity');

function objectId(value, label) {
  if (!mongoose.Types.ObjectId.isValid(String(value || ''))) {
    throw Object.assign(new Error(`${label} invalide.`), { statusCode: 400, code: 'INVALID_ID' });
  }
  return new mongoose.Types.ObjectId(String(value));
}

function text(value, max = 300) {
  return String(value || '').trim().slice(0, max);
}

function normalizedText(value) {
  return text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeContact(input = {}) {
  const displayName = text(input.displayName || [input.firstName, input.lastName].filter(Boolean).join(' ') || input.organizationName);
  if (!displayName) throw Object.assign(new Error('displayName requis.'), { statusCode: 400, code: 'CONTACT_IDENTITY_VALIDATION' });
  const email = text(input.email, 320).toLowerCase();
  const phone = text(input.phone, 40).replace(/[^0-9+]/g, '');
  const siret = text(input.siret, 20).replace(/\D/g, '');
  const name = normalizedText(displayName);
  const duplicateKeys = [];
  if (siret.length >= 9) duplicateKeys.push(`siret:${siret}`);
  if (email.includes('@')) duplicateKeys.push(`email:${email}`);
  if (phone.length >= 8 && name) duplicateKeys.push(`phone-name:${phone}:${name}`);
  const aliases = (Array.isArray(input.aliases) ? input.aliases : []).slice(0, 100).map((alias) => ({
    system: text(alias.system, 100).toLowerCase(),
    externalId: text(alias.externalId, 240),
    sourceCollection: text(alias.sourceCollection, 160),
    observedAt: alias.observedAt || new Date(),
  })).filter((alias) => alias.system && alias.externalId);
  const allowedSources = new Set(['user', 'import', 'migration', 'api', 'system']);
  const provenance = (Array.isArray(input.provenance) ? input.provenance : [input.provenance || { source: 'user' }])
    .slice(0, 100)
    .map((item = {}) => ({
      source: allowedSources.has(item.source) ? item.source : 'user',
      sourceCollection: text(item.sourceCollection, 160),
      sourceId: text(item.sourceId, 240),
      importBatchId: text(item.importBatchId, 160),
      observedAt: item.observedAt || new Date(),
    }));
  const kind = ['person', 'organization', 'public_body', 'professional', 'unknown'].includes(input.kind) ? input.kind : 'unknown';
  const identitySeed = aliases[0]
    ? `${aliases[0].system}:${aliases[0].externalId}`
    : `${kind}:${siret || email || `${name}:${phone}`}`;
  return {
    identityKey: input.identityKey || `contact_${crypto.createHash('sha256').update(identitySeed).digest('hex').slice(0, 40)}`,
    kind,
    displayName,
    normalized: { name, email, phone, siret },
    duplicateKeys: [...new Set(duplicateKeys)],
    aliases,
    provenance,
    idempotencyKey: input.idempotencyKey ? text(input.idempotencyKey, 240) : null,
    migrationState: input.migrationState,
  };
}

function makeContactIdentityService({ Identity = ContactIdentity } = {}) {
  async function register({ tenantId, userId, input }) {
    const tenant = objectId(tenantId, 'tenantId');
    const actor = objectId(userId, 'userId');
    const normalized = normalizeContact(input);
    if (normalized.idempotencyKey) {
      const retried = await Identity.findOne({ tenantId: tenant, idempotencyKey: normalized.idempotencyKey }).lean();
      if (retried) return { identity: retried, created: false, idempotent: true };
    }
    if (normalized.aliases.length) {
      const aliasMatch = await Identity.findOne({
        tenantId: tenant,
        $or: normalized.aliases.map((alias) => ({
          aliases: { $elemMatch: { system: alias.system, externalId: alias.externalId } },
        })),
      }).lean();
      if (aliasMatch) return { identity: aliasMatch, created: false, idempotent: true };
    }
    const existing = await Identity.findOne({ tenantId: tenant, identityKey: normalized.identityKey }).lean();
    if (existing) return { identity: existing, created: false, idempotent: false };
    try {
      const identity = await Identity.create({
        tenantId: tenant,
        ...normalized,
        createdBy: actor,
        updatedBy: actor,
      });
      return { identity, created: true, idempotent: false };
    } catch (err) {
      if (err && err.code === 11000) {
        const winner = await Identity.findOne({ tenantId: tenant, $or: [
          { identityKey: normalized.identityKey },
          ...(normalized.aliases.length ? normalized.aliases.map((alias) => ({
            aliases: { $elemMatch: { system: alias.system, externalId: alias.externalId } },
          })) : []),
        ] }).lean();
        if (winner) return { identity: winner, created: false, idempotent: true };
      }
      throw err;
    }
  }

  async function resolveAlias({ tenantId, system, externalId }) {
    const identity = await Identity.findOne({
      tenantId: objectId(tenantId, 'tenantId'),
      aliases: { $elemMatch: { system: text(system, 100).toLowerCase(), externalId: text(externalId, 240) } },
    }).lean();
    if (!identity) throw Object.assign(new Error('Identité de contact introuvable.'), { statusCode: 404, code: 'CONTACT_IDENTITY_NOT_FOUND' });
    return identity;
  }

  async function previewDuplicates({ tenantId, identityId, limit = 100 }) {
    const tenant = objectId(tenantId, 'tenantId');
    const identity = await Identity.findOne({ _id: objectId(identityId, 'identityId'), tenantId: tenant, status: 'active' }).lean();
    if (!identity) throw Object.assign(new Error('Identité active introuvable.'), { statusCode: 404, code: 'CONTACT_IDENTITY_NOT_FOUND' });
    if (!identity.duplicateKeys?.length) return { identity, candidates: [] };
    const candidates = await Identity.find({
      tenantId: tenant,
      _id: { $ne: identity._id },
      status: 'active',
      duplicateKeys: { $in: identity.duplicateKeys },
    }).limit(Math.max(1, Math.min(250, Number(limit) || 100))).lean();
    return { identity, candidates };
  }

  async function merge({ tenantId, sourceIdentityId, targetIdentityId, userId, reason = '' }) {
    const tenant = objectId(tenantId, 'tenantId');
    const sourceId = objectId(sourceIdentityId, 'sourceIdentityId');
    const targetId = objectId(targetIdentityId, 'targetIdentityId');
    const actor = objectId(userId, 'userId');
    if (String(sourceId) === String(targetId)) throw Object.assign(new Error('Fusion avec soi-même interdite.'), { statusCode: 400, code: 'CONTACT_SELF_MERGE' });
    const target = await Identity.findOne({ _id: targetId, tenantId: tenant, status: 'active' }).lean();
    if (!target) throw Object.assign(new Error('Identité cible active introuvable.'), { statusCode: 404, code: 'CONTACT_IDENTITY_NOT_FOUND' });
    const source = await Identity.findOneAndUpdate({ _id: sourceId, tenantId: tenant, status: 'active' }, {
      $set: {
        status: 'merged',
        mergedIntoIdentityId: targetId,
        mergeReason: text(reason, 1000),
        updatedBy: actor,
      },
      $inc: { revision: 1 },
    }, { new: true });
    if (!source) {
      const prior = await Identity.findOne({ _id: sourceId, tenantId: tenant }).lean();
      if (prior?.status === 'merged' && String(prior.mergedIntoIdentityId) === String(targetId)) return { source: prior, target, merged: false, idempotent: true };
      throw Object.assign(new Error('Identité source introuvable ou déjà fusionnée ailleurs.'), { statusCode: 409, code: 'CONTACT_MERGE_CONFLICT' });
    }
    await Identity.updateOne({ _id: targetId, tenantId: tenant }, {
      $addToSet: {
        aliases: { $each: source.aliases || [] },
        provenance: { $each: source.provenance || [] },
        duplicateKeys: { $each: source.duplicateKeys || [] },
      },
      $set: { updatedBy: actor },
      $inc: { revision: 1 },
    });
    return { source, target, merged: true, idempotent: false };
  }

  async function archiveMigrated({ tenantId, identityId, userId, runId }) {
    return Identity.findOneAndUpdate({
      _id: objectId(identityId, 'identityId'),
      tenantId: objectId(tenantId, 'tenantId'),
      'migrationState.status': 'migrated',
      'migrationState.runId': runId,
      status: 'active',
    }, {
      $set: {
        status: 'archived',
        'migrationState.status': 'rolled_back',
        'migrationState.rolledBackAt': new Date(),
        updatedBy: objectId(userId, 'userId'),
      },
      $inc: { revision: 1 },
    }, { new: true });
  }

  return { archiveMigrated, merge, previewDuplicates, register, resolveAlias };
}

module.exports = { makeContactIdentityService, normalizeContact, ...makeContactIdentityService() };
