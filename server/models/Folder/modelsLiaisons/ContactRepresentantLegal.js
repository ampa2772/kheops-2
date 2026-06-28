const mongoose = require('mongoose');

const ContactRepresentantLegalSchema = new mongoose.Schema({
  contactPM: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ContactPM',
    required: true
  },
  representantLegal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RepresentantLegal',
    required: true
  }
});

module.exports = mongoose.model('ContactRepresentantLegal', ContactRepresentantLegalSchema);

