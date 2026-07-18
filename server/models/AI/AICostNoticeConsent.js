const mongoose = require('mongoose');

const AICostNoticeConsentSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  noticeVersion: { type: String, required: true, maxlength: 80 },
  noticeHash: { type: String, required: true, maxlength: 128 },
  acceptedAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  source: { type: String, enum: ['settings', 'api'], default: 'settings' },
}, { timestamps: true });

AICostNoticeConsentSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.AICostNoticeConsent
  || mongoose.model('AICostNoticeConsent', AICostNoticeConsentSchema);
