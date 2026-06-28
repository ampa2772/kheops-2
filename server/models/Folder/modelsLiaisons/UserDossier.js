// server/models/Folder/modelsLiaisons/UserDossier.js

const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserDossierSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User', // ou 'OfficeUser' en fonction de votre modèle User
    required: true
  },
  dossier: {
    type: Schema.Types.ObjectId,
    ref: 'Dossier',
    required: true
  },
  // Vous pouvez ajouter d'autres champs si nécessaire
});

module.exports = mongoose.model("UserDossier", UserDossierSchema);
