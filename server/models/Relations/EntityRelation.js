const mongoose = require('mongoose');

const EndpointSchema = new mongoose.Schema({
  entityType: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 80,
    match: /^[a-z0-9][a-z0-9_.-]*$/,
  },
  entityId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 180,
  },
  labelSnapshot: { type: String, trim: true, maxlength: 300, default: '' },
}, { _id: false });

const RoleSchema = new mongoose.Schema({
  side: { type: String, enum: ['subject', 'object', 'both'], required: true },
  code: { type: String, trim: true, lowercase: true, maxlength: 100, required: true },
  label: { type: String, trim: true, maxlength: 200, default: '' },
  jurisdiction: { type: String, trim: true, maxlength: 160, default: '' },
}, { _id: false });

const ProvenanceSchema = new mongoose.Schema({
  source: {
    type: String,
    enum: ['user', 'import', 'migration', 'api', 'sync', 'system', 'inference'],
    default: 'user',
  },
  sourceCollection: { type: String, trim: true, maxlength: 160, default: '' },
  sourceId: { type: String, trim: true, maxlength: 220, default: '' },
  importBatchId: { type: String, trim: true, maxlength: 160, default: '' },
  observedAt: { type: Date, default: Date.now },
  confidence: { type: Number, min: 0, max: 1, default: 1 },
  note: { type: String, maxlength: 1000, default: '' },
}, { _id: false });

const EntityRelationSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
    immutable: true,
  },
  logicalRelationId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    default: () => new mongoose.Types.ObjectId(),
    index: true,
    immutable: true,
  },
  revision: { type: Number, required: true, min: 1, immutable: true },
  isCurrent: { type: Boolean, required: true, default: true, index: true },
  dedupeKey: { type: String, required: true, maxlength: 128, immutable: true },
  contentHash: { type: String, required: true, maxlength: 128, immutable: true },
  direction: { type: String, enum: ['directed', 'undirected'], default: 'directed', immutable: true },
  relationType: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 100,
    match: /^[a-z0-9][a-z0-9_.-]*$/,
    immutable: true,
  },
  subject: { type: EndpointSchema, required: true, immutable: true },
  object: { type: EndpointSchema, required: true, immutable: true },
  roles: { type: [RoleSchema], default: [] },
  status: {
    type: String,
    enum: ['pending', 'active', 'inactive', 'disputed', 'superseded', 'archived'],
    default: 'active',
  },
  validFrom: { type: Date, default: null },
  validTo: { type: Date, default: null },
  attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
  provenance: { type: ProvenanceSchema, default: () => ({ source: 'user' }) },
  idempotencyKey: { type: String, trim: true, maxlength: 240, default: null, immutable: true },
  supersedesRevisionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EntityRelation',
    default: null,
    immutable: true,
  },
  supersededByRevisionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EntityRelation',
    default: null,
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
}, { timestamps: true, minimize: false });

EntityRelationSchema.index(
  { tenantId: 1, logicalRelationId: 1, revision: 1 },
  { unique: true },
);
EntityRelationSchema.index(
  { tenantId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { isCurrent: true } },
);
EntityRelationSchema.index(
  { tenantId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
EntityRelationSchema.index({ tenantId: 1, 'subject.entityType': 1, 'subject.entityId': 1, isCurrent: 1 });
EntityRelationSchema.index({ tenantId: 1, 'object.entityType': 1, 'object.entityId': 1, isCurrent: 1 });
EntityRelationSchema.index({ tenantId: 1, relationType: 1, status: 1, isCurrent: 1 });

EntityRelationSchema.pre('validate', function validateRelation(next) {
  if (this.subject && this.object
    && this.subject.entityType === this.object.entityType
    && this.subject.entityId === this.object.entityId) {
    return next(new Error('Une relation ne peut pas relier une entité à elle-même.'));
  }
  if (this.validFrom && this.validTo && this.validTo < this.validFrom) {
    return next(new Error('validTo doit être postérieur à validFrom.'));
  }
  return next();
});

module.exports = mongoose.model('EntityRelation', EntityRelationSchema);
