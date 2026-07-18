const mongoose = require('mongoose');

const MailTemplateSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  templateKey: { type: String, required: true, trim: true, lowercase: true, maxlength: 100 },
  version: { type: Number, required: true, min: 1 },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  subject: { type: String, default: '', maxlength: 4000 },
  bodyText: { type: String, default: '', maxlength: 200000 },
  bodyHtml: { type: String, default: '', maxlength: 400000 },
  active: { type: Boolean, default: true, index: true },
  supersedesVersion: { type: Number, min: 1, default: null },
  changeComment: { type: String, default: '', maxlength: 1000 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

MailTemplateSchema.index(
  { tenantId: 1, ownerUserId: 1, templateKey: 1, version: 1 },
  { unique: true },
);

module.exports = mongoose.models.MailTemplate || mongoose.model('MailTemplate', MailTemplateSchema);
