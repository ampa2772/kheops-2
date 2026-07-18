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
  // Editeur ayant produit cette version. Optionnel pour conserver la
  // compatibilite avec toutes les versions deja enregistrees.
  editor: {
    type: String,
    // `editor` est volontairement optionnel pour les versions historiques et
    // les imports qui ne connaissent pas l'editeur d'origine. Mongoose valide
    // aussi la valeur par defaut : `default: null` doit donc faire partie de
    // l'enum, sinon tout nouveau StoredDocument sans metadata explicite echoue
    // avec "`null` is not a valid enum value" au moment du save().
    enum: [null, 'kheops', 'word_desktop', 'word_web', 'google_docs', 'upload', 'system'],
    default: null,
  },
  // Origine technique/fonctionnelle de la version (import, synchronisation...).
  origin: {
    type: String,
    // Meme compatibilite pour les versions creees avant l'ajout de `origin`.
    enum: [
      null,
      'kheops',
      'word_desktop',
      'word_web',
      'google_drive',
      'onedrive',
      'upload',
      'email',
      'migration',
      'system',
    ],
    default: null,
  },
  comment: {
    type: String,
    default: null,
    trim: true,
    maxlength: 2000,
  },
  status: {
    type: String,
    enum: ['draft', 'review', 'corrections_requested', 'approved', 'validated', 'ready_to_send', 'sent', 'signed', 'archived'],
    default: 'draft',
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
