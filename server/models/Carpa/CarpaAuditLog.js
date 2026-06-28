// Kheops_2/server/models/Carpa/CarpaAuditLog.js
//
// Journal d'audit append-only pour les operations CARPA.
// Chaque modification d'une CarpaOperation insere une nouvelle ligne ici ;
// aucune mise a jour ni suppression n'est effectuee en pratique.
//
// Sert a fournir, en cas de controle ordinal, du Batonnier ou de la
// commission nationale, la trace exhaustive des actions effectuees
// (qui, quoi, quand) sur les fonds CARPA.
const mongoose = require('mongoose');

const CarpaAuditLogSchema = new mongoose.Schema({
  operationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CarpaOperation', required: true, index: true },
  dossierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  officeUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'OfficeUser', required: true },

  action: {
    type: String,
    required: true,
    // 'create' | 'update_field' | 'state_change' | 'piece_add' | 'piece_remove'
    // | 'flag_lcbft_add' | 'flag_lcbft_lift' | 'reconciliation' | 'cancel'
  },
  ancienEtat: { type: String, default: null },
  nouvelEtat: { type: String, default: null },
  champsModifies: { type: mongoose.Schema.Types.Mixed, default: null }, // diff serialise

  // Snapshot lisible pour ne pas avoir a relire la trace
  resume: { type: String, default: '' },

  timestamp: { type: Date, default: Date.now, index: true },
}, {
  collection: 'carpaAuditLogs',
});

// Pas de pre('save') de mise a jour de timestamp : ce log est immuable.
// On bloque explicitement les updates / removes au niveau du service
// (cf. server/services/carpaAuditService.js).

module.exports = mongoose.model('CarpaAuditLog', CarpaAuditLogSchema);
