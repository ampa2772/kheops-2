// Kheops_2/server/models/AgendaEvents/DossierEventLink.js
const mongoose = require('mongoose');

const DossierEventLinkSchema = new mongoose.Schema({
  dossier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dossier', // Référence au modèle Dossier principal
    required: true,
    index: true, // Utile pour les recherches par dossier
  },
  agendaEvent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AgendaEvent', // Référence au nouveau modèle AgendaEvent
    required: true,
    index: true, // Utile pour les recherches par événement
  },
  // Optionnel: Date de création de la liaison elle-même
  linkedAt: {
    type: Date,
    default: Date.now,
  },
  // Optionnel: Qui a créé la liaison
  linkedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }
});

// Créer un index composé pour éviter les doublons (un événement ne peut être lié qu'une fois au même dossier)
DossierEventLinkSchema.index({ dossier: 1, agendaEvent: 1 }, { unique: true });

module.exports = mongoose.model('DossierEventLink', DossierEventLinkSchema);