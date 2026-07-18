const mongoose = require('mongoose');

const MigrationResourceSchema = new mongoose.Schema({
  resourceType: { type: String, required: true, maxlength: 100 },
  resourceId: { type: String, required: true, maxlength: 240 },
  legacyCollection: { type: String, maxlength: 160, default: '' },
  legacyId: { type: String, maxlength: 240, default: '' },
}, { _id: false });

const DataMigrationRunSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  runId: { type: String, required: true, maxlength: 180 },
  domain: { type: String, enum: ['relations', 'documents'], required: true },
  status: {
    type: String,
    enum: ['running', 'completed', 'failed', 'rolling_back', 'rolled_back'],
    default: 'running',
  },
  sourceCheckpoint: { type: String, maxlength: 1000, default: '' },
  options: { type: mongoose.Schema.Types.Mixed, default: {} },
  stats: {
    scanned: { type: Number, min: 0, default: 0 },
    planned: { type: Number, min: 0, default: 0 },
    created: { type: Number, min: 0, default: 0 },
    deduplicated: { type: Number, min: 0, default: 0 },
    skipped: { type: Number, min: 0, default: 0 },
    errors: { type: Number, min: 0, default: 0 },
    rolledBack: { type: Number, min: 0, default: 0 },
  },
  resources: { type: [MigrationResourceSchema], default: [] },
  errorLog: [{
    sourceId: { type: String, default: '' },
    code: { type: String, default: '' },
    message: { type: String, maxlength: 1500, default: '' },
    at: { type: Date, default: Date.now },
  }],
  startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  completedAt: { type: Date, default: null },
  rollback: {
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    note: { type: String, maxlength: 1000, default: '' },
  },
}, { timestamps: true, minimize: false });

DataMigrationRunSchema.index({ tenantId: 1, runId: 1 }, { unique: true });
DataMigrationRunSchema.index({ tenantId: 1, domain: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('DataMigrationRun', DataMigrationRunSchema);
