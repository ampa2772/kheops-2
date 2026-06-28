// server/validation/mailSchemas.js
//
// Schemas Joi pour les routes mail (S26 chantier #18b reliquat).
//
// Couvre : POST /send-email (envoi avec PJ optionnelle).
//
// Note : la route /send-email utilise multer (upload.single('attachment')),
// donc req.body est parse PUIS req.file est attache separement. Joi valide
// req.body normalement, sans toucher au file.
//
// Les protections inline (path traversal sur docId/nomDocument/subfolderName
// via path.basename() + verification de root) restent en place — Joi est
// une garde supplementaire.

'use strict';

const Joi = require('joi');

const objectIdField = Joi.string()
  .trim()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({
    'string.pattern.base': 'ID invalide (ObjectId hex 24 caracteres attendu).',
  });

// Liste destinataires : la route accepte une chaine separee par , ou espaces.
// Joi ne sait pas valider "a@b.co, c@d.fr" comme liste d'emails directement,
// donc on accepte une string non-vide (la route fait le split + filter).
// Limite : 5000 chars pour eviter les bodies geants.
const recipientsField = Joi.string()
  .trim()
  .min(3) // au moins "a@b" pour passer le filter de la route
  .max(5000)
  .required()
  .messages({
    'string.empty': 'Destinataire(s) requis.',
    'any.required': 'Destinataire(s) requis.',
  });

const sendEmailSchema = Joi.object({
  to: recipientsField,
  cc: Joi.string().allow('').max(5000).optional(),
  bcc: Joi.string().allow('').max(5000).optional(),
  subject: Joi.string().allow('').max(500).default(''),
  body: Joi.string()
    .min(1)
    .max(1024 * 1024) // 1 Mo de corps (raisonnable, on n'envoie pas un livre)
    .required()
    .messages({
      'string.empty': 'Le corps du message est requis.',
      'string.max': 'Le corps du message est trop long (max 1 Mo).',
      'any.required': 'Le corps du message est requis.',
    }),
  docId: objectIdField.optional().allow('', null),
  nomDocument: Joi.string().allow('').max(500).optional(),
  subfolderName: Joi.string().allow('').max(500).optional(),
});

module.exports = {
  sendEmailSchema,
};
