// Kheops_2/server/models/Cabinet/CabinetEncryption.js
//
// Configuration de chiffrement E2E d'un cabinet.
//
// Un document par cabinet (cle unique = ownerUserId du compte principal).
// Le serveur stocke uniquement :
//   - le sel public (genere et envoye par le client a la creation)
//   - le verifier HMAC-SHA256 (envoye par le client, one-way, ne permet pas
//     de reconstituer la MasterKey)
//   - la date d'activation et un compteur de tentatives de verification
//     (pour journalisation, non utilise pour blocage en V1)
//
// La MasterKey, la phrase secrete et les DEK ne sont JAMAIS stockees cote
// serveur. Voir DESIGN_CHIFFREMENT_E2E.md section 4.
//
// Pattern : un modele dedie (analogue a CabinetExpense) plutot qu'un champ
// imbrique dans OfficeUser, pour isoler clairement la donnee de
// configuration crypto et permettre des index/contraintes dediees.

const mongoose = require('mongoose');

const CabinetEncryptionSchema = new mongoose.Schema({
  // Identifiant du compte principal du cabinet (User._id, sous forme de string
  // — cf. pattern dans cabinet.js : `String(req.user)`).
  ownerUserId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },

  // Indique si la protection des documents est active pour ce cabinet.
  // false par defaut : un nouveau cabinet n'a pas la protection active
  // tant que l'utilisateur n'a pas valide l'enrolement (situation A du
  // design, modale "Configurer maintenant").
  enabled: {
    type: Boolean,
    default: false,
  },

  // Sel public de derivation, genere par le client au moment de la creation.
  // Hexadecimal de 32 caracteres (= 16 octets). Public, non sensible.
  salt: {
    type: String,
    default: null,
    validate: {
      validator: function (v) {
        return v === null || (typeof v === 'string' && /^[0-9a-f]{32}$/i.test(v));
      },
      message: 'Le sel doit etre une chaine hexadecimale de 32 caracteres (16 octets).',
    },
  },

  // VERIFIER = HMAC-SHA256(MasterKey, "kheops-verifier-v2"), envoye par le
  // client. Hexadecimal de 64 caracteres. One-way : ne permet pas de
  // reconstituer la MasterKey ni la phrase secrete.
  verifier: {
    type: String,
    default: null,
    validate: {
      validator: function (v) {
        return v === null || (typeof v === 'string' && /^[0-9a-f]{64}$/i.test(v));
      },
      message: 'Le verifier doit etre une chaine hexadecimale de 64 caracteres (32 octets).',
    },
  },

  // Date d'activation de la protection (premier setup reussi).
  enabledAt: {
    type: Date,
    default: null,
  },

  // Version du schema de chiffrement (= numero apres "enc:vN").
  // Initialement 2 pour le module @kheops/crypto.
  version: {
    type: Number,
    default: 2,
  },

  // Audit non-bloquant : derniere verification reussie + compteur de
  // tentatives. Sert a la journalisation, pas au blocage automatique
  // (decision Pierre §3 question 5 : pas de blocage en V1).
  lastVerifiedAt: {
    type: Date,
    default: null,
  },
  verifyAttempts: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
});

module.exports = mongoose.model('CabinetEncryption', CabinetEncryptionSchema);
