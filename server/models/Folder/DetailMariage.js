const mongoose = require('mongoose');

const DetailMariageSchema = new mongoose.Schema({
  marriageLocation: {
    type: String
  },
  marriageDate: {
    type: Date
  },
  contractDate: {
    type: Date
  },
  notaryName: {
    type: String
  },

  regime_matrimonial: {
    type: String
  },
  contratMariage: {
    type: Boolean
  }

});

module.exports = mongoose.model('DetailMariage', DetailMariageSchema);
