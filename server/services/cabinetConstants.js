// Kheops_2/server/services/cabinetConstants.js
//
// Referentiel statique pour le module Cabinet (depenses + bilan).
// Utilise cote serveur (validation) et cote client (UI), expose via
// GET /api/cabinet/constants.

// ============================================================
// Categories de depenses
// ============================================================
//
// Pour chaque categorie : code stable, libelle francais, et indicateur
// "tvaDeductibleParDefaut" (les salaires, cotisations sociales et
// certains impots ne sont pas deductibles a la TVA).
const CATEGORIES_DEPENSES = [
  { code: 'salaires',       label: 'Salaires et charges sociales',         tvaDeductibleParDefaut: false, icone: '👥' },
  { code: 'loyer',          label: 'Loyer et charges locatives',           tvaDeductibleParDefaut: true,  icone: '🏢' },
  { code: 'cotisations',    label: 'Cotisations professionnelles (Ordre, CNBF, RCP)', tvaDeductibleParDefaut: false, icone: '🛡️' },
  { code: 'logiciels',      label: 'Logiciels et abonnements',             tvaDeductibleParDefaut: true,  icone: '💻' },
  { code: 'materiel',       label: 'Materiel et fournitures',              tvaDeductibleParDefaut: true,  icone: '🪑' },
  { code: 'deplacements',   label: 'Deplacements (train, taxi, hotel)',    tvaDeductibleParDefaut: true,  icone: '🚆' },
  { code: 'postal',         label: 'Affranchissements et envois RAR',      tvaDeductibleParDefaut: true,  icone: '✉️' },
  { code: 'sous_traitance', label: 'Sous-traitance (huissiers, experts, traducteurs)', tvaDeductibleParDefaut: true, icone: '🤝' },
  { code: 'formation',      label: 'Formation continue',                   tvaDeductibleParDefaut: true,  icone: '📚' },
  { code: 'banque',         label: 'Frais bancaires',                      tvaDeductibleParDefaut: false, icone: '🏦' },
  { code: 'impots',         label: 'Impots et taxes (CFE, CVAE)',          tvaDeductibleParDefaut: false, icone: '📋' },
  { code: 'telephonie',     label: 'Telephonie et internet',               tvaDeductibleParDefaut: true,  icone: '📞' },
  { code: 'energie',        label: 'Energie (electricite, gaz, eau)',      tvaDeductibleParDefaut: true,  icone: '⚡' },
  { code: 'assurance',      label: 'Assurances (locale, materielle)',      tvaDeductibleParDefaut: true,  icone: '🔒' },
  { code: 'restauration',   label: 'Restauration / repas d\'affaires',     tvaDeductibleParDefaut: true,  icone: '🍽️' },
  { code: 'documentation',  label: 'Documentation juridique (livres, revues)', tvaDeductibleParDefaut: true, icone: '📖' },
  { code: 'autre',          label: 'Autre',                                tvaDeductibleParDefaut: true,  icone: '📝' },
];

const CATEGORIE_BY_CODE = Object.fromEntries(CATEGORIES_DEPENSES.map(c => [c.code, c]));

// ============================================================
// Modes de paiement
// ============================================================
const MODES_PAIEMENT = [
  { code: 'virement', label: 'Virement' },
  { code: 'cheque', label: 'Cheque' },
  { code: 'cb', label: 'Carte bancaire' },
  { code: 'especes', label: 'Especes' },
  { code: 'prelevement', label: 'Prelevement automatique' },
  { code: 'autre', label: 'Autre' },
];

// ============================================================
// Frequences de recurrence
// ============================================================
const FREQUENCES = [
  { code: 'mensuelle',     label: 'Mensuelle',     intervalleEnMois: 1 },
  { code: 'trimestrielle', label: 'Trimestrielle', intervalleEnMois: 3 },
  { code: 'semestrielle',  label: 'Semestrielle',  intervalleEnMois: 6 },
  { code: 'annuelle',      label: 'Annuelle',      intervalleEnMois: 12 },
];

// ============================================================
// Taux de TVA usuels en France
// ============================================================
const TAUX_TVA = [
  { taux: 20,  label: '20 % (taux normal)' },
  { taux: 10,  label: '10 % (taux intermediaire)' },
  { taux: 5.5, label: '5,5 % (taux reduit)' },
  { taux: 2.1, label: '2,1 % (taux super-reduit)' },
  { taux: 0,   label: '0 % (exoneration)' },
];

// ============================================================
// Helpers
// ============================================================
function ajouterMois(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function intervalleParFrequence(frequence) {
  const f = FREQUENCES.find(f => f.code === frequence);
  return f ? f.intervalleEnMois : 1;
}

module.exports = {
  CATEGORIES_DEPENSES,
  CATEGORIE_BY_CODE,
  MODES_PAIEMENT,
  FREQUENCES,
  TAUX_TVA,
  ajouterMois,
  intervalleParFrequence,
};
