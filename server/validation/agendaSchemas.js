// server/validation/agendaSchemas.js
//
// Schemas Joi pour les routes d'agenda (S26 chantier #18b reliquat).
//
// Couvre : POST /events (create) et PUT /events/:eventId (update).
//
// Les validations metier inline existantes dans agendaRoutes.js continuent
// de tourner (ex: cohérence dates start/end, lookup dossier) — Joi ne fait
// qu'ajouter une garde structurelle.

'use strict';

const Joi = require('joi');

// ObjectId Mongo : 24 chars hex
const objectIdField = Joi.string()
  .trim()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({
    'string.pattern.base': 'ID invalide (ObjectId hex 24 caracteres attendu).',
  });

// Type d'evenement : 'event' (defaut) ou 'task'
const typeField = Joi.string()
  .valid('event', 'task')
  .default('event')
  .messages({
    'any.only': "Type invalide (doit etre 'event' ou 'task').",
  });

// Date ISO : Joi.date() accepte string ISO et timestamps
const dateField = Joi.date().iso();

// Schema commun pour create + update events
// Note : la validation metier (start avant end, deadline si task) reste
// dans la route, Joi se concentre sur le typage/sanitization.
const eventBaseSchema = {
  title: Joi.string()
    .trim()
    .min(1)
    .max(500)
    .required()
    .messages({
      'string.empty': 'Le titre est requis.',
      'string.max': 'Le titre est trop long (max 500 caracteres).',
      'any.required': 'Le titre est requis.',
    }),
  startDate: dateField.optional().allow(null, ''),
  endDate: dateField.optional().allow(null, ''),
  deadline: dateField.optional().allow(null, ''),
  description: Joi.string().allow('').max(10000).default(''),
  dossierId: objectIdField.optional().allow(null, ''),
  type: typeField,
};

const createEventSchema = Joi.object(eventBaseSchema);

// Update : tous les champs deviennent optionnels (patch partiel)
const updateEventSchema = Joi.object({
  title: Joi.string().trim().min(1).max(500).optional(),
  startDate: dateField.optional().allow(null, ''),
  endDate: dateField.optional().allow(null, ''),
  deadline: dateField.optional().allow(null, ''),
  description: Joi.string().allow('').max(10000).optional(),
  dossierId: objectIdField.optional().allow(null, ''),
  type: Joi.string().valid('event', 'task').optional(),
});

module.exports = {
  createEventSchema,
  updateEventSchema,
};
