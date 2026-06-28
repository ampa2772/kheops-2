const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserContactPMSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User', // Assurez-vous que c'est le nom correct de votre modèle d'utilisateur
    required: true
  },
  contactPM: {
    type: Schema.Types.ObjectId,
    ref: 'ContactPM', // Assurez-vous que c'est le nom correct de votre modèle de contact personne morale privée
    required: true
  }
});

module.exports = mongoose.model("UserContactPM", UserContactPMSchema);

