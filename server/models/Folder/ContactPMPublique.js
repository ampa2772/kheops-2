// Dans ContactPMPublique.js

const mongoose = require('mongoose');

const ContactPMPubliqueSchema = new mongoose.Schema({
  denomination: { type: String, default: '' },
  adresse: { type: String, default: '' },
  ville: { type: String, default: '' },
  codePostal: { type: String, default: '' },
  siteWeb: { type: String, default: '' },
  email: { type: String, default: '' },
  contactNom: { type: String, default: '' },
  contactPrenom: { type: String, default: '' },
  genre: { type: String, default: 'Masculin', enum: ['Masculin', 'Feminin'] },
  appellationCourrierMasculin: { type: String, default: '' },
  appellationCourrierFeminin: { type: String, default: '' },
  contactTelephone: { type: String, default: '' },
  contactEmail: { type: String, default: '' },
  contactFonction: { type: String, default: '' },

  // NOUVEAU : Distinction Rôle vs Nature
  roleFonctionnel: {
    type: String,
    enum: ["Client_Partie", "Professionnel_Tiers"],
    default: "Client_Partie"
  },

  // NOUVEAU : Simplification (Appellation)
  profession: String,
  appellationCourrier: String,

  // NOUVEAU : Interlocuteur Principal (Intégré)
  interlocuteurNom: String,
  interlocuteurPrenom: String,
  interlocuteurFonction: String,
  interlocuteurEmail: String,
  interlocuteurTelephone: String,
  estRepresentantLegal: {
    type: Boolean,
    default: false
  }
});

module.exports = mongoose.model('ContactPMPublique', ContactPMPubliqueSchema);



