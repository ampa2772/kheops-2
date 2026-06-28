const mongoose = require('mongoose');

const RoleSchema = mongoose.Schema({
  type: String,
});

module.exports = mongoose.model('Role', RoleSchema);
