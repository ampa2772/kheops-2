// Kheops_2/server/models/Divorce/DivorceCMTemplate.js
//
// Templates personnalisables par cabinet pour le module Divorce CM.
// Chaque template est identifie par un (ownerUserId, key). Les valeurs
// surchargent les textes par defaut codes en dur cote client.
//
// Exemple de keys :
//  - 'convention_preambule_intro'
//  - 'convention_frais_honoraires'
//  - 'lettre_rar_corps'
//  - 'formule_politesse_courrier'
//
// Les textes peuvent contenir des placeholders {{epoux1.nom}}, {{notaire.ville}}
// qui sont resolus cote client a partir de la fiche divorce.
const mongoose = require('mongoose');

const DivorceCMTemplateSchema = new mongoose.Schema({
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  key: { type: String, required: true },
  content: { type: String, default: '' },
  lastModifiedByOfficeUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'OfficeUser', default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  collection: 'divorceCMTemplates',
});

DivorceCMTemplateSchema.index({ ownerUserId: 1, key: 1 }, { unique: true });

DivorceCMTemplateSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('DivorceCMTemplate', DivorceCMTemplateSchema);
