/*
 * Migration non destructive des liaisons historiques vers EntityRelation.
 * DRY-RUN par défaut :
 *   node server/scripts/migrate-legacy-relations.js --tenant=<id> --user=<id>
 * Appliquer (run-id recommandé pour une reprise certaine) :
 *   ... --apply --run-id=relations-2026-07
 * Rollback historisé (aucune suppression) :
 *   ... --rollback=relations-2026-07
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

function ids(values) {
  return [...new Set(values.filter(Boolean).map(String))]
    .filter((value) => mongoose.Types.ObjectId.isValid(value))
    .map((value) => new mongoose.Types.ObjectId(value));
}

async function tenantUserIds(tenantId) {
  const Tenant = require('../models/Cabinet/Tenant');
  const Membership = require('../models/Cabinet/Membership');
  const tenant = await Tenant.findById(tenantId).select('ownerUserId').lean();
  if (!tenant) throw new Error('Cabinet introuvable.');
  const members = await Membership.find({ tenantId, status: 'active' }).select('userId').lean();
  return ids([tenant.ownerUserId, ...members.map((item) => item.userId)]);
}

async function loadSources(tenantId) {
  const users = await tenantUserIds(tenantId);
  const UserContact = require('../models/Folder/modelsLiaisons/UserContact');
  const UserContactPM = require('../models/Folder/modelsLiaisons/UserContactPM');
  const UserContactPMPublique = require('../models/Folder/modelsLiaisons/UserContactPMPublique');
  const UserDossier = require('../models/Folder/modelsLiaisons/UserDossier');
  const ContactRole = require('../models/Folder/modelsLiaisons/ContactRole');
  const DossierContact = require('../models/Folder/modelsLiaisons/DossierContact');
  const ContactPartie = require('../models/Folder/modelsLiaisons/ContactPartie');
  const DossierPartie = require('../models/Folder/modelsLiaisons/DossierPartie');
  const ContactRepresentantLegal = require('../models/Folder/modelsLiaisons/ContactRepresentantLegal');
  const ContactContactDirect = require('../models/Folder/modelsLiaisons/ContactContactDirect');

  const [userContacts, userContactsPM, userContactsPub, userDossiers] = await Promise.all([
    UserContact.find({ user: { $in: users } }).lean(),
    UserContactPM.find({ user: { $in: users } }).lean(),
    UserContactPMPublique.find({ user: { $in: users } }).lean(),
    UserDossier.find({ user: { $in: users } }).lean(),
  ]);
  const contactIds = ids(userContacts.map((item) => item.contact));
  const contactPMIds = ids(userContactsPM.map((item) => item.contactPM));
  const dossierIds = ids(userDossiers.map((item) => item.dossier));
  const dossierParties = await DossierPartie.find({ dossier: { $in: dossierIds } }).lean();
  const partieIds = ids(dossierParties.map((item) => item.partie));
  const [contactRoles, dossierContacts, contactParties, representatives, directContacts] = await Promise.all([
    ContactRole.find({ $or: [{ contact: { $in: contactIds } }, { partie: { $in: partieIds } }] }).lean(),
    DossierContact.find({ dossier: { $in: dossierIds } }).lean(),
    ContactPartie.find({ $or: [{ contact: { $in: contactIds } }, { partie: { $in: partieIds } }] }).lean(),
    ContactRepresentantLegal.find({ contactPM: { $in: contactPMIds } }).lean(),
    ContactContactDirect.find({ contactPM: { $in: contactPMIds } }).lean(),
  ]);
  return {
    ContactRole: contactRoles,
    DossierContact: dossierContacts,
    ContactPartie: contactParties,
    DossierPartie: dossierParties,
    ContactRepresentantLegal: representatives,
    ContactContactDirect: directContacts,
    UserContact: userContacts,
    UserContactPM: userContactsPM,
    UserContactPMPublique: userContactsPub,
  };
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
  const migration = require('../services/relations/legacyRelationMigration');
  try {
    if (rollbackRunId) {
      const result = await migration.rollback({ tenantId, userId, runId: rollbackRunId, note: option('note') || '' });
      console.log(JSON.stringify({ mode: 'rollback', runId: rollbackRunId, rolledBack: result.rolledBack || 0, idempotent: result.idempotent }, null, 2));
      return;
    }
    const sources = await loadSources(tenantId);
    const result = await migration.execute({ tenantId, userId, sources, dryRun: !apply, runId });
    console.log(JSON.stringify({
      mode: apply ? 'apply' : 'dry-run',
      runId: result.run?.runId || runId || null,
      scanned: result.plan.scanned,
      planned: result.plan.unique.length,
      duplicates: result.plan.duplicates.length,
      skipped: result.plan.skipped.length,
      errors: result.plan.errors.length,
      written: apply ? result.run?.stats : null,
    }, null, 2));
    if (!apply) console.log('DRY-RUN : aucune écriture. Ajouter --apply --run-id=<id-stable> pour appliquer.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('[migrate-legacy-relations]', err);
  process.exitCode = 1;
});
