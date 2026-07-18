const mongoose = require('mongoose');

const DocumentEditorRevisionSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  revision: {
    type: Number,
    required: true,
  },
  structuredDocument: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  reason: {
    type: String,
    enum: ['manual', 'import', 'validation', 'ai_proposal', 'template', 'status', 'restore', 'comment'],
    default: 'manual',
  },
  comment: {
    type: String,
    maxlength: 500,
    default: '',
  },
  savedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    default: 'draft',
  },
  restoredFromRevision: { type: Number, default: null, min: 1 },
}, { timestamps: { createdAt: 'savedAt', updatedAt: false }, minimize: false });

DocumentEditorRevisionSchema.index(
  { tenantId: 1, documentId: 1, revision: 1 },
  { unique: true },
);

module.exports = mongoose.model('DocumentEditorRevision', DocumentEditorRevisionSchema);
