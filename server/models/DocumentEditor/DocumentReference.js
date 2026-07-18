const crypto = require('crypto');
const mongoose = require('mongoose');

const DocumentReferenceSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  sourceDossierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
  sourceDocumentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  referenceId: { type: String, required: true, default: () => crypto.randomUUID() },
  targetDossierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
  targetDocumentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  targetVersionId: { type: String, default: null, maxlength: 180 },
  followLatest: { type: Boolean, default: false },
  referenceType: {
    type: String,
    enum: ['piece', 'annexe', 'document', 'authority', 'custom'],
    default: 'piece',
  },
  label: { type: String, required: true, trim: true, maxlength: 300 },
  pieceNumber: { type: String, default: '', trim: true, maxlength: 80 },
  targetSubfolderId: { type: mongoose.Schema.Types.ObjectId, default: null },
  targetTitleSnapshot: { type: String, default: '', maxlength: 300 },
  status: { type: String, enum: ['active', 'broken', 'denied'], default: 'active' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

DocumentReferenceSchema.path('targetVersionId').validate(function validatePinnedVersion(value) {
  return this.followLatest || Boolean(value);
}, 'Une référence figée doit indiquer une version.');

DocumentReferenceSchema.index({ tenantId: 1, sourceDocumentId: 1, referenceId: 1 }, { unique: true });
DocumentReferenceSchema.index({ tenantId: 1, targetDocumentId: 1, targetVersionId: 1 });

module.exports = mongoose.model('DocumentReference', DocumentReferenceSchema);
