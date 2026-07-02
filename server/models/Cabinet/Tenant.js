// server/models/Cabinet/Tenant.js
//
// Tenant = CABINET. Unité de cloisonnement de haut niveau (AUTH-002).
//
// Modèle volontairement MINIMAL : il identifie un cabinet et son propriétaire.
// La configuration de stockage (provider choisi, quota, espace utilisé) vit
// dans le modèle de Codex (StorageProviderConfig, clé = tenantId) — pas ici,
// pour garder une frontière nette Claude(identité) / Codex(stockage).
//
// Modèle de départ : 1 utilisateur = 1 cabinet (création paresseuse). La gestion
// multi-membres (avocat + collaborateur + secrétaire avec logins distincts
// partageant le même cabinet) est un incrément ultérieur (Membership) — voir
// AI_COORDINATION.md.

const mongoose = require('mongoose');

const TenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Guard anti-OverwriteModelError (utile en tests / hot-reload).
module.exports = mongoose.models.Tenant || mongoose.model('Tenant', TenantSchema);
