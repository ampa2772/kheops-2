const mongoose = require('mongoose');

const MailSubscriptionSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'OAuthMailAccount', required: true, index: true },
  provider: { type: String, enum: ['google', 'microsoft'], required: true },
  providerSubscriptionId: { type: String, trim: true, maxlength: 1000, default: null },
  resource: { type: String, trim: true, maxlength: 2000, required: true },
  clientStateHash: { type: String, maxlength: 128, default: null, select: false },
  status: { type: String, enum: ['active', 'renewing', 'expired', 'error', 'disabled'], default: 'active' },
  expiresAt: { type: Date, required: true, index: true },
  renewAfter: { type: Date, required: true, index: true },
  lastNotificationAt: { type: Date, default: null },
  lastRenewedAt: { type: Date, default: null },
  lastError: { type: String, maxlength: 1000, default: null },
}, { timestamps: true });

MailSubscriptionSchema.index({ tenantId: 1, accountId: 1, resource: 1 }, { unique: true });
MailSubscriptionSchema.index({ status: 1, renewAfter: 1 });

module.exports = mongoose.models.MailSubscription
  || mongoose.model('MailSubscription', MailSubscriptionSchema);

