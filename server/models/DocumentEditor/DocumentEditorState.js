const mongoose = require('mongoose');

const CompatibilitySchema = new mongoose.Schema({
  level: {
    type: String,
    enum: ['complete', 'partial', 'complex', 'native'],
    default: 'native',
  },
  label: { type: String, default: 'Document Kheops' },
  warnings: { type: [String], default: [] },
  analyzedAt: { type: Date, default: null },
}, { _id: false });

const OriginalSchema = new mongoose.Schema({
  ref: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentEditorOriginal', default: null },
  checksum: { type: String, default: null },
  filename: { type: String, default: null },
  mime: { type: String, default: null },
  importedAt: { type: Date, default: null },
}, { _id: false });

const CanonicalSchema = new mongoose.Schema({
  checksum: { type: String, default: null },
  historyVersionId: { type: String, default: null },
  source: { type: String, default: null },
  syncedAt: { type: Date, default: null },
  pending: { type: Boolean, default: false },
}, { _id: false });

const FileFormatSchema = new mongoose.Schema({
  kind: { type: String, enum: ['docx', 'text'], default: 'docx' },
  filename: { type: String, default: null, maxlength: 240 },
  mime: { type: String, default: null, maxlength: 180 },
  encoding: {
    type: String,
    enum: ['utf8', 'utf16le', 'utf16be', 'windows-1252', null],
    default: null,
  },
  bom: { type: Boolean, default: false },
  lineEnding: { type: String, enum: ['lf', 'crlf', 'cr', null], default: null },
  mixedLineEndings: { type: Boolean, default: false },
  finalNewline: { type: Boolean, default: false },
}, { _id: false });

const DocumentEditorStateSchema = new mongoose.Schema({
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
  structuredDocument: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  revision: {
    type: Number,
    min: 0,
    default: 0,
  },
  status: {
    type: String,
    enum: [
      'draft',
      'review',
      'corrections_requested',
      'approved', // valeur historique conservée pour compatibilité
      'validated',
      'ready_to_send',
      'sent',
      'signed',
      'archived',
    ],
    default: 'draft',
  },
  documentType: { type: String, default: 'generic', trim: true, lowercase: true, maxlength: 80 },
  templateBinding: {
    templateKey: { type: String, default: null },
    version: { type: Number, default: null },
    appliedAt: { type: Date, default: null },
    appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  localOverrides: {
    layout: { type: Boolean, default: false },
    header: { type: Boolean, default: false },
    footer: { type: Boolean, default: false },
    signature: { type: Boolean, default: false },
    styles: { type: Boolean, default: false },
  },
  compatibility: {
    type: CompatibilitySchema,
    default: () => ({ level: 'native', label: 'Document Kheops', warnings: [] }),
  },
  original: {
    type: OriginalSchema,
    default: () => ({}),
  },
  canonical: {
    type: CanonicalSchema,
    default: () => ({ pending: false }),
  },
  fileFormat: {
    type: FileFormatSchema,
    default: () => ({ kind: 'docx' }),
  },
  lastSavedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  lastSavedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
  minimize: false,
});

DocumentEditorStateSchema.index({ tenantId: 1, documentId: 1 }, { unique: true });

module.exports = mongoose.model('DocumentEditorState', DocumentEditorStateSchema);
