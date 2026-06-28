// server/models/Fusion/Document.js

const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema({
  nomDocument: String,
  dateCreation: String,
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contact", 
  },
});

module.exports = mongoose.model("FusionDocument", documentSchema);

