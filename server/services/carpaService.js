// Kheops_2/server/services/carpaService.js
//
// Logique metier des operations CARPA :
//  - resolution de l'OfficeUser actif (sur le meme principe que le chat)
//  - validation et application des transitions d'etat
//  - calcul des pieces requises
//  - detection automatique des drapeaux LCB-FT
//  - calcul des alertes pour le tableau de bord
//
// Toute la logique sensible est centralisee ici pour pouvoir etre testee
// independamment des routes Express.

const OfficeUser = require('../models/App_Users/OfficeUser');
const UserOfficeUser = require('../models/App_Users/modelsLiaisons/UserOfficeUser');
const Contact = require('../models/Folder/Contact');

const {
  PIECES_REQUISES_PAR_TYPE,
  isTransitionAutorisee,
  detecterFlagsLcbft,
  SEUILS_ALERTES,
} = require('./carpaConstants');

// ============================================================
// Resolution OfficeUser actif (meme logique que le chat)
// ============================================================
async function resolveActiveOfficeUserId(req) {
  const userId = String(req.user || '');
  if (!userId) return null;
  const fromHeader = req.headers['x-office-user-id'] || req.headers['X-Office-User-Id'];
  if (fromHeader) {
    const candidate = String(fromHeader);
    const link = await UserOfficeUser.findOne({ user: userId, officeUser: candidate }).lean();
    if (link) return candidate;
  }
  // Fallback : main OfficeUser du User
  const links = await UserOfficeUser.find({ user: userId }).populate('officeUser').lean();
  const main = links.map(l => l.officeUser).filter(Boolean).find(ou => ou.mainOfficeUser === true);
  if (main) return String(main._id);
  if (links.length > 0 && links[0].officeUser) return String(links[0].officeUser._id);
  return null;
}

// ============================================================
// Construction d'un snapshot beneficiaire a partir d'un Contact
// ============================================================
async function buildBeneficiaireSnapshot({ beneficiaireContactId, estHonoraires, manualSnapshot }) {
  if (estHonoraires) {
    return {
      nom: '',
      prenoms: '',
      raisonSociale: 'Cabinet (honoraires)',
      contactType: 'morale',
      type: 'honoraires',
      email: '',
      estAvocatTitulaire: true,
    };
  }
  if (manualSnapshot && (manualSnapshot.nom || manualSnapshot.raisonSociale)) {
    // L'avocat peut saisir un beneficiaire libre (ex : tiers non encore en base contacts)
    return {
      nom: manualSnapshot.nom || '',
      prenoms: manualSnapshot.prenoms || '',
      raisonSociale: manualSnapshot.raisonSociale || '',
      contactType: manualSnapshot.contactType || 'physique',
      type: manualSnapshot.type || '',
      email: manualSnapshot.email || '',
      estAvocatTitulaire: false,
    };
  }
  if (!beneficiaireContactId) {
    return { nom: '', prenoms: '', raisonSociale: '', contactType: '', type: '', email: '', estAvocatTitulaire: false };
  }
  const c = await Contact.findById(beneficiaireContactId).lean();
  if (!c) {
    return { nom: '', prenoms: '', raisonSociale: '', contactType: '', type: '', email: '', estAvocatTitulaire: false };
  }
  return {
    nom: c.nom || '',
    prenoms: c.prenoms || '',
    raisonSociale: c.raisonSociale || c.denomination || '',
    contactType: c.contactType || '',
    type: c.type || '',
    email: c.email || '',
    estAvocatTitulaire: false,
  };
}

// ============================================================
// Pieces requises selon le type
// ============================================================
function piecesRequisesPourType(type) {
  return PIECES_REQUISES_PAR_TYPE[type] || [];
}

// Determine si toutes les pieces requises sont fournies.
// Une regle "categorie1|categorie2" est satisfaite si l'une OU l'autre est presente.
function piecesCompletes(operation) {
  const requises = operation.pieceCategoriesRequises || [];
  const fournies = (operation.pieces || []).map(p => p.categoriePiece);
  for (const regle of requises) {
    const alternatives = String(regle).split('|');
    if (!alternatives.some(cat => fournies.includes(cat))) {
      return false;
    }
  }
  return true;
}

function piecesManquantes(operation) {
  const requises = operation.pieceCategoriesRequises || [];
  const fournies = (operation.pieces || []).map(p => p.categoriePiece);
  return requises.filter((regle) => {
    const alternatives = String(regle).split('|');
    return !alternatives.some(cat => fournies.includes(cat));
  });
}

// ============================================================
// Application d'une transition d'etat
// ============================================================
function appliquerTransition(operation, nouvelEtat) {
  if (!isTransitionAutorisee(operation.sens, operation.etat, nouvelEtat)) {
    const err = new Error(
      `Transition d'etat interdite : ${operation.etat} -> ${nouvelEtat} (sens=${operation.sens})`
    );
    err.code = 'TRANSITION_REFUSEE';
    err.statusCode = 422;
    throw err;
  }

  const ancien = operation.etat;
  operation.etat = nouvelEtat;

  // Mise a jour des dates de jalon en fonction du nouvel etat
  const now = new Date();
  if (operation.sens === 'entree') {
    if (nouvelEtat === 'recu_cabinet' && !operation.dateReceptionFonds) operation.dateReceptionFonds = now;
    if (nouvelEtat === 'depose_carpa' && !operation.dateDepotCarpa) operation.dateDepotCarpa = now;
    if (nouvelEtat === 'controle_carpa' && !operation.dateControleTermine) {
      // pas de date a poser, c'est juste un statut intermediaire
    }
    if (nouvelEtat === 'encaisse_definitif' && !operation.dateBonneFin) operation.dateBonneFin = now;
  } else {
    if (nouvelEtat === 'instruit_retrait' && !operation.dateInstructionRetrait) operation.dateInstructionRetrait = now;
    if (nouvelEtat === 'restitue' && !operation.dateRestitution) operation.dateRestitution = now;
    if (nouvelEtat === 'compte_special_bloque' && !operation.compteSpecialDepuis) operation.compteSpecialDepuis = now;
  }

  return ancien;
}

// ============================================================
// Recalcul des drapeaux LCB-FT (auto)
// On preserve les flags manuels et leurs etats de levee.
// ============================================================
function recalculerFlagsLcbft(operation) {
  const flagsAuto = detecterFlagsLcbft(operation);
  const existants = operation.flagsLcbft || [];
  const manuels = existants.filter(f => f.type === 'manuel');
  const autoExistants = existants.filter(f => f.type !== 'manuel');

  // On garde les flags auto deja existants pour conserver leur historique de levee
  const merged = [];
  for (const flag of flagsAuto) {
    const dejaPresent = autoExistants.find(f => f.type === flag.type);
    if (dejaPresent) {
      merged.push(dejaPresent);
    } else {
      merged.push({ ...flag, detecteLe: new Date() });
    }
  }
  // On reinjecte les manuels
  return [...merged, ...manuels];
}

// ============================================================
// Calcul des alertes (utilise par le dashboard)
// ============================================================
function computeAlerts(operations) {
  const now = Date.now();
  const alerts = [];

  for (const op of operations) {
    // Alerte 1 : fonds recus mais non deposes depuis trop longtemps
    if (op.etat === 'recu_cabinet' && op.dateReceptionFonds) {
      const ageHeures = (now - new Date(op.dateReceptionFonds).getTime()) / 3600000;
      if (ageHeures > SEUILS_ALERTES.fonds_non_deposes_heures) {
        alerts.push({
          severite: 'critique',
          type: 'fonds_non_deposes',
          operationId: op._id,
          dossierId: op.dossierId,
          message: `Fonds recus depuis ${Math.round(ageHeures)} h non encore deposes a la CARPA`,
          conseil: 'Risque de maniement hors circuit (cf. arrete du 5 juillet 1996, art. 12). Deposer sans delai.',
        });
      }
    }

    // Alerte 2 : retrait instruit mais pieces incompletes
    if (op.etat === 'instruit_retrait' && !piecesCompletes(op)) {
      const ageJours = op.dateInstructionRetrait
        ? (now - new Date(op.dateInstructionRetrait).getTime()) / 86400000
        : 0;
      if (ageJours > SEUILS_ALERTES.pieces_manquantes_jours) {
        alerts.push({
          severite: 'attention',
          type: 'pieces_manquantes',
          operationId: op._id,
          dossierId: op.dossierId,
          message: `Retrait instruit depuis ${Math.round(ageJours)} j sans pieces completes`,
          conseil: 'La CARPA refusera le retrait. Completer le dossier de pieces.',
        });
      }
    }

    // Alerte 3 : compte special depuis trop longtemps
    if (op.etat === 'compte_special_bloque' && op.compteSpecialDepuis) {
      const ageMois = (now - new Date(op.compteSpecialDepuis).getTime()) / (86400000 * 30);
      if (ageMois > SEUILS_ALERTES.compte_special_mois) {
        alerts.push({
          severite: 'info',
          type: 'compte_special_long',
          operationId: op._id,
          dossierId: op.dossierId,
          message: `Fonds bloques sur compte special depuis ${Math.round(ageMois)} mois`,
          conseil: 'Verifier la situation du beneficiaire / ayants droit avant prescription.',
        });
      }
    }

    // Alerte 4 : depots / sequestres immobilises depuis longtemps
    if ((op.etat === 'encaisse_definitif' || op.etat === 'controle_carpa')
        && op.type === 'depot_sequestre'
        && op.dateDepotCarpa) {
      const ageJours = (now - new Date(op.dateDepotCarpa).getTime()) / 86400000;
      if (ageJours > SEUILS_ALERTES.immobilisation_longue_jours) {
        alerts.push({
          severite: 'info',
          type: 'sequestre_long',
          operationId: op._id,
          dossierId: op.dossierId,
          message: `Sequestre depuis ${Math.round(ageJours)} j`,
          conseil: 'Sequestre immobilise longtemps : verifier si une remuneration des fonds peut etre envisagee (CARPA France).',
        });
      }
    }

    // Alerte 5 : drapeaux LCB-FT non leves
    const flagsActifs = (op.flagsLcbft || []).filter(f => !f.leveeLe);
    if (flagsActifs.length > 0 && !['annule', 'restitue'].includes(op.etat)) {
      alerts.push({
        severite: 'attention',
        type: 'lcbft_non_levee',
        operationId: op._id,
        dossierId: op.dossierId,
        message: `${flagsActifs.length} drapeau(x) LCB-FT a verifier`,
        conseil: 'Examiner et lever les vigilances apres verification.',
      });
    }
  }

  return alerts;
}

// ============================================================
// Masquage IBAN / RIB
// On ne stocke jamais l'IBAN complet : seulement les 4 derniers caracteres.
// Cf. CLAUDE.md : pas de donnees bancaires sensibles persistees.
// ============================================================
function masquerRib(input) {
  if (!input) return null;
  const cleaned = String(input).replace(/\s+/g, '');
  if (cleaned.length < 4) return null;
  const last4 = cleaned.slice(-4);
  return `**** **** **** ${last4}`;
}

module.exports = {
  resolveActiveOfficeUserId,
  buildBeneficiaireSnapshot,
  piecesRequisesPourType,
  piecesCompletes,
  piecesManquantes,
  appliquerTransition,
  recalculerFlagsLcbft,
  computeAlerts,
  masquerRib,
};
