// UserContact.js

const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserContactSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User', // or 'OfficeUser', depending on your User model
    required: true
  },
  contact: {
    type: Schema.Types.ObjectId,
    ref: 'Contact',
    required: true
  },
  // Add more fields here if necessary to describe the relationship
});

module.exports = mongoose.model("UserContact", UserContactSchema);
