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
// Bloc contact BORNE (defense en profondeur, 2026-07-02)
// ----------------------------------------------------------------------------
// Les champs free-text les plus exposes sont limites en LONGUEUR pour bloquer
// le stockage de payloads geants (DoS / bloat DB via un `nom` de plusieurs Mo,
// possible car bodyParser.json limit=10mb en amont). On garde `.unknown(true)`
// => tout autre champ (structure riche PP/PM : detailMariage, interlocuteur, ...)
// reste accepte TEL QUEL. IMPORTANT : PAS de `.trim()`/`.lowercase()` ici — on
// ne veut pas MUTER la donnee (validateBody remplace req.body par la valeur
// validee). On se contente de valider la longueur, sans transformer.
const boundedText = (max) => Joi.string().allow('', null).max(max).messages({
  'string.max': `Champ trop long (max ${max} caracteres).`,
  'string.base': 'Champ texte attendu.',
});

const CONTACT_TEXT_LIMITS = {
  nom: boundedText(300),
  nomDeNaissance: boundedText(300),
  prenoms: boundedText(300),
  raisonSociale: boundedText(400),
  denomination: boundedText(400),
  adresse: boundedText(1000),
  ville: boundedText(200),
  codePostal: boundedText(20),
  telephone: boundedText(50),
  profession: boundedText(300),
  nationalite: boundedText(150),
  paysNaissance: boundedText(150),
  villeNaissance: boundedText(200),
  email: Joi.string().allow('', null).max(254).messages({
    'string.max': 'Email trop long (max 254 caracteres).',
  }),
};

// Bloc contact : champs connus bornes en longueur + reste libre (unknown).
const boundedContactBlock = Joi.object(CONTACT_TEXT_LIMITS).unknown(true);

// ----------------------------------------------------------------------------
// Personne Physique (PP)
// ----------------------------------------------------------------------------

// POST /contact   body = { contact: {...}, options: { contactType, userId,
//                          detailMariage: {...}, personnesCharge: [...] } }
const createContactSchema = Joi.object({
  contact: boundedContactBlock.required().messages({
    'any.required': "Le champ 'contact' est requis.",
    'object.base': "Le champ 'contact' doit etre un objet.",
  }),
  options: flexibleObject.default({}),
});

// PUT /contact/:id   body = { contact: {...}, options: { personnesCharge: [...] } }
const updateContactSchema = Joi.object({
  contact: boundedContactBlock.required().messages({
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
  contact: boundedContactBlock.required().messages({
    'any.required': "Le champ 'contact' est requis.",
    'object.base': "Le champ 'contact' doit etre un objet.",
  }),
  // 'user' du body est ignore cote route (req.user prime) mais on accepte
  // sa presence pour ne pas casser les clients qui l'envoient.
  user: flexibleObject.optional(),
});

// PUT /contactPM/:id   body = { contact: {...} }
const updateContactPMSchema = Joi.object({
  contact: boundedContactBlock.required().messages({
    'any.required': "Le champ 'contact' est requis.",
    'object.base': "Le champ 'contact' doit etre un objet.",
  }),
});

// ----------------------------------------------------------------------------
// Personne Morale Publique (PMPub)
// ----------------------------------------------------------------------------

// POST /contactPMPublique   body = { contactData: {...}, user: {...} }
const createContactPMPubliqueSchema = Joi.object({
  contactData: boundedContactBlock.required().messages({
    'any.required': "Le champ 'contactData' est requis.",
    'object.base': "Le champ 'contactData' doit etre un objet.",
  }),
  user: flexibleObject.optional(),
});

// PUT /contactPMPublique/:id   body = { contactData: {...} }
const updateContactPMPubliqueSchema = Joi.object({
  contactData: boundedContactBlock.required().messages({
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
  personneCharge: boundedContactBlock.required().messages({
    'any.required': "Le champ 'personneCharge' est requis.",
    'object.base': "Le champ 'personneCharge' doit etre un objet.",
  }),
  dossierId: objectIdField.optional().allow('', null),
});

// PUT /personne-charge/:pcId   body = { data: {...}, dossierId? }
const updatePersonneChargeSchema = Joi.object({
  data: boundedContactBlock.required().messages({
    'any.required': "Le champ 'data' est requis.",
    'object.base': "Le champ 'data' doit etre un objet.",
  }),
  dossierId: objectIdField.optional().allow('', null),
});

// ----------------------------------------------------------------------------
// Divorce CM — POST /api/divorce-cm/save-as-contact
// ----------------------------------------------------------------------------
// Cette route creait un Contact + des PersonneCharge SANS validateBody (bypass
// identifie a l'audit 2026-07-02). On la borne ici : `data` = bloc contact
// borne, `personnesCharge` = tableau borne (<=50 items) de blocs contact bornes.
// Le handler ne lit que { kind, data, personnesCharge } → stripUnknown top-level
// sans risque ; `.unknown(true)` sur data/items preserve les champs riches.
const saveAsContactSchema = Joi.object({
  kind: Joi.string().allow('', null).max(50).optional(),
  data: boundedContactBlock.required().messages({
    'any.required': "Le champ 'data' est requis.",
    'object.base': "Le champ 'data' doit etre un objet.",
  }),
  personnesCharge: Joi.array().items(boundedContactBlock).max(50).optional().messages({
    'array.max': 'Trop de personnes a charge (max 50).',
  }),
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
  saveAsContactSchema,
};
