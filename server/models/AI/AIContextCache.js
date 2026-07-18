const mongoose = require('mongoose');

const AnchorSchema = new mongoose.Schema({
  page: { type: Number, default: null },
  paragraph: { type: Number, default: null },
  blockId: { type: String, default: null },
  start: { type: Number, default: null },
  end: { type: Number, default: null },
}, { _id: false });

const AIContextCacheSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  matterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
  documentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  versionId: { type: String, required: true },
  checksum: { type: String, required: true },
  extractorVersion: { type: String, required: true },
  mime: { type: String, default: null },
  filename: { type: String, required: true },
  text: { type: String, required: true, select: false },
  segments: { type: [{ text: String, anchor: AnchorSchema }], default: [], select: false },
  extractionWarning: { type: String, default: null },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

AIContextCacheSchema.index(
  { tenantId: 1, matterId: 1, documentId: 1, versionId: 1, extractorVersion: 1 },
  { unique: true },
);
AIContextCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.AIContextCache || mongoose.model('AIContextCache', AIContextCacheSchema);
