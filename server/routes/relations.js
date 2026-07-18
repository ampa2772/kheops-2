const express = require('express');
const auth = require('../middlewares/middleware-auth');
const requireTenant = require('../middlewares/requireTenant');
const audit = require('../utils/auditLogger');
const relationService = require('../services/relations/relationService');
const contactIdentities = require('../services/relations/contactIdentityService');
const relationAccess = require('../services/relations/relationAccess');

const router = express.Router();
router.use(auth, requireTenant);

function userId(req) {
  return req.user && typeof req.user === 'object' ? (req.user._id || req.user.id || req.user.user) : req.user;
}

function json(value) {
  return value && value.toObject ? value.toObject() : value;
}

function errorResponse(res, err) {
  const status = Number(err && err.statusCode) || 500;
  if (status >= 500) console.error('[relations]', err);
  const payload = {
    error: err?.code || 'RELATION_ERROR',
    message: err?.message || 'Erreur du registre de relations.',
  };
  if (err?.logicalRelationId) payload.logicalRelationId = String(err.logicalRelationId);
  return res.status(status).json(payload);
}

router.get('/duplicates/preview', async (req, res) => {
  try {
    await relationAccess.assertAuditAdmin({ tenantId: req.tenantId, userId: userId(req) });
    const duplicates = await relationService.previewDuplicates({ tenantId: req.tenantId });
    return res.json({ duplicates });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.get('/', async (req, res) => {
  try {
    const actor = userId(req);
    if (!req.query.entityId) {
      await relationAccess.assertAuditAdmin({ tenantId: req.tenantId, userId: actor });
    } else if (['dossier', 'matter'].includes(String(req.query.entityType || '').toLowerCase())) {
      await relationAccess.assertDossierAccess({ tenantId: req.tenantId, userId: actor, dossierId: req.query.entityId });
    }
    const relations = await relationService.listRelations({
      tenantId: req.tenantId,
      entityType: req.query.entityType,
      entityId: req.query.entityId,
      relationType: req.query.relationType,
      status: req.query.status,
      limit: req.query.limit,
      cursor: req.query.cursor,
    });
    const visibleRelations = await relationAccess.filterAccessibleRelations({ tenantId: req.tenantId, userId: actor, relations });
    return res.json({
      relations: visibleRelations,
      nextCursor: relations.length ? String(relations[relations.length - 1]._id) : null,
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.post('/', async (req, res) => {
  try {
    await relationAccess.assertRelationAccess({ tenantId: req.tenantId, userId: userId(req), relation: req.body || {} });
    const result = await relationService.createRelation({
      tenantId: req.tenantId,
      userId: userId(req),
      input: req.body || {},
      replaceExisting: Boolean(req.body && req.body.replaceExisting),
    });
    const relation = json(result.relation);
    audit.create(req, 'entity-relation', relation.logicalRelationId, {
      revision: relation.revision,
      relationType: relation.relationType,
      deduplicated: result.deduplicated,
    });
    return res.status(result.created ? 201 : 200).json({ ok: true, ...result, relation });
  } catch (err) {
    audit.failure(req, 'CREATE', 'entity-relation', null, err.code || 'relation-create-failed');
    return errorResponse(res, err);
  }
});

router.post('/identities', async (req, res) => {
  try {
    const result = await contactIdentities.register({
      tenantId: req.tenantId,
      userId: userId(req),
      input: req.body || {},
    });
    const identity = json(result.identity);
    audit.create(req, 'contact-identity', identity._id, {
      identityKey: identity.identityKey,
      created: result.created,
    });
    return res.status(result.created ? 201 : 200).json({ ok: true, ...result, identity });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.get('/identities/resolve', async (req, res) => {
  try {
    // La résolution révèle des alias et des coordonnées normalisées à
    // l'échelle du cabinet : elle reste réservée à l'audit administratif.
    await relationAccess.assertAuditAdmin({ tenantId: req.tenantId, userId: userId(req) });
    const identity = await contactIdentities.resolveAlias({
      tenantId: req.tenantId,
      system: req.query.system,
      externalId: req.query.externalId,
    });
    return res.json({ identity });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.get('/identities/:identityId/duplicates', async (req, res) => {
  try {
    await relationAccess.assertAuditAdmin({ tenantId: req.tenantId, userId: userId(req) });
    return res.json(await contactIdentities.previewDuplicates({
      tenantId: req.tenantId,
      identityId: req.params.identityId,
      limit: req.query.limit,
    }));
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.post('/identities/:identityId/merge', async (req, res) => {
  try {
    await relationAccess.assertAuditAdmin({ tenantId: req.tenantId, userId: userId(req) });
    const result = await contactIdentities.merge({
      tenantId: req.tenantId,
      sourceIdentityId: req.params.identityId,
      targetIdentityId: req.body?.targetIdentityId,
      userId: userId(req),
      reason: req.body?.reason,
    });
    audit.update(req, 'contact-identity', req.params.identityId, {
      status: 'merged',
      targetIdentityId: req.body?.targetIdentityId,
      idempotent: result.idempotent,
    });
    return res.json({ ok: true, ...result, source: json(result.source), target: json(result.target) });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.get('/:logicalRelationId/history', async (req, res) => {
  try {
    const revisions = await relationService.getHistory({
      tenantId: req.tenantId,
      logicalRelationId: req.params.logicalRelationId,
    });
    if (!revisions.length) return res.status(404).json({ error: 'RELATION_NOT_FOUND', message: 'Relation introuvable.' });
    await relationAccess.assertRelationAccess({ tenantId: req.tenantId, userId: userId(req), relation: revisions[revisions.length - 1] });
    return res.json({ logicalRelationId: req.params.logicalRelationId, revisions });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.post('/:logicalRelationId/transition', async (req, res) => {
  try {
    const history = await relationService.getHistory({
      tenantId: req.tenantId,
      logicalRelationId: req.params.logicalRelationId,
    });
    if (!history.length) return res.status(404).json({ error: 'RELATION_NOT_FOUND', message: 'Relation introuvable.' });
    await relationAccess.assertRelationAccess({ tenantId: req.tenantId, userId: userId(req), relation: history[history.length - 1] });
    const result = await relationService.transitionRelation({
      tenantId: req.tenantId,
      userId: userId(req),
      logicalRelationId: req.params.logicalRelationId,
      patch: req.body?.patch || {},
      idempotencyKey: req.body?.idempotencyKey || null,
    });
    const relation = json(result.relation);
    audit.update(req, 'entity-relation', req.params.logicalRelationId, {
      revision: relation.revision,
      previousRevision: result.previousRevision || null,
      status: relation.status,
    });
    return res.json({ ok: true, ...result, relation });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.post('/:logicalRelationId/archive', async (req, res) => {
  try {
    const history = await relationService.getHistory({
      tenantId: req.tenantId,
      logicalRelationId: req.params.logicalRelationId,
    });
    if (!history.length) return res.status(404).json({ error: 'RELATION_NOT_FOUND', message: 'Relation introuvable.' });
    await relationAccess.assertRelationAccess({ tenantId: req.tenantId, userId: userId(req), relation: history[history.length - 1] });
    const result = await relationService.archiveRelation({
      tenantId: req.tenantId,
      userId: userId(req),
      logicalRelationId: req.params.logicalRelationId,
      idempotencyKey: req.body?.idempotencyKey || null,
      provenance: {
        source: 'user',
        note: String(req.body?.note || 'Relation archivée sans suppression.').slice(0, 1000),
      },
    });
    const relation = json(result.relation);
    audit.update(req, 'entity-relation', req.params.logicalRelationId, { revision: relation.revision, status: 'archived' });
    return res.json({ ok: true, ...result, relation });
  } catch (err) {
    return errorResponse(res, err);
  }
});

module.exports = router;
