// Kheops_2/server/services/snapshotService.js
// Service « no-op » – point d’ancrage pour l’archivage futur des dossiers.

exports.beforeUpdate = async function beforeUpdate(originalDossier) {
  /*  ▸ Lors du sprint “Versioning”, sérialiser `originalDossier`
      ▸ puis stocker la copie dans la collection ArchivedDossier. */
  return null; // pour l’instant, on ne fait rien
};

