const mongoose = require('mongoose');

const MailMatterLinkSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ArchivedMailMessage', required: true, index: true },
  dossierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
  contactIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'Contact', default: [] },
  documentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  documentVersionId: { type: String, maxlength: 200, default: null },
  direction: { type: String, enum: ['incoming', 'outgoing'], required: true },
  classification: { type: String, enum: ['manual', 'rule', 'confirmed_suggestion'], default: 'manual' },
  linkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

MailMatterLinkSchema.index({ tenantId: 1, messageId: 1, dossierId: 1 }, { unique: true });

module.exports = mongoose.models.MailMatterLink
  || mongoose.model('MailMatterLink', MailMatterLinkSchema);

