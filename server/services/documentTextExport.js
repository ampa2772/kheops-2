// server/services/documentTextExport.js
//
// EXPORT TEXTE COMPLET D'UN DOSSIER (version WEB / serveur).
//
// Reimplemente cote serveur la fonctionnalite qui vivait dans l'ancien agent de
// bureau (electron-app/services/textExportService.js) : celui-ci lisait les
// fichiers sur le DISQUE local et poussait la progression via socket.io. Ici :
//   - on recupere les OCTETS de chaque document via le stockage serveur
//     (fetchBytes fourni par l'appelant → provider/GCS/OneDrive/Drive) ;
//   - on extrait le texte en MEMOIRE (buffer) : .docx via mammoth, .pdf via
//     pdf-parse (texte natif ; pas d'OCR cote serveur — trop lourd pour Cloud
//     Run — un PDF scanne est signale comme tel), .txt en lecture directe ;
//   - le FORMATAGE (en-tete, protagonistes, index, contenu) est repris tel quel
//     de l'ancien service pour un rendu identique.

const path = require('path');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

const SUPPORTED_EXTENSIONS = ['.docx', '.pdf', '.txt'];
const MIN_PDF_TEXT_LENGTH = 50;

// ── Qualite du texte PDF natif (repris de l'ancien service) ─────────────────
function isTextQualitySufficient(text) {
  if (!text || text.length === 0) return false;
  const consecutiveDots = (text.match(/\.{2,}/g) || []);
  const totalDotsInSequences = consecutiveDots.reduce((sum, seq) => sum + seq.length, 0);
  if (totalDotsInSequences > text.length * 0.15) return false;
  const weirdPatterns = (text.match(/[bcdfghjklmnpqrstvwxz][æœüäöë][bcdfghjklmnpqrstvwxz]/gi) || []);
  if (weirdPatterns.length > 3) return false;
  const frenchValidChars = /[a-zA-ZàâäéèêëïîôùûüÿçœæÀÂÄÉÈÊËÏÎÔÙÛÜŸÇŒÆ0-9\s.,;:!?'"()\-\/\\@#€$%&+=\[\]{}<>«»—–_\n\r\t°]/g;
  const matches = text.match(frenchValidChars) || [];
  if (matches.length / text.length < 0.80) return false;
  const words = text.split(/[\s\n\r\t]+/).filter((w) => w.length > 0);
  if (words.length > 0) {
    const avg = words.reduce((s, w) => s + w.length, 0) / words.length;
    if (avg > 25) return false;
  }
  return true;
}

// ── Extraction par BUFFER ────────────────────────────────────────────────────
async function extractTextFromDocxBuffer(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value || '', method: 'Extraction DOCX (mammoth)' };
}

async function extractTextFromPdfBuffer(buffer) {
  const data = await pdfParse(buffer);
  const nativeText = (data.text || '').trim();
  const pageCount = data.numpages || '?';
  const hasNativeText = nativeText.length >= MIN_PDF_TEXT_LENGTH;
  const isNativeCorrupted = hasNativeText && !isTextQualitySufficient(nativeText);
  if (hasNativeText && !isNativeCorrupted) {
    return { text: nativeText, method: `Extraction texte natif PDF (${pageCount} pages)` };
  }
  // Cote serveur : PAS d'OCR (Scribe.js trop lourd pour Cloud Run). On signale.
  return {
    text: nativeText.length > 0
      ? `[PDF probablement scanné — extraction partielle, OCR non disponible côté serveur]\n${nativeText}`
      : '[PDF probablement scanné — aucun texte natif, OCR non disponible côté serveur]',
    method: nativeText.length > 0 ? `Texte natif partiel (${pageCount} pages)` : 'ECHEC',
    error: nativeText.length > 0 ? undefined : 'PDF scanné : aucun texte natif extractible (OCR indisponible côté serveur).',
  };
}

function extractTextFromTxtBuffer(buffer) {
  return { text: buffer.toString('utf-8'), method: 'Lecture fichier texte brut' };
}

async function extractTextFromBuffer(buffer, fileName) {
  const ext = path.extname(fileName || '').toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) {
    return { text: '', method: `Format non supporte (${ext || 'inconnu'})`, error: `Le format ${ext || 'inconnu'} n'est pas pris en charge pour l'extraction de texte.` };
  }
  try {
    switch (ext) {
      case '.docx': return await extractTextFromDocxBuffer(buffer);
      case '.pdf': return await extractTextFromPdfBuffer(buffer);
      case '.txt': return extractTextFromTxtBuffer(buffer);
      default: return { text: '', method: 'Format non supporte', error: `Extension ${ext} non geree.` };
    }
  } catch (err) {
    return { text: '', method: 'ECHEC', error: `Erreur lors de l'extraction : ${err.message}` };
  }
}

// ── Collecte des documents (subfolder → nom lisible) ─────────────────────────
function collectAllDocuments(dossierData) {
  const docs = dossierData.dossier?.documents || [];
  const subfolders = dossierData.subfolders || [];
  return docs.map((doc) => {
    const d = doc.toObject ? doc.toObject() : { ...doc };
    const subfolder = d.subfolderId
      ? subfolders.find((sf) => String(sf._id) === String(d.subfolderId))
      : null;
    return {
      ...d,
      _idStr: String(d._id),
      subfolderName: subfolder ? subfolder.name : (d.subfolderName || null),
      emplacement: subfolder ? subfolder.name : (d.subfolderName || 'Racine'),
    };
  });
}

// ── Formatage (repris tel quel de l'ancien service) ─────────────────────────
const SEP_MAJOR = '==================================================';
const SEP_MINOR = '--------------------------------------------------';

function formatDate(date) {
  if (!date) return 'Non renseignee';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Date invalide';
  return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}
function formatDateShort(date) {
  if (!date) return 'Non renseignee';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Date invalide';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatContactInfo(contact, indent = '    ') {
  if (!contact) return `${indent}(Aucune donnee disponible)\n`;
  const lines = [];
  if (contact.nom || contact.prenoms) {
    if (contact.nom) lines.push(`${indent}Nom : ${contact.nom}`);
    if (contact.prenoms) lines.push(`${indent}Prenom : ${contact.prenoms}`);
    if (contact.dateNaissance) lines.push(`${indent}Date de naissance : ${formatDateShort(contact.dateNaissance)}`);
    if (contact.nationalite) lines.push(`${indent}Nationalite : ${contact.nationalite}`);
    if (contact.profession) lines.push(`${indent}Profession : ${contact.profession}`);
    if (contact.adresse) lines.push(`${indent}Adresse : ${contact.adresse}`);
    if (contact.ville) lines.push(`${indent}Ville : ${contact.ville}`);
    if (contact.codePostal) lines.push(`${indent}Code postal : ${contact.codePostal}`);
    if (contact.telephone) lines.push(`${indent}Telephone : ${contact.telephone}`);
    if (contact.email) lines.push(`${indent}Email : ${contact.email}`);
  }
  if (contact.raisonSociale) {
    lines.push(`${indent}Raison sociale : ${contact.raisonSociale}`);
    if (contact.siret) lines.push(`${indent}SIRET : ${contact.siret}`);
    if (contact.adresseSiegeSocial) lines.push(`${indent}Adresse siege : ${contact.adresseSiegeSocial}`);
    if (contact.emailEntreprise) lines.push(`${indent}Email : ${contact.emailEntreprise}`);
  }
  if (contact.denomination) {
    lines.push(`${indent}Denomination : ${contact.denomination}`);
    if (contact.adresse) lines.push(`${indent}Adresse : ${contact.adresse}`);
    if (contact.email) lines.push(`${indent}Email : ${contact.email}`);
  }
  if (contact.observations) lines.push(`${indent}Observations : ${contact.observations}`);
  return lines.length > 0 ? `${lines.join('\n')}\n` : `${indent}(Aucune donnee detaillee)\n`;
}

function formatPartie(partie, index) {
  const lines = [];
  lines.push(`  Partie ${index + 1} : ${partie.nomPartie || '(Partie sans nom)'}`);
  if (partie.partieData) lines.push(formatContactInfo(partie.partieData, '    '));
  if (Array.isArray(partie.avocats) && partie.avocats.length > 0) {
    lines.push('    Avocats de la partie :');
    for (const a of partie.avocats) {
      const nom = `${a.nomOfficeUser || a.nom || ''} ${a.prenomOfficeUser || a.prenoms || ''}`.trim();
      lines.push(`      - Me ${nom}`);
      if (a.email) lines.push(`        Email : ${a.email}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function formatProtagonists(dossierData) {
  const lines = [];
  const parties = dossierData.dossier?.parties || {};
  lines.push('[PARTIES POUR]');
  const pour = parties.pour || [];
  if (pour.length === 0) lines.push('  (Aucune partie pour)');
  else pour.forEach((p, i) => lines.push(formatPartie(p, i)));
  lines.push('');
  lines.push('[PARTIES CONTRE]');
  const contre = parties.contre || [];
  if (contre.length === 0) lines.push('  (Aucune partie contre)');
  else contre.forEach((p, i) => lines.push(formatPartie(p, i)));
  lines.push('');
  const contacts = dossierData.dossier?.contactsDuDossier || [];
  lines.push('[CONTACTS DIRECTEMENT LIES AU DOSSIER]');
  if (contacts.length === 0) lines.push('  (Aucun contact direct)');
  else contacts.forEach((c, i) => {
    const nom = `${c.nom || ''} ${c.prenoms || ''}`.trim() || c.raisonSociale || c.denomination || '(Contact sans nom)';
    lines.push(`  ${i + 1}. ${nom}`);
    lines.push(formatContactInfo(c, '     '));
  });
  lines.push('');
  return lines.join('\n');
}

function formatDocumentIndex(documents) {
  const lines = [];
  documents.forEach((doc, i) => {
    const ext = path.extname(doc.nomDocument || '').replace('.', '') || '?';
    lines.push(`  ${i + 1}. ${doc.nomDocument || '(Sans nom)'}`);
    lines.push(`     Type : ${ext} | Date : ${formatDateShort(doc.dateCreation)}`);
    lines.push(`     Emplacement : ${doc.emplacement}`);
    lines.push('');
  });
  return lines.join('\n');
}

function formatDocumentContent(doc, index, total) {
  const lines = [];
  lines.push(SEP_MINOR);
  lines.push(`DOCUMENT ${index + 1}/${total}`);
  lines.push(SEP_MINOR);
  lines.push(`Nom : ${doc.nomDocument || '(Sans nom)'}`);
  lines.push(`Type : ${path.extname(doc.nomDocument || '').replace('.', '') || '?'}`);
  lines.push(`Date : ${formatDateShort(doc.dateCreation)}`);
  lines.push(`Emplacement : ${doc.emplacement}`);
  lines.push(`Methode d'extraction : ${doc.extractionMethod || 'Non traitee'}`);
  lines.push('');
  if (doc.extractionError) lines.push(`[ECHEC D'EXTRACTION] Raison : ${doc.extractionError}`);
  else if (doc.extractedText) { lines.push('[CONTENU]'); lines.push(doc.extractedText); }
  else lines.push('[AUCUN CONTENU EXTRAIT]');
  lines.push('');
  return lines.join('\n');
}

function buildTxtContent(dossierData, extractedDocuments) {
  const lines = [];
  const details = dossierData.dossier?.dossier || {};
  lines.push(SEP_MAJOR, 'EXPORT TEXTE COMPLET DU DOSSIER', SEP_MAJOR, '');
  lines.push(`Nom du dossier : ${details.nom || '(Dossier sans nom)'}`);
  lines.push(`ID dossier : ${dossierData._id || '?'}`);
  lines.push(`Reference : ${dossierData.reference || '?'}`);
  lines.push(`Date de generation : ${formatDate(new Date())}`);
  if (details.type_dossier) lines.push(`Type de dossier : ${details.type_dossier}`);
  if (details.description_dossier) lines.push(`Description : ${details.description_dossier}`);
  if (details.selectedTribunalAffaire) {
    const t = details.selectedTribunalAffaire;
    if (typeof t === 'string') lines.push(`Juridiction : ${t}`);
    else if (t.nom || t.label) lines.push(`Juridiction : ${t.nom || t.label}`);
  }
  lines.push('');
  lines.push(SEP_MAJOR, 'PROTAGONISTES DU DOSSIER', SEP_MAJOR, '');
  lines.push(formatProtagonists(dossierData));
  lines.push(SEP_MAJOR, `INDEX DES DOCUMENTS (${extractedDocuments.length} documents)`, SEP_MAJOR, '');
  lines.push(formatDocumentIndex(extractedDocuments));
  lines.push(SEP_MAJOR, 'CONTENU DES DOCUMENTS', SEP_MAJOR, '');
  const total = extractedDocuments.length;
  for (let i = 0; i < total; i++) lines.push(formatDocumentContent(extractedDocuments[i], i, total));
  const errors = extractedDocuments.filter((d) => d.extractionError);
  if (errors.length > 0) {
    lines.push(SEP_MAJOR, `RESUME DES ERREURS (${errors.length}/${total} documents en echec)`, SEP_MAJOR, '');
    errors.forEach((doc, i) => lines.push(`  ${i + 1}. ${doc.nomDocument} — ${doc.extractionError}`));
    lines.push('');
  }
  lines.push(SEP_MAJOR, "FIN DE L'EXPORT", SEP_MAJOR);
  return lines.join('\n');
}

/**
 * Orchestrateur : extrait le texte de tous les documents d'un dossier.
 * @param {object} dossierData  Dossier complet (lean) : { _id, reference, subfolders, dossier: { dossier, parties, contactsDuDossier, documents } }
 * @param {(docId:string, fileName:string) => Promise<{buffer:Buffer, filename?:string}|null>} fetchBytes
 * @param {(current:number,total:number,name:string)=>void} [onProgress]
 * @returns {Promise<{ txtContent:string, fileName:string, total:number, errorCount:number }>}
 */
async function generateFullTextExport(dossierData, fetchBytes, onProgress) {
  const documents = collectAllDocuments(dossierData);
  const total = documents.length;
  for (let i = 0; i < total; i++) {
    const doc = documents[i];
    if (onProgress) { try { onProgress(i + 1, total, doc.nomDocument); } catch (_) {} }
    try {
      const fetched = await fetchBytes(doc._idStr, doc.nomDocument);
      if (!fetched || !Buffer.isBuffer(fetched.buffer)) {
        doc.extractionMethod = 'ECHEC';
        doc.extractionError = 'Aucun fichier serveur pour ce document (créé avec l\'ancienne application de bureau, ou non synchronisé).';
        continue;
      }
      const result = await extractTextFromBuffer(fetched.buffer, fetched.filename || doc.nomDocument);
      doc.extractedText = result.text;
      doc.extractionMethod = result.method;
      if (result.error) doc.extractionError = result.error;
    } catch (err) {
      doc.extractionMethod = 'ECHEC';
      doc.extractionError = `Erreur : ${err.message}`;
    }
  }
  const txtContent = buildTxtContent(dossierData, documents);
  const nom = dossierData.dossier?.dossier?.nom || 'Dossier';
  const cleanNom = nom.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const fileName = `Export_Complet_${cleanNom}_${dateStr}.txt`;
  const errorCount = documents.filter((d) => d.extractionError).length;
  return { txtContent, fileName, total, errorCount };
}

module.exports = {
  generateFullTextExport,
  extractTextFromBuffer,
  collectAllDocuments,
  buildTxtContent,
  isTextQualitySufficient,
};
