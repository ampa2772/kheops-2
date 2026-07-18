const mongoose = require('mongoose');

const AITaskEventSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'AITask', required: true, index: true },
  sequence: { type: Number, required: true, min: 1 },
  type: {
    type: String,
    enum: ['status', 'delta', 'source', 'usage', 'artifact', 'warning', 'error', 'done'],
    required: true,
  },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  retentionUntil: { type: Date, required: true },
}, { timestamps: true });

AITaskEventSchema.index({ taskId: 1, sequence: 1 }, { unique: true });
AITaskEventSchema.index({ tenantId: 1, createdAt: -1 });
AITaskEventSchema.index({ retentionUntil: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.AITaskEvent || mongoose.model('AITaskEvent', AITaskEventSchema);
