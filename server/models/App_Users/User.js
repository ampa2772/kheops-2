const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: true,
  },
  address: {
    type: String,
    required: true,
  },
  city: {
    type: String,
    required: true,
  },
  postalCode: {
    type: String,
    required: true,
  },
  genre: {
    type: String,
    required: true,
  },
  // NOUVEAU CHAMP POUR STOCKER LE REFRESH TOKEN
  googleRefreshToken: {
    type: String,
    default: null,
  },
  // Autorisation Google Drive indépendante de la connexion Kheops/Gmail.
  // Le scope drive.file n'est demandé que lorsque l'utilisateur connecte
  // explicitement Google Drive depuis « Comptes et services connectés ».
  googleDriveRefreshToken: {
    type: String,
    default: null,
  },
  googleDriveAccount: {
    email: { type: String, default: '' },
    displayName: { type: String, default: '' },
    accountType: { type: String, enum: ['', 'personal', 'organization'], default: '' },
    connectedAt: { type: Date, default: null },
    disconnectedAt: { type: Date, default: null },
  },
  // Refresh token Microsoft (pour les users connectés via /api/auth/microsoft)
  microsoftRefreshToken: {
    type: String,
    default: null,
  },
  // Autorisation OneDrive dédiée. Elle reste distincte du jeton utilisé par
  // Outlook/connexion Microsoft afin qu'une révocation OneDrive ne coupe pas
  // la messagerie et ne change jamais le compte Kheops courant.
  microsoftOneDriveRefreshToken: {
    type: String,
    default: null,
  },
  microsoftOneDriveAccount: {
    email: { type: String, default: '' },
    displayName: { type: String, default: '' },
    accountType: { type: String, enum: ['', 'personal', 'organization'], default: '' },
    connectedAt: { type: Date, default: null },
    disconnectedAt: { type: Date, default: null },
  },
  // Consentement SharePoint séparé de la connexion Microsoft et de OneDrive.
  // Sites.ReadWrite.All n'est demandé que depuis la rubrique SharePoint.
  microsoftSharePointRefreshToken: {
    type: String,
    default: null,
  },
  // Choix personnel du mode d'ouverture des documents. Cette preference reste
  // volontairement distincte du fournisseur de stockage du cabinet et du
  // fournisseur utilise pour se connecter a Kheops 2.
  documentOpening: {
    mode: {
      type: String,
      enum: ['automatic', 'ask', 'kheops', 'word_desktop', 'word_web', 'google_docs'],
      default: 'ask',
    },
    // `false` permet au client de distinguer un choix ponctuel d'une preference
    // durable. Une reinitialisation supprime tout le sous-document.
    rememberChoice: { type: Boolean, default: false },
    lastUsedMode: {
      type: String,
      enum: ['kheops', 'word_desktop', 'word_web', 'google_docs', null],
      default: null,
    },
    // Consentements explicites avant la premiere copie vers un cloud externe.
    // Aucun jeton ni identifiant de fichier n'est conserve dans ces champs.
    externalTransferConsents: {
      googleDrive: { type: Boolean, default: false },
      oneDrive: { type: Boolean, default: false },
    },
    updatedAt: { type: Date, default: null },
  },
  // --- SharePoint PAR UTILISATEUR (Volet B) — optionnel, JAMAIS partagé ---
  // Chaque utilisateur peut connecter SON PROPRE site SharePoint via son propre
  // jeton Microsoft (scope Sites.ReadWrite.All). Il n'existe AUCUN compte
  // SharePoint « cabinet » central. Si enabled === true ET driveId est défini,
  // les documents que CET utilisateur dépose sont rangés dans SON SharePoint ;
  // sinon on retombe sur le provider du cabinet (OneDrive/managed_gcs/…).
  // Le driveId est aussi encodé dans le storageKey (sharepoint:<user>:<drive>:<item>)
  // pour que download/delete restent auto-suffisants si l'utilisateur change de site.
  sharePoint: {
    enabled: { type: Boolean, default: false },     // l'utilisateur a opté pour SharePoint
    driveId: { type: String, default: null },       // documentLibrary (drive) choisi
    siteId: { type: String, default: null },        // site SharePoint choisi
    siteName: { type: String, default: '' },        // libellé lisible (affichage UI)
    webUrl: { type: String, default: '' },          // lien vers le site (affichage UI)
    // "Ne plus me proposer au login" : la modale d'invitation ne réapparaît pas
    // tant que ce marqueur est vrai (ou que l'utilisateur a déjà activé SharePoint).
    promptDismissed: { type: Boolean, default: false },
    connectedAt: { type: Date, default: null },
    accountEmail: { type: String, default: '' },
    accountDisplayName: { type: String, default: '' },
    accountType: { type: String, enum: ['', 'personal', 'organization'], default: '' },
  },
  // NOUVEAU CHAMP POUR LE MODE MALVOYANT
  highContrastMode: {
    type: Boolean,
    default: false,
  },
  // NOUVEAU: Champ pour activer/désactiver la lecture vocale
  isSpeechEnabled: {
    type: Boolean,
    default: false,
  },
  // NOUVEAU: Champs pour la facturation
  hourlyRate: {
    type: Number,
    default: 0,
  },
  vatRate: {
    type: Number,
    default: 20,
  },
  // NOUVEAU: Champs profil avocat
  phone: {
    type: String,
    default: "",
  },
  barreau: {
    type: String,
    default: "",
  },
  signature: {
    type: String,
    default: "",
  },
  header: {
    type: String,
    default: "",
  },
  signatureImage: {
    type: String,
    default: "",
  },
  headerImage: {
    type: String,
    default: "",
  },
  headerFontFamily: {
    type: String,
    default: "Calibri",
  },
  headerFontSize: {
    type: Number,
    default: 10,
  },
  headerFontWeight: {
    type: String,
    default: "normal",
  },
  headerTextAlign: {
    type: String,
    default: "center",
  },
  signatureScale: {
    type: Number,
    default: 1.5,
  },
  // --- Réinitialisation de mot de passe par code 6 chiffres ---
  resetCodeHash: {
    type: String,
    default: null,
  },
  resetCodeExpiresAt: {
    type: Date,
    default: null,
  },
  resetCodeAttempts: {
    type: Number,
    default: 0,
  },
  lastResetCodeSentAt: {
    type: Date,
    default: null,
  },
  // Préférences de couleurs des dossiers par type/juridiction.
  // Clé = code de juridiction (tgi, tco, cph, ta, cass, ccd, te, tprx, ca,
  // caa, cdad, tbrtj) ou code spécial ('divorce_cm', 'default').
  // Valeur = couleur hexa (#RRGGBB) choisie par l'utilisateur.
  // Si une clé est absente, l'app retombe sur la couleur par défaut codée
  // côté client.
  dossierColorPreferences: {
    type: Map,
    of: String,
    default: {},
  },
  // Préférences d'affichage des documents par type métier.
  // Chaque entrée contient { mode: type|dossier|none|custom, color?: #RRGGBB }.
  // Une couleur affectée directement à un document reste prioritaire.
  documentColorPreferences: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  // Liste des empreintes machines (hostname + MAC) sur lesquelles l'utilisateur
  // s'est déjà connecté. Sert à détecter une "nouvelle machine" pour déclencher
  // une synchro cloud → local explicite avec UX dédiée.
  knownMachines: [{
    machineId:  { type: String, required: true },
    label:      { type: String, default: '' }, // hostname lisible
    firstSeenAt:{ type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
  }],
  // Marqueur "tour d'onboarding terminé". Reste à false (ou absent) tant que
  // l'utilisateur n'a pas vu/sauté le mini-tour de découverte des 5 étapes
  // clés. Une fois passé à true, le tour ne se redéclenche plus à la
  // connexion. Voir client/src/components/common/OnboardingTour.
  onboardingDone: {
    type: Boolean,
    default: false,
  },
  // --- Multi-tenant / cabinet (AUTH-002) ---
  // Cabinet (Tenant) auquel appartient l'utilisateur. Nullable au début : les
  // comptes existants et ceux créés via OAuth sont rattachés à la volée par
  // tenantService.resolveTenantId (1 utilisateur = 1 cabinet par défaut).
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true,
  },
  // Rôle applicatif au sein du cabinet.
  role: {
    type: String,
    enum: ['avocat', 'collaborateur', 'secretaire', 'admin'],
    default: 'avocat',
  },
});

module.exports = mongoose.model('User', UserSchema);
