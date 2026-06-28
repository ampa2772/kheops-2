// Kheops_2/server/services/carpaAuditService.js
//
// Helpers pour ecrire dans le journal d'audit. Append-only : on n'expose
// jamais de fonction de modification ou de suppression.
const CarpaAuditLog = require('../models/Carpa/CarpaAuditLog');

const writeAudit = async ({
  operationId,
  dossierId,
  ownerUserId,
  officeUserId,
  action,
  ancienEtat = null,
  nouvelEtat = null,
  champsModifies = null,
  resume = '',
}) => {
  try {
    await CarpaAuditLog.create({
      operationId,
      dossierId,
      ownerUserId,
      officeUserId,
      action,
      ancienEtat,
      nouvelEtat,
      champsModifies,
      resume,
      timestamp: new Date(),
    });
  } catch (err) {
    // L'audit ne doit jamais bloquer une operation metier valide.
    // On log l'erreur sans la propager.
    console.error('[carpaAudit] Echec ecriture du log d\'audit :', err && err.message);
  }
};

const listAuditForOperation = async (operationId) => {
  return CarpaAuditLog.find({ operationId }).sort({ timestamp: -1 }).lean();
};

module.exports = {
  writeAudit,
  listAuditForOperation,
};
