const mongoose = require('mongoose');

const ContactPMSchema = new mongoose.Schema({
  raisonSociale: String,
  siret: String,
  formeJuridique: String,
  adresseSiegeSocial: String,
  telephoneEntreprise: String,
  emailEntreprise: String,
  siteWeb: String,
  secteurActivite: String,
  dateCreationEntreprise: Date,
  capitalSocial: String,
  representantLegalNom: String,
  representantLegalFonction: String,
  associesActionnaires: String,
  contactDirectNom: String,
  tvaIntracommunautaire: String,
  filiales: String,
  historiqueModifications: String,
  documentsJuridiques: String,
  proceduresJudiciairesEnCours: String,
  numeroRCS: String,
  codePostalPM: String,
  NAF_APE: String,
  villePM: String,
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

module.exports = mongoose.model('ContactPM', ContactPMSchema);

