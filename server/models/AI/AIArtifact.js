const mongoose = require('mongoose');

const AIArtifactSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  matterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'AITask', required: true, index: true },
  type: {
    type: String,
    enum: ['response', 'table', 'timeline', 'proposal', 'document'],
    required: true,
  },
  title: { type: String, required: true, maxlength: 240 },
  content: { type: mongoose.Schema.Types.Mixed, required: true },
  sourceAnchors: { type: [mongoose.Schema.Types.Mixed], default: [] },
  documentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  version: { type: Number, min: 1, default: 1 },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  validationStatus: {
    type: String,
    enum: ['ai_draft_pending_validation', 'validated', 'rejected', 'superseded'],
    default: 'ai_draft_pending_validation',
    index: true,
  },
  validatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  validatedAt: { type: Date, default: null },
  fingerprint: { type: String, required: true },
  retentionUntil: { type: Date, required: true },
}, { timestamps: true });

AIArtifactSchema.index({ taskId: 1, type: 1, version: 1 }, { unique: true });
AIArtifactSchema.index({ tenantId: 1, matterId: 1, createdAt: -1 });
AIArtifactSchema.index({ retentionUntil: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.AIArtifact || mongoose.model('AIArtifact', AIArtifactSchema);
