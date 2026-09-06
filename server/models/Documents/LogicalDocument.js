const mongoose = require('mongoose');

const AliasSchema = new mongoose.Schema({
  system: { type: String, required: true, trim: true, lowercase: true, maxlength: 80 },
  externalId: { type: String, required: true, trim: true, maxlength: 240 },
}, { _id: false });

const ProvenanceSchema = new mongoose.Schema({
  source: {
    type: String,
    enum: ['user', 'upload', 'generated', 'migration', 'email', 'sync', 'system'],
    default: 'user',
  },
  sourceId: { type: String, trim: true, maxlength: 240, default: '' },
  sourceCollection: { type: String, trim: true, maxlength: 160, default: '' },
  importBatchId: { type: String, trim: true, maxlength: 160, default: '' },
  originalFilename: { type: String, trim: true, maxlength: 300, default: '' },
  observedAt: { type: Date, default: Date.now },
}, { _id: false });

const LogicalDocumentSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  dossierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
  identityKey: { type: String, required: true, maxlength: 160 },
  title: { type: String, required: true, trim: true, maxlength: 300 },
  documentType: { type: String, trim: true, lowercase: true, maxlength: 100, default: 'document' },
  preferredMime: { type: String, trim: true, maxlength: 160, default: 'application/octet-stream' },
  status: {
    type: String,
    enum: ['draft', 'review', 'validated', 'signed', 'archived', 'conflict'],
    default: 'draft',
    index: true,
  },
  aliases: { type: [AliasSchema], default: [] },
  syncConflicts: { type:[String], default:[] },
  projectedHistoryVersionId: { type:String,default:null },
  provenance: { type: ProvenanceSchema, default: () => ({ source: 'user' }) },
  currentVersionId: { type: String, default: null, maxlength: 180 },
  canonicalCopyId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentCopy', default: null },
  revision: { type: Number, min: 0, default: 0 },
  idempotencyKey: { type: String, trim: true, maxlength: 240, default: null },
  migrationState: {
    status: { type: String, enum: ['none', 'migrated', 'rolled_back'], default: 'none' },
    runId: { type: String, default: null },
    rolledBackAt: { type: Date, default: null },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, minimize: false });

LogicalDocumentSchema.index({ tenantId: 1, dossierId: 1, identityKey: 1 }, { unique: true });
LogicalDocumentSchema.index(
  { tenantId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
LogicalDocumentSchema.index({ tenantId: 1, 'aliases.system': 1, 'aliases.externalId': 1 });

module.exports = mongoose.model('LogicalDocument', LogicalDocumentSchema);
