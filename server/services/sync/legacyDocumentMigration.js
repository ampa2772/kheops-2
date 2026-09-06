const crypto = require('crypto');
const mongoose = require('mongoose');
const DataMigrationRun = require('../../models/Documents/DataMigrationRun');
const logicalDocumentService = require('./logicalDocumentService');

function stringId(value) {
  return value == null ? '' : String(value._id || value);
}

function inferProvider(storageKey) {
  const key = String(storageKey || '').toLowerCase();
  if (key.startsWith('gdrive:') || key.startsWith('google:') || key.startsWith('googledrive:')) return 'google_drive';
  if (key.startsWith('onedrive:') || key.startsWith('onedrive-v2:')) return 'onedrive';
  if (key.startsWith('sharepoint:')) return 'sharepoint';
  if (key.startsWith('documents/') || key.startsWith('tenants/')) return 'canonical';
  return 'managed_gcs';
}

function currentVersion(record) {
  const versions = Array.isArray(record.versions) ? record.versions : [];
  return versions.find((version) => String(version.versionId) === String(record.currentVersionId)) || versions[versions.length - 1] || null;
}

function normalizeStored(record) {
  const tenantId = stringId(record.tenantId);
  const dossierId = stringId(record.dossierId);
  const logicalLegacyId = stringId(record.documentId || record._id);
  if (!tenantId || !dossierId || !logicalLegacyId) return null;
  const selected = currentVersion(record);
  const title = selected?.filename || record.filename || `Document ${logicalLegacyId}`;
  const versions = (Array.isArray(record.versions) ? record.versions : []).slice().sort((a, b) => {
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  }).map((version, index) => ({
    versionId: String(version.versionId || `legacy-${index + 1}`),
    sequence: index + 1,
    checksum: String(version.checksum || `unknown-${stringId(record._id)}-${index + 1}`).toLowerCase(),
    size: Number(version.size) || 0,
    mime: version.mime || 'application/octet-stream',
    filename: version.filename || title,
    storageRef: {
      provider: inferProvider(version.storageKey),
      storageKey: version.storageKey || '',
    },
    editor: 'migration',
    origin: version.origin || 'legacy',
    status: version.status || 'draft',
    createdBy: version.createdBy || record.ownerUserId,
    idempotencyKey: `legacy-version:${stringId(record._id)}:${String(version.versionId || index + 1)}`,
  }));
  return {
    sourceId: stringId(record._id),
    tenantId,
    dossierId,
    logicalLegacyId,
    ownerUserId: stringId(record.ownerUserId),
    input: {
      identityKey: `legacy-document:${logicalLegacyId}`,
      title,
      documentType: 'document',
      preferredMime: selected?.mime || 'application/octet-stream',
      aliases: [
        { system: 'stored_document', externalId: stringId(record._id) },
        { system: 'legacy_document', externalId: logicalLegacyId },
      ],
      provenance: {
        source: 'migration',
        sourceId: stringId(record._id),
        sourceCollection: 'StoredDocument',
        originalFilename: title,
      },
      idempotencyKey: `legacy-logical-document:${stringId(record._id)}`,
    },
    versions,
    currentVersionId: selected && String(selected.versionId),
    currentStorageKey: selected?.storageKey || '',
  };
}

function normalizeEmbedded(record) {
  const document = record.document || record;
  const tenantId = stringId(record.tenantId);
  const dossierId = stringId(record.dossierId);
  const legacyId = stringId(document._id || document.documentId);
  if (!tenantId || !dossierId || !legacyId) return null;
  return {
    sourceId: legacyId,
    tenantId,
    dossierId,
    logicalLegacyId: legacyId,
    ownerUserId: stringId(record.ownerUserId),
    input: {
      identityKey: `legacy-document:${legacyId}`,
      title: document.nomDocument || document.name || `Document ${legacyId}`,
      documentType: document.categorie || 'document',
      preferredMime: document.mime || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      aliases: [
        { system: 'legacy-dossier-document', externalId: legacyId },
        { system: 'dossier_embedded_document', externalId: legacyId },
      ],
      provenance: {
        source: 'migration',
        sourceId: legacyId,
        sourceCollection: 'Dossier.dossier.documents',
        originalFilename: document.nomDocument || '',
      },
      idempotencyKey: `legacy-embedded-document:${dossierId}:${legacyId}`,
    },
    versions: [],
    currentVersionId: null,
    currentStorageKey: '',
  };
}

function planLegacyDocuments({ storedDocuments = [], embeddedDocuments = [] } = {}) {
  const scanned = storedDocuments.length + embeddedDocuments.length;
  const candidates = [];
  const skipped = [];
  storedDocuments.forEach((record) => {
    const normalized = normalizeStored(record);
    if (normalized) candidates.push(normalized);
    else skipped.push({ source: 'StoredDocument', sourceId: stringId(record), reason: 'missing_scope_or_identity' });
  });
  embeddedDocuments.forEach((record) => {
    const normalized = normalizeEmbedded(record);
    if (normalized) candidates.push(normalized);
    else skipped.push({ source: 'Dossier', sourceId: stringId(record.document || record), reason: 'missing_scope_or_identity' });
  });
  const unique = [];
  const duplicates = [];
  const index = new Map();
  for (const item of candidates) {
    const key = `${item.tenantId}:${item.dossierId}:${item.logicalLegacyId}`;
    const prior = index.get(key);
    if (!prior) {
      index.set(key, item);
      unique.push(item);
      continue;
    }
    // StoredDocument possède les versions et gagne sur le simple snapshot du dossier.
    if (item.versions.length > prior.versions.length) {
      const position = unique.indexOf(prior);
      unique[position] = item;
      index.set(key, item);
      duplicates.push(prior);
    } else {
      duplicates.push(item);
    }
  }
  return { scanned, candidates, unique, duplicates, skipped };
}

function makeLegacyDocumentMigration({
  MigrationRun = DataMigrationRun,
  documents = logicalDocumentService,
} = {}) {
  async function execute({ tenantId, userId, storedDocuments, embeddedDocuments, dryRun = true, runId }) {
    const tenant = new mongoose.Types.ObjectId(String(tenantId));
    const actor = new mongoose.Types.ObjectId(String(userId));
    const plan = planLegacyDocuments({
      storedDocuments: (storedDocuments || []).filter((item) => String(item.tenantId) === String(tenant)),
      embeddedDocuments: (embeddedDocuments || []).filter((item) => String(item.tenantId) === String(tenant)),
    });
    if (dryRun) return { dryRun: true, runId: null, plan };
    const migrationRunId = runId || `documents-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
    const already = await MigrationRun.findOne({ tenantId: tenant, runId: migrationRunId });
    if (already && already.status === 'completed') return { dryRun: false, idempotent: true, run: already, plan };
    const run = already || await MigrationRun.create({
      tenantId: tenant,
      runId: migrationRunId,
      domain: 'documents',
      status: 'running',
      stats: { scanned: plan.scanned, planned: plan.unique.length, skipped: plan.skipped.length },
      startedBy: actor,
    });
    let created = 0;
    let deduplicated = plan.duplicates.length;
    let errors = 0;
    const resources = [];
    const runErrors = [];
    for (const item of plan.unique) {
      try {
        item.input.provenance.importBatchId = migrationRunId;
        item.input.migrationState = { status: 'migrated', runId: migrationRunId };
        const registration = await documents.registerDocument({
          tenantId: tenant,
          dossierId: item.dossierId,
          userId: actor,
          input: item.input,
        });
        const logical = registration.document.toObject ? registration.document.toObject() : registration.document;
        if (registration.created) created += 1;
        else deduplicated += 1;
        let baseVersionId = logical.currentVersionId || null;
        for (const version of item.versions) {
          const versionResult = await documents.addVersion({
            tenantId: tenant,
            logicalDocumentId: logical._id,
            userId: version.createdBy || actor,
            input: { ...version, baseVersionId },
          });
          if (!versionResult.conflict) baseVersionId = versionResult.version.versionId;
        }
        if (item.currentVersionId || item.currentStorageKey) {
          const copyResult = await documents.registerCopy({
            tenantId: tenant,
            logicalDocumentId: logical._id,
            userId: actor,
            input: {
              copyKey: `legacy-canonical:${item.sourceId}`,
              basedOnVersionId: item.currentVersionId || baseVersionId,
              format: (item.input.preferredMime || '').includes('wordprocessingml') ? 'docx' : 'binary',
              purpose: 'canonical',
              state: 'synced',
              idempotencyKey: `legacy-copy:${item.sourceId}`,
            },
          });
          if (item.currentStorageKey) {
            await documents.registerLocation({
              tenantId: tenant,
              copyId: copyResult.copy._id,
              userId: actor,
              input: {
                locationKey: `legacy-location:${item.sourceId}`,
                provider: inferProvider(item.currentStorageKey),
                storageKey: item.currentStorageKey,
                state: 'available',
                idempotencyKey: `legacy-location:${item.sourceId}`,
              },
            });
          }
        }
        resources.push({
          resourceType: 'logical_document',
          resourceId: String(logical._id),
          legacyCollection: item.input.provenance.sourceCollection,
          legacyId: item.sourceId,
        });
      } catch (err) {
        errors += 1;
        runErrors.push({ sourceId: item.sourceId, code: err.code || 'DOCUMENT_MIGRATION_ERROR', message: err.message, at: new Date() });
      }
    }
    run.status = errors ? 'failed' : 'completed';
    run.stats = {
      scanned: plan.scanned,
      planned: plan.unique.length,
      created,
      deduplicated,
      skipped: plan.skipped.length,
      errors,
      rolledBack: 0,
    };
    run.resources = resources.slice(0, 50000);
    run.errorLog = runErrors.slice(0, 500);
    run.completedAt = new Date();
    await run.save();
    return { dryRun: false, idempotent: false, run, plan };
  }

  async function rollback({ tenantId, userId, runId, note = '' }) {
    const tenant = new mongoose.Types.ObjectId(String(tenantId));
    const actor = new mongoose.Types.ObjectId(String(userId));
    const run = await MigrationRun.findOne({ tenantId: tenant, runId, domain: 'documents' });
    if (!run) throw Object.assign(new Error('Migration introuvable.'), { statusCode: 404, code: 'MIGRATION_NOT_FOUND' });
    if (run.status === 'rolled_back') return { run, idempotent: true };
    run.status = 'rolling_back';
    run.rollback = { requestedBy: actor, startedAt: new Date(), note: String(note || '').slice(0, 1000) };
    await run.save();
    let rolledBack = 0;
    for (const resource of run.resources.filter((item) => item.resourceType === 'logical_document')) {
      const archived = await documents.archiveMigratedDocument({
        tenantId: tenant,
        logicalDocumentId: resource.resourceId,
        userId: actor,
        runId,
      });
      if (archived) rolledBack += 1;
    }
    run.status = 'rolled_back';
    run.stats.rolledBack = rolledBack;
    run.rollback.completedAt = new Date();
    await run.save();
    return { run, idempotent: false, rolledBack };
  }

  return { execute, rollback };
}

module.exports = {
  inferProvider,
  makeLegacyDocumentMigration,
  normalizeEmbedded,
  normalizeStored,
  planLegacyDocuments,
  ...makeLegacyDocumentMigration(),
};
