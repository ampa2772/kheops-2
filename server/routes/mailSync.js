const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middlewares/middleware-auth');
const OAuthMailAccount = require('../models/Mail/OAuthMailAccount');
const MailSyncState = require('../models/Mail/MailSyncState');
const MailSyncJob = require('../models/Mail/MailSyncJob');
const MailSubscription = require('../models/Mail/MailSubscription');
const ArchivedMailMessage = require('../models/Mail/ArchivedMailMessage');
const MailMatterLink = require('../models/Mail/MailMatterLink');
const MailSendOperation = require('../models/Mail/MailSendOperation');
const User = require('../models/App_Users/User');
const { resolveTenantId } = require('../services/tenantService');
const {
  listAccounts,
  publicAccount,
  findOwnedAccount,
  setDefaultAccount,
  markError,
} = require('../services/mail/oauthAccountService');
const { createMailProvider } = require('../services/mail/providerFactory');
const mailSync = require('../services/mail/mailSyncService');
const mailSubscriptions = require('../services/mail/mailSubscriptionService');
const mailSend = require('../services/mail/mailSendService');
const { ensureDossierOwnership, ensureContactOwnership } = require('../utils/ownershipHelpers');
const audit = require('../utils/auditLogger');
const mailComposition = require('../services/mail/mailCompositionService');
const { ensureCabinetRole, ROLES } = require('../services/cabinetRoles');
const mailAttachments = require('../services/mail/mailAttachmentService');

const router = express.Router();

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function validObjectId(value, name = 'identifiant') {
  if (!mongoose.Types.ObjectId.isValid(String(value || ''))) {
    const error = new Error(`${name} invalide.`);
    error.status = 400;
    error.code = 'INVALID_ID';
    throw error;
  }
  return value;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ownedAccountOrDefault(req, accountId, { withSecret = false } = {}) {
  if (accountId) return findOwnedAccount({ userId: req.user, accountId, withSecret });
  await listAccounts({ userId: req.user });
  const tenantId = await resolveTenantId(req.user);
  let query = OAuthMailAccount.findOne({
    tenantId,
    ownerUserId: req.user,
    status: { $nin: ['disabled', 'disconnected'] },
  }).sort({ isDefault: -1, createdAt: 1 });
  if (withSecret) query = query.select('+encryptedRefreshToken +legacyTokenField');
  const account = await query;
  if (!account) throw Object.assign(new Error('Aucun compte expéditeur connecté.'), { status: 409, code: 'MAIL_ACCOUNT_REQUIRED' });
  return account;
}

async function assertScopedRelations(req, res, body = {}) {
  if (body.dossierId && !(await ensureDossierOwnership(req, res, body.dossierId))) return false;
  for (const contactId of [...new Set((body.contactIds || []).filter(Boolean).map(String))]) {
    if (!(await ensureContactOwnership(req, res, contactId))) return false;
  }
  return true;
}

router.get('/accounts', auth, asyncRoute(async (req, res) => {
  const accounts = await listAccounts({ userId: req.user, includeDisabled: req.query.includeDisabled === 'true' });
  res.json({ accounts });
}));

router.put('/accounts/:id/default', auth, asyncRoute(async (req, res) => {
  const account = await setDefaultAccount({ userId: req.user, accountId: validObjectId(req.params.id, 'accountId') });
  audit.update(req, 'mailAccount', account.id, { action: 'SET_DEFAULT', provider: account.provider });
  res.json({ account });
}));

router.post('/accounts/:id/test', auth, asyncRoute(async (req, res) => {
  const account = await findOwnedAccount({
    userId: req.user,
    accountId: validObjectId(req.params.id, 'accountId'),
    withSecret: true,
  });
  try {
    const provider = await createMailProvider(account);
    const diagnostic = await provider.test();
    account.status = 'active';
    account.lastTestAt = new Date();
    account.recentErrorCount = 0;
    account.lastError = { code: null, message: null, at: null };
    await account.save();
    audit.update(req, 'mailAccount', account._id, { action: 'TEST', provider: account.provider, result: 'success' });
    res.json({ ok: true, account: publicAccount(account), diagnostic });
  } catch (error) {
    await markError(account, error);
    audit.failure(req, 'UPDATE', 'mailAccount', account._id, error?.code || 'MAIL_TEST_FAILED', { action: 'TEST', provider: account.provider });
    throw error;
  }
}));

router.post('/accounts/:id/sync', auth, asyncRoute(async (req, res) => {
  const account = await findOwnedAccount({
    userId: req.user,
    accountId: validObjectId(req.params.id, 'accountId'),
  });
  const enqueued = await mailSync.enqueueSync({
    account,
    trigger: req.body?.forceFull ? 'initial' : 'manual',
    forceFull: req.body?.forceFull === true,
    idempotencyKey: req.get('Idempotency-Key') || req.body?.idempotencyKey,
  });
  audit.update(req, 'mailAccount', account._id, {
    action: 'SYNC_ENQUEUE',
    forceFull: req.body?.forceFull === true,
    jobId: String(enqueued.job?._id),
    reused: enqueued.reused,
  });
  res.status(enqueued.reused ? 200 : 202).json({ job: enqueued.job, reused: enqueued.reused });
}));

router.post('/accounts/:id/subscription', auth, asyncRoute(async (req, res) => {
  const account = await findOwnedAccount({
    userId: req.user,
    accountId: validObjectId(req.params.id, 'accountId'),
    withSecret: true,
  });
  const subscription = await mailSubscriptions.createOrReplaceSubscription(account);
  audit.update(req, 'mailAccount', account._id, { action: 'SUBSCRIPTION_RENEW', provider: account.provider });
  res.json({ subscription: mailSubscriptions.publicSubscription(subscription) });
}));

router.get('/accounts/:id/health', auth, asyncRoute(async (req, res) => {
  const account = await findOwnedAccount({ userId: req.user, accountId: validObjectId(req.params.id, 'accountId') });
  const [states, subscriptions, jobs] = await Promise.all([
    MailSyncState.find({ tenantId: account.tenantId, accountId: account._id }).select('-cursor -continuation -leaseOwner').lean(),
    MailSubscription.find({ tenantId: account.tenantId, accountId: account._id }).select('-clientStateHash').lean(),
    MailSyncJob.find({ tenantId: account.tenantId, accountId: account._id }).sort({ createdAt: -1 }).limit(10).select('-leaseOwner').lean(),
  ]);
  const diagnostics = [];
  if (account.status === 'reauth_required') diagnostics.push('Reconnectez ce compte : son autorisation a expiré ou a été révoquée.');
  if (!subscriptions.some((item) => item.status === 'active')) diagnostics.push('Aucune notification active : la synchronisation de rattrapage reste disponible.');
  if (!account.lastSuccessfulSyncAt) diagnostics.push('La première synchronisation n’est pas encore terminée.');
  res.json({
    account: publicAccount(account),
    states,
    subscriptions: subscriptions.map(mailSubscriptions.publicSubscription),
    jobs,
    diagnostics,
    reconnectUrl: account.provider === 'google' ? '/api/auth/google' : '/api/auth/microsoft',
  });
}));

router.delete('/accounts/:id', auth, asyncRoute(async (req, res) => {
  const account = await findOwnedAccount({
    userId: req.user,
    accountId: validObjectId(req.params.id, 'accountId'),
    withSecret: true,
  });
  if (account.legacyTokenField) {
    await User.updateOne({ _id: req.user }, { $set: { [account.legacyTokenField]: null } });
  }
  account.encryptedRefreshToken = null;
  account.status = 'disconnected';
  account.isDefault = false;
  account.updatedBy = req.user;
  await account.save();
  await MailSubscription.updateMany(
    { tenantId: account.tenantId, accountId: account._id },
    { $set: { status: 'disabled' } },
  );
  const replacement = await OAuthMailAccount.findOne({
    tenantId: account.tenantId,
    ownerUserId: req.user,
    status: { $nin: ['disabled', 'disconnected'] },
  }).sort({ createdAt: 1 });
  if (replacement) {
    replacement.isDefault = true;
    replacement.updatedBy = req.user;
    await replacement.save();
  }
  audit.update(req, 'mailAccount', account._id, { action: 'DISCONNECT', provider: account.provider });
  res.json({ ok: true });
}));

router.get('/signatures', auth, asyncRoute(async (req, res) => {
  const tenantId = await resolveTenantId(req.user);
  const signatures = await mailComposition.listSignatures({
    tenantId,
    userId: req.user,
    includeInactive: req.query.includeInactive === 'true',
  });
  res.json({ signatures });
}));

router.post('/signatures', auth, asyncRoute(async (req, res) => {
  const tenantId = await resolveTenantId(req.user);
  const shared = req.body?.scope === 'cabinet';
  if (shared && !(await ensureCabinetRole(req, res, [ROLES.OWNER, ROLES.ADMIN], 'Seul un administrateur peut modifier une signature partagée.'))) return undefined;
  if (req.body?.accountId) await findOwnedAccount({ userId: req.user, accountId: req.body.accountId });
  const signature = await mailComposition.createSignatureVersion({
    tenantId,
    userId: req.user,
    payload: req.body || {},
    shared,
  });
  audit.create(req, 'mailSignatureVersion', signature._id, {
    signatureKey: signature.signatureKey,
    version: signature.version,
    scope: shared ? 'cabinet' : 'personal',
    accountId: signature.accountId || null,
  });
  res.status(201).json({ signature: mailComposition.toClient(signature) });
}));

router.get('/templates', auth, asyncRoute(async (req, res) => {
  const tenantId = await resolveTenantId(req.user);
  const templates = await mailComposition.listTemplates({
    tenantId,
    userId: req.user,
    includeInactive: req.query.includeInactive === 'true',
  });
  res.json({ templates });
}));

router.post('/templates', auth, asyncRoute(async (req, res) => {
  const tenantId = await resolveTenantId(req.user);
  const shared = req.body?.scope === 'cabinet';
  if (shared && !(await ensureCabinetRole(req, res, [ROLES.OWNER, ROLES.ADMIN], 'Seul un administrateur peut modifier un modèle partagé.'))) return undefined;
  const template = await mailComposition.createTemplateVersion({
    tenantId,
    userId: req.user,
    payload: req.body || {},
    shared,
  });
  audit.create(req, 'mailTemplateVersion', template._id, {
    templateKey: template.templateKey,
    version: template.version,
    scope: shared ? 'cabinet' : 'personal',
  });
  res.status(201).json({ template: mailComposition.toClient(template) });
}));

router.get('/sync-jobs/:id', auth, asyncRoute(async (req, res) => {
  const tenantId = await resolveTenantId(req.user);
  const job = await MailSyncJob.findOne({
    _id: validObjectId(req.params.id, 'jobId'),
    tenantId,
  }).populate({ path: 'accountId', match: { ownerUserId: req.user }, select: '_id' });
  if (!job || !job.accountId) return res.status(404).json({ error: 'MAIL_SYNC_JOB_NOT_FOUND' });
  return res.json({ job });
}));

router.get('/messages', auth, asyncRoute(async (req, res) => {
  const tenantId = await resolveTenantId(req.user);
  const accountIds = (await OAuthMailAccount.find({ tenantId, ownerUserId: req.user }).select('_id').lean()).map((row) => row._id);
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 30)));
  const query = {
    tenantId,
    accountId: req.query.accountId
      ? validObjectId(req.query.accountId, 'accountId')
      : { $in: accountIds },
    isDeleted: req.query.includeDeleted === 'true' ? { $in: [true, false] } : false,
  };
  if (req.query.accountId && !accountIds.some((id) => String(id) === String(req.query.accountId))) {
    return res.status(404).json({ error: 'MAIL_ACCOUNT_NOT_FOUND' });
  }
  if (req.query.folder) query.folderKey = String(req.query.folder).slice(0, 500);
  if (req.query.read === 'true' || req.query.read === 'false') query.isRead = req.query.read === 'true';
  if (req.query.threadId) query.providerThreadId = String(req.query.threadId).slice(0, 2000);
  if (req.query.q) {
    const pattern = new RegExp(escapeRegExp(String(req.query.q).slice(0, 160)), 'i');
    query.$or = [{ subject: pattern }, { from: pattern }, { to: pattern }, { cc: pattern }];
  }
  if (req.query.dossierId) {
    if (!(await ensureDossierOwnership(req, res, req.query.dossierId))) return undefined;
    const links = await MailMatterLink.find({ tenantId, dossierId: req.query.dossierId }).select('messageId').lean();
    query._id = { $in: links.map((link) => link.messageId) };
  }
  const [messages, total] = await Promise.all([
    ArchivedMailMessage.find(query)
      .sort({ receivedAt: -1, sentAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-bodyHtml -bodyText')
      .lean(),
    ArchivedMailMessage.countDocuments(query),
  ]);
  res.json({ messages, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
}));

router.get('/messages/:id', auth, asyncRoute(async (req, res) => {
  const tenantId = await resolveTenantId(req.user);
  const accountIds = (await OAuthMailAccount.find({ tenantId, ownerUserId: req.user }).select('_id').lean()).map((row) => row._id);
  const message = await ArchivedMailMessage.findOne({
    _id: validObjectId(req.params.id, 'messageId'),
    tenantId,
    accountId: { $in: accountIds },
  }).lean();
  if (!message) return res.status(404).json({ error: 'MAIL_MESSAGE_NOT_FOUND' });
  const links = await MailMatterLink.find({ tenantId, messageId: message._id }).lean();
  return res.json({ message, links });
}));

router.get('/messages/:id/attachments/:index', auth, asyncRoute(async (req, res) => {
  const tenantId = await resolveTenantId(req.user);
  const file = await mailAttachments.loadAttachment({
    tenantId,
    ownerUserId: req.user,
    messageId: validObjectId(req.params.id, 'messageId'),
    index: req.params.index,
  });
  const ascii = file.filename.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(file.filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  res.setHeader('Content-Type', file.mime);
  res.setHeader('Content-Length', file.buffer.length);
  res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(file.buffer);
}));

router.post('/messages/send', auth, asyncRoute(async (req, res) => {
  if (!(await assertScopedRelations(req, res, req.body || {}))) return undefined;
  const account = await ownedAccountOrDefault(req, req.body?.accountId);
  const payload = {
    ...req.body,
    idempotencyKey: req.get('Idempotency-Key') || req.body?.idempotencyKey,
  };
  const created = await mailSend.createSendOperation({ userId: req.user, account, payload });
  let operation = created.operation;
  if (!created.reused || ['queued', 'failed', 'provider_accepted'].includes(operation.status)) {
    const claimed = await mailSend.claimNextOperation({ operationId: operation._id });
    if (claimed) operation = await mailSend.runClaimedOperation(claimed);
  }
  audit.create(req, 'mailSendOperation', operation._id, {
    action: created.reused ? 'IDEMPOTENT_REPLAY' : 'SEND',
    provider: operation.provider,
    status: operation.status,
    dossierId: operation.dossierId || null,
    documentId: operation.documentId || null,
    documentVersionId: operation.documentVersionId || null,
    recipientCount: (operation.to || []).length + (operation.cc || []).length + (operation.bcc || []).length,
  });
  res.status(created.reused ? 200 : 201).json({ operation: mailSend.publicOperation(operation), reused: created.reused });
}));

router.get('/send-operations/:id', auth, asyncRoute(async (req, res) => {
  const tenantId = await resolveTenantId(req.user);
  const operation = await MailSendOperation.findOne({
    _id: validObjectId(req.params.id, 'operationId'),
    tenantId,
    ownerUserId: req.user,
  });
  if (!operation) return res.status(404).json({ error: 'MAIL_SEND_OPERATION_NOT_FOUND' });
  return res.json({ operation: mailSend.publicOperation(operation) });
}));

router.post('/messages/:id/link-to-matter', auth, asyncRoute(async (req, res) => {
  if (!(await assertScopedRelations(req, res, req.body || {}))) return undefined;
  if (!req.body?.dossierId) return res.status(400).json({ error: 'DOSSIER_REQUIRED' });
  const tenantId = await resolveTenantId(req.user);
  const accountIds = (await OAuthMailAccount.find({ tenantId, ownerUserId: req.user }).select('_id').lean()).map((row) => row._id);
  const message = await ArchivedMailMessage.findOne({
    _id: validObjectId(req.params.id, 'messageId'),
    tenantId,
    accountId: { $in: accountIds },
  }).select('_id');
  if (!message) return res.status(404).json({ error: 'MAIL_MESSAGE_NOT_FOUND' });
  const link = await mailSend.linkMessageToMatter({
    tenantId,
    userId: req.user,
    messageId: message._id,
    dossierId: req.body.dossierId,
    contactIds: req.body.contactIds || [],
    classification: req.body.classification || 'manual',
  });
  audit.create(req, 'mailMatterLink', link._id, { messageId: message._id, dossierId: req.body.dossierId });
  return res.status(201).json({ link });
}));

// Microsoft appelle d'abord ce chemin avec validationToken. Cette réponse
// text/plain est volontairement sans authentification applicative.
router.post('/webhooks/microsoft', asyncRoute(async (req, res) => {
  if (req.query.validationToken) {
    res.type('text/plain').status(200).send(String(req.query.validationToken));
    return;
  }
  const result = await mailSubscriptions.processMicrosoftNotifications(req.body || {});
  res.status(202).json(result);
}));

router.post('/webhooks/google', asyncRoute(async (req, res) => {
  await mailSubscriptions.verifyGoogleNotificationRequest(req);
  const result = await mailSubscriptions.processGoogleNotification(req.body || {});
  res.status(202).json(result);
}));

module.exports = router;
module.exports._private = {
  escapeRegExp,
  validObjectId,
  ownedAccountOrDefault,
  assertScopedRelations,
};
