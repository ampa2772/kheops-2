const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserContactPMPubliqueSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User', // Assurez-vous que ceci correspond à votre modèle d'utilisateur
    required: true
  },
  contactPMPublique: {
    type: Schema.Types.ObjectId,
    ref: 'ContactPMPublique', // Remplacez ceci par le nom exact de votre modèle ContactPMPublique
    required: true
  },
  // Vous pouvez ajouter ici d'autres champs si nécessaire pour décrire la relation
  // Par exemple, un champ pour un rôle spécifique ou une date de création
});

module.exports = mongoose.model("UserContactPMPublique", UserContactPMPubliqueSchema);

