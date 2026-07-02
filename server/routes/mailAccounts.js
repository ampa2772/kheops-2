const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const auth = require('../middlewares/middleware-auth');
// requireTenant (chaîné après auth) pose req.tenantId = vrai cabinet (AUTH-002).
// Sans lui, resolveTenantId retombait sur req.user (userId). Voir migration
// scripts/backfill-tenant-id.js — à déployer dans le MÊME déploiement.
const requireTenant = require('../middlewares/requireTenant');
const MailAccount = require('../models/Mail/MailAccount');
const StoredDocument = require('../models/Storage/StoredDocument');
const { ensureDossierOwnership } = require('../utils/ownershipHelpers');
const { decrypt, encrypt } = require('../services/mail/credentialCrypto');
const { listPresets } = require('../services/mail/presets');
const imapClient = require('../services/mail/imapClient');
const smtpClient = require('../services/mail/smtpClient');
const { classifyMailError } = require('../services/mail/mailErrors');
const {
  getStorageProvider,
  resolveTenantId,
  toTenantObjectId,
  assertUploadCompleted,
} = require('../services/storage');
const {
  QuotaExceededError,
  reserveQuota,
  releaseQuota,
  getUsage,
} = require('../services/storage/quota');
// A16 : politique commune de PJ (taille + types dangereux).
const { assertAttachmentAllowed, assertAttachmentSize } = require('../services/attachmentPolicy');

const router = express.Router();

const accountWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const mailActionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

function objectId(value, fieldName) {
  if (!value || !mongoose.Types.ObjectId.isValid(String(value))) {
    const err = new Error(`${fieldName} invalide.`);
    err.statusCode = 400;
    err.code = 'INVALID_OBJECT_ID';
    throw err;
  }
  return new mongoose.Types.ObjectId(String(value));
}

function normalizeSecurity(value, fallback = 'ssl_tls') {
  const raw = String(value || fallback).toLowerCase().replace(/[\s-]+/g, '_');
  const aliases = {
    ssl: 'ssl_tls',
    tls: 'ssl_tls',
    ssl_tls: 'ssl_tls',
    'ssl/tls': 'ssl_tls',
    starttls: 'starttls',
    start_tls: 'starttls',
    none: 'none',
    aucun: 'none',
    aucune: 'none',
    plain: 'none',
  };
  const security = aliases[raw] || raw;
  if (!MailAccount.SECURITY_MODES.includes(security)) {
    const err = new Error(`Mode de securite invalide: ${value}`);
    err.statusCode = 400;
    err.code = 'INVALID_SECURITY_MODE';
    throw err;
  }
  return security;
}

function normalizeEndpoint(input, fieldName) {
  if (!input || typeof input !== 'object') {
    const err = new Error(`${fieldName} requis.`);
    err.statusCode = 400;
    err.code = 'MAIL_ENDPOINT_REQUIRED';
    throw err;
  }
  const host = String(input.host || '').trim();
  const port = Number(input.port);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    const err = new Error(`${fieldName}.host et ${fieldName}.port sont requis.`);
    err.statusCode = 400;
    err.code = 'MAIL_ENDPOINT_INVALID';
    throw err;
  }
  return {
    host,
    port,
    security: normalizeSecurity(input.security),
  };
}

function normalizeAccountPayload(body) {
  const email = String(body.email || '').trim().toLowerCase();
  const username = String(body.username || email).trim();
  const password = body.password;
  if (!email || !email.includes('@')) {
    const err = new Error('Adresse e-mail invalide.');
    err.statusCode = 400;
    err.code = 'INVALID_EMAIL';
    throw err;
  }
  if (!username) {
    const err = new Error('Identifiant IMAP/SMTP requis.');
    err.statusCode = 400;
    err.code = 'USERNAME_REQUIRED';
    throw err;
  }
  if (typeof password !== 'string' || password.length === 0) {
    const err = new Error('Mot de passe IMAP/SMTP requis.');
    err.statusCode = 400;
    err.code = 'PASSWORD_REQUIRED';
    throw err;
  }
  return {
    type: 'imap',
    email,
    displayName: String(body.displayName || '').trim(),
    imap: normalizeEndpoint(body.imap, 'imap'),
    smtp: normalizeEndpoint(body.smtp, 'smtp'),
    username,
    password,
    force: body.force === true,
  };
}

function securityWarnings(account) {
  const warnings = [];
  if (account.imap.security === 'none') warnings.push('IMAP sans TLS configure.');
  if (account.smtp.security === 'none') warnings.push('SMTP sans TLS configure.');
  return warnings;
}

function sanitizeAccount(account) {
  const plain = account.toObject ? account.toObject() : { ...account };
  delete plain.encryptedPassword;
  return {
    id: String(plain._id),
    tenantId: plain.tenantId ? String(plain.tenantId) : null,
    ownerUserId: plain.ownerUserId ? String(plain.ownerUserId) : null,
    type: plain.type,
    email: plain.email,
    displayName: plain.displayName,
    imap: plain.imap,
    smtp: plain.smtp,
    username: plain.username,
    status: plain.status,
    lastError: plain.lastError,
    lastTestedAt: plain.lastTestedAt,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    warnings: securityWarnings(plain),
  };
}

function sanitizeDocument(doc) {
  const plain = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(plain._id),
    tenantId: plain.tenantId ? String(plain.tenantId) : null,
    dossierId: plain.dossierId ? String(plain.dossierId) : null,
    documentId: plain.documentId ? String(plain.documentId) : null,
    currentVersionId: plain.currentVersionId || null,
    versions: (plain.versions || []).map((version) => ({
      versionId: version.versionId,
      size: version.size,
      mime: version.mime,
      filename: version.filename,
      createdAt: version.createdAt,
      createdBy: version.createdBy ? String(version.createdBy) : null,
    })),
  };
}

async function findAccount(req, accountId, { withPassword = false } = {}) {
  const tenantId = resolveTenantId(req);
  const ownerUserId = toTenantObjectId(req.user);
  const id = objectId(accountId, 'accountId');
  let query = MailAccount.findOne({ _id: id, tenantId, ownerUserId });
  if (withPassword) query = query.select('+encryptedPassword');
  const account = await query;
  if (!account) {
    const err = new Error('Compte mail introuvable.');
    err.statusCode = 404;
    err.code = 'MAIL_ACCOUNT_NOT_FOUND';
    throw err;
  }
  return account;
}

function accountPassword(account) {
  return decrypt(account.encryptedPassword);
}

function handleMailError(res, err) {
  if (err instanceof QuotaExceededError || err.statusCode === 413) {
    return res.status(413).json({
      error: err.code || 'QUOTA_EXCEEDED',
      message: err.message,
      usedBytes: err.usedBytes,
      quotaBytes: err.quotaBytes,
      addBytes: err.addBytes,
    });
  }

  // A18 : classer les erreurs réseau/IMAP en codes clairs et stables pour le
  // front (IMAP_CONNECTION_FAILED / IMAP_TIMEOUT / IMAP_AUTH_FAILED), plutôt
  // qu'un 500 avec un message technique brut.
  const { statusCode, code, message } = classifyMailError(err);
  return res.status(statusCode).json({ error: code, message });
}

router.get('/presets', auth, requireTenant, (req, res) => {
  res.json({ presets: listPresets() });
});

router.post('/accounts', auth, requireTenant, accountWriteLimiter, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const ownerUserId = toTenantObjectId(req.user);
    const payload = normalizeAccountPayload(req.body);

    const candidate = {
      _id: new mongoose.Types.ObjectId(),
      tenantId,
      ownerUserId,
      type: 'imap',
      email: payload.email,
      displayName: payload.displayName,
      imap: payload.imap,
      smtp: payload.smtp,
      username: payload.username,
    };

    const warnings = securityWarnings(candidate);
    let status = 'active';
    let lastError = null;

    if (!payload.force) {
      try {
        await imapClient.testImap(candidate, payload.password);
        await smtpClient.testSmtp(candidate, payload.password);
      } catch (testErr) {
        return res.status(400).json({
          error: 'MAIL_TEST_FAILED',
          message: testErr.message,
          warnings,
        });
      }
    } else {
      status = 'untested';
      if (warnings.length > 0) lastError = warnings.join(' ');
    }

    const account = new MailAccount({
      ...candidate,
      encryptedPassword: encrypt(payload.password),
      status,
      lastError,
      lastTestedAt: payload.force ? null : new Date(),
    });

    await account.save();
    return res.status(201).json({ account: sanitizeAccount(account), warnings });
  } catch (err) {
    if (err?.code === 11000) {
      err.statusCode = 409;
      err.code = 'MAIL_ACCOUNT_EXISTS';
      err.message = 'Un compte mail existe deja pour cette adresse.';
    }
    return handleMailError(res, err);
  }
});

router.get('/accounts', auth, requireTenant, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const ownerUserId = toTenantObjectId(req.user);
    const accounts = await MailAccount.find({ tenantId, ownerUserId }).sort({ createdAt: -1 });
    return res.json({ accounts: accounts.map(sanitizeAccount) });
  } catch (err) {
    return handleMailError(res, err);
  }
});

router.delete('/accounts/:id', auth, requireTenant, accountWriteLimiter, async (req, res) => {
  try {
    const account = await findAccount(req, req.params.id);
    await account.deleteOne();
    return res.json({ ok: true });
  } catch (err) {
    return handleMailError(res, err);
  }
});

router.post('/accounts/:id/test-imap', auth, requireTenant, mailActionLimiter, async (req, res) => {
  let account = null;
  try {
    account = await findAccount(req, req.params.id, { withPassword: true });
    await imapClient.testImap(account, accountPassword(account));
    account.status = 'active';
    account.lastError = null;
    account.lastTestedAt = new Date();
    await account.save();
    return res.json({ ok: true, account: sanitizeAccount(account) });
  } catch (err) {
    if (account) {
      try {
        account.status = 'error';
        account.lastError = err.message;
        account.lastTestedAt = new Date();
        await account.save();
      } catch (saveErr) {
        console.warn('[mail/test-imap] failed to persist error status:', saveErr.message);
      }
    }
    return handleMailError(res, err);
  }
});

router.post('/accounts/:id/test-smtp', auth, requireTenant, mailActionLimiter, async (req, res) => {
  let account = null;
  try {
    account = await findAccount(req, req.params.id, { withPassword: true });
    await smtpClient.testSmtp(account, accountPassword(account));
    account.status = 'active';
    account.lastError = null;
    account.lastTestedAt = new Date();
    await account.save();
    return res.json({ ok: true, account: sanitizeAccount(account) });
  } catch (err) {
    if (account) {
      try {
        account.status = 'error';
        account.lastError = err.message;
        account.lastTestedAt = new Date();
        await account.save();
      } catch (saveErr) {
        console.warn('[mail/test-smtp] failed to persist error status:', saveErr.message);
      }
    }
    return handleMailError(res, err);
  }
});

router.get('/accounts/:id/folders', auth, requireTenant, mailActionLimiter, async (req, res) => {
  try {
    const account = await findAccount(req, req.params.id, { withPassword: true });
    const folders = await imapClient.listFolders(account, accountPassword(account));
    return res.json({ folders });
  } catch (err) {
    return handleMailError(res, err);
  }
});

router.get('/accounts/:id/messages', auth, requireTenant, mailActionLimiter, async (req, res) => {
  try {
    const account = await findAccount(req, req.params.id, { withPassword: true });
    const result = await imapClient.fetchMessages(account, accountPassword(account), {
      folder: req.query.folder || 'INBOX',
      page: req.query.page,
      pageSize: req.query.pageSize,
      since: req.query.since,
    });
    return res.json(result);
  } catch (err) {
    return handleMailError(res, err);
  }
});

router.get('/messages/:id', auth, requireTenant, mailActionLimiter, async (req, res) => {
  try {
    const messageRef = imapClient.decodeMessageId(req.params.id);
    const account = await findAccount(req, messageRef.accountId, { withPassword: true });
    const message = await imapClient.getMessage(account, accountPassword(account), messageRef);
    return res.json({ message });
  } catch (err) {
    return handleMailError(res, err);
  }
});

router.get('/messages/:id/attachments/:index', auth, requireTenant, mailActionLimiter, async (req, res) => {
  try {
    const messageRef = imapClient.decodeMessageId(req.params.id);
    const account = await findAccount(req, messageRef.accountId, { withPassword: true });
    const message = await imapClient.getMessage(account, accountPassword(account), {
      ...messageRef,
      includeAttachmentContent: true,
    });
    const attachmentIndex = Number(req.params.index);
    const attachment = message.attachments[attachmentIndex];
    if (!attachment || !attachment.contentBase64) {
      return res.status(404).json({ error: 'ATTACHMENT_NOT_FOUND', message: 'Piece jointe introuvable.' });
    }

    const filename = String(attachment.filename || `attachment-${attachmentIndex + 1}`).replace(/[\r\n"]/g, '_');
    const buffer = Buffer.from(attachment.contentBase64, 'base64');
    res.setHeader('Content-Type', attachment.mime || 'application/octet-stream');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return res.send(buffer);
  } catch (err) {
    return handleMailError(res, err);
  }
});

router.post('/send', auth, requireTenant, mailActionLimiter, async (req, res) => {
  try {
    const account = await findAccount(req, req.body.accountId, { withPassword: true });
    const to = req.body.to;
    if (!to || (Array.isArray(to) && to.length === 0)) {
      return res.status(400).json({ error: 'RECIPIENT_REQUIRED', message: 'Destinataire requis.' });
    }
    if (!req.body.text && !req.body.html) {
      return res.status(400).json({ error: 'BODY_REQUIRED', message: 'Corps du message requis.' });
    }

    const result = await smtpClient.sendMail(account, accountPassword(account), {
      to,
      cc: req.body.cc,
      bcc: req.body.bcc,
      subject: req.body.subject || '',
      text: req.body.text,
      html: req.body.html,
      attachments: req.body.attachments || [],
    });
    return res.json({ ok: true, result });
  } catch (err) {
    return handleMailError(res, err);
  }
});

router.post('/messages/:id/attach-to-matter', auth, requireTenant, mailActionLimiter, async (req, res) => {
  let uploadedVersion = null;
  let quotaReserved = 0;

  try {
    const tenantId = resolveTenantId(req);
    const ownerUserId = toTenantObjectId(req.user);
    const dossierId = objectId(req.body.dossierId || req.body.matterId, 'dossierId');
    const own = await ensureDossierOwnership(req, res, dossierId);
    if (!own) return undefined;

    const messageRef = imapClient.decodeMessageId(req.params.id);
    const account = await findAccount(req, messageRef.accountId, { withPassword: true });
    const message = await imapClient.getMessage(account, accountPassword(account), {
      ...messageRef,
      includeAttachmentContent: true,
    });
    const attachmentIndex = Number(req.body.attachmentIndex || 0);
    if (!Number.isInteger(attachmentIndex) || attachmentIndex < 0) {
      return res.status(400).json({ error: 'INVALID_ATTACHMENT_INDEX', message: 'Index de pièce jointe invalide.' });
    }
    const attachment = message.attachments[attachmentIndex];
    if (!attachment || !attachment.contentBase64) {
      return res.status(404).json({ error: 'ATTACHMENT_NOT_FOUND', message: 'Piece jointe introuvable.' });
    }

    // A16 : refuser tôt (avant décodage) sur la taille annoncée + le type.
    assertAttachmentAllowed({ filename: attachment.filename, mime: attachment.mime, size: attachment.size });

    const buffer = Buffer.from(attachment.contentBase64, 'base64');
    // A16 : contrôle autoritatif sur la taille réelle décodée (la métadonnée
    // IMAP peut mentir/être absente).
    assertAttachmentSize(buffer.length);
    // A5 : réservation atomique du quota AVANT l'upload (rollback en cas d'échec).
    await reserveQuota(tenantId, buffer.length);
    quotaReserved = buffer.length;
    const provider = await getStorageProvider(tenantId);
    const documentId = new mongoose.Types.ObjectId();
    const versionId = provider.createVersionId();
    uploadedVersion = await provider.uploadVersion({
      tenantId,
      matterId: dossierId,
      documentId,
      versionId,
      filename: attachment.filename,
      buffer,
      mime: attachment.mime,
      // A3 : provider OneDrive par utilisateur → écrit dans le OneDrive de
      // l'utilisateur courant. Ignoré par managed_gcs.
      ownerUserId: req.user,
    });

    // A4 : confirmer l'arrivée du fichier chez le cloud par utilisateur avant de
    // committer (absence avérée → lève → rollback blob + quota via le catch).
    await assertUploadCompleted(provider, uploadedVersion.storageKey);

    const storedDocument = new StoredDocument({
      tenantId,
      dossierId,
      documentId,
      ownerUserId,
      currentVersionId: versionId,
      versions: [{
        versionId,
        storageKey: uploadedVersion.storageKey,
        size: uploadedVersion.size,
        mime: uploadedVersion.mime,
        filename: uploadedVersion.filename,
        createdAt: new Date(),
        createdBy: ownerUserId,
      }],
    });
    await storedDocument.save();
    const usage = await getUsage(tenantId); // quota déjà réservé en amont
    return res.status(201).json({ document: sanitizeDocument(storedDocument), usage });
  } catch (err) {
    // A5 : rollback atomique — blob puis réservation de quota.
    if (uploadedVersion?.storageKey) {
      try {
        const tenantId = resolveTenantId(req);
        const provider = await getStorageProvider(tenantId);
        await provider.deleteVersion({ storageKey: uploadedVersion.storageKey });
      } catch (cleanupErr) {
        console.warn('[mail/attach-to-matter] cleanup blob failed:', cleanupErr.message);
      }
    }
    if (quotaReserved > 0) {
      try {
        await releaseQuota(resolveTenantId(req), quotaReserved);
      } catch (releaseErr) {
        console.warn('[mail/attach-to-matter] release quota failed:', releaseErr.message);
      }
    }
    return handleMailError(res, err);
  }
});

module.exports = router;
module.exports._private = {
  normalizeAccountPayload,
  normalizeEndpoint,
  sanitizeAccount,
  securityWarnings,
};
