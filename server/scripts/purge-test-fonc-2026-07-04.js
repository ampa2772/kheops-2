// Purge des déchets du test fonctionnel prod du 2026-07-04.
// Périmètre STRICT (feu vert Adrien du 2026-07-04) :
//   1. Dossiers FANTOMES divorce_cm « TEST-FONC-EPOUX … » : Dossier + UserDossier
//      créés par le bug POST /api/divorce-cm (CastError après écriture partielle),
//      SANS fiche DivorceCMData associée. (5 constatés pendant le test.)
//   2. Contact DOUBLON « TEST-FONC-EPOUX Jean » créé par le bug POST /contact
//      (écriture partielle) : on GARDE l'exemplaire porteur des personnes à
//      charge / référencé partout, on supprime le doublon UNIQUEMENT s'il n'est
//      référencé nulle part (vérifications ci-dessous).
// HORS périmètre (volontaire) : les autres données TEST-FONC (2 dossiers de
// test réels, contacts DUPONT/MARTIN/DURAND/EPOUX n°1/EPOUSE, PCH) et le
// contact tribunal « Tribunal judiciaire De paris » (donnée annuaire légitime).
//
// Usage (depuis Kheops_2/server, lit MONGODB_URI dans .env) :
//   node scripts/purge-test-fonc-2026-07-04.js            -> DRY-RUN (aucune écriture)
//   node scripts/purge-test-fonc-2026-07-04.js --apply    -> exécute les suppressions
//
// Le script refuse de supprimer quoi que ce soit d'inattendu : chaque candidat
// est listé avec la raison, et le doublon contact est abandonné au moindre
// lien résiduel (PCH, dossier, partie, détail mariage, fiche divorce).

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const Dossier = require('../models/Folder/Dossier');
const Contact = require('../models/Folder/Contact');
const Partie = require('../models/Folder/Partie');
const DivorceCMData = require('../models/Divorce/DivorceCMData');
const UserDossier = require('../models/Folder/modelsLiaisons/UserDossier');
const UserContact = require('../models/Folder/modelsLiaisons/UserContact');
const DossierContact = require('../models/Folder/modelsLiaisons/DossierContact');
const ContactPartie = require('../models/Folder/modelsLiaisons/ContactPartie');
const ContactPersonneCharge = require('../models/Folder/modelsLiaisons/ContactPersonneCharge');
const ContactDetailMariage = require('../models/Folder/modelsLiaisons/ContactDetailMariage');
const ContactNotaireMariage = require('../models/Folder/modelsLiaisons/ContactNotaireMariage');

const APPLY = process.argv.includes('--apply');
// Contact TEST-FONC-EPOUX à CONSERVER (porte les PCH, époux du divorce réel) :
const KEEP_EPOUX_ID = '6a48bd3184a67480b0dd6daa';

function log(...args) { console.log(...args); }

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI absent (lancer depuis Kheops_2/server, .env requis).');
  await mongoose.connect(uri);
  log(`Connecté. Mode : ${APPLY ? '*** APPLY (suppressions réelles) ***' : 'DRY-RUN (lecture seule)'}\n`);

  // ------------------------------------------------------------------
  // 1) Dossiers fantômes divorce_cm TEST-FONC sans fiche DivorceCMData
  // ------------------------------------------------------------------
  const dcmCandidates = await Dossier.find({
    'dossier.dossier.type_dossier': 'divorce_cm',
    'dossier.dossier.nom': { $regex: 'TEST-FONC', $options: 'i' },
  }).lean();

  const fantomes = [];
  for (const d of dcmCandidates) {
    const fiche = await DivorceCMData.findOne({ dossierId: d._id }).lean();
    if (!fiche) fantomes.push(d);
    else log(`GARDÉ (fiche divorce présente) : Dossier ${d._id} « ${d.dossier?.dossier?.nom} »`);
  }

  log(`\n[1] Dossiers fantômes divorce_cm TEST-FONC sans fiche : ${fantomes.length}`);
  for (const d of fantomes) {
    const liens = await UserDossier.countDocuments({ dossier: d._id });
    const liensContacts = await DossierContact.countDocuments({ dossier: d._id });
    log(`  - ${d._id} « ${d.dossier?.dossier?.nom} » ref=${d.reference} (UserDossier:${liens}, DossierContact:${liensContacts})`);
    if (APPLY) {
      await UserDossier.deleteMany({ dossier: d._id });
      await DossierContact.deleteMany({ dossier: d._id });
      await Dossier.deleteOne({ _id: d._id });
      log('    -> supprimé (Dossier + liaisons).');
    }
  }

  // ------------------------------------------------------------------
  // 2) Doublon contact TEST-FONC-EPOUX (écriture partielle du POST /contact)
  // ------------------------------------------------------------------
  const epoux = await Contact.find({ nom: 'TEST-FONC-EPOUX' }).lean();
  log(`\n[2] Contacts nom=TEST-FONC-EPOUX trouvés : ${epoux.length} (à conserver : ${KEEP_EPOUX_ID})`);
  for (const c of epoux) {
    if (String(c._id) === KEEP_EPOUX_ID) { log(`  - ${c._id} : GARDÉ (référence).`); continue; }
    // Vérifications de non-référencement avant toute suppression.
    const refs = {
      personnesCharge: await ContactPersonneCharge.countDocuments({ contact: c._id }),
      dossiers: await DossierContact.countDocuments({ contact: c._id }),
      parties: await Partie.countDocuments({ contact: c._id }),
      contactParties: await ContactPartie.countDocuments({ contact: c._id }),
      detailsMariage: await ContactDetailMariage.countDocuments({ contact: c._id }),
      notaireMariage: await ContactNotaireMariage.countDocuments({ contact: c._id }),
      divorcesEpoux1: await DivorceCMData.countDocuments({ 'epoux1.contactId': c._id }),
      divorcesEpoux2: await DivorceCMData.countDocuments({ 'epoux2.contactId': c._id }),
    };
    const totalRefs = Object.values(refs).reduce((a, b) => a + b, 0);
    log(`  - ${c._id} : références = ${JSON.stringify(refs)}`);
    if (totalRefs > 0) {
      log('    -> ABANDON : le doublon est référencé, suppression refusée (à examiner à la main).');
      continue;
    }
    if (APPLY) {
      await UserContact.deleteMany({ contact: c._id });
      await Contact.deleteOne({ _id: c._id });
      log('    -> supprimé (Contact + UserContact).');
    } else {
      log('    -> serait supprimé (Contact + UserContact).');
    }
  }

  log(`\nTerminé (${APPLY ? 'APPLY' : 'DRY-RUN'}).`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error('ERREUR:', e); process.exitCode = 1; });
