const mongoose = require('mongoose');

const CounterSchema = new mongoose.Schema({
  dayKey: { type: String, default: null },
  monthKey: { type: String, default: null },
  dailyReserved: { type: Number, min: 0, default: 0 },
  dailySpent: { type: Number, min: 0, default: 0 },
  monthlyReserved: { type: Number, min: 0, default: 0 },
  monthlySpent: { type: Number, min: 0, default: 0 },
  periodKey: { type: String, default: null },
  periodReserved: { type: Number, min: 0, default: 0 },
  periodSpent: { type: Number, min: 0, default: 0 },
  periodStartedAt: { type: Date, default: null },
  periodEndsAt: { type: Date, default: null },
}, { _id: false });

const ActiveReservationSchema = new mongoose.Schema({
  reservationId: { type: mongoose.Schema.Types.ObjectId, required: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, required: true },
  amount: { type: Number, min: 0, required: true },
  dayKey: { type: String, required: true },
  monthKey: { type: String, required: true },
  periodKey: { type: String, default: null },
  expiresAt: { type: Date, required: true },
}, { _id: false });

const AIBudgetPolicySchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  scopeType: { type: String, enum: ['tenant', 'user', 'connection'], default: 'tenant', index: true },
  scopeId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  currency: { type: String, enum: ['EUR', 'USD'], default: 'EUR' },
  timezone: { type: String, default: 'Europe/Paris' },
  periodType: { type: String, enum: ['day', 'week', 'month', 'custom'], default: 'month' },
  periodLimit: { type: Number, min: 0, default: null },
  customPeriodDays: { type: Number, min: 1, max: 365, default: 30 },
  periodAnchorAt: { type: Date, default: null },
  softDailyLimit: { type: Number, min: 0, default: null },
  hardDailyLimit: { type: Number, min: 0, default: 5 },
  softMonthlyLimit: { type: Number, min: 0, default: null },
  hardMonthlyLimit: { type: Number, min: 0, default: 50 },
  perTaskLimit: { type: Number, min: 0, default: 10 },
  warningThresholds: { type: [Number], default: [0.5, 0.8, 1] },
  actionAtLimit: { type: String, enum: ['block', 'require_override'], default: 'block' },
  overrideRoles: { type: [String], default: ['owner', 'admin'] },
  forbiddenModels: { type: [String], default: [] },
  enabled: { type: Boolean, default: true, index: true },
  counters: { type: CounterSchema, default: () => ({}) },
  activeReservations: { type: [ActiveReservationSchema], default: [], select: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, optimisticConcurrency: true });

AIBudgetPolicySchema.index(
  { tenantId: 1, scopeType: 1, scopeId: 1 },
  { unique: true },
);

module.exports = mongoose.models.AIBudgetPolicy
  || mongoose.model('AIBudgetPolicy', AIBudgetPolicySchema);
