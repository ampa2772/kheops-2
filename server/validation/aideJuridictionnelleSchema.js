// server/validation/aideJuridictionnelleSchema.js
//
// A20 — validation du snapshot « Aide juridictionnelle » (formulaire cerfa).
//
// Philosophie (même esprit que contactSchemas.js) : le formulaire client est
// riche et évolue — on ne fige PAS la liste des champs feuilles. On borne en
// revanche la STRUCTURE (seules les sections connues du formulaire sont
// acceptées, le reste est retiré par stripUnknown) et les CONTENUS (longueur
// des textes, taille des tableaux, profondeur d'imbrication, clés saines).
// Objectifs : pas de pollution du document Dossier par des sections
// arbitraires, pas de champ géant (DoS), pas de clé dangereuse (__proto__…).
//
// Branché via validateBody (stripUnknown:true) sur :
//   PUT /api/folder/dossier/:dossierId/aide-juridictionnelle

'use strict';

const Joi = require('joi');

// Clés autorisées dans les objets libres : identifiants de champs raisonnables
// (lettres/chiffres/underscore, accents compris), en EXCLUANT explicitement
// les clés à risque de pollution de prototype (__proto__ et constructor sont
// composées de caractères « normaux » : une simple classe de caractères ne
// les bloque pas). Les clés non conformes sont retirées par stripUnknown.
const SAFE_KEY = /^(?!__proto__$|constructor$|prototype$)[A-Za-z0-9_À-ſ]{1,64}$/;

// Valeur feuille : texte borné, nombre, booléen ou null.
const leaf = Joi.alternatives().try(
  Joi.string().max(2000).allow('', null),
  Joi.number(),
  Joi.boolean(),
  Joi.valid(null)
);

// Valeur bornée récursive : feuille, tableau (≤ 60 éléments) ou objet
// (≤ 80 clés saines), jusqu'à 4 niveaux d'imbrication. Au-delà : rejeté.
let boundedValue = leaf;
for (let depth = 0; depth < 4; depth += 1) {
  boundedValue = Joi.alternatives().try(
    leaf,
    Joi.array().items(boundedValue).max(60),
    Joi.object().pattern(SAFE_KEY, boundedValue).max(80)
  );
}

// Une section du formulaire = objet libre borné.
const section = Joi.object().pattern(SAFE_KEY, boundedValue).max(80);
// Sections en liste (personnes à charge, adversaires, ressources…).
const sectionArray = Joi.array().items(section).max(50);

// Sections CONNUES du formulaire AJ (cf. client AJModal.js emptyForm()).
// Toute autre clé de premier niveau est retirée (stripUnknown).
const aideJuridictionnelleSchema = Joi.object({
  demandeur: section,
  assurancePJ: section,
  representant: section,
  conjoint: section,
  affaireOppose: section,
  demande: section,
  auxiliaire: section,
  dispenses: section,
  attestation: section,
  patrimoine: section,
  personnesACharge: sectionArray,
  adversaires: sectionArray,
  prestationsVersees: sectionArray,
  ressources: sectionArray,
  // Renvoyé par le client lors d'une re-sauvegarde : ignoré, le serveur
  // pose le sien.
  updatedAt: Joi.any().strip(),
});

module.exports = { aideJuridictionnelleSchema };
