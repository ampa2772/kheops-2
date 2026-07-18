const mongoose = require('mongoose');

const AttachmentSchema = new mongoose.Schema({
  providerAttachmentId: { type: String, maxlength: 1000, default: null },
  filename: { type: String, maxlength: 500, default: '' },
  mime: { type: String, maxlength: 255, default: 'application/octet-stream' },
  size: { type: Number, min: 0, default: 0 },
  storageKey: { type: String, maxlength: 2000, default: null },
  checksum: { type: String, maxlength: 128, default: null },
  inline: { type: Boolean, default: false },
}, { _id: false });

const ArchivedMailMessageSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'OAuthMailAccount', required: true, index: true },
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  provider: { type: String, enum: ['google', 'microsoft', 'imap'], required: true },
  providerMessageId: { type: String, required: true, trim: true, maxlength: 2000 },
  internetMessageId: { type: String, trim: true, maxlength: 2000, default: null },
  providerThreadId: { type: String, trim: true, maxlength: 2000, default: null, index: true },
  folderKey: { type: String, trim: true, maxlength: 500, default: 'inbox' },
  labels: { type: [String], default: [] },
  from: { type: String, maxlength: 2000, default: '' },
  to: { type: [String], default: [] },
  cc: { type: [String], default: [] },
  bcc: { type: [String], default: [] },
  subject: { type: String, maxlength: 4000, default: '' },
  bodyText: { type: String, maxlength: 2000000, default: '' },
  bodyHtml: { type: String, maxlength: 4000000, default: '' },
  receivedAt: { type: Date, default: null, index: true },
  sentAt: { type: Date, default: null, index: true },
  providerUpdatedAt: { type: Date, default: null },
  isRead: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  attachments: { type: [AttachmentSchema], default: [] },
  deduplicationFingerprint: { type: String, required: true, maxlength: 128 },
  sourceSendOperationId: { type: mongoose.Schema.Types.ObjectId, ref: 'MailSendOperation', default: null },
  lastSyncedAt: { type: Date, default: Date.now },
}, { timestamps: true, minimize: false });

ArchivedMailMessageSchema.index({ tenantId: 1, accountId: 1, providerMessageId: 1 }, { unique: true });
ArchivedMailMessageSchema.index(
  { tenantId: 1, accountId: 1, internetMessageId: 1 },
  { unique: true, partialFilterExpression: { internetMessageId: { $type: 'string' } } },
);
ArchivedMailMessageSchema.index({ tenantId: 1, deduplicationFingerprint: 1 });

module.exports = mongoose.models.ArchivedMailMessage
  || mongoose.model('ArchivedMailMessage', ArchivedMailMessageSchema);

