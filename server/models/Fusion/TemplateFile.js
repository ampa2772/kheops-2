// server/models/Fusion/TemplateFile.js

const mongoose = require("mongoose");
const { Schema } = mongoose;

const templateFileSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  categorie: {
    type: String,
    default: 'allDos',
  },
});

module.exports = mongoose.model("TemplateFile", templateFileSchema);
