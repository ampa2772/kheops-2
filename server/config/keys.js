// Kheops_2/server/config/keys.js
require('dotenv').config();

module.exports = {
  mongoURI: process.env.MONGODB_URI,
  secretOrKey: process.env.JWT_SECRET
};