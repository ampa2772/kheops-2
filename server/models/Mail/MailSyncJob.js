const mongoose = require('mongoose');

const MailSyncJobSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'OAuthMailAccount', required: true, index: true },
  trigger: { type: String, enum: ['manual', 'notification', 'renewal', 'catchup', 'initial'], required: true },
  idempotencyKey: { type: String, required: true, maxlength: 240 },
  forceFull: { type: Boolean, default: false },
  status: { type: String, enum: ['queued', 'running', 'succeeded', 'failed', 'dead'], default: 'queued', index: true },
  attemptCount: { type: Number, min: 0, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  leaseOwner: { type: String, maxlength: 200, default: null },
  leaseUntil: { type: Date, default: null, index: true },
  result: {
    upserted: { type: Number, min: 0, default: 0 },
    deleted: { type: Number, min: 0, default: 0 },
    pages: { type: Number, min: 0, default: 0 },
    completedAt: { type: Date, default: null },
  },
  lastError: {
    code: { type: String, maxlength: 120, default: null },
    message: { type: String, maxlength: 1000, default: null },
    at: { type: Date, default: null },
  },
}, { timestamps: true, minimize: false });

MailSyncJobSchema.index({ tenantId: 1, accountId: 1, idempotencyKey: 1 }, { unique: true });
MailSyncJobSchema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 });

module.exports = mongoose.models.MailSyncJob || mongoose.model('MailSyncJob', MailSyncJobSchema);

