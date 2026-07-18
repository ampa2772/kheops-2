const mongoose = require('mongoose');

const AIBudgetReservationSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  policyId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIBudgetPolicy', required: true, index: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'AITask', required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  matterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
  connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIProviderConnection', required: true },
  amount: { type: Number, required: true, min: 0 },
  actualAmount: { type: Number, min: 0, default: null },
  currency: { type: String, enum: ['EUR', 'USD'], required: true },
  state: {
    type: String,
    enum: ['pending', 'active', 'settling', 'settled', 'releasing', 'released', 'expired'],
    default: 'pending',
    index: true,
  },
  dayKey: { type: String, required: true },
  monthKey: { type: String, required: true },
  periodKey: { type: String, default: null },
  expiresAt: { type: Date, required: true, index: true },
  settledAt: { type: Date, default: null },
  releasedAt: { type: Date, default: null },
}, { timestamps: true });

AIBudgetReservationSchema.index({ tenantId: 1, state: 1, expiresAt: 1 });

module.exports = mongoose.models.AIBudgetReservation
  || mongoose.model('AIBudgetReservation', AIBudgetReservationSchema);
