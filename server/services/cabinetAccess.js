// server/services/cabinetAccess.js
//
// SOURCE DE VÉRITÉ du partage intra-cabinet (R5b). Répond à la question :
// « De quels utilisateurs la personne connectée peut-elle voir/gérer les données ? »
//
// Règle : un utilisateur accède aux données des membres du/des cabinet(s) auquel(s)
// il appartient — JAMAIS d'un autre cabinet. On ne rassemble QUE les membres des
// tenants que l'utilisateur possède (Tenant.ownerUserId) ou dont il est membre
// `active` (Membership). Par construction, aucune donnée d'un cabinet tiers n'entre.
//
// FERMÉ PAR DÉFAUT : en l'absence de cabinet résolu ou en cas d'erreur, on renvoie
// UNIQUEMENT l'utilisateur lui-même (`[selfId]`) — le cloisonnement historique
// par-utilisateur est ainsi strictement préservé, y compris en cas de panne.

const User = require('../models/App_Users/User');
const Tenant = require('../models/Cabinet/Tenant');
const Membership = require('../models/Cabinet/Membership');

/**
 * Fusion PURE : self + propriétaires + membres, dédupliqués (chaînes).
 * (testable sans base). Les listes fournies DOIVENT déjà être limitées aux
 * tenants de l'utilisateur — c'est le wrapper DB qui garantit ce périmètre.
 */
function computeAccessibleUserIds({ selfId, tenantOwnerIds = [], tenantMemberIds = [] }) {
  const ids = new Set([String(selfId)]);
  for (const o of tenantOwnerIds) if (o) ids.add(String(o));
  for (const m of tenantMemberIds) if (m) ids.add(String(m));
  return Array.from(ids);
}

/**
 * Renvoie la liste des userId (chaînes) dont l'utilisateur courant peut voir les
 * données (lui inclus). FERMÉ PAR DÉFAUT à [selfId].
 * @param {string|ObjectId} userId
 * @returns {Promise<string[]>}
 */
async function getAccessibleUserIds(userId) {
  const selfId = String(userId);
  if (!userId) return [selfId];
  try {
    // 1. Tenants auxquels l'utilisateur appartient (les SIENS uniquement).
    const myTenantIds = new Set();
    const user = await User.findById(userId).select('tenantId').lean();
    if (user && user.tenantId) myTenantIds.add(String(user.tenantId));
    const owned = await Tenant.find({ ownerUserId: userId }).select('_id').lean();
    for (const t of owned) myTenantIds.add(String(t._id));
    const myMemberships = await Membership.find({ userId, status: 'active' }).select('tenantId').lean();
    for (const m of myMemberships) if (m.tenantId) myTenantIds.add(String(m.tenantId));

    if (myTenantIds.size === 0) return [selfId]; // fermé par défaut

    const tenantIdArr = Array.from(myTenantIds);

    // 2. Membres de CES tenants seulement (propriétaires + membres actifs).
    const tenants = await Tenant.find({ _id: { $in: tenantIdArr } }).select('ownerUserId').lean();
    const members = await Membership.find({ tenantId: { $in: tenantIdArr }, status: 'active' }).select('userId').lean();

    return computeAccessibleUserIds({
      selfId,
      tenantOwnerIds: tenants.map((t) => t.ownerUserId),
      tenantMemberIds: members.map((m) => m.userId),
    });
  } catch (err) {
    console.error('[cabinetAccess] getAccessibleUserIds — repli fermé (self seul):', err.message);
    return [selfId]; // fermé par défaut sur toute erreur
  }
}

module.exports = { getAccessibleUserIds, computeAccessibleUserIds };
