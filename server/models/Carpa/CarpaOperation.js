// Kheops_2/server/models/Carpa/CarpaOperation.js
//
// Modele d'une operation CARPA (depot entrant ou retrait sortant).
// Conforme aux exigences de tracabilite par affaire (decret de 1991, arrete
// du 5 juillet 1996) et aux pratiques locales (Paris, Versailles).
//
// Une operation est ancree a la fois :
//  - a un dossier (cle legale, individualisation par affaire)
//  - a un beneficiaire (lens UX principal cote utilisateur)
//
// Les snapshots (beneficiaireSnapshot, payeurNom...) sont conserves pour
// que l'operation reste lisible meme si le contact est modifie ou supprime
// par la suite.
const mongoose = require('mongoose');

// ----- Etats de la machine a etats ----------------------------------------
const ETATS_OPERATION = [
  'brouillon',                  // saisie en cours, non engagee
  'recu_cabinet',               // entree : fonds recus, pas encore deposes a la CARPA
  'depose_carpa',               // entree : depot effectue
  'controle_carpa',             // entree : CARPA en cours de controle
  'encaisse_definitif',         // entree : encaissement definitif confirme
  'instruit_retrait',           // sortie : instruction de retrait envoyee a la CARPA
  'restitue',                   // sortie : fonds verses au beneficiaire
  'compte_special_bloque',      // sortie : impossibilite de remise (compte special)
  'annule',                     // operation annulee (ne supprime pas, garde la trace)
];

// ----- Pieces justificatives ----------------------------------------------
const PieceSchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId },
  categoriePiece: { type: String, required: true }, // cf. carpaConstants.js
  nomFichier: { type: String, default: '' },
  fournieLe: { type: Date, default: Date.now },
}, { _id: true });

// ----- Drapeaux LCB-FT ----------------------------------------------------
const FlagLcbftSchema = new mongoose.Schema({
  type: { type: String, required: true }, // 'montant_eleve', 'especes', 'origine_etrangere', 'beneficiaire_different', 'urgence_inhabituelle', 'manuel'
  raison: { type: String, default: '' },
  detecteLe: { type: Date, default: Date.now },
  leveeLe: { type: Date, default: null },
  leveePar: { type: mongoose.Schema.Types.ObjectId, ref: 'OfficeUser', default: null },
  motifLevee: { type: String, default: '' },
}, { _id: true });

// ----- Snapshot du beneficiaire ------------------------------------------
const BeneficiaireSnapshotSchema = new mongoose.Schema({
  nom: { type: String, default: '' },
  prenoms: { type: String, default: '' },
  raisonSociale: { type: String, default: '' },
  contactType: { type: String, default: '' }, // 'physique' / 'morale'
  type: { type: String, default: '' },        // type interne du contact
  email: { type: String, default: '' },
  estAvocatTitulaire: { type: Boolean, default: false }, // pour les honoraires
}, { _id: false });

// ----- Reconciliation e-Carpa --------------------------------------------
const ReconciliationSchema = new mongoose.Schema({
  reconcilie: { type: Boolean, default: false },
  reconcilieLe: { type: Date, default: null },
  referenceCsv: { type: String, default: '' },
  ecartMontant: { type: Number, default: null },
  ecartDate: { type: Number, default: null }, // delta en jours
  notes: { type: String, default: '' },
}, { _id: false });

// ----- Schema principal ---------------------------------------------------
const CarpaOperationSchema = new mongoose.Schema({
  // --- Ancrage legal et UX ---
  dossierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true, index: true },
  beneficiaireContactId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null, index: true },
  beneficiaireSnapshot: { type: BeneficiaireSnapshotSchema, default: () => ({}) },

  // --- Ownership (cabinet) ---
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  createdByOfficeUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'OfficeUser', required: true },
  lastModifiedByOfficeUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'OfficeUser', default: null },

  // --- Type et sens ---
  sens: { type: String, enum: ['entree', 'sortie'], required: true, index: true },
  type: { type: String, required: true, index: true },
  // entree : 'depot_client' | 'depot_adverse' | 'depot_assurance' | 'depot_sequestre' | 'depot_autre'
  // sortie : 'retrait_beneficiaire' | 'retrait_honoraires' | 'retrait_expert' | 'retrait_partie_adverse' | 'transfert_compte_special'

  estHonoraires: { type: Boolean, default: false, index: true },
  factureLieeId: { type: String, default: null }, // ref string vers Dossier.factures._id (UUID)

  // --- Montants et devises ---
  montant: { type: Number, required: true, min: 0 },
  devise: { type: String, default: 'EUR' },

  // --- Dates clefs ---
  dateOperation: { type: Date, default: Date.now, index: true },         // date metier (saisie utilisateur)
  dateReceptionFonds: { type: Date, default: null },                      // date a laquelle l'avocat a recu les fonds (entree)
  dateDepotCarpa: { type: Date, default: null },                          // date du depot effectif a la CARPA (entree)
  dateControleTermine: { type: Date, default: null },                     // fin du controle CARPA (entree)
  dateBonneFin: { type: Date, default: null },                            // encaissement definitif (entree)
  dateInstructionRetrait: { type: Date, default: null },                  // demande de retrait envoyee (sortie)
  dateRestitution: { type: Date, default: null },                         // versement au beneficiaire (sortie)

  // --- Etat ---
  etat: { type: String, enum: ETATS_OPERATION, default: 'brouillon', index: true },

  // --- Pieces justificatives ---
  pieces: { type: [PieceSchema], default: [] },
  pieceCategoriesRequises: { type: [String], default: [] }, // calcule selon le type

  // --- Mode de paiement (snapshot, jamais d'IBAN complet) ---
  modeReception: { type: String, enum: ['virement', 'cheque', 'especes', 'autre', null], default: null },
  modeRestitution: { type: String, enum: ['virement', 'cheque', null], default: null },
  ribBeneficiaireMasque: { type: String, default: null }, // 4 derniers caracteres seulement (FRxx **** **** **** 1234)

  // --- Provenance (entrees) ---
  payeurNom: { type: String, default: '' },
  payeurType: { type: String, default: '' }, // 'partie_pour' | 'partie_contre' | 'assurance' | 'tiers' | 'client' | ''

  // --- LCB-FT ---
  flagsLcbft: { type: [FlagLcbftSchema], default: [] },

  // --- Compte special (impossibilite de remise) ---
  compteSpecialMotif: { type: String, default: '' },
  compteSpecialDepuis: { type: Date, default: null },

  // --- Notes et references libres ---
  notes: { type: String, default: '' },
  reference: { type: String, default: '' },               // reference libre cabinet (ex : "DOSS-001-OP-002")
  referenceECarpa: { type: String, default: '' },          // reference cote e-Carpa (saisie manuelle pour reconciliation)

  // --- Reconciliation e-Carpa ---
  reconciliation: { type: ReconciliationSchema, default: () => ({}) },

  // --- Metadonnees ---
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  collection: 'carpaOperations',
});

// Maintien automatique de updatedAt
CarpaOperationSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Index utiles pour les requetes du dashboard
CarpaOperationSchema.index({ ownerUserId: 1, etat: 1 });
CarpaOperationSchema.index({ ownerUserId: 1, beneficiaireContactId: 1 });
CarpaOperationSchema.index({ ownerUserId: 1, dossierId: 1, sens: 1 });
CarpaOperationSchema.index({ ownerUserId: 1, estHonoraires: 1 });

module.exports = mongoose.model('CarpaOperation', CarpaOperationSchema);
module.exports.ETATS_OPERATION = ETATS_OPERATION;
