const express = require("express");
const multer = require("multer");
const { google } = require("googleapis");
const MailComposer = require("nodemailer/lib/mail-composer");
const mime = require("mime-types");
const fs = require("fs");
const path = require("path");
const stream = require("stream");
const axios = require("axios");

// >>> CORRECTION AUTH : Import de authService et configManager pour unifier l'authentification
const authService = require('../services/authService');
const configManager = require('../services/configManager');

const router = express.Router();

// >>> CORRECTION AUTH : Suppression de l'ancien oauth2Client qui utilisait des variables d'environnement inexistantes
// (process.env.GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL ne sont pas définies dans electron-app/.env)
// On utilise désormais authService.getGoogleAuthClient() qui partage l'authentification avec le reste de l'app.

const DRIVE_UPLOAD_THRESHOLD = 20 * 1024 * 1024; // 20 Mo

/**
 * >>> CORRECTION AUTH : Réécriture complète de la fonction d'authentification.
 * Utilise désormais authService (le même système que le reste de l'app Electron)
 * au lieu d'un oauth2Client séparé avec des variables d'environnement manquantes.
 *
 * @param {string} kheopsToken - Le token JWT Kheops (utilisé comme fallback si authService n'est pas prêt).
 * @returns {Object} Le client Google OAuth2 authentifié.
 */
async function getAuthenticatedGoogleClient(kheopsToken) {
  // Stratégie 1 : Utiliser le client Google déjà authentifié par authService (méthode principale)
  const existingClient = authService.getGoogleAuthClient();
  if (existingClient) {
    console.log("[MAIL AUTH] Client Google obtenu via authService (authentification Electron unifiée).");
    return existingClient;
  }

  // Stratégie 2 (Fallback) : Si authService n'a pas de client, tenter d'initialiser l'auth Google
  console.warn("[MAIL AUTH] Aucun client Google actif dans authService. Tentative d'initialisation...");
  try {
    const client = await authService.initGoogleAuth();
    if (client) {
      console.log("[MAIL AUTH] Client Google initialisé avec succès via authService.");
      return client;
    }
  } catch (initErr) {
    console.error("[MAIL AUTH] Échec de l'initialisation Google via authService:", initErr.message);
  }

  // Si rien ne fonctionne, on lance une erreur
  throw new Error("AUTH_REQUIRED: Authentification Google requise. Veuillez vous connecter à Google depuis l'application.");
}

async function uploadFileToDrive(drive, filePath, fileName) {
  try {
    console.log(`[DRIVE] Début de l'upload de "${fileName}" depuis "${filePath}"...`);
    const file = await drive.files.create({
      resource: { name: fileName },
      media: {
        mimeType: mime.lookup(filePath) || 'application/octet-stream',
        body: fs.createReadStream(filePath),
      },
      fields: 'id, webViewLink',
    });
    console.log(`[DRIVE] Fichier "${fileName}" uploadé avec succès. ID: ${file.data.id}`);
    
    console.log(`[DRIVE] Création des permissions de partage pour "${fileName}"...`);
    await drive.permissions.create({
      fileId: file.data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    });
    console.log(`[DRIVE] Permissions créées avec succès pour "${fileName}".`);
    
    return { fileName, link: file.data.webViewLink };
  } catch (err) {
    console.error(`[DRIVE] ERREUR lors de l'upload de "${fileName}":`, err);
    throw new Error(`Échec de l'upload de "${fileName}" sur Google Drive.`);
  }
}

/**
 * Trouve le premier fichier réel dans un répertoire de document ou ses sous-dossiers.
 * @param {string} baseDir - Le répertoire de base du document (ex: C:\Files_Clients\docId).
 * @returns {{path: string, name: string, size: number}|null} - L'objet du fichier trouvé ou null.
 */
function findFirstFileRecursive(baseDir) {
    console.log(`[findFirstFileRecursive] Recherche de fichier dans: ${baseDir}`);
    const entries = fs.readdirSync(baseDir);
    for (const entry of entries) {
        if (entry.startsWith('.')) {
            console.log(`[findFirstFileRecursive] Ignoré (fichier caché): ${entry}`);
            continue;
        }
        const fullPath = path.join(baseDir, entry);
        try {
            const stats = fs.statSync(fullPath);
            if (stats.isFile()) {
                console.log(`[findFirstFileRecursive] Fichier trouvé: ${entry} (Taille: ${stats.size} octets)`);
                return { path: fullPath, name: entry, size: stats.size };
            }
            if (stats.isDirectory()) {
                console.log(`[findFirstFileRecursive] Entrée dans le sous-dossier: ${entry}`);
                const fileInSubdir = findFirstFileRecursive(fullPath);
                if (fileInSubdir) return fileInSubdir; // Retourner le premier fichier trouvé dans un sous-dossier
            }
        } catch (statError) {
            console.warn(`[findFirstFileRecursive] Impossible d'accéder aux stats de ${fullPath}:`, statError);
        }
    }
    console.log(`[findFirstFileRecursive] Aucun fichier trouvé dans ${baseDir} et ses sous-dossiers.`);
    return null; // Aucun fichier trouvé
}

router.post("/send-email", async (req, res) => {
  console.log("--- [MAIL] Début du traitement de la requête /send-email ---");
  const { subject, body, to, docIds } = req.body;
  console.log("[MAIL] Données reçues:", { subject, body, to, docIds });

  const toList = (to || "").split(/[\s,;]+/).filter(Boolean).join(", ");
  
  if (!toList || !body) {
    console.error("[MAIL] ERREUR: Destinataire ou corps de message manquant.");
    return res.status(400).json({ message: "Destinataire et corps de message requis." });
  }
  console.log(`[MAIL] Liste des destinataires validée: "${toList}"`);

  try {
    const kheopsToken = req.headers.authorization;
    const authClient = await getAuthenticatedGoogleClient(kheopsToken);
    const gmail = google.gmail({ version: "v1", auth: authClient });
    
    let finalBody = body;
    const attachmentsForNodemailer = [];

    if (docIds && Array.isArray(docIds) && docIds.length > 0) {
      console.log(`[MAIL] Traitement de ${docIds.length} pièce(s) jointe(s) demandée(s).`);
      let totalSize = 0;
      const attachmentsToProcess = [];

      // >>> CORRECTION CHEMIN : Utilisation du chemin dynamique au lieu de "C:\Files_Clients" en dur
      const rootPath = configManager.getLocalRootPath();
      if (!rootPath) {
        console.error("[MAIL] ERREUR: Chemin de stockage local non configuré.");
        return res.status(500).json({ message: "Chemin de stockage local non configuré." });
      }

      // Étape 1: Calculer la taille totale en trouvant les fichiers réels
      console.log("[MAIL] Étape 1: Recherche des fichiers locaux et calcul de la taille totale.");
      for (const docId of docIds) {
        // >>> CORRECTION CHEMIN : Utilisation du rootPath dynamique
        const localDir = path.join(rootPath, docId.toString());
        console.log(`[MAIL] > Vérification du dossier pour docId ${docId}: "${localDir}"`);
        if (fs.existsSync(localDir)) {
          const fileInfo = findFirstFileRecursive(localDir); // Utilisation de la nouvelle fonction récursive
          if (fileInfo) {
            console.log(`[MAIL]   >> Fichier trouvé: "${fileInfo.name}", Taille: ${fileInfo.size} octets`);
            totalSize += fileInfo.size;
            attachmentsToProcess.push({ path: fileInfo.path, name: fileInfo.name });
          } else {
            console.warn(`[MAIL]   >> ATTENTION: Aucun fichier trouvé pour le docId ${docId} dans ${localDir}`);
          }
        } else {
            console.warn(`[MAIL]   >> ATTENTION: Le dossier ${localDir} n'existe pas.`);
        }
      }

      console.log(`[MAIL] Fin de la recherche. Taille totale des pièces jointes: ${(totalSize / 1024 / 1024).toFixed(2)} Mo.`);
      console.log(`[MAIL] Fichiers à traiter:`, attachmentsToProcess.map(f => f.name));

      // Étape 2: Choisir la méthode d'envoi (Classique ou Drive)
      // Audit S25 #1, D2 : quand le cabinet est protégé (E2E activé), interdire
      // le mode « upload Drive + lien public » — les destinataires ne pourraient
      // pas déchiffrer un .kbox, et un dépôt en clair défait toute la protection.
      let cryptoHandler = null;
      try { cryptoHandler = require('../crypto-handler'); } catch (_) { /* hors test */ }
      if (cryptoHandler && cryptoHandler.shouldEncrypt() && totalSize >= DRIVE_UPLOAD_THRESHOLD) {
        console.warn('[MAIL] Refus mode Drive : cabinet protégé + pièces jointes > seuil.');
        return res.status(413).json({
          message: 'Cabinet protégé : les pièces jointes volumineuses (> ' +
                   Math.round(DRIVE_UPLOAD_THRESHOLD / 1024 / 1024) + ' Mo au total) ' +
                   'ne peuvent pas être envoyées via Google Drive ' +
                   '(les destinataires ne pourraient pas les ouvrir). ' +
                   'Réduisez la taille des pièces jointes ou envoyez le mail sans ces fichiers.',
        });
      }

      if (totalSize >= DRIVE_UPLOAD_THRESHOLD) {
        console.log(`[MAIL] Seuil de ${DRIVE_UPLOAD_THRESHOLD / 1024 / 1024} Mo dépassé. Utilisation de Google Drive.`);
        const drive = google.drive({ version: "v3", auth: authClient });
        const uploadPromises = attachmentsToProcess.map(att => uploadFileToDrive(drive, att.path, att.name));
        const driveLinks = await Promise.all(uploadPromises);
        console.log("[MAIL] Tous les fichiers ont été uploadés sur Google Drive.", driveLinks);

        const linksHtml = driveLinks
          .map(item => `<li><a href="${item.link}" target="_blank" rel="noopener noreferrer">${item.name}</a></li>`)
          .join('');
        const driveSection = `
          <br><br><hr>
          <p style="font-family: sans-serif; font-size: 14px;"><strong>Pièces jointes disponibles en téléchargement sécurisé via Google Drive :</strong></p>
          <ul style="font-family: sans-serif; font-size: 14px;">${linksHtml}</ul>
        `;
        finalBody += driveSection;
        console.log("[MAIL] Liens HTML pour Google Drive ajoutés au corps de l'email.");

      } else {
        console.log(`[MAIL] Taille inférieure au seuil. Utilisation de pièces jointes classiques.`);
        for (const att of attachmentsToProcess) {
          console.log(`[MAIL] > Préparation de la pièce jointe: "${att.name}"`);
          attachmentsForNodemailer.push({
            filename: att.name,
            content: fs.readFileSync(att.path),
            contentType: mime.lookup(att.path) || "application/octet-stream",
          });
        }
        console.log(`[MAIL] ${attachmentsForNodemailer.length} pièce(s) jointe(s) prête(s) pour l'envoi.`);
      }
    } else {
        console.log("[MAIL] Aucune pièce jointe demandée (docIds est vide ou non fourni).");
    }

    const mailOptions = {
      to: toList,
      subject: subject || "(Sans objet)",
      text: finalBody,
      html: finalBody.includes('<') ? finalBody : `<p>${finalBody.replace(/\n/g, "<br>")}</p>`,
      attachments: attachmentsForNodemailer,
    };
    
    // Log des options finales sans le contenu des pièces jointes pour la lisibilité
    console.log("[MAIL] Options finales de l'email (sans contenu PJ):", { ...mailOptions, attachments: mailOptions.attachments.map(a => a.filename) });

    console.log("[MAIL] Compilation et encodage de l'email...");
    const raw = Buffer.from(await new MailComposer(mailOptions).compile().build()).toString("base64url");
    console.log("[MAIL] Email compilé. Envoi via l'API Gmail...");
    const { data } = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });

    console.log(`[MAIL] SUCCÈS: Email envoyé avec l'ID de message: ${data.id}`);
    console.log("--- [MAIL] Fin du traitement de la requête /send-email ---");
    return res.status(200).json({ message: "Email envoyé avec succès", id: data.id });

  } catch (e) {
    console.error("[MAIL] ERREUR MAJEURE lors de l'envoi de l'email:", e);
    const msg = e.message || "Erreur interne du service Gmail";
    const status = /AUTH/.test(msg) ? 401 : 500;
    console.log("--- [MAIL] Fin du traitement de la requête /send-email (avec erreur) ---");
    return res.status(status).json({ message: msg });
  }
});

module.exports = router;
