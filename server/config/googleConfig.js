// Kheops_2/server/config/googleConfig.js
// Utilise google-auth-library (léger, ~850 Ko) au lieu de googleapis (123 Mo)
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

// Vérification de la présence des variables d'environnement nécessaires
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALLBACK_URL) {
  console.error("[GoogleConfig] ERREUR CRITIQUE: Variables d'environnement Google manquantes (CLIENT_ID, SECRET ou CALLBACK_URL).");
}

const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_CALLBACK_URL
);

module.exports = {
  oauth2Client
};
