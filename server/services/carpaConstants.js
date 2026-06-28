// Kheops_2/server/services/carpaConstants.js
//
// Referentiel statique : types d'operations, pieces requises, transitions
// d'etat autorisees, regles LCB-FT. Centralise ici pour rester coherent
// entre le serveur (validation) et le client (UI). Le client lit ces
// regles via une route GET /api/carpa/constants au demarrage.

// ============================================================
// Types d'operation
// ============================================================
const TYPES_ENTREE = [
  { code: 'depot_client', label: 'Depot — fonds du client' },
  { code: 'depot_adverse', label: 'Depot — fonds de la partie adverse' },
  { code: 'depot_assurance', label: 'Depot — assurance / tiers payeur' },
  { code: 'depot_sequestre', label: 'Depot — sequestre conventionnel ou judiciaire' },
  { code: 'depot_autre', label: 'Depot — autre origine' },
];

const TYPES_SORTIE = [
  { code: 'retrait_beneficiaire', label: 'Retrait — versement au beneficiaire' },
  { code: 'retrait_partie_adverse', label: 'Retrait — versement a la partie adverse' },
  { code: 'retrait_expert', label: 'Retrait — paiement d\'un expert / huissier' },
  { code: 'retrait_honoraires', label: 'Retrait — prelevement d\'honoraires (avocat)' },
  { code: 'transfert_compte_special', label: 'Transfert — compte special (impossibilite de remise)' },
];

const TYPE_LABELS = Object.fromEntries(
  [...TYPES_ENTREE, ...TYPES_SORTIE].map(t => [t.code, t.label])
);

// ============================================================
// Categories de pieces justificatives
// ============================================================
const CATEGORIES_PIECES = [
  { code: 'identite_client', label: 'Piece d\'identite du client' },
  { code: 'identite_partie', label: 'Piece d\'identite de la partie' },
  { code: 'identite_beneficiaire', label: 'Piece d\'identite du beneficiaire' },
  { code: 'rib_payeur', label: 'RIB du payeur' },
  { code: 'rib_beneficiaire', label: 'RIB du beneficiaire' },
  { code: 'decision_justice', label: 'Decision de justice executoire' },
  { code: 'protocole_transaction', label: 'Protocole / transaction signe' },
  { code: 'acte_vente', label: 'Acte de vente / acte authentique' },
  { code: 'convention_sequestre', label: 'Convention de sequestre' },
  { code: 'autorisation_honoraires', label: 'Autorisation manuscrite de prelevement (honoraires)' },
  { code: 'convention_honoraires', label: 'Convention d\'honoraires' },
  { code: 'facture_approuvee', label: 'Facture approuvee par le client' },
  { code: 'facture_expert', label: 'Facture de l\'expert / huissier' },
  { code: 'mandat_expert', label: 'Mandat / autorisation pour l\'expert' },
  { code: 'decompte', label: 'Decompte des sommes' },
  { code: 'justification_blocage', label: 'Justification du blocage (compte special)' },
  { code: 'cheque_copie', label: 'Copie du cheque' },
  { code: 'autre', label: 'Autre piece' },
];

const CATEGORIE_LABELS = Object.fromEntries(
  CATEGORIES_PIECES.map(p => [p.code, p.label])
);

// Pieces requises selon le type d'operation
// (Une piece d'une famille `OU` peut etre indiquee avec |, on traite cote service)
const PIECES_REQUISES_PAR_TYPE = {
  // Entrees
  depot_client: ['identite_client'],
  depot_adverse: ['decision_justice|protocole_transaction'],
  depot_assurance: [],
  depot_sequestre: ['convention_sequestre', 'identite_partie'],
  depot_autre: [],

  // Sorties
  retrait_beneficiaire: ['rib_beneficiaire', 'identite_beneficiaire', 'decision_justice|protocole_transaction|decompte'],
  retrait_partie_adverse: ['rib_beneficiaire', 'decision_justice|protocole_transaction'],
  retrait_expert: ['facture_expert', 'mandat_expert'],
  retrait_honoraires: ['autorisation_honoraires', 'facture_approuvee|convention_honoraires'],
  transfert_compte_special: ['justification_blocage'],
};

// ============================================================
// Machine a etats : transitions autorisees
// ============================================================
const TRANSITIONS_ENTREE = {
  brouillon: ['recu_cabinet', 'depose_carpa', 'annule'],
  recu_cabinet: ['depose_carpa', 'annule'],
  depose_carpa: ['controle_carpa', 'encaisse_definitif', 'annule'],
  controle_carpa: ['encaisse_definitif', 'annule'],
  encaisse_definitif: ['annule'],
  annule: [],
};

const TRANSITIONS_SORTIE = {
  brouillon: ['instruit_retrait', 'annule'],
  instruit_retrait: ['restitue', 'compte_special_bloque', 'annule'],
  restitue: ['annule'],
  compte_special_bloque: ['restitue', 'annule'],
  annule: [],
};

const ETATS_TERMINAUX = ['encaisse_definitif', 'restitue', 'annule'];

const isTransitionAutorisee = (sens, from, to) => {
  const map = sens === 'entree' ? TRANSITIONS_ENTREE : TRANSITIONS_SORTIE;
  const allowed = map[from] || [];
  return allowed.includes(to);
};

// ============================================================
// Regles LCB-FT (auto-detection)
// ============================================================
// Les regles peuvent etre configurees par cabinet plus tard ; ici defaults.
const SEUIL_MONTANT_ELEVE = 10000; // EUR

const detecterFlagsLcbft = (operation) => {
  const flags = [];

  if (Number(operation.montant) >= SEUIL_MONTANT_ELEVE) {
    flags.push({
      type: 'montant_eleve',
      raison: `Montant >= ${SEUIL_MONTANT_ELEVE} EUR (vigilance renforcee recommandee)`,
    });
  }

  if (operation.modeReception === 'especes') {
    flags.push({
      type: 'especes',
      raison: 'Reception en especes : verifier l\'origine et conserver les justificatifs',
    });
  }

  // Beneficiaire different du payeur (pour les operations sortie/entree appariees)
  if (operation.sens === 'entree' && operation.payeurNom && operation.beneficiaireSnapshot?.nom) {
    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const payeur = norm(operation.payeurNom);
    const beneficiaire = norm(`${operation.beneficiaireSnapshot.prenoms || ''} ${operation.beneficiaireSnapshot.nom || ''}`);
    if (payeur && beneficiaire && !payeur.includes(beneficiaire) && !beneficiaire.includes(payeur)) {
      flags.push({
        type: 'beneficiaire_different',
        raison: `Payeur ("${operation.payeurNom}") different du beneficiaire ("${operation.beneficiaireSnapshot.nom}") : verifier le lien`,
      });
    }
  }

  return flags;
};

// ============================================================
// Seuils d'alertes (dashboard)
// ============================================================
const SEUILS_ALERTES = {
  // Entree : fonds recus mais non deposes a la CARPA depuis plus de N heures
  fonds_non_deposes_heures: 24,
  // Sortie : retrait instruit mais pieces incompletes depuis plus de N jours
  pieces_manquantes_jours: 7,
  // Compte special : fonds bloques depuis plus de N mois (alerte avant prescription)
  compte_special_mois: 6,
  // Sequestre / depot : immobilisation longue
  immobilisation_longue_jours: 90,
};

module.exports = {
  TYPES_ENTREE,
  TYPES_SORTIE,
  TYPE_LABELS,
  CATEGORIES_PIECES,
  CATEGORIE_LABELS,
  PIECES_REQUISES_PAR_TYPE,
  TRANSITIONS_ENTREE,
  TRANSITIONS_SORTIE,
  ETATS_TERMINAUX,
  isTransitionAutorisee,
  detecterFlagsLcbft,
  SEUILS_ALERTES,
  SEUIL_MONTANT_ELEVE,
};
