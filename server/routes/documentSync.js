const express = require('express');
const auth = require('../middlewares/middleware-auth');
const requireTenant = require('../middlewares/requireTenant');
const audit = require('../utils/auditLogger');
const logicalDocuments = require('../services/sync/logicalDocumentService');
const sync = require('../services/sync/documentSyncService');
const documentAccess = require('../services/sync/documentSyncAccess');

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
  if (status >= 500) console.error('[documentSync]', err);
  return res.status(status).json({
    error: err?.code || 'DOCUMENT_SYNC_ERROR',
    message: err?.message || 'Erreur du registre documentaire.',
  });
}

async function operationForUser(req) {
  const operation = await sync.getOperation({ tenantId: req.tenantId, operationId: req.params.operationId });
  await documentAccess.assertOperationAccess({
    tenantId: req.tenantId,
    userId: userId(req),
    operationId: req.params.operationId,
    operation,
  });
  return operation;
}

async function authorizeWorkerCommand(req) {
  const authorization = await documentAccess.assertWorkerOrTechnicalAdmin(req);
  const operation = await sync.getOperation({ tenantId: req.tenantId, operationId: req.params.operationId });
  if (authorization.internalWorker) {
    // Le token serveur remplace l'utilisateur final, mais jamais le périmètre
    // tenant : le document logique doit toujours appartenir au même cabinet.
    await documentAccess.findLogical({ tenantId: req.tenantId, logicalDocumentId: operation.logicalDocumentId });
  } else {
    await documentAccess.assertOperationAccess({
      tenantId: req.tenantId,
      userId: userId(req),
      operationId: req.params.operationId,
      operation,
    });
  }
  return operation;
}

router.post('/documents', async (req, res) => {
  try {
    await documentAccess.assertDossierAccess({
      tenantId: req.tenantId,
      userId: userId(req),
      dossierId: req.body?.dossierId,
    });
    const result = await logicalDocuments.registerDocument({
      tenantId: req.tenantId,
      dossierId: req.body?.dossierId,
      userId: userId(req),
      input: req.body || {},
    });
    const document = json(result.document);
    audit.create(req, 'logical-document', document._id, { identityKey: document.identityKey, created: result.created });
    return res.status(result.created ? 201 : 200).json({ ok: true, ...result, document });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.get('/documents/resolve', async (req, res) => {
  try {
    await documentAccess.assertDossierAccess({ tenantId: req.tenantId, userId: userId(req), dossierId: req.query.dossierId });
    const document = await logicalDocuments.resolveDocumentAlias({
      tenantId: req.tenantId,
      dossierId: req.query.dossierId,
      system: req.query.system,
      externalId: req.query.externalId,
    });
    return res.json({ document });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.get('/documents/:logicalDocumentId', async (req, res) => {
  try {
    await documentAccess.assertDocumentAccess({
      tenantId: req.tenantId,
      userId: userId(req),
      logicalDocumentId: req.params.logicalDocumentId,
    });
    return res.json(await logicalDocuments.getDocumentGraph({
      tenantId: req.tenantId,
      logicalDocumentId: req.params.logicalDocumentId,
    }));
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.post('/documents/:logicalDocumentId/versions', async (req, res) => {
  try {
    await documentAccess.assertDocumentAccess({
      tenantId: req.tenantId,
      userId: userId(req),
      logicalDocumentId: req.params.logicalDocumentId,
    });
    const result = await logicalDocuments.addVersion({
      tenantId: req.tenantId,
      logicalDocumentId: req.params.logicalDocumentId,
      userId: userId(req),
      input: req.body || {},
    });
    const version = json(result.version);
    audit.create(req, 'logical-document-version', version.versionId, {
      logicalDocumentId: req.params.logicalDocumentId,
      conflict: Boolean(result.conflict),
    });
    return res.status(result.created ? 201 : 200).json({ ok: true, ...result, version });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.post('/documents/:logicalDocumentId/copies', async (req, res) => {
  try {
    await documentAccess.assertDocumentAccess({
      tenantId: req.tenantId,
      userId: userId(req),
      logicalDocumentId: req.params.logicalDocumentId,
    });
    const result = await logicalDocuments.registerCopy({
      tenantId: req.tenantId,
      logicalDocumentId: req.params.logicalDocumentId,
      userId: userId(req),
      input: req.body || {},
    });
    return res.status(result.created ? 201 : 200).json({ ok: true, ...result, copy: json(result.copy) });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.post('/copies/:copyId/locations', async (req, res) => {
  try {
    await documentAccess.assertCopyAccess({
      tenantId: req.tenantId,
      userId: userId(req),
      copyId: req.params.copyId,
    });
    const result = await logicalDocuments.registerLocation({
      tenantId: req.tenantId,
      copyId: req.params.copyId,
      userId: userId(req),
      input: req.body || {},
    });
    return res.status(result.created ? 201 : 200).json({ ok: true, ...result, location: json(result.location) });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.post('/operations', async (req, res) => {
  try {
    await documentAccess.assertDocumentAccess({
      tenantId: req.tenantId,
      userId: userId(req),
      logicalDocumentId: req.body?.logicalDocumentId,
    });
    const result = await sync.enqueue({
      tenantId: req.tenantId,
      logicalDocumentId: req.body?.logicalDocumentId,
      userId: userId(req),
      input: req.body || {},
    });
    const operation = json(result.operation);
    audit.create(req, 'document-sync-operation', operation.operationId, {
      logicalDocumentId: operation.logicalDocumentId,
      direction: operation.direction,
      idempotent: result.idempotent,
    });
    return res.status(result.created ? 202 : 200).json({ ok: true, ...result, operation });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.get('/operations', async (req, res) => {
  try {
    if (req.query.logicalDocumentId) {
      await documentAccess.assertDocumentAccess({
        tenantId: req.tenantId,
        userId: userId(req),
        logicalDocumentId: req.query.logicalDocumentId,
      });
    } else {
      await documentAccess.assertTechnicalAdmin({ tenantId: req.tenantId, userId: userId(req) });
    }
    const operations = await sync.listOperations({
      tenantId: req.tenantId,
      logicalDocumentId: req.query.logicalDocumentId,
      status: req.query.status,
      limit: req.query.limit,
      cursor: req.query.cursor,
    });
    return res.json({
      operations,
      nextCursor: operations.length ? String(operations[operations.length - 1]._id) : null,
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.get('/operations/:operationId', async (req, res) => {
  try {
    const operation = await operationForUser(req);
    return res.json({ operation });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.post('/operations/:operationId/claim', async (req, res) => {
  try {
    await authorizeWorkerCommand(req);
    const operation = await sync.claim({
      tenantId: req.tenantId,
      operationId: req.params.operationId,
      workerId: req.body?.workerId,
      leaseMs: req.body?.leaseMs,
    });
    return res.json({ ok: true, operation: json(operation) });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.post('/operations/:operationId/checkpoint', async (req, res) => {
  try {
    await authorizeWorkerCommand(req);
    const operation = await sync.checkpoint({
      tenantId: req.tenantId,
      operationId: req.params.operationId,
      workerId: req.body?.workerId,
      checkpoint: req.body?.checkpoint || {},
      leaseMs: req.body?.leaseMs,
    });
    return res.json({ ok: true, operation: json(operation) });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.post('/operations/:operationId/complete', async (req, res) => {
  try {
    await authorizeWorkerCommand(req);
    const result = await sync.complete({
      tenantId: req.tenantId,
      operationId: req.params.operationId,
      workerId: req.body?.workerId,
      result: req.body?.result || {},
    });
    return res.json({ ok: true, ...result, operation: json(result.operation) });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.post('/operations/:operationId/fail', async (req, res) => {
  try {
    await authorizeWorkerCommand(req);
    const result = await sync.fail({
      tenantId: req.tenantId,
      operationId: req.params.operationId,
      workerId: req.body?.workerId,
      error: req.body?.error || {},
      retryable: Boolean(req.body?.retryable),
    });
    return res.json({ ok: true, ...result, operation: json(result.operation) });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.post('/operations/:operationId/conflict', async (req, res) => {
  try {
    await authorizeWorkerCommand(req);
    const operation = await sync.recordConflict({
      tenantId: req.tenantId,
      operationId: req.params.operationId,
      workerId: req.body?.workerId,
      conflict: req.body?.conflict || {},
    });
    audit.update(req, 'document-sync-operation', req.params.operationId, { status: 'conflict', kind: operation.conflict?.kind });
    return res.status(409).json({ ok: false, error: 'SYNC_CONFLICT', operation: json(operation) });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.post('/operations/:operationId/resolve', async (req, res) => {
  try {
    await operationForUser(req);
    const operation = await sync.resolveConflict({
      tenantId: req.tenantId,
      operationId: req.params.operationId,
      userId: userId(req),
      resolution: req.body?.resolution,
      note: req.body?.note,
    });
    audit.update(req, 'document-sync-operation', req.params.operationId, { resolution: req.body?.resolution });
    return res.json({ ok: true, operation: json(operation) });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.post('/operations/:operationId/resume', async (req, res) => {
  try {
    await operationForUser(req);
    const result = await sync.resume({ tenantId: req.tenantId, operationId: req.params.operationId });
    return res.json({ ok: true, ...result, operation: json(result.operation) });
  } catch (err) {
    return errorResponse(res, err);
  }
});

module.exports = router;
