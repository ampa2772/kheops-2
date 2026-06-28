const mongoose = require('mongoose');

/**
 * Schéma pour les modèles (templates) de documents.
 * Chaque modèle définit une structure JSON de base qui sera utilisée pour
 * générer de nouveaux documents.
 */
const JsonTemplateSchema = new mongoose.Schema({
  // Nom unique et lisible du modèle (ex: "Assignation", "Conclusions Adversaire")
  name: {
    type: String,
    required: [true, "Le nom du modèle est requis."],
    unique: true,
    trim: true
  },
  // La structure JSON du modèle. 'Mixed' permet de stocker un objet JSON flexible.
  // Exemple de structure : { blocks: [{ type: 'paragraph', content: '...', style: {...} }] }
  structure: {
    type: mongoose.Schema.Types.Mixed,
    required: [true, "La structure JSON du modèle est requise."]
  },
  // Métadonnées optionnelles
  description: {
    type: String,
    trim: true
  }
}, {
  timestamps: true // Ajoute createdAt et updatedAt automatiquement
});

module.exports = mongoose.model('JsonTemplate', JsonTemplateSchema);