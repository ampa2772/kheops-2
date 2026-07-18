const mongoose = require('mongoose');

const CommentAnchorSchema = new mongoose.Schema({
  blockId: { type: String, default: null, maxlength: 120 },
  start: { type: Number, default: null, min: 0 },
  end: { type: Number, default: null, min: 0 },
  quote: { type: String, default: '', maxlength: 1000 },
}, { _id: false });

const DocumentEditorCommentSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  documentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  dossierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentEditorComment', default: null },
  body: { type: String, required: true, trim: true, maxlength: 5000 },
  anchor: { type: CommentAnchorSchema, default: () => ({}) },
  mentions: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
  status: { type: String, enum: ['open', 'resolved'], default: 'open', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolvedAt: { type: Date, default: null },
}, { timestamps: true });

DocumentEditorCommentSchema.index({ tenantId: 1, documentId: 1, createdAt: 1 });

module.exports = mongoose.model('DocumentEditorComment', DocumentEditorCommentSchema);
