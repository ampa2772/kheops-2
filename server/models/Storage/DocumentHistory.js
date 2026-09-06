const mongoose = require('mongoose');

const DocumentHistoryVersionSchema = new mongoose.Schema({
  versionId: { type: String, required: true },
  storageKey: { type: String, required: true },
  checksum: { type: String, required: true },
  size: { type: Number, required: true, min: 0 },
  mime: { type: String, default: 'application/octet-stream' },
  filename: { type: String, default: 'document' },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  editor: {
    type: String,
    enum: ['kheops', 'collabora', 'word_desktop', 'word_web', 'google_docs', 'upload', 'system'],
    default: 'system',
  },
  origin: { type: String, default: 'kheops' },
  comment: { type: String, default: '', maxlength: 1000 },
  status: {
    type: String,
    enum: ['draft', 'review', 'corrections_requested', 'approved', 'validated', 'ready_to_send', 'sent', 'signed', 'archived', 'conflict'],
    default: 'draft',
  },
  baseVersionId: { type: String, default: null },
  conflictWithVersionId: { type: String, default: null },
  structuredStorageKey: { type: String, default: null },
  structuredChecksum: { type: String, default: null },
  // Compatibilité des premières versions. Les nouveaux modèles structurés sont
  // stockés hors du tableau Mongo pour ne jamais approcher la limite de 16 Mo.
  structuredDocument: { type: mongoose.Schema.Types.Mixed, default: null },
  restoredFromVersionId: { type: String, default: null },
  operationKey: { type: String, default: null, maxlength: 180 },
  syncProjectionPending: { type:Boolean, default:false },
}, { _id: false });

const DocumentHistorySchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  dossierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
  documentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  originalVersionId: { type: String, default: null },
  currentVersionId: { type: String, default: null },
  versions: { type: [DocumentHistoryVersionSchema], default: [] },
  syncProjectionLease: { token:{type:String,default:null},expiresAt:{type:Date,default:null} },
  syncProjectionNextAt: { type:Date,default:null },
  syncProjectionError: { type:String,default:'' },
}, { timestamps: true, optimisticConcurrency: true });

DocumentHistorySchema.index({ tenantId: 1, documentId: 1 }, { unique: true });
DocumentHistorySchema.index({'versions.syncProjectionPending':1,syncProjectionNextAt:1});

module.exports = mongoose.model('DocumentHistory', DocumentHistorySchema);
