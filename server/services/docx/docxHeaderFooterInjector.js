// server/services/docx/docxHeaderFooterInjector.js
// Injecte un en-tete (header) et une signature dans un document .docx
// - Header = texte uniquement, centre, dans la vraie zone d'en-tete Word
//   (premiere page seulement : ref type="first" + w:titlePg)
// - Signature = image (alignee a droite) + texte optionnel, inseree A LA FIN
//   DU CORPS du document (avant le w:sectPr final) : elle n'apparait donc
//   qu'UNE SEULE FOIS, sur la DERNIERE page, a la suite du texte.
//   (Fix 2026-07-04 : auparavant la signature etait posee en pied de page
//   default+first => repetee au bas de CHAQUE page sur les documents longs.)
// Utilise PizZip pour le ZIP + manipulation string pour le XML (pas de DOM)

const fs = require('fs');
const PizZip = require('pizzip');
// Note: @xmldom/xmldom n'est PAS utilise ici (serialisation namespaces bugguee pour r:id)
// On utilise une approche 100% string pour manipuler document.xml

// ========================================================================
// Constantes XML (namespaces OOXML)
// ========================================================================

const WPML_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PIC_NS = 'http://schemas.openxmlformats.org/drawingml/2006/picture';

// ========================================================================
// Generateurs XML
// ========================================================================

/**
 * Genere le XML d'un header Word (en-tete avec formatage personnalisable)
 * @param {string} text - Texte de l'en-tete (supporte \n pour les sauts de ligne)
 * @param {string} [fontFamily='Calibri'] - Police de l'en-tete
 * @param {number} [fontSize=10] - Taille en points de l'en-tete
 * @param {string} [fontWeight='normal'] - Graisse : 'normal', 'bold', '800'
 * @param {string} [textAlign='center'] - Alignement : 'left', 'center', 'right', 'justify'
 * @returns {string} XML complet du header
 */
function buildHeaderXml(text, fontFamily, fontSize, fontWeight, textAlign) {
  const font = fontFamily || 'Calibri';
  const size = fontSize || 10;
  // OOXML utilise des demi-points : 10pt = val="20", 12pt = val="24"
  const sizeHalfPt = size * 2;

  // Mapping alignement CSS -> OOXML (justify = "both" en OOXML)
  const alignMap = { left: 'left', center: 'center', right: 'right', justify: 'both' };
  const jcVal = alignMap[textAlign] || 'center';

  // Bold conditionnel (OOXML: <w:b/> pour bold, <w:bCs/> pour complex scripts)
  const boldXml = (fontWeight === 'bold' || fontWeight === '800') ? '<w:b/><w:bCs/>' : '';

  let paragraphs = '';

  if (text && text.trim()) {
    const lines = text.split('\n');
    for (const line of lines) {
      paragraphs += `
    <w:p>
      <w:pPr><w:jc w:val="${jcVal}"/></w:pPr>
      <w:r>
        <w:rPr>${boldXml}<w:rFonts w:ascii="${escapeXml(font)}" w:hAnsi="${escapeXml(font)}" w:cs="${escapeXml(font)}"/><w:sz w:val="${sizeHalfPt}"/><w:szCs w:val="${sizeHalfPt}"/></w:rPr>
        <w:t xml:space="preserve">${escapeXml(line)}</w:t>
      </w:r>
    </w:p>`;
    }
  }

  if (!paragraphs) {
    paragraphs = '<w:p/>';
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="${WPML_NS}" xmlns:r="${R_NS}">
  ${paragraphs}
</w:hdr>`;
}

/**
 * Genere les paragraphes de signature a inserer EN FIN DE CORPS du document
 * (image alignee a droite + texte optionnel sous l'image).
 * Contrairement a un pied de page, ces paragraphes ne sont rendus qu'une fois,
 * a la suite du texte — donc sur la DERNIERE page du document.
 *
 * Les namespaces wp/a/pic sont declares directement sur <w:drawing> : le
 * document.xml d'un template minimal (docx vierge) ne les declare pas
 * forcement sur la racine, et un prefixe non declare rend le fichier illisible
 * pour Word.
 *
 * @param {string} text - Texte sous la signature (nom de l'avocat)
 * @param {string|null} imageRelId - Relationship ID (document.xml.rels) de l'image ou null
 * @param {object|null} imageDims - { widthEmu, heightEmu }
 * @returns {string} Fragment XML (suite de <w:p>) SANS prologue, a inserer dans w:body
 */
function buildSignatureParagraphsXml(text, imageRelId, imageDims) {
  let paragraphs = '';

  // Image de signature (si presente) — alignee a droite
  if (imageRelId && imageDims) {
    paragraphs += `<w:p>
      <w:pPr><w:jc w:val="right"/></w:pPr>
      <w:r>
        <w:rPr/>
        <w:drawing xmlns:wp="${WP_NS}" xmlns:a="${A_NS}" xmlns:pic="${PIC_NS}">
          <wp:inline distT="0" distB="0" distL="0" distR="0">
            <wp:extent cx="${imageDims.widthEmu}" cy="${imageDims.heightEmu}"/>
            <wp:docPr id="2" name="Signature Image"/>
            <a:graphic>
              <a:graphicData uri="${PIC_NS}">
                <pic:pic>
                  <pic:nvPicPr>
                    <pic:cNvPr id="2" name="signature_image.png"/>
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
  }

  // Texte sous la signature (nom de l'avocat) — aligne a droite
  if (text && text.trim()) {
    const lines = text.split('\n');
    for (const line of lines) {
      paragraphs += `<w:p>
      <w:pPr><w:jc w:val="right"/></w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
        <w:t xml:space="preserve">${escapeXml(line)}</w:t>
      </w:r>
    </w:p>`;
    }
  }

  if (!paragraphs) return '';

  // Paragraphe vide en amont : espace la signature du dernier paragraphe du texte.
  return `<w:p/>${paragraphs}`;
}

// ========================================================================
// Utilitaires images
// ========================================================================

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
 * Calcule les dimensions de l'image en EMU (English Metric Units)
 * 1cm = 360000 EMU, 1px = 9525 EMU a 96 DPI
 * @param {Buffer} imageBuffer - Buffer de l'image
 * @param {number} maxWidthCm - Largeur maximum en cm
 * @param {number} maxHeightCm - Hauteur maximum en cm
 */
function calculateImageDimensions(imageBuffer, maxWidthCm, maxHeightCm) {
  const dims = getImageDimensions(imageBuffer);
  const maxWidthEmu = maxWidthCm * 360000;
  const maxHeightEmu = maxHeightCm * 360000;

  if (dims) {
    console.log(`[HeaderFooterInjector] Image dimensions detectees: ${dims.width}x${dims.height}px`);
    const ratio = dims.width / dims.height;
    let widthEmu = dims.width * 9525; // pixels -> EMU (1px = 9525 EMU a 96 DPI)
    let heightEmu = dims.height * 9525;

    if (widthEmu > maxWidthEmu) {
      widthEmu = maxWidthEmu;
      heightEmu = Math.round(widthEmu / ratio);
    }
    if (heightEmu > maxHeightEmu) {
      heightEmu = maxHeightEmu;
      widthEmu = Math.round(heightEmu * ratio);
    }

    console.log(`[HeaderFooterInjector] Dimensions EMU: ${widthEmu}x${heightEmu} (${(widthEmu/360000).toFixed(1)}cm x ${(heightEmu/360000).toFixed(1)}cm)`);
    return { widthEmu, heightEmu };
  }

  // Fallback : 3cm x 1cm (taille raisonnable pour une signature)
  console.warn('[HeaderFooterInjector] Dimensions image non detectees, fallback 3cm x 1cm');
  return {
    widthEmu: 3 * 360000,   // 3cm
    heightEmu: 1 * 360000,  // 1cm
  };
}

/**
 * Lit les dimensions (width, height) depuis le header binaire d'une image (PNG ou JPEG)
 */
function getImageDimensions(buffer) {
  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }

  // JPEG — scan des marqueurs SOF (Start of Frame) pour trouver les dimensions
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xFF) break;
      const marker = buffer[offset + 1];
      // SOF markers: 0xC0-0xCF sauf 0xC4 (DHT), 0xC8 (JPG ext), 0xCC (DAC)
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height };
      }
      const segmentLength = buffer.readUInt16BE(offset + 2);
      offset += 2 + segmentLength;
    }
  }

  return null;
}

/**
 * Echappe les caracteres speciaux XML
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ========================================================================
// Fonction principale
// ========================================================================

/**
 * Injecte l'en-tete et la signature dans un fichier .docx
 *
 * - Header = texte centre, dans la vraie zone d'en-tete Word ; ref type "first"
 *   + w:titlePg ("Premiere page differente") => en-tete sur la premiere page seulement
 * - Signature = image a droite + texte optionnel, inseree EN FIN DE CORPS du
 *   document (avant le w:sectPr final) => une seule occurrence, sur la DERNIERE
 *   page, a la suite du texte. AUCUN pied de page n'est cree (fix 2026-07-04 :
 *   l'ancienne injection en footer default+first repetait la signature au bas
 *   de chaque page des documents longs).
 *
 * @param {string} docxPath - Chemin vers le fichier .docx a modifier
 * @param {object} options
 * @param {string} [options.headerText] - Texte de l'en-tete (compose depuis les champs profil)
 * @param {string} [options.signatureText] - Texte sous la signature (nom de l'avocat)
 * @param {string} [options.signatureImageBase64] - Image Base64 de la signature
 */
function injectHeaderAndFooter(docxPath, options = {}) {
  const { headerText, headerFontFamily, headerFontSize, headerFontWeight, headerTextAlign, signatureText, signatureImageBase64 } = options;

  const hasHeader = headerText && headerText.trim();
  const hasSignature = (signatureText && signatureText.trim()) || signatureImageBase64;

  if (!hasHeader && !hasSignature) {
    console.log('[HeaderFooterInjector] Rien a injecter (pas d\'en-tete ni de signature).');
    return;
  }

  console.log(`[HeaderFooterInjector] Injection dans : ${docxPath}`);
  console.log(`  - En-tete : texte=${!!hasHeader}`);
  console.log(`  - Signature (fin de corps, derniere page) : texte=${!!(signatureText && signatureText.trim())}, image=${!!signatureImageBase64}`);

  try {
    // 1. Lire le fichier .docx
    const content = fs.readFileSync(docxPath);
    const zip = new PizZip(content);

    // 1b. Nettoyer les anciennes relationships header/footer AVANT d'en ajouter de nouvelles
    //     (evite les doublons si le template avait deja des headers/footers,
    //      ET doit absolument etre fait AVANT addDocumentRelationship pour ne pas
    //      supprimer nos propres relationships fraichement ajoutees)
    cleanOldHeaderFooterRelationships(zip);

    // Compteur pour les relationship IDs uniques dans document.xml.rels
    let nextDocRelId = findMaxRelId(zip, 'word/_rels/document.xml.rels') + 1;

    // Variables pour tracker les relationship IDs / fragment signature
    let headerFirstRelId = null;
    let signatureBodyXml = '';

    // 2. Traiter l'en-tete (header) — texte uniquement, centre, PREMIERE PAGE SEULEMENT
    if (hasHeader) {
      const headerXml = buildHeaderXml(headerText, headerFontFamily, headerFontSize, headerFontWeight, headerTextAlign);

      // Creer UN SEUL fichier header (pour la premiere page uniquement)
      zip.file('word/header1.xml', headerXml);

      // Ajouter le content type
      addOverrideContentType(zip, '/word/header1.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml');

      // Ajouter UNE SEULE relation type="first" (premiere page seulement)
      headerFirstRelId = `rId${nextDocRelId++}`;
      addDocumentRelationship(zip, headerFirstRelId, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header', 'header1.xml');
    }

    // 3. Traiter la signature — image + texte, EN FIN DE CORPS (derniere page).
    //    Aucun footer n'est cree : un pied de page se repete sur chaque page.
    if (hasSignature) {
      let imageRelId = null;
      let imageDims = null;

      // Ajouter l'image de signature dans le zip si presente
      if (signatureImageBase64) {
        const img = decodeBase64Image(signatureImageBase64);
        const imageFileName = `signature_image.${img.extension}`;
        zip.file(`word/media/${imageFileName}`, img.buffer);

        // L'image est referencee depuis le CORPS du document : la relation va
        // dans word/_rels/document.xml.rels (et non dans des .rels de footer).
        addContentType(zip, img.extension, img.mimeType);
        imageRelId = `rId${nextDocRelId++}`;
        addDocumentRelationship(zip, imageRelId, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', `media/${imageFileName}`);

        imageDims = calculateImageDimensions(img.buffer, 4, 2); // 4cm max largeur, 2cm max hauteur pour signature
      }

      signatureBodyXml = buildSignatureParagraphsXml(signatureText || '', imageRelId, imageDims);
    }

    // 4. Mettre a jour document.xml : signature en fin de corps, refs header + titlePg
    updateDocumentXml(zip, null, headerFirstRelId, signatureBodyXml);

    // 5. Sauvegarder
    const buffer = zip.generate({ type: 'nodebuffer' });
    fs.writeFileSync(docxPath, buffer);
    console.log(`[HeaderFooterInjector] Injection reussie dans : ${docxPath}`);

  } catch (error) {
    console.error(`[HeaderFooterInjector] Erreur:`, error.message || error);
    throw error;
  }
}

// ========================================================================
// Manipulation du ZIP (Content Types, Relations)
// ========================================================================

/**
 * Trouve le plus grand rId numerique dans un fichier .rels
 */
function findMaxRelId(zip, relsPath) {
  const relsFile = zip.file(relsPath);
  if (!relsFile) return 0;

  const relsXml = relsFile.asText();
  const matches = relsXml.match(/Id="rId(\d+)"/g);
  if (!matches) return 0;

  let max = 0;
  for (const m of matches) {
    const num = parseInt(m.match(/rId(\d+)/)[1], 10);
    if (num > max) max = num;
  }
  return max;
}

/**
 * Ajoute un type d'extension dans [Content_Types].xml
 */
function addContentType(zip, extension, mimeType) {
  const ctFile = zip.file('[Content_Types].xml');
  if (!ctFile) return;

  let ctXml = ctFile.asText();
  const extLower = extension.toLowerCase();
  if (ctXml.includes(`Extension="${extLower}"`)) return;

  const insertBefore = '</Types>';
  const newEntry = `  <Default Extension="${extLower}" ContentType="${mimeType}"/>\n`;
  ctXml = ctXml.replace(insertBefore, newEntry + insertBefore);

  zip.file('[Content_Types].xml', ctXml);
}

/**
 * Ajoute un Override dans [Content_Types].xml
 */
function addOverrideContentType(zip, partName, contentType) {
  const ctFile = zip.file('[Content_Types].xml');
  if (!ctFile) return;

  let ctXml = ctFile.asText();
  if (ctXml.includes(`PartName="${partName}"`)) return;

  const insertBefore = '</Types>';
  const newEntry = `  <Override PartName="${partName}" ContentType="${contentType}"/>\n`;
  ctXml = ctXml.replace(insertBefore, newEntry + insertBefore);

  zip.file('[Content_Types].xml', ctXml);
}

/**
 * Ajoute une Relationship dans word/_rels/document.xml.rels
 */
function addDocumentRelationship(zip, relId, type, target) {
  const relsPath = 'word/_rels/document.xml.rels';
  const relsFile = zip.file(relsPath);

  if (!relsFile) {
    const newRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="${relId}" Type="${type}" Target="${target}"/>
</Relationships>`;
    zip.file(relsPath, newRels);
    return;
  }

  let relsXml = relsFile.asText();
  if (relsXml.includes(`Target="${target}"`)) return;

  const newEntry = `  <Relationship Id="${relId}" Type="${type}" Target="${target}"/>\n`;

  if (relsXml.includes('</Relationships>')) {
    relsXml = relsXml.replace('</Relationships>', newEntry + '</Relationships>');
  } else if (/<Relationships\b[^>]*\/>/.test(relsXml)) {
    // A minimal, but valid, DOCX may use a self-closing Relationships root
    // when it does not contain any relationship yet. Expanding that root is
    // required before adding the image/header relationship; silently calling
    // String#replace with a missing closing tag left the drawing unresolved.
    relsXml = relsXml.replace(
      /<Relationships\b([^>]*)\/>/,
      `<Relationships$1>\n${newEntry}</Relationships>`
    );
  } else {
    throw new Error(`Fichier de relations DOCX invalide : ${relsPath}`);
  }

  zip.file(relsPath, relsXml);
}

// ========================================================================
// Mise a jour de document.xml (sectPr + titlePg)
// ========================================================================

/**
 * Met a jour word/document.xml (approche 100% string, pas de DOM) :
 * - Insere les paragraphes de signature EN FIN DE CORPS (avant le w:sectPr final)
 *   => signature une seule fois, sur la derniere page (fix 2026-07-04)
 * - Ajoute headerReference type="first" (en-tete premiere page seulement)
 * - Ajoute <w:titlePg/> pour activer "Premiere page differente"
 * - Ne cree AUCUNE footerReference (les anciennes sont retirees)
 *
 * NOTE : On n'utilise PAS xmldom/DOMParser ici car createElementNS() + setAttribute()
 * produit du XML mal serialise (namespaces r:id corrompus). L'approche string garantit
 * un XML parfaitement forme, identique a ce que Word genere nativement.
 */
function updateDocumentXml(zip, headerDefaultRelId, headerFirstRelId, signatureBodyXml) {
  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    console.warn('[HeaderFooterInjector] word/document.xml non trouve !');
    return;
  }

  let xml = docFile.asText();

  // 1. Supprimer les references header/footer existantes (self-closing et avec balise fermante)
  //    Les footerReference sont retirees SANS remplacement : la signature vit
  //    desormais dans le corps du document, plus jamais en pied de page.
  xml = xml.replace(/<w:headerReference\b[^>]*\/>/g, '');
  xml = xml.replace(/<w:headerReference\b[^>]*><\/w:headerReference>/g, '');
  xml = xml.replace(/<w:footerReference\b[^>]*\/>/g, '');
  xml = xml.replace(/<w:footerReference\b[^>]*><\/w:footerReference>/g, '');
  xml = xml.replace(/<w:titlePg\s*\/>/g, '');
  xml = xml.replace(/<w:titlePg\s*><\/w:titlePg>/g, '');

  // 1b. Inserer la signature en fin de corps : juste AVANT le dernier <w:sectPr
  //     (sectPr de w:body = proprietes de la derniere section, dernier enfant du body).
  //     Fait AVANT l'etape refs/titlePg pour que les indices restent coherents.
  if (signatureBodyXml) {
    const bodySectPrIdx = xml.lastIndexOf('<w:sectPr');
    if (bodySectPrIdx !== -1) {
      xml = xml.substring(0, bodySectPrIdx) + signatureBodyXml + xml.substring(bodySectPrIdx);
    } else {
      // Pas de sectPr : inserer avant la fermeture du body
      xml = xml.replace('</w:body>', `${signatureBodyXml}</w:body>`);
    }
  }

  // 2. Construire SEPAREMENT les references et titlePg
  //    IMPORTANT (ECMA-376) : dans <w:sectPr>, l'ordre des elements enfants est strict :
  //    - D'abord : headerReference, footerReference (groupe EG_HdrFtrReferences)
  //    - Ensuite : pgSz, pgMar, cols, etc. (groupe EG_SectPrContents)
  //    - En fin  : titlePg (fait partie de EG_SectPrContents, apres les elements de mise en page)
  //    Si titlePg est insere AVANT pgSz/pgMar, Word considere le XML invalide → "contenu illisible"

  let hdrFtrRefs = '';
  if (headerDefaultRelId) hdrFtrRefs += `<w:headerReference w:type="default" r:id="${headerDefaultRelId}"/>`;
  if (headerFirstRelId) hdrFtrRefs += `<w:headerReference w:type="first" r:id="${headerFirstRelId}"/>`;

  // titlePg sera insere separement, AVANT </w:sectPr> (en fin de sectPr)
  const titlePgElement = '<w:titlePg/>';

  // 3. Trouver le DERNIER <w:sectPr (celui au niveau w:body, pas les section breaks)
  const lastSectPrIdx = xml.lastIndexOf('<w:sectPr');
  if (lastSectPrIdx === -1) {
    // Aucun sectPr → en creer un avant </w:body>
    console.warn('[HeaderFooterInjector] Aucun w:sectPr trouve, creation...');
    xml = xml.replace('</w:body>', `<w:sectPr>${hdrFtrRefs}${titlePgElement}</w:sectPr></w:body>`);
  } else {
    // Trouver la fin de la balise ouvrante
    const closingBracketIdx = xml.indexOf('>', lastSectPrIdx);
    if (closingBracketIdx === -1) {
      console.error('[HeaderFooterInjector] XML malformed: w:sectPr sans >');
      return;
    }

    if (xml[closingBracketIdx - 1] === '/') {
      // Cas auto-fermant <w:sectPr .../> → convertir en paire ouverte/fermee
      const before = xml.substring(0, closingBracketIdx - 1);
      const after = xml.substring(closingBracketIdx + 1);
      xml = before + '>' + hdrFtrRefs + titlePgElement + '</w:sectPr>' + after;
    } else {
      // Cas normal <w:sectPr ...>...</w:sectPr>
      // INSERTION 1 : headerReference + footerReference juste apres <w:sectPr>
      const beforeOpening = xml.substring(0, closingBracketIdx + 1);
      const afterOpening = xml.substring(closingBracketIdx + 1);
      xml = beforeOpening + hdrFtrRefs + afterOpening;

      // INSERTION 2 : titlePg juste AVANT </w:sectPr> (en fin, apres pgSz/pgMar/cols)
      // On re-cherche </w:sectPr> car les indices ont change apres l'insertion precedente
      const closingSectPrIdx = xml.indexOf('</w:sectPr>', lastSectPrIdx);
      if (closingSectPrIdx !== -1) {
        const beforeClose = xml.substring(0, closingSectPrIdx);
        const afterClose = xml.substring(closingSectPrIdx);
        xml = beforeClose + titlePgElement + afterClose;
      }
    }
  }

  // 4. S'assurer que xmlns:r est declare sur l'element racine <w:document>
  if (!xml.match(/<w:document\b[^>]*xmlns:r=/)) {
    xml = xml.replace(/<w:document\b/, `<w:document xmlns:r="${R_NS}"`);
  }

  // 5. NOTE: cleanOldHeaderFooterRelationships() est maintenant appele au DEBUT
  //    de injectHeaderAndFooter(), AVANT addDocumentRelationship() — voir etape 1b.
  //    (Si on l'appelle ici, il supprime nos propres rels fraichement ajoutees!)

  zip.file('word/document.xml', xml);
  console.log('[HeaderFooterInjector] document.xml mis a jour (titlePg place en fin de sectPr)');
}

/**
 * Supprime les anciennes Relationship entries dans document.xml.rels
 * qui pointent vers header1.xml, header2.xml, footer1.xml, footer2.xml
 * pour eviter les doublons quand on ajoute nos propres relationships.
 */
function cleanOldHeaderFooterRelationships(zip) {
  const relsPath = 'word/_rels/document.xml.rels';
  const relsFile = zip.file(relsPath);
  if (!relsFile) return;

  let relsXml = relsFile.asText();
  const originalLength = relsXml.length;

  // Supprimer les Relationship existantes qui pointent vers nos fichiers header/footer
  // Cible : Target="header1.xml", Target="header2.xml", Target="footer1.xml", Target="footer2.xml"
  relsXml = relsXml.replace(/<Relationship\b[^>]*Target="header[12]\.xml"[^>]*\/>\s*/g, '');
  relsXml = relsXml.replace(/<Relationship\b[^>]*Target="footer[12]\.xml"[^>]*\/>\s*/g, '');

  if (relsXml.length !== originalLength) {
    zip.file(relsPath, relsXml);
    console.log('[HeaderFooterInjector] Anciennes relationships header/footer nettoyees dans document.xml.rels');
  }
}

// removeExistingReferences() supprimee — plus necessaire avec l'approche string

module.exports = { injectHeaderAndFooter };
