const express = require('express');
const auth = require('../middlewares/middleware-auth');
const OAuthMailAccount = require('../models/Mail/OAuthMailAccount');
const { ensureDocOwnership } = require('../utils/ownershipHelpers');
const { listAccounts } = require('../services/mail/oauthAccountService');
const mailSend = require('../services/mail/mailSendService');
const { normalizePublicationFormats } = require('../services/documentPublicationService');
const audit = require('../utils/auditLogger');

const router = express.Router();

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function accountFor(userId, tenantId, accountId) {
  await listAccounts({ userId });
  const account = await OAuthMailAccount.findOne({
    tenantId,
    ownerUserId: userId,
    ...(accountId ? { _id: accountId } : {}),
    status: { $nin: ['disabled', 'disconnected'] },
  }).sort({ isDefault: -1, createdAt: 1 });
  if (!account) {
    throw Object.assign(new Error('Aucun compte expéditeur connecté.'), {
      statusCode: 409,
      code: 'MAIL_ACCOUNT_REQUIRED',
    });
  }
  return account;
}

router.post('/:id/send-by-email', auth, asyncRoute(async (req, res) => {
  const ownership = await ensureDocOwnership(req, res, req.params.id);
  if (!ownership.ok) return undefined;
  const versionId = String(req.body?.versionId || req.body?.documentVersionId || '').trim();
  if (!versionId) {
    return res.status(400).json({
      error: 'MAIL_DOCUMENT_VERSION_REQUIRED',
      message: 'Préparez et figez la version exacte avant l’envoi.',
    });
  }
  const rawArtifacts = req.body?.artifactIds || req.body?.artifacts || req.body?.artifactId || [];
  const artifactIds = [...new Set((Array.isArray(rawArtifacts) ? rawArtifacts : [rawArtifacts])
    .map((item) => String(item?.artifactId || item || '').trim())
    .filter(Boolean))];
  if (artifactIds.length > 2) {
    return res.status(400).json({
      error: 'MAIL_PUBLICATION_ARTIFACT_LIMIT',
      message: 'Deux artefacts maximum sont acceptés : DOCX et PDF de la même version.',
    });
  }
  const requestedFormats = artifactIds.length
    ? []
    : normalizePublicationFormats(req.body?.formats || req.body?.format || ['docx']);
  const attachments = artifactIds.length
    ? artifactIds.map((artifactId) => ({ artifactId, documentId: req.params.id, versionId }))
    : requestedFormats.map((format) => ({ documentId: req.params.id, versionId, format }));
  const account = await accountFor(req.user, ownership.tenantId, req.body?.accountId);
  const created = await mailSend.createSendOperation({
    userId: req.user,
    account,
    payload: {
      ...req.body,
      dossierId: ownership.dossierId,
      documentId: req.params.id,
      documentVersionId: versionId,
      idempotencyKey: req.get('Idempotency-Key') || req.body?.idempotencyKey,
      attachments,
    },
  });
  let operation = created.operation;
  if (!created.reused || ['queued', 'failed', 'provider_accepted'].includes(operation.status)) {
    const claimed = await mailSend.claimNextOperation({ operationId: operation._id });
    if (claimed) operation = await mailSend.runClaimedOperation(claimed);
  }
  audit.create(req, 'documentEmail', operation._id, {
    documentId: req.params.id,
    documentVersionId: versionId,
    dossierId: ownership.dossierId,
    provider: operation.provider,
    status: operation.status,
    formats: requestedFormats.length ? requestedFormats : (operation.attachments || []).map((item) => item.format),
    artifactIds: (operation.attachments || []).map((item) => item.artifactId).filter(Boolean),
    idempotentReplay: created.reused,
  });
  return res.status(created.reused ? 200 : 201).json({
    operation: mailSend.publicOperation(operation),
    reused: created.reused,
  });
}));

module.exports = router;
module.exports._private = { accountFor };
