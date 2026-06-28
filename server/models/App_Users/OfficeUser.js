const mongoose = require('mongoose');

const OfficeUserSchema = new mongoose.Schema({

  prenomOfficeUser: {
    type: String,
    required: true,
  },
  nomOfficeUser: {
    type: String,
    required: true,
  },
  genre: {   // ajout du champ genre
    type: String,
    required: true,
  },
  roleOfficeUser:{
    type: String,
    required: true,
  },
  mainOfficeUser: {
    type: Boolean,
    default: false,
  },
  isAvocat: {
    type: Boolean,
    default: false,
  }
});


module.exports = mongoose.model('OfficeUser', OfficeUserSchema);

