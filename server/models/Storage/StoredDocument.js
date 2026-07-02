const mongoose = require('mongoose');

const StoredDocumentVersionSchema = new mongoose.Schema({
  versionId: {
    type: String,
    required: true,
  },
  storageKey: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    default: 0,
    min: 0,
    required: true,
  },
  mime: {
    type: String,
    default: 'application/octet-stream',
  },
  filename: {
    type: String,
    default: null,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, { _id: false });

const StoredDocumentSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true,
  },
  dossierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dossier',
    default: null,
    index: true,
  },
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId(),
    required: true,
    index: true,
  },
  versions: {
    type: [StoredDocumentVersionSchema],
    default: [],
  },
  currentVersionId: {
    type: String,
    default: null,
  },
  ownerUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  deletedAt: {
    type: Date,
    default: null,
    index: true,
  },
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
});

StoredDocumentSchema.index({ tenantId: 1, dossierId: 1, deletedAt: 1 });
StoredDocumentSchema.index({ tenantId: 1, ownerUserId: 1, deletedAt: 1 });
StoredDocumentSchema.index(
  { tenantId: 1, documentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      tenantId: { $type: 'objectId' },
      documentId: { $type: 'objectId' },
    },
  },
);

module.exports = mongoose.model('StoredDocument', StoredDocumentSchema);
