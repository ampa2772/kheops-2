const mongoose = require('mongoose');

const AICatalogueEntrySchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  provider: { type: String, required: true, index: true },
  model: { type: String, required: true, index: true },
  version: { type: String, required: true, index: true },
  label: { type: String, required: true },
  currency: { type: String, enum: ['EUR', 'USD'], default: 'EUR' },
  inputPerMillion: { type: Number, min: 0, required: true },
  outputPerMillion: { type: Number, min: 0, required: true },
  cachedInputPerMillion: { type: Number, min: 0, default: null },
  // Tarifs supplémentaires versionnés. Exemple :
  // { reasoningTokens: { amount: 12, unit: 'per_million' }, images: { amount: 0.02, unit: 'per_unit' } }
  dimensionRates: { type: mongoose.Schema.Types.Mixed, default: {} },
  minimumCharge: { type: Number, min: 0, default: 0 },
  capabilities: { type: mongoose.Schema.Types.Mixed, default: {} },
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: { type: Date, default: null },
  active: { type: Boolean, default: true, index: true },
  source: { type: String, default: 'administration' },
}, { timestamps: true });

AICatalogueEntrySchema.index({ tenantId: 1, provider: 1, model: 1, version: 1 }, { unique: true });
AICatalogueEntrySchema.index({ tenantId: 1, provider: 1, model: 1, active: 1, effectiveFrom: -1 });

module.exports = mongoose.models.AICatalogueEntry
  || mongoose.model('AICatalogueEntry', AICatalogueEntrySchema);
