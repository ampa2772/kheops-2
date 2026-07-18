const mongoose = require('mongoose');

// Journal métier persistant et sans contenu complet : les détails passent par
// le service de caviardage avant insertion.
const AIAuditEventSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action: { type: String, required: true, index: true },
  resourceType: { type: String, required: true },
  resourceId: { type: String, default: null },
  matterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', default: null, index: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'AITask', default: null, index: true },
  provider: { type: String, default: null },
  model: { type: String, default: null },
  outcome: { type: String, enum: ['success', 'failure', 'denied'], default: 'success' },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  ipHash: { type: String, default: null },
  userAgent: { type: String, default: null, maxlength: 300 },
  retentionUntil: { type: Date, default: () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) },
}, { timestamps: true });

AIAuditEventSchema.index({ tenantId: 1, createdAt: -1 });
AIAuditEventSchema.index({ tenantId: 1, taskId: 1, createdAt: 1 });
AIAuditEventSchema.index({ retentionUntil: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.AIAuditEvent || mongoose.model('AIAuditEvent', AIAuditEventSchema);
