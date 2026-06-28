const mongoose = require('mongoose');

const RepresentantLegalSchema = new mongoose.Schema({
  representantLegalNom: {
    type: String,
  },
  representantLegalPrenom: {
    type: String,
  },
  representantLegalEmail: {
    type: String,
  },
  representantLegalTelephone: {
    type: String,
  },
  representantLegalGenre: {
    type: String,   
  },
  appellationCourrier: {
    type: String,
  },

});

module.exports = mongoose.model('RepresentantLegal', RepresentantLegalSchema);



