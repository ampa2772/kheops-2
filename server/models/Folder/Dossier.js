// Kheops_2/server/models/Folder/Dossier.js
const mongoose = require('mongoose');
const crypto = require('crypto');

// ========================================================================
// === SECTION INCHANGÉE : Schémas pour la facturation ====================
// ========================================================================
const BilledItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, enum: ['event', 'document'], required: true },
  description: { type: String, required: true },
  total_ht: { type: Number, required: true },
  date_prestation: {type: Date, required: true} 
}, { _id: false });

const FactureSchema = new mongoose.Schema({
  _id: { type: String, required: true, default: () => crypto.randomUUID() }, 
  nomDocument: { type: String, required: true },
  dateCreation: { type: Date, default: Date.now },
  totalTTC: { type: Number, required: true },
  
  payments: [{
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
  }],
  status: {
    type: String,
    enum: ['pending', 'paid', 'archived'],
    default: 'pending'
  },
  archivedDate: {
    type: Date,
  },
  billedItems: [BilledItemSchema]
});

// ========================================================================
// === SECTION INCHANGÉE : Schéma pour les sous-dossiers ==================
// ========================================================================
const SubfolderSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    default: () => new mongoose.Types.ObjectId(),
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  color: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// ========================================================================
// === NOUVELLE SECTION : Définition de schémas pour structurer le "vrac" ==
// ========================================================================

// Schéma pour les destinataires d'un document
const DestinataireSchema = new mongoose.Schema({
  id: String,
  type: String,
  nom: String,
  prenoms: String,
  email: String,
  adresse: String,
  ville: String,
  codePostal: String,
  telephone: String,
  pro_contact: Boolean,
}, { _id: false });

// Schéma pour un document stocké
const DocumentSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true, default: () => new mongoose.Types.ObjectId() },
  nomDocument: String,
  dateCreation: Date,
  recipient: String,
  destinataires: [DestinataireSchema],
  recipientEmail: String,
  categorie: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  color: { type: String, default: null },
  // --- LE CHAMP CLÉ POUR LE LIEN AVEC LES SOUS-DOSSIERS ---
  subfolderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dossier.subfolders', // Fait référence à un _id dans le tableau subfolders
    default: null, // Un document sans subfolderId est à la racine
  },
  // === NOUVEAU CHAMP POUR LE NOM DU SOUS-DOSSIER (pour emails) ===
  subfolderName: {
    type: String,
    default: null,
  }
});

// Schéma pour les détails internes du dossier (anciennement "dossier.dossier")
const DossierDetailsSchema = new mongoose.Schema({
  nom: String,
  type_dossier: String,
  description_dossier: String,
  date_Creation_Dossier: Date,
  responsables: [mongoose.Schema.Types.Mixed], // Gardé en Mixed pour la flexibilité
  selectedTribunalAffaire: mongoose.Schema.Types.Mixed,
  // ★ S27 P2 (2.0.12-rc1) : champ "Informations complémentaires" persistant
  //   (modale InfoDossierTextModal onglet info). Auparavant le contenu était
  //   stocké uniquement dans un useState local, donc perdu à la fermeture de
  //   la modale ou au redémarrage de l'app.
  //   Contenu HTML enrichi (RichTextField). Pas de limite Mongo intrinsèque,
  //   limite douce gérée côté UI (RichTextField).
  informationsComplementaires: { type: String, default: '' },
}, { _id: false });

// Schéma pour le contenu principal du dossier (anciennement "dossier")
const DossierContentSchema = new mongoose.Schema({
  dossier: DossierDetailsSchema,
  parties: {
    pour: [mongoose.Schema.Types.Mixed], // Gardé en Mixed
    contre: [mongoose.Schema.Types.Mixed] // Gardé en Mixed
  },
  liensCommunes: mongoose.Schema.Types.Mixed,
  contactsDuDossier: [mongoose.Schema.Types.Mixed],
  avocatsResponsables: [mongoose.Schema.Types.Mixed],
  documents: [DocumentSchema] // <- UTILISATION DU SCHÉMA DE DOCUMENT STRUCTURÉ
}, { _id: false });

// ========================================================================
// === Aide juridictionnelle (cerfa 15626*02) =============================
// Snapshot persisté et éditable des données du formulaire d'aide
// juridictionnelle. Pré-rempli depuis le dossier à l'ouverture de la
// modale, modifiable, sauvegardé ; la génération du PDF (overlay) lit
// ce sous-document. Sous-schémas explicites (style du reste du fichier)
// pour éviter le piège Mongoose de la clé réservée `type`.
// ========================================================================
const AJNationaliteSchema = new mongoose.Schema({
  type: String,        // 'francaise' | 'ue' | 'autre'
  preciser: String,
}, { _id: false });

const AJSituationProSchema = new mongoose.Schema({
  type: String,        // 'cdi' | 'cdd' | 'artisan' | 'chomage' | 'apprentissage' | 'etudes' | 'retraite' | 'autre'
  preciser: String,
}, { _id: false });

const AJIdentiteBaseSchema = new mongoose.Schema({
  civilite: String,    // 'madame' | 'monsieur'
  nomNaissance: String,
  nomUsage: String,
  prenoms: String,
  dateNaissance: String,
  lieuNaissance: String,
}, { _id: false });

const AJDemandeurSchema = new mongoose.Schema({
  civilite: String,
  nomNaissance: String,
  nomUsage: String,
  prenoms: String,
  dateNaissance: String,
  lieuNaissance: String,
  nationalite: AJNationaliteSchema,
  situationFamiliale: String,
  adresse: String,
  codePostal: String,
  commune: String,
  pays: String,
  telephone: String,
  courriel: String,
  situationPro: AJSituationProSchema,
  numCAF: String,
  numFiscal: String,
  refAvisImposition: String,
}, { _id: false });

const AJRepresentantSchema = new mongoose.Schema({
  present: Boolean,
  nomPrenom: String,
  statut: String,      // 'parent' | 'tuteur' | 'curateur' | 'autre'
  adresse: String,
  codePostal: String,
  commune: String,
  pays: String,
  telephone: String,
  courriel: String,
}, { _id: false });

const AJAssuranceSchema = new mongoose.Schema({
  couvert: String,         // 'oui' | 'non'
  priseEnCharge: String,   // 'totale' | 'partielle' | 'aucune'
}, { _id: false });

const AJPersonneChargeSchema = new mongoose.Schema({
  nomPrenom: String,
  lien: String,
  dateNaissance: String,
  aCharge: Boolean,
  vitAvec: Boolean,
}, { _id: false });

const AJAffaireOpposeSchema = new mongoose.Schema({
  oppose: String,      // 'oui' | 'non'
  preciser: String,
}, { _id: false });

const AJDemandeSchema = new mongoose.Schema({
  procedure: String,   // 'souhaite' | 'juge_saisi' | 'deja_jugee'
  exposeAffaire: String,
  dejaBeneficieAJ: Boolean,
  role: String,        // 'demandeur' | 'defendeur'
  juridictionSaisie: String,
  dateConvocation: String,
  recours: Boolean,
  executer: Boolean,
}, { _id: false });

const AJAdversaireSchema = new mongoose.Schema({
  nomRaison: String,
  adresse: String,
}, { _id: false });

const AJAuxiliaireSchema = new mongoose.Schema({
  mode: String,        // 'designation' | 'deja_choisi'
  type: String,        // 'avocat' | 'huissier' | 'notaire' | 'autre'
  autrePreciser: String,
  adresse: String,
  codePostal: String,
  commune: String,
  pays: String,
  telephone: String,
  courriel: String,
}, { _id: false });

const AJDispensesSchema = new mongoose.Schema({
  rsa: Boolean,
  aspa: Boolean,
  cnda: Boolean,
  victime: Boolean,
}, { _id: false });

const AJRessourceSchema = new mongoose.Schema({
  type: String,        // 'salaires' | 'revenus_agricoles' | 'allocations_chomage' | 'indemnites' | 'pensions_retraites' | 'pensions_alimentaires' | 'ressources_etranger' | 'autre_revenu'
  demandeur: Number,
  conjoint: Number,
  personnes: Number,
}, { _id: false });

const AJPatrimoineSchema = new mongoose.Schema({
  epargneTotal: Number,
  proprietaire: Boolean,
  proprietaireDe: [String],   // sous-ensemble de ['logement','autre']
  description: String,
}, { _id: false });

const AJPrestationSchema = new mongoose.Schema({
  type: String,
  montant: Number,
  destinataireRelation: String,
}, { _id: false });

const AJAttestationSchema = new mongoose.Schema({
  consentElectronique: Boolean,
  faitLieu: String,
  faitDate: String,
}, { _id: false });

const AideJuridictionnelleSchema = new mongoose.Schema({
  updatedAt: { type: Date, default: Date.now },
  demandeur: AJDemandeurSchema,
  assurancePJ: AJAssuranceSchema,
  representant: AJRepresentantSchema,
  conjoint: AJIdentiteBaseSchema,
  personnesACharge: [AJPersonneChargeSchema],
  affaireOppose: AJAffaireOpposeSchema,
  demande: AJDemandeSchema,
  adversaires: [AJAdversaireSchema],
  auxiliaire: AJAuxiliaireSchema,
  dispenses: AJDispensesSchema,
  ressources: [AJRessourceSchema],
  patrimoine: AJPatrimoineSchema,
  prestationsVersees: [AJPrestationSchema],
  attestation: AJAttestationSchema,
}, { _id: false });

// ========================================================================
// === SECTION MODIFIÉE : Schéma principal du Dossier =====================
// ========================================================================
const DossierSchema = mongoose.Schema({
  reference: { type: String, required: true },
  
  // --- MODIFICATION MAJEURE ICI ---
  // On remplace l'ancien `dossier: { type: Object }` par notre nouveau schéma structuré.
  dossier: DossierContentSchema,
  // ------------------------------
  
  dateCreation: { type: Date, default: Date.now },
  _lastUpdated: { type: Date, default: Date.now },
  factures: [FactureSchema],
  subfolders: [SubfolderSchema],
  aideJuridictionnelle: AideJuridictionnelleSchema
});

// ========================================================================
// === SECTION INCHANGÉE : Middleware et Export ===========================
// ========================================================================
DossierSchema.pre('save', function(next) {
  if (this.isModified()) {
    this._lastUpdated = new Date();
  }
  next();
});

module.exports = mongoose.model('Dossier', DossierSchema);