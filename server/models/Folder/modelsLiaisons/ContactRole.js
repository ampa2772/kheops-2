const mongoose = require('mongoose');

const ContactRoleSchema = mongoose.Schema({
  contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  contactLie: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  partie: { type: mongoose.Schema.Types.ObjectId, ref: 'Partie' },
});

module.exports = mongoose.model('ContactRole', ContactRoleSchema);

