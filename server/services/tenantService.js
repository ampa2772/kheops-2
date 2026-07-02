// server/services/tenantService.js
//
// Résolution du CABINET (tenant) d'un utilisateur (AUTH-002).
//
// Stratégie : création PARESSEUSE. 1 utilisateur = 1 cabinet par défaut.
//   - à l'inscription, on crée explicitement le cabinet (avec le nom saisi) ;
//   - pour tout utilisateur existant (ou créé via OAuth) sans tenantId, on crée
//     un cabinet personnel à la volée à la première requête tenant-scopée.
// Conséquence : le cloisonnement actuel (par utilisateur) est préservé à
// l'identique (chaque avocat = son propre cabinet), et `tenantId` devient
// disponible pour les fonctionnalités multi-tenant (stockage Codex, etc.).
//
// Évolution future documentée (AI_COORDINATION.md) : appartenance multi-membres
// (plusieurs logins partageant un même cabinet) via un modèle Membership.

const User = require('../models/App_Users/User');
const Tenant = require('../models/Cabinet/Tenant');

/** Nom de cabinet par défaut dérivé de l'utilisateur (fonction PURE, testable). */
function defaultTenantName(user) {
  const full = [user && user.firstName, user && user.lastName].filter(Boolean).join(' ').trim();
  if (full) return `Cabinet ${full}`;
  if (user && user.email) return `Cabinet ${user.email}`;
  return 'Cabinet';
}

/**
 * Retourne l'ObjectId du cabinet de l'utilisateur, en le créant si nécessaire.
 * @param {string|ObjectId} userId
 * @returns {Promise<ObjectId>}
 */
async function resolveTenantId(userId) {
  if (!userId) throw new Error('userId requis pour résoudre le cabinet (tenant).');
  const user = await User.findById(userId).select('tenantId firstName lastName email');
  if (!user) throw new Error('Utilisateur introuvable.');
  if (user.tenantId) return user.tenantId;

  const tenant = await Tenant.create({ name: defaultTenantName(user), ownerUserId: user._id });
  user.tenantId = tenant._id;
  await user.save();
  return tenant._id;
}

/**
 * Crée explicitement un cabinet pour un utilisateur fraîchement inscrit.
 * @param {object} user  document User déjà sauvegardé
 * @param {string} [cabinetName]  nom du cabinet saisi à l'inscription
 * @returns {Promise<ObjectId>}
 */
async function createTenantForUser(user, cabinetName) {
  const name = (cabinetName && String(cabinetName).trim()) || defaultTenantName(user);
  const tenant = await Tenant.create({ name, ownerUserId: user._id });
  return tenant._id;
}

async function getTenant(tenantId) {
  if (!tenantId) return null;
  return Tenant.findById(tenantId);
}

module.exports = { defaultTenantName, resolveTenantId, createTenantForUser, getTenant };
