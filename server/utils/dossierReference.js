// server/utils/dossierReference.js
//
// REGLE CANONIQUE DE NUMEROTATION DES DOSSIERS
//
// Reference "<annee><rang>" : "202601" ... "202699", puis "2026100" (rang
// numerique d'au moins deux chiffres, padStart(2), sans longueur maximale).
//
//   - La reference est unique PAR CABINET : la paire (tenantId, reference) est
//     la cle d'unicite, portee par l'index unique compose du modele Dossier.
//     La meme reference peut donc exister dans deux cabinets differents.
//   - Chaque cabinet suit sa propre sequence annuelle : le prochain rang est le
//     MAXIMUM NUMERIQUE des references de l'annee DE CE CABINET + 1. Un cabinet
//     qui possede 202644 et 202649 obtient 202650 ; un cabinet neuf obtient
//     202601 quelle que soit la numerotation des autres cabinets.
//   - Les references historiques ne sont jamais renumerotees : les trous
//     d'une sequence sont conserves tels quels.
//   - Le rang est calcule NUMERIQUEMENT (l'ancien tri de chaine faisait passer
//     "202699" avant "2026100" et reattribuait un numero deja pris).
//   - Un cabinet resolu est obligatoire : sans tenantId, aucune reference n'est
//     attribuee (erreur explicite), afin de ne jamais alimenter la sequence
//     "sans cabinet" des dossiers historiques.
//   - Concurrence : le candidat est reverifie juste avant l'attribution, puis
//     l'index unique tranche les creations strictement simultanees (erreur
//     MongoDB 11000) ; saveDossierWithReference regenere alors une reference
//     et reprend l'enregistrement, sans jamais ecrire de doublon.
//
// L'espace "DCM-XXXXXX" des divorces (routes/divorceCM.js) est distinct et
// ignore par le calcul du rang ; il partage seulement la contrainte d'unicite
// par cabinet et la reprise apres conflit (isReferenceConflict).

const Dossier = require('../models/Folder/Dossier');

// Lecture des references de l'annee par lots, pagines sur _id.
const REFERENCE_BATCH_SIZE = 500;
// Attributions tentees lorsque la reference calculee vient d'etre prise.
const REFERENCE_MAX_ATTEMPTS = 8;
// Enregistrements tentes lorsque l'index unique signale un conflit (11000).
const REFERENCE_SAVE_MAX_ATTEMPTS = 8;
// Attente aleatoire (ms) entre deux essais, croissante avec le rang de l essai :
// des creations strictement simultanees dans le meme cabinet se decalent
// ainsi au lieu de relire toutes le meme maximum au meme instant.
const REFERENCE_RETRY_BACKOFF_MS = { base: 15, spread: 60 };
// Sous Jest l attente est nulle (les tests sondent le gestionnaire par setImmediate) ;
// KHEOPS_REFERENCE_BACKOFF=1 la retablit pour la tester.
const backoffEnabled = () => process.env.NODE_ENV !== 'test' || process.env.KHEOPS_REFERENCE_BACKOFF === '1';
const retryBackoffDelay = (attempt) => REFERENCE_RETRY_BACKOFF_MS.base * attempt + Math.random() * REFERENCE_RETRY_BACKOFF_MS.spread * attempt;
const retryBackoff = (attempt) => (backoffEnabled() ? new Promise((resolve) => setTimeout(resolve, retryBackoffDelay(attempt))) : Promise.resolve());

// Seules les references "<annee><rang>" (rang d'AU MOINS DEUX chiffres,
// padStart(2)) participent au calcul du rang : les autres annees, l'espace
// "DCM-" du divorce, un rang sur un seul chiffre ("20261", jamais produit par
// l'application) et les valeurs malformees sont ignores. Meme regle que
// REFERENCE_PATTERN de scripts/lib/dossierReferenceMigration.js, afin que
// l'audit, la migration et le generateur classent une reference a l'identique.
const yearPattern = (year) => new RegExp(`^${year}(\\d{2,})$`);

const currentYear = () => new Date().getFullYear();

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

function requireTenantId(tenantId) {
  if (!tenantId) {
    throw new Error("Impossible d'attribuer une reference de dossier : cabinet (tenantId) non resolu.");
  }
  return tenantId;
}

/** Un lot de documents { _id, reference } repondant au filtre, par _id croissant. */
const readReferencePage = (filter) => Dossier.find(filter, { reference: 1 })
  .sort({ _id: 1 })
  .limit(REFERENCE_BATCH_SIZE);

/** Toutes les references de l'annee du cabinet, lues par lots (aucun lot saute ni relu). */
async function readYearReferences(tenantId, year) {
  const references = [];
  let lastId = null;
  for (;;) {
    const filter = { tenantId, reference: yearPattern(year) };
    if (lastId) filter._id = { $gt: lastId };
    const page = await readReferencePage(filter);
    for (const doc of page) references.push(doc.reference);
    if (page.length < REFERENCE_BATCH_SIZE) return references;
    lastId = page[page.length - 1]._id;
  }
}

async function isReferenceTaken(tenantId, reference) {
  const page = await Dossier.find({ tenantId, reference }, { _id: 1 }).limit(1);
  return page.length > 0;
}

/**
 * Attribue la prochaine reference de l'annee pour le cabinet. Si la reference
 * calculee vient d'etre prise par une creation concurrente du meme cabinet, le
 * calcul est repris ; au-dela de REFERENCE_MAX_ATTEMPTS l'erreur remonte a la
 * route, sans doublon ecrit.
 */
async function generateDossierReference({ tenantId, year = currentYear() } = {}) {
  requireTenantId(tenantId);
  let candidate = null;
  for (let attempt = 1; attempt <= REFERENCE_MAX_ATTEMPTS; attempt += 1) {
    candidate = computeNextReference(await readYearReferences(tenantId, year), year);
    if (!(await isReferenceTaken(tenantId, candidate))) return candidate;
    console.warn(`[dossierReference] reference ${candidate} deja attribuee dans le cabinet ${tenantId}, nouvelle tentative (${attempt}/${REFERENCE_MAX_ATTEMPTS})`);
    if (attempt < REFERENCE_MAX_ATTEMPTS) await retryBackoff(attempt);
  }
  // Contention persistante entre creations simultanees du meme cabinet : c'est
  // un conflit (409) invitant a reessayer, pas une erreur interne.
  const failure = new Error(`Impossible d'attribuer une reference de dossier pour ${year} : ${candidate} reste prise apres ${REFERENCE_MAX_ATTEMPTS} tentatives. Veuillez reessayer.`);
  failure.code = 'DOSSIER_REFERENCE_CONFLICT';
  failure.status = 409;
  throw failure;
}

/**
 * Vrai si l'erreur est un doublon MongoDB (code 11000) portant sur la
 * reference. Mongoose transmet l'erreur du pilote telle quelle ; keyPattern
 * peut manquer selon la version, on ne l'exige donc pas.
 */
function isReferenceConflict(error) {
  if (!error) return false;
  const duplicate = error.code === 11000 || error.codeName === 'DuplicateKey';
  if (!duplicate) return false;
  const keyPattern = error.keyPattern || (error.cause && error.cause.keyPattern);
  return !keyPattern || Object.prototype.hasOwnProperty.call(keyPattern, 'reference');
}

/**
 * Enregistre un dossier avec une reference du cabinet. `buildDossier(reference)`
 * construit un document neuf a chaque essai. La reference fournie (deja
 * generee par la route) sert au premier essai ; apres un conflit d'unicite
 * (11000), une nouvelle reference est generee et l'enregistrement repris,
 * jusqu'a REFERENCE_SAVE_MAX_ATTEMPTS essais. Toute autre erreur remonte
 * immediatement. Aucun doublon n'est ecrit : l'index unique refuse l'insertion.
 */
async function saveDossierWithReference({ tenantId, year = currentYear(), reference = null, buildDossier }) {
  requireTenantId(tenantId);
  let candidate = reference;
  for (let attempt = 1; attempt <= REFERENCE_SAVE_MAX_ATTEMPTS; attempt += 1) {
    if (!candidate) candidate = await generateDossierReference({ tenantId, year });
    try {
      return await buildDossier(candidate).save();
    } catch (error) {
      if (!isReferenceConflict(error)) throw error;
      console.warn(`[dossierReference] conflit d'unicite sur ${candidate} (cabinet ${tenantId}), nouvelle tentative (${attempt}/${REFERENCE_SAVE_MAX_ATTEMPTS})`);
      if (attempt === REFERENCE_SAVE_MAX_ATTEMPTS) {
        const failure = new Error(`Impossible d'enregistrer le dossier : la reference ${candidate} reste en conflit apres ${REFERENCE_SAVE_MAX_ATTEMPTS} tentatives. Veuillez reessayer.`);
        failure.code = 'DOSSIER_REFERENCE_CONFLICT';
        failure.status = 409;
        failure.cause = error;
        throw failure;
      }
      candidate = null;
      await retryBackoff(attempt);
    }
  }
  return null;
}

module.exports = {
  REFERENCE_RETRY_BACKOFF_MS,
  retryBackoff,
  retryBackoffDelay,
  generateDossierReference,
  saveDossierWithReference,
  isReferenceConflict,
  computeNextReference,
  parseReferenceRank,
  REFERENCE_BATCH_SIZE,
  REFERENCE_MAX_ATTEMPTS,
  REFERENCE_SAVE_MAX_ATTEMPTS,
};
