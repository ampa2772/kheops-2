const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema({
  // Champs pouvant appartenir à la personne physique ou morale
  nom: String,
  prenoms: String,
  email: String,
  telephone: String,
  adresse: String,
  ville: String,
  codePostal: String,
  type: {
    type: String,
    required: true
  },
  genre: {
    type: String,
    enum: ['Masculin', 'Feminin', 'Féminin', 'Autre']
  },

  appellationCourrier: {
    type: String,
    required: false
  },

  // Champs spécifiques à la personne physique
  nom_de_naissance: String,
  dateNaissance: Date,
  nationalite: String,
  profession: String,
  secu: String,
  CP_VilleNaissance: String,
  maritalStatus: String,
  paysNaissance: String,
  villeNaissance: String,
  pro_contact: {
    type: Boolean,
    default: false
  },

  // Champ pour déterminer le type de contact
  contactType: {
    type: String,
    required: true,
    enum: ['physique', 'morale']
  },

  // NOUVEAU : Distinction Rôle vs Nature
  roleFonctionnel: {
    type: String,
    enum: ["Client_Partie", "Professionnel_Tiers"],
    default: "Client_Partie"
  }
});

module.exports = mongoose.model('contact', ContactSchema);


