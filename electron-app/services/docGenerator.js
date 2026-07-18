// electron-app/services/docGenerator.js

const fs = require("fs");
const path = require("path");
const { shell } = require("electron");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

// Imports des utilitaires cloud refactorisés
const { ensureAndGetCloudFolderId, uploadFileToCloud, markAsRecentlyUploaded } = require("./localFileWatcher");

const {
  downloadFileFromCloud,
  buildSimpleLetterVariables,
  formatDateInFrench,
  ensureFilesClientsFolderExists,
} = require("./docUtils");

// Helper source-agnostique (Google Drive / OneDrive)
const { requireCloudCtx } = require('./cloudContext');
const configManager = require('./configManager');

// NOUVEAU SERVICE JS (Remplace Python)
const { applyBoldFormatting } = require('./docxModifier');

// Service d'injection en-tête / signature dans les documents (OOXML via PizZip)
const { injectHeaderAndFooter } = require('./docxHeaderFooterInjector');

const { buildPresentationParties } = require("./presentationPartiesBuilder");

// ========================================================================
// Injection image de signature dans le body du document
// ========================================================================

const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PIC_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WPML_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/**
 * Decode une image Base64 et determine son extension
 */
function decodeBase64Image(base64String) {
  const matches = base64String.match(/^data:(image\/(\w+));base64,(.+)$/);
  if (matches) {
    return {
      buffer: Buffer.from(matches[3], 'base64'),
      extension: matches[2] === 'jpeg' ? 'jpg' : matches[2],
      mimeType: matches[1],
    };
  }
  return {
    buffer: Buffer.from(base64String, 'base64'),
    extension: 'png',
    mimeType: 'image/png',
  };
}

/**
 * Lit les dimensions (width, height) depuis le header binaire d'une image (PNG ou JPEG)
 */
function getImageDimensions(buffer) {
  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  // JPEG
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xFF) break;
      const marker = buffer[offset + 1];
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  }
  return null;
}

/**
 * Calcule les dimensions de l'image en EMU, respectant les limites max
 */
function calculateImageDimensions(imageBuffer, maxWidthCm, maxHeightCm) {
  const dims = getImageDimensions(imageBuffer);
  const maxWidthEmu = maxWidthCm * 360000;
  const maxHeightEmu = maxHeightCm * 360000;

  if (dims) {
    const ratio = dims.width / dims.height;
    let widthEmu = dims.width * 9525;
    let heightEmu = dims.height * 9525;
    if (widthEmu > maxWidthEmu) { widthEmu = maxWidthEmu; heightEmu = Math.round(widthEmu / ratio); }
    if (heightEmu > maxHeightEmu) { heightEmu = maxHeightEmu; widthEmu = Math.round(heightEmu * ratio); }
    return { widthEmu, heightEmu };
  }
  // Fallback 3cm x 1cm
  return { widthEmu: 3 * 360000, heightEmu: 1 * 360000 };
}

/**
 * Injecte l'image de signature dans le BODY du document (pas en footer).
 * Ajoute un paragraphe <w:p> avec <w:drawing> aligne a droite,
 * insere juste avant le </w:body> (apres le dernier paragraphe du body).
 *
 * @param {string} docxPath - Chemin vers le fichier .docx
 * @param {string} signatureImageBase64 - Image en base64 (avec ou sans data URI prefix)
 */
function injectSignatureImageInBody(docxPath, signatureImageBase64) {
  if (!signatureImageBase64) return;

  const content = fs.readFileSync(docxPath);
  const zip = new PizZip(content);

  // 1. Decoder l'image
  const img = decodeBase64Image(signatureImageBase64);
  const imageFileName = `signature_body.${img.extension}`;

  // 2. Ajouter l'image dans word/media/
  zip.file(`word/media/${imageFileName}`, img.buffer);

  // 3. Ajouter le content type pour l'extension si absent
  const ctFile = zip.file('[Content_Types].xml');
  if (ctFile) {
    let ctXml = ctFile.asText();
    const extLower = img.extension.toLowerCase();
    if (!ctXml.includes(`Extension="${extLower}"`)) {
      ctXml = ctXml.replace('</Types>', `  <Default Extension="${extLower}" ContentType="${img.mimeType}"/>\n</Types>`);
      zip.file('[Content_Types].xml', ctXml);
    }
  }

  // 4. Ajouter une relationship dans document.xml.rels
  const relsPath = 'word/_rels/document.xml.rels';
  const relsFile = zip.file(relsPath);
  let imageRelId = 'rIdSigBody1';

  if (relsFile) {
    let relsXml = relsFile.asText();
    // Trouver le max rId existant pour eviter les collisions
    const matches = relsXml.match(/Id="rId(\d+)"/g);
    let maxId = 0;
    if (matches) {
      for (const m of matches) {
        const num = parseInt(m.match(/rId(\d+)/)[1], 10);
        if (num > maxId) maxId = num;
      }
    }
    imageRelId = `rId${maxId + 1}`;

    // Verifier qu'on n'a pas deja une relation vers cette image
    if (!relsXml.includes(`Target="media/${imageFileName}"`)) {
      const newRel = `  <Relationship Id="${imageRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imageFileName}"/>\n`;
      relsXml = relsXml.replace('</Relationships>', newRel + '</Relationships>');
      zip.file(relsPath, relsXml);
    }
  }

  // 5. Calculer les dimensions
  const imageDims = calculateImageDimensions(img.buffer, 4, 2);

  // 6. Construire le paragraphe XML avec l'image
  const signatureParagraphXml = `<w:p>
  <w:pPr><w:jc w:val="right"/></w:pPr>
  <w:r>
    <w:rPr/>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="${WP_NS}" xmlns:a="${A_NS}" xmlns:pic="${PIC_NS}" xmlns:r="${R_NS}">
        <wp:extent cx="${imageDims.widthEmu}" cy="${imageDims.heightEmu}"/>
        <wp:docPr id="99" name="Signature Body Image"/>
        <a:graphic>
          <a:graphicData uri="${PIC_NS}">
            <pic:pic>
              <pic:nvPicPr>
                <pic:cNvPr id="99" name="${imageFileName}"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="${imageRelId}"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="${imageDims.widthEmu}" cy="${imageDims.heightEmu}"/>
                </a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>`;

  // 7. Inserer le paragraphe avant </w:body> dans document.xml
  //    IMPORTANT : on insere AVANT le <w:sectPr> (qui est le dernier element de w:body)
  //    pour que le paragraphe apparaisse comme contenu du document
  const docFile = zip.file('word/document.xml');
  if (docFile) {
    let xml = docFile.asText();

    // S'assurer que les namespaces sont declares sur l'element racine
    if (!xml.match(/<w:document\b[^>]*xmlns:wp=/)) {
      xml = xml.replace(/<w:document\b/, `<w:document xmlns:wp="${WP_NS}"`);
    }
    if (!xml.match(/<w:document\b[^>]*xmlns:a=/)) {
      xml = xml.replace(/<w:document\b/, `<w:document xmlns:a="${A_NS}"`);
    }
    if (!xml.match(/<w:document\b[^>]*xmlns:pic=/)) {
      xml = xml.replace(/<w:document\b/, `<w:document xmlns:pic="${PIC_NS}"`);
    }
    if (!xml.match(/<w:document\b[^>]*xmlns:r=/)) {
      xml = xml.replace(/<w:document\b/, `<w:document xmlns:r="${R_NS}"`);
    }

    // Inserer avant le dernier <w:sectPr (le sectPr du body, pas de section break)
    const lastSectPrIdx = xml.lastIndexOf('<w:sectPr');
    if (lastSectPrIdx !== -1) {
      xml = xml.substring(0, lastSectPrIdx) + signatureParagraphXml + xml.substring(lastSectPrIdx);
    } else {
      // Fallback : inserer avant </w:body>
      xml = xml.replace('</w:body>', signatureParagraphXml + '</w:body>');
    }

    zip.file('word/document.xml', xml);
  }

  // 8. Sauvegarder
  const buffer = zip.generate({ type: 'nodebuffer' });
  fs.writeFileSync(docxPath, buffer);
  console.log(`[injectSignatureImageInBody] Image de signature injectee dans le body de : ${docxPath}`);
}

/**
 * Crée un document pour un client (DOCUMENT FINAL basé sur TEMPLATE)
 */
async function createDocumentForClient(docId, clientData, templateFileNameInput, finalDocumentNameInput, io, options = {}) {
  let templateFileName = templateFileNameInput;
  if (templateFileName && !/\.[^/.]+$/.test(templateFileName)) {
    templateFileName += '.docx';
  }

  let finalDocumentName = finalDocumentNameInput;
  const templateExt = path.extname(templateFileName);
  const defaultExt = '.docx';
  const finalExt = path.extname(finalDocumentName);

  if (!finalExt) {
    finalDocumentName += (templateExt || defaultExt);
  }

  console.log(`[createDocument] Début - ID: ${docId}, Template: ${templateFileName}, Final: ${finalDocumentName}`);

  let downloadedTemplatePath = null;
  let localFinalDocPath = null;
  let finalDocMetadata = {
    _id: docId,
    nomDocument: finalDocumentName,
    categorie: clientData?.categorie || 'unknown',
  };

  // >>> CHANGEMENT : Utilisation du chemin dynamique
  const rootPath = configManager.getLocalRootPath();
  if (!rootPath) {
      throw new Error("Le dossier de stockage local n'est pas configuré.");
  }
  const localOutputFolder = path.join(rootPath, docId.toString());

  try {
    // 0. Récupérer le profil utilisateur en amont (pour les variables + header/footer)
    let userProfile = null;
    try {
      const userId = clientData?.user?._id || clientData?.dossier?.userId;
      // rc36 : la route /user/profile/:userId est désormais protégée par
      // middleware auth + check d'ownership strict. On envoie le JWT du user
      // courant (transmis via clientData.jwtToken depuis le renderer).
      const jwtToken = clientData?.jwtToken;
      if (userId) {
        console.log(`[createDocument] Récupération du profil utilisateur (${userId})...`);
        const axios = require('axios');
        const headers = jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {};
        const profileRes = await axios.get(
          `http://localhost:${process.env.PORT || 5000}/api/auth/user/profile/${userId}`,
          { headers }
        );
        userProfile = profileRes.data;
        console.log(`[createDocument] Profil récupéré: ${userProfile.firstName} ${userProfile.lastName}, ville=${userProfile.city}`);
      }
    } catch (profileErr) {
      console.warn(`[createDocument] Profil non récupéré (non bloquant):`, profileErr.message);
    }

    // 1. Préparation des variables
    let variablesDoc = {};
    const recipients = clientData?.recipients || [];
    const dossier = clientData?.dossier;

    // Helper pour construire les variables avocat à partir du profil ou du dossier
    const { getBarreauName, buildBarreauComplet } = require('../data/barreaux');
    const _buildAvocatVars = () => {
      let nomAvocat, villeCabinet;
      if (userProfile && (userProfile.firstName || userProfile.lastName)) {
        nomAvocat = `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim();
        villeCabinet = userProfile.city || '';
      } else {
        const avocatResp = dossier?.dossier?.avocatsResponsables?.[0];
        villeCabinet = avocatResp?.city || '';
        nomAvocat = `${avocatResp?.prenomOfficeUser || ''} ${avocatResp?.nomOfficeUser || ''}`.trim();
      }
      const barreauNom = getBarreauName(villeCabinet, userProfile?.barreau);
      const barreauComplet = buildBarreauComplet(barreauNom);
      return { nomAvocat, villeCabinet, barreauComplet };
    };

    if (!dossier) {
        variablesDoc = { dateDuJour: formatDateInFrench(new Date()) };
    } else if (recipients.length === 0) {
        const presentationPartiesString = buildPresentationParties(dossier);
        const avVars = _buildAvocatVars();
        variablesDoc = { presentationParties: presentationPartiesString, referenceDossier: dossier?.reference || "", nomDossier: dossier?.dossier?.dossier?.nom || "", dateDuJour: formatDateInFrench(new Date()), ...avVars };
    } else if (recipients.length === 1) {
        const r = recipients[0]?.fullObject || recipients[0] || {};
        const letterVars = buildSimpleLetterVariables(dossier, r, userProfile);
        variablesDoc = { ...letterVars };
    } else {
        const presentationPartiesString = buildPresentationParties(dossier);
        const avVars = _buildAvocatVars();
        variablesDoc = { presentationParties: presentationPartiesString, referenceDossier: dossier?.reference || "", nomDossier: dossier?.dossier?.dossier?.nom || "", dateDuJour: formatDateInFrench(new Date()), ...avVars };
    }

    // Debug: Log toutes les variables du template avant le rendu
    console.log(`[createDocument] Variables du template:`, JSON.stringify(variablesDoc, null, 2));
    console.log(`[createDocument] Structure dossier: reference=${dossier?.reference}, nom=${dossier?.dossier?.dossier?.nom}, avocatsResp=${dossier?.dossier?.avocatsResponsables?.length}, userProfile=${!!userProfile}`);

    // 2. Authentification cloud (Google ou Microsoft) et préparation locale
    const ctx = requireCloudCtx();
    console.log(`[createDocument] Source cloud active : ${ctx.source}`);
    ensureFilesClientsFolderExists(localOutputFolder);

    // 3. Téléchargement du template depuis le Cloud
    // >>> CORRECTION BUG ESPACES : Suppression des espaces parasites dans les template literals
    const tempTemplateFileName = `template-${Date.now()}${path.extname(templateFileName) || '.docx'}`;
    const remoteTemplatePath = `Files_Clients/Templates/${templateFileName}`;

    downloadedTemplatePath = await downloadFileFromCloud(remoteTemplatePath, localOutputFolder, tempTemplateFileName);

    if (!downloadedTemplatePath) throw new Error("Échec du téléchargement du template.");

    // 4. Vérification du template téléchargé avant ouverture
    if (!fs.existsSync(downloadedTemplatePath)) {
      throw new Error(`Le fichier template n'existe pas après téléchargement : ${downloadedTemplatePath}`);
    }
    const templateStats = fs.statSync(downloadedTemplatePath);
    console.log(`[createDocument] Template téléchargé : ${downloadedTemplatePath} (${templateStats.size} octets)`);
    if (templateStats.size === 0) {
      throw new Error(`Le template téléchargé est vide (0 octets). Vérifiez le fichier sur Google Drive : ${remoteTemplatePath}`);
    }

    // 5. Génération du document
    const templateContent = fs.readFileSync(downloadedTemplatePath);
    // Vérification signature ZIP (les 2 premiers octets d'un ZIP valide sont "PK" = 0x50 0x4B)
    if (templateContent.length < 4 || templateContent[0] !== 0x50 || templateContent[1] !== 0x4B) {
      // Afficher les premiers octets pour diagnostic
      const preview = templateContent.slice(0, 100).toString('utf8');
      console.error(`[createDocument] Le fichier n'est PAS un ZIP/DOCX valide. Début du contenu : "${preview}"`);
      throw new Error(`Le template "${templateFileName}" n'est pas un fichier DOCX valide. Il est peut-être un Google Doc natif non exportable ou corrompu.`);
    }
    const zip = new PizZip(templateContent);
    const docx = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{", end: "}" },
      nullGetter: (part) => {
        if (!part.module) {
          console.warn(`[Docxtemplater] Tag non résolu : {${part.value}}`);
        }
        return '';
      }
    });
    docx.setData(variablesDoc);
    docx.render();

    const finalDocBuffer = docx.getZip().generate({ type: "nodebuffer" });
    localFinalDocPath = path.join(localOutputFolder, finalDocumentName);
    fs.writeFileSync(localFinalDocPath, finalDocBuffer);

    // >>> CORRECTION DOUBLE-UPLOAD : Marquer le fichier comme récemment uploadé par la logique métier
    markAsRecentlyUploaded(localFinalDocPath);

    // 5. Nettoyage du template temporaire (inchangé)
    if (downloadedTemplatePath && fs.existsSync(downloadedTemplatePath)) {
      try {
        fs.unlinkSync(downloadedTemplatePath);
      } catch (unlinkErr) {
        console.warn(`[createDocument] Impossible de supprimer template temporaire: `, unlinkErr.message);
      }
    }

    // 6a. Composer header/footer a partir du profil utilisateur (deja recupere en amont)
    let composedHeader = '';
    let signatureText = '';
    let signatureImageBase64 = '';
    var headerFontFamily = 'Calibri';
    var headerFontSize = 10;
    var headerFontWeight = 'normal';
    var headerTextAlign = 'center';

    if (userProfile) {
      const profile = userProfile;

      // Utiliser l'en-tête personnalisé sauvegardé, sinon composer automatiquement
      if (profile.header && profile.header.trim() !== '') {
        composedHeader = profile.header;
      } else {
        const headerLines = [];
        const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
        if (fullName) headerLines.push(fullName);
        if (profile.barreau || profile.city) {
          const { getBarreauName, buildBarreauComplet } = require('../data/barreaux');
          const barreauNom = getBarreauName(profile.city, profile.barreau);
          headerLines.push(buildBarreauComplet(barreauNom));
        }
        if (profile.address) headerLines.push(profile.address);
        if (profile.phone) headerLines.push(`Tél: ${profile.phone}`);
        composedHeader = headerLines.join('\n');
      }

      // Récupérer signature
      signatureText = profile.signature || '';
      signatureImageBase64 = profile.signatureImage || '';

      // Récupérer les préférences de police pour l'en-tête
      headerFontFamily = profile.headerFontFamily || 'Calibri';
      headerFontSize = profile.headerFontSize || 10;
      headerFontWeight = profile.headerFontWeight || 'normal';
      headerTextAlign = profile.headerTextAlign || 'center';

      console.log(`[createDocument] Profil utilisé: en-tête=${!!composedHeader}, signature=${!!signatureText}, image=${!!signatureImageBase64}, police=${headerFontFamily}, taille=${headerFontSize}`);
    }

    // 6b. Post-traitement gras (JS Native)
    console.log(`[createDocument] Application du formatage gras (JS Native)...`);
    applyBoldFormatting(localFinalDocPath);

    // 7. Injection en-tête + signature (OOXML local via PizZip)
    //    Manipulation directe du ZIP .docx : ajout de header1.xml, footer1.xml,
    //    relationships, content types et sectPr. Pas de round-trip réseau.
    const hasProfileContent = composedHeader || signatureText || signatureImageBase64;
    if (hasProfileContent) {
      try {
        console.log(`[createDocument] Injection en-tête/signature (OOXML PizZip)...`);
        injectHeaderAndFooter(localFinalDocPath, {
          headerText: composedHeader,
          headerFontFamily: headerFontFamily || 'Calibri',
          headerFontSize: headerFontSize || 10,
          headerFontWeight: headerFontWeight || 'normal',
          headerTextAlign: headerTextAlign || 'center',
          signatureText: '',
          signatureImageBase64: '',  // Signature gardee dans le body du document, pas en footer
        });
        console.log(`[createDocument] Injection en-tête/signature réussie.`);
      } catch (injectionError) {
        console.error(`[createDocument] Erreur injection en-tête/signature:`, injectionError.message);
        // Non-bloquant : le document reste utilisable sans en-tête/signature
      }
    }

    // 7b. Injection image de signature dans le BODY du document (pas en footer)
    //     L'image est ajoutee juste avant le sectPr, donc apres le dernier paragraphe
    //     (texte de signature de blocSignatureAvocat)
    if (signatureImageBase64) {
      try {
        console.log(`[createDocument] Injection image signature dans le body...`);
        injectSignatureImageInBody(localFinalDocPath, signatureImageBase64);
        console.log(`[createDocument] Image signature injectée dans le body.`);
      } catch (sigErr) {
        console.error(`[createDocument] Erreur injection image signature:`, sigErr.message);
        // Non-bloquant : le document reste utilisable sans l'image de signature
      }
    }

    // 8. Upload du document final vers le Cloud
    console.log(`[createDocument] Upload du document vers le Cloud...`);
    const filesClientsId = await ctx.service.ensureFolder("Files_Clients", 'root');
    const cloudTargetFolderId = await ensureAndGetCloudFolderId(docId.toString(), filesClientsId);
    if (!cloudTargetFolderId) throw new Error(`Impossible d'obtenir/créer le dossier Cloud cible: ${docId}`);
    await uploadFileToCloud(localFinalDocPath, finalDocumentName, cloudTargetFolderId);
    console.log(`[createDocument] Upload Cloud terminé pour ${finalDocumentName}.`);

    markAsRecentlyUploaded(localFinalDocPath);

    // 9. L'ouverture est désormais pilotée par le choix de l'utilisateur.
    // Les anciens appels gardent le comportement historique par défaut.
    if (options.openAfterCreation !== false) {
      await shell.openPath(localFinalDocPath).catch(err => {
        console.error(`[createDocument] Erreur lors de l'ouverture auto:`, err);
      });
    }

    if (io && typeof io.emit === 'function') {
      io.emit('document_operation_success', {
        type: 'create-folder',
        docId: docId,
        doc: finalDocMetadata
      });
    }

    return finalDocMetadata;

  } catch (error) {
    console.error(`[createDocument] ERREUR MAJEURE:`, error.message || error);
    if (downloadedTemplatePath && fs.existsSync(downloadedTemplatePath)) { try { fs.unlinkSync(downloadedTemplatePath); } catch (e) { } }
    if (io && typeof io.emit === 'function') {
      io.emit('document_operation_error', {
        type: 'create-folder',
        docId: docId,
        message: `Échec création document: ${error.message || 'Erreur inconnue'}`
      });
    }
    throw error;
  }
}

/**
 * Ouvre un document existant. Le télécharge depuis le Cloud si besoin.
 *
 * @returns {Promise<{ docId: string, localFilePath: string }|undefined>}
 *   Le path local effectif si l'ouverture a réussi (utilisé par le caller pour
 *   démarrer la surveillance de fermeture), sinon undefined.
 */
async function openDocument(doc) {
  console.log(`[openDocument] Tentative d'ouverture : ID=${doc?._id}, Nom=${doc?.nomDocument}`);
  if (!doc?._id || !doc.nomDocument) {
    return;
  }

  const docId = doc._id.toString();

  // >>> CHANGEMENT : Utilisation du chemin dynamique
  const rootPath = configManager.getLocalRootPath();
  if (!rootPath) {
    console.error("[openDocument] Chemin local non configuré.");
    return;
  }
  const clientBaseFolder = path.join(rootPath, docId);

  let fileName = doc.nomDocument;
  const localFinalPath = path.join(clientBaseFolder, doc.subfolderName || '', fileName);
  const remotePath = `Files_Clients/${docId}${doc.subfolderName ? `/${doc.subfolderName}` : ''}/${fileName}`;
  const localDownloadDestination = path.join(clientBaseFolder, doc.subfolderName || '');

  try {
    ensureFilesClientsFolderExists(clientBaseFolder);

    if (!fs.existsSync(localFinalPath)) {
      console.warn(`[openDocument] ${localFinalPath} absent. Téléchargement depuis le Cloud (${remotePath})...`);
      requireCloudCtx(); // Garantit qu'une auth cloud (Google ou Microsoft) est disponible
      await downloadFileFromCloud(remotePath, localDownloadDestination);

      // >>> CORRECTION DOUBLE-UPLOAD : Marquer le fichier téléchargé pour éviter que le watcher le re-uploade
      if (fs.existsSync(localFinalPath)) {
        markAsRecentlyUploaded(localFinalPath);
      }

      if (!fs.existsSync(localFinalPath)) throw new Error('Téléchargement Cloud échoué, le fichier est introuvable.');
    }

    const res = await shell.openPath(localFinalPath);
    if (res) {
      console.error('[openDocument] Erreur ouverture :', res);
      return undefined;
    }
    console.log(`[openDocument] ${localFinalPath} ouvert.`);
    return { docId, localFilePath: localFinalPath };

  } catch (err) {
    console.error('[openDocument] Erreur :', err);
    throw err;
  }
}

module.exports = {
  createDocumentForClient,
  openDocument,
};
