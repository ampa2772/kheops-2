const mongoose = require('mongoose');

// Repli chiffré pour les environnements sans coffre managé. Le document ne
// contient jamais la clé en clair et tous les champs sensibles sont select:false.
const AISecretRecordSchema = new mongoose.Schema({
  secretRef: { type: String, required: true, unique: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  ciphertext: { type: String, required: true, select: false },
  iv: { type: String, required: true, select: false },
  authTag: { type: String, required: true, select: false },
  keyVersion: { type: String, required: true, default: 'v1' },
  destroyedAt: { type: Date, default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.models.AISecretRecord
  || mongoose.model('AISecretRecord', AISecretRecordSchema);
