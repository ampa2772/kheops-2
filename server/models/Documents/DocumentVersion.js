const mongoose = require('mongoose');

const StorageRefSchema = new mongoose.Schema({
  provider: { type: String, trim: true, lowercase: true, maxlength: 80, default: '' },
  storageKey: { type: String, trim: true, maxlength: 1000, default: '' },
  externalFileId: { type: String, trim: true, maxlength: 500, default: '' },
}, { _id: false });

const DocumentVersionSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  logicalDocumentId: { type: mongoose.Schema.Types.ObjectId, ref: 'LogicalDocument', required: true, index: true },
  versionId: { type: String, required: true, trim: true, maxlength: 180 },
  sequence: { type: Number, required: true, min: 1 },
  parentVersionIds: { type: [String], default: [] },
  checksum: { type: String, required: true, trim: true, lowercase: true, maxlength: 128 },
  size: { type: Number, required: true, min: 0 },
  mime: { type: String, trim: true, maxlength: 160, default: 'application/octet-stream' },
  filename: { type: String, trim: true, maxlength: 300, default: 'document' },
  storageRef: { type: StorageRefSchema, default: () => ({}) },
  editor: {
    type: String,
    enum: ['kheops', 'word_desktop', 'word_web', 'google_docs', 'upload', 'system', 'migration'],
    default: 'system',
  },
  origin: { type: String, trim: true, lowercase: true, maxlength: 100, default: 'system' },
  status: {
    type: String,
    enum: ['draft', 'review', 'validated', 'signed', 'archived', 'conflict'],
    default: 'draft',
  },
  conflictWithVersionId: { type: String, maxlength: 180, default: null },
  comment: { type: String, maxlength: 1000, default: '' },
  idempotencyKey: { type: String, trim: true, maxlength: 240, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false }, minimize: false });

DocumentVersionSchema.index({ tenantId: 1, logicalDocumentId: 1, versionId: 1 }, { unique: true });
DocumentVersionSchema.index({ tenantId: 1, logicalDocumentId: 1, sequence: 1 }, { unique: true });
DocumentVersionSchema.index(
  { tenantId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
DocumentVersionSchema.index({ tenantId: 1, logicalDocumentId: 1, checksum: 1 });

module.exports = mongoose.model('LogicalDocumentVersion', DocumentVersionSchema);
