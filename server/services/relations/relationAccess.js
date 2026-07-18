const mongoose = require('mongoose');
const UserDossier = require('../../models/Folder/modelsLiaisons/UserDossier');
const Dossier = require('../../models/Folder/Dossier');
const Tenant = require('../../models/Cabinet/Tenant');
const Membership = require('../../models/Cabinet/Membership');
const { getAccessibleUserIds } = require('../cabinetAccess');
const { ROLES } = require('../cabinetRoles');

const DOSSIER_ENTITY_TYPES = new Set(['dossier', 'matter']);
const AUDIT_ROLES = new Set([ROLES.OWNER, ROLES.ADMIN]);

function accessError(message = 'Vous n’avez pas accès à ce dossier.') {
  return Object.assign(new Error(message), {
    statusCode: 403,
    code: 'DOSSIER_ACCESS_DENIED',
  });
}

function objectId(value, label = 'dossierId') {
  if (!mongoose.Types.ObjectId.isValid(String(value || ''))) {
    throw Object.assign(new Error(`${label} invalide.`), { statusCode: 400, code: 'INVALID_ID' });
  }
  return new mongoose.Types.ObjectId(String(value));
}

async function getTenantScopedRole({ tenantId, userId }, TenantModel = Tenant, MembershipModel = Membership) {
  const tenant = objectId(tenantId, 'tenantId');
  const user = objectId(userId, 'userId');
  const owned = await TenantModel.findOne({ _id: tenant, ownerUserId: user }).select('_id').lean();
  if (owned) return ROLES.OWNER;
  const membership = await MembershipModel.findOne({ tenantId: tenant, userId: user, status: 'active' }).select('role').lean();
  return membership?.role || null;
}

function endpointDossierIds(relation = {}) {
  return [relation.subject, relation.object]
    .filter((endpoint) => DOSSIER_ENTITY_TYPES.has(String(endpoint?.entityType || '').toLowerCase()))
    .map((endpoint) => String(endpoint.entityId || ''))
    .filter(Boolean);
}

function makeRelationAccess({
  DossierLink = UserDossier,
  DossierModel = Dossier,
  accessibleUsers = getAccessibleUserIds,
  tenantRole = getTenantScopedRole,
} = {}) {
  async function accessibleDossierIds(userId) {
    const users = await accessibleUsers(userId);
    const links = await DossierLink.find({ user: { $in: users } }).select('dossier').lean();
    return new Set(links.map((link) => String(link.dossier)).filter(Boolean));
  }

  async function assertDossierAccess({ tenantId, userId, dossierId }) {
    const id = objectId(dossierId);
    const dossier = await DossierModel.findOne({ _id: id }).select('tenantId').lean();
    if (!dossier || (dossier.tenantId && String(dossier.tenantId) !== String(tenantId))) throw accessError();
    const allowed = await accessibleDossierIds(userId);
    if (!allowed.has(String(id))) throw accessError();
    return id;
  }

  async function assertRelationAccess({ tenantId, userId, relation }) {
    const dossierIds = endpointDossierIds(relation);
    if (!dossierIds.length) return relation;
    const allowed = await accessibleDossierIds(userId);
    for (const dossierId of dossierIds) {
      if (!mongoose.Types.ObjectId.isValid(dossierId) || !allowed.has(dossierId)) throw accessError();
      const dossier = await DossierModel.findOne({ _id: objectId(dossierId) }).select('tenantId').lean();
      if (!dossier || (dossier.tenantId && String(dossier.tenantId) !== String(tenantId))) throw accessError();
    }
    return relation;
  }

  async function filterAccessibleRelations({ tenantId, userId, relations = [] }) {
    const dossierIds = new Set(relations.flatMap(endpointDossierIds));
    if (!dossierIds.size) return relations;
    const allowed = await accessibleDossierIds(userId);
    const candidateIds = [...dossierIds].filter((id) => mongoose.Types.ObjectId.isValid(id) && allowed.has(id));
    const dossiers = await DossierModel.find({ _id: { $in: candidateIds.map((id) => objectId(id)) } }).select('_id tenantId').lean();
    const allowedTenantDossiers = new Set(dossiers
      .filter((dossier) => !dossier.tenantId || String(dossier.tenantId) === String(tenantId))
      .map((dossier) => String(dossier._id)));
    return relations.filter((relation) => endpointDossierIds(relation)
      .every((id) => allowedTenantDossiers.has(id)));
  }

  async function isAuditAdmin({ tenantId, userId }) {
    return AUDIT_ROLES.has(await tenantRole({ tenantId, userId }));
  }

  async function assertAuditAdmin(scope) {
    if (!await isAuditAdmin(scope)) {
      throw Object.assign(new Error('Cette vue globale est réservée aux administrateurs du cabinet.'), {
        statusCode: 403,
        code: 'RELATION_AUDIT_ADMIN_REQUIRED',
      });
    }
    return true;
  }

  return {
    accessibleDossierIds,
    assertAuditAdmin,
    assertDossierAccess,
    assertRelationAccess,
    filterAccessibleRelations,
    isAuditAdmin,
  };
}

module.exports = {
  AUDIT_ROLES,
  DOSSIER_ENTITY_TYPES,
  endpointDossierIds,
  getTenantScopedRole,
  makeRelationAccess,
  ...makeRelationAccess(),
};
