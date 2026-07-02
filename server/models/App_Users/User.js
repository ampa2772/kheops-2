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
  // Refresh token Microsoft (pour les users connectés via /api/auth/microsoft)
  microsoftRefreshToken: {
    type: String,
    default: null,
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