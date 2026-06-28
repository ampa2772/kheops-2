// Kheops_2/server/services/cabinetService.js
//
// Logique metier du module Cabinet :
//  - sweep des recurrences automatiques (genere les CabinetExpense
//    dues a la date courante)
//  - generation manuelle d'une occurrence a partir d'une recurrence
//  - calcul du bilan (recettes / depenses / resultat / TVA)
//  - calcul de la rentabilite par dossier
const CabinetExpense = require('../models/Cabinet/CabinetExpense');
const CabinetRecurringExpense = require('../models/Cabinet/CabinetRecurringExpense');
const Dossier = require('../models/Folder/Dossier');
const { intervalleParFrequence, ajouterMois } = require('./cabinetConstants');

// ============================================================
// Genere une occurrence (CabinetExpense) a partir d'un template
// recurrent et avance la prochaineGenerationLe.
// ============================================================
async function genererOccurrence(recurrence, options = {}) {
  if (!recurrence) return null;
  const dateCible = options.dateCible
    ? new Date(options.dateCible)
    : (recurrence.prochaineGenerationLe ? new Date(recurrence.prochaineGenerationLe) : new Date(recurrence.dateDebut));

  if (recurrence.dateFin && dateCible > new Date(recurrence.dateFin)) return null;

  const expense = new CabinetExpense({
    ownerUserId: recurrence.ownerUserId,
    createdByOfficeUserId: recurrence.createdByOfficeUserId || null,
    date: dateCible,
    libelle: recurrence.libelle,
    categorie: recurrence.categorie,
    montantHT: recurrence.montantHT,
    tauxTVA: recurrence.tauxTVA,
    montantTTC: recurrence.montantTTC,
    devise: recurrence.devise || 'EUR',
    modePaiement: recurrence.modePaiement || '',
    fournisseurNom: recurrence.fournisseurNom || '',
    fournisseurSiret: recurrence.fournisseurSiret || '',
    tvaDeductible: recurrence.tvaDeductible,
    dossierId: recurrence.dossierId || null,
    sourceImport: 'recurrence',
    recurrenceId: recurrence._id,
    notes: recurrence.notes || '',
  });
  await expense.save();

  // Avancer le pointeur derniere/prochaine
  recurrence.derniereGenerationLe = dateCible;
  const intervalle = intervalleParFrequence(recurrence.frequence);
  const prochaine = ajouterMois(dateCible, intervalle);
  if (recurrence.dateFin && prochaine > new Date(recurrence.dateFin)) {
    recurrence.prochaineGenerationLe = null;
  } else {
    recurrence.prochaineGenerationLe = prochaine;
  }
  await recurrence.save();

  return expense;
}

// ============================================================
// Sweep : pour toutes les recurrences automatiques + actives dont la
// prochaineGenerationLe <= maintenant, on genere les occurrences
// manquantes (potentiellement plusieurs si l'utilisateur n'a pas
// ouvert l'app pendant longtemps).
// ============================================================
async function sweepAutomatiques(ownerUserId) {
  if (!ownerUserId) return { generated: 0, recurrences: [] };
  const now = new Date();
  const recurrences = await CabinetRecurringExpense.find({
    ownerUserId,
    active: true,
    automatique: true,
    prochaineGenerationLe: { $lte: now, $ne: null },
  });

  let total = 0;
  const detail = [];
  for (const rec of recurrences) {
    let nbCetteRec = 0;
    // Boucle : tant que prochaineGenerationLe <= maintenant, generer
    let safety = 100;                                                 // garde-fou contre boucle infinie
    while (rec.prochaineGenerationLe && rec.prochaineGenerationLe <= now && safety > 0) {
      await genererOccurrence(rec);
      nbCetteRec += 1;
      total += 1;
      safety -= 1;
    }
    if (nbCetteRec > 0) {
      detail.push({ recurrenceId: rec._id, libelle: rec.libelle, nbGeneres: nbCetteRec });
    }
  }
  return { generated: total, recurrences: detail };
}

// ============================================================
// Bilan agrege sur une periode.
// Recettes = somme des payments des factures de tous les dossiers
//            dont la date du paiement tombe dans la periode.
// Depenses = somme des montantTTC des CabinetExpense.
// ============================================================
async function calculerBilan(ownerUserId, options = {}) {
  const from = options.from ? new Date(options.from) : null;
  const to = options.to ? new Date(options.to) : null;

  // ----- Recettes (depuis Dossier.factures.payments) -----
  // On charge les dossiers du cabinet. Note : le modele Dossier ne porte
  // pas explicitement d'ownerUserId (heritage du schema initial). On
  // fait donc une agregation sur tous les dossiers — l'app etant
  // mono-cabinet par instance, c'est OK. Pour la version multi-tenant,
  // il faudra ajouter un filtre d'appartenance.
  const dossiers = await Dossier.find({}).select('_id reference dossier factures').lean();

  let recettesTTC = 0;
  let recettesHT = 0;
  let nbPaiements = 0;
  const recettesParMois = {};                                         // 'YYYY-MM' -> total
  const recettesParDossier = {};                                      // dossierId -> total

  for (const d of dossiers) {
    const factures = d.factures || [];
    for (const f of factures) {
      if (f.archived) continue;                                       // ignore les factures archivees
      const totalTTC = Number(f.totalTTC) || 0;
      const totalHT = (f.billedItems || []).reduce((s, b) => s + (Number(b.total_ht) || 0), 0);
      const ratioHT = totalTTC > 0 ? totalHT / totalTTC : 1 / 1.2;    // fallback si pas de billedItems

      for (const p of (f.payments || [])) {
        const datePaie = p.date ? new Date(p.date) : null;
        if (!datePaie || isNaN(datePaie.getTime())) continue;
        if (from && datePaie < from) continue;
        if (to && datePaie > to) continue;
        const montant = Number(p.amount) || 0;
        recettesTTC += montant;
        recettesHT += montant * ratioHT;
        nbPaiements += 1;

        const cle = `${datePaie.getFullYear()}-${String(datePaie.getMonth() + 1).padStart(2, '0')}`;
        recettesParMois[cle] = (recettesParMois[cle] || 0) + montant;
        const did = String(d._id);
        recettesParDossier[did] = (recettesParDossier[did] || 0) + montant;
      }
    }
  }

  // ----- Depenses -----
  const filterDepenses = { ownerUserId };
  if (from || to) {
    filterDepenses.date = {};
    if (from) filterDepenses.date.$gte = from;
    if (to) filterDepenses.date.$lte = to;
  }
  const depenses = await CabinetExpense.find(filterDepenses).lean();

  let depensesTTC = 0;
  let depensesHT = 0;
  let tvaDeductible = 0;
  const depensesParCategorie = {};
  const depensesParMois = {};
  const depensesParDossier = {};

  for (const e of depenses) {
    const ttc = Number(e.montantTTC) || 0;
    const ht = Number(e.montantHT) || 0;
    const tva = Number(e.montantTVA) || 0;

    depensesTTC += ttc;
    depensesHT += ht;
    if (e.tvaDeductible !== false) tvaDeductible += tva;

    depensesParCategorie[e.categorie] = (depensesParCategorie[e.categorie] || 0) + ttc;

    const dt = new Date(e.date);
    if (!isNaN(dt.getTime())) {
      const cle = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      depensesParMois[cle] = (depensesParMois[cle] || 0) + ttc;
    }

    if (e.dossierId) {
      const did = String(e.dossierId);
      depensesParDossier[did] = (depensesParDossier[did] || 0) + ttc;
    }
  }

  // ----- TVA -----
  const tvaCollectee = Math.max(0, recettesTTC - recettesHT);

  // ----- Resultat -----
  const resultatTTC = recettesTTC - depensesTTC;
  const resultatHT = recettesHT - depensesHT;

  return {
    periode: { from, to },
    recettes: {
      ttc: arrondi(recettesTTC),
      ht: arrondi(recettesHT),
      nbPaiements,
    },
    depenses: {
      ttc: arrondi(depensesTTC),
      ht: arrondi(depensesHT),
      nb: depenses.length,
    },
    tva: {
      collectee: arrondi(tvaCollectee),
      deductible: arrondi(tvaDeductible),
      solde: arrondi(tvaCollectee - tvaDeductible),
    },
    resultat: {
      ttc: arrondi(resultatTTC),
      ht: arrondi(resultatHT),
    },
    repartitions: {
      depensesParCategorie: arrondiMap(depensesParCategorie),
      recettesParMois: arrondiMap(recettesParMois),
      depensesParMois: arrondiMap(depensesParMois),
    },
    parDossier: {
      recettes: arrondiMap(recettesParDossier),
      depenses: arrondiMap(depensesParDossier),
    },
  };
}

// ============================================================
// Rentabilite par dossier (sur toute la duree, ou periode).
// Pour chaque dossier qui a au moins une recette ou une depense,
// renvoie un objet { dossierId, nom, reference, recettes, depenses, resultat }.
// ============================================================
async function calculerRentabiliteDossiers(ownerUserId, options = {}) {
  const bilan = await calculerBilan(ownerUserId, options);
  const dossiersIds = new Set([
    ...Object.keys(bilan.parDossier.recettes),
    ...Object.keys(bilan.parDossier.depenses),
  ]);
  if (dossiersIds.size === 0) return [];

  const dossiers = await Dossier.find({ _id: { $in: [...dossiersIds] } })
    .select('reference dossier').lean();
  const dossierIndex = {};
  for (const d of dossiers) {
    dossierIndex[String(d._id)] = {
      reference: d.reference,
      nom: d.dossier?.dossier?.nom || d.dossier?.nom || d.reference || 'Dossier',
    };
  }

  const result = [];
  for (const id of dossiersIds) {
    const recettes = bilan.parDossier.recettes[id] || 0;
    const depenses = bilan.parDossier.depenses[id] || 0;
    const meta = dossierIndex[id] || { reference: '?', nom: '(dossier supprime)' };
    result.push({
      dossierId: id,
      reference: meta.reference,
      nom: meta.nom,
      recettes: arrondi(recettes),
      depenses: arrondi(depenses),
      resultat: arrondi(recettes - depenses),
    });
  }
  // Tri par resultat decroissant (les plus rentables en haut)
  result.sort((a, b) => b.resultat - a.resultat);
  return result;
}

// ============================================================
// Helpers
// ============================================================
function arrondi(n) {
  return Math.round((n || 0) * 100) / 100;
}

function arrondiMap(m) {
  const r = {};
  for (const [k, v] of Object.entries(m || {})) r[k] = arrondi(v);
  return r;
}

module.exports = {
  genererOccurrence,
  sweepAutomatiques,
  calculerBilan,
  calculerRentabiliteDossiers,
};
