const mongoose = require('mongoose');
const EntityRelation = require('../../models/Relations/EntityRelation');
const {
  normalizeRelationInput,
  relationContentHash,
  relationDedupeKey,
  safeObject,
} = require('./relationKey');

function objectId(value, label) {
  if (!mongoose.Types.ObjectId.isValid(String(value || ''))) {
    throw Object.assign(new Error(`${label} invalide.`), { statusCode: 400, code: 'INVALID_ID' });
  }
  return new mongoose.Types.ObjectId(String(value));
}

function makeRelationService({ Relation = EntityRelation } = {}) {
  async function createRelation({ tenantId, userId, input, replaceExisting = false }) {
    const tenant = objectId(tenantId, 'tenantId');
    const actor = objectId(userId, 'userId');
    const normalized = normalizeRelationInput(input);
    const dedupeKey = relationDedupeKey(normalized);
    const contentHash = relationContentHash(normalized);

    if (normalized.idempotencyKey) {
      const retried = await Relation.findOne({ tenantId: tenant, idempotencyKey: normalized.idempotencyKey }).lean();
      if (retried) return { relation: retried, created: false, deduplicated: true, idempotent: true };
    }
    const current = await Relation.findOne({ tenantId: tenant, dedupeKey, isCurrent: true });
    if (current) {
      if (current.contentHash === contentHash) {
        return { relation: current.toObject ? current.toObject() : current, created: false, deduplicated: true, idempotent: false };
      }
      if (!replaceExisting) {
        throw Object.assign(new Error('Une relation équivalente existe déjà avec des informations différentes.'), {
          statusCode: 409,
          code: 'RELATION_ALREADY_EXISTS',
          logicalRelationId: current.logicalRelationId,
        });
      }
      return transitionRelation({
        tenantId: tenant,
        userId: actor,
        logicalRelationId: current.logicalRelationId,
        patch: normalized,
        idempotencyKey: normalized.idempotencyKey,
      });
    }

    try {
      const relation = await Relation.create({
        tenantId: tenant,
        logicalRelationId: new mongoose.Types.ObjectId(),
        revision: 1,
        isCurrent: true,
        dedupeKey,
        contentHash,
        ...normalized,
        createdBy: actor,
      });
      return { relation, created: true, deduplicated: false, idempotent: false };
    } catch (err) {
      if (err && err.code === 11000) {
        const winner = await Relation.findOne({ tenantId: tenant, $or: [
          { dedupeKey, isCurrent: true },
          ...(normalized.idempotencyKey ? [{ idempotencyKey: normalized.idempotencyKey }] : []),
        ] }).lean();
        if (winner) return { relation: winner, created: false, deduplicated: true, idempotent: true };
      }
      throw err;
    }
  }

  async function transitionRelation({ tenantId, userId, logicalRelationId, patch = {}, idempotencyKey = null }) {
    const tenant = objectId(tenantId, 'tenantId');
    const actor = objectId(userId, 'userId');
    const logicalId = objectId(logicalRelationId, 'logicalRelationId');
    if (idempotencyKey) {
      const retried = await Relation.findOne({ tenantId: tenant, idempotencyKey: String(idempotencyKey) }).lean();
      if (retried) return { relation: retried, created: false, deduplicated: true, idempotent: true };
    }
    const current = await Relation.findOne({ tenantId: tenant, logicalRelationId: logicalId, isCurrent: true });
    if (!current) throw Object.assign(new Error('Relation courante introuvable.'), { statusCode: 404, code: 'RELATION_NOT_FOUND' });
    const currentPlain = current.toObject ? current.toObject() : current;
    const normalized = normalizeRelationInput({
      relationType: currentPlain.relationType,
      direction: currentPlain.direction,
      subject: currentPlain.subject,
      object: currentPlain.object,
      roles: patch.roles === undefined ? currentPlain.roles : patch.roles,
      status: patch.status === undefined ? currentPlain.status : patch.status,
      validFrom: patch.validFrom === undefined ? currentPlain.validFrom : patch.validFrom,
      validTo: patch.validTo === undefined ? currentPlain.validTo : patch.validTo,
      attributes: patch.attributes === undefined ? currentPlain.attributes : patch.attributes,
      provenance: patch.provenance || {
        ...(currentPlain.provenance || {}),
        source: 'user',
        observedAt: new Date(),
      },
      idempotencyKey,
    });
    const contentHash = relationContentHash(normalized);
    if (contentHash === currentPlain.contentHash) {
      return { relation: currentPlain, created: false, deduplicated: true, idempotent: false };
    }

    const retired = await Relation.findOneAndUpdate(
      { _id: currentPlain._id, isCurrent: true, revision: currentPlain.revision },
      { $set: { isCurrent: false } },
      { new: true },
    );
    if (!retired) throw Object.assign(new Error('La relation a changé simultanément.'), { statusCode: 409, code: 'RELATION_CONFLICT' });
    let next;
    try {
      next = await Relation.create({
        tenantId: tenant,
        logicalRelationId: logicalId,
        revision: currentPlain.revision + 1,
        isCurrent: true,
        dedupeKey: currentPlain.dedupeKey,
        contentHash,
        ...normalized,
        supersedesRevisionId: currentPlain._id,
        createdBy: actor,
      });
    } catch (err) {
      await Relation.updateOne({ _id: currentPlain._id, isCurrent: false }, { $set: { isCurrent: true } }).catch(() => {});
      throw err && err.code === 11000
        ? Object.assign(new Error('La relation a changé simultanément.'), { statusCode: 409, code: 'RELATION_CONFLICT' })
        : err;
    }
    await Relation.updateOne({ _id: currentPlain._id }, { $set: { supersededByRevisionId: next._id } });
    return { relation: next, created: true, deduplicated: false, idempotent: false, previousRevision: currentPlain.revision };
  }

  async function archiveRelation(args) {
    return transitionRelation({ ...args, patch: {
      status: 'archived',
      provenance: args.provenance || { source: 'user', note: 'Relation archivée sans suppression.' },
    } });
  }

  async function getHistory({ tenantId, logicalRelationId }) {
    return Relation.find({
      tenantId: objectId(tenantId, 'tenantId'),
      logicalRelationId: objectId(logicalRelationId, 'logicalRelationId'),
    }).sort({ revision: 1 }).lean();
  }

  async function listRelations({ tenantId, entityType, entityId, relationType, status, limit = 100, cursor }) {
    const query = { tenantId: objectId(tenantId, 'tenantId'), isCurrent: true };
    if (relationType) query.relationType = String(relationType).toLowerCase();
    if (status) query.status = status;
    if (entityId) {
      const endpoint = { entityId: String(entityId) };
      if (entityType) endpoint.entityType = String(entityType).toLowerCase();
      query.$or = [
        Object.fromEntries(Object.entries(endpoint).map(([key, value]) => [`subject.${key}`, value])),
        Object.fromEntries(Object.entries(endpoint).map(([key, value]) => [`object.${key}`, value])),
      ];
    }
    if (cursor) query._id = { $gt: objectId(cursor, 'cursor') };
    return Relation.find(query).sort({ _id: 1 }).limit(Math.max(1, Math.min(250, Number(limit) || 100))).lean();
  }

  async function previewDuplicates({ tenantId }) {
    return Relation.aggregate([
      { $match: { tenantId: objectId(tenantId, 'tenantId'), isCurrent: true } },
      { $group: { _id: '$dedupeKey', count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 500 },
    ]);
  }

  return {
    archiveRelation,
    createRelation,
    getHistory,
    listRelations,
    previewDuplicates,
    transitionRelation,
    sanitizeAttributes: safeObject,
  };
}

module.exports = { makeRelationService, ...makeRelationService() };
