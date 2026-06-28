const mongoose = require('mongoose');

const PartieSchema = mongoose.Schema({
  type: String,
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
});

module.exports = mongoose.model('Partie', PartieSchema);
