// server/services/storage/legacyDriveMigrator.js
// ------------------------------------------------------------------------
// MIGRATION DE L'HERITAGE GOOGLE DRIVE (Phase 1 du chantier « rangement
// coherent », decisions Adrien 2026-07-06).
//
// L'ANCIENNE app de bureau rangeait les fichiers dans le Drive de l'utilisateur
// sous :   Files_Clients/<idDossierMongo>/(<sousDossier>/)?<nomFichier>
// -> identifiants illisibles pour un humain, et fichiers INCONNUS du systeme
// documentaire moderne (pas de StoredDocument), donc impossibles a ouvrir en
// ligne.
//
// Cette migration, PAR UTILISATEUR (son propre Drive, son propre jeton) :
//   1. DEPLACE chaque fichier vers le rangement lisible du Volet A :
//          Kheops2/Dossiers/<Nom c- Nom — reference>/(<sousDossier>/)?<fichier>
//      Un deplacement Drive conserve le fileId -> AUCUNE copie d'octets, et les
//      storageKey `googledrive:` existants resteraient valides.
//   2. ENREGISTRE chaque fichier deplace dans le systeme documentaire
//      (StoredDocument, cle googledrive:<user>:<fileId>) quand il correspond
//      SANS AMBIGUITE a une fiche du dossier (meme nomDocument + meme
//      sous-dossier, une seule candidate, pas de bytes deja connus). Les
//      documents de l'ere bureau deviennent alors ouvrables en ligne.
//
// PRUDENCE (prod juridique) :
//   - OWNERSHIP : seuls les dossiers LIES a l'utilisateur (UserDossier) sont
//     traites ; un id inconnu dans Files_Clients est ignore et signale.
//   - Jamais d'ecrasement : en cas d'ambiguite (plusieurs fiches de meme nom),
//     le fichier est DEPLACE (objectif lisibilite) mais PAS enregistre — il
//     apparait dans le rapport `unmatched` pour revue manuelle.
//   - Best-effort : une erreur sur un fichier n'arrete ni le dossier ni la
//     migration ; tout est compte dans le rapport.
//   - Visibilite : avec un jeton limite a drive.file, Files_Clients (cree par
//     l'ancienne app) est invisible -> la recherche renvoie null et la
//     migration est un no-op propre (aucune erreur utilisateur).
//   - Verrou en memoire par utilisateur + borne de fichiers par passe.
// ------------------------------------------------------------------------

const crypto = require('crypto');
const mongoose = require('mongoose');
const gdrive = require('./googleDriveClient');
const StoredDocument = require('../../models/Storage/StoredDocument');
const Dossier = require('../../models/Folder/Dossier');
const UserDossier = require('../../models/Folder/modelsLiaisons/UserDossier');
const { resolveTenantId } = require('../tenantService');
const { readableMatterFolder } = require('./matterFolderName');

const LEGACY_ROOT = 'Files_Clients';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MAX_FILES_PER_RUN = 300; // borne une passe (idempotent : la suivante poursuit)
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

const inFlight = new Set(); // userId -> migration en cours (par processus)

// MIME derive de l'extension (les dossiers herites contiennent aussi des PDF,
// images... — pas seulement du Word).
const MIME_BY_EXT = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
function mimeFor(name) {
  const ext = String(name || '').split('.').pop().toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

/** Un StoredDocument existe-t-il deja pour cette fiche (documentId) ? */
async function hasStoredBytes(tenantId, documentId) {
  const found = await StoredDocument.findOne({ tenantId, documentId, deletedAt: null })
    .select('_id')
    .lean();
  return !!found;
}

/**
 * Enregistre un fichier Drive deplace comme StoredDocument (version unique).
 * Ne leve jamais : renvoie true/false.
 */
async function registerDriveFile({ tenantId, dossierId, docEntry, ownerUserId, file }) {
  try {
    const versionId = crypto.randomUUID();
    await StoredDocument.create({
      tenantId,
      dossierId,
      documentId: docEntry._id,
      ownerUserId,
      currentVersionId: versionId,
      versions: [{
        versionId,
        storageKey: `googledrive:${ownerUserId}:${file.id}`,
        size: Number(file.size) || 0,
        mime: mimeFor(file.name),
        filename: file.name,
        createdAt: new Date(),
        createdBy: ownerUserId,
      }],
    });
    return true;
  } catch (err) {
    // Doublon (index unique tenantId+documentId) ou validation : on n'enregistre
    // pas, le fichier reste simplement deplace.
    return false;
  }
}

/**
 * Migre les fichiers d'UN dossier heritage (Files_Clients/<idDossier>).
 * @returns {{moved:number, registered:number, unmatched:number, errors:number}}
 */
async function migrateOneLegacyFolder({ ownerUserId, tenantId, legacyFolder, dossier, budget }) {
  const label = readableMatterFolder(dossier?.dossier?.dossier?.nom, dossier.reference);
  const { folderId: targetRootId } = await gdrive.ensureFolderPathForUser(ownerUserId, ['Kheops2', 'Dossiers', label]);

  const stats = { moved: 0, registered: 0, unmatched: 0, errors: 0 };
  const docEntries = (dossier?.dossier?.documents || []);

  // Associe un fichier a UNE fiche sans ambiguite (meme nom + meme sous-dossier).
  const matchEntry = (fileName, subfolderName) => {
    const candidates = docEntries.filter((d) =>
      String(d.nomDocument || '') === String(fileName)
      && String(d.subfolderName || '') === String(subfolderName || ''));
    return candidates.length === 1 ? candidates[0] : null;
  };

  const migrateFilesIn = async (parentDriveId, targetDriveId, subfolderName) => {
    const children = await gdrive.listChildren(ownerUserId, parentDriveId);
    for (const child of children) {
      if (budget.remaining <= 0) return;
      if (child.mimeType === FOLDER_MIME) {
        if (subfolderName !== null) continue; // 1 seul niveau de sous-dossiers (comme l'ancienne app)
        try {
          const subTargetId = await gdrive.ensureChildFolderForUser(ownerUserId, targetDriveId, child.name);
          await migrateFilesIn(child.id, subTargetId, child.name);
        } catch (_) { stats.errors += 1; }
        continue;
      }
      budget.remaining -= 1;
      try {
        await gdrive.moveItem(ownerUserId, child.id, { addParentId: targetDriveId, removeParentId: parentDriveId });
        stats.moved += 1;
        const entry = matchEntry(child.name, subfolderName);
        if (entry && !(await hasStoredBytes(tenantId, entry._id))) {
          const ok = await registerDriveFile({ tenantId, dossierId: dossier._id, docEntry: entry, ownerUserId, file: child });
          if (ok) stats.registered += 1; else stats.unmatched += 1;
        } else {
          stats.unmatched += 1;
        }
      } catch (_) {
        stats.errors += 1;
      }
    }
  };

  await migrateFilesIn(legacyFolder.id, targetRootId, null);
  return stats;
}

/**
 * MIGRATION COMPLETE pour un utilisateur : Files_Clients -> Kheops2/Dossiers.
 * Idempotente (les dossiers vides restants sont re-scannes sans effet), bornee,
 * ne leve jamais.
 * @returns {Promise<object>} rapport compact
 */
async function migrateLegacyDriveForUser(ownerUserId, { maxFiles = MAX_FILES_PER_RUN } = {}) {
  const key = String(ownerUserId);
  if (inFlight.has(key)) return { skipped: 'deja-en-cours' };
  inFlight.add(key);
  try {
    // 1) Files_Clients visible ? (sinon : pas d'heritage, ou scope insuffisant)
    // CONTRAINTE 'root' : l'ancienne app creait Files_Clients A LA RACINE du
    // Drive (ensureFolder('Files_Clients','root')). Sans cette contrainte, la
    // recherche fouillait tout le corpus (y compris « Partages avec moi ») et
    // pouvait matcher un homonyme appartenant a quelqu'un d'autre.
    let legacyRootId = null;
    try {
      legacyRootId = await gdrive.findFolderByName(ownerUserId, LEGACY_ROOT, { parentId: 'root' });
    } catch (err) {
      return { skipped: err.code === 'GOOGLEDRIVE_NOT_CONNECTED' ? 'google-non-connecte' : (err.message || 'erreur-drive') };
    }
    if (!legacyRootId) return { skipped: 'files-clients-introuvable' };

    // 2) Dossiers ACCESSIBLES a l'utilisateur (ownership).
    const links = await UserDossier.find({ user: ownerUserId }).select('dossier').lean();
    const accessible = new Set(links.map((l) => String(l.dossier)));
    const tenantId = await resolveTenantId(ownerUserId);

    // 3) Sous-dossiers de Files_Clients = un par dossier juridique (nom = id Mongo).
    const children = await gdrive.listChildren(ownerUserId, legacyRootId);
    const report = {
      foldersSeen: 0, foldersMigrated: 0, moved: 0, registered: 0,
      unmatched: 0, errors: 0, ignored: 0, budgetLeft: 0,
    };
    const budget = { remaining: maxFiles };

    for (const child of children) {
      if (child.mimeType !== FOLDER_MIME) continue;
      report.foldersSeen += 1;
      if (!OBJECT_ID_RE.test(child.name) || !accessible.has(child.name)) {
        report.ignored += 1; // pas un id, ou dossier d'un autre utilisateur
        continue;
      }
      if (budget.remaining <= 0) break;
      const dossier = await Dossier.findById(new mongoose.Types.ObjectId(child.name))
        .select('reference dossier.dossier.nom dossier.documents')
        .lean();
      if (!dossier) { report.ignored += 1; continue; }

      try {
        const stats = await migrateOneLegacyFolder({ ownerUserId, tenantId, legacyFolder: child, dossier, budget });
        report.foldersMigrated += 1;
        report.moved += stats.moved;
        report.registered += stats.registered;
        report.unmatched += stats.unmatched;
        report.errors += stats.errors;
      } catch (_) {
        report.errors += 1;
      }
    }
    report.budgetLeft = budget.remaining;
    if (budget.remaining <= 0) {
      // eslint-disable-next-line no-console
      console.log(`[legacy-drive] plafond de ${maxFiles} fichiers atteint — une passe ulterieure poursuivra.`);
    }
    return report;
  } catch (err) {
    return { skipped: err.code || err.message || 'erreur-inconnue' };
  } finally {
    inFlight.delete(key);
  }
}

/**
 * ARCHIVAGE (Phase 3, decision Adrien : « archiver, jamais supprimer »).
 * Renomme la racine heritage `Files_Clients` du Drive de l'utilisateur en
 * `_ARCHIVE_Files_Clients` — UNIQUEMENT si plus AUCUN fichier n'y reste
 * (2 niveaux : dossiers de dossiers + leurs sous-dossiers, comme la migration).
 * S'il reste des fichiers, REFUSE et rapporte ce qui bloque (rien n'est touche).
 * Ne leve jamais.
 */
async function archiveLegacyDrive(ownerUserId) {
  try {
    const legacyRootId = await gdrive.findFolderByName(ownerUserId, LEGACY_ROOT, { parentId: 'root' });
    if (!legacyRootId) {
      // Deja archive ou jamais existe.
      const already = await gdrive.findFolderByName(ownerUserId, `_ARCHIVE_${LEGACY_ROOT}`, { parentId: 'root' });
      return already ? { archived: true, already: true } : { skipped: 'files-clients-introuvable' };
    }

    // Inventaire des fichiers restants (borne pour rester raisonnable).
    let remainingFiles = 0;
    const blockingFolders = [];
    const children = await gdrive.listChildren(ownerUserId, legacyRootId);
    for (const child of children) {
      if (child.mimeType !== FOLDER_MIME) {
        remainingFiles += 1; // fichier posé à la racine de Files_Clients
        continue;
      }
      let count = 0;
      const sub = await gdrive.listChildren(ownerUserId, child.id);
      for (const s of sub) {
        if (s.mimeType !== FOLDER_MIME) { count += 1; continue; }
        const subsub = await gdrive.listChildren(ownerUserId, s.id);
        count += subsub.filter((x) => x.mimeType !== FOLDER_MIME).length;
      }
      if (count > 0) {
        remainingFiles += count;
        if (blockingFolders.length < 20) blockingFolders.push(`${child.name} (${count})`);
      }
    }

    if (remainingFiles > 0) {
      return { archived: false, blocked: true, remainingFiles, blockingFolders };
    }

    await gdrive.renameItem(ownerUserId, legacyRootId, `_ARCHIVE_${LEGACY_ROOT}`);
    return { archived: true, renamedTo: `_ARCHIVE_${LEGACY_ROOT}` };
  } catch (err) {
    return { skipped: err.code || err.message || 'erreur-inconnue' };
  }
}

/** Declencheur fire-and-forget (ne bloque jamais l'appelant). */
function triggerLegacyDriveMigration(ownerUserId, origin = 'trigger') {
  if (!ownerUserId) return;
  Promise.resolve()
    .then(() => migrateLegacyDriveForUser(ownerUserId))
    .then((r) => {
      if (r && (r.moved || r.registered)) {
        // eslint-disable-next-line no-console
        console.log(`[legacy-drive:${origin}] 📦 ${r.moved} deplaces, ${r.registered} enregistres`, r);
      }
    })
    .catch(() => { /* best effort */ });
}

module.exports = { migrateLegacyDriveForUser, triggerLegacyDriveMigration, archiveLegacyDrive };
