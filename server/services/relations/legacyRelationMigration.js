const crypto = require('crypto');
const mongoose = require('mongoose');
const EntityRelation = require('../../models/Relations/EntityRelation');
const DataMigrationRun = require('../../models/Documents/DataMigrationRun');
const relationService = require('./relationService');
const { normalizeRelationInput, relationDedupeKey } = require('./relationKey');

function id(value) {
  return value == null ? '' : String(value._id || value);
}

function endpoint(entityType, entityId, labelSnapshot = '') {
  return { entityType, entityId: id(entityId), labelSnapshot };
}

function base(record, collection, relationType, subject, object, options = {}) {
  if (!id(record?._id) || !subject.entityId || !object.entityId) return null;
  return {
    relationType,
    direction: options.direction || 'directed',
    subject,
    object,
    roles: options.roles || [],
    status: 'active',
    attributes: { legacy: options.attributes || {} },
    provenance: {
      source: 'migration',
      sourceCollection: collection,
      sourceId: id(record._id),
      confidence: options.confidence == null ? 1 : options.confidence,
    },
    idempotencyKey: `legacy-relation:${collection}:${id(record._id)}`,
  };
}

const adapters = {
  ContactRole(record) {
    if (record.contactLie) {
      return base(record, 'ContactRole', 'contact_role', endpoint('contact', record.contact), endpoint('contact', record.contactLie), {
        roles: [{ side: 'subject', code: 'related_contact', label: 'Contact lié' }],
        attributes: { roleId: id(record.role), partieId: id(record.partie) },
      });
    }
    if (record.partie) {
      return base(record, 'ContactRole', 'contact_role_in_party', endpoint('contact', record.contact), endpoint('party', record.partie), {
        roles: [{ side: 'subject', code: 'legacy_role', label: 'Rôle historique' }],
        attributes: { roleId: id(record.role) },
      });
    }
    return null;
  },
  DossierContact: (record) => base(record, 'DossierContact', 'attached_to_dossier', endpoint('contact', record.contact), endpoint('dossier', record.dossier), {
    roles: [{ side: 'subject', code: 'contact', label: 'Contact du dossier' }],
  }),
  ContactPartie: (record) => base(record, 'ContactPartie', 'member_of_party', endpoint('contact', record.contact), endpoint('party', record.partie), {
    roles: [{ side: 'subject', code: 'party_contact', label: 'Contact de la partie' }],
  }),
  DossierPartie: (record) => base(record, 'DossierPartie', 'party_in_dossier', endpoint('party', record.partie), endpoint('dossier', record.dossier), {
    roles: [{ side: 'subject', code: 'party', label: 'Partie au dossier' }],
  }),
  ContactRepresentantLegal: (record) => base(record, 'ContactRepresentantLegal', 'legal_representative_of', endpoint('legal_representative', record.representantLegal), endpoint('contact_pm', record.contactPM), {
    roles: [{ side: 'subject', code: 'legal_representative', label: 'Représentant légal' }],
  }),
  ContactContactDirect: (record) => base(record, 'ContactContactDirect', 'contact_person_for', endpoint('contact_direct', record.contactDirect), endpoint('contact_pm', record.contactPM), {
    roles: [{ side: 'subject', code: 'contact_person', label: 'Interlocuteur' }],
  }),
  UserContact: (record) => base(record, 'UserContact', 'managed_by_user', endpoint('contact', record.contact), endpoint('user', record.user)),
  UserContactPM: (record) => base(record, 'UserContactPM', 'managed_by_user', endpoint('contact_pm', record.contactPM), endpoint('user', record.user)),
  UserContactPMPublique: (record) => base(record, 'UserContactPMPublique', 'managed_by_user', endpoint('contact_pm_public', record.contactPMPublique), endpoint('user', record.user)),
};

function planLegacyRelations(sources = {}) {
  const planned = [];
  const skipped = [];
  const errors = [];
  let scanned = 0;
  for (const [collection, records] of Object.entries(sources)) {
    const adapter = adapters[collection];
    for (const record of Array.isArray(records) ? records : []) {
      scanned += 1;
      if (!adapter) {
        skipped.push({ collection, sourceId: id(record), reason: 'unsupported_collection' });
        continue;
      }
      try {
        const input = adapter(record);
        if (!input) {
          skipped.push({ collection, sourceId: id(record), reason: 'incomplete_relation' });
          continue;
        }
        const normalized = normalizeRelationInput(input);
        planned.push({ collection, sourceId: id(record), input, dedupeKey: relationDedupeKey(normalized) });
      } catch (err) {
        errors.push({ collection, sourceId: id(record), code: err.code || 'ADAPTER_ERROR', message: err.message });
      }
    }
  }
  const unique = [];
  const duplicates = [];
  const byDedupe = new Map();
  for (const item of planned) {
    if (byDedupe.has(item.dedupeKey)) {
      duplicates.push({ ...item, duplicateOf: byDedupe.get(item.dedupeKey).sourceId });
    } else {
      byDedupe.set(item.dedupeKey, item);
      unique.push(item);
    }
  }
  return { scanned, planned, unique, duplicates, skipped, errors };
}

function makeLegacyRelationMigration({
  Relation = EntityRelation,
  MigrationRun = DataMigrationRun,
  relations = relationService,
} = {}) {
  async function execute({ tenantId, userId, sources, dryRun = true, runId }) {
    const plan = planLegacyRelations(sources);
    if (dryRun) return { dryRun: true, runId: null, plan };
    const tenant = new mongoose.Types.ObjectId(String(tenantId));
    const actor = new mongoose.Types.ObjectId(String(userId));
    const migrationRunId = runId || `relations-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
    const already = await MigrationRun.findOne({ tenantId: tenant, runId: migrationRunId });
    if (already && already.status === 'completed') return { dryRun: false, idempotent: true, run: already, plan };
    const run = already || await MigrationRun.create({
      tenantId: tenant,
      runId: migrationRunId,
      domain: 'relations',
      status: 'running',
      stats: { scanned: plan.scanned, planned: plan.unique.length, skipped: plan.skipped.length, errors: plan.errors.length },
      errorLog: plan.errors.slice(0, 500),
      startedBy: actor,
    });
    const resources = [];
    let created = 0;
    let deduplicated = plan.duplicates.length;
    let errorCount = plan.errors.length;
    const runtimeErrors = [];
    for (const item of plan.unique) {
      try {
        item.input.provenance.importBatchId = migrationRunId;
        const result = await relations.createRelation({ tenantId: tenant, userId: actor, input: item.input });
        if (result.created) created += 1;
        else deduplicated += 1;
        const relation = result.relation.toObject ? result.relation.toObject() : result.relation;
        resources.push({
          resourceType: 'entity_relation',
          resourceId: String(relation.logicalRelationId),
          legacyCollection: item.collection,
          legacyId: item.sourceId,
        });
      } catch (err) {
        errorCount += 1;
        runtimeErrors.push({ sourceId: item.sourceId, code: err.code || 'MIGRATION_ERROR', message: err.message, at: new Date() });
      }
    }
    run.status = errorCount ? 'failed' : 'completed';
    run.stats = {
      scanned: plan.scanned,
      planned: plan.unique.length,
      created,
      deduplicated,
      skipped: plan.skipped.length,
      errors: errorCount,
      rolledBack: 0,
    };
    run.resources = resources.slice(0, 50000);
    run.errorLog = [...plan.errors, ...runtimeErrors].slice(0, 500);
    run.completedAt = new Date();
    await run.save();
    return { dryRun: false, idempotent: false, run, plan };
  }

  async function rollback({ tenantId, userId, runId, note = '' }) {
    const tenant = new mongoose.Types.ObjectId(String(tenantId));
    const actor = new mongoose.Types.ObjectId(String(userId));
    const run = await MigrationRun.findOne({ tenantId: tenant, runId, domain: 'relations' });
    if (!run) throw Object.assign(new Error('Migration introuvable.'), { statusCode: 404, code: 'MIGRATION_NOT_FOUND' });
    if (run.status === 'rolled_back') return { run, idempotent: true };
    run.status = 'rolling_back';
    run.rollback = { requestedBy: actor, startedAt: new Date(), note: String(note || '').slice(0, 1000) };
    await run.save();
    let rolledBack = 0;
    for (const resource of run.resources.filter((item) => item.resourceType === 'entity_relation')) {
      const current = await Relation.findOne({
        tenantId: tenant,
        logicalRelationId: resource.resourceId,
        isCurrent: true,
      }).lean();
      // Une modification utilisateur postérieure ne doit jamais être annulée
      // par le rollback technique d'une migration.
      if (!current || current.provenance?.importBatchId !== runId || current.status === 'archived') continue;
      await relations.transitionRelation({
        tenantId: tenant,
        userId: actor,
        logicalRelationId: current.logicalRelationId,
        patch: {
          status: 'archived',
          provenance: {
            source: 'migration',
            sourceCollection: current.provenance?.sourceCollection,
            sourceId: current.provenance?.sourceId,
            importBatchId: runId,
            note: `Rollback non destructif : ${note || 'migration annulée'}`,
          },
        },
        idempotencyKey: `rollback:${runId}:${current.logicalRelationId}`,
      });
      rolledBack += 1;
    }
    run.status = 'rolled_back';
    run.stats.rolledBack = rolledBack;
    run.rollback.completedAt = new Date();
    await run.save();
    return { run, idempotent: false, rolledBack };
  }

  return { execute, rollback };
}

module.exports = { adapters, makeLegacyRelationMigration, planLegacyRelations, ...makeLegacyRelationMigration() };
