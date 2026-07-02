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
 * Génération complète : rendu + gras (best-effort) + en-tête/signature (best-effort).
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
  let buffer = renderDocxBuffer(templateBuffer, variables);

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

    // 2) En-tête + signature (best-effort). N'agit que si du contenu est fourni.
    if ((header && header.trim()) || (signatureText && signatureText.trim()) || signatureImageBase64) {
      try {
        injectHeaderAndFooter(tmpFile, {
          headerText: header || '',
          headerFontFamily: fontOptions.fontFamily,
          headerFontSize: fontOptions.fontSize,
          headerFontWeight: fontOptions.fontWeight,
          headerTextAlign: fontOptions.textAlign,
          signatureText: signatureText || '',
          signatureImageBase64: signatureImageBase64 || '',
        });
      } catch (e) {
        console.warn('[docxGenerator] Injection en-tête/signature ignorée :', e.message);
      }
    }

    buffer = await fs.promises.readFile(tmpFile);
    return buffer;
  } finally {
    try { await fs.promises.rm(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = { renderDocxBuffer, generateDocx };
