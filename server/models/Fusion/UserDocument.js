// server/models/Fusion/UserDocument.js

const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const userDocumentSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: "User", // Assurez-vous que c'est le modèle de votre utilisateur
    required: true,
  },
  document: {
    type: Schema.Types.ObjectId,
    ref: "FusionDocument", 
    required: true,
  },
  // Vous pouvez ajouter d'autres champs, par ex. date de liaison, droits d'accès, etc.
});

module.exports = mongoose.model("UserDocument", userDocumentSchema);
