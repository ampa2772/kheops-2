const mongoose = require('mongoose');

const MigrationBackupSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  migrationKey: { type: String, required: true, index: true },
  resourceType: { type: String, required: true },
  resourceId: { type: String, required: true },
  before: { type: mongoose.Schema.Types.Mixed, required: true },
  applied: { type: mongoose.Schema.Types.Mixed, required: true },
  restoredAt: { type: Date, default: null },
}, { timestamps: true });

MigrationBackupSchema.index(
  { tenantId: 1, migrationKey: 1, resourceType: 1, resourceId: 1 },
  { unique: true },
);

module.exports = mongoose.models.MigrationBackup
  || mongoose.model('MigrationBackup', MigrationBackupSchema);
