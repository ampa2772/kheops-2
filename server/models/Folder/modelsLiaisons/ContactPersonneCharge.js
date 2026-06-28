const mongoose = require('mongoose');

const ContactPersonneChargeSchema = new mongoose.Schema({
  contact: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    required: true
  },
  personneCharge: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PersonneCharge',
    required: true
  }
});

module.exports = mongoose.model('ContactPersonneCharge', ContactPersonneChargeSchema);
