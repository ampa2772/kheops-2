const mongoose = require('mongoose');

const RecipientSchema = new mongoose.Schema({
  name: { type: String, maxlength: 300, default: '' },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 320 },
}, { _id: false });

const OutboundAttachmentSchema = new mongoose.Schema({
  artifactId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentPublicationArtifact', default: null },
  documentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  versionId: { type: String, maxlength: 200, default: null },
  format: { type: String, enum: ['docx', 'pdf'], default: null },
  filename: { type: String, maxlength: 500, required: true },
  mime: { type: String, maxlength: 255, required: true },
  storageKey: { type: String, maxlength: 2000, default: null },
  size: { type: Number, min: 0, default: 0 },
  checksum: { type: String, maxlength: 128, default: null },
}, { _id: false });

const MailSendOperationSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'OAuthMailAccount', required: true, index: true },
  provider: { type: String, enum: ['google', 'microsoft', 'imap'], required: true },
  idempotencyKey: { type: String, required: true, trim: true, maxlength: 240 },
  stableMessageId: { type: String, required: true, trim: true, maxlength: 500 },
  dossierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', default: null, index: true },
  contactIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'Contact', default: [] },
  documentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  documentVersionId: { type: String, maxlength: 200, default: null },
  from: { type: RecipientSchema, required: true },
  to: { type: [RecipientSchema], required: true, validate: [(v) => v.length > 0, 'Destinataire requis.'] },
  cc: { type: [RecipientSchema], default: [] },
  bcc: { type: [RecipientSchema], default: [] },
  subject: { type: String, maxlength: 4000, default: '' },
  bodyText: { type: String, maxlength: 2000000, default: '' },
  bodyHtml: { type: String, maxlength: 4000000, default: '' },
  attachments: { type: [OutboundAttachmentSchema], default: [] },
  status: {
    type: String,
    enum: ['queued', 'preparing', 'sending', 'provider_accepted', 'reconciled', 'failed', 'cancelled'],
    default: 'queued',
    index: true,
  },
  attemptCount: { type: Number, min: 0, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  leaseOwner: { type: String, maxlength: 200, default: null },
  leaseUntil: { type: Date, default: null, index: true },
  providerMessageId: { type: String, maxlength: 2000, default: null },
  providerThreadId: { type: String, maxlength: 2000, default: null },
  archivedMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ArchivedMailMessage', default: null },
  providerAcceptedAt: { type: Date, default: null },
  reconciledAt: { type: Date, default: null },
  lastError: {
    code: { type: String, maxlength: 120, default: null },
    message: { type: String, maxlength: 1000, default: null },
    retryable: { type: Boolean, default: false },
    at: { type: Date, default: null },
  },
}, { timestamps: true, minimize: false });

MailSendOperationSchema.index({ tenantId: 1, ownerUserId: 1, idempotencyKey: 1 }, { unique: true });
MailSendOperationSchema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 });

module.exports = mongoose.models.MailSendOperation
  || mongoose.model('MailSendOperation', MailSendOperationSchema);
