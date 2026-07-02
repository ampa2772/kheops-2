// server/services/cabinetRoles.js
//
// Résolution du RÔLE d'un utilisateur dans son cabinet (RBAC — A6/A7).
//
// Modèle de rôles (cf. models/Cabinet/Membership.js) :
//   - 'owner'         : titulaire du cabinet (Tenant.ownerUserId). Droits pleins.
//   - 'admin'         : membre administrateur. Droits pleins de gestion.
//   - 'avocat'        : collaborateur avocat. Peut créer/supprimer des dossiers.
//   - 'collaborateur' : collaborateur non-avocat. Lecture/écriture métier, PAS de suppression.
//   - 'secretaire'    : secrétariat. Lecture/écriture métier, PAS de suppression.
//
// FERMÉ PAR DÉFAUT côté isolation, OUVERT PAR DÉFAUT côté rôle pour le SOLO :
// un utilisateur SANS Tenant ni Membership (cas historique mono-utilisateur) est
// par définition le seul propriétaire de SES données (les liens UserDossier sont
// self) — on lui rend donc le rôle 'owner'. Le cloisonnement inter-cabinet reste
// assuré en amont par ownershipHelpers/getAccessibleUserIds ; ce module ne fait
// que restreindre les actions À L'INTÉRIEUR d'un cabinet déjà résolu.

const Tenant = require('../models/Cabinet/Tenant');
const Membership = require('../models/Cabinet/Membership');
const { log: secLog, EVT } = require('../utils/securityLogger');

const ROLES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  AVOCAT: 'avocat',
  COLLABORATEUR: 'collaborateur',
  SECRETAIRE: 'secretaire',
});

// Rôles autorisés à SUPPRIMER un dossier (action destructrice / irréversible).
const ROLES_CAN_DELETE_DOSSIER = Object.freeze([ROLES.OWNER, ROLES.ADMIN, ROLES.AVOCAT]);

// A6 — rôles autorisés à ENGAGER une opération CARPA : changement d'état
// (validation, dépôt, restitution, annulation), suppression définitive d'un
// brouillon, mainlevée d'un gel LCB-FT. Le maniement des fonds de tiers est
// un acte réglementé : le secrétariat prépare les brouillons, il n'engage pas.
const ROLES_CAN_VALIDATE_CARPA = Object.freeze([ROLES.OWNER, ROLES.ADMIN, ROLES.AVOCAT]);

// A6 — rôles autorisés à consulter les finances CONSOLIDÉES du cabinet
// (bilan recettes/dépenses, rentabilité par dossier). Le chiffre d'affaires
// global du cabinet ne regarde que le titulaire et les administrateurs.
const ROLES_CAN_VIEW_CABINET_FINANCES = Object.freeze([ROLES.OWNER, ROLES.ADMIN]);

// Ordre de priorité si l'utilisateur cumule owner + memberships multiples :
// on renvoie le rôle le plus fort.
const ROLE_RANK = { owner: 4, admin: 3, avocat: 2, collaborateur: 1, secretaire: 1 };

/**
 * Renvoie le rôle EFFECTIF (le plus fort) de l'utilisateur dans son cabinet.
 * Fermé côté données mais 'owner' par défaut pour le solo (voir en-tête).
 * @param {string|ObjectId} userId
 * @returns {Promise<'owner'|'admin'|'avocat'|'collaborateur'|'secretaire'>}
 */
async function getCabinetRole(userId) {
  if (!userId) return ROLES.SECRETAIRE; // plus restrictif si on ne sait pas qui c'est
  try {
    // 1. Titulaire d'un cabinet ?
    const owned = await Tenant.findOne({ ownerUserId: userId }).select('_id').lean();
    if (owned) return ROLES.OWNER;

    // 2. Membre actif ? On prend le rôle le plus fort parmi les memberships actifs.
    const memberships = await Membership.find({ userId, status: 'active' }).select('role').lean();
    if (memberships.length > 0) {
      let best = null;
      for (const m of memberships) {
        const r = m.role || ROLES.COLLABORATEUR;
        if (!best || (ROLE_RANK[r] || 0) > (ROLE_RANK[best] || 0)) best = r;
      }
      return best || ROLES.COLLABORATEUR;
    }

    // 3. Ni owner ni membre : utilisateur solo → propriétaire de ses données.
    return ROLES.OWNER;
  } catch (err) {
    console.error('[cabinetRoles] getCabinetRole — repli restrictif (secretaire):', err.message);
    // En cas d'erreur, on renvoie le rôle le plus restrictif : fail-safe.
    return ROLES.SECRETAIRE;
  }
}

/**
 * @param {string} role
 * @returns {boolean} true si ce rôle peut supprimer un dossier.
 */
function canDeleteDossier(role) {
  return ROLES_CAN_DELETE_DOSSIER.includes(role);
}

/**
 * @param {string} role
 * @returns {boolean} true si ce rôle peut engager une opération CARPA.
 */
function canValidateCarpa(role) {
  return ROLES_CAN_VALIDATE_CARPA.includes(role);
}

/**
 * @param {string} role
 * @returns {boolean} true si ce rôle peut consulter les finances du cabinet.
 */
function canViewCabinetFinances(role) {
  return ROLES_CAN_VIEW_CABINET_FINANCES.includes(role);
}

/**
 * Garde express (A6) : résout le rôle de req.user et répond 403 (avec log
 * sécurité ACCESS_DENIED) si ce rôle n'est pas dans allowedRoles.
 * Même contrat que les ensure* d'ownershipHelpers : renvoie true si l'action
 * peut continuer, false si la réponse a déjà été émise.
 * @param {object} req
 * @param {object} res
 * @param {readonly string[]} allowedRoles
 * @param {string} [message] message 403 spécifique à l'action
 * @returns {Promise<boolean>}
 */
async function ensureCabinetRole(req, res, allowedRoles, message) {
  const role = await getCabinetRole(req.user);
  if (allowedRoles.includes(role)) return true;
  secLog(EVT.ACCESS_DENIED, {
    userId: req.user ? String(req.user) : null,
    resourceType: 'cabinet-role',
    resourceId: req.originalUrl || req.url || null,
    reason: `role-forbidden:${role}`,
  }, req);
  res.status(403).json({
    message: message || 'Accès refusé : votre rôle dans le cabinet ne permet pas cette action.',
    code: 'ROLE_FORBIDDEN',
  });
  return false;
}

module.exports = {
  ROLES,
  ROLES_CAN_DELETE_DOSSIER,
  ROLES_CAN_VALIDATE_CARPA,
  ROLES_CAN_VIEW_CABINET_FINANCES,
  getCabinetRole,
  canDeleteDossier,
  canValidateCarpa,
  canViewCabinetFinances,
  ensureCabinetRole,
};
