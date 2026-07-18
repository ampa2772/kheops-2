const mongoose = require('mongoose');

// Etat serveur minimal d'une chaine de jetons du compagnon Word. Les `jti`
// ne sont jamais conserves en clair : seule leur empreinte SHA-256 est stockee.
const CompanionSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  purpose: {
    type: String,
    enum: ['word', 'mirror', 'legacy'],
    required: true,
  },
  docId: {
    type: String,
    default: null,
  },
  currentJtiHash: {
    type: String,
    required: true,
  },
  previousJtiHash: {
    type: String,
    default: null,
  },
  previousValidUntil: {
    type: Date,
    default: null,
  },
  // L'index TTL supprime automatiquement la session apres sa limite absolue.
  // Les controles applicatifs comparent aussi explicitement cette date : ils
  // ne dependent donc jamais du delai asynchrone du balayage TTL de MongoDB.
  absoluteExpiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 },
  },
  revokedAt: {
    type: Date,
    default: null,
    index: true,
  },
}, {
  timestamps: true,
  collection: 'companionSessions',
});

CompanionSessionSchema.index({ userId: 1, revokedAt: 1 });

module.exports = mongoose.models.CompanionSession
  || mongoose.model('CompanionSession', CompanionSessionSchema);
