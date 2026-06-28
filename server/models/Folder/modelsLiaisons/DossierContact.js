// Nom du fichier : Folder/modelsLiaisons/DossierContact.js

const mongoose = require('mongoose');
const DossierContactSchema = mongoose.Schema({
  dossier: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier' },
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
});

module.exports = mongoose.model('DossierContact', DossierContactSchema);
