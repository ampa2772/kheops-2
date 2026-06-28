const mongoose = require('mongoose');

const DossierPartieSchema = mongoose.Schema({
  dossier: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier' },
  partie: { type: mongoose.Schema.Types.ObjectId, ref: 'Partie' },
});

module.exports = mongoose.model('DossierPartie', DossierPartieSchema);
