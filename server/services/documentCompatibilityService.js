const PizZip = require('pizzip');

function count(text, pattern) {
  return (String(text || '').match(pattern) || []).length;
}

function isDocxBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  try {
    const zip = new PizZip(buffer);
    return Boolean(zip.file('[Content_Types].xml') && zip.file('word/document.xml'));
  } catch (_) {
    return false;
  }
}

function analyzeDocx(buffer) {
  const warnings = [];
  let zip;
  try {
    zip = new PizZip(buffer);
  } catch (err) {
    return { level: 'complex', score: 100, warnings: ['Le fichier DOCX est illisible ou endommagé.'], features: {} };
  }
  const names = Object.keys(zip.files);
  const xml = (name) => zip.file(name)?.asText?.() || '';
  const documentXml = xml('word/document.xml');
  const settingsXml = xml('word/settings.xml');
  const relationships = names.filter((n) => /_rels\/.*\.rels$/i.test(n)).map(xml).join('\n');
  const features = {
    macros: names.some((n) => /vbaProject\.bin$/i.test(n)),
    embeddedObjects: names.some((n) => /word\/embeddings\//i.test(n)),
    smartArt: names.some((n) => /word\/diagrams\//i.test(n)),
    floatingTextBoxes: /<w:txbxContent\b|<wps:wsp\b/i.test(documentXml),
    complexFields: /<w:fldSimple\b|<w:instrText\b/i.test(documentXml),
    contentControls: /<w:sdt\b/i.test(documentXml),
    trackedChanges: /<w:(ins|del|moveFrom|moveTo)\b/i.test(documentXml) || /<w:trackRevisions\b/i.test(settingsXml),
    externalLinks: /TargetMode=["']External["']/i.test(relationships),
    sectionCount: count(documentXml, /<w:sectPr\b/g),
    columns: /<w:cols\b[^>]*(w:num=["'][2-9]|w:sep=["']1)/i.test(documentXml),
    footnotes: names.includes('word/footnotes.xml'),
    headers: names.filter((n) => /^word\/header\d+\.xml$/i.test(n)).length,
    footers: names.filter((n) => /^word\/footer\d+\.xml$/i.test(n)).length,
  };
  let score = 0;
  const add = (condition, points, message) => { if (condition) { score += points; warnings.push(message); } };
  add(features.macros, 50, 'Macros VBA détectées : utilisez Microsoft Word.');
  add(features.embeddedObjects, 30, 'Objets incorporés détectés.');
  add(features.smartArt, 25, 'SmartArt ou diagrammes détectés.');
  add(features.floatingTextBoxes, 20, 'Zones de texte flottantes détectées.');
  add(features.complexFields, 15, 'Champs Word dynamiques détectés.');
  add(features.contentControls, 15, 'Contrôles de contenu Word détectés.');
  add(features.trackedChanges, 25, 'Suivi des modifications Word détecté.');
  add(features.externalLinks, 20, 'Liens vers des données externes détectés.');
  add(features.sectionCount > 3, 15, `${features.sectionCount} sections de mise en page détectées.`);
  add(features.columns, 15, 'Colonnes complexes détectées.');
  const level = score >= 35 ? 'complex' : score > 0 ? 'partial' : 'complete';
  return { level, score, warnings, features };
}

module.exports = { analyzeDocx, isDocxBuffer };
