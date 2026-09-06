const mongoose = require('mongoose');

const DocumentCopySchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  logicalDocumentId: { type: mongoose.Schema.Types.ObjectId, ref: 'LogicalDocument', required: true, index: true },
  copyKey: { type: String, required: true, maxlength: 160 },
  basedOnVersionId: { type: String, maxlength: 180, default: null },
  format: { type: String, trim: true, lowercase: true, maxlength: 80, default: 'binary' },
  purpose: {
    type: String,
    enum: ['canonical', 'working', 'external_edit', 'export', 'archive', 'original'],
    default: 'working',
  },
  checksum: { type: String, trim: true, lowercase: true, maxlength: 128, default: null },
  syncConflicts: { type:[String], default:[] },
  size: { type: Number, min: 0, default: 0 },
  state: {
    type: String,
    enum: ['ready', 'dirty', 'syncing', 'synced', 'conflict', 'missing', 'detached', 'deleted'],
    default: 'ready',
    index: true,
  },
  retentionPolicy: {
    type: String,
    enum: ['keep', 'delete_after_sync', 'cabinet_policy', 'manual'],
    default: 'cabinet_policy',
  },
  idempotencyKey: { type: String, trim: true, maxlength: 240, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, minimize: false });

DocumentCopySchema.index({ tenantId: 1, logicalDocumentId: 1, copyKey: 1 }, { unique: true });
DocumentCopySchema.index(
  { tenantId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

module.exports = mongoose.model('DocumentCopy', DocumentCopySchema);
