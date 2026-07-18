const mongoose = require('mongoose');

const ExternalEditSessionSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  dossierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
  documentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  provider: { type: String, enum: ['onedrive', 'google_drive'], required: true },
  editor: { type: String, enum: ['word_web', 'google_docs'], required: true },
  remoteId: { type: String, required: true },
  remoteName: { type: String, default: '' },
  openUrl: { type: String, required: true },
  remoteMime: { type: String, default: null },
  remoteModifiedAt: { type: Date, default: null },
  // Le format source est indispensable pour rapatrier une copie Google native
  // dans le bon format. Les anciennes sessions, exclusivement DOCX, gardent le
  // comportement historique grâce aux valeurs par défaut.
  sourceFormat: { type: String, enum: ['docx', 'txt'], default: 'docx' },
  sourceFilename: { type: String, default: '' },
  sourceMime: { type: String, default: null },
  returnFormat: { type: String, enum: ['docx', 'txt'], default: 'docx' },
  baseVersionId: { type: String, default: null },
  lastSyncedVersionId: { type: String, default: null },
  lastSyncedAt: { type: Date, default: null },
  keepRemoteCopy: { type: Boolean, default: true },
  convertedToNative: { type: Boolean, default: false },
  state: {
    type: String,
    enum: ['open', 'synced', 'conflict', 'closed', 'remote_missing'],
    default: 'open',
    index: true,
  },
}, { timestamps: true });

ExternalEditSessionSchema.index({ tenantId: 1, documentId: 1, userId: 1, state: 1 });

module.exports = mongoose.model('ExternalEditSession', ExternalEditSessionSchema);
