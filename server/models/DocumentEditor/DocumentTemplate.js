const mongoose = require('mongoose');

const TemplateScopeSchema = new mongoose.Schema({
  jurisdiction: { type: String, default: null, trim: true, maxlength: 120 },
  team: { type: String, default: null, trim: true, maxlength: 120 },
  responsibleLawyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  language: { type: String, default: 'fr', trim: true, maxlength: 12 },
  tags: { type: [String], default: [] },
}, { _id: false });

const HeaderFooterSchema = new mongoose.Schema({
  default: { type: mongoose.Schema.Types.Mixed, default: null },
  firstPage: { type: mongoose.Schema.Types.Mixed, default: null },
  evenPages: { type: mongoose.Schema.Types.Mixed, default: null },
  distanceMm: { type: Number, min: 0, max: 60, default: 12.7 },
}, { _id: false, minimize: false });

const SignatureRuleSchema = new mongoose.Schema({
  source: {
    type: String,
    enum: ['none', 'cabinet', 'responsible_lawyer', 'explicit'],
    default: 'responsible_lawyer',
  },
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  text: { type: String, default: '', maxlength: 4000 },
  image: { type: String, default: '', maxlength: 700000 },
  altText: { type: String, default: 'Signature', maxlength: 300 },
  alignment: { type: String, enum: ['left', 'center', 'right'], default: 'right' },
  placement: { type: String, enum: ['document_end', 'last_page_bottom', 'all_pages_footer'], default: 'document_end' },
  required: { type: Boolean, default: false },
}, { _id: false });

const DocumentTemplateSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  templateKey: { type: String, required: true, trim: true, lowercase: true, maxlength: 100 },
  version: { type: Number, required: true, min: 1 },
  name: { type: String, required: true, trim: true, maxlength: 180 },
  description: { type: String, default: '', trim: true, maxlength: 2000 },
  documentType: { type: String, default: 'generic', trim: true, lowercase: true, maxlength: 80 },
  scope: { type: TemplateScopeSchema, default: () => ({ language: 'fr' }) },
  priority: { type: Number, min: -1000, max: 1000, default: 0 },
  layout: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  styles: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  header: { type: HeaderFooterSchema, default: () => ({}) },
  footer: { type: HeaderFooterSchema, default: () => ({}) },
  signature: { type: SignatureRuleSchema, default: () => ({}) },
  body: { type: mongoose.Schema.Types.Mixed, default: null },
  active: { type: Boolean, default: true, index: true },
  supersedesVersion: { type: Number, default: null, min: 1 },
  changeComment: { type: String, default: '', trim: true, maxlength: 1000 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, minimize: false });

DocumentTemplateSchema.index({ tenantId: 1, templateKey: 1, version: 1 }, { unique: true });
DocumentTemplateSchema.index({ tenantId: 1, documentType: 1, active: 1, version: -1 });

module.exports = mongoose.model('DocumentTemplate', DocumentTemplateSchema);
