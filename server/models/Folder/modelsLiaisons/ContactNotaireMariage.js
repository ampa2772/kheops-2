const mongoose = require('mongoose');

const ContactNotaireMariageSchema = new mongoose.Schema({
  contact: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
  },
  detailMariage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DetailMariage',
  },
  notary: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
  },
});

module.exports = mongoose.model('ContactNotaireMariage', ContactNotaireMariageSchema);

