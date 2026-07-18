const crypto = require('crypto');
const mongoose = require('mongoose');
const ContactIdentity = require('../../models/Relations/ContactIdentity');
const DataMigrationRun = require('../../models/Documents/DataMigrationRun');
const contactIdentities = require('./contactIdentityService');
const { normalizeContact } = require('./contactIdentityService');

function id(value) {
  return value == null ? '' : String(value._id || value);
}

function clean(value) {
  return String(value || '').trim();
}

function migrationInput(record, collection, input) {
  if (!id(record?._id) || !clean(input.displayName)) return null;
  return {
    ...input,
    aliases: [{
      system: `legacy-${collection.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`,
      externalId: id(record._id),
      sourceCollection: collection,
    }],
    provenance: [{
      source: 'migration',
      sourceCollection: collection,
      sourceId: id(record._id),
    }],
    idempotencyKey: `legacy-contact:${collection}:${id(record._id)}`,
  };
}

const adapters = {
  Contact(record) {
    const displayName = clean([record.prenoms, record.nom].filter(Boolean).join(' ')
      || record.appellationCourrier);
    const kind = record.pro_contact
      ? 'professional'
      : (record.contactType === 'morale' ? 'organization' : 'person');
    return migrationInput(record, 'Contact', {
      kind,
      displayName,
      email: record.email,
      phone: record.telephone,
    });
  },
  ContactPM(record) {
    return migrationInput(record, 'ContactPM', {
      kind: 'organization',
      displayName: clean(record.raisonSociale || [record.interlocuteurPrenom, record.interlocuteurNom].filter(Boolean).join(' ')),
      email: record.emailEntreprise || record.interlocuteurEmail,
      phone: record.telephoneEntreprise || record.interlocuteurTelephone,
      siret: record.siret,
    });
  },
  ContactPMPublique(record) {
    return migrationInput(record, 'ContactPMPublique', {
      kind: 'public_body',
      displayName: clean(record.denomination || [record.contactPrenom, record.contactNom].filter(Boolean).join(' ')),
      email: record.email || record.contactEmail || record.interlocuteurEmail,
      phone: record.contactTelephone || record.interlocuteurTelephone,
    });
  },
};

function planLegacyContacts(sources = {}) {
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
          skipped.push({ collection, sourceId: id(record), reason: 'missing_display_name' });
          continue;
        }
        const normalized = normalizeContact(input);
        planned.push({ collection, sourceId: id(record), input, normalized });
      } catch (err) {
        errors.push({ collection, sourceId: id(record), code: err.code || 'ADAPTER_ERROR', message: err.message });
      }
    }
  }

  // Seul un alias historique strictement identique est dédupliqué
  // automatiquement. Les similitudes e-mail/téléphone/SIRET restent des
  // suggestions à confirmer par un humain.
  const unique = [];
  const duplicates = [];
  const byIdentityKey = new Map();
  for (const item of planned) {
    const existing = byIdentityKey.get(item.normalized.identityKey);
    if (existing) duplicates.push({ ...item, duplicateOf: existing.sourceId });
    else {
      byIdentityKey.set(item.normalized.identityKey, item);
      unique.push(item);
    }
  }

  const candidatesByKey = new Map();
  unique.forEach((item) => item.normalized.duplicateKeys.forEach((key) => {
    if (!candidatesByKey.has(key)) candidatesByKey.set(key, []);
    candidatesByKey.get(key).push({ collection: item.collection, sourceId: item.sourceId, displayName: item.normalized.displayName });
  }));
  const likelyDuplicateGroups = [...candidatesByKey.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => ({ key, items }));

  return { scanned, planned, unique, duplicates, likelyDuplicateGroups, skipped, errors };
}

function makeLegacyContactMigration({
  Identity = ContactIdentity,
  MigrationRun = DataMigrationRun,
  identities = contactIdentities,
} = {}) {
  async function execute({ tenantId, userId, sources, dryRun = true, runId }) {
    const plan = planLegacyContacts(sources);
    if (dryRun) return { dryRun: true, runId: null, plan };
    const tenant = new mongoose.Types.ObjectId(String(tenantId));
    const actor = new mongoose.Types.ObjectId(String(userId));
    const migrationRunId = runId || `contacts-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
    const already = await MigrationRun.findOne({ tenantId: tenant, runId: migrationRunId });
    if (already && already.status === 'completed') return { dryRun: false, idempotent: true, run: already, plan };
    const run = already || await MigrationRun.create({
      tenantId: tenant,
      runId: migrationRunId,
      domain: 'relations',
      status: 'running',
      options: { resource: 'contact-identities', automaticMerge: false },
      stats: { scanned: plan.scanned, planned: plan.unique.length, skipped: plan.skipped.length, errors: plan.errors.length },
      errorLog: plan.errors.slice(0, 500),
      startedBy: actor,
    });
    const resources = [];
    const runtimeErrors = [];
    let created = 0;
    let deduplicated = plan.duplicates.length;
    let errorCount = plan.errors.length;

    for (const item of plan.unique) {
      try {
        item.input.provenance[0].importBatchId = migrationRunId;
        item.input.migrationState = { status: 'migrated', runId: migrationRunId };
        const result = await identities.register({ tenantId: tenant, userId: actor, input: item.input });
        if (result.created) created += 1;
        else deduplicated += 1;
        const identity = result.identity.toObject ? result.identity.toObject() : result.identity;
        resources.push({
          resourceType: 'contact_identity',
          resourceId: String(identity._id),
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
    if (!run || run.options?.resource !== 'contact-identities') {
      throw Object.assign(new Error('Migration de contacts introuvable.'), { statusCode: 404, code: 'MIGRATION_NOT_FOUND' });
    }
    if (run.status === 'rolled_back') return { run, idempotent: true, rolledBack: run.stats?.rolledBack || 0 };
    run.status = 'rolling_back';
    run.rollback = { requestedBy: actor, startedAt: new Date(), note: String(note || '').slice(0, 1000) };
    await run.save();
    let rolledBack = 0;
    for (const resource of run.resources.filter((item) => item.resourceType === 'contact_identity')) {
      const archived = await identities.archiveMigrated({
        tenantId: tenant,
        identityId: resource.resourceId,
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
  adapters,
  makeLegacyContactMigration,
  planLegacyContacts,
  ...makeLegacyContactMigration(),
};
