// server/services/storage/maintenance.js
//
// A17-A19 — INTÉGRITÉ DU STOCKAGE.
//   - releaseDossierDocuments : quand un dossier est supprimé, ses documents
//     stockés (autre collection) deviennent des ORPHELINS qui continuaient de
//     compter dans le quota. On les met en corbeille ET on rend leur quota.
//   - purgeSoftDeleted : supprime PHYSIQUEMENT les fichiers des documents en
//     corbeille depuis un certain temps (libère le stockage réel). Le quota a
//     déjà été rendu au moment de la mise en corbeille → la purge n'y touche pas.

const StoredDocument = require('../../models/Storage/StoredDocument');
const { getStorageProvider } = require('./index');
const { releaseQuota } = require('./quota');

const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

/** Total des octets occupés par un document (toutes ses versions). */
function documentBytes(doc) {
  return (doc.versions || []).reduce((sum, v) => sum + (Number(v.size) || 0), 0);
}

/**
 * Met en corbeille tous les documents d'un dossier et rend leur quota.
 * À appeler dans la cascade de suppression d'un dossier (évite les orphelins).
 *
 * Le `tenantId` du quota est dérivé DES DOCUMENTS eux-mêmes (posé à l'upload via
 * requireTenant), car la route de suppression de dossier ne résout pas le tenant
 * de la même façon. On regroupe la libération par tenant (robuste même si mixte).
 * @returns {Promise<{count:number, releasedBytes:number}>}
 */
async function releaseDossierDocuments({ dossierId, tenantId } = {}) {
  if (!dossierId) return { count: 0, releasedBytes: 0 };
  const filter = { dossierId, deletedAt: null };
  if (tenantId) filter.tenantId = tenantId;

  const docs = await StoredDocument.find(filter);
  if (docs.length === 0) return { count: 0, releasedBytes: 0 };
  return releaseDocs(docs);
}

/**
 * Met en corbeille les documents stockés liés à UNE fiche de dossier
 * (StoredDocument.documentId = _id de la fiche dans dossier.dossier.documents)
 * et rend leur quota. À appeler quand la fiche est retirée du dossier
 * (fusion deleteDocument) — sans quoi le fichier devient orphelin et
 * continue de compter dans la jauge d'espace.
 * @returns {Promise<{count:number, releasedBytes:number}>}
 */
async function releaseDocument({ documentId, dossierId, tenantId } = {}) {
  if (!documentId) return { count: 0, releasedBytes: 0 };
  const filter = { documentId, deletedAt: null };
  if (dossierId) filter.dossierId = dossierId;
  if (tenantId) filter.tenantId = tenantId;

  const docs = await StoredDocument.find(filter);
  if (docs.length === 0) return { count: 0, releasedBytes: 0 };
  return releaseDocs(docs);
}

/**
 * Cœur commun : met en corbeille chaque document et rend le quota,
 * groupé par tenant (robuste même si la liste est hétérogène).
 */
async function releaseDocs(docs) {
  const bytesByTenant = new Map();
  const now = new Date();
  let releasedBytes = 0;
  for (const doc of docs) {
    const bytes = documentBytes(doc);
    releasedBytes += bytes;
    const tKey = doc.tenantId ? String(doc.tenantId) : null;
    if (tKey && bytes > 0) bytesByTenant.set(tKey, (bytesByTenant.get(tKey) || 0) + bytes);
    doc.deletedAt = now;
    await doc.save();
  }
  for (const [tKey, bytes] of bytesByTenant.entries()) {
    try {
      await releaseQuota(tKey, bytes);
    } catch (err) {
      console.warn('[storage/maintenance] libération de quota échouée:', err.message);
    }
  }
  return { count: docs.length, releasedBytes };
}

/**
 * Purge PHYSIQUE des documents en corbeille depuis plus de `olderThanMs`.
 * Supprime chaque fichier via le provider puis le document en base.
 * Best-effort : un échec de suppression de fichier n'interrompt pas la purge.
 * @returns {Promise<{purgedDocs:number, deletedBlobs:number, blobErrors:number}>}
 */
async function purgeSoftDeleted({ tenantId, olderThanMs = DEFAULT_RETENTION_MS, now = Date.now() } = {}) {
  const cutoff = new Date(now - olderThanMs);
  const query = { deletedAt: { $ne: null, $lte: cutoff } };
  if (tenantId) query.tenantId = tenantId;

  const docs = await StoredDocument.find(query);
  if (docs.length === 0) return { candidates: 0, purgedDocs: 0, deletedBlobs: 0, blobErrors: 0 };

  let purgedDocs = 0;   // documents réellement retirés de la base
  let deletedBlobs = 0;
  let blobErrors = 0;
  for (const doc of docs) {
    let provider;
    try {
      provider = await getStorageProvider(doc.tenantId);
    } catch (err) {
      console.warn('[storage/maintenance] purge — provider introuvable:', err.message);
      blobErrors += (doc.versions || []).length;
      continue; // on ne supprime PAS le document en base si on n'a pas pu tenter ses blobs
    }
    let allBlobsOk = true;
    for (const version of (doc.versions || [])) {
      try {
        await provider.deleteVersion({ storageKey: version.storageKey });
        deletedBlobs += 1;
      } catch (err) {
        allBlobsOk = false;
        blobErrors += 1;
        console.warn(`[storage/maintenance] purge — suppression blob échouée (${version.storageKey}):`, err.message);
      }
    }
    // On ne retire l'enregistrement que si TOUS ses fichiers ont été supprimés,
    // pour ne pas perdre la trace de blobs encore présents (re-tentés au prochain passage).
    if (allBlobsOk) {
      await StoredDocument.deleteOne({ _id: doc._id });
      purgedDocs += 1;
    }
  }
  return { candidates: docs.length, purgedDocs, deletedBlobs, blobErrors };
}

module.exports = {
  DEFAULT_RETENTION_MS,
  documentBytes,
  releaseDossierDocuments,
  releaseDocument,
  purgeSoftDeleted,
};
