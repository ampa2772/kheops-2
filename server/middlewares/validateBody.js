// server/middlewares/validateBody.js
//
// Middleware de validation des bodies HTTP via Joi (S26 chantier #18b).
//
// Defense en profondeur en complement de :
//   - mongoSanitize (deja en place, server/index.js) qui strip les operateurs
//     Mongo ($ne, $gt, ...) au niveau requete brute.
//   - validations metier inline existantes dans les routes.
//
// Avantages d'un schema Joi :
//   - declaratif et auto-documente
//   - types stricts (string, number, enum)
//   - rejet du body si champ obligatoire manquant ou type incorrect
//   - `stripUnknown: true` retire les champs inattendus (defense contre les
//     ajouts non documentes type `isAdmin: true` injecte par un client tordu)
//
// Usage :
//   const validateBody = require('../middlewares/validateBody');
//   const { registerSchema } = require('../validation/authSchemas');
//
//   router.post('/register', registerLimiter, validateBody(registerSchema), handler);
//
// En cas d'invalidite : reponse 400 JSON
//   { message: "Donnees invalides.", errors: [ { path: 'email', message: '...' }, ... ] }
//
// IMPORTANT : ne PAS retirer les validations metier inline existantes — la
// chaine devient « rate-limiter -> Joi -> validations metier -> handler ».
// La redondance partielle est volontaire (defense en profondeur).

'use strict';

/**
 * Construit un middleware Express qui valide req.body contre un schema Joi.
 *
 * @param {Joi.ObjectSchema} schema schema Joi (typiquement un Joi.object(...))
 * @param {object} [options] options Joi de validation
 * @param {boolean} [options.stripUnknown=true] retire les champs non declares
 * @param {boolean} [options.abortEarly=false] retourne TOUTES les erreurs
 * @returns {Function} middleware Express (req, res, next)
 */
function validateBody(schema, options = {}) {
  if (!schema || typeof schema.validate !== 'function') {
    throw new TypeError('validateBody: schema doit etre un Joi schema.');
  }
  const joiOptions = {
    abortEarly: options.abortEarly === true ? true : false,
    stripUnknown: options.stripUnknown === false ? false : true,
    convert: true, // coerce strings en types attendus (number, boolean) si possible
  };

  return function validateBodyMiddleware(req, res, next) {
    const { value, error } = schema.validate(req.body, joiOptions);
    if (error) {
      const details = (error.details || []).map((d) => ({
        path: d.path ? d.path.join('.') : null,
        message: d.message,
        type: d.type,
      }));
      // Log la tentative d'envoi de body invalide pour pouvoir tracer
      // les attaques ou les bugs frontend
      console.warn(
        `[validateBody] ${req.method} ${req.originalUrl} - body invalide :`,
        details.map((d) => `${d.path}: ${d.message}`).join(' | ')
      );
      return res.status(400).json({
        message: 'Donnees invalides.',
        errors: details,
      });
    }
    // Body sanitize, remplacer req.body par la version validee + nettoyee
    req.body = value;
    next();
  };
}

module.exports = validateBody;
