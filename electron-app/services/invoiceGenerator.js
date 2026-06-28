// electron-app/services/invoiceGenerator.js
const axios = require('axios');
const crypto = require('crypto');


// Services refactorisés
const { fetchDossierAndEvents, extractBillableItems } = require("./invoiceDataHelper");
const { calculateEventLines, calculateDocumentLines, calculateTotals } = require("./invoiceCalculator");
const { buildInvoiceJson, generateDocx } = require("./invoiceDocxGenerator");
const { injectHeaderAndFooter } = require("./docxHeaderFooterInjector");

// Dépendances de services existants (refactorisés)

const { ensureAndGetCloudFolderId, uploadFileToCloud } = require("./localFileWatcher"); // Renommés

// Import Google Drive Service et Auth
const googleDriveService = require('./googleDriveService');
const authService = require('./authService');

const SERVER_URL = process.env.SERVER_URL || "http://localhost:5000";

async function fetchUserProfile(token) {
  try {
    const config = { headers: { Authorization: `Bearer ${token}` } };
    const res = await axios.get(`${SERVER_URL}/api/auth/user`, config);
    return res.data || null;
  } catch (err) {
    console.warn('[InvoiceGenerator] Profil utilisateur non récupéré (non bloquant):', err.message);
    return null;
  }
}

function composeHeaderFromProfile(profile) {
  if (profile.header && profile.header.trim() !== '') {
    return profile.header;
  }
  const { getBarreauName, buildBarreauComplet } = require('../data/barreaux');
  const lines = [];
  const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
  if (fullName) lines.push(fullName);
  if (profile.barreau || profile.city) {
    const barreauNom = getBarreauName(profile.city, profile.barreau);
    lines.push(buildBarreauComplet(barreauNom));
  }
  if (profile.address) lines.push(profile.address);
  if (profile.phone) lines.push(`Tél: ${profile.phone}`);
  return lines.join('\n');
}

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
 * Uploade le fichier de facture généré sur le Cloud (Google Drive).
 */
async function uploadToCloudStorage(dossierId, outputPath, finalFileName) {
  ensureAuthenticated();

  // Obtenir l'ID du dossier parent "Files_Clients"
  const filesClientsId = await googleDriveService.ensureFolder("Files_Clients", 'root');
  // S'assurer que le dossier spécifique (dossierId) existe sous "Files_Clients"
  // Note: On assume que dossierId est utilisé comme ID du dossier de stockage pour la facture.
  const cloudFolderId = await ensureAndGetCloudFolderId(dossierId.toString(), filesClientsId);

  await uploadFileToCloud(outputPath, finalFileName, cloudFolderId);
}

// ... (saveInvoiceToServer reste inchangé) ...
async function saveInvoiceToServer(dossierId, invoiceMetadata, token) {
  const config = { headers: { Authorization: `Bearer ${token}` } };
  const saveResponse = await axios.post(
    `${SERVER_URL}/api/folder/dossier/${dossierId}/upsert-invoice`,
    { invoiceData: invoiceMetadata },
    config
  );
  return saveResponse.data.dossier;
}

/**
 * Fonction principale qui orchestre la génération de facture.
 */
async function generateInvoiceForDossier(dossierId, hourlyRate, vatRate, token) {
  // ... (Étapes 1 à 7 : Récupération, Calcul, Génération DOCX - Inchangées) ...
  if (!dossierId || !token) throw new Error("ID de dossier ou token manquant.");
  if (hourlyRate === undefined || vatRate === undefined) throw new Error("Taux horaire ou TVA non défini.");

  // 1. Récupérer les données
  const { dossier, allEvents } = await fetchDossierAndEvents(dossierId, token);

  // 1b. Récupérer le profil utilisateur (pour cabinet dynamique + header/signature)
  const userProfile = await fetchUserProfile(token);

  // 2. Extraire les items facturables
  const { billableEvents, billableDocuments, client } = extractBillableItems(dossier, allEvents);

  // 3. Calculer les lignes de facturation
  const eventLines = calculateEventLines(billableEvents, hourlyRate);
  const documentLines = await calculateDocumentLines(billableDocuments, hourlyRate);
  const allBillableLines = [...eventLines, ...documentLines];

  if (allBillableLines.length === 0) {
    console.log(`[InvoiceGenerator] Aucune prestation facturable. Aucune action.`);
    return null;
  }

  // 4. Chercher une facture active ou en préparer une nouvelle
  let activeInvoice = (dossier.factures || []).find(inv => inv.status !== 'archived');
  if (!activeInvoice) {
    activeInvoice = { _id: crypto.randomUUID(), payments: [] };
  }

  // 5. Calculer les totaux
  const totals = calculateTotals(allBillableLines, vatRate);

  // 6. Préparer le JSON pour le template (avec infos cabinet depuis le profil)
  const invoiceJson = buildInvoiceJson(dossier, client, allBillableLines, totals, vatRate, activeInvoice, userProfile);

  // 7. Générer le fichier .docx
  const { outputPath, finalFileName } = generateDocx(invoiceJson, dossierId);

  // 7b. Injecter en-tête (texte profil) + signature (image) dans le .docx
  if (userProfile) {
    try {
      const headerText = composeHeaderFromProfile(userProfile);
      injectHeaderAndFooter(outputPath, {
        headerText,
        headerFontFamily: userProfile.headerFontFamily || 'Calibri',
        headerFontSize: userProfile.headerFontSize || 10,
        headerFontWeight: userProfile.headerFontWeight || 'normal',
        headerTextAlign: userProfile.headerTextAlign || 'center',
        signatureText: '',
        signatureImageBase64: userProfile.signatureImage || '',
      });
    } catch (injectErr) {
      console.error('[InvoiceGenerator] Erreur injection en-tête/signature (non bloquant):', injectErr.message);
    }
  }

  // 8. Uploader sur le Cloud (Google Drive)
  await uploadToCloudStorage(dossierId, outputPath, finalFileName);

  // 9. Préparer les métadonnées pour la base de données (inchangé)
  const invoiceMetadataForDB = {
    _id: activeInvoice._id,
    nomDocument: finalFileName,
    totalTTC: totals.totalTTC,
    dateCreation: activeInvoice.dateCreation || new Date(),
    status: 'pending',
    payments: activeInvoice.payments || [],
    billedItems: allBillableLines,
  };

  // 10. Sauvegarder sur le serveur (inchangé)
  const updatedDossier = await saveInvoiceToServer(dossierId, invoiceMetadataForDB, token);

  return { outputPath, newInvoice: invoiceMetadataForDB, updatedDossier };
}

module.exports = { generateInvoiceForDossier };