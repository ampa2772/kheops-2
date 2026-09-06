const mongoose = require('mongoose');

const DocumentLocationSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  logicalDocumentId: { type: mongoose.Schema.Types.ObjectId, ref: 'LogicalDocument', required: true, index: true },
  copyId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentCopy', required: true, index: true },
  locationKey: { type: String, required: true, maxlength: 160 },
  provider: {
    type: String,
    enum: ['managed_gcs', 'local', 'canonical', 'onedrive', 'google_drive', 'sharepoint', 'external'],
    required: true,
  },
  accountRef: { type: String, trim: true, maxlength: 300, default: '' },
  containerId: { type: String, trim: true, maxlength: 500, default: '' },
  externalFileId: { type: String, trim: true, maxlength: 500, default: '' },
  storageKey: { type: String, trim: true, maxlength: 1200, default: '' },
  // Server-only attestation; public registration never copies these input fields.
  verifiedStorageKey: { type: String, maxlength: 1200, default: '' },
  storageVerifiedAt: { type: Date, default: null },
  webUrl: { type: String, trim: true, maxlength: 2000, default: '' },
  remoteRevision: { type: String, trim: true, maxlength: 500, default: '' },
  remoteChecksum: { type: String, trim: true, lowercase: true, maxlength: 128, default: '' },
  remoteModifiedAt: { type: Date, default: null },
  state: {
    type: String,
    enum: ['available', 'syncing', 'stale', 'conflict', 'missing', 'revoked', 'deleted'],
    default: 'available',
    index: true,
  },
  lastObservedAt: { type: Date, default: null },
  idempotencyKey: { type: String, trim: true, maxlength: 240, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, minimize: false });

DocumentLocationSchema.index({ tenantId: 1, copyId: 1, locationKey: 1 }, { unique: true });
DocumentLocationSchema.index(
  { tenantId: 1, provider: 1, accountRef: 1, externalFileId: 1 },
  {
    unique: true,
    partialFilterExpression: { externalFileId: { $type: 'string', $gt: '' } },
  },
);
DocumentLocationSchema.index(
  { tenantId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

module.exports = mongoose.model('DocumentLocation', DocumentLocationSchema);
