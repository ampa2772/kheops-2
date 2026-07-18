/*
 * Migration non destructive des contacts historiques vers ContactIdentity.
 * DRY-RUN par défaut :
 *   node server/scripts/migrate-contact-identities.js --tenant=<id> --user=<id>
 * Appliquer :
 *   ... --apply --run-id=contacts-2026-07
 * Rollback historisé :
 *   ... --rollback=contacts-2026-07
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
  const Contact = require('../models/Folder/Contact');
  const ContactPM = require('../models/Folder/ContactPM');
  const ContactPMPublique = require('../models/Folder/ContactPMPublique');
  const UserContact = require('../models/Folder/modelsLiaisons/UserContact');
  const UserContactPM = require('../models/Folder/modelsLiaisons/UserContactPM');
  const UserContactPMPublique = require('../models/Folder/modelsLiaisons/UserContactPMPublique');
  const UserDossier = require('../models/Folder/modelsLiaisons/UserDossier');
  const DossierContact = require('../models/Folder/modelsLiaisons/DossierContact');
  const DossierPartie = require('../models/Folder/modelsLiaisons/DossierPartie');
  const ContactPartie = require('../models/Folder/modelsLiaisons/ContactPartie');

  const [contactLinks, pmLinks, publicLinks, dossierLinks] = await Promise.all([
    UserContact.find({ user: { $in: users } }).select('contact').lean(),
    UserContactPM.find({ user: { $in: users } }).select('contactPM').lean(),
    UserContactPMPublique.find({ user: { $in: users } }).select('contactPMPublique').lean(),
    UserDossier.find({ user: { $in: users } }).select('dossier').lean(),
  ]);
  const dossierIds = ids(dossierLinks.map((item) => item.dossier));
  const [dossierContacts, dossierParties] = await Promise.all([
    DossierContact.find({ dossier: { $in: dossierIds } }).select('contact').lean(),
    DossierPartie.find({ dossier: { $in: dossierIds } }).select('partie').lean(),
  ]);
  const partyIds = ids(dossierParties.map((item) => item.partie));
  const partyContacts = await ContactPartie.find({ partie: { $in: partyIds } }).select('contact').lean();
  const contactIds = ids([
    ...contactLinks.map((item) => item.contact),
    ...dossierContacts.map((item) => item.contact),
    ...partyContacts.map((item) => item.contact),
  ]);
  const contactPMIds = ids(pmLinks.map((item) => item.contactPM));
  const publicIds = ids(publicLinks.map((item) => item.contactPMPublique));
  const [contacts, contactsPM, contactsPublics] = await Promise.all([
    Contact.find({ _id: { $in: contactIds } }).lean(),
    ContactPM.find({ _id: { $in: contactPMIds } }).lean(),
    ContactPMPublique.find({ _id: { $in: publicIds } }).lean(),
  ]);
  return { Contact: contacts, ContactPM: contactsPM, ContactPMPublique: contactsPublics };
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
  const migration = require('../services/relations/legacyContactMigration');
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
      exactDuplicates: result.plan.duplicates.length,
      likelyDuplicateGroups: result.plan.likelyDuplicateGroups.length,
      skipped: result.plan.skipped.length,
      errors: result.plan.errors.length,
      written: apply ? result.run?.stats : null,
    }, null, 2));
    if (!apply) console.log('DRY-RUN : aucune écriture ni fusion. Vérifier les doublons puis ajouter --apply --run-id=<id-stable>.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('[migrate-contact-identities]', err);
  process.exitCode = 1;
});
