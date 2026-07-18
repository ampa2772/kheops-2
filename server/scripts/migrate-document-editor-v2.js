/*
 * Migration additive de l'Éditeur Kheops v2. DRY-RUN par défaut.
 *
 *   node server/scripts/migrate-document-editor-v2.js --tenant=<ObjectId>
 *   node server/scripts/migrate-document-editor-v2.js --tenant=<ObjectId> --apply
 *   node server/scripts/migrate-document-editor-v2.js --tenant=<ObjectId> --rollback
 *   node server/scripts/migrate-document-editor-v2.js --tenant=<ObjectId> --rollback --apply
 *
 * La migration ne réécrit jamais les blocs ni les octets DOCX. Elle ajoute les
 * métadonnées de modèle/exceptions et harmonise l'ancien statut `approved` en
 * `validated`. La normalisation complète au schéma v2 est faite lors de la
 * prochaine édition explicite du document.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

function option(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function defaultOverrides(value = {}) {
  return {
    layout: Boolean(value.layout),
    header: Boolean(value.header),
    footer: Boolean(value.footer),
    signature: Boolean(value.signature),
    styles: Boolean(value.styles),
  };
}

const MIGRATION_KEY = 'document-editor-v2';

function stateSnapshot(state) {
  return {
    status: state.status ?? null,
    documentType: state.documentType ?? null,
    localOverrides: state.localOverrides ?? null,
    presence: {
      status: Object.prototype.hasOwnProperty.call(state, 'status'),
      documentType: Object.prototype.hasOwnProperty.call(state, 'documentType'),
      localOverrides: Object.prototype.hasOwnProperty.call(state, 'localOverrides'),
    },
  };
}

function stateApplied(state) {
  return {
    status: state.status === 'approved' ? 'validated' : (state.status || 'draft'),
    documentType: state.documentType || state.structuredDocument?.documentType || 'generic',
    localOverrides: defaultOverrides(state.localOverrides),
  };
}

function stateRollbackUpdate(before) {
  const $set = {};
  const $unset = {};
  for (const field of ['status', 'documentType', 'localOverrides']) {
    if (before.presence?.[field]) $set[field] = before[field];
    else $unset[field] = '';
  }
  return { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) };
}

function sameStateMigrationFields(before, applied) {
  const current = {
    status: before.presence?.status ? before.status : undefined,
    documentType: before.presence?.documentType ? before.documentType : undefined,
    localOverrides: before.presence?.localOverrides ? defaultOverrides(before.localOverrides) : undefined,
  };
  return current.status === applied.status
    && current.documentType === applied.documentType
    && JSON.stringify(current.localOverrides) === JSON.stringify(applied.localOverrides);
}

async function main() {
  const tenantId = option('tenant');
  const apply = process.argv.includes('--apply');
  const rollback = process.argv.includes('--rollback');
  if (!mongoose.Types.ObjectId.isValid(String(tenantId || ''))) throw new Error('--tenant=<ObjectId> est obligatoire.');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI manquant.');
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });

  const DocumentEditorState = require('../models/DocumentEditor/DocumentEditorState');
  const DocumentEditorRevision = require('../models/DocumentEditor/DocumentEditorRevision');
  const DocumentTemplate = require('../models/DocumentEditor/DocumentTemplate');
  const DocumentReference = require('../models/DocumentEditor/DocumentReference');
  const DocumentEditorComment = require('../models/DocumentEditor/DocumentEditorComment');
  const DocumentHistory = require('../models/Storage/DocumentHistory');
  const StoredDocument = require('../models/Storage/StoredDocument');
  const MigrationBackup = require('../models/Migrations/MigrationBackup');

  try {
    if (rollback) {
      const backups = await MigrationBackup.find({ tenantId, migrationKey: MIGRATION_KEY, restoredAt: null }).lean();
      if (!apply) {
        console.log(JSON.stringify({ mode: 'rollback-dry-run', tenantId, candidates: backups.length }, null, 2));
        console.log('Aucune écriture. Ajouter --rollback --apply pour restaurer uniquement les valeurs sauvegardées par cette migration.');
        return;
      }
      let restored = 0;
      let skipped = 0;
      for (const backup of backups) {
        let result = null;
        if (backup.resourceType === 'editor-state') {
          result = await DocumentEditorState.updateOne(
            {
              _id: backup.resourceId,
              tenantId,
              status: backup.applied.status,
              documentType: backup.applied.documentType,
              'localOverrides.layout': backup.applied.localOverrides?.layout,
              'localOverrides.header': backup.applied.localOverrides?.header,
              'localOverrides.footer': backup.applied.localOverrides?.footer,
              'localOverrides.signature': backup.applied.localOverrides?.signature,
              'localOverrides.styles': backup.applied.localOverrides?.styles,
            },
            stateRollbackUpdate(backup.before),
          );
        } else if (backup.resourceType === 'editor-revision') {
          result = await DocumentEditorRevision.updateOne(
            { _id: backup.resourceId, tenantId, status: 'validated' },
            { $set: { status: 'approved' } },
          );
        } else if (backup.resourceType === 'document-history-version') {
          result = await DocumentHistory.updateOne(
            {
              _id: backup.before.parentId,
              tenantId,
              versions: { $elemMatch: { versionId: backup.before.versionId, status: 'validated' } },
            },
            { $set: { 'versions.$[version].status': 'approved' } },
            { arrayFilters: [{ 'version.versionId': backup.before.versionId, 'version.status': 'validated' }] },
          );
        } else if (backup.resourceType === 'stored-document-version') {
          result = await StoredDocument.updateOne(
            {
              _id: backup.before.parentId,
              tenantId,
              versions: { $elemMatch: { versionId: backup.before.versionId, status: 'validated' } },
            },
            { $set: { 'versions.$[version].status': 'approved' } },
            { arrayFilters: [{ 'version.versionId': backup.before.versionId, 'version.status': 'validated' }] },
          );
        }
        const matched = Number(result?.matchedCount ?? result?.n ?? 0) > 0;
        if (matched) {
          restored += 1;
          await MigrationBackup.updateOne({ _id: backup._id }, { $set: { restoredAt: new Date() } });
        } else skipped += 1;
      }
      console.log(JSON.stringify({ mode: 'rollback', tenantId, candidates: backups.length, restored, skipped }, null, 2));
      if (skipped) console.log('Les éléments ignorés ont changé après la migration ; leurs sauvegardes sont conservées pour examen manuel.');
      return;
    }

    const states = await DocumentEditorState.find({ tenantId })
      .select('_id status documentType localOverrides structuredDocument.documentType')
      .lean();
    const statesToMigrate = states.filter((state) => !sameStateMigrationFields(stateSnapshot(state), stateApplied(state)));
    const stateOperations = statesToMigrate.map((state) => ({
      updateOne: {
        filter: { _id: state._id },
        update: { $set: {
          ...stateApplied(state),
        } },
      },
    }));

    const [legacyRevisions, legacyHistories, legacyStoredDocuments] = await Promise.all([
      DocumentEditorRevision.find({ tenantId, status: 'approved' }).select('_id').lean(),
      DocumentHistory.find({ tenantId, 'versions.status': 'approved' }).select('_id versions.versionId versions.status').lean(),
      StoredDocument.find({ tenantId, 'versions.status': 'approved' }).select('_id versions.versionId versions.status').lean(),
    ]);
    const backups = [
      ...statesToMigrate.map((state) => ({ resourceType: 'editor-state', resourceId: String(state._id), before: stateSnapshot(state), applied: stateApplied(state) })),
      ...legacyRevisions.map((revision) => ({ resourceType: 'editor-revision', resourceId: String(revision._id), before: { status: 'approved' }, applied: { status: 'validated' } })),
      ...legacyHistories.flatMap((history) => (history.versions || []).filter((version) => version.status === 'approved').map((version) => ({
        resourceType: 'document-history-version', resourceId: `${history._id}:${version.versionId}`,
        before: { parentId: String(history._id), versionId: version.versionId, status: 'approved' }, applied: { status: 'validated' },
      }))),
      ...legacyStoredDocuments.flatMap((document) => (document.versions || []).filter((version) => version.status === 'approved').map((version) => ({
        resourceType: 'stored-document-version', resourceId: `${document._id}:${version.versionId}`,
        before: { parentId: String(document._id), versionId: version.versionId, status: 'approved' }, applied: { status: 'validated' },
      }))),
    ];

    const report = {
      mode: apply ? 'apply' : 'dry-run',
      tenantId,
      editorStatesScanned: states.length,
      editorStatesPlanned: stateOperations.length,
      revisionsWithLegacyStatus: legacyRevisions.length,
      historiesWithLegacyStatus: legacyHistories.length,
      storedDocumentsWithLegacyStatus: legacyStoredDocuments.length,
      rollbackBackupsPlanned: backups.length,
      indexes: ['DocumentTemplate', 'DocumentReference', 'DocumentEditorComment'],
    };

    if (apply) {
      if (backups.length) {
        await MigrationBackup.bulkWrite(backups.map((backup) => ({
          updateOne: {
            filter: { tenantId, migrationKey: MIGRATION_KEY, resourceType: backup.resourceType, resourceId: backup.resourceId },
            update: {
              $set: {
                tenantId,
                migrationKey: MIGRATION_KEY,
                ...backup,
                restoredAt: null,
              },
            },
            upsert: true,
          },
        })), { ordered: false });
      }
      if (stateOperations.length) await DocumentEditorState.bulkWrite(stateOperations, { ordered: false });
      await Promise.all([
        DocumentEditorRevision.updateMany({ tenantId, status: 'approved' }, { $set: { status: 'validated' } }),
        DocumentHistory.updateMany(
          { tenantId, 'versions.status': 'approved' },
          { $set: { 'versions.$[version].status': 'validated' } },
          { arrayFilters: [{ 'version.status': 'approved' }] },
        ),
        StoredDocument.updateMany(
          { tenantId, 'versions.status': 'approved' },
          { $set: { 'versions.$[version].status': 'validated' } },
          { arrayFilters: [{ 'version.status': 'approved' }] },
        ),
        DocumentTemplate.createIndexes(),
        DocumentReference.createIndexes(),
        DocumentEditorComment.createIndexes(),
        MigrationBackup.createIndexes(),
      ]);
    }

    console.log(JSON.stringify(report, null, 2));
    if (!apply) console.log('DRY-RUN : aucune écriture. Relancer avec --apply après vérification.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('[migrate-document-editor-v2]', error);
  process.exitCode = 1;
});
