const mongoose = require('mongoose');

const TypeContactSchema = new mongoose.Schema({
  masculin: {
    type: String,
    required: true,
  },
  feminin: {
    type: String,
    required: true, // Ajouté comme nécessaire car il semble être toujours présent dans les données
  },
  appellationCourrierTypeContactMasculin: { // Nom changé pour correspondre aux données
    type: String,
    required: true, // Ajouté comme nécessaire car il semble être toujours présent dans les données
  },
  appellationCourrierTypeContactFeminin: { // Nom changé pour correspondre aux données
    type: String,
    required: true, // Ajouté comme nécessaire car il semble être toujours présent dans les données
  },
  contactTypePro: {
    type: Boolean,
    required: true, // Ajouté comme nécessaire car il semble être toujours présent dans les données
  },
  contactDefault: {
    type: Boolean,
    default: false,
  },
  defaultId: {
    type: Number,
    default: null, // ou 'default: 0', selon la manière dont vous souhaitez gérer les contacts non par défaut
  },
});

module.exports = TypeContact = mongoose.model('typecontact', TypeContactSchema);
