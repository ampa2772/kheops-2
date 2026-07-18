const os = require('os');
const crypto = require('crypto');
const sanitizeFilename = require('sanitize-filename');
const OAuthMailAccount = require('../../models/Mail/OAuthMailAccount');
const MailSendOperation = require('../../models/Mail/MailSendOperation');
const ArchivedMailMessage = require('../../models/Mail/ArchivedMailMessage');
const MailMatterLink = require('../../models/Mail/MailMatterLink');
const DocumentHistory = require('../../models/Storage/DocumentHistory');
const { getFileStorage } = require('../fileStorage');
const { resolvePublicationArtifact } = require('../documentPublicationService');
const { createMailProvider } = require('./providerFactory');
const { archiveSyncedMessage } = require('./mailSyncService');
const {
  normalizeRecipients,
  stableMessageId,
  messageFingerprint,
  stripHtml,
  sanitizeArchivedHtml,
  retryDelayMs,
} = require('./messageNormalization');
const { assertAttachmentAllowed, maxAttachmentBytes } = require('../attachmentPolicy');

const DEFAULT_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 6;
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function workerId() {
  return String(process.env.MAIL_WORKER_ID || `${os.hostname()}-${process.pid}`).slice(0, 200);
}

function normalizedIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (!key || key.length > 240) {
    throw Object.assign(new Error("Une clé d'idempotence est requise pour envoyer."), {
      statusCode: 400,
      code: 'MAIL_IDEMPOTENCY_REQUIRED',
    });
  }
  return key;
}

function safeFilename(value, fallback = 'document') {
  return sanitizeFilename(String(value || fallback)).slice(0, 500) || fallback;
}

function validateRecipients(value, field, required = false) {
  const recipients = normalizeRecipients(value);
  if (required && recipients.length === 0) {
    throw Object.assign(new Error('Au moins un destinataire valide est requis.'), {
      statusCode: 400,
      code: 'MAIL_RECIPIENT_REQUIRED',
    });
  }
  if (recipients.length > 200) {
    throw Object.assign(new Error(`Trop de destinataires dans ${field}.`), {
      statusCode: 400,
      code: 'MAIL_TOO_MANY_RECIPIENTS',
    });
  }
  return recipients;
}

function publicOperation(operation) {
  const value = operation?.toObject ? operation.toObject() : { ...(operation || {}) };
  return {
    ...value,
    id: String(value._id || value.id),
    tenantId: value.tenantId ? String(value.tenantId) : null,
    ownerUserId: value.ownerUserId ? String(value.ownerUserId) : null,
    accountId: value.accountId ? String(value.accountId) : null,
    dossierId: value.dossierId ? String(value.dossierId) : null,
    attachments: (value.attachments || []).map((attachment) => {
      const publicAttachment = { ...attachment };
      delete publicAttachment.storageKey;
      return {
        ...publicAttachment,
        artifactId: attachment.artifactId ? String(attachment.artifactId) : null,
        documentId: attachment.documentId ? String(attachment.documentId) : null,
        versionId: attachment.versionId ? String(attachment.versionId) : null,
      };
    }),
  };
}

async function freezePublicationArtifact({ tenantId, dossierId, item, storage }) {
  const format = item?.format ? String(item.format).trim().toLowerCase() : null;
  if (format && !['docx', 'pdf'].includes(format)) {
    throw Object.assign(new Error('Format de publication invalide : docx ou pdf attendu.'), {
      statusCode: 400,
      code: 'MAIL_PUBLICATION_FORMAT_INVALID',
    });
  }
  if (!item?.artifactId && (!item?.documentId || !item?.versionId || !format)) {
    throw Object.assign(new Error('Document, version exacte et format sont requis pour sélectionner un artefact.'), {
      statusCode: 400,
      code: 'MAIL_PUBLICATION_SCOPE_REQUIRED',
    });
  }
  const artifact = await resolvePublicationArtifact({
    tenantId,
    dossierId,
    documentId: item?.documentId || null,
    versionId: item?.versionId || null,
    format,
    artifactId: item?.artifactId || null,
  });
  if (!artifact) {
    throw Object.assign(new Error('Artefact de publication introuvable. Préparez cette version au format demandé avant l’envoi.'), {
      statusCode: 409,
      code: 'MAIL_PUBLICATION_ARTIFACT_NOT_FOUND',
    });
  }
  const value = artifact.toObject ? artifact.toObject() : artifact;
  if (!value.storageKey || !(await storage.exists(value.storageKey))) {
    throw Object.assign(new Error('Le fichier de publication préparé est indisponible.'), {
      statusCode: 409,
      code: 'MAIL_PUBLICATION_ARTIFACT_BLOB_MISSING',
    });
  }
  const filename = safeFilename(value.filename || `${value.documentId}.${value.format}`);
  const mime = String(value.mime || 'application/octet-stream').slice(0, 255);
  const size = Number(value.size || 0);
  assertAttachmentAllowed({ filename, mime, size });
  return {
    artifactId: value._id,
    documentId: value.documentId,
    versionId: String(value.versionId),
    format: value.format,
    filename,
    mime,
    storageKey: value.storageKey,
    size,
    checksum: value.checksum,
  };
}

async function freezeDocumentAttachments({ tenantId, dossierId, requested = [] }) {
  const storage = getFileStorage();
  const frozen = [];
  const seen = new Set();
  for (const item of requested) {
    if (item?.artifactId || item?.format) {
      const attachment = await freezePublicationArtifact({ tenantId, dossierId, item, storage });
      const identity = attachment.artifactId
        ? `artifact:${attachment.artifactId}`
        : `${attachment.documentId}:${attachment.versionId}:${attachment.format}`;
      if (!seen.has(identity)) {
        seen.add(identity);
        frozen.push(attachment);
      }
      continue;
    }
    if (!item?.documentId || !item?.versionId) {
      throw Object.assign(new Error('Chaque pièce documentaire doit indiquer documentId et versionId.'), {
        statusCode: 400,
        code: 'MAIL_DOCUMENT_VERSION_REQUIRED',
      });
    }
    const history = await DocumentHistory.findOne({
      tenantId,
      dossierId,
      documentId: item.documentId,
    });
    if (!history) {
      throw Object.assign(new Error('Document introuvable dans ce dossier.'), {
        statusCode: 404,
        code: 'MAIL_DOCUMENT_NOT_FOUND',
      });
    }
    const version = history.versions.find((candidate) => String(candidate.versionId) === String(item.versionId));
    if (!version?.storageKey) {
      throw Object.assign(new Error('Version documentaire introuvable.'), {
        statusCode: 404,
        code: 'MAIL_DOCUMENT_VERSION_NOT_FOUND',
      });
    }
    const exists = await storage.exists(version.storageKey);
    if (!exists) {
      throw Object.assign(new Error('Le fichier de cette version est indisponible.'), {
        statusCode: 409,
        code: 'MAIL_DOCUMENT_BLOB_MISSING',
      });
    }
    const filename = safeFilename(item.filename || version.filename || `${item.documentId}.docx`);
    const mime = String(item.mime || version.mime || 'application/octet-stream').slice(0, 255);
    const size = Number(version.size || item.size || 0);
    assertAttachmentAllowed({ filename, mime, size });
    const attachment = {
      artifactId: null,
      documentId: item.documentId,
      versionId: String(version.versionId),
      format: 'docx',
      filename,
      mime,
      storageKey: version.storageKey,
      size,
      checksum: version.checksum || null,
    };
    const identity = `${attachment.documentId}:${attachment.versionId}:legacy-docx`;
    if (!seen.has(identity)) {
      seen.add(identity);
      frozen.push(attachment);
    }
  }
  const total = frozen.reduce((sum, item) => sum + Number(item.size || 0), 0);
  if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
    const error = new Error(`Les pièces jointes dépassent la limite totale de ${MAX_TOTAL_ATTACHMENT_BYTES} octets.`);
    error.statusCode = 413;
    error.code = 'MAIL_ATTACHMENTS_TOTAL_TOO_LARGE';
    throw error;
  }
  return frozen;
}

async function createSendOperation({ userId, account, payload = {} }) {
  const idempotencyKey = normalizedIdempotencyKey(payload.idempotencyKey);
  const existing = await MailSendOperation.findOne({
    tenantId: account.tenantId,
    ownerUserId: userId,
    idempotencyKey,
  });
  if (existing) return { operation: existing, reused: true };

  const to = validateRecipients(payload.to, 'to', true);
  const cc = validateRecipients(payload.cc, 'cc');
  const bcc = validateRecipients(payload.bcc, 'bcc');
  const dossierId = payload.dossierId || null;
  if ((payload.attachments || []).length && !dossierId) {
    throw Object.assign(new Error('Un dossier est requis pour joindre une version documentaire.'), {
      statusCode: 400,
      code: 'MAIL_ATTACHMENT_DOSSIER_REQUIRED',
    });
  }
  const attachments = await freezeDocumentAttachments({
    tenantId: account.tenantId,
    dossierId,
    requested: payload.attachments || [],
  });
  const operationPayload = {
    tenantId: account.tenantId,
    ownerUserId: userId,
    accountId: account._id,
    provider: account.provider,
    idempotencyKey,
    stableMessageId: stableMessageId({
      tenantId: account.tenantId,
      ownerUserId: userId,
      idempotencyKey,
    }),
    dossierId,
    contactIds: payload.contactIds || [],
    documentId: payload.documentId || attachments[0]?.documentId || null,
    documentVersionId: payload.documentVersionId || attachments[0]?.versionId || null,
    from: {
      name: String(account.displayName || '').slice(0, 300),
      email: account.sharedMailboxAddress || account.email,
    },
    to,
    cc,
    bcc,
    subject: String(payload.subject || '').slice(0, 4000),
    bodyText: String(payload.bodyText || stripHtml(payload.bodyHtml || '')).slice(0, 2000000),
    bodyHtml: sanitizeArchivedHtml(payload.bodyHtml || ''),
    attachments,
  };
  try {
    return { operation: await MailSendOperation.create(operationPayload), reused: false };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const raced = await MailSendOperation.findOne({
      tenantId: account.tenantId,
      ownerUserId: userId,
      idempotencyKey,
    });
    return { operation: raced, reused: true };
  }
}

async function claimNextOperation({ owner = workerId(), leaseMs = DEFAULT_LEASE_MS, operationId = null } = {}) {
  const now = new Date();
  return MailSendOperation.findOneAndUpdate(
    {
      ...(operationId ? { _id: operationId } : {}),
      status: { $in: ['queued', 'failed', 'provider_accepted'] },
      nextAttemptAt: { $lte: now },
      $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now } }],
    },
    {
      $set: {
        status: 'preparing',
        leaseOwner: owner,
        leaseUntil: new Date(now.getTime() + leaseMs),
      },
      $inc: { attemptCount: 1 },
    },
    { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } },
  );
}

async function loadAttachmentBuffers(operation) {
  const storage = getFileStorage();
  const rows = [];
  let total = 0;
  for (const attachment of operation.attachments || []) {
    const buffer = await storage.read(attachment.storageKey);
    const actualChecksum = crypto.createHash('sha256').update(buffer).digest('hex');
    if (attachment.checksum && actualChecksum !== attachment.checksum) {
      const error = new Error(`La pièce ${attachment.filename} ne correspond plus à la version figée.`);
      error.code = 'MAIL_ATTACHMENT_CHECKSUM_MISMATCH';
      error.retryable = false;
      throw error;
    }
    assertAttachmentAllowed({
      filename: attachment.filename,
      mime: attachment.mime,
      size: buffer.length,
    }, { maxBytes: maxAttachmentBytes() });
    total += buffer.length;
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
      const error = new Error('La taille totale des pièces jointes est trop élevée.');
      error.code = 'MAIL_ATTACHMENTS_TOTAL_TOO_LARGE';
      error.statusCode = 413;
      error.retryable = false;
      throw error;
    }
    rows.push({ filename: attachment.filename, mime: attachment.mime, buffer });
  }
  return rows;
}

async function archiveOutgoing(operation) {
  const now = operation.providerAcceptedAt || new Date();
  const message = {
    tenantId: operation.tenantId,
    accountId: operation.accountId,
    ownerUserId: operation.ownerUserId,
    provider: operation.provider,
    providerMessageId: operation.providerMessageId,
    internetMessageId: operation.stableMessageId,
    providerThreadId: operation.providerThreadId || null,
    folderKey: 'sent',
    labels: ['SENT'],
    from: operation.from?.email || '',
    to: (operation.to || []).map((item) => item.email),
    cc: (operation.cc || []).map((item) => item.email),
    bcc: (operation.bcc || []).map((item) => item.email),
    subject: operation.subject || '',
    bodyText: operation.bodyText || stripHtml(operation.bodyHtml || ''),
    bodyHtml: sanitizeArchivedHtml(operation.bodyHtml || ''),
    receivedAt: now,
    sentAt: now,
    providerUpdatedAt: now,
    isRead: true,
    isDeleted: false,
    attachments: (operation.attachments || []).map((item) => ({
      filename: item.filename,
      mime: item.mime,
      size: item.size,
      storageKey: item.storageKey,
      checksum: item.checksum,
      inline: false,
    })),
    sourceSendOperationId: operation._id,
    lastSyncedAt: new Date(),
  };
  message.deduplicationFingerprint = messageFingerprint(message);
  const { row } = await archiveSyncedMessage(message);
  if (operation.dossierId) {
    await MailMatterLink.findOneAndUpdate(
      {
        tenantId: operation.tenantId,
        messageId: row._id,
        dossierId: operation.dossierId,
      },
      {
        $set: {
          contactIds: operation.contactIds || [],
          documentId: operation.documentId || null,
          documentVersionId: operation.documentVersionId || null,
          direction: 'outgoing',
          classification: 'manual',
          linkedBy: operation.ownerUserId,
        },
      },
      { upsert: true, new: true, runValidators: true },
    );
  }
  return row;
}

function retryableSendError(error) {
  const status = Number(error?.statusCode || error?.response?.status || 0);
  if (error?.retryable === false) return false;
  return ![400, 401, 403, 404, 413, 415, 422].includes(status);
}

async function failOperation(operation, error, maxAttempts = DEFAULT_MAX_ATTEMPTS) {
  const retryable = retryableSendError(error) && Number(operation.attemptCount || 0) < maxAttempts;
  operation.status = retryable ? 'failed' : 'cancelled';
  operation.nextAttemptAt = retryable
    ? new Date(Date.now() + retryDelayMs(operation.attemptCount))
    : new Date();
  operation.leaseOwner = null;
  operation.leaseUntil = null;
  operation.lastError = {
    code: String(error?.code || error?.name || 'MAIL_SEND_FAILED').slice(0, 120),
    message: String(error?.message || 'Échec technique de l’envoi.').slice(0, 1000),
    retryable,
    at: new Date(),
  };
  await operation.save();
}

async function runClaimedOperation(operation, options = {}) {
  const account = await OAuthMailAccount.findOne({
    _id: operation.accountId,
    tenantId: operation.tenantId,
    ownerUserId: operation.ownerUserId,
    status: { $nin: ['disabled', 'disconnected'] },
  }).select('+encryptedRefreshToken +legacyTokenField');
  if (!account) {
    const error = Object.assign(new Error('Compte expéditeur indisponible.'), {
      code: 'MAIL_ACCOUNT_UNAVAILABLE',
      retryable: false,
    });
    await failOperation(operation, error, options.maxAttempts);
    throw error;
  }
  try {
    const provider = await createMailProvider(account);
    let providerResult = null;
    if (operation.providerMessageId) {
      providerResult = {
        providerMessageId: operation.providerMessageId,
        providerThreadId: operation.providerThreadId,
        providerStatus: 'accepted',
      };
    } else if (operation.attemptCount > 1 && provider.findSentOperation) {
      providerResult = await provider.findSentOperation(operation);
    }
    if (!providerResult) {
      const buffers = await loadAttachmentBuffers(operation);
      operation.status = 'sending';
      operation.leaseUntil = new Date(Date.now() + (options.leaseMs || DEFAULT_LEASE_MS));
      await operation.save();
      providerResult = await provider.send(operation, buffers);
    }
    operation.status = 'provider_accepted';
    operation.providerMessageId = providerResult.providerMessageId;
    operation.providerThreadId = providerResult.providerThreadId || null;
    operation.providerAcceptedAt = operation.providerAcceptedAt || new Date();
    operation.lastError = { code: null, message: null, retryable: false, at: null };
    await operation.save();

    const archived = await archiveOutgoing(operation);
    operation.archivedMessageId = archived._id;
    operation.status = 'reconciled';
    operation.reconciledAt = new Date();
    operation.leaseOwner = null;
    operation.leaseUntil = null;
    await operation.save();
    return operation;
  } catch (error) {
    await failOperation(operation, error, options.maxAttempts);
    throw error;
  }
}

async function runNextOperation(options = {}) {
  const operation = await claimNextOperation(options);
  if (!operation) return null;
  return runClaimedOperation(operation, options);
}

async function resetExpiredLeases(now = new Date()) {
  const result = await MailSendOperation.updateMany(
    {
      status: { $in: ['preparing', 'sending'] },
      leaseUntil: { $lt: now },
    },
    {
      $set: {
        status: 'failed',
        leaseOwner: null,
        leaseUntil: null,
        nextAttemptAt: now,
        lastError: {
          code: 'MAIL_SEND_LEASE_EXPIRED',
          message: 'Le worker précédent a été interrompu ; Kheops vérifiera les éléments envoyés avant toute reprise.',
          retryable: true,
          at: now,
        },
      },
    },
  );
  return result.modifiedCount || 0;
}

async function linkMessageToMatter({ tenantId, userId, messageId, dossierId, contactIds = [], classification = 'manual' }) {
  const message = await ArchivedMailMessage.findOne({ _id: messageId, tenantId });
  if (!message) throw Object.assign(new Error('Message archivé introuvable.'), { statusCode: 404, code: 'MAIL_MESSAGE_NOT_FOUND' });
  return MailMatterLink.findOneAndUpdate(
    { tenantId, messageId, dossierId },
    {
      $set: {
        contactIds,
        direction: message.folderKey === 'sent' ? 'outgoing' : 'incoming',
        classification: ['manual', 'rule', 'confirmed_suggestion'].includes(classification) ? classification : 'manual',
        linkedBy: userId,
      },
    },
    { upsert: true, new: true, runValidators: true },
  );
}

module.exports = {
  DEFAULT_LEASE_MS,
  DEFAULT_MAX_ATTEMPTS,
  MAX_TOTAL_ATTACHMENT_BYTES,
  normalizedIdempotencyKey,
  validateRecipients,
  publicOperation,
  freezePublicationArtifact,
  freezeDocumentAttachments,
  createSendOperation,
  claimNextOperation,
  loadAttachmentBuffers,
  archiveOutgoing,
  retryableSendError,
  failOperation,
  runClaimedOperation,
  runNextOperation,
  resetExpiredLeases,
  linkMessageToMatter,
};
