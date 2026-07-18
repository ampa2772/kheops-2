const mongoose = require('mongoose');

const MailSyncStateSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'OAuthMailAccount', required: true, index: true },
  provider: { type: String, enum: ['google', 'microsoft'], required: true },
  folderKey: { type: String, trim: true, maxlength: 500, default: 'inbox' },
  cursor: { type: String, maxlength: 12000, default: null },
  continuation: { type: String, maxlength: 12000, default: null },
  initialSyncComplete: { type: Boolean, default: false },
  lastFullSyncAt: { type: Date, default: null },
  lastIncrementalSyncAt: { type: Date, default: null },
  lastProcessedAt: { type: Date, default: null },
  leaseOwner: { type: String, maxlength: 200, default: null },
  leaseUntil: { type: Date, default: null, index: true },
  failureCount: { type: Number, min: 0, default: 0 },
  lastErrorCode: { type: String, maxlength: 120, default: null },
}, { timestamps: true, minimize: false });

MailSyncStateSchema.index({ tenantId: 1, accountId: 1, folderKey: 1 }, { unique: true });

module.exports = mongoose.models.MailSyncState
  || mongoose.model('MailSyncState', MailSyncStateSchema);

