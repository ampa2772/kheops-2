const mongoose = require('mongoose');

const AIUsageLedgerEntrySchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'AITask', required: true, index: true },
  reservationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIBudgetReservation', default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  matterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
  connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIProviderConnection', required: true },
  provider: { type: String, required: true, index: true },
  model: { type: String, required: true, index: true },
  operation: { type: String, required: true, index: true },
  inputTokens: { type: Number, min: 0, default: 0 },
  outputTokens: { type: Number, min: 0, default: 0 },
  cachedInputTokens: { type: Number, min: 0, default: 0 },
  // Compteurs additionnels facturables (raisonnement, cache écrit, image,
  // audio, outil, recherche…). Objet numérique borné et assaini par service.
  usageDimensions: { type: mongoose.Schema.Types.Mixed, default: {} },
  currency: { type: String, enum: ['EUR', 'USD'], required: true },
  catalogueVersion: { type: String, required: true },
  inputUnitCost: { type: Number, min: 0, required: true },
  outputUnitCost: { type: Number, min: 0, required: true },
  dimensionUnitCosts: { type: mongoose.Schema.Types.Mixed, default: {} },
  totalCost: { type: Number, min: 0, required: true },
  measurement: { type: String, enum: ['estimated', 'actual'], required: true },
  costNature: { type: String, enum: ['official', 'calculated', 'estimated'], default: 'calculated' },
  providerRequestId: { type: String, default: null },
}, { timestamps: true });

AIUsageLedgerEntrySchema.index(
  { taskId: 1, measurement: 1 },
  { unique: true, partialFilterExpression: { measurement: 'actual' } },
);
AIUsageLedgerEntrySchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.models.AIUsageLedgerEntry
  || mongoose.model('AIUsageLedgerEntry', AIUsageLedgerEntrySchema);
