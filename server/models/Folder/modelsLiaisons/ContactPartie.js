const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ContactPartieSchema = new Schema({
  contact: {
    type: Schema.Types.ObjectId,
    ref: 'Contact',
    required: true
  },
  partie: {
    type: Schema.Types.ObjectId,
    ref: 'Partie',
    required: true
  }
});

module.exports = mongoose.model("ContactPartie", ContactPartieSchema);
