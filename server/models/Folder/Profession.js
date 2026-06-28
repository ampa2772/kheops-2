const mongoose = require('mongoose');

const professionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
});

professionSchema.index({ name: 1 });

module.exports = mongoose.model('Profession', professionSchema);
