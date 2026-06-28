// Kheops_2/server/services/divorceCMConstants.js
//
// Referentiel statique pour le divorce par consentement mutuel :
// - liste des etapes procedurales (checklist)
// - libelles des regimes matrimoniaux et types de residence
// - regles de transition (audition mineur -> voie judiciaire)
//
// Sert a la fois cote serveur (validation, init) et cote client (UI),
// expose via GET /api/divorce-cm/constants.

// ============================================================
// Voie procedurale
// ============================================================
const VOIES = [
  { code: 'extrajudiciaire', label: 'Extrajudiciaire (acte sous signature privee contresigne par avocat)' },
  { code: 'judiciaire', label: 'Judiciaire (audition demandee par enfant mineur)' },
];

// ============================================================
// Regimes matrimoniaux
// ============================================================
const REGIMES_MATRIMONIAUX = [
  { code: 'communaute_legale', label: 'Communaute legale reduite aux acquets (defaut)' },
  { code: 'separation_biens', label: 'Separation de biens' },
  { code: 'communaute_universelle', label: 'Communaute universelle' },
  { code: 'participation_acquets', label: 'Participation aux acquets' },
  { code: 'autre', label: 'Autre regime' },
];

// ============================================================
// Residence enfant
// ============================================================
const TYPES_RESIDENCE = [
  { code: 'alternee', label: 'Residence alternee' },
  { code: 'principale_pere', label: 'Residence principale chez le pere' },
  { code: 'principale_mere', label: 'Residence principale chez la mere' },
  { code: 'autre', label: 'Autre arrangement' },
];

const TYPES_AUTORITE_PARENTALE = [
  { code: 'conjointe', label: 'Conjointe (defaut)' },
  { code: 'unique_pere', label: 'Exercice unique - pere' },
  { code: 'unique_mere', label: 'Exercice unique - mere' },
];

// ============================================================
// Prestation compensatoire (art. 270-275 C. civ.)
// ============================================================
const FORMES_PRESTATION = [
  { code: 'capital', label: 'Capital (paiement unique)' },
  { code: 'rente_temporaire', label: 'Rente temporaire' },
  { code: 'rente_viagere', label: 'Rente viagere (cas exceptionnels)' },
  { code: 'mixte', label: 'Mixte (capital + rente)' },
];

const MODALITES_CAPITAL = [
  { code: 'paiement_unique', label: 'Paiement unique' },
  { code: 'echelonne', label: 'Echelonne sur 8 ans maximum (art. 275)' },
  { code: 'attribution_bien', label: 'Attribution d\'un bien en propriete' },
];

// ============================================================
// Logement familial
// ============================================================
const TYPES_LOGEMENT = [
  { code: 'attribution_epoux1', label: 'Attribution a l\'Epoux 1 (avec ou sans soulte)' },
  { code: 'attribution_epoux2', label: 'Attribution a l\'Epoux 2 (avec ou sans soulte)' },
  { code: 'vente', label: 'Vente du bien commun' },
  { code: 'indivision', label: 'Maintien en indivision' },
  { code: 'autre', label: 'Autre disposition' },
];

// ============================================================
// Pension alimentaire / contribution entretien
// ============================================================
const REPARTITIONS_FRAIS = [
  { code: '50_50', label: 'Moitie / moitie' },
  { code: 'proportionnel_revenus', label: 'Proportionnel aux revenus' },
  { code: 'integral_debiteur', label: 'Integralement par le debiteur de la pension' },
  { code: 'autre', label: 'Autre repartition' },
];

const DUREES_PENSION = [
  { code: 'jusqu_majorite', label: 'Jusqu\'a la majorite' },
  { code: 'jusqu_autonomie', label: 'Jusqu\'a l\'autonomie financiere (defaut)' },
  { code: 'autre', label: 'Autre duree' },
];

// ============================================================
// Etapes procedurales (checklist) - voie extrajudiciaire
// ============================================================
const ETAPES_EXTRAJUDICIAIRE = [
  { code: 'premier_entretien', label: 'Premier rendez-vous des deux epoux', obligatoire: true, ordre: 1 },
  { code: 'identification_avocats', label: 'Identification des deux avocats (chacun le sien — obligatoire)', obligatoire: true, ordre: 2 },
  { code: 'collecte_pieces', label: 'Collecte des pieces (acte de mariage, livret de famille, justificatifs)', obligatoire: true, ordre: 3 },
  { code: 'etat_liquidatif_notarial', label: 'Etat liquidatif notarial (si bien immobilier commun)', obligatoire: false, ordre: 4 },
  { code: 'audition_mineur_proposee', label: 'Information aux enfants mineurs sur leur droit d\'etre entendus (art. 388-1 C. civ.)', obligatoire: true, ordre: 5 },
  { code: 'redaction_projet', label: 'Redaction du projet de convention', obligatoire: true, ordre: 6 },
  { code: 'envoi_projet_rar', label: 'Envoi du projet par lettre recommandee avec accuse de reception', obligatoire: true, ordre: 7 },
  { code: 'attente_delai_15j', label: 'Respect du delai de reflexion de 15 jours minimum', obligatoire: true, ordre: 8 },
  { code: 'signature_convention', label: 'Signature de la convention par les deux epoux et leurs avocats', obligatoire: true, ordre: 9 },
  { code: 'depot_notaire', label: 'Depot au notaire dans les 7 jours suivant la signature', obligatoire: true, ordre: 10 },
  { code: 'recepisse', label: 'Reception du recepisse du notaire (effet dissolutif du mariage)', obligatoire: true, ordre: 11 },
  { code: 'mention_marge', label: 'Mention en marge des actes d\'etat civil', obligatoire: true, ordre: 12 },
];

// Etapes specifiques en voie judiciaire (audition mineur)
const ETAPES_JUDICIAIRE = [
  { code: 'premier_entretien', label: 'Premier rendez-vous des deux epoux', obligatoire: true, ordre: 1 },
  { code: 'collecte_pieces', label: 'Collecte des pieces (acte de mariage, livret de famille, justificatifs)', obligatoire: true, ordre: 2 },
  { code: 'audition_mineur_demandee', label: 'Demande d\'audition de l\'enfant mineur', obligatoire: true, ordre: 3 },
  { code: 'redaction_convention', label: 'Redaction de la convention', obligatoire: true, ordre: 4 },
  { code: 'requete_jaf', label: 'Requete conjointe au Juge aux affaires familiales', obligatoire: true, ordre: 5 },
  { code: 'audition_mineur', label: 'Audition de l\'enfant mineur par le juge', obligatoire: true, ordre: 6 },
  { code: 'audience_homologation', label: 'Audience d\'homologation', obligatoire: true, ordre: 7 },
  { code: 'jugement_homologation', label: 'Jugement d\'homologation', obligatoire: true, ordre: 8 },
  { code: 'mention_marge', label: 'Mention en marge des actes d\'etat civil', obligatoire: true, ordre: 9 },
];

// Construit la liste d'etapes initiales pour une fiche fraichement creee
function etapesInitiales(voie = 'extrajudiciaire') {
  const ref = voie === 'judiciaire' ? ETAPES_JUDICIAIRE : ETAPES_EXTRAJUDICIAIRE;
  return ref.map(e => ({
    code: e.code,
    label: e.label,
    ordre: e.ordre,
    obligatoire: e.obligatoire,
    realiseLe: null,
    realisePar: null,
    notes: '',
  }));
}

// ============================================================
// Validation : voie judiciaire si un mineur souhaite etre entendu
// ============================================================
function voieRecommandee(divorceData) {
  const audition = (divorceData?.enfants || []).some(e => e && e.souhaiteEtreEntendu);
  return audition ? 'judiciaire' : 'extrajudiciaire';
}

// ============================================================
// Civilites
// ============================================================
const CIVILITES = [
  { code: 'M.', label: 'Monsieur' },
  { code: 'Mme', label: 'Madame' },
];

// ============================================================
// Sexe enfant
// ============================================================
const SEXES = [
  { code: 'M', label: 'Garcon' },
  { code: 'F', label: 'Fille' },
];

module.exports = {
  VOIES,
  REGIMES_MATRIMONIAUX,
  TYPES_RESIDENCE,
  TYPES_AUTORITE_PARENTALE,
  FORMES_PRESTATION,
  MODALITES_CAPITAL,
  TYPES_LOGEMENT,
  REPARTITIONS_FRAIS,
  DUREES_PENSION,
  ETAPES_EXTRAJUDICIAIRE,
  ETAPES_JUDICIAIRE,
  etapesInitiales,
  voieRecommandee,
  CIVILITES,
  SEXES,
};
