const crypto = require('crypto');
const mongoose = require('mongoose');
const LogicalDocument = require('../../models/Documents/LogicalDocument');
const DocumentVersion = require('../../models/Documents/DocumentVersion');
const DocumentCopy = require('../../models/Documents/DocumentCopy');
const DocumentLocation = require('../../models/Documents/DocumentLocation');

function objectId(value, label) {
  if (!mongoose.Types.ObjectId.isValid(String(value || ''))) {
    throw Object.assign(new Error(`${label} invalide.`), { statusCode: 400, code: 'INVALID_ID' });
  }
  return new mongoose.Types.ObjectId(String(value));
}

function token(value, label, max = 300, required = true) {
  const result = String(value == null ? '' : value).trim();
  if (required && !result) throw Object.assign(new Error(`${label} requis.`), { statusCode: 400, code: 'DOCUMENT_VALIDATION' });
  if (result.length > max) throw Object.assign(new Error(`${label} trop long.`), { statusCode: 400, code: 'DOCUMENT_VALIDATION' });
  return result;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function deterministicKey(prefix, parts) {
  return `${prefix}_${sha256(parts.map((part) => String(part || '').trim().toLowerCase()).join('\u001f')).slice(0, 40)}`;
}

function makeLogicalDocumentService({
  Logical = LogicalDocument,
  Version = DocumentVersion,
  Copy = DocumentCopy,
  Location = DocumentLocation,
} = {}) {
  async function registerDocument({ tenantId, dossierId, userId, input = {} }) {
    const tenant = objectId(tenantId, 'tenantId');
    const dossier = objectId(dossierId || input.dossierId, 'dossierId');
    const actor = objectId(userId, 'userId');
    const aliases = (Array.isArray(input.aliases) ? input.aliases : []).slice(0, 100).map((alias) => ({
      system: token(alias.system, 'alias.system', 80).toLowerCase(),
      externalId: token(alias.externalId, 'alias.externalId', 240),
    }));
    const identityKey = input.identityKey
      ? token(input.identityKey, 'identityKey', 160)
      : deterministicKey('doc', [dossier, aliases[0]?.system, aliases[0]?.externalId, input.title]);
    const idempotencyKey = input.idempotencyKey ? token(input.idempotencyKey, 'idempotencyKey', 240) : null;
    if (idempotencyKey) {
      const retried = await Logical.findOne({ tenantId: tenant, idempotencyKey }).lean();
      if (retried) return { document: retried, created: false, idempotent: true };
    }
    const existing = await Logical.findOne({ tenantId: tenant, dossierId: dossier, identityKey }).lean();
    if (existing) return { document: existing, created: false, idempotent: false };
    try {
      const document = await Logical.create({
        tenantId: tenant,
        dossierId: dossier,
        identityKey,
        title: token(input.title, 'title'),
        documentType: token(input.documentType || 'document', 'documentType', 100).toLowerCase(),
        preferredMime: token(input.preferredMime || 'application/octet-stream', 'preferredMime', 160),
        status: input.status || 'draft',
        aliases,
        provenance: {
          source: input.provenance?.source || 'user',
          sourceId: String(input.provenance?.sourceId || '').slice(0, 240),
          sourceCollection: String(input.provenance?.sourceCollection || '').slice(0, 160),
          importBatchId: String(input.provenance?.importBatchId || '').slice(0, 160),
          originalFilename: String(input.provenance?.originalFilename || '').slice(0, 300),
          observedAt: input.provenance?.observedAt || new Date(),
        },
        idempotencyKey,
        migrationState: input.migrationState || undefined,
        createdBy: actor,
        updatedBy: actor,
      });
      return { document, created: true, idempotent: false };
    } catch (err) {
      if (err && err.code === 11000) {
        const winner = await Logical.findOne({ tenantId: tenant, dossierId: dossier, identityKey }).lean();
        if (winner) return { document: winner, created: false, idempotent: true };
      }
      throw err;
    }
  }

  async function addVersion({ tenantId, logicalDocumentId, userId, input = {} }) {
    const tenant = objectId(tenantId, 'tenantId');
    const logicalId = objectId(logicalDocumentId, 'logicalDocumentId');
    const actor = objectId(userId, 'userId');
    const idempotencyKey = input.idempotencyKey ? token(input.idempotencyKey, 'idempotencyKey', 240) : null;
    if (idempotencyKey) {
      const retried = await Version.findOne({ tenantId: tenant, idempotencyKey }).lean();
      if (retried) return { version: retried, created: false, idempotent: true, conflict: retried.status === 'conflict' };
    }
    const logical = await Logical.findOne({ _id: logicalId, tenantId: tenant });
    if (!logical) throw Object.assign(new Error('Document logique introuvable.'), { statusCode: 404, code: 'LOGICAL_DOCUMENT_NOT_FOUND' });
    const checksum = token(input.checksum, 'checksum', 128).toLowerCase();
    const currentDuplicate = logical.currentVersionId
      ? await Version.findOne({ tenantId: tenant, logicalDocumentId: logicalId, versionId: logical.currentVersionId, checksum }).lean()
      : null;
    if (currentDuplicate) return { version: currentDuplicate, created: false, idempotent: false, deduplicated: true, conflict: false };
    const latest = await Version.findOne({ tenantId: tenant, logicalDocumentId: logicalId }).sort({ sequence: -1 }).select('sequence').lean();
    const sequence = Number(latest?.sequence || 0) + 1;
    const versionId = input.versionId || `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const conflict = Boolean(input.baseVersionId && logical.currentVersionId
      && String(input.baseVersionId) !== String(logical.currentVersionId));
    let version;
    try {
      version = await Version.create({
        tenantId: tenant,
        logicalDocumentId: logicalId,
        versionId: token(versionId, 'versionId', 180),
        sequence,
        parentVersionIds: input.parentVersionIds || (input.baseVersionId ? [String(input.baseVersionId)] : (logical.currentVersionId ? [logical.currentVersionId] : [])),
        checksum,
        size: Math.max(0, Number(input.size) || 0),
        mime: token(input.mime || logical.preferredMime, 'mime', 160),
        filename: token(input.filename || logical.title, 'filename'),
        storageRef: input.storageRef || {},
        editor: input.editor || 'system',
        origin: String(input.origin || 'system').slice(0, 100).toLowerCase(),
        status: conflict ? 'conflict' : (input.status || 'draft'),
        conflictWithVersionId: conflict ? logical.currentVersionId : null,
        comment: String(input.comment || '').slice(0, 1000),
        idempotencyKey,
        createdBy: actor,
      });
    } catch (err) {
      if (err && err.code === 11000) {
        const winner = await Version.findOne({
          tenantId: tenant,
          $or: [
            { logicalDocumentId: logicalId, versionId: token(versionId, 'versionId', 180) },
            ...(idempotencyKey ? [{ idempotencyKey }] : []),
          ],
        }).lean();
        if (winner) return { version: winner, created: false, idempotent: true, conflict: winner.status === 'conflict' };
        throw Object.assign(new Error('Une version concurrente a utilisé le même numéro de séquence. Réessayez.'), {
          statusCode: 409,
          code: 'DOCUMENT_VERSION_CONFLICT',
          retryable: true,
        });
      }
      throw err;
    }
    if (conflict) return { version, created: true, idempotent: false, conflict: true, currentVersionId: logical.currentVersionId };
    const promoted = await Logical.findOneAndUpdate(
      { _id: logicalId, tenantId: tenant, revision: logical.revision, currentVersionId: logical.currentVersionId },
      { $set: { currentVersionId: version.versionId, updatedBy: actor }, $inc: { revision: 1 } },
      { new: true },
    );
    if (!promoted) {
      await Version.updateOne({ _id: version._id }, {
        $set: { status: 'conflict', conflictWithVersionId: logical.currentVersionId },
      });
      return { version: { ...(version.toObject ? version.toObject() : version), status: 'conflict' }, created: true, conflict: true, concurrent: true };
    }
    return { version, document: promoted, created: true, idempotent: false, conflict: false };
  }

  async function registerCopy({ tenantId, logicalDocumentId, userId, input = {} }) {
    const tenant = objectId(tenantId, 'tenantId');
    const logicalId = objectId(logicalDocumentId, 'logicalDocumentId');
    const actor = objectId(userId, 'userId');
    const logical = await Logical.findOne({ _id: logicalId, tenantId: tenant }).lean();
    if (!logical) throw Object.assign(new Error('Document logique introuvable.'), { statusCode: 404, code: 'LOGICAL_DOCUMENT_NOT_FOUND' });
    const copyKey = input.copyKey || deterministicKey('copy', [logicalId, input.purpose, input.basedOnVersionId, input.format]);
    const existing = await Copy.findOne({ tenantId: tenant, logicalDocumentId: logicalId, copyKey }).lean();
    if (existing) return { copy: existing, created: false };
    let copy;
    try {
      copy = await Copy.create({
        tenantId: tenant,
        logicalDocumentId: logicalId,
        copyKey,
        basedOnVersionId: input.basedOnVersionId || logical.currentVersionId,
        format: String(input.format || 'binary').slice(0, 80).toLowerCase(),
        purpose: input.purpose || 'working',
        checksum: input.checksum || null,
        size: Math.max(0, Number(input.size) || 0),
        state: input.state || 'ready',
        retentionPolicy: input.retentionPolicy || 'cabinet_policy',
        idempotencyKey: input.idempotencyKey || null,
        createdBy: actor,
        lastModifiedBy: actor,
      });
    } catch (err) {
      if (err && err.code === 11000) {
        const winner = await Copy.findOne({ tenantId: tenant, logicalDocumentId: logicalId, copyKey }).lean();
        if (winner) return { copy: winner, created: false, idempotent: true };
      }
      throw err;
    }
    if (input.purpose === 'canonical' && !logical.canonicalCopyId) {
      await Logical.updateOne({ _id: logicalId, tenantId: tenant, canonicalCopyId: null }, { $set: { canonicalCopyId: copy._id } });
    }
    return { copy, created: true };
  }

  async function registerLocation({ tenantId, copyId, userId, input = {} }) {
    const tenant = objectId(tenantId, 'tenantId');
    const copyObjectId = objectId(copyId, 'copyId');
    const actor = objectId(userId, 'userId');
    const copy = await Copy.findOne({ _id: copyObjectId, tenantId: tenant }).lean();
    if (!copy) throw Object.assign(new Error('Copie documentaire introuvable.'), { statusCode: 404, code: 'DOCUMENT_COPY_NOT_FOUND' });
    const provider = token(input.provider, 'provider', 80).toLowerCase();
    const locationKey = input.locationKey || deterministicKey('loc', [copyObjectId, provider, input.accountRef, input.externalFileId, input.storageKey]);
    const existing = await Location.findOne({ tenantId: tenant, copyId: copyObjectId, locationKey }).lean();
    if (existing) return { location: existing, created: false };
    let location;
    try {
      location = await Location.create({
        tenantId: tenant,
        logicalDocumentId: copy.logicalDocumentId,
        copyId: copyObjectId,
        locationKey,
        provider,
        accountRef: String(input.accountRef || '').slice(0, 300),
        containerId: String(input.containerId || '').slice(0, 500),
        externalFileId: String(input.externalFileId || '').slice(0, 500),
        storageKey: String(input.storageKey || '').slice(0, 1200),
        webUrl: String(input.webUrl || '').slice(0, 2000),
        remoteRevision: String(input.remoteRevision || '').slice(0, 500),
        remoteChecksum: String(input.remoteChecksum || '').slice(0, 128).toLowerCase(),
        remoteModifiedAt: input.remoteModifiedAt || null,
        state: input.state || 'available',
        lastObservedAt: input.lastObservedAt || new Date(),
        idempotencyKey: input.idempotencyKey || null,
        createdBy: actor,
      });
    } catch (err) {
      if (err && err.code === 11000) {
        const winner = await Location.findOne({ tenantId: tenant, copyId: copyObjectId, locationKey }).lean();
        if (winner) return { location: winner, created: false, idempotent: true };
      }
      throw err;
    }
    return { location, created: true };
  }

  async function getDocumentGraph({ tenantId, logicalDocumentId }) {
    const tenant = objectId(tenantId, 'tenantId');
    const logicalId = objectId(logicalDocumentId, 'logicalDocumentId');
    const document = await Logical.findOne({ _id: logicalId, tenantId: tenant }).lean();
    if (!document) throw Object.assign(new Error('Document logique introuvable.'), { statusCode: 404, code: 'LOGICAL_DOCUMENT_NOT_FOUND' });
    const [versions, copies, locations] = await Promise.all([
      Version.find({ tenantId: tenant, logicalDocumentId: logicalId }).sort({ sequence: 1 }).lean(),
      Copy.find({ tenantId: tenant, logicalDocumentId: logicalId }).sort({ createdAt: 1 }).lean(),
      Location.find({ tenantId: tenant, logicalDocumentId: logicalId }).sort({ createdAt: 1 }).lean(),
    ]);
    return { document, versions, copies, locations };
  }

  async function resolveDocumentAlias({ tenantId, dossierId, system, externalId }) {
    const tenant = objectId(tenantId, 'tenantId');
    const dossier = objectId(dossierId, 'dossierId');
    const aliasSystem = token(system, 'system', 80).toLowerCase();
    const aliasExternalId = token(externalId, 'externalId', 240);
    const document = await Logical.findOne({
      tenantId: tenant,
      dossierId: dossier,
      aliases: { $elemMatch: { system: aliasSystem, externalId: aliasExternalId } },
    }).lean();
    if (!document) throw Object.assign(new Error('Document logique introuvable pour cet alias.'), { statusCode: 404, code: 'LOGICAL_DOCUMENT_ALIAS_NOT_FOUND' });
    return document;
  }

  async function archiveMigratedDocument({ tenantId, logicalDocumentId, userId, runId }) {
    const tenant = objectId(tenantId, 'tenantId');
    const logicalId = objectId(logicalDocumentId, 'logicalDocumentId');
    const actor = objectId(userId, 'userId');
    const document = await Logical.findOneAndUpdate(
      { _id: logicalId, tenantId: tenant, 'migrationState.runId': runId, 'migrationState.status': 'migrated' },
      {
        $set: {
          status: 'archived',
          'migrationState.status': 'rolled_back',
          'migrationState.rolledBackAt': new Date(),
          updatedBy: actor,
        },
        $inc: { revision: 1 },
      },
      { new: true },
    );
    if (document) {
      await Copy.updateMany({ tenantId: tenant, logicalDocumentId: logicalId }, { $set: { state: 'detached', lastModifiedBy: actor } });
      await Location.updateMany({ tenantId: tenant, logicalDocumentId: logicalId }, { $set: { state: 'revoked' } });
    }
    return document;
  }

  return {
    addVersion,
    archiveMigratedDocument,
    getDocumentGraph,
    registerCopy,
    registerDocument,
    registerLocation,
    resolveDocumentAlias,
  };
}

module.exports = {
  deterministicKey,
  makeLogicalDocumentService,
  ...makeLogicalDocumentService(),
};
