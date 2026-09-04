// server/utils/dossierReference.js
//
// Reference de dossier "<annee><rang>" : "202601" ... "202699", puis "2026100".
// Le rang est calcule NUMERIQUEMENT sur l'ensemble des references de l'annee.
// L'ancien calcul triait les references comme des chaines
// (`sort({ reference: -1 }).limit(1)`) : "202699" passait avant "2026100" et
// le compteur repartait sur un numero deja attribue.
//
// Limites assumees (decision en attente, voir CODEX_CHANGE_HISTORY) :
//   - la sequence reste GLOBALE, tous cabinets confondus (aucun filtre tenantId) ;
//   - aucune contrainte d'unicite n'existe en base : la reverification juste
//     avant l'attribution reduit la fenetre de doublon entre deux creations
//     simultanees sans la fermer, seul un index unique le ferait.

const Dossier = require('../models/Folder/Dossier');

// Lecture des references de l'annee par lots, pagines sur _id.
const REFERENCE_BATCH_SIZE = 500;
// Attributions tentees lorsque la reference calculee vient d'etre prise.
const REFERENCE_MAX_ATTEMPTS = 3;

// Seules les references "<annee><chiffres>" participent au calcul du rang :
// les autres annees, l'espace "DCM-" du divorce et les valeurs malformees
// sont ignorees.
const yearPattern = (year) => new RegExp(`^${year}(\\d+)$`);

/** Rang numerique d'une reference de l'annee, ou null si le format differe. */
function parseReferenceRank(reference, year) {
  const match = yearPattern(year).exec(String(reference ?? ''));
  return match ? Number(match[1]) : null;
}

/** Prochaine reference d'apres les references existantes : rang maximal + 1. */
function computeNextReference(references, year) {
  let maxRank = 0;
  for (const reference of references) {
    const rank = parseReferenceRank(reference, year);
    if (rank !== null && rank > maxRank) maxRank = rank;
  }
  return `${year}${String(maxRank + 1).padStart(2, '0')}`;
}

/** Un lot de documents { _id, reference } repondant au filtre, par _id croissant. */
const readReferencePage = (filter) => Dossier.find(filter, { reference: 1 })
  .sort({ _id: 1 })
  .limit(REFERENCE_BATCH_SIZE);

/** Toutes les references de l'annee, lues par lots (aucun lot saute ni relu). */
async function readYearReferences(year) {
  const references = [];
  let lastId = null;
  for (;;) {
    const filter = { reference: yearPattern(year) };
    if (lastId) filter._id = { $gt: lastId };
    const page = await readReferencePage(filter);
    for (const doc of page) references.push(doc.reference);
    if (page.length < REFERENCE_BATCH_SIZE) return references;
    lastId = page[page.length - 1]._id;
  }
}

async function isReferenceTaken(reference) {
  const page = await Dossier.find({ reference }, { _id: 1 }).limit(1);
  return page.length > 0;
}

/**
 * Attribue la prochaine reference de l'annee. Si la reference calculee vient
 * d'etre prise par une creation concurrente, le calcul est repris ; au-dela de
 * REFERENCE_MAX_ATTEMPTS l'erreur remonte a la route, sans doublon ecrit.
 */
async function generateDossierReference(year = new Date().getFullYear()) {
  let candidate = null;
  for (let attempt = 1; attempt <= REFERENCE_MAX_ATTEMPTS; attempt += 1) {
    candidate = computeNextReference(await readYearReferences(year), year);
    if (!(await isReferenceTaken(candidate))) return candidate;
    console.warn(`[dossierReference] reference ${candidate} deja attribuee, nouvelle tentative (${attempt}/${REFERENCE_MAX_ATTEMPTS})`);
  }
  throw new Error(`Impossible d'attribuer une reference de dossier pour ${year} : ${candidate} reste prise apres ${REFERENCE_MAX_ATTEMPTS} tentatives.`);
}

module.exports = {
  generateDossierReference,
  computeNextReference,
  parseReferenceRank,
  REFERENCE_BATCH_SIZE,
  REFERENCE_MAX_ATTEMPTS,
};
