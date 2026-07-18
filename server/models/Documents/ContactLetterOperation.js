const mongoose = require('mongoose');

const ContactLetterOperationSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  contactId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  dossierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
  idempotencyKey: { type: String, required: true, maxlength: 240 },
  status: { type: String, enum: ['preparing', 'created', 'failed'], default: 'preparing', index: true },
  result: {
    documentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    storedDocumentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    versionId: { type: String, default: null, maxlength: 200 },
    title: { type: String, default: '', maxlength: 250 },
    filename: { type: String, default: '', maxlength: 500 },
    editor: { type: String, default: 'kheops', maxlength: 80 },
  },
  lastError: {
    code: { type: String, default: null, maxlength: 120 },
    at: { type: Date, default: null },
  },
}, { timestamps: true, minimize: false });

ContactLetterOperationSchema.index({ tenantId: 1, userId: 1, idempotencyKey: 1 }, { unique: true });

module.exports = mongoose.models.ContactLetterOperation
  || mongoose.model('ContactLetterOperation', ContactLetterOperationSchema);
