// models/UserOfficeUser.js
const mongoose = require("mongoose");
const autopopulate = require("mongoose-autopopulate");

const UserOfficeUserSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    autopopulate: true,
  },
  officeUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OfficeUser",
    required: true,
    autopopulate: true, // Ajoutez cette ligne pour activer l'autopopulation pour officeUser
  },
});

UserOfficeUserSchema.plugin(autopopulate);

module.exports = mongoose.model("UserOfficeUser", UserOfficeUserSchema);


