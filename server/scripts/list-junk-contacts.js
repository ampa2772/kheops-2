// server/scripts/list-junk-contacts.js
//
// RAPPORT (lecture seule) — Repère les contacts "de test / bizarres" visibles
// dans l'annuaire d'un compte, et indique lesquels sont liés à un dossier
// (à NE PAS supprimer) vs supprimables sans risque.
//
//   node scripts/list-junk-contacts.js --email apma2772@gmail.com
//
// N'écrit RIEN. Sert à valider la liste avant toute suppression.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const argv = process.argv.slice(2);
function argValue(flag, def) {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : def;
}
const TARGET_EMAIL = argValue('--email', 'apma2772@gmail.com');
const APPLY = argv.includes('--apply');

// Heuristique "nom bizarre / de test".
function isJunkName(name) {
  const n = (name || '').trim();
  if (!n) return true; // vide
  if (/[<>]/.test(n)) return true; // balise / XSS
  if (/test|nopch|avocatmod|\bsub\b|xss/i.test(n)) return true;
  if (/^[A-Za-z]{1,3}\d/.test(n)) return true; // commence par lettres+chiffre (B14, B8v277...)
  return false;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const User = require(path.join(__dirname, '..', 'models', 'App_Users', 'User'));
  const Contact = require(path.join(__dirname, '..', 'models', 'Folder', 'Contact'));
  const ContactPM = require(path.join(__dirname, '..', 'models', 'Folder', 'ContactPM'));
  const ContactPMPublique = require(path.join(__dirname, '..', 'models', 'Folder', 'ContactPMPublique'));
  const UserContact = require(path.join(__dirname, '..', 'models', 'Folder', 'modelsLiaisons', 'UserContact'));
  const UserContactPM = require(path.join(__dirname, '..', 'models', 'Folder', 'modelsLiaisons', 'UserContactPM'));
  const UserContactPMPublique = require(path.join(__dirname, '..', 'models', 'Folder', 'modelsLiaisons', 'UserContactPMPublique'));
  const DossierContact = require(path.join(__dirname, '..', 'models', 'Folder', 'modelsLiaisons', 'DossierContact'));
  const ContactPartie = require(path.join(__dirname, '..', 'models', 'Folder', 'modelsLiaisons', 'ContactPartie'));
  const Partie = require(path.join(__dirname, '..', 'models', 'Folder', 'Partie'));
  const DossierPartie = require(path.join(__dirname, '..', 'models', 'Folder', 'modelsLiaisons', 'DossierPartie'));
  const { getAccessibleUserIds } = require(path.join(__dirname, '..', 'services', 'cabinetAccess'));
  const PersonneCharge = require(path.join(__dirname, '..', 'models', 'Folder', 'PersonneCharge'));
  const ContactPersonneCharge = require(path.join(__dirname, '..', 'models', 'Folder', 'modelsLiaisons', 'ContactPersonneCharge'));
  const DetailMariage = require(path.join(__dirname, '..', 'models', 'Folder', 'DetailMariage'));
  const ContactDetailMariage = require(path.join(__dirname, '..', 'models', 'Folder', 'modelsLiaisons', 'ContactDetailMariage'));
  const ContactNotaireMariage = require(path.join(__dirname, '..', 'models', 'Folder', 'modelsLiaisons', 'ContactNotaireMariage'));
  const ContactRepresentantLegal = require(path.join(__dirname, '..', 'models', 'Folder', 'modelsLiaisons', 'ContactRepresentantLegal'));
  const ContactContactDirect = require(path.join(__dirname, '..', 'models', 'Folder', 'modelsLiaisons', 'ContactContactDirect'));
  const RepresentantLegal = require(path.join(__dirname, '..', 'models', 'Folder', 'RepresentantLegalPM'));
  const ContactDirect = require(path.join(__dirname, '..', 'models', 'Folder', 'ContactDirect'));

  const user = await User.findOne({ email: new RegExp(`^${TARGET_EMAIL}$`, 'i') });
  if (!user) { console.error(`Compte ${TARGET_EMAIL} introuvable.`); await mongoose.disconnect(); process.exit(1); }
  const accessible = await getAccessibleUserIds(user._id);

  // Récupère les contacts du cabinet (3 collections).
  const [lpp, lpm, lpmp] = await Promise.all([
    UserContact.find({ user: { $in: accessible } }).select('contact').lean(),
    UserContactPM.find({ user: { $in: accessible } }).select('contactPM').lean(),
    UserContactPMPublique.find({ user: { $in: accessible } }).select('contactPMPublique').lean(),
  ]);
  const [pp, pm, pmp] = await Promise.all([
    Contact.find({ _id: { $in: lpp.map((l) => l.contact) } }).lean(),
    ContactPM.find({ _id: { $in: lpm.map((l) => l.contactPM) } }).lean(),
    ContactPMPublique.find({ _id: { $in: lpmp.map((l) => l.contactPMPublique) } }).lean(),
  ]);

  const rows = [
    ...pp.map((c) => ({ id: String(c._id), kind: 'Personne', name: `${c.nom || ''} ${c.prenoms || ''}`.trim() })),
    ...pm.map((c) => ({ id: String(c._id), kind: 'Orga privée', name: (c.raisonSociale || '').trim() })),
    ...pmp.map((c) => ({ id: String(c._id), kind: 'Orga publique', name: (c.denomination || '').trim() })),
  ];

  const candidates = rows.filter((r) => isJunkName(r.name));

  // Pour chaque candidat : est-il lié à un dossier ?
  async function linkedToDossier(id) {
    const dc = await DossierContact.findOne({ contact: id }).lean();
    if (dc) return true;
    const partie = await Partie.findOne({ contact: id }).lean();
    if (partie) {
      const dp = await DossierPartie.findOne({ partie: partie._id }).lean();
      if (dp) return true;
    }
    const cp = await ContactPartie.findOne({ contact: id }).lean();
    if (cp) {
      const dp = await DossierPartie.findOne({ partie: cp.partie }).lean();
      if (dp) return true;
    }
    return false;
  }

  async function deleteContactFull(c) {
    const id = c.id;
    if (c.kind === 'Personne') {
      const pcLinks = await ContactPersonneCharge.find({ contact: id }).lean();
      for (const l of pcLinks) if (l.personneCharge) await PersonneCharge.findByIdAndDelete(l.personneCharge);
      await ContactPersonneCharge.deleteMany({ contact: id });
      const dmLinks = await ContactDetailMariage.find({ contact: id }).lean();
      for (const l of dmLinks) if (l.detailMariage) {
        await ContactNotaireMariage.deleteMany({ detailMariage: l.detailMariage });
        await DetailMariage.findByIdAndDelete(l.detailMariage);
      }
      await ContactDetailMariage.deleteMany({ contact: id });
      await UserContact.deleteMany({ contact: id });
      await Contact.findByIdAndDelete(id);
    } else if (c.kind === 'Orga privée') {
      const rl = await ContactRepresentantLegal.find({ contactPM: id }).lean();
      for (const l of rl) if (l.representantLegal) await RepresentantLegal.findByIdAndDelete(l.representantLegal);
      await ContactRepresentantLegal.deleteMany({ contactPM: id });
      const cd = await ContactContactDirect.find({ contactPM: id }).lean();
      for (const l of cd) if (l.contactDirect) await ContactDirect.findByIdAndDelete(l.contactDirect);
      await ContactContactDirect.deleteMany({ contactPM: id });
      await UserContactPM.deleteMany({ contactPM: id });
      await ContactPM.findByIdAndDelete(id);
    } else {
      await UserContactPMPublique.deleteMany({ contactPMPublique: id });
      await ContactPMPublique.findByIdAndDelete(id);
    }
  }

  const supprimables = [];
  const proteges = [];
  for (const c of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const linked = await linkedToDossier(c.id);
    (linked ? proteges : supprimables).push(c);
  }

  console.log('==============================================================');
  console.log(`  Contacts "bizarres" — compte ${TARGET_EMAIL}`);
  console.log(`  Total contacts annuaire: ${rows.length} | candidats détectés: ${candidates.length}`);
  console.log('==============================================================');

  console.log(`\n>>> SUPPRIMABLES sans risque (PAS dans un dossier) : ${supprimables.length}`);
  supprimables.forEach((c) => console.log(`   [${c.kind}] "${c.name || '(vide)'}"  id=${c.id}`));

  console.log(`\n>>> PROTÉGÉS (liés à un dossier → à GARDER) : ${proteges.length}`);
  proteges.forEach((c) => console.log(`   [${c.kind}] "${c.name || '(vide)'}"  id=${c.id}`));

  if (!APPLY) {
    console.log('\n(DRY-RUN : ce script ne supprime rien. Relancer avec --apply pour supprimer les SUPPRIMABLES.)');
    await mongoose.disconnect();
    return;
  }

  console.log('\n--- SUPPRESSION (--apply) ---');
  let deleted = 0;
  let skipped = 0;
  for (const c of supprimables) {
    // Re-vérification défensive du garde-fou juste avant suppression.
    if (await linkedToDossier(c.id)) {
      console.log(`   SKIP (devenu lié à un dossier) "${c.name}"`);
      skipped++;
      continue;
    }
    await deleteContactFull(c);
    deleted++;
  }
  console.log(`\n✅ Supprimés : ${deleted} | Ignorés (liés à un dossier) : ${skipped} | Protégés d'emblée : ${proteges.length}`);
  await mongoose.disconnect();
}

main().catch(async (e) => { console.error(e); try { await mongoose.disconnect(); } catch (_) {} process.exit(1); });
