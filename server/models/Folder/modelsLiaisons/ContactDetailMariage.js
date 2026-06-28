const mongoose = require('mongoose');

const ContactDetailMariageSchema = new mongoose.Schema({
  contact: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact'
  },
  detailMariage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DetailMariage'
  }
});

module.exports = mongoose.model('ContactDetailMariage', ContactDetailMariageSchema);
