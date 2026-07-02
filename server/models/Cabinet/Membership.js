// server/models/Cabinet/Membership.js
//
// Appartenance d'un utilisateur à un CABINET (Tenant) — R5b (partage multi-membres).
//
// Le propriétaire du cabinet est identifié par Tenant.ownerUserId ; les AUTRES
// membres (collaborateurs, secrétaires…) sont représentés par un Membership.
// Un membre `active` partage l'accès aux dossiers/documents/contacts du cabinet
// (via server/services/cabinetAccess.js + ownershipHelpers).
//
// Sécurité : tant qu'aucun Membership `active` n'existe, chaque utilisateur reste
// strictement cloisonné à ses propres données (comportement historique préservé).

const mongoose = require('mongoose');

const MembershipSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['avocat', 'collaborateur', 'secretaire', 'admin'],
      default: 'collaborateur',
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'revoked'],
      default: 'pending',
      index: true,
    },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Un seul lien par (cabinet, utilisateur).
MembershipSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.models.Membership || mongoose.model('Membership', MembershipSchema);
