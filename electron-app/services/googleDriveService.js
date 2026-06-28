// electron-app/services/googleDriveService.js
const { google } = require('googleapis');
const stream = require('stream');
const fs = require('fs');
const path = require('path');

let drive;
let docs; // Google Docs API v1 (pour injection en-tête)
// Cache pour stocker les IDs des dossiers résolus (optimisation)
const folderIdCache = new Map();

/**
 * Initialisation du service avec le client OAuth2 authentifié.
 */
function init(authClient) {
  // Ne pas réinitialiser si le client est le même pour éviter de vider le cache inutilement
  if (drive && drive.context._options.auth === authClient) {
    return;
  }
  drive = google.drive({ version: 'v3', auth: authClient });
  docs = google.docs({ version: 'v1', auth: authClient });
  folderIdCache.clear(); // Nettoyer le cache à la ré-initialisation
  console.log('[GDRIVE] Service Google Drive + Docs initialisé.');
}

function ensureDriveInitialized() {
  if (!drive) {
    throw new Error("Le service Google Drive n'est pas initialisé. Authentification Google requise.");
  }
}

/**
 * Fonction d'aide pour rechercher un dossier ou un fichier par nom et parent.
 */
async function findItemByNameAndParent(name, parentId = 'root', isFolder = false) {
  ensureDriveInitialized();
  const escapedName = name.replace(/'/g, "\\'");
  let query = `name='${escapedName}' and trashed=false and '${parentId}' in parents`;

  if (isFolder) {
    query += ` and mimeType='application/vnd.google-apps.folder'`;
  }

  const listResponse = await drive.files.list({
    q: query,
    spaces: 'drive',
    fields: 'files(id, name, mimeType)',
    pageSize: 1,
  });

  return listResponse.data.files && listResponse.data.files.length > 0 ? listResponse.data.files[0] : null;
}

/**
 * Crée (si besoin) et retourne l'ID d'un dossier Google Drive. (Idempotent)
 */
async function ensureFolder(name, parentId = 'root') {
  const cacheKey = `${parentId}:${name}`;
  if (folderIdCache.has(cacheKey)) {
    return folderIdCache.get(cacheKey);
  }

  // Vérifie l'existence
  let folder = await findItemByNameAndParent(name, parentId, true);

  if (folder) {
    // console.log(`[GDRIVE] Dossier '${name}' trouvé. ID: ${folder.id}`);
  } else {
    // Création si non trouvé
    console.log(`[GDRIVE] Dossier '${name}' introuvable. Création (parent=${parentId})...`);
    const createResponse = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id',
    });
    folder = createResponse.data;
    console.log(`[GDRIVE] Dossier '${name}' créé. ID: ${folder.id}`);
  }

  folderIdCache.set(cacheKey, folder.id);
  return folder.id;
}

/**
 * Résout un chemin de type Unix en un ID Google Drive.
 */
async function resolvePathToId(remotePath) {
  ensureDriveInitialized();
  if (!remotePath || remotePath === '/' || remotePath === '.') return 'root';

  const parts = remotePath.split('/').filter(p => p && p !== '.');
  let currentParentId = 'root';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isLast = i === parts.length - 1;

    const cacheKey = `${currentParentId}:${part}`;
    if (!isLast && folderIdCache.has(cacheKey)) {
      currentParentId = folderIdCache.get(cacheKey);
      continue;
    }

    const item = await findItemByNameAndParent(part, currentParentId, false);

    if (!item) {
      console.warn(`[GDRIVE] Chemin introuvable. Élément manquant : '${part}' dans le chemin : ${remotePath}`);
      return null;
    }

    currentParentId = item.id;

    if (item.mimeType === 'application/vnd.google-apps.folder') {
      folderIdCache.set(cacheKey, item.id);
    }
  }
  return currentParentId;
}


/**
 * Uploade (si besoin) les modèles Word (.docx) depuis le dossier local
 * electron-app/templates/ vers le dossier Templates sur Google Drive. (Idempotent)
 */
async function ensureDefaultTemplateDocuments(templateFolderId) {
  ensureDriveInitialized();

  // Vérifier si le dossier template existe avant de lister
  if (!templateFolderId || templateFolderId === 'root') return;

  try {
    const TEMPLATE_FILES = [
      { name: 'Courrier.docx' },
      { name: 'Assignation.docx' },
      { name: 'Conclusion.docx' },
      { name: 'Mise_en_Demeure.docx' },
      { name: 'Requete.docx' },
      { name: 'Conclusions_Recapitulatives.docx' },
      { name: 'Protocole_Accord_Transactionnel.docx' },
      { name: 'Sommation_Interpellative.docx' },
      { name: 'Note_en_Delibere.docx' },
      { name: 'Declaration_Appel.docx' },
      { name: 'Dire_et_Observations.docx' },
      { name: 'Conclusions_Incident.docx' },
      { name: 'Requete_Saisie.docx' },
    ];

    // Liste les fichiers existants pour éviter les doublons
    const listResponse = await drive.files.list({
      q: `'${templateFolderId}' in parents and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name)',
      pageSize: 100,
    });

    const existingNames = new Set((listResponse.data.files || []).map((f) => (f.name || '').toLowerCase()));

    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    // En mode packagé (EXE), les templates sont dans process.resourcesPath/templates/
    // En mode dev, ils sont dans electron-app/templates/ (relatif à ce fichier)
    const app = require('electron').app;
    const isPackaged = app && app.isPackaged;
    const localTemplatesDir = isPackaged
      ? path.join(process.resourcesPath, 'templates')
      : path.join(__dirname, '..', 'templates');

    for (const tpl of TEMPLATE_FILES) {
      // Vérifier que le fichier .docx local existe
      const localFilePath = path.join(localTemplatesDir, tpl.name);
      if (!fs.existsSync(localFilePath)) {
        console.warn(`[GDRIVE] Template local introuvable: '${localFilePath}'. Ignoré.`);
        continue;
      }

      // Upload (ou mise à jour) du template vers Google Drive
      const action = existingNames.has(tpl.name.toLowerCase()) ? 'Mise à jour' : 'Upload';
      console.log(`[GDRIVE] ${action} du template '${tpl.name}' vers Google Drive...`);
      await uploadFile(tpl.name, DOCX_MIME, localFilePath, templateFolderId);
      console.log(`[GDRIVE] Template '${tpl.name}' ${action.toLowerCase()} avec succès.`);
    }
  } catch (error) {
    console.error(`[GDRIVE] Erreur lors de la vérification/upload des templates:`, error.message);
  }
}


/**
 * S'assure que la structure de base existe dans le Drive de l'utilisateur :
 *   Mon Drive /
 *     Files_Clients /
 *       Templates /
 */
async function ensureBaseStructure() {
  console.log('[GDRIVE] Vérification / création de la structure de base...');

  // 1) Dossier "Files_Clients" à la racine
  const filesClientsId = await ensureFolder('Files_Clients', 'root');
  console.log(`[GDRIVE] Files_Clients ID: ${filesClientsId}`);

  // 2) Dossier "Templates" à l'intérieur de Files_Clients
  const templatesId = await ensureFolder('Templates', filesClientsId);
  console.log(`[GDRIVE] Templates ID: ${templatesId} (parent: ${filesClientsId})`);

  // 3) S'assurer que les templates par défaut existent dans le dossier Templates
  await ensureDefaultTemplateDocuments(templatesId);

  console.log('[GDRIVE] Structure de base vérifiée/créée.');
  return { filesClientsId, templatesId };
}

/**
 * Liste tous les éléments (fichiers et dossiers) enfants d'un dossier Google Drive.
 * Gère la pagination pour les dossiers contenant plus de 1000 éléments.
 */
async function listChildren(parentFolderId, includeFields = 'id, name, mimeType, modifiedTime, size') {
  ensureDriveInitialized();
  let allFiles = [];
  let pageToken = null;

  do {
    const params = {
      q: `'${parentFolderId}' in parents and trashed=false`,
      spaces: 'drive',
      fields: `nextPageToken, files(${includeFields})`,
      pageSize: 1000,
    };
    if (pageToken) params.pageToken = pageToken;

    const response = await drive.files.list(params);
    allFiles = allFiles.concat(response.data.files || []);
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

/**
 * Récupère les métadonnées d'un fichier Google Drive (modifiedTime, size, name, mimeType).
 */
async function getFileMetadata(fileId, fields = 'id, name, mimeType, modifiedTime, size') {
  ensureDriveInitialized();
  const response = await drive.files.get({ fileId, fields });
  return response.data;
}

// --- Les fonctions suivantes (uploadFile, downloadFile, deleteFileOrFolder, renameItem, copyFile) sont conservées car elles font partie de l'API du service ---

/**
 * Upload un fichier (Buffer ou Stream) vers Google Drive.
 * Gère intelligemment la mise à jour si le fichier existe déjà.
 */
async function uploadFile(fileName, mimeType, fileContent, parentFolderId) {
  ensureDriveInitialized();

  if (!parentFolderId) {
    throw new Error("parentFolderId est requis pour l'upload Google Drive.");
  }

  let bodyStream;
  if (Buffer.isBuffer(fileContent)) {
    bodyStream = new stream.PassThrough();
    bodyStream.end(fileContent);
  } else if (fileContent instanceof stream.Readable) {
    bodyStream = fileContent;
  } else if (typeof fileContent === 'string') {
    // Si c'est un chemin de fichier, créer un stream
    if (!fs.existsSync(fileContent)) {
      throw new Error(`Fichier local non trouvé pour l'upload : ${fileContent}`);
    }
    bodyStream = fs.createReadStream(fileContent);
  } else {
    throw new Error("fileContent doit être un Buffer, un Readable Stream ou un chemin de fichier.");
  }

  try {
    // 1. Vérifier si le fichier existe déjà
    const existingFile = await findItemByNameAndParent(fileName, parentFolderId, false);

    if (existingFile) {
      // CAS 1 : Mise à jour
      console.log(`[GDRIVE] Mise à jour du fichier existant '${fileName}' (ID: ${existingFile.id})...`);
      const response = await drive.files.update({
        fileId: existingFile.id,
        media: {
          mimeType,
          body: bodyStream,
        },
        fields: 'id, name',
      });
      console.log(`[GDRIVE] Fichier mis à jour avec succès. ID: ${response.data.id}`);
      return response.data;
    } else {
      // CAS 2 : Création
      console.log(`[GDRIVE] Création d'un nouveau fichier '${fileName}' vers dossier ID: ${parentFolderId}`);
      const response = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [parentFolderId],
        },
        media: {
          mimeType,
          body: bodyStream,
        },
        fields: 'id, name',
      });
      console.log(`[GDRIVE] Fichier créé. ID: ${response.data.id}`);
      return response.data;
    }

  } catch (error) {
    console.error("[GDRIVE] Erreur lors de l'upload:", error);
    throw error;
  }
}

/**
 * Télécharge un fichier depuis Google Drive vers un chemin local.
 * Gère l'exportation des Google Docs en DOCX.
 */
async function downloadFile(fileId, destinationPath) {
  ensureDriveInitialized();
  console.log(`[GDRIVE] Téléchargement du fichier ID: ${fileId} vers ${destinationPath}`);

  // Gérer le cas où le fichier est un Google Doc (Template vide)
  const fileMeta = await drive.files.get({ fileId: fileId, fields: 'mimeType, size' });
  const isGoogleDoc = fileMeta.data.mimeType === 'application/vnd.google-apps.document';
  console.log(`[GDRIVE] Type MIME: ${fileMeta.data.mimeType}, Google Doc natif: ${isGoogleDoc}`);

  return new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(destinationPath);
    let resolved = false;

    const cleanup = (err) => {
      if (resolved) return;
      resolved = true;
      dest.end();
      reject(err);
    };

    // Attendre que le writeStream ait FINI d'ecrire sur disque
    dest.on('finish', () => {
      if (resolved) return;
      resolved = true;
      const stats = fs.statSync(destinationPath);
      console.log(`[GDRIVE] Fichier ecrit sur disque: ${destinationPath} (${stats.size} octets)`);
      if (stats.size === 0) {
        reject(new Error(`Le fichier telecharge est vide (0 octets): ${destinationPath}`));
      } else {
        resolve(destinationPath);
      }
    });

    dest.on('error', (err) => {
      console.error('[GDRIVE] Erreur WriteStream:', err);
      cleanup(err);
    });

    const callback = (err, res) => {
      if (err) {
        console.error('[GDRIVE] Erreur API lors du téléchargement:', err);
        return cleanup(err);
      }
      res.data
        .on('error', (err) => {
          console.error('[GDRIVE] Erreur Stream lecture:', err);
          cleanup(err);
        })
        .pipe(dest);
    };

    if (isGoogleDoc) {
      // Exporter le Google Doc en DOCX
      drive.files.export(
        { fileId: fileId, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        { responseType: 'stream' },
        callback
      );
    } else {
      // Télécharger le fichier natif
      drive.files.get(
        { fileId: fileId, alt: 'media' },
        { responseType: 'stream' },
        callback
      );
    }
  });
}

/**
 * Supprime un fichier ou un dossier sur Google Drive.
 * >>> CORRECTION CACHE : Invalide les entrées de cache correspondantes après suppression.
 */
async function deleteFileOrFolder(fileId) {
  ensureDriveInitialized();
  console.log(`[GDRIVE] Suppression de l'élément ID: ${fileId}`);
  try {
    await drive.files.delete({ fileId: fileId });
    console.log(`[GDRIVE] Élément ${fileId} supprimé avec succès.`);

    // >>> CORRECTION CACHE : Invalider toutes les entrées du cache qui référencent cet ID
    invalidateCacheEntriesByValue(fileId);

  } catch (error) {
    if (error.code === 404) {
      console.warn(`[GDRIVE] Élément ${fileId} non trouvé lors de la suppression (peut-être déjà supprimé).`);
      // Même en 404, on invalide le cache au cas où l'ID serait encore caché
      invalidateCacheEntriesByValue(fileId);
    } else {
      console.error(`[GDRIVE] Erreur lors de la suppression de ${fileId}:`, error);
      throw error;
    }
  }
}

/**
 * Renomme un fichier ou un dossier sur Google Drive.
 * >>> CORRECTION CACHE : Invalide les entrées de cache correspondantes après renommage.
 */
async function renameItem(fileId, newName) {
  ensureDriveInitialized();
  console.log(`[GDRIVE] Renommage de l'élément ID: ${fileId} en '${newName}'`);
  try {
    const response = await drive.files.update({
      fileId: fileId,
      requestBody: {
        name: newName
      },
      fields: 'id, name'
    });
    console.log(`[GDRIVE] Élément renommé avec succès.`);

    // >>> CORRECTION CACHE : Invalider les anciennes entrées et mettre à jour avec le nouveau nom
    invalidateCacheEntriesByValue(fileId);

    // Reconstruire l'entrée de cache avec le nouveau nom si c'est un dossier
    // (On ne peut pas savoir le parentId ici, donc on invalide seulement.
    // Le prochain appel à ensureFolder ou resolvePathToId recréera l'entrée.)

    return response.data;
  } catch (error) {
    console.error(`[GDRIVE] Erreur lors du renommage de ${fileId}:`, error);
    throw error;
  }
}

/**
 * Duplique un fichier sur Google Drive dans un nouveau dossier parent.
 */
async function copyFile(sourceFileId, newName, destinationFolderId) {
  ensureDriveInitialized();
  console.log(`[GDRIVE] Copie du fichier ID: ${sourceFileId} vers dossier ID: ${destinationFolderId} avec le nom '${newName}'`);
  try {
    const response = await drive.files.copy({
      fileId: sourceFileId,
      requestBody: {
        name: newName,
        parents: [destinationFolderId]
      },
      fields: 'id, name'
    });
    console.log(`[GDRIVE] Fichier copié avec succès. Nouvel ID: ${response.data.id}`);
    return response.data;
  } catch (error) {
    console.error(`[GDRIVE] Erreur lors de la copie de ${sourceFileId}:`, error);
    throw error;
  }
}


// ========================================================================
// Google Docs API — En-tête via API native
// ========================================================================

/**
 * Upload un fichier DOCX vers Google Drive en le convertissant en Google Doc.
 * La conversion permet ensuite d'utiliser l'API Google Docs pour ajouter l'en-tête.
 *
 * @param {string} fileName - Nom du fichier
 * @param {string} localFilePath - Chemin local du fichier DOCX
 * @param {string} parentFolderId - ID du dossier parent sur Drive
 * @returns {Promise<{id: string, name: string}>} Le Google Doc créé
 */
async function uploadAsGoogleDoc(fileName, localFilePath, parentFolderId) {
  ensureDriveInitialized();
  console.log(`[GDRIVE] Upload de '${fileName}' avec conversion en Google Doc...`);

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [parentFolderId],
      mimeType: 'application/vnd.google-apps.document', // Déclenche la conversion DOCX → Google Doc
    },
    media: {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: fs.createReadStream(localFilePath),
    },
    fields: 'id, name',
  });

  console.log(`[GDRIVE] Google Doc créé: ${response.data.name} (ID: ${response.data.id})`);
  return response.data;
}

/**
 * Ajoute un en-tête centré à un Google Doc via l'API Google Docs.
 * Active "Première page différente" et met le même contenu sur toutes les pages.
 *
 * Séquence d'appels (l'API Docs impose des appels séparés) :
 * 1. createHeader type=DEFAULT → récupère headerId
 * 2. insertText + updateParagraphStyle + updateTextStyle dans le header
 * 3. updateDocumentStyle : useFirstPageHeaderFooter = true
 * 4. documents.get() → récupère firstPageHeaderId
 * 5. insertText + format dans le firstPageHeader (même contenu)
 *
 * @param {string} documentId - ID du Google Doc
 * @param {string} headerText - Texte multi-lignes de l'en-tête (séparé par \n)
 */
async function addHeaderToGoogleDoc(documentId, headerText) {
  if (!docs) throw new Error("Google Docs API non initialisé.");
  if (!headerText || !headerText.trim()) return;

  console.log(`[GDOCS] Ajout de l'en-tête au document ${documentId}...`);

  // --- APPEL 1 : Créer le header par défaut (pages 2+) ---
  const createResponse = await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        { createHeader: { type: 'DEFAULT' } }
      ]
    }
  });

  const headerId = createResponse.data.replies[0].createHeader.headerId;
  console.log(`[GDOCS] Header DEFAULT créé: ${headerId}`);

  // --- APPEL 2 : Insérer le texte + formater dans le header par défaut ---
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        // Insérer le texte
        {
          insertText: {
            location: { segmentId: headerId, index: 0 },
            text: headerText
          }
        },
        // Centrer tous les paragraphes
        {
          updateParagraphStyle: {
            range: {
              segmentId: headerId,
              startIndex: 0,
              endIndex: headerText.length
            },
            paragraphStyle: { alignment: 'CENTER' },
            fields: 'alignment'
          }
        },
        // Taille de police 10pt
        {
          updateTextStyle: {
            range: {
              segmentId: headerId,
              startIndex: 0,
              endIndex: headerText.length
            },
            textStyle: { fontSize: { magnitude: 10, unit: 'PT' } },
            fields: 'fontSize'
          }
        }
      ]
    }
  });

  console.log(`[GDOCS] Texte en-tête inséré et formaté (header par défaut).`);

  // --- APPEL 3 : Activer "Première page différente" ---
  await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        {
          updateDocumentStyle: {
            documentStyle: { useFirstPageHeaderFooter: true },
            fields: 'useFirstPageHeaderFooter'
          }
        }
      ]
    }
  });

  console.log(`[GDOCS] "Première page différente" activée.`);

  // --- APPEL 4 : Récupérer le firstPageHeaderId ---
  const docData = await docs.documents.get({ documentId });
  const firstPageHeaderId = docData.data.documentStyle?.firstPageHeaderId;

  if (firstPageHeaderId) {
    console.log(`[GDOCS] First page header ID: ${firstPageHeaderId}`);

    // --- APPEL 5 : Insérer le même texte + format dans le header première page ---
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { segmentId: firstPageHeaderId, index: 0 },
              text: headerText
            }
          },
          {
            updateParagraphStyle: {
              range: {
                segmentId: firstPageHeaderId,
                startIndex: 0,
                endIndex: headerText.length
              },
              paragraphStyle: { alignment: 'CENTER' },
              fields: 'alignment'
            }
          },
          {
            updateTextStyle: {
              range: {
                segmentId: firstPageHeaderId,
                startIndex: 0,
                endIndex: headerText.length
              },
              textStyle: { fontSize: { magnitude: 10, unit: 'PT' } },
              fields: 'fontSize'
            }
          }
        ]
      }
    });

    console.log(`[GDOCS] Texte en-tête inséré et formaté (first page header).`);
  } else {
    console.warn(`[GDOCS] Pas de firstPageHeaderId trouvé après activation.`);
  }

  console.log(`[GDOCS] En-tête ajoutée avec succès au document ${documentId}.`);
}

/**
 * Ajoute un footer (signature texte + image) à un Google Doc via l'API Google Docs.
 * Si une image de signature (Base64) est fournie, elle est uploadée temporairement
 * sur Google Drive, rendue accessible, insérée dans le footer via insertInlineImage,
 * puis le fichier temporaire est supprimé.
 *
 * Gère aussi le footer de première page (si useFirstPageHeaderFooter est activé).
 *
 * @param {string} documentId - ID du Google Doc
 * @param {string} signatureText - Texte de signature (ex: "Maître Dupont")
 * @param {string} signatureImageBase64 - Image de signature encodée en Base64 (data:image/png;base64,...)
 */
async function addFooterToGoogleDoc(documentId, signatureText, signatureImageBase64) {
  if (!docs) throw new Error("Google Docs API non initialisé.");
  if (!signatureText && !signatureImageBase64) return;

  console.log(`[GDOCS] Ajout du footer/signature au document ${documentId}...`);

  let tempImageFileId = null;
  let tempImagePermissionId = null;
  let imageUri = null;

  try {
    // ============================================================
    // ÉTAPE 1 : Upload de l'image de signature sur Drive (si fournie)
    // ============================================================
    if (signatureImageBase64) {
      try {
        console.log(`[GDOCS] Upload de l'image de signature vers Google Drive...`);

        // Extraire les données Base64 pures (supprimer le préfixe data:image/xxx;base64,)
        let base64Data = signatureImageBase64;
        let mimeType = 'image/png'; // Par défaut
        const dataUriMatch = signatureImageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (dataUriMatch) {
          mimeType = dataUriMatch[1];
          base64Data = dataUriMatch[2];
        }

        const imageBuffer = Buffer.from(base64Data, 'base64');
        console.log(`[GDOCS] Image signature: ${mimeType}, ${imageBuffer.length} octets`);

        // Upload vers Drive comme fichier image temporaire
        const tempFileName = `_temp_signature_${Date.now()}.${mimeType.split('/')[1] || 'png'}`;
        const bodyStream = new stream.PassThrough();
        bodyStream.end(imageBuffer);

        const uploadResponse = await drive.files.create({
          requestBody: {
            name: tempFileName,
            // Pas de parents spécifique → racine (sera supprimé après)
          },
          media: {
            mimeType: mimeType,
            body: bodyStream,
          },
          fields: 'id, name',
        });

        tempImageFileId = uploadResponse.data.id;
        console.log(`[GDOCS] Image temporaire uploadée: ${tempFileName} (ID: ${tempImageFileId})`);

        // Rendre le fichier accessible publiquement (nécessaire pour insertInlineImage)
        const permResponse = await drive.permissions.create({
          fileId: tempImageFileId,
          requestBody: {
            role: 'reader',
            type: 'anyone',
          },
          fields: 'id',
        });
        tempImagePermissionId = permResponse.data.id;
        console.log(`[GDOCS] Permission publique ajoutée (ID: ${tempImagePermissionId})`);

        // URL directe pour l'image Google Drive
        imageUri = `https://drive.google.com/uc?id=${tempImageFileId}`;
        console.log(`[GDOCS] URI de l'image: ${imageUri}`);

      } catch (imgErr) {
        console.warn(`[GDOCS] Erreur upload image signature (non bloquant):`, imgErr.message);
        // On continue sans l'image — on mettra juste le texte
        imageUri = null;
      }
    }

    // ============================================================
    // ÉTAPE 2 : Créer le footer DEFAULT et insérer le contenu
    // ============================================================
    await _insertFooterContent(documentId, 'DEFAULT', imageUri, signatureText);

    // ============================================================
    // ÉTAPE 3 : Footer première page (si useFirstPageHeaderFooter est activé)
    // ============================================================
    // Vérifier si useFirstPageHeaderFooter est activé (par addHeaderToGoogleDoc)
    const docData = await docs.documents.get({ documentId });
    const useFirstPage = docData.data.documentStyle?.useFirstPageHeaderFooter;

    if (useFirstPage) {
      console.log(`[GDOCS] "Première page différente" est activé, ajout du footer première page...`);

      // Vérifier si un footer première page existe déjà
      const firstPageFooterId = docData.data.documentStyle?.firstPageFooterId;

      if (!firstPageFooterId) {
        // Créer le footer FIRST_PAGE (crée un footer pour la première page uniquement)
        // Note: On utilise 'DEFAULT' car l'API crée automatiquement le footer de première page
        // quand useFirstPageHeaderFooter est activé, via le type 'DEFAULT' qui gère les deux
        // En fait, il faut créer un footer avec sectionBreak ou simplement dupliquer
        // L'API ne supporte pas directement type='FIRST_PAGE', on va créer via un autre moyen

        // Approche : Si pas de firstPageFooterId, on en crée un en créant un footer
        // et le système l'attribuera automatiquement à la première page
        // En réalité, l'API Google Docs n'a pas de type 'FIRST_PAGE' pour createFooter
        // Le firstPageFooter est créé automatiquement quand on active useFirstPageHeaderFooter
        // ET qu'on fait un createFooter. Vérifions si le premier createFooter l'a déjà créé.

        // Re-fetch pour voir si le footer première page a été créé
        const docData2 = await docs.documents.get({ documentId });
        const fpFooterId = docData2.data.documentStyle?.firstPageFooterId;
        if (fpFooterId) {
          // Le footer première page existe, insérer le même contenu
          await _insertContentInExistingFooter(documentId, fpFooterId, imageUri, signatureText);
        } else {
          console.warn(`[GDOCS] Pas de firstPageFooterId trouvé, footer première page ignoré.`);
        }
      } else {
        // Le footer première page existe déjà, insérer le contenu
        await _insertContentInExistingFooter(documentId, firstPageFooterId, imageUri, signatureText);
      }
    }

    console.log(`[GDOCS] Footer/signature ajouté avec succès au document ${documentId}.`);

  } finally {
    // ============================================================
    // NETTOYAGE : Supprimer le fichier image temporaire de Drive
    // ============================================================
    if (tempImageFileId) {
      try {
        console.log(`[GDOCS] Suppression de l'image temporaire (ID: ${tempImageFileId})...`);
        await drive.files.delete({ fileId: tempImageFileId });
        console.log(`[GDOCS] Image temporaire supprimée.`);
      } catch (cleanupErr) {
        console.warn(`[GDOCS] Erreur suppression image temporaire:`, cleanupErr.message);
      }
    }
  }
}

/**
 * Crée un footer dans le document et y insère le contenu (image + texte).
 * @private
 */
async function _insertFooterContent(documentId, footerType, imageUri, signatureText) {
  // --- APPEL 1 : Créer le footer ---
  console.log(`[GDOCS] Création du footer (type: ${footerType})...`);
  const createResponse = await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: [
        { createFooter: { type: footerType } }
      ]
    }
  });

  const footerId = createResponse.data.replies[0].createFooter.footerId;
  console.log(`[GDOCS] Footer créé: ${footerId}`);

  // Insérer le contenu dans ce footer
  await _insertContentInExistingFooter(documentId, footerId, imageUri, signatureText);
}

/**
 * Insère le contenu (image + texte) dans un footer existant.
 * L'image est insérée en premier, puis le texte sous l'image.
 * Tout est aligné à droite, 10pt.
 * @private
 */
async function _insertContentInExistingFooter(documentId, footerId, imageUri, signatureText) {
  const requests = [];
  let currentIndex = 0; // Position courante dans le footer

  // --- Insertion de l'image de signature ---
  if (imageUri) {
    console.log(`[GDOCS] Insertion de l'image de signature dans le footer ${footerId}...`);
    requests.push({
      insertInlineImage: {
        location: {
          segmentId: footerId,
          index: currentIndex
        },
        uri: imageUri,
        objectSize: {
          height: { magnitude: 50, unit: 'PT' },  // ~1.8cm
          width: { magnitude: 113, unit: 'PT' }    // ~4cm
        }
      }
    });
    // Après l'insertion d'une image inline, l'index avance de 1
    currentIndex += 1;

    // Ajouter un saut de ligne après l'image si on a aussi du texte
    if (signatureText && signatureText.trim()) {
      requests.push({
        insertText: {
          location: {
            segmentId: footerId,
            index: currentIndex
          },
          text: '\n'
        }
      });
      currentIndex += 1;
    }
  }

  // --- Insertion du texte de signature ---
  if (signatureText && signatureText.trim()) {
    console.log(`[GDOCS] Insertion du texte de signature dans le footer ${footerId}...`);
    requests.push({
      insertText: {
        location: {
          segmentId: footerId,
          index: currentIndex
        },
        text: signatureText
      }
    });
  }

  // --- APPEL 2 : Exécuter les insertions ---
  if (requests.length > 0) {
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests }
    });
    console.log(`[GDOCS] Contenu inséré dans le footer ${footerId}.`);
  }

  // --- APPEL 3 : Formater tout le contenu du footer (aligné à droite, 10pt) ---
  // Calculer l'étendue totale du contenu inséré
  const totalEndIndex = currentIndex + (signatureText ? signatureText.length : 0);

  if (totalEndIndex > 0) {
    const formatRequests = [
      // Aligner à droite
      {
        updateParagraphStyle: {
          range: {
            segmentId: footerId,
            startIndex: 0,
            endIndex: totalEndIndex
          },
          paragraphStyle: { alignment: 'END' },
          fields: 'alignment'
        }
      },
      // Taille de police 10pt
      {
        updateTextStyle: {
          range: {
            segmentId: footerId,
            startIndex: 0,
            endIndex: totalEndIndex
          },
          textStyle: { fontSize: { magnitude: 10, unit: 'PT' } },
          fields: 'fontSize'
        }
      }
    ];

    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests: formatRequests }
    });
    console.log(`[GDOCS] Footer ${footerId} formaté (aligné à droite, 10pt).`);
  }
}

/**
 * Exporte un Google Doc en format DOCX et le sauvegarde localement.
 *
 * @param {string} fileId - ID du Google Doc
 * @param {string} localDestPath - Chemin local où sauvegarder le .docx
 * @returns {Promise<string>} Le chemin local du fichier exporté
 */
async function exportGoogleDocAsDocx(fileId, localDestPath) {
  ensureDriveInitialized();
  console.log(`[GDRIVE] Export du Google Doc ${fileId} en DOCX vers ${localDestPath}...`);

  const response = await drive.files.export(
    {
      fileId: fileId,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    },
    { responseType: 'stream' }
  );

  return new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(localDestPath);

    dest.on('finish', () => {
      const stats = fs.statSync(localDestPath);
      console.log(`[GDRIVE] DOCX exporté: ${localDestPath} (${stats.size} octets)`);
      if (stats.size === 0) {
        reject(new Error(`Le fichier exporté est vide (0 octets): ${localDestPath}`));
      } else {
        resolve(localDestPath);
      }
    });

    dest.on('error', (err) => {
      console.error('[GDRIVE] Erreur écriture export DOCX:', err);
      reject(err);
    });

    response.data
      .on('error', (err) => {
        console.error('[GDRIVE] Erreur stream export DOCX:', err);
        reject(err);
      })
      .pipe(dest);
  });
}


// --- Fonctions d'invalidation du cache ---

/**
 * >>> NOUVEAU : Invalide toutes les entrées du cache dont la valeur correspond à un fileId donné.
 * Utilisé après suppression ou renommage pour éviter les IDs obsolètes dans le cache.
 *
 * @param {string} fileId - L'ID du fichier/dossier supprimé ou renommé.
 */
function invalidateCacheEntriesByValue(fileId) {
  let invalidatedCount = 0;
  for (const [key, value] of folderIdCache.entries()) {
    if (value === fileId) {
      folderIdCache.delete(key);
      invalidatedCount++;
    }
  }
  if (invalidatedCount > 0) {
    console.log(`[GDRIVE Cache] ${invalidatedCount} entrée(s) de cache invalidée(s) pour l'ID: ${fileId}`);
  }
}

/**
 * >>> NOUVEAU : Invalide une entrée spécifique du cache par sa clé.
 * La clé est au format "parentId:nom".
 *
 * @param {string} parentId - L'ID du dossier parent.
 * @param {string} name - Le nom de l'élément.
 */
function invalidateCacheEntry(parentId, name) {
  const cacheKey = `${parentId}:${name}`;
  if (folderIdCache.has(cacheKey)) {
    folderIdCache.delete(cacheKey);
    console.log(`[GDRIVE Cache] Entrée de cache invalidée : ${cacheKey}`);
  }
}

/**
 * >>> NOUVEAU : Vide entièrement le cache des dossiers.
 * Utile pour forcer une résolution complète lors de la prochaine opération.
 */
function clearFolderCache() {
  const size = folderIdCache.size;
  folderIdCache.clear();
  console.log(`[GDRIVE Cache] Cache entièrement vidé (${size} entrées supprimées).`);
}


/**
 * Réinitialise complètement le service Google Drive : clients drive/docs et
 * cache folder. À appeler au logout pour s'assurer qu'aucune donnée du user
 * précédent ne fuit vers le user suivant (confidentialité multi-user sur PC).
 */
function reset() {
  drive = undefined;
  docs = undefined;
  folderIdCache.clear();
  console.log('[GDRIVE] Service réinitialisé (logout).');
}

module.exports = {
  init,
  reset,
  ensureFolder,
  ensureBaseStructure, // Fonction principale pour la structure
  resolvePathToId,
  listChildren,
  getFileMetadata,
  uploadFile,
  downloadFile,
  deleteFileOrFolder,
  renameItem,
  copyFile,
  findItemByNameAndParent,
  invalidateCacheEntry,
  invalidateCacheEntriesByValue,
  clearFolderCache,
  // Google Docs API (en-tête + footer/signature)
  uploadAsGoogleDoc,
  addHeaderToGoogleDoc,
  addFooterToGoogleDoc,
  exportGoogleDocAsDocx,
};
