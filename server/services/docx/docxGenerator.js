// server/services/docx/docxGenerator.js
//
// Génération .docx CÔTÉ SERVEUR (Phase 5 — seam du flux Word web/compagnon).
//
// Porte le cœur du moteur de l'app Electron (docGenerator.js) en version serveur,
// SANS dépendance Electron / Google Drive / cloudContext :
//   1. rendu docxtemplater (remplissage des {placeholders}) — PURE ;
//   2. formatage gras/italique best-effort (docxModifier — nécessite @xmldom/xmldom,
//      ignoré proprement s'il est absent) ;
//   3. injection en-tête (papier à en-tête) + signature (image/texte) via
//      docxHeaderFooterInjector — PURE (pizzip + fs).
//
// Le résultat est un Buffer .docx, que l'appelant (routes/word.js) écrit dans le
// stockage (GCS) sous `documents/<docId>.docx` — clé déjà servie par
// GET /api/word/:docId/download et ouverte par le compagnon dans Word.

const fs = require('fs');
const os = require('os');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { injectHeaderAndFooter } = require('./docxHeaderFooterInjector');

const RECIPIENT_ADDRESS_VARIABLES = new Set([
  'titre', 'civilite', 'prenom', 'nom', 'adresse', 'cp', 'ville',
]);

function decodeXmlText(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function paragraphTemplateVariables(paragraphXml) {
  const visible = decodeXmlText(String(paragraphXml || '').replace(/<[^>]+>/g, ''));
  return [...visible.matchAll(/\{\s*([^{}]+?)\s*\}/g)]
    .map((match) => String(match[1] || '').trim());
}

function paragraphWithRightAlignment(paragraphXml) {
  if (/<w:pPr\b[^>]*\/>/i.test(paragraphXml)) {
    return paragraphXml.replace(/<w:pPr\b[^>]*\/>/i, '<w:pPr><w:jc w:val="right"/></w:pPr>');
  }
  if (/<w:pPr\b[^>]*>/i.test(paragraphXml)) {
    if (/<w:jc\b[^>]*(?:\/>|>[\s\S]*?<\/w:jc>)/i.test(paragraphXml)) {
      return paragraphXml.replace(
        /<w:jc\b[^>]*(?:\/>|>[\s\S]*?<\/w:jc>)/i,
        '<w:jc w:val="right"/>',
      );
    }
    return paragraphXml.replace(/<\/w:pPr>/i, '<w:jc w:val="right"/></w:pPr>');
  }
  return paragraphXml.replace(/^(<w:p\b[^>]*>)/i, '$1<w:pPr><w:jc w:val="right"/></w:pPr>');
}

/**
 * Aligne uniquement les paragraphes du modèle qui portent les variables du
 * bloc d'adresse destinataire. Les autres paragraphes et leurs styles restent
 * strictement inchangés. Sans destinataire renseigné, le modèle est retourné
 * tel quel : aucune adresse ni aucun alignement n'est inventé.
 */
function alignRecipientAddressBlock(templateBuffer, variables = {}) {
  if (!Buffer.isBuffer(templateBuffer)) return templateBuffer;
  const available = new Set(
    Object.entries(variables || {})
      .filter(([name, value]) => RECIPIENT_ADDRESS_VARIABLES.has(name) && String(value ?? '').trim())
      .map(([name]) => name),
  );
  if (!available.size) return templateBuffer;

  const zip = new PizZip(templateBuffer);
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) return templateBuffer;
  const xml = documentFile.asText();
  const updated = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gi, (paragraph) => {
    const carriesRecipientData = paragraphTemplateVariables(paragraph)
      .some((name) => available.has(name));
    return carriesRecipientData ? paragraphWithRightAlignment(paragraph) : paragraph;
  });
  if (updated === xml) return templateBuffer;
  zip.file('word/document.xml', updated);
  return zip.generate({ type: 'nodebuffer' });
}

/**
 * Rendu pur : template .docx + variables → buffer .docx rempli.
 * Options docxtemplater identiques à l'app Electron (delimiters {…}, paragraphLoop,
 * linebreaks, nullGetter → '' pour ne jamais laisser de tag non résolu).
 * @param {Buffer} templateBuffer
 * @param {object} variables
 * @returns {Buffer}
 */
function renderDocxBuffer(templateBuffer, variables = {}) {
  if (!Buffer.isBuffer(templateBuffer)) {
    throw new Error('templateBuffer (Buffer) requis.');
  }
  // Signature ZIP "PK" (0x50 0x4B) — un .docx est un ZIP.
  if (templateBuffer.length < 4 || templateBuffer[0] !== 0x50 || templateBuffer[1] !== 0x4B) {
    throw new Error('Template invalide : ce n\'est pas un .docx (signature ZIP "PK" absente).');
  }
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{', end: '}' },
    nullGetter: () => '',
  });
  doc.render(variables); // API docxtemplater 3.x (remplace setData()+render())
  return doc.getZip().generate({ type: 'nodebuffer' });
}

/**
 * Génération complète : rendu + gras (best-effort) + en-tête/signature stricte
 * lorsqu'un contenu de profil a été fourni.
 * @param {object} opts
 * @param {Buffer} opts.templateBuffer
 * @param {object} [opts.variables]
 * @param {string} [opts.header]                texte d'en-tête (papier à en-tête)
 * @param {string} [opts.signatureText]
 * @param {string} [opts.signatureImageBase64]  image de signature (data URI ou base64)
 * @param {object} [opts.fontOptions]           { fontFamily, fontSize, fontWeight, textAlign }
 * @param {boolean} [opts.applyBold=true]
 * @returns {Promise<Buffer>}
 */
async function generateDocx({
  templateBuffer,
  variables = {},
  header = '',
  signatureText = '',
  signatureImageBase64 = '',
  fontOptions = {},
  applyBold = true,
} = {}) {
  const preparedTemplate = alignRecipientAddressBlock(templateBuffer, variables);
  let buffer = renderDocxBuffer(preparedTemplate, variables);

  // Les injecteurs travaillent sur un FICHIER → on passe par un dossier temporaire.
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kheops-docx-'));
  const tmpFile = path.join(tmpDir, 'out.docx');
  try {
    await fs.promises.writeFile(tmpFile, buffer);

    // 1) Gras/italique (best-effort — nécessite @xmldom/xmldom ; ignoré si absent).
    if (applyBold) {
      try {
        const { applyBoldFormatting } = require('./docxModifier');
        applyBoldFormatting(tmpFile);
      } catch (e) {
        console.warn('[docxGenerator] Formatage gras ignoré (option) :', e.message);
      }
    }

    // 2) En-tête + signature. N'agit que si du contenu est réellement fourni.
    // Quand le profil en contient, une erreur doit interrompre la génération :
    // retourner silencieusement un courrier amputé ne respecterait pas les
    // paramètres documentaires choisis par l'utilisateur.
    if ((header && header.trim()) || (signatureText && signatureText.trim()) || signatureImageBase64) {
      injectHeaderAndFooter(tmpFile, {
        headerText: header || '',
        headerFontFamily: fontOptions.fontFamily,
        headerFontSize: fontOptions.fontSize,
        headerFontWeight: fontOptions.fontWeight,
        headerTextAlign: fontOptions.textAlign,
        signatureText: signatureText || '',
        signatureImageBase64: signatureImageBase64 || '',
      });
    }

    buffer = await fs.promises.readFile(tmpFile);
    return buffer;
  } finally {
    try { await fs.promises.rm(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

/**
 * Fabrique un .docx VIERGE minimal et valide (un paragraphe vide), sans
 * dépendre d'un modèle provisionné dans le stockage. Utilisé par la route
 * POST /api/word/:docId/create-blank (bouton « Document vierge » du mode web).
 * Word/LibreOffice ouvrent sans broncher ce squelette OOXML à 3 pièces
 * ([Content_Types].xml, _rels/.rels, word/document.xml).
 * @returns {Buffer}
 */
function buildBlankDocxBuffer() {
  const zip = new PizZip();
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '</Types>');
  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>');
  zip.file('word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:body><w:p/><w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
    + '<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/>'
    + '</w:sectPr></w:body></w:document>');
  return zip.generate({ type: 'nodebuffer' });
}

module.exports = {
  alignRecipientAddressBlock,
  renderDocxBuffer,
  generateDocx,
  buildBlankDocxBuffer,
};
