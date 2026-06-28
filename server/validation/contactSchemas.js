// server/validation/contactSchemas.js
//
// Schemas Joi pour les routes de contacts (S27 chantier #18b reliquat).
//
// Couvre :
//   - POST/PUT /contact            (Personne Physique)
//   - POST/PUT /contactPM          (Personne Morale Privee)
//   - POST/PUT /contactPMPublique  (Personne Morale Publique)
//   - POST /check-contact
//   - POST /find-or-create-tribunal
//   - POST /contact/:contactId/personne-charge
//   - PUT  /personne-charge/:pcId
//
// PHILOSOPHIE :
//   Les bodies sont structurellement riches (PP avec options.detailMariage +
//   options.personnesCharge nested, PM avec interlocuteur*, etc.). Pour ne
//   casser AUCUN flux existant, on valide UNIQUEMENT la structure top-level :
//     - presence des cles obligatoires (contact / contactData)
//     - typage object des sous-blocs
//     - .unknown(true) sur les sous-blocs => contenu libre accepte tel quel
//
//   La defense en profondeur est assuree par :
//     - mongoSanitize (deja en place, server/index.js) -> strip $/. operateurs
//     - validations metier inline (folder-middleWare.js validateContactData)
//     - ensureContactOwnership (rc37) -> verifie le lien UserContact*
//
//   Le but ici n'est pas de remplacer ces protections, juste d'ajouter une
//   garde structurelle pour rejeter les bodies manifestement deformes (ex :
//   `contact` envoye comme string au lieu d'objet, payload top-level pollue).

'use strict';

const Joi = require('joi');

// ObjectId Mongo : 24 chars hex
const objectIdField = Joi.string()
  .trim()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({
    'string.pattern.base': 'ID invalide (ObjectId hex 24 caracteres attendu).',
  });

// Email tolerant (peut etre vide ou absent)
const optionalEmail = Joi.string()
  .trim()
  .lowercase()
  .email({ minDomainSegments: 2, tlds: { allow: true } })
  .max(254)
  .allow('', null)
  .optional()
  .messages({
    'string.email': 'Email invalide.',
  });

// Texte optionnel court (peut etre vide)
const optionalShortText = (max) => Joi.string().allow('', null).max(max).optional();

// Bloc generique : objet flexible (accepte n'importe quelle cle dedans).
// Indispensable pour ne pas perdre les champs riches des formulaires PP/PM
// (qui evoluent souvent cote front sans synchroniser un schema serveur).
const flexibleObject = Joi.object().unknown(true);

// ----------------------------------------------------------------------------
// Personne Physique (PP)
// ----------------------------------------------------------------------------

// POST /contact   body = { contact: {...}, options: { contactType, userId,
//                          detailMariage: {...}, personnesCharge: [...] } }
const createContactSchema = Joi.object({
  contact: flexibleObject.required().messages({
    'any.required': "Le champ 'contact' est requis.",
    'object.base': "Le champ 'contact' doit etre un objet.",
  }),
  options: flexibleObject.default({}),
});

// PUT /contact/:id   body = { contact: {...}, options: { personnesCharge: [...] } }
const updateContactSchema = Joi.object({
  contact: flexibleObject.required().messages({
    'any.required': "Le champ 'contact' est requis.",
    'object.base': "Le champ 'contact' doit etre un objet.",
  }),
  options: flexibleObject.default({}),
});

// ----------------------------------------------------------------------------
// Personne Morale Privee (PM)
// ----------------------------------------------------------------------------

// POST /contactPM   body = { contact: {...}, user: {...} }
const createContactPMSchema = Joi.object({
  contact: flexibleObject.required().messages({
    'any.required': "Le champ 'contact' est requis.",
    'object.base': "Le champ 'contact' doit etre un objet.",
  }),
  // 'user' du body est ignore cote route (req.user prime) mais on accepte
  // sa presence pour ne pas casser les clients qui l'envoient.
  user: flexibleObject.optional(),
});

// PUT /contactPM/:id   body = { contact: {...} }
const updateContactPMSchema = Joi.object({
  contact: flexibleObject.required().messages({
    'any.required': "Le champ 'contact' est requis.",
    'object.base': "Le champ 'contact' doit etre un objet.",
  }),
});

// ----------------------------------------------------------------------------
// Personne Morale Publique (PMPub)
// ----------------------------------------------------------------------------

// POST /contactPMPublique   body = { contactData: {...}, user: {...} }
const createContactPMPubliqueSchema = Joi.object({
  contactData: flexibleObject.required().messages({
    'any.required': "Le champ 'contactData' est requis.",
    'object.base': "Le champ 'contactData' doit etre un objet.",
  }),
  user: flexibleObject.optional(),
});

// PUT /contactPMPublique/:id   body = { contactData: {...} }
const updateContactPMPubliqueSchema = Joi.object({
  contactData: flexibleObject.required().messages({
    'any.required': "Le champ 'contactData' est requis.",
    'object.base': "Le champ 'contactData' doit etre un objet.",
  }),
});

// ----------------------------------------------------------------------------
// Verification d'existence d'un contact
// ----------------------------------------------------------------------------

// POST /check-contact   body = { nom, email, dateNaissance }
const checkContactSchema = Joi.object({
  nom: optionalShortText(200),
  email: optionalEmail,
  dateNaissance: Joi.alternatives()
    .try(Joi.date(), Joi.string().allow('', null))
    .optional(),
}).unknown(true);

// ----------------------------------------------------------------------------
// Find-or-create tribunal (cree un ContactPMPublique a partir des champs
// fournis par l'API publique des tribunaux)
// ----------------------------------------------------------------------------

// POST /find-or-create-tribunal
const findOrCreateTribunalSchema = Joi.object({
  nom_etablissement: Joi.string()
    .trim()
    .min(1)
    .max(500)
    .required()
    .messages({
      'string.empty': "nom_etablissement requis.",
      'any.required': "nom_etablissement requis.",
      'string.max': "nom_etablissement trop long (max 500 caracteres).",
    }),
  numero_et_libelle_voie: optionalShortText(500),
  code_postal: optionalShortText(20),
  ligne_d_acheminement: optionalShortText(200),
  adresse_mail: optionalEmail,
  nu_tel: optionalShortText(50),
}).unknown(true);

// ----------------------------------------------------------------------------
// Personnes a charge (CRUD inline depuis l'onglet ARIA)
// ----------------------------------------------------------------------------

// POST /contact/:contactId/personne-charge   body = { personneCharge: {...}, dossierId? }
const createPersonneChargeSchema = Joi.object({
  personneCharge: flexibleObject.required().messages({
    'any.required': "Le champ 'personneCharge' est requis.",
    'object.base': "Le champ 'personneCharge' doit etre un objet.",
  }),
  dossierId: objectIdField.optional().allow('', null),
});

// PUT /personne-charge/:pcId   body = { data: {...}, dossierId? }
const updatePersonneChargeSchema = Joi.object({
  data: flexibleObject.required().messages({
    'any.required': "Le champ 'data' est requis.",
    'object.base': "Le champ 'data' doit etre un objet.",
  }),
  dossierId: objectIdField.optional().allow('', null),
});

module.exports = {
  createContactSchema,
  updateContactSchema,
  createContactPMSchema,
  updateContactPMSchema,
  createContactPMPubliqueSchema,
  updateContactPMPubliqueSchema,
  checkContactSchema,
  findOrCreateTribunalSchema,
  createPersonneChargeSchema,
  updatePersonneChargeSchema,
};
