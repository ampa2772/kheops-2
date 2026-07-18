const mongoose = require('mongoose');

// Verrou WOPI persistant. Contrairement au verrou historique en mémoire, ce
// document reste cohérent lorsque Cloud Run répartit les requêtes sur plusieurs
// instances. `expiresAt` sert à la fois de garde fonctionnelle et d'index TTL.
const OfficeDocumentLockSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  dossierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', required: true },
  documentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sessionJti: { type: String, required: true, maxlength: 180 },
  lockId: { type: String, required: true, maxlength: 1024 },
  currentVersionId: { type: String, default: null },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

OfficeDocumentLockSchema.index({ tenantId: 1, documentId: 1 }, { unique: true });
OfficeDocumentLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OfficeDocumentLock', OfficeDocumentLockSchema);
