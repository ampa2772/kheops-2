const mongoose = require('mongoose');

/**
 * Schéma pour les documents générés par les utilisateurs.
 * C'est l'enregistrement central pour chaque document créé dans l'application.
 */
const JsonDocumentSchema = new mongoose.Schema({
  // Nom du document, visible par l'utilisateur (ex: "Assignation DUPONT c/ DURAND")
  name: {
    type: String,
    required: [true, "Le nom du document est requis."],
    trim: true
  },
  // Le contenu JSON complet du document, incluant texte et formatage,
  // stocké sous forme de chaîne chiffrée.
  encryptedContent: {
    type: String,
    required: [true, "Le contenu chiffré du document est requis."]
  },
  // Référence au dossier parent auquel ce document appartient.
  dossierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dossier',
    required: true,
    index: true // Index pour accélérer les recherches de documents par dossier.
  },
  // Référence à l'utilisateur propriétaire ou créateur du document.
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  }
}, {
  timestamps: true // Ajoute createdAt et updatedAt automatiquement
});

module.exports = mongoose.model('JsonDocument', JsonDocumentSchema);