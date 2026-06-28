const mongoose = require("mongoose");

const EmailVerificationTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "User",
  },
  token: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400, // 24 heures en secondes
  },
});


module.exports = mongoose.model(
  "EmailVerificationToken",
  EmailVerificationTokenSchema
);

