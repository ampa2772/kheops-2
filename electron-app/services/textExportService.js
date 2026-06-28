// electron-app/services/textExportService.js
const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");

// Cache pour l'import dynamique de Scribe.js (module ESM-only)
let _scribeModule = null;

async function getScribe() {
  if (!_scribeModule) {
    _scribeModule = (await import("scribe.js-ocr")).default;
  }
  return _scribeModule;
}

// ============================================================================
// COLLECTE DES DOCUMENTS
// ============================================================================

/**
 * Collecte tous les documents du dossier avec leur emplacement logique.
 * Chaque document reçoit un champ `logicalPath` et `subfolderName`.
 */
function collectAllDocuments(dossierData) {
  const docs = dossierData.dossier?.documents || [];
  const subfolders = dossierData.subfolders || [];

  return docs.map((doc) => {
    const docObj = doc.toObject ? doc.toObject() : { ...doc };
    const subfolder = docObj.subfolderId
      ? subfolders.find(
          (sf) => sf._id.toString() === docObj.subfolderId.toString()
        )
      : null;

    return {
      ...docObj,
      _idStr: docObj._id.toString(),
      subfolderName: subfolder ? subfolder.name : null,
      logicalPath: subfolder
        ? `${subfolder.name} / ${docObj.nomDocument}`
        : docObj.nomDocument,
      emplacement: subfolder ? subfolder.name : "Racine",
    };
  });
}

// ============================================================================
// EXTRACTION DE TEXTE
// ============================================================================

const SUPPORTED_EXTENSIONS = [".docx", ".pdf", ".txt"];
const MIN_PDF_TEXT_LENGTH = 50;

/**
 * Vérifie la qualité du texte extrait d'un PDF.
 * Retourne true si le texte semble être du texte français valide,
 * false si le texte est probablement corrompu (CMap incorrects, encodage cassé, etc.).
 *
 * Critères de corruption détectés :
 * 1. Trop de séquences de points consécutifs (.. ou ...) — signe de caractères non-mappés
 * 2. Trop de caractères rares dans des contextes inhabituels (consonne+accent_rare+consonne)
 * 3. Ratio global de caractères "normaux" trop bas (< 80%)
 * 4. Longueur moyenne des mots anormalement élevée (> 25 chars) — espaces manquants
 */
function isTextQualitySufficient(text) {
  if (!text || text.length === 0) return false;

  // Critère 1 : séquences de points consécutifs (2+ points d'affilée)
  // Les PDF corrompus produisent souvent "mot...mot......mot" quand les CMap échouent
  // Un texte juridique normal peut avoir quelques "..." mais pas 15%+ du texte
  const consecutiveDots = (text.match(/\.{2,}/g) || []);
  const totalDotsInSequences = consecutiveDots.reduce((sum, seq) => sum + seq.length, 0);
  if (totalDotsInSequences > text.length * 0.15) {
    return false; // Plus de 15% du texte est des points consécutifs
  }

  // Critère 2 : patterns inhabituels — consonne + caractère accentué rare + consonne
  // Ex: "pæm", "müd", "mæw" ne sont pas des trigrammes français valides
  const weirdPatterns = (text.match(/[bcdfghjklmnpqrstvwxz][æœüäöë][bcdfghjklmnpqrstvwxz]/gi) || []);
  if (weirdPatterns.length > 3) {
    return false; // Plus de 3 trigrammes impossibles en français
  }

  // Critère 3 : ratio global de caractères français courants
  const frenchValidChars = /[a-zA-ZàâäéèêëïîôùûüÿçœæÀÂÄÉÈÊËÏÎÔÙÛÜŸÇŒÆ0-9\s.,;:!?'"()\-\/\\@#€$%&+=\[\]{}<>«»—–_\n\r\t°]/g;
  const matches = text.match(frenchValidChars) || [];
  const ratio = matches.length / text.length;

  if (ratio < 0.80) {
    return false;
  }

  // Critère 4 : espaces manquants — longueur moyenne des mots anormalement élevée
  // Un texte français normal a des mots de ~5-8 caractères en moyenne.
  // Si pdf-parse n'a pas détecté les espaces (petits caractères), les "mots" font 50+ chars.
  // Seuil à 25 : même "anticonstitutionnellement" (25 chars) ne dépasse pas cette limite.
  const words = text.split(/[\s\n\r\t]+/).filter(w => w.length > 0);
  if (words.length > 0) {
    const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
    if (avgWordLength > 25) {
      return false; // Très probablement des mots collés sans espaces
    }
  }

  return true;
}

/**
 * Extrait le texte d'un fichier DOCX via mammoth.
 */
async function extractTextFromDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return {
    text: result.value || "",
    method: "Extraction DOCX (mammoth)",
  };
}

/**
 * Extrait le texte d'un fichier PDF.
 * 1) Tente d'abord l'extraction native via pdf-parse (rapide).
 * 2) Vérifie la qualité du texte extrait (détection de corruption CMap).
 * 3) Si le texte natif est insuffisant ou corrompu, lance l'OCR via Scribe.js.
 */
async function extractTextFromPdf(filePath) {
  // Étape 1 : extraction native rapide avec pdf-parse
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  const nativeText = (data.text || "").trim();
  const pageCount = data.numpages || "?";

  // Évaluer la quantité et la qualité du texte natif
  const hasNativeText = nativeText.length >= MIN_PDF_TEXT_LENGTH;
  const isNativeCorrupted = hasNativeText && !isTextQualitySufficient(nativeText);

  // Si le texte natif est suffisant ET de bonne qualité, pas besoin d'OCR
  if (hasNativeText && !isNativeCorrupted) {
    return {
      text: nativeText,
      method: `Extraction texte natif PDF (${pageCount} pages)`,
    };
  }

  if (isNativeCorrupted) {
    console.log(`[TextExport] Texte natif detecte mais corrompu (qualite insuffisante). Passage en OCR pour : ${path.basename(filePath)}`);
  }

  // Étape 2 : texte natif insuffisant ou corrompu → OCR avec Scribe.js
  try {
    const scribe = await getScribe();
    let ocrText;
    try {
      ocrText = await scribe.extractText([filePath], ["fra"]);
    } finally {
      try { await scribe.clear(); } catch (_) { /* ignore cleanup errors */ }
    }

    if (ocrText && ocrText.trim().length > 0) {
      let method;
      if (isNativeCorrupted) {
        method = `OCR Scribe.js (texte natif corrompu) (${pageCount} pages)`;
      } else if (nativeText.length > 0) {
        method = `OCR Scribe.js (mixte : texte natif + OCR) (${pageCount} pages)`;
      } else {
        method = `OCR Scribe.js (${pageCount} pages)`;
      }
      return { text: ocrText.trim(), method };
    }

    // OCR n'a rien retourné
    return {
      text: nativeText.length > 0
        ? `[PDF SCANNE - OCR sans resultat]\nFragments recuperes : ${nativeText}`
        : "[PDF SCANNE - OCR sans resultat]\nAucun texte recupere.",
      method: "ECHEC",
      error: "L'OCR Scribe.js n'a pas pu extraire de texte de ce PDF.",
    };
  } catch (ocrErr) {
    return {
      text: nativeText.length > 0
        ? `[PDF SCANNE - Erreur OCR]\nFragments recuperes : ${nativeText}`
        : "[PDF SCANNE - Erreur OCR]\nAucun texte recupere.",
      method: "ECHEC",
      error: `Erreur OCR Scribe.js : ${ocrErr.message}`,
    };
  }
}

/**
 * Extrait le texte d'un fichier texte brut.
 */
function extractTextFromTxt(filePath) {
  const text = fs.readFileSync(filePath, "utf-8");
  return {
    text,
    method: "Lecture fichier texte brut",
  };
}

/**
 * Dispatch l'extraction selon l'extension du fichier.
 * Retourne { text, method, error? }
 */
async function extractTextFromFile(filePath, fileName) {
  const ext = path.extname(fileName || filePath).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return {
      text: "",
      method: `Format non supporte (${ext || "inconnu"})`,
      error: `Le format ${ext || "inconnu"} n'est pas pris en charge pour l'extraction de texte.`,
    };
  }

  if (!fs.existsSync(filePath)) {
    return {
      text: "",
      method: "ECHEC",
      error: `Fichier introuvable sur le disque : ${filePath}`,
    };
  }

  try {
    switch (ext) {
      case ".docx":
        return await extractTextFromDocx(filePath);
      case ".pdf":
        return await extractTextFromPdf(filePath);
      case ".txt":
        return extractTextFromTxt(filePath);
      default:
        return { text: "", method: "Format non supporte", error: `Extension ${ext} non geree.` };
    }
  } catch (err) {
    return {
      text: "",
      method: "ECHEC",
      error: `Erreur lors de l'extraction : ${err.message}`,
    };
  }
}

// ============================================================================
// FORMATAGE DU TXT
// ============================================================================

const SEPARATOR_MAJOR = "==================================================";
const SEPARATOR_MINOR = "--------------------------------------------------";

function formatDate(date) {
  if (!date) return "Non renseignee";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "Date invalide";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateShort(date) {
  if (!date) return "Non renseignee";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "Date invalide";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Formate les informations d'un contact (personne physique, PM privée, PM publique).
 */
function formatContactInfo(contact, indent = "    ") {
  if (!contact) return `${indent}(Aucune donnee disponible)\n`;
  const lines = [];

  // Personne Physique
  if (contact.nom || contact.prenoms) {
    if (contact.nom) lines.push(`${indent}Nom : ${contact.nom}`);
    if (contact.prenoms) lines.push(`${indent}Prenom : ${contact.prenoms}`);
    if (contact.nom_de_naissance) lines.push(`${indent}Nom de naissance : ${contact.nom_de_naissance}`);
    if (contact.genre) lines.push(`${indent}Genre : ${contact.genre}`);
    if (contact.dateNaissance) lines.push(`${indent}Date de naissance : ${formatDateShort(contact.dateNaissance)}`);
    if (contact.nationalite) lines.push(`${indent}Nationalite : ${contact.nationalite}`);
    if (contact.profession) lines.push(`${indent}Profession : ${contact.profession}`);
    if (contact.adresse) lines.push(`${indent}Adresse : ${contact.adresse}`);
    if (contact.ville) lines.push(`${indent}Ville : ${contact.ville}`);
    if (contact.codePostal) lines.push(`${indent}Code postal : ${contact.codePostal}`);
    if (contact.telephone) lines.push(`${indent}Telephone : ${contact.telephone}`);
    if (contact.email) lines.push(`${indent}Email : ${contact.email}`);
    if (contact.secu) lines.push(`${indent}N° Securite sociale : ${contact.secu}`);
  }

  // PM Privée
  if (contact.raisonSociale) {
    lines.push(`${indent}Raison sociale : ${contact.raisonSociale}`);
    if (contact.formeJuridique) lines.push(`${indent}Forme juridique : ${contact.formeJuridique}`);
    if (contact.siret) lines.push(`${indent}SIRET : ${contact.siret}`);
    if (contact.adresseSiegeSocial) lines.push(`${indent}Adresse siege : ${contact.adresseSiegeSocial}`);
    if (contact.telephoneEntreprise) lines.push(`${indent}Telephone : ${contact.telephoneEntreprise}`);
    if (contact.emailEntreprise) lines.push(`${indent}Email : ${contact.emailEntreprise}`);
    if (contact.siteWeb) lines.push(`${indent}Site web : ${contact.siteWeb}`);
    if (contact.secteurActivite) lines.push(`${indent}Secteur : ${contact.secteurActivite}`);
    if (contact.capitalSocial) lines.push(`${indent}Capital social : ${contact.capitalSocial}`);
    if (contact.representantLegal) {
      const rl = contact.representantLegal;
      lines.push(`${indent}Representant legal : ${rl.representantLegalNom || ""} ${rl.representantLegalPrenom || ""}`.trim());
      if (rl.representantLegalEmail) lines.push(`${indent}  Email RL : ${rl.representantLegalEmail}`);
      if (rl.representantLegalTelephone) lines.push(`${indent}  Tel RL : ${rl.representantLegalTelephone}`);
    }
    if (contact.contactDirect) {
      const cd = contact.contactDirect;
      lines.push(`${indent}Contact direct : ${cd.nom || ""} ${cd.prenom || ""}`.trim());
      if (cd.email) lines.push(`${indent}  Email CD : ${cd.email}`);
      if (cd.telephone) lines.push(`${indent}  Tel CD : ${cd.telephone}`);
    }
  }

  // PM Publique
  if (contact.denomination) {
    lines.push(`${indent}Denomination : ${contact.denomination}`);
    if (contact.adresse) lines.push(`${indent}Adresse : ${contact.adresse}`);
    if (contact.ville) lines.push(`${indent}Ville : ${contact.ville}`);
    if (contact.email) lines.push(`${indent}Email : ${contact.email}`);
    if (contact.siteWeb) lines.push(`${indent}Site web : ${contact.siteWeb}`);
  }

  if (contact.observations) lines.push(`${indent}Observations : ${contact.observations}`);

  return lines.length > 0 ? lines.join("\n") + "\n" : `${indent}(Aucune donnee detaillee)\n`;
}

/**
 * Formate une partie (pour ou contre) avec ses avocats et contacts liés.
 */
function formatPartie(partie, index) {
  const lines = [];
  const nomPartie = partie.nomPartie || "(Partie sans nom)";
  lines.push(`  Partie ${index + 1} : ${nomPartie}`);

  if (partie.partieData) {
    lines.push(formatContactInfo(partie.partieData, "    "));
  }

  if (Array.isArray(partie.avocats) && partie.avocats.length > 0) {
    lines.push("    Avocats de la partie :");
    for (const avocat of partie.avocats) {
      const nom = `${avocat.nomOfficeUser || avocat.nom || ""} ${avocat.prenomOfficeUser || avocat.prenoms || ""}`.trim();
      lines.push(`      - Me ${nom}`);
      if (avocat.email) lines.push(`        Email : ${avocat.email}`);
      if (avocat.telephone) lines.push(`        Telephone : ${avocat.telephone}`);
      if (avocat.address || avocat.adresse) lines.push(`        Adresse : ${avocat.address || avocat.adresse}`);
    }
    lines.push("");
  }

  if (Array.isArray(partie.contacts) && partie.contacts.length > 0) {
    lines.push("    Contacts lies a la partie :");
    for (const contact of partie.contacts) {
      const nom = `${contact.nom || ""} ${contact.prenoms || ""}`.trim() || contact.raisonSociale || contact.denomination || "(Contact sans nom)";
      lines.push(`      - ${nom}`);
      if (contact.email) lines.push(`        Email : ${contact.email}`);
      if (contact.telephone) lines.push(`        Telephone : ${contact.telephone}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Formate la section complète des protagonistes.
 */
function formatProtagonists(dossierData) {
  const lines = [];
  const parties = dossierData.dossier?.parties || {};

  // Parties POUR
  lines.push("[PARTIES POUR]");
  const pour = parties.pour || [];
  if (pour.length === 0) {
    lines.push("  (Aucune partie pour)");
  } else {
    pour.forEach((p, i) => lines.push(formatPartie(p, i)));
  }
  lines.push("");

  // Parties CONTRE
  lines.push("[PARTIES CONTRE]");
  const contre = parties.contre || [];
  if (contre.length === 0) {
    lines.push("  (Aucune partie contre)");
  } else {
    contre.forEach((p, i) => lines.push(formatPartie(p, i)));
  }
  lines.push("");

  // Contacts du dossier
  const contactsDuDossier = dossierData.dossier?.contactsDuDossier || [];
  lines.push("[CONTACTS DIRECTEMENT LIES AU DOSSIER]");
  if (contactsDuDossier.length === 0) {
    lines.push("  (Aucun contact direct)");
  } else {
    contactsDuDossier.forEach((c, i) => {
      const nom = `${c.nom || ""} ${c.prenoms || ""}`.trim() || c.raisonSociale || c.denomination || "(Contact sans nom)";
      lines.push(`  ${i + 1}. ${nom}`);
      lines.push(formatContactInfo(c, "     "));
    });
  }
  lines.push("");

  // Avocats responsables
  const avocatsResp = dossierData.dossier?.avocatsResponsables || [];
  if (avocatsResp.length > 0) {
    lines.push("[AVOCATS RESPONSABLES DU DOSSIER]");
    avocatsResp.forEach((a, i) => {
      const nom = `${a.nomOfficeUser || a.nom || ""} ${a.prenomOfficeUser || a.prenoms || ""}`.trim();
      lines.push(`  ${i + 1}. Me ${nom}`);
      if (a.email) lines.push(`     Email : ${a.email}`);
    });
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Formate l'index des documents.
 */
function formatDocumentIndex(documents) {
  const lines = [];
  documents.forEach((doc, i) => {
    const ext = path.extname(doc.nomDocument || "").replace(".", "") || "?";
    lines.push(`  ${i + 1}. ${doc.nomDocument || "(Sans nom)"}`);
    lines.push(`     Type : ${ext} | Date : ${formatDateShort(doc.dateCreation)}`);
    lines.push(`     Emplacement : ${doc.emplacement}`);
    lines.push("");
  });
  return lines.join("\n");
}

/**
 * Formate le bloc de contenu d'un document extrait.
 */
function formatDocumentContent(doc, index, total) {
  const lines = [];
  lines.push(SEPARATOR_MINOR);
  lines.push(`DOCUMENT ${index + 1}/${total}`);
  lines.push(SEPARATOR_MINOR);
  lines.push(`Nom : ${doc.nomDocument || "(Sans nom)"}`);
  lines.push(`Type : ${path.extname(doc.nomDocument || "").replace(".", "") || "?"}`);
  lines.push(`Date : ${formatDateShort(doc.dateCreation)}`);
  lines.push(`Emplacement : ${doc.emplacement}`);
  lines.push(`Methode d'extraction : ${doc.extractionMethod || "Non traitee"}`);
  lines.push("");

  if (doc.extractionError) {
    lines.push(`[ECHEC D'EXTRACTION] Raison : ${doc.extractionError}`);
  } else if (doc.extractedText) {
    lines.push("[CONTENU]");
    lines.push(doc.extractedText);
  } else {
    lines.push("[AUCUN CONTENU EXTRAIT]");
  }

  lines.push("");
  return lines.join("\n");
}

// ============================================================================
// ASSEMBLAGE DU TXT FINAL
// ============================================================================

/**
 * Construit le contenu complet du fichier TXT.
 */
function buildTxtContent(dossierData, extractedDocuments) {
  const lines = [];
  const dossierDetails = dossierData.dossier?.dossier || {};
  const nomDossier = dossierDetails.nom || "(Dossier sans nom)";

  // === EN-TETE ===
  lines.push(SEPARATOR_MAJOR);
  lines.push("EXPORT TEXTE COMPLET DU DOSSIER");
  lines.push(SEPARATOR_MAJOR);
  lines.push("");
  lines.push(`Nom du dossier : ${nomDossier}`);
  lines.push(`ID dossier : ${dossierData._id || "?"}`);
  lines.push(`Reference : ${dossierData.reference || "?"}`);
  lines.push(`Date de generation : ${formatDate(new Date())}`);
  if (dossierDetails.type_dossier) lines.push(`Type de dossier : ${dossierDetails.type_dossier}`);
  if (dossierDetails.description_dossier) lines.push(`Description : ${dossierDetails.description_dossier}`);
  if (dossierDetails.selectedTribunalAffaire) {
    const tribunal = dossierDetails.selectedTribunalAffaire;
    if (typeof tribunal === "string") {
      lines.push(`Juridiction : ${tribunal}`);
    } else if (tribunal.nom || tribunal.label) {
      lines.push(`Juridiction : ${tribunal.nom || tribunal.label}`);
    }
  }
  lines.push("");

  // === PROTAGONISTES ===
  lines.push(SEPARATOR_MAJOR);
  lines.push("PROTAGONISTES DU DOSSIER");
  lines.push(SEPARATOR_MAJOR);
  lines.push("");
  lines.push(formatProtagonists(dossierData));

  // === INDEX DES DOCUMENTS ===
  lines.push(SEPARATOR_MAJOR);
  lines.push(`INDEX DES DOCUMENTS (${extractedDocuments.length} documents)`);
  lines.push(SEPARATOR_MAJOR);
  lines.push("");
  lines.push(formatDocumentIndex(extractedDocuments));

  // === CONTENU DES DOCUMENTS ===
  lines.push(SEPARATOR_MAJOR);
  lines.push("CONTENU DES DOCUMENTS");
  lines.push(SEPARATOR_MAJOR);
  lines.push("");

  const total = extractedDocuments.length;
  for (let i = 0; i < total; i++) {
    lines.push(formatDocumentContent(extractedDocuments[i], i, total));
  }

  // === RESUME DES ERREURS ===
  const errors = extractedDocuments.filter((d) => d.extractionError);
  if (errors.length > 0) {
    lines.push(SEPARATOR_MAJOR);
    lines.push(`RESUME DES ERREURS (${errors.length}/${total} documents en echec)`);
    lines.push(SEPARATOR_MAJOR);
    lines.push("");
    errors.forEach((doc, i) => {
      lines.push(`  ${i + 1}. ${doc.nomDocument} — ${doc.extractionError}`);
    });
    lines.push("");
  }

  lines.push(SEPARATOR_MAJOR);
  lines.push("FIN DE L'EXPORT");
  lines.push(SEPARATOR_MAJOR);

  return lines.join("\n");
}

// ============================================================================
// ORCHESTRATEUR PRINCIPAL
// ============================================================================

/**
 * Génère l'export texte complet d'un dossier.
 *
 * @param {Object} dossierData - Données complètes du dossier (depuis l'API)
 * @param {string} rootPath - Chemin racine local des fichiers (configManager.getLocalRootPath())
 * @param {Function} onProgress - Callback de progression: (current, total, currentDocName) => void
 * @returns {Promise<{ txtContent: string, fileName: string, documents: Array }>}
 */
async function generateFullTextExport(dossierData, rootPath, onProgress) {
  // 1. Collecter tous les documents
  const documents = collectAllDocuments(dossierData);
  const total = documents.length;

  // 2. Extraire le texte de chaque document
  for (let i = 0; i < total; i++) {
    const doc = documents[i];

    if (onProgress) {
      onProgress(i + 1, total, doc.nomDocument);
    }

    // Construire le chemin physique du fichier
    const docFolder = path.join(rootPath, doc._idStr);
    let filePath = null;

    if (fs.existsSync(docFolder)) {
      // Chercher le fichier dans le dossier du document
      try {
        const files = fs.readdirSync(docFolder);
        const matchingFile = files.find((f) => !f.startsWith("."));
        if (matchingFile) {
          filePath = path.join(docFolder, matchingFile);
        }
      } catch (err) {
        // Dossier inaccessible
      }
    }

    if (!filePath) {
      doc.extractedText = "";
      doc.extractionMethod = "ECHEC";
      doc.extractionError = "Fichier introuvable sur le disque local";
      continue;
    }

    const result = await extractTextFromFile(filePath, doc.nomDocument);
    doc.extractedText = result.text;
    doc.extractionMethod = result.method;
    if (result.error) {
      doc.extractionError = result.error;
    }
  }

  // 2b. Libérer les ressources Scribe.js si le moteur OCR a été chargé
  if (_scribeModule) {
    try {
      await _scribeModule.terminate();
    } catch (_) { /* ignore cleanup errors */ }
    _scribeModule = null;
  }

  // 3. Assembler le TXT
  const txtContent = buildTxtContent(dossierData, documents);

  // 5. Nom du fichier
  const dossierNom = dossierData.dossier?.dossier?.nom || "Dossier";
  const cleanNom = dossierNom.replace(/[<>:"/\\|?*]/g, "_").substring(0, 80);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const fileName = `Export_Complet_${cleanNom}_${dateStr}.txt`;

  return { txtContent, fileName, documents };
}

module.exports = {
  generateFullTextExport,
  collectAllDocuments,
  extractTextFromFile,
  extractTextFromDocx,
  extractTextFromPdf,
  extractTextFromTxt,
  buildTxtContent,
  formatProtagonists,
  formatDocumentIndex,
  formatDocumentContent,
  isTextQualitySufficient,
};
