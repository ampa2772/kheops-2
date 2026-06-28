const mongoose = require('mongoose');

const ContactContactDirectSchema = new mongoose.Schema({
  contactPM: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ContactPM',
    required: true
  },
  contactDirect: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ContactDirect',
    required: true
  }
});

module.exports = mongoose.model('ContactContactDirect', ContactContactDirectSchema);


