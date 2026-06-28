const mongoose = require('mongoose');

const ContactDirectSchema = new mongoose.Schema({
  contactDirectNom: {
    type: String,    
  },
  contactDirectPrenom: {
    type: String,    
  },
  contactDirectEmail: {
    type: String,    
  },
  contactDirectTelephone: {
    type: String,    
  },
  contactDirectGenre: {
    type: String,    
  },
  appellationCourrier: {
    type: String,    
  },
  nom_Complet: {
    type: String,    
  }
});

module.exports = mongoose.model('ContactDirect', ContactDirectSchema);





