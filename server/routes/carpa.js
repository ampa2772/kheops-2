// Kheops_2/server/routes/carpa.js
//
// Routes REST pour le module CARPA (gestion des fonds de tiers).
// Toutes les routes sont protegees par le middleware d'authentification ;
// l'OfficeUser actif est resolu via le header X-Office-User-Id (meme
// principe que le chat).
//
// Pas de route DELETE physique sur les operations validees : on transitionne
// vers l'etat `annule` et on conserve la trace dans le journal d'audit.
// Seule exception : DELETE autorisee sur les BROUILLONS (operations jamais
// validees, sans existence legale). La suppression du brouillon est elle-meme
// loggee dans l'audit.

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const auth = require('../middlewares/middleware-auth');
const { asyncHandler } = require('../middlewares/folder-middleWare');
const { ensureDossierOwnership } = require('../utils/ownershipHelpers');
const audit = require('../utils/auditLogger');

const CarpaOperation = require('../models/Carpa/CarpaOperation');
const Dossier = require('../models/Folder/Dossier');

const carpaService = require('../services/carpaService');
const carpaAudit = require('../services/carpaAuditService');
const carpaConstants = require('../services/carpaConstants');

// ============================================================
// Helpers internes
// ============================================================

// Renvoie l'ownerUserId effectif (le User auth = le titulaire du cabinet).
// Avec le BYPASS_AUTH actif, req.user vaut BYPASS_USER_ID.
function getOwnerUserId(req) {
  if (!req.user) return null;
  return String(req.user);
}

async function requireOfficeUserId(req, res) {
  const id = await carpaService.resolveActiveOfficeUserId(req);
  if (!id) {
    res.status(401).json({ message: 'OfficeUser actif introuvable.' });
    return null;
  }
  return id;
}

function jsonValidationErr(res, msg) {
  return res.status(400).json({ message: msg });
}

// ============================================================
// GET /api/carpa/constants
// Renvoie les referentiels (types, pieces, transitions) au client.
// ============================================================
router.get('/constants', auth, (req, res) => {
  res.json({
    typesEntree: carpaConstants.TYPES_ENTREE,
    typesSortie: carpaConstants.TYPES_SORTIE,
    typeLabels: carpaConstants.TYPE_LABELS,
    categoriesPieces: carpaConstants.CATEGORIES_PIECES,
    categorieLabels: carpaConstants.CATEGORIE_LABELS,
    piecesRequisesParType: carpaConstants.PIECES_REQUISES_PAR_TYPE,
    transitionsEntree: carpaConstants.TRANSITIONS_ENTREE,
    transitionsSortie: carpaConstants.TRANSITIONS_SORTIE,
    seuils: carpaConstants.SEUILS_ALERTES,
    seuilMontantEleve: carpaConstants.SEUIL_MONTANT_ELEVE,
  });
});

// ============================================================
// POST /api/carpa/operations
// Creer une nouvelle operation (etat initial = brouillon).
// ============================================================
router.post('/operations', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  const officeUserId = await requireOfficeUserId(req, res);
  if (!officeUserId) return;

  const body = req.body || {};
  const sens = body.sens === 'sortie' ? 'sortie' : 'entree';

  if (!body.dossierId || !mongoose.Types.ObjectId.isValid(body.dossierId)) {
    return jsonValidationErr(res, 'dossierId manquant ou invalide.');
  }
  // SECURITE rc37 : on ne cree une op CARPA que dans un dossier du cabinet
  // courant. CRITIQUE pour la comptabilite reglementaire (LCB-FT) : sans ce
  // check, un user peut creer une trace CARPA dans le dossier d'un autre.
  if (!(await ensureDossierOwnership(req, res, body.dossierId))) return;

  if (!body.type || typeof body.type !== 'string') {
    return jsonValidationErr(res, 'type d\'operation requis.');
  }
  const montant = Number(body.montant);
  if (!Number.isFinite(montant) || montant < 0) {
    return jsonValidationErr(res, 'montant invalide.');
  }

  const estHonoraires = body.type === 'retrait_honoraires' || !!body.estHonoraires;
  const beneficiaireSnapshot = await carpaService.buildBeneficiaireSnapshot({
    beneficiaireContactId: body.beneficiaireContactId,
    estHonoraires,
    manualSnapshot: body.beneficiaireSnapshotManual,
  });

  const pieceCategoriesRequises = carpaService.piecesRequisesPourType(body.type);

  const op = new CarpaOperation({
    dossierId: body.dossierId,
    beneficiaireContactId: body.beneficiaireContactId && mongoose.Types.ObjectId.isValid(body.beneficiaireContactId)
      ? body.beneficiaireContactId
      : null,
    beneficiaireSnapshot,

    ownerUserId,
    createdByOfficeUserId: officeUserId,
    lastModifiedByOfficeUserId: officeUserId,

    sens,
    type: body.type,
    estHonoraires,
    factureLieeId: body.factureLieeId || null,

    montant,
    devise: body.devise || 'EUR',
    dateOperation: body.dateOperation ? new Date(body.dateOperation) : new Date(),
    dateReceptionFonds: body.dateReceptionFonds ? new Date(body.dateReceptionFonds) : null,

    etat: 'brouillon',
    pieceCategoriesRequises,

    modeReception: body.modeReception || null,
    modeRestitution: body.modeRestitution || null,
    ribBeneficiaireMasque: body.ribBeneficiaireBrut
      ? carpaService.masquerRib(body.ribBeneficiaireBrut)
      : (body.ribBeneficiaireMasque || null),

    payeurNom: body.payeurNom || '',
    payeurType: body.payeurType || '',

    notes: body.notes || '',
    reference: body.reference || '',
    referenceECarpa: body.referenceECarpa || '',
  });

  // Auto-detection des flags LCB-FT a la creation
  op.flagsLcbft = carpaService.recalculerFlagsLcbft(op);

  await op.save();

  await carpaAudit.writeAudit({
    operationId: op._id,
    dossierId: op.dossierId,
    ownerUserId,
    officeUserId,
    action: 'create',
    nouvelEtat: op.etat,
    resume: `Creation operation ${op.type} (${op.sens}, ${montant} ${op.devise})`,
  });

  // CRUD audit log (rc37) — separe du carpaAudit metier (qui sert l'audit
  // CARPA reglementaire). Les deux coexistent intentionnellement.
  audit.create(req, 'carpaOperation', op._id, {
    type: op.type,
    sens: op.sens,
    montant: op.montant,
    devise: op.devise,
    etat: op.etat,
    dossierId: String(op.dossierId),
  });

  res.status(201).json({ operation: op.toObject() });
}));

// ============================================================
// GET /api/carpa/operations?scope=...&dossierId=...&beneficiaireContactId=...&etat=...
// Lister les operations du cabinet courant.
// ============================================================
router.get('/operations', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });

  const filter = { ownerUserId };
  if (req.query.dossierId && mongoose.Types.ObjectId.isValid(req.query.dossierId)) {
    filter.dossierId = req.query.dossierId;
  }
  if (req.query.beneficiaireContactId && mongoose.Types.ObjectId.isValid(req.query.beneficiaireContactId)) {
    filter.beneficiaireContactId = req.query.beneficiaireContactId;
  }
  if (req.query.etat) {
    filter.etat = req.query.etat;
  }
  if (req.query.sens === 'entree' || req.query.sens === 'sortie') {
    filter.sens = req.query.sens;
  }
  if (req.query.estHonoraires === 'true') filter.estHonoraires = true;
  if (req.query.estHonoraires === 'false') filter.estHonoraires = false;

  const operations = await CarpaOperation.find(filter)
    .sort({ dateOperation: -1, createdAt: -1 })
    .lean();

  res.json({ operations });
}));

// ============================================================
// GET /api/carpa/operations/:id
// ============================================================
router.get('/operations/:id', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return jsonValidationErr(res, 'id invalide.');
  }
  const op = await CarpaOperation.findOne({ _id: req.params.id, ownerUserId }).lean();
  if (!op) return res.status(404).json({ message: 'Operation introuvable.' });
  const audit = await carpaAudit.listAuditForOperation(op._id);
  res.json({ operation: op, audit });
}));

// ============================================================
// PATCH /api/carpa/operations/:id
// Mise a jour des champs metier (sauf etat). Pour changer l'etat, voir
// POST /:id/transition.
// ============================================================
router.patch('/operations/:id', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  const officeUserId = await requireOfficeUserId(req, res);
  if (!officeUserId) return;
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return jsonValidationErr(res, 'id invalide.');
  }

  const op = await CarpaOperation.findOne({ _id: req.params.id, ownerUserId });
  if (!op) return res.status(404).json({ message: 'Operation introuvable.' });
  if (op.etat === 'annule') {
    return res.status(409).json({ message: 'Operation annulee : modification interdite.' });
  }

  const body = req.body || {};
  const champsModifies = {};
  const champsLibres = [
    'montant', 'devise', 'reference', 'referenceECarpa', 'notes',
    'payeurNom', 'payeurType', 'modeReception', 'modeRestitution',
    'dateOperation', 'dateReceptionFonds', 'dateDepotCarpa',
    'dateBonneFin', 'dateInstructionRetrait', 'dateRestitution',
    'compteSpecialMotif', 'factureLieeId',
  ];

  for (const champ of champsLibres) {
    if (Object.prototype.hasOwnProperty.call(body, champ)) {
      const ancien = op[champ];
      let nouvelle = body[champ];
      if (champ === 'montant') {
        nouvelle = Number(nouvelle);
        if (!Number.isFinite(nouvelle) || nouvelle < 0) continue;
      }
      if (champ.startsWith('date') && nouvelle) {
        nouvelle = new Date(nouvelle);
      }
      op[champ] = nouvelle;
      champsModifies[champ] = { avant: ancien, apres: nouvelle };
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'ribBeneficiaireBrut') && body.ribBeneficiaireBrut !== undefined) {
    const masque = carpaService.masquerRib(body.ribBeneficiaireBrut);
    if (masque !== op.ribBeneficiaireMasque) {
      champsModifies.ribBeneficiaireMasque = { avant: op.ribBeneficiaireMasque, apres: masque };
      op.ribBeneficiaireMasque = masque;
    }
  }

  // Mise a jour du beneficiaire (changement de contact)
  if (Object.prototype.hasOwnProperty.call(body, 'beneficiaireContactId')) {
    const newId = body.beneficiaireContactId;
    if (newId && !mongoose.Types.ObjectId.isValid(newId) && newId !== '') {
      return jsonValidationErr(res, 'beneficiaireContactId invalide.');
    }
    op.beneficiaireContactId = newId || null;
    op.beneficiaireSnapshot = await carpaService.buildBeneficiaireSnapshot({
      beneficiaireContactId: op.beneficiaireContactId,
      estHonoraires: op.estHonoraires,
      manualSnapshot: body.beneficiaireSnapshotManual,
    });
    champsModifies.beneficiaireContactId = { avant: null, apres: newId || null };
  }

  // Si le type change, on recalcule les pieces requises
  if (Object.prototype.hasOwnProperty.call(body, 'type') && body.type !== op.type) {
    const ancienType = op.type;
    op.type = body.type;
    op.pieceCategoriesRequises = carpaService.piecesRequisesPourType(op.type);
    op.estHonoraires = (op.type === 'retrait_honoraires');
    champsModifies.type = { avant: ancienType, apres: op.type };
  }

  // Recalcul des flags LCB-FT (preserve les manuels et les levees)
  op.flagsLcbft = carpaService.recalculerFlagsLcbft(op);
  op.lastModifiedByOfficeUserId = officeUserId;

  await op.save();

  if (Object.keys(champsModifies).length > 0) {
    await carpaAudit.writeAudit({
      operationId: op._id,
      dossierId: op.dossierId,
      ownerUserId,
      officeUserId,
      action: 'update_field',
      champsModifies,
      resume: `Modification : ${Object.keys(champsModifies).join(', ')}`,
    });
  }

  res.json({ operation: op.toObject() });
}));

// ============================================================
// DELETE /api/carpa/operations/:id
// Suppression definitive UNIQUEMENT pour les brouillons (operations
// jamais validees, sans existence legale). Pour toute operation deja
// engagee dans la machine a etats, l'utilisateur doit utiliser la
// transition vers `annule` (qui conserve la trace pour l'audit CARPA).
// ============================================================
router.delete('/operations/:id', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  const officeUserId = await requireOfficeUserId(req, res);
  if (!officeUserId) return;

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return jsonValidationErr(res, 'id invalide.');
  }

  const op = await CarpaOperation.findOne({ _id: req.params.id, ownerUserId });
  if (!op) return res.status(404).json({ message: 'Operation introuvable.' });

  if (op.etat !== 'brouillon') {
    return res.status(409).json({
      message: `Suppression impossible : seuls les brouillons peuvent etre supprimes definitivement. Cette operation est en etat "${op.etat}". Utilisez l'annulation pour conserver la trace dans l'audit CARPA.`,
      code: 'NOT_BROUILLON',
      etatActuel: op.etat,
    });
  }

  const snapshot = {
    _id: op._id,
    sens: op.sens,
    type: op.type,
    montant: op.montant,
    devise: op.devise,
    beneficiaire: carpaService.beneficiaireResume
      ? carpaService.beneficiaireResume(op.beneficiaireSnapshot, op.beneficiaireContactId)
      : '(brouillon)',
  };

  await op.deleteOne();

  // Journal d'audit : meme une suppression de brouillon laisse une trace.
  await carpaAudit.writeAudit({
    operationId: snapshot._id,
    dossierId: op.dossierId,
    ownerUserId,
    officeUserId,
    action: 'delete_brouillon',
    resume: `Brouillon supprime definitivement (${snapshot.sens} ${snapshot.type}, ${snapshot.montant} ${snapshot.devise || 'EUR'})`,
  });

  audit.delete(req, 'carpaOperation', snapshot._id, {
    type: snapshot.type,
    sens: snapshot.sens,
    montant: snapshot.montant,
    etat: 'brouillon',
  });

  res.json({ ok: true, deleted: String(snapshot._id) });
}));

// ============================================================
// POST /api/carpa/operations/:id/transition
// Changer l'etat (machine a etats).
// Body : { nouvelEtat, motif? }
// ============================================================
router.post('/operations/:id/transition', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  const officeUserId = await requireOfficeUserId(req, res);
  if (!officeUserId) return;

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return jsonValidationErr(res, 'id invalide.');
  }
  const { nouvelEtat, motif } = req.body || {};
  if (!nouvelEtat) return jsonValidationErr(res, 'nouvelEtat requis.');

  const op = await CarpaOperation.findOne({ _id: req.params.id, ownerUserId });
  if (!op) return res.status(404).json({ message: 'Operation introuvable.' });

  // Verification : pour passer a `instruit_retrait` ou `depose_carpa`, on
  // controle que les pieces requises sont bien la (sauf si on force avec motif).
  const verifierPieces = ['instruit_retrait', 'depose_carpa'].includes(nouvelEtat);
  if (verifierPieces && !carpaService.piecesCompletes(op) && !req.body.forcer) {
    const manquantes = carpaService.piecesManquantes(op);
    return res.status(409).json({
      message: 'Pieces justificatives incompletes.',
      piecesManquantes: manquantes,
    });
  }

  let ancien;
  try {
    ancien = carpaService.appliquerTransition(op, nouvelEtat);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ message: e.message });
  }

  if (motif) {
    op.notes = (op.notes ? op.notes + '\n' : '') + `[${new Date().toISOString().slice(0, 10)}] Transition ${ancien} -> ${nouvelEtat} : ${motif}`;
  }
  op.lastModifiedByOfficeUserId = officeUserId;

  await op.save();

  await carpaAudit.writeAudit({
    operationId: op._id,
    dossierId: op.dossierId,
    ownerUserId,
    officeUserId,
    action: 'state_change',
    ancienEtat: ancien,
    nouvelEtat,
    resume: `Transition ${ancien} -> ${nouvelEtat}` + (motif ? ` (${motif})` : ''),
  });

  audit.update(req, 'carpaOperation', op._id, {
    transition: { from: ancien, to: nouvelEtat, motif: motif || null },
  });

  res.json({ operation: op.toObject() });
}));

// ============================================================
// POST /api/carpa/operations/:id/pieces
// Ajouter une piece justificative (lien vers un Document du dossier ou
// reference libre).
// ============================================================
router.post('/operations/:id/pieces', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  const officeUserId = await requireOfficeUserId(req, res);
  if (!officeUserId) return;

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return jsonValidationErr(res, 'id invalide.');
  }
  const { categoriePiece, documentId, nomFichier } = req.body || {};
  if (!categoriePiece) return jsonValidationErr(res, 'categoriePiece requise.');

  const op = await CarpaOperation.findOne({ _id: req.params.id, ownerUserId });
  if (!op) return res.status(404).json({ message: 'Operation introuvable.' });

  op.pieces.push({
    categoriePiece,
    documentId: documentId && mongoose.Types.ObjectId.isValid(documentId) ? documentId : undefined,
    nomFichier: nomFichier || '',
    fournieLe: new Date(),
  });
  op.lastModifiedByOfficeUserId = officeUserId;

  await op.save();

  await carpaAudit.writeAudit({
    operationId: op._id,
    dossierId: op.dossierId,
    ownerUserId,
    officeUserId,
    action: 'piece_add',
    resume: `Ajout piece ${categoriePiece}` + (nomFichier ? ` (${nomFichier})` : ''),
  });

  res.json({ operation: op.toObject() });
}));

// ============================================================
// DELETE /api/carpa/operations/:id/pieces/:pieceId
// ============================================================
router.delete('/operations/:id/pieces/:pieceId', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  const officeUserId = await requireOfficeUserId(req, res);
  if (!officeUserId) return;

  const op = await CarpaOperation.findOne({ _id: req.params.id, ownerUserId });
  if (!op) return res.status(404).json({ message: 'Operation introuvable.' });

  const piece = op.pieces.id(req.params.pieceId);
  if (!piece) return res.status(404).json({ message: 'Piece introuvable.' });
  const cat = piece.categoriePiece;
  piece.deleteOne();
  op.lastModifiedByOfficeUserId = officeUserId;

  await op.save();

  await carpaAudit.writeAudit({
    operationId: op._id,
    dossierId: op.dossierId,
    ownerUserId,
    officeUserId,
    action: 'piece_remove',
    resume: `Retrait piece ${cat}`,
  });

  res.json({ operation: op.toObject() });
}));

// ============================================================
// POST /api/carpa/operations/:id/flags
// Ajouter un flag LCB-FT manuel.
// ============================================================
router.post('/operations/:id/flags', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  const officeUserId = await requireOfficeUserId(req, res);
  if (!officeUserId) return;

  const op = await CarpaOperation.findOne({ _id: req.params.id, ownerUserId });
  if (!op) return res.status(404).json({ message: 'Operation introuvable.' });

  const { type = 'manuel', raison } = req.body || {};
  op.flagsLcbft.push({ type, raison: raison || '', detecteLe: new Date() });
  op.lastModifiedByOfficeUserId = officeUserId;
  await op.save();

  await carpaAudit.writeAudit({
    operationId: op._id,
    dossierId: op.dossierId,
    ownerUserId,
    officeUserId,
    action: 'flag_lcbft_add',
    resume: `Flag LCB-FT ajoute (${type})${raison ? ' : ' + raison : ''}`,
  });

  res.json({ operation: op.toObject() });
}));

// ============================================================
// POST /api/carpa/operations/:id/flags/:flagId/lift
// Lever un flag LCB-FT (avec motif).
// ============================================================
router.post('/operations/:id/flags/:flagId/lift', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  const officeUserId = await requireOfficeUserId(req, res);
  if (!officeUserId) return;

  const op = await CarpaOperation.findOne({ _id: req.params.id, ownerUserId });
  if (!op) return res.status(404).json({ message: 'Operation introuvable.' });

  const flag = op.flagsLcbft.id(req.params.flagId);
  if (!flag) return res.status(404).json({ message: 'Flag introuvable.' });
  if (flag.leveeLe) return res.status(409).json({ message: 'Flag deja leve.' });

  flag.leveeLe = new Date();
  flag.leveePar = officeUserId;
  flag.motifLevee = (req.body && req.body.motif) || '';
  op.lastModifiedByOfficeUserId = officeUserId;
  await op.save();

  await carpaAudit.writeAudit({
    operationId: op._id,
    dossierId: op.dossierId,
    ownerUserId,
    officeUserId,
    action: 'flag_lcbft_lift',
    resume: `Flag LCB-FT leve (${flag.type})` + (flag.motifLevee ? ' : ' + flag.motifLevee : ''),
  });

  res.json({ operation: op.toObject() });
}));

// ============================================================
// GET /api/carpa/dashboard
// Vue agregee : par beneficiaire, honoraires separes, alertes, totaux.
// ============================================================
router.get('/dashboard', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });

  const all = await CarpaOperation.find({ ownerUserId }).sort({ dateOperation: -1 }).lean();

  // Charger les dossiers concernes pour l'affichage (nom + reference)
  const dossierIds = [...new Set(all.map(o => String(o.dossierId)).filter(Boolean))];
  const dossiers = dossierIds.length
    ? await Dossier.find({ _id: { $in: dossierIds } }).select('reference dossier').lean()
    : [];
  const dossierIndex = {};
  for (const d of dossiers) {
    dossierIndex[String(d._id)] = {
      _id: d._id,
      reference: d.reference,
      nom: d.dossier?.dossier?.nom || d.dossier?.nom || d.reference || 'Dossier',
    };
  }

  // Groupement par beneficiaire (operations hors honoraires)
  const operations = all.filter(o => !o.estHonoraires);
  const honoraires = all.filter(o => o.estHonoraires);

  const groupes = new Map();
  for (const op of operations) {
    const key = op.beneficiaireContactId
      ? `contact:${op.beneficiaireContactId}`
      : `manuel:${(op.beneficiaireSnapshot?.nom || '') + '|' + (op.beneficiaireSnapshot?.raisonSociale || '')}`;

    if (!groupes.has(key)) {
      groupes.set(key, {
        cle: key,
        beneficiaireContactId: op.beneficiaireContactId || null,
        snapshot: op.beneficiaireSnapshot || {},
        totalEntrees: 0,
        totalSorties: 0,
        nbEnAttente: 0,
        nbBloquees: 0,
        operations: [],
      });
    }
    const g = groupes.get(key);
    g.operations.push(op);
    if (op.sens === 'entree' && op.etat !== 'annule') g.totalEntrees += op.montant || 0;
    if (op.sens === 'sortie' && op.etat !== 'annule' && op.etat !== 'compte_special_bloque') g.totalSorties += op.montant || 0;
    if (['recu_cabinet', 'depose_carpa', 'controle_carpa', 'instruit_retrait'].includes(op.etat)) g.nbEnAttente += 1;
    if (op.etat === 'compte_special_bloque') g.nbBloquees += 1;
  }

  const beneficiaires = Array.from(groupes.values()).sort((a, b) => {
    const totalA = a.totalEntrees - a.totalSorties;
    const totalB = b.totalEntrees - b.totalSorties;
    return totalB - totalA;
  });

  // Totaux honoraires
  const totalHonoraires = {
    enAttente: honoraires
      .filter(o => ['brouillon', 'instruit_retrait'].includes(o.etat))
      .reduce((s, o) => s + (o.montant || 0), 0),
    perçus: honoraires
      .filter(o => o.etat === 'restitue')
      .reduce((s, o) => s + (o.montant || 0), 0),
    operations: honoraires,
  };

  // Alertes globales
  const alertes = carpaService.computeAlerts(all);

  // Compteurs globaux
  const totaux = {
    fondsEnTransitEntrees: all
      .filter(o => o.sens === 'entree' && !['annule', 'encaisse_definitif'].includes(o.etat))
      .reduce((s, o) => s + (o.montant || 0), 0),
    fondsEnTransitSorties: all
      .filter(o => o.sens === 'sortie' && !['annule', 'restitue'].includes(o.etat))
      .reduce((s, o) => s + (o.montant || 0), 0),
    nbOperationsActives: all.filter(o => !['annule', 'restitue', 'encaisse_definitif'].includes(o.etat)).length,
    nbOperations: all.length,
  };

  res.json({
    beneficiaires,
    honoraires: totalHonoraires,
    alertes,
    totaux,
    dossierIndex,
  });
}));

// ============================================================
// GET /api/carpa/stats?annee=YYYY
// Statistiques annuelles (pour rapport au commissaire aux comptes / cabinet).
// ============================================================
router.get('/stats', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });

  const annee = parseInt(req.query.annee, 10) || new Date().getFullYear();
  const debut = new Date(annee, 0, 1);
  const fin = new Date(annee + 1, 0, 1);

  const ops = await CarpaOperation.find({
    ownerUserId,
    dateOperation: { $gte: debut, $lt: fin },
  }).lean();

  const parType = {};
  let totalEntrees = 0;
  let totalSorties = 0;
  let totalHonoraires = 0;
  for (const op of ops) {
    const k = `${op.sens}/${op.type}`;
    if (!parType[k]) parType[k] = { count: 0, total: 0 };
    parType[k].count += 1;
    parType[k].total += op.montant || 0;

    if (op.etat !== 'annule') {
      if (op.sens === 'entree') totalEntrees += op.montant || 0;
      if (op.sens === 'sortie' && !op.estHonoraires) totalSorties += op.montant || 0;
      if (op.estHonoraires && op.etat === 'restitue') totalHonoraires += op.montant || 0;
    }
  }

  const parMois = Array.from({ length: 12 }, () => ({ entrees: 0, sorties: 0, count: 0 }));
  for (const op of ops) {
    if (op.etat === 'annule') continue;
    const mois = new Date(op.dateOperation).getMonth();
    parMois[mois].count += 1;
    if (op.sens === 'entree') parMois[mois].entrees += op.montant || 0;
    if (op.sens === 'sortie') parMois[mois].sorties += op.montant || 0;
  }

  res.json({
    annee,
    nbOperations: ops.length,
    totalEntrees,
    totalSorties,
    totalHonoraires,
    parType,
    parMois,
  });
}));

// ============================================================
// POST /api/carpa/reconciliation/csv
// Importe un CSV exporte d'e-Carpa. Format attendu :
// reference;date;sens;montant;libelle
// On rapproche par referenceECarpa, sinon par couple (date,montant).
// ============================================================
router.post('/reconciliation/csv', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  const officeUserId = await requireOfficeUserId(req, res);
  if (!officeUserId) return;

  const { csvText } = req.body || {};
  if (!csvText || typeof csvText !== 'string') {
    return jsonValidationErr(res, 'Champ csvText requis.');
  }

  // Parser CSV minimal (separateur ; ou ,) — pas de dependance externe
  const lignes = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lignes.length === 0) return res.json({ matched: 0, nouveaux: 0, ecarts: [] });

  // Detection separateur
  const sep = lignes[0].includes(';') ? ';' : ',';
  const header = lignes[0].split(sep).map(s => s.toLowerCase().trim());
  const idxRef = header.findIndex(h => h.includes('ref'));
  const idxDate = header.findIndex(h => h.includes('date'));
  const idxSens = header.findIndex(h => h.includes('sens') || h.includes('type'));
  const idxMontant = header.findIndex(h => h.includes('montant') || h.includes('amount'));

  let matched = 0;
  const ecarts = [];
  const nonAppariees = [];

  for (let i = 1; i < lignes.length; i++) {
    const cells = lignes[i].split(sep);
    const ref = idxRef >= 0 ? (cells[idxRef] || '').trim() : '';
    const date = idxDate >= 0 ? (cells[idxDate] || '').trim() : '';
    const sens = idxSens >= 0 ? (cells[idxSens] || '').trim().toLowerCase() : '';
    const montantStr = idxMontant >= 0 ? (cells[idxMontant] || '').trim().replace(/\s/g, '').replace(',', '.') : '';
    const montant = parseFloat(montantStr);

    if (!ref && !date) continue;

    // 1) Matching strict par referenceECarpa
    let op = null;
    if (ref) {
      op = await CarpaOperation.findOne({ ownerUserId, referenceECarpa: ref });
    }
    // 2) Sinon matching approximatif (montant + date jour)
    if (!op && Number.isFinite(montant) && date) {
      const target = new Date(date);
      if (!isNaN(target.getTime())) {
        const debut = new Date(target.getFullYear(), target.getMonth(), target.getDate());
        const finJ = new Date(target.getFullYear(), target.getMonth(), target.getDate() + 1);
        op = await CarpaOperation.findOne({
          ownerUserId,
          montant,
          dateOperation: { $gte: debut, $lt: finJ },
        });
      }
    }

    if (op) {
      op.reconciliation = op.reconciliation || {};
      op.reconciliation.reconcilie = true;
      op.reconciliation.reconcilieLe = new Date();
      op.reconciliation.referenceCsv = ref;
      if (Number.isFinite(montant) && Math.abs(montant - (op.montant || 0)) > 0.01) {
        op.reconciliation.ecartMontant = montant - (op.montant || 0);
        ecarts.push({
          operationId: op._id,
          ecartMontant: montant - (op.montant || 0),
          referenceCsv: ref,
        });
      } else {
        op.reconciliation.ecartMontant = 0;
      }
      await op.save();
      matched += 1;

      await carpaAudit.writeAudit({
        operationId: op._id,
        dossierId: op.dossierId,
        ownerUserId,
        officeUserId,
        action: 'reconciliation',
        resume: `Reconciliee avec CSV e-Carpa (ref=${ref})`,
      });
    } else {
      nonAppariees.push({ ref, date, sens, montant });
    }
  }

  res.json({ matched, ecarts, nonAppariees });
}));

module.exports = router;
