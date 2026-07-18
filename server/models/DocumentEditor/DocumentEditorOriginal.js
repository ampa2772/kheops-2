const mongoose = require('mongoose');

const DocumentEditorOriginalSchema = new mongoose.Schema({
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
  checksum: {
    type: String,
    required: true,
  },
  filename: {
    type: String,
    required: true,
  },
  mime: {
    type: String,
    default: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  size: {
    type: Number,
    required: true,
    min: 0,
  },
  data: {
    type: Buffer,
    required: true,
  },
  importedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, { timestamps: { createdAt: 'importedAt', updatedAt: false } });

DocumentEditorOriginalSchema.index(
  { tenantId: 1, documentId: 1, checksum: 1 },
  { unique: true },
);

module.exports = mongoose.model('DocumentEditorOriginal', DocumentEditorOriginalSchema);
