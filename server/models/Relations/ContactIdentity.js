const mongoose = require('mongoose');

const AliasSchema = new mongoose.Schema({
  system: { type: String, required: true, trim: true, lowercase: true, maxlength: 100 },
  externalId: { type: String, required: true, trim: true, maxlength: 240 },
  sourceCollection: { type: String, trim: true, maxlength: 160, default: '' },
  observedAt: { type: Date, default: Date.now },
}, { _id: false });

const ProvenanceSchema = new mongoose.Schema({
  source: { type: String, enum: ['user', 'import', 'migration', 'api', 'system'], default: 'user' },
  sourceCollection: { type: String, maxlength: 160, default: '' },
  sourceId: { type: String, maxlength: 240, default: '' },
  importBatchId: { type: String, maxlength: 160, default: '' },
  observedAt: { type: Date, default: Date.now },
}, { _id: false });

const ContactIdentitySchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  identityKey: { type: String, required: true, maxlength: 160 },
  kind: {
    type: String,
    enum: ['person', 'organization', 'public_body', 'professional', 'unknown'],
    default: 'unknown',
  },
  displayName: { type: String, required: true, trim: true, maxlength: 300 },
  status: { type: String, enum: ['active', 'merged', 'archived'], default: 'active', index: true },
  normalized: {
    name: { type: String, maxlength: 300, default: '' },
    email: { type: String, maxlength: 320, default: '' },
    phone: { type: String, maxlength: 40, default: '' },
    siret: { type: String, maxlength: 20, default: '' },
  },
  duplicateKeys: { type: [String], default: [] },
  aliases: { type: [AliasSchema], default: [] },
  provenance: { type: [ProvenanceSchema], default: [] },
  mergedIntoIdentityId: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactIdentity', default: null },
  mergeReason: { type: String, maxlength: 1000, default: '' },
  revision: { type: Number, min: 0, default: 0 },
  idempotencyKey: { type: String, maxlength: 240, default: null },
  migrationState: {
    status: { type: String, enum: ['none', 'migrated', 'rolled_back'], default: 'none' },
    runId: { type: String, default: null },
    rolledBackAt: { type: Date, default: null },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, minimize: false });

ContactIdentitySchema.index({ tenantId: 1, identityKey: 1 }, { unique: true });
ContactIdentitySchema.index(
  { tenantId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
ContactIdentitySchema.index({ tenantId: 1, 'aliases.system': 1, 'aliases.externalId': 1 });
ContactIdentitySchema.index({ tenantId: 1, duplicateKeys: 1, status: 1 });

ContactIdentitySchema.pre('validate', function validateMerge(next) {
  if (this.status === 'merged' && !this.mergedIntoIdentityId) return next(new Error('mergedIntoIdentityId requis pour une identité fusionnée.'));
  if (this.mergedIntoIdentityId && String(this.mergedIntoIdentityId) === String(this._id)) return next(new Error('Une identité ne peut pas être fusionnée avec elle-même.'));
  return next();
});

module.exports = mongoose.model('ContactIdentity', ContactIdentitySchema);
