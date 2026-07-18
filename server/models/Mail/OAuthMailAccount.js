const mongoose = require('mongoose');

const OAuthMailAccountSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  provider: { type: String, enum: ['google', 'microsoft'], required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 320 },
  displayName: { type: String, trim: true, maxlength: 200, default: '' },
  accountType: { type: String, enum: ['personal', 'organization', 'shared', 'unknown'], default: 'unknown' },
  encryptedRefreshToken: { type: String, default: null, select: false },
  legacyTokenField: {
    type: String,
    enum: ['googleRefreshToken', 'microsoftRefreshToken', null],
    default: null,
  },
  scopes: { type: [String], default: [] },
  isDefault: { type: Boolean, default: false, index: true },
  status: {
    type: String,
    enum: ['active', 'syncing', 'error', 'reauth_required', 'disabled', 'disconnected'],
    default: 'active',
    index: true,
  },
  sharedMailboxAddress: { type: String, lowercase: true, trim: true, maxlength: 320, default: null },
  lastTestAt: { type: Date, default: null },
  lastSyncStartedAt: { type: Date, default: null },
  lastSyncAt: { type: Date, default: null },
  lastSuccessfulSyncAt: { type: Date, default: null },
  nextRenewalAt: { type: Date, default: null },
  recentErrorCount: { type: Number, min: 0, default: 0 },
  lastError: {
    code: { type: String, maxlength: 120, default: null },
    message: { type: String, maxlength: 1000, default: null },
    at: { type: Date, default: null },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, minimize: false });

OAuthMailAccountSchema.index(
  { tenantId: 1, ownerUserId: 1, provider: 1, email: 1, sharedMailboxAddress: 1 },
  { unique: true },
);

OAuthMailAccountSchema.index(
  { tenantId: 1, ownerUserId: 1, isDefault: 1 },
  { partialFilterExpression: { isDefault: true } },
);

OAuthMailAccountSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.encryptedRefreshToken;
    delete ret.legacyTokenField;
    return ret;
  },
});

module.exports = mongoose.models.OAuthMailAccount
  || mongoose.model('OAuthMailAccount', OAuthMailAccountSchema);

