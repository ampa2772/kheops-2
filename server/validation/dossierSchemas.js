// server/validation/dossierSchemas.js
//
// Schema Joi pour la creation de dossier (S27 chantier #18b reliquat).
//
// Couvre : POST /createDossier
//
// PHILOSOPHIE :
//   Le body de createDossier est tres riche et nested :
//     {
//       dossierData: {
//         dossier: { nom, type_dossier, ... },
//         parties: {
//           pour:   [{ partieData, avocats, contacts, idPartie, ... }, ...],
//           contre: [{ ... }, ...],
//         },
//         contactsDuDossier:    [...],
//         avocatsResponsables:  [...],
//         ...
//       }
//     }
//
//   Toute restriction stricte ici risquerait de casser le flux de creation
//   (tres utilise, central a l'app). On valide donc UNIQUEMENT la structure
//   top-level : presence de dossierData, qui doit etre un objet. Tout le
//   contenu nested passe via .unknown(true).
//
//   Les protections en profondeur restent :
//     - mongoSanitize (server/index.js)
//     - validations Mongoose (Dossier.schema runValidators)
//     - middleware auth + req.user (SECURITE rc37)
//     - audit.create (auditLogger)
//
//   On ne touche PAS aux routes secondaires (/dossier, /partie, /role, ...)
//   qui sont marquees "potentiellement non utilisees" dans le code. On ne
//   touche pas non plus aux PUT /dossier/:id et /updateEntityInDossier/:id
//   dans folderDossierInteraction.js : bodies encore plus riches, risque
//   eleve, a couvrir dans une session future si besoin.

'use strict';

const Joi = require('joi');

const flexibleObject = Joi.object().unknown(true);

// POST /createDossier   body = { dossierData: {...} }
const createDossierSchema = Joi.object({
  dossierData: flexibleObject.required().messages({
    'any.required': "Le champ 'dossierData' est requis.",
    'object.base': "Le champ 'dossierData' doit etre un objet.",
  }),
});

module.exports = {
  createDossierSchema,
};
