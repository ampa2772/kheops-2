const mongoose = require('mongoose');

const DocumentPublicationArtifactSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    immutable: true,
    index: true,
  },
  dossierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dossier',
    required: true,
    immutable: true,
    index: true,
  },
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    immutable: true,
    index: true,
  },
  versionId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 180,
    immutable: true,
  },
  revision: {
    type: Number,
    min: 0,
    default: null,
    immutable: true,
  },
  format: {
    type: String,
    enum: ['docx', 'pdf'],
    required: true,
    lowercase: true,
    immutable: true,
  },
  mime: {
    type: String,
    required: true,
    maxlength: 180,
    immutable: true,
  },
  filename: {
    type: String,
    required: true,
    maxlength: 300,
    immutable: true,
  },
  storageKey: {
    type: String,
    required: true,
    maxlength: 1800,
    immutable: true,
  },
  checksum: {
    type: String,
    required: true,
    lowercase: true,
    match: /^[0-9a-f]{64}$/,
    immutable: true,
  },
  sourceChecksum: {
    type: String,
    required: true,
    lowercase: true,
    match: /^[0-9a-f]{64}$/,
    immutable: true,
  },
  size: {
    type: Number,
    required: true,
    min: 0,
    immutable: true,
  },
  renderer: {
    type: String,
    maxlength: 100,
    default: null,
    immutable: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true,
  },
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: false },
  minimize: false,
});

DocumentPublicationArtifactSchema.index(
  { tenantId: 1, dossierId: 1, documentId: 1, versionId: 1, format: 1 },
  { unique: true, name: 'publication_artifact_exact_version' },
);
DocumentPublicationArtifactSchema.index({ tenantId: 1, checksum: 1 });

module.exports = mongoose.models.DocumentPublicationArtifact
  || mongoose.model('DocumentPublicationArtifact', DocumentPublicationArtifactSchema);
