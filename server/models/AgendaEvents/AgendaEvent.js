// Kheops_2/server/models/AgendaEvents/AgendaEvent.js
const mongoose = require('mongoose');

// Nouveau code
const AgendaEventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "L'intitulé de l'événement est requis."],
    trim: true,
  },
  // REMPLACÉ: 'date' par 'startDate' et 'endDate'
  startDate: {
    type: Date,
    required: [true, "La date de début de l'événement est requise."],
  },
  endDate: {
    type: Date,
    required: [true, "La date de fin de l'événement est requise."],
  },
  description: { // Champ optionnel pour plus de détails
    type: String,
    trim: true,
    default: '',
  },
  type: { // Ajout pour distinguer "événement" et "tâche"
    type: String,
    enum: ['event', 'task'],
    default: 'event'
  },
  createdBy: { // Qui a créé l'événement (utile pour le partage ou les permissions futures)
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Référence au modèle User de Kheops
    // required: true, // À décommenter si chaque événement doit être lié à un utilisateur créateur
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  dossier: { // Ajout de la liaison directe avec le dossier
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dossier'
  }
  // Vous pourriez ajouter d'autres champs comme :
  // - type: String (ex: 'Réunion', 'Audience', 'Rappel')
  // - color: String (pour affichage dans l'agenda)
  // - allDay: Boolean (si c'est un événement sur toute la journée)
  // - location: String
  // - attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }]
});

// Middleware pour mettre à jour `updatedAt` avant chaque sauvegarde
AgendaEventSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Middleware pour `findOneAndUpdate` et `findByIdAndUpdate` (plus complexe à gérer pour pre-hooks,
// souvent géré au niveau de la logique de la route en ajoutant { new: true, runValidators: true }
// et en mettant à jour manuellement updatedAt dans le $set)

module.exports = mongoose.model('AgendaEvent', AgendaEventSchema);