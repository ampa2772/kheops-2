const mongoose = require('mongoose');

const PersonneChargeSchema = new mongoose.Schema({
  nom: {
    type: String
  },
  prenoms: {
    type: String
  },
  dateNaissance: {
    type: Date
  },
  nationalite: {
    type: String
  },
  adresse: {
    type: String
  },
  ville: {
    type: String
  },
  codePostal: {
    type: String
  },
  paysNaissance: {
    type: String
  },
  villeNaissance: {
    type: String
  },
  email: {
    type: String
  },
  telephone: {
    type: String
  },
  maritalStatus: {
    type: String
  },
  type: {
    type: String,
    default: 'enfant'
  },
  codePostalNaissance: {
    type: String
  },
  genre: {
    type: String,
    default: 'Masculin'
  },
  profession: {
    type: String
  },
  numeroSecu: {
    type: String
  }
});

module.exports = mongoose.model('PersonneCharge', PersonneChargeSchema);

