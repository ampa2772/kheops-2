// electron-app/services/fileUtils.js
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const axios = require("axios");

// Imports des utilitaires cloud refactorisés
// >>> CORRECTION DOUBLE-UPLOAD : Ajout de l'import de markAsRecentlyUploaded
const { uploadFileToCloud, ensureAndGetCloudFolderId, ensureFilesClientsFolderExists, markAsRecentlyUploaded } = require("./localFileWatcher");

// Import du service Google Drive et Auth
const googleDriveService = require('./googleDriveService');
const authService = require('./authService');
const configManager = require('./configManager');

// Crash log centralise (idem main.js)
const { logToFile } = require('./crashLog');

/**
 * S'assure que l'authentification Google est prête.
 */
function ensureAuthenticated() {
  const authClient = authService.getGoogleAuthClient();
  if (!authClient) {
    throw new Error("Authentification Google requise.");
  }
  googleDriveService.init(authClient);
}

/**
 * Génère un ObjectId-compatible MongoDB (24 chars hex) sans dépendance.
 * Format conforme : 4 octets timestamp + 8 octets aléatoires. Mongoose accepte
 * cette chaîne directement comme `_id`. On l'utilise pour réserver l'ID
 * AVANT l'upload Cloud, ce qui permet un rollback fiable côté Cloud si la
 * création de la fiche MongoDB échoue ensuite.
 */
function generateObjectId() {
  const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  const random = crypto.randomBytes(8).toString('hex'); // 16 chars hex
  return timestamp + random;
}

function copyFolderRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    entry.isDirectory() ? copyFolderRecursiveSync(srcPath, destPath) : fs.copyFileSync(srcPath, destPath);
  }
}

/**
 * Gère la logique de duplication d'un document localement et sur le Cloud.
 */
async function duplicateFileHandler(oldDoc, newDoc, io) {
  if (!oldDoc?._id || !newDoc?._id || !newDoc.nomDocument) throw new Error("Données de duplication invalides");

  // >>> CHANGEMENT : Utilisation du chemin dynamique
  const rootPath = configManager.getLocalRootPath();
  if (!rootPath) throw new Error("Chemin local non configuré.");

  const src = path.join(rootPath, oldDoc._id.toString());
  const dst = path.join(rootPath, newDoc._id.toString());

  if (!fs.existsSync(src)) {
    ensureFilesClientsFolderExists(dst);
    throw new Error("Dossier source inexistant pour la duplication.");
  }
  if (fs.existsSync(dst)) throw new Error("Le dossier de destination existe déjà.");

  // Copie locale
  copyFolderRecursiveSync(src, dst);

  // Préparation Cloud
  ensureAuthenticated();

  const filesClientsId = await googleDriveService.ensureFolder("Files_Clients", 'root');
  const targetFolderId = await ensureAndGetCloudFolderId(newDoc._id.toString(), filesClientsId);

  const files = fs.readdirSync(dst);
  for (const file of files) {
    if (file.startsWith('.')) continue;

    const oldPath = path.join(dst, file);
    const parsed = path.parse(file);
    let expectedName = newDoc.nomDocument;

    if (!path.extname(expectedName) && parsed.ext) {
      expectedName += parsed.ext;
    }

    const newPath = path.join(dst, expectedName);

    if (oldPath !== newPath) {
      fs.renameSync(oldPath, newPath);
    }

    // >>> CORRECTION DOUBLE-UPLOAD : Marquer le fichier AVANT l'upload pour éviter que le watcher le détecte
    markAsRecentlyUploaded(newPath);

    await uploadFileToCloud(newPath, expectedName, targetFolderId);

    // >>> CORRECTION DOUBLE-UPLOAD : Re-marquer après l'upload pour renouveler la protection
    markAsRecentlyUploaded(newPath);
  }

  io.emit("document_operation_success", { type: "duplicate-file", oldDocId: oldDoc._id, newDocId: newDoc._id, newDoc });
}

/**
 * Gère le renommage d'un fichier localement ET sur le Cloud.
 */
async function renameFileHandler(docId, _oldName, newNameBase, io) {
  if (!docId || !newNameBase) throw new Error("Paramètres de renommage manquants");

  // >>> CHANGEMENT : Utilisation du chemin dynamique
  const rootPath = configManager.getLocalRootPath();
  if (!rootPath) throw new Error("Chemin local non configuré.");

  const folder = path.join(rootPath, docId.toString());
  if (!fs.existsSync(folder)) throw new Error("Dossier local introuvable.");

  const currentFileName = fs.readdirSync(folder).find(f => !f.startsWith("."));
  if (!currentFileName) throw new Error("Fichier introuvable dans le dossier local.");

  const ext = path.extname(currentFileName).toLowerCase();
  const finalNewName = newNameBase.toLowerCase().endsWith(ext) ? newNameBase : newNameBase + ext;

  if (currentFileName !== finalNewName) {
    const oldFullPath = path.join(folder, currentFileName);
    const newFullPath = path.join(folder, finalNewName);

    fs.renameSync(oldFullPath, newFullPath);
    console.log(`[Rename] Fichier local renommé: "${currentFileName}" -> "${finalNewName}"`);

    // >>> CORRECTION DOUBLE-UPLOAD : Marquer le fichier renommé pour éviter que le watcher le re-uploade
    markAsRecentlyUploaded(newFullPath);

    try {
      ensureAuthenticated();
      const remotePath = `Files_Clients/${docId}/${currentFileName}`;
      const fileId = await googleDriveService.resolvePathToId(remotePath);

      if (fileId) {
        await googleDriveService.renameItem(fileId, finalNewName);
        console.log(`[Rename] Fichier Cloud renommé.`);
      } else {
        console.warn(`[Rename] Fichier "${currentFileName}" non trouvé sur le Cloud dans ${remotePath}.`);
      }
    } catch (err) {
      console.error("[Rename] Erreur lors du renommage sur le Cloud:", err.message);
    }
  }

  io.emit("document_operation_success", { type: "rename-file", docId, newName: finalNewName });
}

/**
 * Gère le traitement d'un fichier déposé (Drag & Drop).
 *
 * Stratégie cloud-first (rc31) — empêche les docs fantômes :
 *   1. On réserve un ObjectId côté agent (pas encore en MongoDB).
 *   2. On déplace le fichier en local : Files_Clients/<reservedId>/<nomFichier>.
 *   3. On upload le fichier sur Google Drive sous ce même chemin.
 *   4. SEULEMENT SI 1-3 réussissent, on crée la fiche MongoDB en lui passant
 *      providedDocId pour que la base et le Cloud partagent le même ID.
 *   5. Si la création MongoDB échoue après l'upload Cloud, on supprime le
 *      fichier Cloud et le fichier local pour ne laisser aucune trace.
 *   6. Si l'upload Cloud échoue, on n'a rien créé en MongoDB : aucun doc
 *      fantôme possible.
 */
async function handleProcessTempFile(socket, data, serverUrl) {
  const { tempPath, originalName, dossierId, token, subfolderId } = data;
  console.log(`[D&D] 1. Traitement du fichier : ${originalName}`);
  logToFile(`[D&D handleProcessTempFile] START name="${originalName}" dossier=${dossierId} subfolder=${subfolderId || ''}`);

  if (!tempPath || !originalName || !dossierId || !token) {
    logToFile(`[D&D handleProcessTempFile] BAD_REQUEST missing args`);
    throw new Error("Données de traitement incomplètes reçues par l'agent.");
  }

  if (!fs.existsSync(tempPath)) {
    console.error(`[D&D] ERREUR: Le fichier temporaire ${tempPath} n'existe pas.`);
    logToFile(`[D&D handleProcessTempFile] TEMP_MISSING path=${tempPath}`);
    throw new Error("Le fichier temporaire est introuvable sur l'agent.");
  }

  // Réserver un ObjectId AVANT toute opération distante. La fiche MongoDB
  // ne sera créée qu'à la fin, avec ce même ID, si tout le reste a marché.
  const reservedDocId = generateObjectId();
  console.log(`[D&D] 2. ObjectId réservé côté agent : ${reservedDocId}`);

  const rootPath = configManager.getLocalRootPath();
  if (!rootPath) throw new Error("Chemin local non configuré.");

  const finalDir = path.join(rootPath, reservedDocId);
  const finalPath = path.join(finalDir, originalName);

  let localFileRenamed = false;
  let cloudUploadDone = false;

  try {
    // === Étape A : déplacement local sous Files_Clients/<reservedDocId>/<nom>
    ensureFilesClientsFolderExists(finalDir);
    fs.renameSync(tempPath, finalPath);
    localFileRenamed = true;
    markAsRecentlyUploaded(finalPath);
    console.log(`[D&D] 3. Fichier déplacé localement vers ${finalPath}`);

    // === Étape B : upload Google Drive
    ensureAuthenticated();
    const filesClientsId = await googleDriveService.ensureFolder("Files_Clients", 'root');
    const cloudFolderId = await ensureAndGetCloudFolderId(reservedDocId, filesClientsId);
    await uploadFileToCloud(finalPath, originalName, cloudFolderId);
    cloudUploadDone = true;
    markAsRecentlyUploaded(finalPath);
    console.log(`[D&D] 4. Upload Cloud terminé pour ${originalName}.`);

    // === Étape C : création de la fiche MongoDB avec l'ID réservé
    const metaRes = await axios.post(`${serverUrl}/api/fusion/createDroppedDocumentMetadata`,
      { dossierId, originalFileName: originalName, subfolderId, providedDocId: reservedDocId },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const { newDocMetadata, updatedDossier } = metaRes.data;
    if (!newDocMetadata || !updatedDossier) {
      throw new Error("Réponse serveur invalide pour les métadonnées.");
    }
    const isDocInDossier = updatedDossier.dossier?.documents?.some(doc => doc._id.toString() === reservedDocId);
    if (!isDocInDossier) {
      throw new Error("La sauvegarde des métadonnées dans la base de données a échoué.");
    }
    console.log(`[D&D] 5. Fiche MongoDB créée avec _id=${reservedDocId}.`);

    // === Étape D : notifier les clients
    const eventPayload = { newDocMetadata, updatedDossier };
    socket.emit("single_document_added", eventPayload);
    socket.broadcast.emit("single_document_added", eventPayload);
    console.log(`[D&D] 6. Processus terminé avec succès.`);
    logToFile(`[D&D handleProcessTempFile] OK docId=${reservedDocId} name="${originalName}"`);

  } catch (error) {
    // ROLLBACK : on tente de remettre le système dans un état cohérent.
    // Pas de doc fantôme : si la fiche MongoDB n'a pas été créée, on supprime
    // tout ce qui aurait pu être posé côté local et Cloud.
    const errorMessage = error.response?.data?.msg || error.message || 'Erreur inconnue.';
    console.error(`[D&D] Erreur détectée : ${errorMessage}. Démarrage du rollback…`);

    // Nettoyer le tempPath s'il existe encore (rename peut avoir échoué avant)
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (e) { /* best-effort */ }
    }
    // Nettoyer le fichier local renommé
    if (localFileRenamed && fs.existsSync(finalPath)) {
      try { fs.unlinkSync(finalPath); } catch (e) { console.warn(`[D&D] cleanup local KO: ${e.message}`); }
      // Nettoyer aussi le dossier parent vide Files_Clients/<reservedDocId>
      try {
        if (fs.existsSync(finalDir) && fs.readdirSync(finalDir).length === 0) {
          fs.rmdirSync(finalDir);
        }
      } catch (e) { /* best-effort */ }
    }
    // Nettoyer le fichier Cloud s'il a été uploadé (l'erreur est venue de l'étape C)
    if (cloudUploadDone) {
      try {
        const cloudFileId = await googleDriveService.resolvePathToId(`Files_Clients/${reservedDocId}/${originalName}`);
        if (cloudFileId) {
          await googleDriveService.deleteFileOrFolder(cloudFileId);
          console.log(`[D&D] Rollback Cloud OK : fichier supprimé (${reservedDocId}/${originalName}).`);
        }
        // Tenter aussi de supprimer le dossier Cloud parent s'il est vide
        const cloudFolderId = await googleDriveService.resolvePathToId(`Files_Clients/${reservedDocId}`);
        if (cloudFolderId && cloudFolderId !== 'root') {
          try { await googleDriveService.deleteFileOrFolder(cloudFolderId); } catch (_e) { /* best-effort */ }
        }
      } catch (cleanupErr) {
        console.warn(`[D&D] Rollback Cloud KO : ${cleanupErr.message}. À nettoyer manuellement : Files_Clients/${reservedDocId}/`);
      }
    }

    console.error(`[D&D] Erreur complète : ${errorMessage}`);
    logToFile(`[D&D handleProcessTempFile] ERROR docId=${reservedDocId} name="${originalName}" msg="${errorMessage}" rollback{local=${localFileRenamed} cloud=${cloudUploadDone}}`);
    throw new Error(errorMessage);
  }
}


module.exports = {
  copyFolderRecursiveSync,
  duplicateFileHandler,
  renameFileHandler,
  handleProcessTempFile,
};
