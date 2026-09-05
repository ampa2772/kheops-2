// Kheops_2/server/config/keys.js
// Chargeur central (server/.env.development ou .env.test en local, aucun
// fichier en hebergement) : plus jamais server/.env implicitement.
require('./env').loadEnv();

// En test (NODE_ENV=test) aucun fichier n'est requis : un secret propre au
// processus, tire au hasard a chaque demarrage, permet a passport-jwt de
// s'initialiser sans server/.env. Aucun jeton ne peut etre forge contre lui
// (une constante publique le permettrait sur les routes passport.authenticate
// d'un serveur lance en NODE_ENV=test sans JWT_SECRET). Il ne sert qu'a la
// strategie Passport ; les gardes d'hebergement (checkProductionSafety) et la
// signature des jetons lisent process.env.JWT_SECRET directement.
const TEST_ONLY_JWT_SECRET = require('crypto').randomBytes(32).toString('hex');

module.exports = {
  mongoURI: process.env.MONGODB_URI,
  secretOrKey: process.env.JWT_SECRET
    || (process.env.NODE_ENV === 'test' ? TEST_ONLY_JWT_SECRET : undefined),
};