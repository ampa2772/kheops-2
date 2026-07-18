const mongoose = require('mongoose');

const EndpointSchema = new mongoose.Schema({
  copyId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentCopy', default: null },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentLocation', default: null },
  versionId: { type: String, maxlength: 180, default: null },
  checksum: { type: String, lowercase: true, maxlength: 128, default: null },
}, { _id: false });

const ConflictSchema = new mongoose.Schema({
  kind: {
    type: String,
    enum: ['both_modified', 'base_missing', 'remote_deleted', 'checksum_mismatch', 'version_diverged', 'policy_blocked'],
    required: true,
  },
  detectedAt: { type: Date, default: Date.now },
  sourceVersionId: { type: String, default: null },
  targetVersionId: { type: String, default: null },
  sourceChecksum: { type: String, default: null },
  targetChecksum: { type: String, default: null },
  status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  resolution: {
    type: String,
    enum: ['keep_source', 'keep_target', 'keep_both', 'merged', 'cancelled', null],
    default: null,
  },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  note: { type: String, maxlength: 1000, default: '' },
}, { _id: false });

const DocumentSyncJournalSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  logicalDocumentId: { type: mongoose.Schema.Types.ObjectId, ref: 'LogicalDocument', required: true, index: true },
  operationId: { type: String, required: true, trim: true, maxlength: 180 },
  idempotencyKey: { type: String, required: true, trim: true, maxlength: 240 },
  direction: { type: String, enum: ['push', 'pull', 'reconcile', 'copy', 'delete_external'], required: true },
  source: { type: EndpointSchema, required: true },
  target: { type: EndpointSchema, required: true },
  baseVersionId: { type: String, maxlength: 180, default: null },
  status: {
    type: String,
    enum: ['queued', 'running', 'retry_wait', 'succeeded', 'failed', 'conflict', 'cancelled'],
    default: 'queued',
    index: true,
  },
  attempt: { type: Number, min: 0, default: 0 },
  maxAttempts: { type: Number, min: 1, max: 50, default: 5 },
  lease: {
    workerId: { type: String, maxlength: 180, default: null },
    acquiredAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  checkpoint: {
    stage: { type: String, maxlength: 100, default: 'queued' },
    cursor: { type: String, maxlength: 1000, default: '' },
    bytesProcessed: { type: Number, min: 0, default: 0 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedAt: { type: Date, default: null },
  },
  result: {
    versionId: { type: String, maxlength: 180, default: null },
    copyId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentCopy', default: null },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentLocation', default: null },
    checksum: { type: String, maxlength: 128, default: null },
    deduplicated: { type: Boolean, default: false },
  },
  conflict: { type: ConflictSchema, default: null },
  lastError: {
    code: { type: String, maxlength: 120, default: null },
    message: { type: String, maxlength: 1500, default: null },
    retryable: { type: Boolean, default: false },
    at: { type: Date, default: null },
  },
  nextRetryAt: { type: Date, default: null, index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  completedAt: { type: Date, default: null },
}, { timestamps: true, minimize: false });

DocumentSyncJournalSchema.index({ tenantId: 1, operationId: 1 }, { unique: true });
DocumentSyncJournalSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true });
DocumentSyncJournalSchema.index({ tenantId: 1, status: 1, nextRetryAt: 1, 'lease.expiresAt': 1 });
// La boucle interne consomme tous les tenants ; cet index évite un scan global
// à chaque poll tout en laissant le claim atomique revalider tenant+operationId.
DocumentSyncJournalSchema.index({ status: 1, nextRetryAt: 1, 'lease.expiresAt': 1, createdAt: 1 });

module.exports = mongoose.model('DocumentSyncJournal', DocumentSyncJournalSchema);
