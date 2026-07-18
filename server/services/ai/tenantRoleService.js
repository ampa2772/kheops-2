const mongoose = require('mongoose');
const Tenant = require('../../models/Cabinet/Tenant');
const Membership = require('../../models/Cabinet/Membership');
const { ROLES } = require('../cabinetRoles');

const VALID_MEMBER_ROLES = new Set([
  ROLES.ADMIN, ROLES.AVOCAT, ROLES.COLLABORATEUR, ROLES.SECRETAIRE,
]);

// Résolution volontairement liée au couple (tenant, utilisateur). Aucun rôle
// acquis dans un autre cabinet ne doit influencer cette décision.
async function getTenantRole(tenantId, userId) {
  if (!mongoose.Types.ObjectId.isValid(String(tenantId || ''))
    || !mongoose.Types.ObjectId.isValid(String(userId || ''))) return ROLES.SECRETAIRE;
  try {
    const owner = await Tenant.findOne({ _id: tenantId, ownerUserId: userId }).select('_id').lean();
    if (owner) return ROLES.OWNER;
    const membership = await Membership.findOne({ tenantId, userId, status: 'active' }).select('role').lean();
    return membership && VALID_MEMBER_ROLES.has(membership.role)
      ? membership.role
      : ROLES.SECRETAIRE;
  } catch (err) {
    console.error('[AI tenant role] résolution impossible — repli fermé:', err.message);
    return ROLES.SECRETAIRE;
  }
}

function isTenantManager(role) {
  return role === ROLES.OWNER || role === ROLES.ADMIN;
}

module.exports = { getTenantRole, isTenantManager };
