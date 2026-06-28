// Kheops_2/server/models/Divorce/DivorceCMData.js
//
// Fiche metier specialisee pour un divorce par consentement mutuel.
// Reliee 1-1 a un Dossier via dossierId. Le Dossier reste intact ; on
// cree simplement une fiche divorce a cote pour ne pas alourdir le
// schema Dossier de champs metiers tres specifiques.
//
// Conformement aux articles 229-1 a 229-4 du Code civil et au RIN, la
// voie principale est extrajudiciaire (sous signature privee contresignee
// par avocat). La voie judiciaire reste applicable lorsqu'un enfant
// mineur capable de discernement demande son audition.
const mongoose = require('mongoose');

// ----- Avocat (de l'un des epoux) -----------------------------------------
const AvocatSchema = new mongoose.Schema({
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null }, // si selectionne depuis la base
  nom: { type: String, default: '' },
  prenoms: { type: String, default: '' },
  barreau: { type: String, default: '' },           // ex : "Paris", "Versailles"
  cabinet: { type: String, default: '' },
  adresse: { type: String, default: '' },
  codePostal: { type: String, default: '' },
  ville: { type: String, default: '' },
  email: { type: String, default: '' },
  telephone: { type: String, default: '' },
  rpva: { type: String, default: '' },              // identifiant RPVA / e-Barreau si pertinent
  toque: { type: String, default: '' },             // numero de toque
  estTitulaire: { type: Boolean, default: false },  // true si c'est l'avocat du cabinet (Kheops 2)
}, { _id: false });

// ----- Epoux ---------------------------------------------------------------
const EpouxSchema = new mongoose.Schema({
  // Lien optionnel vers un Contact existant (si saisi auparavant)
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },

  // Etat civil complet
  civilite: { type: String, enum: ['M.', 'Mme', 'Mlle', ''], default: '' },
  nom: { type: String, default: '' },
  nomDeNaissance: { type: String, default: '' },
  prenoms: { type: String, default: '' },
  dateNaissance: { type: Date, default: null },
  lieuNaissance: { type: String, default: '' },
  paysNaissance: { type: String, default: 'France' },
  nationalite: { type: String, default: 'francaise' },
  profession: { type: String, default: '' },

  // Domicile
  adresse: { type: String, default: '' },
  codePostal: { type: String, default: '' },
  ville: { type: String, default: '' },
  pays: { type: String, default: 'France' },

  // Contact
  email: { type: String, default: '' },
  telephone: { type: String, default: '' },

  // Cabinet
  estClientCabinet: { type: Boolean, default: false }, // true pour l'epoux represente par le cabinet
  avocat: { type: AvocatSchema, default: () => ({}) },
}, { _id: false });

// ----- Mariage / regime matrimonial ---------------------------------------
const MariageSchema = new mongoose.Schema({
  dateMariage: { type: Date, default: null },
  lieuMariage: { type: String, default: '' },
  paysMariage: { type: String, default: 'France' },
  numeroActeMariage: { type: String, default: '' },

  regime: {
    type: String,
    enum: [
      '',                              // non saisi
      'communaute_legale',             // legale reduite aux acquets (defaut depuis 1966)
      'separation_biens',
      'communaute_universelle',
      'participation_acquets',
      'autre',
    ],
    default: '',
  },

  contratMariage: {
    existence: { type: Boolean, default: false },
    dateContrat: { type: Date, default: null },
    notaireRedacteur: { type: String, default: '' },
    villeNotaire: { type: String, default: '' },
  },

  // Patrimoine sommaire (texte libre — l'etat liquidatif detaille est un acte
  // separe etabli par notaire en cas de bien immobilier)
  patrimoineResume: { type: String, default: '' },
}, { _id: false });

// ----- Enfants -------------------------------------------------------------
const EnfantResidenceSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['', 'alternee', 'principale_pere', 'principale_mere', 'autre'],
    default: '',
  },
  detailAlternance: { type: String, default: '' },         // ex : "1 semaine sur 2 du vendredi 18h au vendredi 18h"
  droitVisiteHebergement: { type: String, default: '' },   // pour le parent non hebergeant
  vacancesScolaires: { type: String, default: '' },        // ex : "moitie des vacances, alternance annees paires/impaires"
}, { _id: false });

const EnfantSchema = new mongoose.Schema({
  // _id local pour referencer dans pensionsAlimentaires
  // Lien vers la PersonneCharge d'origine (si l'enfant vient d'une PCH d'un
  // contact). Permet la synchronisation bidirectionnelle.
  pchId: { type: mongoose.Schema.Types.ObjectId, ref: 'PersonneCharge', default: null },
  nom: { type: String, default: '' },
  prenoms: { type: String, default: '' },
  sexe: { type: String, enum: ['M', 'F', ''], default: '' },
  dateNaissance: { type: Date, default: null },
  lieuNaissance: { type: String, default: '' },

  scolarite: {
    etablissement: { type: String, default: '' },
    classe: { type: String, default: '' },
    ville: { type: String, default: '' },
  },

  residence: { type: EnfantResidenceSchema, default: () => ({}) },

  autoriteParentale: {
    type: String,
    enum: ['conjointe', 'unique_pere', 'unique_mere'],
    default: 'conjointe',
  },

  // Audition du mineur (Code civil art. 388-1) — declenche la voie judiciaire
  souhaiteEtreEntendu: { type: Boolean, default: false },
}, { _id: true }); // _id auto-genere pour referencer depuis pensionsAlimentaires

// ----- Adulte a charge (art. 270 et s. C. civ. obligation alimentaire entre
// epoux et descendants ; pertinent pour majeurs handicapes, parents ages a
// charge, etudiants majeurs sans autonomie financiere) ----------------------
const AdulteChargeSchema = new mongoose.Schema({
  pchId: { type: mongoose.Schema.Types.ObjectId, ref: 'PersonneCharge', default: null },
  nom: { type: String, default: '' },
  prenoms: { type: String, default: '' },
  sexe: { type: String, enum: ['M', 'F', ''], default: '' },
  dateNaissance: { type: Date, default: null },
  lieuNaissance: { type: String, default: '' },
  // Lien de parente / nature de la charge (parent, frere/soeur, enfant majeur)
  lien: { type: String, default: '' },
  // Motif (handicap, dependance, etudes, etc.)
  motif: { type: String, default: '' },
  // Adresse (peut differer de celle des epoux)
  adresse: { type: String, default: '' },
  codePostal: { type: String, default: '' },
  ville: { type: String, default: '' },
  // A la charge de quel epoux principalement (peut etre 'commun')
  aLaChargeDe: { type: String, enum: ['', 'epoux1', 'epoux2', 'commun'], default: 'commun' },
}, { _id: true });

// ----- Prestation compensatoire (art. 270 et s. C. civ.) ------------------
const PrestationCompensatoireSchema = new mongoose.Schema({
  applicable: { type: Boolean, default: false },
  beneficiaire: { type: String, enum: ['epoux1', 'epoux2', ''], default: '' },
  forme: {
    type: String,
    enum: ['', 'capital', 'rente_temporaire', 'rente_viagere', 'mixte'],
    default: '',
  },
  // Capital
  montantCapital: { type: Number, default: null },
  modalitesCapital: {
    type: String,
    enum: ['', 'paiement_unique', 'echelonne', 'attribution_bien'],
    default: '',
  },
  detailEchelonnement: { type: String, default: '' },     // texte libre (ex : "12 mensualites de 1500 EUR")
  attributionBienDetail: { type: String, default: '' },   // si attribution d'un bien
  // Rente
  montantRente: { type: Number, default: null },
  dureeRenteMois: { type: Number, default: null },        // null si rente viagere
  // Justification (criteres art. 271 C. civ.)
  motifs: { type: String, default: '' },
  // Indexation rente
  indexationRente: { type: String, default: '' },
}, { _id: false });

// ----- Pension alimentaire / contribution a l'entretien et l'education ----
const PensionAlimentaireSchema = new mongoose.Schema({
  enfantIdLocal: { type: mongoose.Schema.Types.ObjectId, default: null },  // pointe vers EnfantSchema._id
  debiteur: { type: String, enum: ['epoux1', 'epoux2', ''], default: '' },
  montantMensuel: { type: Number, default: null },
  modalitesPaiement: { type: String, default: '' },           // "le 5 de chaque mois par virement"
  indexation: {
    indice: { type: String, default: 'INSEE_prix_consommation' },
    dateRevision: { type: String, default: '' },              // "1er janvier" / "anniversaire de la convention"
  },
  fraisExceptionnels: {
    repartition: { type: String, enum: ['', '50_50', 'proportionnel_revenus', 'integral_debiteur', 'autre'], default: '50_50' },
    detail: { type: String, default: '' },                    // texte libre (definition des frais)
  },
  duree: {
    type: String,
    enum: ['', 'jusqu_majorite', 'jusqu_autonomie', 'autre'],
    default: 'jusqu_autonomie',
  },
  dureeAutreDetail: { type: String, default: '' },
}, { _id: true });

// ----- Logement familial --------------------------------------------------
const LogementFamilialSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['', 'attribution_epoux1', 'attribution_epoux2', 'vente', 'indivision', 'autre'],
    default: '',
  },
  detail: { type: String, default: '' },           // texte libre
  soulteEventuelle: { type: Number, default: null },
  natureBien: { type: String, default: '' },       // "appartement", "maison", "loue / proprietaire"
  adresseBien: { type: String, default: '' },
}, { _id: false });

// ----- Nom d'usage (art. 264 C. civ.) -------------------------------------
const NomUsageSchema = new mongoose.Schema({
  epoux1Garde: { type: Boolean, default: false },
  epoux2Garde: { type: Boolean, default: false },
  motif: { type: String, default: '' },            // interet particulier (notamment professionnel) ou interet des enfants
}, { _id: false });

// ----- Notaire depositaire ------------------------------------------------
const NotaireSchema = new mongoose.Schema({
  contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null }, // si selectionne depuis la base
  nom: { type: String, default: '' },
  prenoms: { type: String, default: '' },
  cabinet: { type: String, default: '' },
  adresse: { type: String, default: '' },
  codePostal: { type: String, default: '' },
  ville: { type: String, default: '' },
  email: { type: String, default: '' },
  telephone: { type: String, default: '' },
  dateDepotPrevue: { type: Date, default: null },
  dateDepotEffective: { type: Date, default: null },
  recepisseRecu: { type: Boolean, default: false },
  numeroRecepisse: { type: String, default: '' },
  dateRecepisse: { type: Date, default: null },
}, { _id: false });

// ----- Etape de procedure -------------------------------------------------
const EtapeSchema = new mongoose.Schema({
  code: { type: String, required: true },          // identifiant stable (ex : 'envoi_projet_rar')
  label: { type: String, default: '' },
  ordre: { type: Number, default: 0 },
  obligatoire: { type: Boolean, default: true },
  realiseLe: { type: Date, default: null },
  realisePar: { type: mongoose.Schema.Types.ObjectId, ref: 'OfficeUser', default: null },
  notes: { type: String, default: '' },
}, { _id: true });

// ----- Schema principal ---------------------------------------------------
const DivorceCMDataSchema = new mongoose.Schema({
  dossierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true, unique: true, index: true },
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // Voie procedurale
  voie: { type: String, enum: ['extrajudiciaire', 'judiciaire'], default: 'extrajudiciaire' },

  // Les deux epoux partagent-ils le meme avocat (le cabinet) ?
  // True par defaut : on copie l'avocat de l'epoux 1 vers l'epoux 2.
  // L'avocat met a OFF s'il y a un avocat adverse different.
  partageAvocat: { type: Boolean, default: true },

  // Les deux epoux
  epoux1: { type: EpouxSchema, default: () => ({ estClientCabinet: true }) },
  epoux2: { type: EpouxSchema, default: () => ({ estClientCabinet: false }) },

  // Mariage
  mariage: { type: MariageSchema, default: () => ({}) },

  // Enfants
  enfants: { type: [EnfantSchema], default: [] },

  // Adultes a charge (majeurs handicapes, parents ages, etudiants sans
  // autonomie). Importes automatiquement depuis les PersonneCharge type
  // 'adulte' du contact lors de la selection au wizard.
  adultesCharge: { type: [AdulteChargeSchema], default: [] },

  // Aspects financiers
  prestationCompensatoire: { type: PrestationCompensatoireSchema, default: () => ({}) },
  pensionsAlimentaires: { type: [PensionAlimentaireSchema], default: [] },

  // Logement & nom d'usage
  logementFamilial: { type: LogementFamilialSchema, default: () => ({}) },
  nomUsage: { type: NomUsageSchema, default: () => ({}) },

  // Notaire
  notaire: { type: NotaireSchema, default: () => ({}) },

  // Procedure
  etapes: { type: [EtapeSchema], default: [] },

  // Dates clefs
  dates: {
    premierEntretien: { type: Date, default: null },
    envoiProjetRAR: { type: Date, default: null },
    finDelaiReflexion: { type: Date, default: null },     // calculee : envoiProjetRAR + 15j
    signatureConvention: { type: Date, default: null },
    depotNotaire: { type: Date, default: null },
    recepisseRecu: { type: Date, default: null },
  },

  notes: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  collection: 'divorceCMDatas',
});

DivorceCMDataSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  // Calcul automatique de finDelaiReflexion (15 jours apres envoi du projet par RAR)
  if (this.dates && this.dates.envoiProjetRAR) {
    const start = new Date(this.dates.envoiProjetRAR);
    const fin = new Date(start);
    fin.setDate(fin.getDate() + 15);
    this.dates.finDelaiReflexion = fin;
  }
  // Voie judiciaire si un enfant souhaite etre entendu
  const audition = (this.enfants || []).some(e => e && e.souhaiteEtreEntendu);
  if (audition) {
    this.voie = 'judiciaire';
  }
  next();
});

module.exports = mongoose.model('DivorceCMData', DivorceCMDataSchema);
