// electron-app/services/socketHandlers.js
const path = require("path");
const fs = require("fs");
const os = require("os");
const { shell } = require("electron");
const mammoth = require("mammoth");
const axios = require("axios");

const { openDocument, createDocumentForClient } = require("./docGenerator");
const { generateInvoiceForDossier } = require("./invoiceGenerator");
const { generateFullTextExport } = require("./textExportService");
const { generateAideJuridictionnellePdf } = require("./aideJuridictionnelleGenerator");

// Imports des utilitaires cloud refactorisés
const { ensureAndGetCloudFolderId, uploadFileToCloud, ensureFilesClientsFolderExists } = require("./localFileWatcher");

const { duplicateFileHandler, renameFileHandler, handleProcessTempFile } = require("./fileUtils");

// Import du service Google Drive et Auth
const googleDriveService = require('./googleDriveService');
const authService = require('./authService');
const configManager = require('./configManager');

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

function initializeSocketHandlers(io, serverUrl) {
  io.on("connection", (socket) => {

    socket.on("message", async (message) => {
      let data;
      try {
        data = JSON.parse(message);

        switch (data.type) {
          case "display-file": if (data.data) await openDocument(data.data); break;
          case 'calculate_billing_for_dossier': if (data.data) await handleBillingCalculation(io, data.data); break;
          case 'generate_invoice': if (data.data) await handleInvoiceGeneration(io, data.data); break;
          case "delete-item": if (data.data) await handleDeleteItem(io, data.data); break;
          case "duplicate-file": if (data.data) { const { oldDoc, newDoc } = data.data; await duplicateFileHandler(oldDoc, newDoc, io); } break;
          case "rename-file": if (data.data) { const { docId, oldName, newName } = data.data; await renameFileHandler(docId, oldName, newName, io); } break;
          case "create-folder": if (data.data) { const { folderName, clientData, templateFileName, finalDocumentName } = data.data; await createDocumentForClient(folderName, clientData, templateFileName, finalDocumentName, io); } break;
          case "send_email_to_dossier": if (data.data) { await handleSendEmailToDossier(io, data.data, serverUrl); } break;
          case "open-attachment-locally": if (data.data) { await handleOpenAttachmentLocally(io, data.data, serverUrl); } break;
          case "generate-text-export": if (data.data) { await handleGenerateTextExport(io, data.data, serverUrl); } break;
          case "generate-aide-juridictionnelle": if (data.data) { await handleGenerateAideJuridictionnelle(io, data.data, serverUrl); } break;
        }
      } catch (err) {
        console.error("[Socket.IO] Erreur lors de l'analyse ou du traitement du message :", err);
        if (err.name !== "SyntaxError") { io.emit("document_operation_error", { type: "unknown", message: "Erreur de traitement WebSocket." }); }
      }
    });

    socket.on("process_temp_file", async (data, ack) => {
      try {
        await handleProcessTempFile(socket, data, serverUrl);
        if (typeof ack === "function") ack({ success: true });
      } catch (err) {
        console.error("[Socket Handler] Erreur dans 'process_temp_file':", err.message);
        io.emit("upload_error", { fileName: data?.originalName || "Inconnu", message: err.message || "Erreur lors du traitement du fichier" });
        if (typeof ack === "function") ack({ success: false, message: err.message });
      }
    });

    socket.on("connect_error", (err) => console.error(`[Socket.IO] Erreur de connexion ${socket.id}:`, err.message));
  });
}

/**
 * Gère la suppression d'un élément (document ou sous-dossier) localement et sur le Cloud.
 */
async function handleDeleteItem(io, data) {
  const { item, type, dossierId } = data;
  console.log(`[DELETE] Requête reçue. Type: ${type}, Item ID: ${item?._id}`);

  if (!item || !item._id || !type) {
    io.emit("document_operation_error", { type: `delete-${type || 'item'}`, message: "Données invalides." });
    return;
  }

  const rootPath = configManager.getLocalRootPath();
  if (!rootPath) {
    io.emit("document_operation_error", { type: `delete-${type}`, message: "Chemin local non configuré." });
    return;
  }

  try {
    ensureAuthenticated();

    if (type === 'document') {
      const docId = item._id.toString();

      const remotePath = `Files_Clients/${docId}`;
      const folderId = await googleDriveService.resolvePathToId(remotePath);

      if (folderId && folderId !== 'root') {
        await googleDriveService.deleteFileOrFolder(folderId);
      } else {
        console.warn(`[DELETE] Dossier Cloud non trouvé pour ${remotePath}.`);
      }

      const localDocContainerFolder = path.join(rootPath, docId);
      if (fs.existsSync(localDocContainerFolder)) {
        fs.rmSync(localDocContainerFolder, { recursive: true, force: true });
        console.log(`[DELETE] Dossier local supprimé: ${localDocContainerFolder}`);
      }
      io.emit("document_operation_success", { type: "delete-file", docId });

    } else if (type === 'subfolder') {
      if (!dossierId) throw new Error("ID du dossier parent requis.");

      const subfolderName = item.name;
      const parentDossierId = dossierId.toString();

      const remotePath = `Files_Clients/${parentDossierId}/${subfolderName}`;
      const folderId = await googleDriveService.resolvePathToId(remotePath);

      if (folderId && folderId !== 'root') {
        await googleDriveService.deleteFileOrFolder(folderId);
      } else {
        console.warn(`[DELETE] Sous-dossier Cloud non trouvé pour ${remotePath}.`);
      }

      const localSubfolderPath = path.join(rootPath, parentDossierId, subfolderName);
      if (fs.existsSync(localSubfolderPath)) {
        fs.rmSync(localSubfolderPath, { recursive: true, force: true });
        console.log(`[DELETE] Sous-dossier local supprimé: ${localSubfolderPath}`);
      }
      io.emit("document_operation_success", { type: "delete-subfolder", subfolderId: item._id, dossierId: parentDossierId });

    } else {
      throw new Error(`Type de suppression non supporté: ${type}`);
    }
  } catch (err) {
    const errorMessage = err.message || "Erreur inconnue lors de la suppression.";
    console.error(`[DELETE] ERREUR MAJEURE:`, errorMessage);
    io.emit("document_operation_error", {
      type: `delete-${type}`,
      itemId: item._id,
      dossierId: dossierId,
      message: `Échec de la suppression: ${errorMessage}`
    });
  }
}

/**
 * Ouvre une pièce jointe d'email localement.
 */
async function handleOpenAttachmentLocally(io, data, serverUrl) {
  const { emailId, attachment, token } = data;
  if (!emailId || !attachment || !token) {
    console.error('[Socket] Données invalides pour open-attachment-locally');
    return;
  }

  console.log(`[Socket] Demande d'ouverture locale de la PJ: ${attachment.filename}`);

  try {
    const attachmentUrl = `${serverUrl}/api/mails/email/${emailId}/attachment/${attachment.attachmentId}/content?filename=${encodeURIComponent(attachment.filename)}&mimeType=${encodeURIComponent(attachment.mimeType)}`;

    console.log(`[Socket] Téléchargement de la PJ depuis : ${attachmentUrl}`);
    const response = await axios.get(attachmentUrl, {
      headers: { 'Authorization': `Bearer ${token}` },
      responseType: 'arraybuffer'
    });

    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, attachment.filename);

    console.log(`[Socket] Sauvegarde de la PJ dans : ${tempFilePath}`);
    fs.writeFileSync(tempFilePath, Buffer.from(response.data));

    console.log(`[Socket] Tentative d'ouverture de : ${tempFilePath}`);
    const openResult = await shell.openPath(tempFilePath);

    if (openResult) {
      console.error(`[Socket] Erreur lors de l'ouverture du fichier : ${openResult}`);
      io.emit('document_operation_error', { type: 'open-attachment', message: `Impossible d'ouvrir le fichier : ${openResult}` });
    } else {
      console.log(`[Socket] Fichier ${attachment.filename} ouvert avec succès.`);
    }

  } catch (err) {
    const errorMessage = err.response?.data?.message || err.message || "Erreur inconnue.";
    console.error("[Socket] Erreur lors de l'ouverture locale de la PJ:", errorMessage);
    io.emit("document_operation_error", {
      type: "open-attachment-locally",
      message: `Échec du téléchargement ou de l'ouverture: ${errorMessage}`
    });
  }
}

/**
 * Calcule la facturation pour les documents d'un dossier.
 */
async function handleBillingCalculation(io, { dossierId, documents }) {
  if (!dossierId || !Array.isArray(documents)) {
    console.error('[Socket] Données invalides pour calculate_billing_for_dossier');
    return;
  }
  console.log(`[Socket] Demande de calcul de facturation pour le dossier ${dossierId}`);

  const rootPath = configManager.getLocalRootPath();

  for (const doc of documents) {
    if (!doc._id || !doc.nomDocument || !doc.nomDocument.toLowerCase().endsWith('.docx')) {
      io.emit('billing_info_update', { docId: doc._id, dossierId, error: 'unsupported_format' });
      continue;
    }
    const localPath = rootPath
      ? path.join(rootPath, doc._id.toString(), doc.nomDocument)
      : path.join('C:\\', 'Files_Clients', doc._id.toString(), doc.nomDocument);

    if (!fs.existsSync(localPath)) {
      io.emit('billing_info_update', { docId: doc._id, dossierId, error: 'file_not_found' });
      continue;
    }
    try {
      const result = await mammoth.extractRawText({ path: localPath });
      const charCount = (result.value || '').length;
      io.emit('billing_info_update', { docId: doc._id, dossierId, charCount });
    } catch (err) {
      console.error(`[Socket] Erreur Mammoth pour ${doc.nomDocument}:`, err);
      io.emit('billing_info_update', { docId: doc._id, dossierId, error: 'read_error' });
    }
  }
}

/**
 * Gère la génération/mise à jour d'une facture.
 */
async function handleInvoiceGeneration(io, { dossierId, hourlyRate, vatRate, token }) {
  console.log(`[Socket] Demande de génération/mise à jour de facture pour le dossier ${dossierId}`);
  try {
    const result = await generateInvoiceForDossier(dossierId, hourlyRate, vatRate, token);
    if (!result || !result.updatedDossier) {
      console.log(`[Socket] Aucune nouvelle prestation à facturer pour le dossier ${dossierId}.`);
      io.emit("invoice_generation_noop", { dossierId, message: "Aucune nouvelle prestation à facturer." });
      return;
    }
    const { outputPath, updatedDossier } = result;
    console.log(`[Socket] Facture générée/mise à jour, stockée à : ${outputPath}`);
    io.emit("invoice_generation_success", { dossierId, updatedDossier });
  } catch (err) {
    console.error("[Socket] Erreur lors de la génération/mise à jour de la facture:", err);
    io.emit("invoice_generation_error", { dossierId, message: err.message });
  }
}

/**
 * Recherche le nom d'un contact dans le dossier à partir de son email.
 */
function findContactNameByEmail(dossierObject, emailToFind) {
  if (!dossierObject || !emailToFind) return null;
  const emailToFindLower = emailToFind.toLowerCase().trim();

  const allParties = [
    ...(dossierObject.dossier?.parties?.pour || []),
    ...(dossierObject.dossier?.parties?.contre || []),
  ];
  const allEntities = [...allParties, ...(dossierObject.dossier?.contactsDuDossier || [])];

  for (const entity of allEntities) {
    if (entity.partieData) {
      if (entity.partieData.email?.toLowerCase().trim() === emailToFindLower) {
        const name = entity.nomPartie || `${entity.partieData.prenoms || ''} ${entity.partieData.nom || ''}`;
        return name.trim();
      }
    }
    if (entity.contacts) {
      for (const contact of entity.contacts) {
        if (contact.email?.toLowerCase().trim() === emailToFindLower) {
          const name = `${contact.prenoms || ''} ${contact.nom || ''}`;
          return name.trim();
        }
      }
    }
    if (entity.avocats) {
      for (const avocat of entity.avocats) {
        if (avocat.email?.toLowerCase().trim() === emailToFindLower) {
          const name = `Maître ${avocat.prenomOfficeUser || ''} ${avocat.nomOfficeUser || ''}`;
          return name.trim();
        }
      }
    }
    if (entity.email && entity.email.toLowerCase().trim() === emailToFindLower) {
      const name = `${entity.prenoms || ''} ${entity.nom || ''}`.trim() || entity.raisonSociale || entity.denomination;
      if (name) return name.trim();
    }
  }
  return null;
}

/**
 * Gère l'import d'un email dans un dossier.
 */
async function handleSendEmailToDossier(io, data, serverUrl) {
  const { token, emailId, dossierId, sendEmailText, sendAttachment, attachmentsToProcess } = data;
  console.log(`[Import Email] Début de l'import de l'email ${emailId} vers le dossier ${dossierId}`);

  const rootPath = configManager.getLocalRootPath();
  if (!rootPath) {
    io.emit("document_operation_error", { type: "send-email-to-dossier", docId: dossierId, message: "Chemin local non configuré." });
    return;
  }

  try {
    const config = { headers: { Authorization: `Bearer ${token}` } };

    console.log("[Import Email] Étape 1: Récupération du contenu de l'e-mail et des données du dossier...");
    const emailRes = await axios.get(`${serverUrl}/api/mails/email/${emailId}/full-content`, config);
    const emailDetails = emailRes.data;
    const dossierRes = await axios.get(`${serverUrl}/api/folder/dossier/${dossierId}`, config);
    const dossierObject = dossierRes.data;

    console.log("[Import Email] Étape 2: Création des métadonnées des documents...");

    let subfolderInfo = null;
    const newDocumentsMetadata = [];
    const txtFileName = sendEmailText ? `${(emailDetails.subject || 'Email').replace(/[^a-zA-Z0-9\s\u00C0-\u024F-]/g, '')}.txt` : null;

    let attachmentsToSend = [];
    if (sendAttachment && emailDetails.attachments && emailDetails.attachments.length > 0) {
      if (Array.isArray(attachmentsToProcess) && attachmentsToProcess.length > 0) {
        attachmentsToSend = emailDetails.attachments.filter(att => attachmentsToProcess.includes(att.filename));
        console.log(`[Import Email] ${attachmentsToProcess.length} PJ sélectionnées trouvées:`, attachmentsToSend.map(a => a.filename));
      } else {
        attachmentsToSend = emailDetails.attachments;
        console.log(`[Import Email] Aucun filtre de PJ fourni, envoi de toutes les ${attachmentsToSend.length} PJ.`);
      }
    }

    if (sendEmailText || attachmentsToSend.length > 0) {
      const date = new Date(emailDetails.date).toLocaleDateString('fr-CA');
      const senderEmailHeader = emailDetails.from || '';
      const emailMatch = senderEmailHeader.match(/<(.+?)>/);
      const senderEmail = emailMatch ? emailMatch[1] : senderEmailHeader;

      let subfolderBaseName = findContactNameByEmail(dossierObject, senderEmail);
      if (!subfolderBaseName) {
        console.warn(`[Import Email] Aucun contact correspondant à "${senderEmail}". Utilisation du nom de l'expéditeur.`);
        subfolderBaseName = senderEmailHeader.split('<')[0].trim().replace(/[^a-zA-Z0-9\s\u00C0-\u024F-]/g, '');
      } else {
        console.log(`[Import Email] Contact "${subfolderBaseName}" trouvé pour "${senderEmail}".`);
      }
      subfolderInfo = { name: `${date} - ${subfolderBaseName.trim()}` };
    }

    if (txtFileName) {
      newDocumentsMetadata.push({ name: txtFileName, category: 'email_body', subfolderName: subfolderInfo ? subfolderInfo.name : null });
    }
    attachmentsToSend.forEach(att => {
      newDocumentsMetadata.push({ name: att.filename, category: 'email_attachment', subfolderName: subfolderInfo ? subfolderInfo.name : null });
    });

    const updateRes = await axios.post(`${serverUrl}/api/folder/dossier/${dossierId}/add-document-from-email`, {
      subfolder: subfolderInfo,
      documents: newDocumentsMetadata,
    }, config);
    const updatedDossier = updateRes.data.dossier;
    console.log("[Import Email] Métadonnées créées. Récupération des nouveaux IDs...");

    console.log("[Import Email] Étape 3: Sauvegarde des fichiers physiques (local & Google Drive)...");
    ensureAuthenticated();
    const filesClientsFolderId = await googleDriveService.ensureFolder("Files_Clients", 'root');

    const documentsToCreatePhysically = [];
    if (updatedDossier.dossier && updatedDossier.dossier.documents) {
      for (const docMeta of newDocumentsMetadata) {
        const foundDoc = updatedDossier.dossier.documents.find(
          d => d.nomDocument === docMeta.name && d.subfolderName === docMeta.subfolderName
        );
        if (foundDoc) {
          documentsToCreatePhysically.push(foundDoc);
        }
      }
    }

    console.log(`[Import Email] ${documentsToCreatePhysically.length} document(s) à créer physiquement.`);

    for (const doc of documentsToCreatePhysically) {
      const docId = doc._id.toString();

      const localDocFolder = path.join(rootPath, docId);
      const localFinalSaveDir = path.join(localDocFolder, doc.subfolderName || '');
      ensureFilesClientsFolderExists(localFinalSaveDir);

      let fileContentBuffer;
      if (doc.categorie === 'email_body') {
        const txtContent = `De: ${emailDetails.from}\nDate: ${new Date(emailDetails.date).toLocaleString('fr-FR')}\nObjet: ${emailDetails.subject}\n\n---\n\n${emailDetails.body.replace(/<[^>]*>?/gm, '')}`;
        fileContentBuffer = Buffer.from(txtContent);
      } else if (doc.categorie === 'email_attachment') {
        const originalAttachment = attachmentsToSend.find(att => att.filename === doc.nomDocument);
        if (originalAttachment) {
          fileContentBuffer = Buffer.from(originalAttachment.content, 'base64');
        }
      }

      if (fileContentBuffer) {
        const localFilePath = path.join(localFinalSaveDir, doc.nomDocument);
        fs.writeFileSync(localFilePath, fileContentBuffer);

        const cloudDocRootFolderId = await ensureAndGetCloudFolderId(docId, filesClientsFolderId);
        let cloudUploadFolderId = cloudDocRootFolderId;

        if (doc.subfolderName) {
          cloudUploadFolderId = await ensureAndGetCloudFolderId(doc.subfolderName, cloudDocRootFolderId);
        }

        await uploadFileToCloud(localFilePath, doc.nomDocument, cloudUploadFolderId);
        console.log(`[Import Email] Fichier ${doc.nomDocument} (ID: ${docId}) sauvegardé.`);
      }
    }

    console.log("[Import Email] Processus terminé avec succès.");
    io.emit('document_operation_success', { type: 'send-email-to-dossier', docId: dossierId, dossier: updatedDossier });

  } catch (err) {
    const errorMessage = err.response?.data?.message || err.message || "Erreur inconnue.";
    console.error("[Import Email] Erreur:", errorMessage);
    io.emit("document_operation_error", { type: "send-email-to-dossier", docId: dossierId, message: errorMessage });
  }
}

/**
 * Gère la génération de l'export texte complet d'un dossier.
 */
async function handleGenerateTextExport(io, data, serverUrl) {
  const { dossierId, token } = data;
  console.log(`[TextExport] Début de l'export texte pour le dossier ${dossierId}`);

  if (!dossierId || !token) {
    io.emit("text_export_error", { dossierId, message: "Données manquantes (dossierId, token)." });
    return;
  }

  const rootPath = configManager.getLocalRootPath();
  if (!rootPath) {
    io.emit("text_export_error", { dossierId, message: "Chemin local non configuré." });
    return;
  }

  try {
    const config = { headers: { Authorization: `Bearer ${token}` } };

    // 1. Récupérer le dossier complet depuis l'API
    console.log("[TextExport] Etape 1: Récupération du dossier...");
    const dossierRes = await axios.get(`${serverUrl}/api/folder/dossier/${dossierId}`, config);
    const dossierData = dossierRes.data;

    if (!dossierData || !dossierData.dossier) {
      throw new Error("Données du dossier invalides ou vides.");
    }

    // 2. Générer l'export texte avec callback de progression
    console.log("[TextExport] Etape 2: Extraction du texte des documents...");
    const { txtContent, fileName, documents } = await generateFullTextExport(
      dossierData,
      rootPath,
      (current, total, currentDocName) => {
        io.emit("text_export_progress", { dossierId, current, total, currentDoc: currentDocName });
      }
    );

    // 3. Créer les métadonnées du document TXT dans le dossier
    console.log("[TextExport] Etape 3: Création des métadonnées...");
    const metaRes = await axios.post(
      `${serverUrl}/api/fusion/createDroppedDocumentMetadata`,
      { dossierId, originalFileName: fileName },
      config
    );

    const { newDocMetadata, updatedDossier } = metaRes.data;
    if (!newDocMetadata) {
      throw new Error("Échec de la création des métadonnées du fichier TXT.");
    }

    const newDocId = newDocMetadata._id.toString();

    // 4. Écrire le fichier TXT localement
    console.log("[TextExport] Etape 4: Écriture du fichier TXT...");
    const { ensureFilesClientsFolderExists, markAsRecentlyUploaded } = require("./localFileWatcher");
    const localDocFolder = path.join(rootPath, newDocId);
    ensureFilesClientsFolderExists(localDocFolder);

    const localFilePath = path.join(localDocFolder, fileName);
    fs.writeFileSync(localFilePath, txtContent, "utf-8");
    console.log(`[TextExport] Fichier TXT écrit: ${localFilePath}`);

    // 5. Upload sur Google Drive
    console.log("[TextExport] Etape 5: Upload sur Google Drive...");
    try {
      ensureAuthenticated();
      const { uploadFileToCloud, ensureAndGetCloudFolderId } = require("./localFileWatcher");

      markAsRecentlyUploaded(localFilePath);
      const filesClientsFolderId = await googleDriveService.ensureFolder("Files_Clients", 'root');
      const cloudDocFolderId = await ensureAndGetCloudFolderId(newDocId, filesClientsFolderId);
      await uploadFileToCloud(localFilePath, fileName, cloudDocFolderId);
      markAsRecentlyUploaded(localFilePath);
      console.log("[TextExport] Upload Google Drive terminé.");
    } catch (cloudErr) {
      console.warn("[TextExport] Avertissement: Upload Cloud échoué:", cloudErr.message);
      // On continue même si l'upload Cloud échoue - le fichier local est créé
    }

    // 6. Compter les erreurs d'extraction
    const errorCount = documents.filter(d => d.extractionError).length;

    // 7. Émettre le succès
    console.log(`[TextExport] Export terminé avec succès. ${errorCount} erreur(s) d'extraction.`);
    io.emit("text_export_success", {
      dossierId,
      fileName,
      errorCount,
      updatedDossier,
    });

  } catch (err) {
    const errorMessage = err.response?.data?.message || err.message || "Erreur inconnue.";
    console.error("[TextExport] Erreur:", errorMessage);
    io.emit("text_export_error", { dossierId, message: errorMessage });
  }
}

/**
 * Génère le cerfa d'aide juridictionnelle rempli et l'ajoute aux documents
 * du dossier. Même pipeline que l'export texte : fetch dossier API ->
 * génération -> métadonnées -> écriture locale -> upload cloud -> emit.
 */
async function handleGenerateAideJuridictionnelle(io, data, serverUrl) {
  const { dossierId, token } = data;
  console.log(`[AJ] Début génération aide juridictionnelle pour le dossier ${dossierId}`);

  if (!dossierId || !token) {
    io.emit("aj_generation_error", { dossierId, message: "Données manquantes (dossierId, token)." });
    return;
  }

  const rootPath = configManager.getLocalRootPath();
  if (!rootPath) {
    io.emit("aj_generation_error", { dossierId, message: "Chemin local non configuré." });
    return;
  }

  try {
    const config = { headers: { Authorization: `Bearer ${token}` } };

    // 1. Récupérer le dossier complet (contient .aideJuridictionnelle)
    const dossierRes = await axios.get(`${serverUrl}/api/folder/dossier/${dossierId}`, config);
    const dossierData = dossierRes.data;
    if (!dossierData || !dossierData.dossier) {
      throw new Error("Données du dossier invalides ou vides.");
    }

    // 2. Générer le PDF rempli (overlay carte + snapshot)
    const { pdfBytes, fileName } = await generateAideJuridictionnellePdf(dossierData);

    // 3. Créer les métadonnées du document dans le dossier (route éprouvée)
    const metaRes = await axios.post(
      `${serverUrl}/api/fusion/createDroppedDocumentMetadata`,
      { dossierId, originalFileName: fileName },
      config
    );
    const { newDocMetadata, updatedDossier } = metaRes.data;
    if (!newDocMetadata) {
      throw new Error("Échec de la création des métadonnées du PDF.");
    }
    const newDocId = newDocMetadata._id.toString();

    // 4. Écrire le PDF localement
    const { ensureFilesClientsFolderExists, markAsRecentlyUploaded } = require("./localFileWatcher");
    const localDocFolder = path.join(rootPath, newDocId);
    ensureFilesClientsFolderExists(localDocFolder);
    const localFilePath = path.join(localDocFolder, fileName);
    fs.writeFileSync(localFilePath, pdfBytes);
    console.log(`[AJ] PDF écrit: ${localFilePath}`);

    // 5. Upload cloud (non bloquant)
    try {
      ensureAuthenticated();
      const { uploadFileToCloud, ensureAndGetCloudFolderId } = require("./localFileWatcher");
      markAsRecentlyUploaded(localFilePath);
      const filesClientsFolderId = await googleDriveService.ensureFolder("Files_Clients", 'root');
      const cloudDocFolderId = await ensureAndGetCloudFolderId(newDocId, filesClientsFolderId);
      await uploadFileToCloud(localFilePath, fileName, cloudDocFolderId);
      markAsRecentlyUploaded(localFilePath);
    } catch (cloudErr) {
      console.warn("[AJ] Avertissement: Upload Cloud échoué:", cloudErr.message);
    }

    // Ouverture automatique du PDF dès sa création (non bloquant)
    try {
      await openDocument(newDocMetadata);
    } catch (openErr) {
      console.warn("[AJ] Ouverture auto échouée:", openErr && openErr.message);
    }

    io.emit("aj_generation_success", { dossierId, fileName, updatedDossier });
    console.log(`[AJ] Génération terminée: ${fileName}`);
  } catch (err) {
    const errorMessage = err.response?.data?.message || err.message || "Erreur inconnue.";
    console.error("[AJ] Erreur:", errorMessage);
    io.emit("aj_generation_error", { dossierId, message: errorMessage });
  }
}

module.exports = { initializeSocketHandlers };
