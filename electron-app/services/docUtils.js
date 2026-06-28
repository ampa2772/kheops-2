// electron-app/services/docUtils.js

const fs = require('fs');
const path = require('path');
const { requireCloudCtx } = require('./cloudContext');
const configManager = require('./configManager');

let openedFiles = [];

function isFileOpen(filePath) {
  try {
    const file = fs.openSync(filePath, 'r+');
    fs.closeSync(file);
    return false;
  } catch (error) {
    if (error.code === 'EBUSY' || error.code === 'EPERM') {
      return true;
    }
    return false;
  }
}

function checkFileStatus(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error("[checkFileStatus] Erreur: le fichier n'existe pas:", filePath);
    return;
  }

  let previousStatus = isFileOpen(filePath);
  if (previousStatus && !openedFiles.includes(filePath)) {
    openedFiles.push(filePath);
  }

  const intervalId = setInterval(() => {
    if (!fs.existsSync(filePath)) {
      console.warn('[checkFileStatus] Le fichier ' + filePath + " n'existe plus. Arrêt de la surveillance.");
      openedFiles = openedFiles.filter((file) => file !== filePath);
      clearInterval(intervalId);
      return;
    }
    const currentStatus = isFileOpen(filePath);
    if (previousStatus !== currentStatus) {
      if (currentStatus) {
        if (!openedFiles.includes(filePath)) {
          openedFiles.push(filePath);
        }
      } else {
        openedFiles = openedFiles.filter((file) => file !== filePath);
      }
      previousStatus = currentStatus;
    }
  }, 500);
}

function ensureFilesClientsFolderExists(specificPath) {
  const targetPath = specificPath || configManager.getLocalRootPath();

  if (!targetPath) {
    console.warn("[Local] Aucun chemin racine configuré. Impossible de créer le dossier.");
    return;
  }

  if (!fs.existsSync(targetPath)) {
    try {
      fs.mkdirSync(targetPath, { recursive: true });
      console.log(`[Local] Dossier créé: ${targetPath}`);
    } catch (error) {
      console.error(`[Local] Erreur création dossier ${targetPath}:`, error);
    }
  }
}

async function downloadFileFromCloud(remoteFilePath, localDownloadFolderPath, localFileName = null) {
  if (!remoteFilePath || !localDownloadFolderPath) {
    throw new Error('Arguments manquants pour downloadFileFromCloud.');
  }

  try {
    console.log(`[Cloud Download] Tentative de téléchargement: ${remoteFilePath}`);

    const ctx = requireCloudCtx();
    console.log(`[Cloud Download] Source cloud active : ${ctx.source}`);

    // --- Chiffrement E2E (lot 4c) ---
    // Le fichier sur Drive peut etre :
    //   - en clair (cabinet non protege OU fichier ancien)         -> nom = "Conclusions.docx"
    //   - chiffre en blob .kbox (cabinet protege, lot 4b)           -> nom = "Conclusions.docx.kbox"
    //
    // On tente d'abord le path tel quel, puis on tente avec le suffixe .kbox
    // si introuvable. Apres telechargement, on detecte le magic "KBX2" et
    // on dechiffre en place. Le fichier .kbox temporaire est supprime.
    let actualRemotePath = remoteFilePath;
    let fileId = await ctx.service.resolvePathToId(remoteFilePath);
    if (!fileId) {
      // Tentative avec suffixe .kbox (fichier chiffre)
      const kboxPath = remoteFilePath + '.kbox';
      fileId = await ctx.service.resolvePathToId(kboxPath);
      if (fileId) {
        actualRemotePath = kboxPath;
      } else {
        throw new Error(`Impossible de trouver l'ID du fichier Cloud pour le chemin: ${remoteFilePath}`);
      }
    }
    console.log(`[Cloud Download] ID du fichier obtenu: ${fileId} (chemin reel: ${actualRemotePath})`);

    ensureFilesClientsFolderExists(localDownloadFolderPath);
    const finalFileName = localFileName || path.basename(remoteFilePath);
    const localFilePath = path.join(localDownloadFolderPath, finalFileName);

    // Si le fichier Drive a l'extension .kbox, on telecharge d'abord dans
    // un emplacement temporaire pour pouvoir dechiffrer ensuite vers le
    // path final attendu par le caller.
    const isKboxByExt = actualRemotePath.toLowerCase().endsWith('.kbox');

    if (isKboxByExt) {
      const os = require('os');
      const tmpName = 'kheops-decrypt-' + Date.now() + '-' +
                      Math.random().toString(36).slice(2) + '.kbox';
      const tmpPath = path.join(os.tmpdir(), tmpName);
      await ctx.service.downloadFile(fileId, tmpPath);
      try {
        // Verifier magic et dechiffrer
        const blob = fs.readFileSync(tmpPath);
        if (blob.length < 4 || blob.subarray(0, 4).toString('ascii') !== 'KBX2') {
          throw new Error('Fichier protege corrompu (magic invalide).');
        }
        let cryptoHandler = null;
        try { cryptoHandler = require('../crypto-handler'); } catch (_) {}
        if (!cryptoHandler || !cryptoHandler.isUnlocked()) {
          throw new Error('Le document est protege par une phrase secrete. Deverrouillez le cabinet d\'abord.');
        }
        const startedAt = Date.now();
        const { plaintext } = cryptoHandler.decryptBufferFromDrive(blob);
        const durationMs = Date.now() - startedAt;
        // Log explicite AVANT l'ecriture du plaintext (lot C3 — corrige 2.0.5).
        // Placer le log avant writeFileSync garantit que la trace du
        // dechiffrement reussi est emise meme si l'ecriture disque echoue
        // (disque plein, permissions, etc.).
        try {
          const { logToFile } = require('./crashLog');
          logToFile(
            '[docUtils] Dechiffrement apres download : "' + path.basename(actualRemotePath) +
            '" (' + blob.length + ' octets) -> "' + finalFileName +
            '" (' + plaintext.length + ' octets) en ' + durationMs + ' ms'
          );
        } catch (_) { /* logToFile peut ne pas etre charge en mode test */ }
        fs.writeFileSync(localFilePath, plaintext);
      } finally {
        try { fs.unlinkSync(tmpPath); } catch (_) { /* best-effort */ }
      }
      return localFilePath;
    }

    // Flux normal (fichier en clair) — comportement historique
    await ctx.service.downloadFile(fileId, localFilePath);

    // Au cas ou un fichier sans extension .kbox aurait quand meme le magic
    // KBX2 (cas pathologique : nom Drive change manuellement), on detecte
    // par le magic et on tente le dechiffrement.
    try {
      const head = Buffer.alloc(4);
      const fd = fs.openSync(localFilePath, 'r');
      fs.readSync(fd, head, 0, 4, 0);
      fs.closeSync(fd);
      if (head.toString('ascii') === 'KBX2') {
        let cryptoHandler = null;
        try { cryptoHandler = require('../crypto-handler'); } catch (_) {}
        if (cryptoHandler && cryptoHandler.isUnlocked()) {
          const blob = fs.readFileSync(localFilePath);
          const { plaintext } = cryptoHandler.decryptBufferFromDrive(blob);
          fs.writeFileSync(localFilePath, plaintext);
        }
      }
    } catch (_) {
      // Detection optionnelle ; en cas d'erreur on laisse le fichier tel quel
    }

    return localFilePath;
  } catch (error) {
    console.error(`[Cloud Download] Erreur lors du téléchargement (${remoteFilePath}):`, error.message);
    throw new Error(`Échec téléchargement Cloud (${remoteFilePath}): ${error.message}`);
  }
}

function formatDateInFrench(dateInput) {
  if (!dateInput) return '';
  const moisNoms = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) {
      console.warn('[formatDateInFrench] Date invalide fournie:', dateInput);
      return '';
    }
    const jour = d.getDate();
    const mois = moisNoms[d.getMonth()];
    const annee = d.getFullYear();
    return `le ${jour} ${mois} ${annee}`;
  } catch (err) {
    console.error('[formatDateInFrench] Erreur:', err);
    return '';
  }
}

function buildSimpleLetterVariables(dossier, contact = {}, userProfile = null) {
  const vars = {};

  // --- Civilité dérivée du genre (le champ 'civilite' n'existe pas dans la DB, seul 'genre' existe) ---
  const isFeminin = contact.genre === 'Feminin' || contact.genre === 'Féminin';
  const civ = isFeminin ? 'Madame' : 'Monsieur';

  // --- Variables du destinataire ---
  vars.civilite = civ;
  vars.nom = contact.nom || contact.raisonSociale || '';
  vars.prenom = contact.prenoms || '';
  vars.adresse = contact.adresse || '';
  vars.cp = contact.codePostal || '';
  vars.ville = contact.ville || '';
  vars.email = contact.email || '';

  // --- Titre (bloc adresse) : civilité + nom ---
  const nom = contact.nom || '';
  const isJuridique = contact.profession &&
    (contact.profession.toLowerCase().includes('avocat') ||
      contact.profession.toLowerCase().includes('notaire') ||
      contact.profession.toLowerCase().includes('huissier'));

  const prenomContact = contact.prenoms || '';
  if (isJuridique) {
    const fullNameJuridique = `${prenomContact} ${nom}`.trim();
    vars.titre = `Maître ${fullNameJuridique}`;
  } else {
    const fullNameContact = `${prenomContact} ${nom}`.trim();
    vars.titre = `${civ} ${fullNameContact}`;
  }

  // --- Appellation (salutation) ---
  // Ignorer 'Partie (Client / Adversaire)' qui est un label de type, pas une vraie appellation
  if (contact.appellationCourrier &&
      contact.appellationCourrier !== 'Partie (Client / Adversaire)') {
    vars.appellation = contact.appellationCourrier;
  } else if (contact.profession && contact.profession.toLowerCase().includes('avocat')) {
    vars.appellation = isFeminin ? 'Ma chère consoeur' : 'Mon cher confrère';
  } else if (isJuridique) {
    vars.appellation = 'Maître';
  } else {
    vars.appellation = isFeminin ? 'Chère Madame' : 'Cher Monsieur';
  }

  vars.introCourier = vars.appellation;

  // --- Variables du dossier ---
  vars.referenceDossier = dossier?.reference || '';
  vars.nomDossier = dossier?.dossier?.dossier?.nom || '';
  vars.dateDuJour = formatDateInFrench(new Date());

  // Priorite au profil User (parametres), fallback sur avocatResponsable du dossier
  if (userProfile && (userProfile.firstName || userProfile.lastName)) {
    vars.nomAvocat = `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim();
    vars.villeCabinet = userProfile.city || '';
  } else {
    const avocatResp = dossier?.dossier?.avocatsResponsables?.[0];
    vars.villeCabinet = avocatResp?.city || '';
    vars.nomAvocat = `${avocatResp?.prenomOfficeUser || ''} ${avocatResp?.nomOfficeUser || ''}`.trim();
  }

  // Barreau complet (ex: "Avocat au Barreau de l'Eure", "Avocat au Barreau des Hauts-de-Seine")
  const { getBarreauName, buildBarreauComplet } = require('../data/barreaux');
  const barreauNom = getBarreauName(vars.villeCabinet, userProfile?.barreau);
  vars.barreauComplet = buildBarreauComplet(barreauNom);

  return vars;
}

module.exports = {
  ensureFilesClientsFolderExists,
  downloadFileFromCloud,
  formatDateInFrench,
  buildSimpleLetterVariables,
  isFileOpen,
  checkFileStatus,
};
