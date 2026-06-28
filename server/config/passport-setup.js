// Kheops_2/server/config/passport-setup.js
const passport = require('passport');
// Supprimé ou commenté : const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/App_Users/User');
require('dotenv').config();

passport.serializeUser((user, done) => {
    // Utilisé si vous activez les sessions Passport (pour d'autres stratégies ?)
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    // Utilisé si vous activez les sessions Passport (pour d'autres stratégies ?)
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

/* --- SECTION GOOGLE STRATEGY SUPPRIMÉE OU COMMENTÉE ---
passport.use(
    new GoogleStrategy(
        {
            // ... configuration de la stratégie Google ...
        },
        async (accessToken, refreshToken, profile, done) => {
            // ... logique de la stratégie Google ...
        }
    )
);
*/

// Conserver ce fichier si d'autres stratégies Passport sont utilisées ou prévues.
// S'il n'y a AUCUNE autre stratégie Passport, ce fichier pourrait être retiré
// et l'initialisation de Passport dans server/index.js adaptée/supprimée.
// Pour l'instant, on le garde en commentant la partie Google.

module.exports = passport;