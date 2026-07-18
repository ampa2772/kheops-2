const mongoose = require('mongoose');

const DiscoveredModelSchema = new mongoose.Schema({
  id: { type: String, required: true, maxlength: 200 },
  label: { type: String, required: true, maxlength: 240 },
  capabilities: { type: mongoose.Schema.Types.Mixed, default: {} },
  recommended: { type: Boolean, default: false },
}, { _id: false });

const AIProviderConnectionSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  ownerType: { type: String, enum: ['user', 'cabinet'], required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  provider: {
    type: String,
    enum: ['openai', 'anthropic', 'gemini', 'openai-compatible'],
    required: true,
    index: true,
  },
  displayName: { type: String, required: true, trim: true, maxlength: 120 },
  secretRef: { type: String, required: true, select: false },
  pendingSecretCleanupRefs: { type: [String], default: [], select: false },
  fingerprint: { type: String, required: true, maxlength: 32 },
  status: {
    type: String,
    enum: ['pending', 'active', 'suspended', 'error', 'revoked'],
    default: 'pending',
    index: true,
  },
  allowedModels: { type: [String], default: [] },
  defaultModel: { type: String, required: true },
  discoveredModels: { type: [DiscoveredModelSchema], default: [] },
  recommendedModel: { type: String, default: null, maxlength: 200 },
  modelsRefreshedAt: { type: Date, default: null },
  modelsDiscoverySource: { type: String, enum: ['provider', 'configured'], default: 'configured' },
  modelsDiscoveryVersion: { type: String, default: null },
  capabilities: { type: mongoose.Schema.Types.Mixed, default: {} },
  policyId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIBudgetPolicy', default: null },
  permittedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  permittedRoles: { type: [String], default: [] },
  rules: {
    maxOutputTokens: { type: Number, min: 1, max: 200000, default: 4096 },
    allowImages: { type: Boolean, default: false },
    allowPdf: { type: Boolean, default: true },
    allowExternalTools: { type: Boolean, default: false },
    allowConfidentialDocuments: { type: Boolean, default: false },
    retentionDays: { type: Number, min: 1, max: 3650, default: 90 },
  },
  baseUrl: { type: String, default: null, select: false },
  lastValidatedAt: { type: Date, default: null },
  lastUsedAt: { type: Date, default: null },
  lastErrorCode: { type: String, default: null },
  consecutiveFailures: { type: Number, min: 0, default: 0 },
  reviewAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

AIProviderConnectionSchema.index({ tenantId: 1, status: 1, ownerType: 1, ownerId: 1 });
AIProviderConnectionSchema.index({ tenantId: 1, provider: 1, displayName: 1 });

module.exports = mongoose.models.AIProviderConnection
  || mongoose.model('AIProviderConnection', AIProviderConnectionSchema);
