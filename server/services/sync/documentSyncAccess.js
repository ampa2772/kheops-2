const crypto = require('crypto');
const mongoose = require('mongoose');
const LogicalDocument = require('../../models/Documents/LogicalDocument');
const DocumentCopy = require('../../models/Documents/DocumentCopy');
const DocumentSyncJournal = require('../../models/Documents/DocumentSyncJournal');
const UserDossier = require('../../models/Folder/modelsLiaisons/UserDossier');
const Dossier = require('../../models/Folder/Dossier');
const Tenant = require('../../models/Cabinet/Tenant');
const Membership = require('../../models/Cabinet/Membership');
const { getAccessibleUserIds } = require('../cabinetAccess');
const { ROLES } = require('../cabinetRoles');

const TECHNICAL_ADMIN_ROLES = new Set([ROLES.OWNER, ROLES.ADMIN]);

function objectId(value, label) {
  if (!mongoose.Types.ObjectId.isValid(String(value || ''))) {
    throw Object.assign(new Error(`${label} invalide.`), { statusCode: 400, code: 'INVALID_ID' });
  }
  return new mongoose.Types.ObjectId(String(value));
}

function forbidden(code = 'DOSSIER_ACCESS_DENIED', message = 'Vous n’avez pas accès à ce dossier.') {
  return Object.assign(new Error(message), { statusCode: 403, code });
}

async function getTenantScopedRole({ tenantId, userId }, TenantModel = Tenant, MembershipModel = Membership) {
  const tenant = objectId(tenantId, 'tenantId');
  const user = objectId(userId, 'userId');
  const owned = await TenantModel.findOne({ _id: tenant, ownerUserId: user }).select('_id').lean();
  if (owned) return ROLES.OWNER;
  const membership = await MembershipModel.findOne({ tenantId: tenant, userId: user, status: 'active' }).select('role').lean();
  return membership?.role || null;
}

function header(req, name) {
  if (typeof req?.get === 'function') return req.get(name);
  const headers = req?.headers || {};
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
}

function constantTimeWorkerTokenMatches(req, configuredToken = process.env.KHEOPS_SYNC_WORKER_TOKEN) {
  const expected = String(configuredToken || '');
  const presented = String(header(req, 'x-kheops-sync-worker-token') || '');
  // Un secret court ou absent ne doit jamais activer l’accès worker.
  if (expected.length < 32 || !presented) return false;
  const expectedDigest = crypto.createHash('sha256').update(expected).digest();
  const presentedDigest = crypto.createHash('sha256').update(presented).digest();
  return crypto.timingSafeEqual(expectedDigest, presentedDigest);
}

function makeDocumentSyncAccess({
  Logical = LogicalDocument,
  Copy = DocumentCopy,
  Journal = DocumentSyncJournal,
  DossierLink = UserDossier,
  DossierModel = Dossier,
  accessibleUsers = getAccessibleUserIds,
  tenantRole = getTenantScopedRole,
  workerTokenMatches = constantTimeWorkerTokenMatches,
} = {}) {
  async function assertDossierAccess({ tenantId, userId, dossierId }) {
    const dossier = objectId(dossierId, 'dossierId');
    const dossierRecord = await DossierModel.findOne({ _id: dossier }).select('tenantId').lean();
    if (!dossierRecord || (dossierRecord.tenantId && String(dossierRecord.tenantId) !== String(tenantId))) {
      throw forbidden();
    }
    const users = await accessibleUsers(userId);
    const link = await DossierLink.exists({ user: { $in: users }, dossier });
    if (!link) throw forbidden();
    return dossier;
  }

  async function findLogical({ tenantId, logicalDocumentId }) {
    const document = await Logical.findOne({
      _id: objectId(logicalDocumentId, 'logicalDocumentId'),
      tenantId: objectId(tenantId, 'tenantId'),
    }).select('_id tenantId dossierId').lean();
    if (!document) {
      throw Object.assign(new Error('Document logique introuvable.'), {
        statusCode: 404,
        code: 'LOGICAL_DOCUMENT_NOT_FOUND',
      });
    }
    return document;
  }

  async function assertDocumentAccess({ tenantId, userId, logicalDocumentId }) {
    const document = await findLogical({ tenantId, logicalDocumentId });
    await assertDossierAccess({ tenantId, userId, dossierId: document.dossierId });
    return document;
  }

  async function assertCopyAccess({ tenantId, userId, copyId }) {
    const tenant = objectId(tenantId, 'tenantId');
    const copy = await Copy.findOne({ _id: objectId(copyId, 'copyId'), tenantId: tenant })
      .select('_id logicalDocumentId').lean();
    if (!copy) {
      throw Object.assign(new Error('Copie documentaire introuvable.'), {
        statusCode: 404,
        code: 'DOCUMENT_COPY_NOT_FOUND',
      });
    }
    await assertDocumentAccess({ tenantId: tenant, userId, logicalDocumentId: copy.logicalDocumentId });
    return copy;
  }

  async function assertOperationAccess({ tenantId, userId, operationId, operation = null }) {
    const tenant = objectId(tenantId, 'tenantId');
    const found = operation || await Journal.findOne({
      tenantId: tenant,
      operationId: String(operationId || '').trim().slice(0, 180),
    }).select('_id operationId logicalDocumentId').lean();
    if (!found) {
      throw Object.assign(new Error('Opération de synchronisation introuvable.'), {
        statusCode: 404,
        code: 'SYNC_NOT_FOUND',
      });
    }
    await assertDocumentAccess({ tenantId: tenant, userId, logicalDocumentId: found.logicalDocumentId });
    return found;
  }

  async function isTechnicalAdmin({ tenantId, userId }) {
    return TECHNICAL_ADMIN_ROLES.has(await tenantRole({ tenantId, userId }));
  }

  async function assertTechnicalAdmin(scope) {
    if (!await isTechnicalAdmin(scope)) {
      throw forbidden('DOCUMENT_SYNC_ADMIN_REQUIRED', 'Cette vue globale est réservée aux administrateurs du cabinet.');
    }
    return true;
  }

  async function assertWorkerOrTechnicalAdmin(req) {
    if (workerTokenMatches(req)) return { internalWorker: true };
    if (await isTechnicalAdmin({ tenantId: req.tenantId, userId: req.user })) return { internalWorker: false };
    throw forbidden(
      'DOCUMENT_SYNC_WORKER_REQUIRED',
      'Cette commande est réservée au worker de synchronisation ou à un administrateur technique.',
    );
  }

  return {
    assertCopyAccess,
    assertDossierAccess,
    assertDocumentAccess,
    assertOperationAccess,
    assertTechnicalAdmin,
    assertWorkerOrTechnicalAdmin,
    findLogical,
    isTechnicalAdmin,
  };
}

module.exports = {
  TECHNICAL_ADMIN_ROLES,
  constantTimeWorkerTokenMatches,
  getTenantScopedRole,
  makeDocumentSyncAccess,
  ...makeDocumentSyncAccess(),
};
