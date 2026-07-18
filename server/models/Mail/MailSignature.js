const mongoose = require('mongoose');

const MailSignatureSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'OAuthMailAccount', default: null, index: true },
  signatureKey: { type: String, required: true, trim: true, lowercase: true, maxlength: 100 },
  version: { type: Number, required: true, min: 1 },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  bodyText: { type: String, default: '', maxlength: 100000 },
  bodyHtml: { type: String, default: '', maxlength: 200000 },
  isDefault: { type: Boolean, default: false, index: true },
  active: { type: Boolean, default: true, index: true },
  supersedesVersion: { type: Number, min: 1, default: null },
  changeComment: { type: String, default: '', maxlength: 1000 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

MailSignatureSchema.index(
  { tenantId: 1, ownerUserId: 1, accountId: 1, signatureKey: 1, version: 1 },
  { unique: true },
);

module.exports = mongoose.models.MailSignature || mongoose.model('MailSignature', MailSignatureSchema);
