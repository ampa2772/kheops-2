// electron-app/services/docxModifier.js
const fs = require('fs');
const PizZip = require('pizzip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

/**
 * Traite le contenu XML d'un fichier Word pour convertir les marqueurs de formatage
 * en vrai formatage Word :
 *   - <strong>...</strong> et [G]...[G] => gras (w:b)
 *   - <em>...</em> => italique (w:i)
 * @param {Document} doc - Le document XML parse par DOMParser
 * @returns {boolean} true si des modifications ont ete effectuees
 */
function processXmlDocument(doc) {
  const paragraphs = doc.getElementsByTagName("w:p");
  let modified = false;

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const runs = p.getElementsByTagName("w:r");

    // Recuperer tout le texte du paragraphe (y compris les sauts de ligne <w:br/>)
    let fullText = "";
    for (let j = 0; j < runs.length; j++) {
      const childNodes = runs[j].childNodes;
      for (let k = 0; k < childNodes.length; k++) {
        const child = childNodes[k];
        if (child.nodeName === "w:t") {
          fullText += child.textContent;
        } else if (child.nodeName === "w:br") {
          fullText += "§§BR§§";
        }
        // On ignore w:rPr et autres elements
      }
    }

    // Verifier si le texte contient nos marqueurs (gras ou italique)
    if (fullText.match(/<strong>.*?<\/strong>/) || fullText.match(/\[G\].*?\[G\]/) || fullText.match(/<em>.*?<\/em>/)) {
      modified = true;

      // Remplacer les marqueurs par des tokens uniques
      let processedText = fullText
        .replace(/<strong>(.*?)<\/strong>/g, "§§BOLDSTART§§$1§§BOLDEND§§")
        .replace(/\[G\](.*?)\[G\]/g, "§§BOLDSTART§§$1§§BOLDEND§§")
        .replace(/<em>(.*?)<\/em>/g, "§§ITALICSTART§§$1§§ITALICEND§§");

      // Parser les fragments
      const fragments = parseFragments(processedText);

      // Supprimer les anciens runs
      while (runs.length > 0) {
        p.removeChild(runs[0]);
      }

      // Creer les nouveaux runs (avec preservation des sauts de ligne)
      fragments.forEach((fragment) => {
        if (fragment.isBreak) {
          // Recreer un run <w:r><w:br/></w:r> pour le saut de ligne
          const brRun = doc.createElement("w:r");
          brRun.appendChild(doc.createElement("w:br"));
          p.appendChild(brRun);
          return;
        }

        const { text, isBold, isItalic } = fragment;
        const newRun = doc.createElement("w:r");

        if (isBold || isItalic) {
          const rPr = doc.createElement("w:rPr");
          if (isBold) {
            rPr.appendChild(doc.createElement("w:b"));
          }
          if (isItalic) {
            rPr.appendChild(doc.createElement("w:i"));
          }
          newRun.appendChild(rPr);
        }

        const t = doc.createElement("w:t");
        // Important : preserver les espaces
        if (text.startsWith(" ") || text.endsWith(" ")) {
          t.setAttribute("xml:space", "preserve");
        }
        t.textContent = text;
        newRun.appendChild(t);

        p.appendChild(newRun);
      });
    }
  }

  return modified;
}

/**
 * Remplace les balises de formatage par du vrai formatage Word :
 *   - <strong>...</strong> et [G]...[G] => gras (w:b)
 *   - <em>...</em> => italique (w:i)
 * Traite word/document.xml ET tous les fichiers word/header*.xml
 * @param {string} filePath - Chemin vers le fichier .docx
 */
function applyBoldFormatting(filePath) {
  try {
    // 1. Lire le fichier
    const content = fs.readFileSync(filePath);
    const zip = new PizZip(content);
    let anyModified = false;

    // 2. Liste des fichiers XML a traiter : document.xml + header*.xml
    const xmlFilesToProcess = ['word/document.xml'];

    // Trouver tous les fichiers header dans le ZIP
    const zipFiles = Object.keys(zip.files);
    zipFiles.forEach((fileName) => {
      if (/^word\/header\d*\.xml$/.test(fileName)) {
        xmlFilesToProcess.push(fileName);
      }
    });

    // 3. Traiter chaque fichier XML
    xmlFilesToProcess.forEach((xmlFileName) => {
      const xmlFile = zip.file(xmlFileName);
      if (!xmlFile) return;

      const xmlContent = xmlFile.asText();
      const doc = new DOMParser().parseFromString(xmlContent, "text/xml");

      const modified = processXmlDocument(doc);

      if (modified) {
        anyModified = true;
        const serializer = new XMLSerializer();
        const newXml = serializer.serializeToString(doc);
        zip.file(xmlFileName, newXml);
        console.log(`[DocxModifier] Formatage gras applique sur : ${xmlFileName} dans ${filePath}`);
      }
    });

    // 4. Sauvegarder si modifie
    if (anyModified) {
      const buffer = zip.generate({ type: "nodebuffer" });
      fs.writeFileSync(filePath, buffer);
      console.log(`[DocxModifier] Formatage gras applique sur : ${filePath}`);
    } else {
      console.log(`[DocxModifier] Aucune modification necessaire pour : ${filePath}`);
    }

  } catch (error) {
    console.error(`[DocxModifier] Erreur lors du traitement de ${filePath}:`, error);
    throw error;
  }
}

/**
 * Decoupe le texte en fragments (texte, isBold, isItalic)
 */
function parseFragments(text) {
  const fragments = [];
  const parts = text.split(/(§§BOLDSTART§§|§§BOLDEND§§|§§ITALICSTART§§|§§ITALICEND§§)/);
  let currentBold = false;
  let currentItalic = false;

  for (const part of parts) {
    if (part === "§§BOLDSTART§§") {
      currentBold = true;
    } else if (part === "§§BOLDEND§§") {
      currentBold = false;
    } else if (part === "§§ITALICSTART§§") {
      currentItalic = true;
    } else if (part === "§§ITALICEND§§") {
      currentItalic = false;
    } else if (part !== "") {
      // Sub-split par §§BR§§ pour produire des fragments texte et des fragments break
      const subParts = part.split(/(§§BR§§)/);
      for (const sub of subParts) {
        if (sub === "§§BR§§") {
          fragments.push({ isBreak: true });
        } else if (sub !== "") {
          fragments.push({ text: sub, isBold: currentBold, isItalic: currentItalic, isBreak: false });
        }
      }
    }
  }
  return fragments;
}

module.exports = { applyBoldFormatting };
