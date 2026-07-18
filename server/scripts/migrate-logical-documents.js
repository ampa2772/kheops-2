/*
 * Migration non destructive StoredDocument + snapshots Dossier vers le
 * registre de documents logiques. DRY-RUN par défaut.
 *
 *   node server/scripts/migrate-logical-documents.js --tenant=<id> --user=<id>
 *   ... --apply --run-id=documents-2026-07
 *   ... --rollback=documents-2026-07
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

async function accessibleDossierIds(tenantId) {
  const Tenant = require('../models/Cabinet/Tenant');
  const Membership = require('../models/Cabinet/Membership');
  const UserDossier = require('../models/Folder/modelsLiaisons/UserDossier');
  const tenant = await Tenant.findById(tenantId).select('ownerUserId').lean();
  if (!tenant) throw new Error('Cabinet introuvable.');
  const memberships = await Membership.find({ tenantId, status: 'active' }).select('userId').lean();
  const users = [tenant.ownerUserId, ...memberships.map((item) => item.userId)];
  const links = await UserDossier.find({ user: { $in: users } }).select('dossier').lean();
  return [...new Set(links.map((item) => String(item.dossier)))]
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

async function loadLegacyDocuments(tenantId, actorId) {
  const StoredDocument = require('../models/Storage/StoredDocument');
  const Dossier = require('../models/Folder/Dossier');
  const dossierIds = await accessibleDossierIds(tenantId);
  const [storedDocuments, dossiers] = await Promise.all([
    StoredDocument.find({
      deletedAt: null,
      $or: [{ tenantId }, { dossierId: { $in: dossierIds } }],
    }).lean(),
    Dossier.find({ _id: { $in: dossierIds } }).select('_id tenantId dossier.documents').lean(),
  ]);
  const embeddedDocuments = [];
  dossiers.forEach((dossier) => {
    const documents = dossier?.dossier?.documents || [];
    documents.forEach((document) => embeddedDocuments.push({
      tenantId: dossier.tenantId || tenantId,
      dossierId: dossier._id,
      ownerUserId: actorId,
      document,
    }));
  });
  return { storedDocuments, embeddedDocuments };
}

async function main() {
  const tenantId = option('tenant');
  const userId = option('user');
  const rollbackRunId = option('rollback');
  const runId = option('run-id');
  const apply = process.argv.includes('--apply');
  if (!mongoose.Types.ObjectId.isValid(String(tenantId || '')) || !mongoose.Types.ObjectId.isValid(String(userId || ''))) {
    throw new Error('--tenant=<ObjectId> et --user=<ObjectId> sont obligatoires.');
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI manquant.');
  await mongoose.connect(process.env.MONGODB_URI);
  const migration = require('../services/sync/legacyDocumentMigration');
  try {
    if (rollbackRunId) {
      const result = await migration.rollback({ tenantId, userId, runId: rollbackRunId, note: option('note') || '' });
      console.log(JSON.stringify({ mode: 'rollback', runId: rollbackRunId, rolledBack: result.rolledBack || 0, idempotent: result.idempotent }, null, 2));
      return;
    }
    const sources = await loadLegacyDocuments(tenantId, userId);
    const result = await migration.execute({ tenantId, userId, ...sources, dryRun: !apply, runId });
    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      runId: result.run?.runId || runId || null,
      scanned: result.plan.scanned,
      planned: result.plan.unique.length,
      duplicates: result.plan.duplicates.length,
      skipped: result.plan.skipped.length,
      written: apply ? result.run?.stats : null,
    }, null, 2));
    if (!apply) console.log('DRY-RUN : aucune écriture. Ajouter --apply --run-id=<id-stable> pour appliquer.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('[migrate-logical-documents]', err);
  process.exitCode = 1;
});
