// server/validation/authSchemas.js
//
// Schemas Joi pour les routes d'authentification (S26 chantier #18b).
//
// Couvre : register, login, forgot-password (request-code, verify-code,
// reset-password-with-code).
//
// Politique mot de passe coherente avec validatePasswordStrength dans
// auth.js : >= 10 caracteres, >= 1 lettre, >= 1 chiffre.

'use strict';

const Joi = require('joi');

// Email : regex simple mais robuste. Joi a un .email() integre, on l'utilise
// avec les TLD obligatoires.
const emailField = Joi.string()
  .trim()
  .lowercase()
  .email({ minDomainSegments: 2, tlds: { allow: true } })
  .max(254) // limite RFC 5321
  .required()
  .messages({
    'string.email': 'Email invalide.',
    'string.empty': 'Email requis.',
    'any.required': 'Email requis.',
  });

// Mot de passe : politique rc37 (>= 10 chars, >= 1 lettre, >= 1 chiffre).
const passwordField = Joi.string()
  .min(10)
  .max(200) // limite raisonnable pour eviter le DoS bcrypt
  .pattern(/[a-zA-Z]/, 'au moins une lettre')
  .pattern(/[0-9]/, 'au moins un chiffre')
  .required()
  .messages({
    'string.min': 'Le mot de passe doit faire au moins 10 caracteres.',
    'string.max': 'Le mot de passe est trop long (max 200 caracteres).',
    'string.empty': 'Mot de passe requis.',
    'any.required': 'Mot de passe requis.',
    'string.pattern.name': 'Le mot de passe doit contenir {#name}.',
  });

// Genre : enum existant cote modele User (voir handlers register)
const genreField = Joi.string()
  .valid('Masculin', 'Feminin', 'Autre')
  .required()
  .messages({
    'any.only': 'Genre invalide.',
    'string.empty': 'Genre requis.',
    'any.required': 'Genre requis.',
  });

// Champs adresse : non-vides, longueur raisonnable
function shortTextField(label, max = 100) {
  return Joi.string()
    .trim()
    .min(1)
    .max(max)
    .required()
    .messages({
      'string.empty': `${label} requis.`,
      'string.max': `${label} trop long (max ${max} caracteres).`,
      'any.required': `${label} requis.`,
    });
}

const registerSchema = Joi.object({
  email: emailField,
  password: passwordField,
  firstName: shortTextField('Prenom', 60),
  lastName: shortTextField('Nom', 60),
  address: shortTextField('Adresse', 200),
  city: shortTextField('Ville', 80),
  postalCode: Joi.string()
    .trim()
    .pattern(/^[0-9A-Za-z\- ]{3,12}$/)
    .required()
    .messages({
      'string.pattern.base': 'Code postal invalide.',
      'string.empty': 'Code postal requis.',
      'any.required': 'Code postal requis.',
    }),
  genre: genreField,
  // AUTH-002 : champs optionnels (rétrocompat — les clients existants ne les
  // envoient pas). cabinetName = nom du cabinet (Tenant) ; role = rôle applicatif.
  cabinetName: Joi.string().trim().max(120).allow('', null).optional(),
  role: Joi.string().valid('avocat', 'collaborateur', 'secretaire', 'admin').optional(),
});

const loginSchema = Joi.object({
  email: emailField,
  // Login accepte les vieux mots de passe meme s'ils ne respectent plus la
  // politique courante (un user pre-rc37 garde son acces). Donc on ne
  // re-valide PAS la politique, juste la presence.
  password: Joi.string()
    .min(1)
    .max(200)
    .required()
    .messages({
      'string.empty': 'Mot de passe requis.',
      'any.required': 'Mot de passe requis.',
    }),
});

// Forgot password - demande d'un code
const requestCodeSchema = Joi.object({
  email: emailField,
});

// Forgot password - verification du code
const verifyCodeSchema = Joi.object({
  email: emailField,
  code: Joi.string()
    .trim()
    .pattern(/^[0-9]{6}$/)
    .required()
    .messages({
      'string.pattern.base': 'Code invalide (6 chiffres requis).',
      'any.required': 'Code requis.',
    }),
});

// Forgot password - reinitialisation avec resetToken JWT obtenu apres
// verification du code (matche auth.js:867 `/forgot-password/set-new-password`)
const setNewPasswordSchema = Joi.object({
  resetToken: Joi.string()
    .trim()
    .min(20) // un JWT fait au moins quelques dizaines de chars
    .max(2000)
    .required()
    .messages({
      'string.empty': 'Token requis.',
      'any.required': 'Token requis.',
    }),
  newPassword: passwordField,
});

module.exports = {
  registerSchema,
  loginSchema,
  requestCodeSchema,
  verifyCodeSchema,
  setNewPasswordSchema,
};
