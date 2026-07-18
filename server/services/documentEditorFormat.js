const crypto = require('crypto');
const PizZip = require('pizzip');

const A4 = Object.freeze({ widthMm: 210, heightMm: 297 });
const CSS_PIXELS_PER_INCH = 96;
const MILLIMETERS_PER_INCH = 25.4;
const TWIPS_PER_INCH = 1440;
const DEFAULT_HORIZONTAL_MARGIN_MM = (5 * MILLIMETERS_PER_INCH) / CSS_PIXELS_PER_INCH;
const LEGACY_HORIZONTAL_MARGIN_MM = 20;
const MAX_MARGIN_MM = 60;
const MAX_BLOCKS = 4000;
const MAX_RUNS_PER_BLOCK = 2000;
const MAX_TEXT_LENGTH = 250000;
const MAX_WORD_PARAGRAPH_STYLES = 512;
const MAX_WORD_STYLE_INHERITANCE_DEPTH = 24;
const MAX_WORD_RUN_STYLES = 512;
const SAFE_FONTS = new Set([
  'Arial', 'Calibri', 'Cambria', 'Georgia', 'Times New Roman', 'Verdana',
  'Courier New', 'Trebuchet MS',
]);

function makeId(prefix = 'block') {
  return `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
}

function clamp(value, min, max, fallback) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function twipsToMillimeters(value) {
  if (value == null || value === '') return null;
  const twips = Number(value);
  return Number.isFinite(twips) ? (twips * MILLIMETERS_PER_INCH) / TWIPS_PER_INCH : null;
}

function normalizePageMargins(input = {}) {
  const margins = input && typeof input === 'object' ? input : {};
  return {
    top: clamp(margins.top, 5, MAX_MARGIN_MM, 20),
    // Les valeurs sont stockées en millimètres pour garantir le même
    // résultat dans l'éditeur, le HTML, le PDF et le DOCX. Les documents
    // historiques sans marge horizontale explicite gardent 20 mm.
    right: clamp(
      margins.right,
      DEFAULT_HORIZONTAL_MARGIN_MM,
      MAX_MARGIN_MM,
      LEGACY_HORIZONTAL_MARGIN_MM,
    ),
    bottom: clamp(margins.bottom, 5, MAX_MARGIN_MM, 20),
    left: clamp(
      margins.left,
      DEFAULT_HORIZONTAL_MARGIN_MM,
      MAX_MARGIN_MM,
      LEGACY_HORIZONTAL_MARGIN_MM,
    ),
  };
}

function normalizeStoredDocumentForClient(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const page = input.page && typeof input.page === 'object' ? input.page : {};
  return {
    ...input,
    page: {
      ...page,
      margins: normalizePageMargins(page.margins),
    },
  };
}

function extractDocxPageMargins(buffer) {
  let zip;
  try {
    zip = new PizZip(buffer);
  } catch (_error) {
    return null;
  }
  const documentXml = zip.file('word/document.xml')?.asText() || '';
  const tags = documentXml.match(/<(?:w:)?pgMar\b[^>]*>/gi) || [];
  const tag = tags[tags.length - 1];
  if (!tag) return null;

  const margins = {};
  ['top', 'right', 'bottom', 'left'].forEach((side) => {
    const match = tag.match(new RegExp(`(?:^|\\s)(?:w:)?${side}\\s*=\\s*["'](-?[\\d.]+)["']`, 'i'));
    const millimeters = twipsToMillimeters(match && match[1]);
    if (millimeters != null) margins[side] = millimeters;
  });
  return Object.keys(margins).length ? margins : null;
}

function applyDocxPageMargins(buffer, input) {
  const margins = extractDocxPageMargins(buffer);
  if (!margins || !input || typeof input !== 'object' || Array.isArray(input)) return input;
  const page = input.page && typeof input.page === 'object' ? input.page : {};
  const currentMargins = page.margins && typeof page.margins === 'object' ? page.margins : {};
  return {
    ...input,
    page: {
      ...page,
      margins: { ...currentMargins, ...margins },
    },
  };
}

function wordParagraphText(paragraphXml) {
  const tokens = String(paragraphXml || '').match(
    /<w:t\b[^>]*>[\s\S]*?<\/w:t>|<w:tab\b[^>]*\/>|<w:(?:br|cr)\b[^>]*\/>/gi,
  ) || [];
  return tokens.map((token) => {
    if (/^<w:tab/i.test(token)) return '\t';
    if (/^<w:(?:br|cr)/i.test(token)) return '\n';
    return decodeEntities(token.replace(/^<w:t\b[^>]*>/i, '').replace(/<\/w:t>$/i, ''));
  }).join('');
}

function normalizeWordParagraphAlignment(value, fallback = null) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'both' || normalized === 'distribute') return 'justify';
  if (normalized === 'start') return 'left';
  if (normalized === 'end') return 'right';
  return ['left', 'center', 'right', 'justify'].includes(normalized) ? normalized : fallback;
}

function wordParagraphAlignment(paragraphXml) {
  const value = (String(paragraphXml || '').match(/<w:jc\b[^>]*w:val=["']([^"']+)["']/i) || [])[1];
  return normalizeWordParagraphAlignment(value, 'left');
}

function wordAttribute(tagXml, attributeName) {
  const escaped = String(attributeName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (String(tagXml || '').match(new RegExp(`(?:^|\\s)(?:w:)?${escaped}\\s*=\\s*["']([^"']*)["']`, 'i')) || [])[1];
}

function wordElementEnabled(xml, elementName) {
  const escaped = String(elementName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = (String(xml || '').match(new RegExp(`<(?:w:)?${escaped}\\b[^>]*>`, 'i')) || [])[0];
  if (!tag) return false;
  return !['0', 'false', 'off', 'none'].includes(String(wordAttribute(tag, 'val') || '').toLowerCase());
}

/**
 * Extrait un élément OOXML complet à partir de son tag ouvrant. Le compteur de
 * profondeur est utile pour les tableaux imbriqués et évite qu'une cellule du
 * tableau interne ne ferme prématurément le tableau externe.
 */
function balancedWordElementAt(xml, start, elementName) {
  const source = String(xml || '');
  const escaped = String(elementName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tagRegex = new RegExp(`<\\/?(?:w:)?${escaped}\\b[^>]*>`, 'gi');
  tagRegex.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = tagRegex.exec(source))) {
    const tag = match[0];
    if (/^<\//.test(tag)) depth -= 1;
    else if (!/\/\s*>$/.test(tag)) depth += 1;
    if (depth === 0) return { xml: source.slice(start, tagRegex.lastIndex), end: tagRegex.lastIndex };
  }
  return { xml: source.slice(start), end: source.length };
}

function directWordElements(xml, elementNames, limit = Number.POSITIVE_INFINITY) {
  const source = String(xml || '');
  const names = (Array.isArray(elementNames) ? elementNames : [elementNames]).filter(Boolean);
  if (!names.length) return [];
  const alternatives = names.map((name) => String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const openingRegex = new RegExp(`<(?:w:)?(${alternatives})\\b[^>]*>`, 'gi');
  const elements = [];
  let match;
  while (elements.length < limit && (match = openingRegex.exec(source))) {
    const extracted = balancedWordElementAt(source, match.index, match[1]);
    elements.push({ name: match[1], xml: extracted.xml, start: match.index, end: extracted.end });
    openingRegex.lastIndex = Math.max(extracted.end, openingRegex.lastIndex);
  }
  return elements;
}

function wordDocumentBodyXml(documentXml) {
  return (String(documentXml || '').match(/<(?:w:)?body\b[^>]*>([\s\S]*?)<\/(?:w:)?body>/i) || [])[1] || '';
}

function wordParagraphPropertiesXml(containerXml) {
  const source = String(containerXml || '');
  return (source.match(/<(?:w:)?pPr\b[^>]*>[\s\S]*?<\/(?:w:)?pPr>/i) || [])[0]
    || (source.match(/<(?:w:)?pPr\b[^>]*\/>/i) || [])[0]
    || '';
}

function wordRunPropertiesXml(containerXml) {
  const source = String(containerXml || '');
  return (source.match(/<(?:w:)?rPr\b[^>]*>[\s\S]*?<\/(?:w:)?rPr>/i) || [])[0]
    || (source.match(/<(?:w:)?rPr\b[^>]*\/>/i) || [])[0]
    || '';
}

const WORD_HIGHLIGHT_COLORS = Object.freeze({
  black: '#000000', blue: '#0000FF', cyan: '#00FFFF', darkblue: '#000080',
  darkcyan: '#008080', darkgray: '#808080', darkgreen: '#008000', darkmagenta: '#800080',
  darkred: '#800000', darkyellow: '#808000', green: '#00FF00', lightgray: '#C0C0C0',
  magenta: '#FF00FF', red: '#FF0000', white: '#FFFFFF', yellow: '#FFFF00',
});

function wordToggleProperty(propertiesXml, elementName, { noneIsFalse = false } = {}) {
  const escaped = String(elementName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = (String(propertiesXml || '').match(new RegExp(`<(?:w:)?${escaped}\\b[^>]*\\/?>`, 'i')) || [])[0];
  if (!tag) return undefined;
  const value = String(wordAttribute(tag, 'val') || '').toLowerCase();
  if (noneIsFalse && value === 'none') return false;
  return !['0', 'false', 'off', 'none'].includes(value);
}

function readWordRunProperties(propertiesXml) {
  const source = String(propertiesXml || '');
  const fontTag = (source.match(/<(?:w:)?rFonts\b[^>]*\/?>/i) || [])[0] || '';
  const sizeTag = (source.match(/<(?:w:)?sz\b[^>]*\/?>/i) || [])[0] || '';
  const colorTag = (source.match(/<(?:w:)?color\b[^>]*\/?>/i) || [])[0] || '';
  const highlightTag = (source.match(/<(?:w:)?highlight\b[^>]*\/?>/i) || [])[0] || '';
  const shadingTag = (source.match(/<(?:w:)?shd\b[^>]*\/?>/i) || [])[0] || '';
  const verticalTag = (source.match(/<(?:w:)?vertAlign\b[^>]*\/?>/i) || [])[0] || '';
  // Le modèle Kheops n'attache pas encore un script à chaque portion de texte.
  // Pour le texte latin rendu par Mammoth, seuls ascii/hAnsi sont fiables :
  // utiliser cs/eastAsia comme repli a déjà transformé un document entier en
  // police embarquée « font1343 », alors que Word le rendait en Times New Roman.
  const font = wordAttribute(fontTag, 'ascii') || wordAttribute(fontTag, 'hAnsi');
  const halfPoints = Number(wordAttribute(sizeTag, 'val'));
  const color = String(wordAttribute(colorTag, 'val') || '').replace(/^#/, '');
  const highlightName = String(wordAttribute(highlightTag, 'val') || '').toLowerCase();
  const shading = String(wordAttribute(shadingTag, 'fill') || '').replace(/^#/, '');
  const vertical = String(wordAttribute(verticalTag, 'val') || '').toLowerCase();
  const bold = wordToggleProperty(source, 'b');
  const italic = wordToggleProperty(source, 'i');
  const underline = wordToggleProperty(source, 'u', { noneIsFalse: true });
  const strike = wordToggleProperty(source, 'strike');
  const doubleStrike = wordToggleProperty(source, 'dstrike');
  let highlight;
  if (highlightTag && highlightName !== 'none') highlight = WORD_HIGHLIGHT_COLORS[highlightName];
  if (!highlight && /^[0-9a-f]{6}$/i.test(shading) && shading.toLowerCase() !== 'auto') {
    highlight = `#${shading}`;
  }
  return {
    ...(bold !== undefined ? { bold } : {}),
    ...(italic !== undefined ? { italic } : {}),
    ...(underline !== undefined ? { underline } : {}),
    ...(strike !== undefined || doubleStrike !== undefined ? { strike: Boolean(strike || doubleStrike) } : {}),
    ...(verticalTag ? { superscript: vertical === 'superscript', subscript: vertical === 'subscript' } : {}),
    ...(font ? { font: decodeEntities(font) } : {}),
    ...(Number.isFinite(halfPoints) && halfPoints > 0 ? { size: halfPoints / 2 } : {}),
    ...(/^[0-9a-f]{6}$/i.test(color) && color.toLowerCase() !== 'auto' ? { color: `#${color}` } : {}),
    ...(highlight ? { highlight } : {}),
  };
}

function mergeWordRunProperties(base = {}, override = {}) {
  return { ...(base || {}), ...(override || {}) };
}

function readWordParagraphProperties(propertiesXml) {
  const source = String(propertiesXml || '');
  const alignmentTag = (source.match(/<(?:w:)?jc\b[^>]*\/?>/i) || [])[0] || '';
  const indentTag = (source.match(/<(?:w:)?ind\b[^>]*\/?>/i) || [])[0] || '';
  const spacingTag = (source.match(/<(?:w:)?spacing\b[^>]*\/?>/i) || [])[0] || '';
  const alignment = normalizeWordParagraphAlignment(wordAttribute(alignmentTag, 'val'));
  const leftTwips = wordAttribute(indentTag, 'left') ?? wordAttribute(indentTag, 'start');
  const spacing = {};
  ['before', 'after', 'line'].forEach((name) => {
    const value = wordAttribute(spacingTag, name);
    if (value != null && Number.isFinite(Number(value))) spacing[name] = Number(value);
  });
  return {
    ...(alignment ? { align: alignment } : {}),
    ...(leftTwips != null && Number.isFinite(Number(leftTwips)) ? { indentTwips: Number(leftTwips) } : {}),
    spacing,
  };
}

function mergeWordParagraphProperties(base = {}, override = {}) {
  return {
    ...(base.align ? { align: base.align } : {}),
    ...(base.indentTwips != null ? { indentTwips: base.indentTwips } : {}),
    spacing: { ...(base.spacing || {}) },
    ...(override.align ? { align: override.align } : {}),
    ...(override.indentTwips != null ? { indentTwips: override.indentTwips } : {}),
    ...(override.spacing ? { spacing: { ...(base.spacing || {}), ...override.spacing } } : {}),
  };
}

function createWordParagraphStyleResolver(stylesXml) {
  const source = String(stylesXml || '');
  const docDefaultsXml = (source.match(/<(?:w:)?docDefaults\b[^>]*>[\s\S]*?<\/(?:w:)?docDefaults>/i) || [])[0] || '';
  const paragraphDefaultXml = (docDefaultsXml.match(/<(?:w:)?pPrDefault\b[^>]*>[\s\S]*?<\/(?:w:)?pPrDefault>/i) || [])[0] || '';
  const runDefaultXml = (docDefaultsXml.match(/<(?:w:)?rPrDefault\b[^>]*>[\s\S]*?<\/(?:w:)?rPrDefault>/i) || [])[0] || '';
  const defaults = readWordParagraphProperties(wordParagraphPropertiesXml(paragraphDefaultXml));
  const runDefaults = readWordRunProperties(wordRunPropertiesXml(runDefaultXml));
  const styles = new Map();
  const characterStyles = new Map();
  let defaultStyleId = '';

  directWordElements(source, 'style', MAX_WORD_PARAGRAPH_STYLES + MAX_WORD_RUN_STYLES).forEach((element) => {
    const openingTag = (element.xml.match(/<(?:w:)?style\b[^>]*>/i) || [])[0] || '';
    const type = String(wordAttribute(openingTag, 'type') || 'paragraph').toLowerCase();
    const styleId = wordAttribute(openingTag, 'styleId');
    if (!styleId || !['paragraph', 'character'].includes(type)) return;
    const isDefault = ['1', 'true', 'on'].includes(String(wordAttribute(openingTag, 'default') || '').toLowerCase());
    const basedOnTag = (element.xml.match(/<(?:w:)?basedOn\b[^>]*\/?>/i) || [])[0] || '';
    const target = type === 'paragraph' ? styles : characterStyles;
    const maximum = type === 'paragraph' ? MAX_WORD_PARAGRAPH_STYLES : MAX_WORD_RUN_STYLES;
    if (target.size >= maximum) return;
    if (type === 'paragraph' && isDefault && !defaultStyleId) defaultStyleId = styleId;
    target.set(styleId, {
      basedOn: wordAttribute(basedOnTag, 'val') || '',
      properties: readWordParagraphProperties(wordParagraphPropertiesXml(element.xml)),
      runProperties: readWordRunProperties(wordRunPropertiesXml(element.xml)),
    });
  });

  const cache = new Map();
  const resolve = (styleId, ancestors = new Set(), depth = 0) => {
    const id = String(styleId || '');
    if (!id || !styles.has(id)) return defaults;
    if (cache.has(id)) return cache.get(id);
    // Les documents externes peuvent contenir des cycles ou des chaînes de
    // styles anormalement longues. On coupe l'héritage, tout en conservant les
    // valeurs par défaut et les propriétés propres déjà accessibles.
    if (depth >= MAX_WORD_STYLE_INHERITANCE_DEPTH || ancestors.has(id)) return defaults;
    const style = styles.get(id);
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(id);
    const inherited = style.basedOn
      ? resolve(style.basedOn, nextAncestors, depth + 1)
      : defaults;
    const effective = mergeWordParagraphProperties(inherited, style.properties);
    cache.set(id, effective);
    return effective;
  };

  const paragraphRunCache = new Map();
  const resolveParagraphRun = (styleId, ancestors = new Set(), depth = 0) => {
    const id = String(styleId || '');
    if (!id || !styles.has(id)) return runDefaults;
    if (paragraphRunCache.has(id)) return paragraphRunCache.get(id);
    if (depth >= MAX_WORD_STYLE_INHERITANCE_DEPTH || ancestors.has(id)) return runDefaults;
    const style = styles.get(id);
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(id);
    const inherited = style.basedOn
      ? resolveParagraphRun(style.basedOn, nextAncestors, depth + 1)
      : runDefaults;
    const effective = mergeWordRunProperties(inherited, style.runProperties);
    paragraphRunCache.set(id, effective);
    return effective;
  };

  const characterRunCache = new Map();
  const resolveCharacterRun = (styleId, ancestors = new Set(), depth = 0) => {
    const id = String(styleId || '');
    if (!id || !characterStyles.has(id)) return {};
    if (characterRunCache.has(id)) return characterRunCache.get(id);
    if (depth >= MAX_WORD_STYLE_INHERITANCE_DEPTH || ancestors.has(id)) return {};
    const style = characterStyles.get(id);
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(id);
    const inherited = style.basedOn
      ? resolveCharacterRun(style.basedOn, nextAncestors, depth + 1)
      : {};
    const effective = mergeWordRunProperties(inherited, style.runProperties);
    characterRunCache.set(id, effective);
    return effective;
  };

  return {
    defaults,
    runDefaults,
    defaultStyleId,
    resolve,
    resolveParagraphRun,
    resolveCharacterRun,
  };
}

function wordParagraphLayout(paragraphXml, styleResolver = null) {
  const source = String(paragraphXml || '');
  const paragraphProperties = wordParagraphPropertiesXml(source);
  const paragraphStyleTag = (paragraphProperties.match(/<(?:w:)?pStyle\b[^>]*\/?>/i) || [])[0] || '';
  const paragraphStyleId = wordAttribute(paragraphStyleTag, 'val') || '';
  const effectiveStyleId = paragraphStyleId || styleResolver?.defaultStyleId || '';
  const inheritedProperties = styleResolver?.resolve
    ? styleResolver.resolve(effectiveStyleId)
    : (styleResolver?.defaults || {});
  const effectiveProperties = mergeWordParagraphProperties(
    inheritedProperties,
    readWordParagraphProperties(paragraphProperties),
  );
  const beforeTwips = effectiveProperties.spacing.before;
  const afterTwips = effectiveProperties.spacing.after;
  const lineTwips = effectiveProperties.spacing.line;
  const runPresentation = wordParagraphRunPresentation(
    source,
    styleResolver,
    effectiveStyleId,
    paragraphProperties,
  );
  const text = runPresentation.rawText;
  const pageBreakCount = runPresentation.pageBreakCount;
  const sectionProperties = (paragraphProperties.match(/<(?:w:)?sectPr\b[^>]*>[\s\S]*?<\/(?:w:)?sectPr>/i) || [])[0] || '';
  const sectionTypeTag = (sectionProperties.match(/<(?:w:)?type\b[^>]*\/?>/i) || [])[0] || '';
  const sectionType = sectionProperties ? String(wordAttribute(sectionTypeTag, 'val') || 'nextPage') : '';
  const spacing = {};
  if (beforeTwips != null && Number.isFinite(Number(beforeTwips))) spacing.before = Math.max(0, Number(beforeTwips) / 20);
  if (afterTwips != null && Number.isFinite(Number(afterTwips))) spacing.after = Math.max(0, Number(afterTwips) / 20);
  // Le schéma Kheops stocke l'interligne sous forme de multiplicateur. Word
  // utilise 240 unités pour une ligne en mode « auto » ; cette approximation
  // conserve également les valeurs utiles des règles exactes/au-moins.
  if (lineTwips != null && Number.isFinite(Number(lineTwips))) {
    spacing.line = Math.max(1, Math.min(3, Number(lineTwips) / 240));
  }
  return {
    xml: source,
    rawText: text,
    text: comparableParagraphText(text),
    runs: runPresentation.runs,
    pageSegments: runPresentation.pageSegments,
    align: effectiveProperties.align || 'left',
    indent: effectiveProperties.indentTwips == null ? null : twipsToMillimeters(effectiveProperties.indentTwips),
    spacing,
    pageBreakBefore: wordElementEnabled(paragraphProperties, 'pageBreakBefore'),
    pageBreakCount,
    sectionPageBreak: ['nextPage', 'oddPage', 'evenPage'].includes(sectionType),
    hasDrawing: /<(?:w:)?(?:drawing|pict|object)\b/i.test(source),
    hasParagraphProperties: Boolean(paragraphProperties || paragraphStyleId),
    significantEmpty: false,
  };
}

function wordCellWidth(cellPropertiesXml, totalGridWidth) {
  const widthTag = (String(cellPropertiesXml || '').match(/<(?:w:)?tcW\b[^>]*\/?>/i) || [])[0] || '';
  const value = Number(wordAttribute(widthTag, 'w'));
  if (!Number.isFinite(value) || value <= 0) return null;
  const type = String(wordAttribute(widthTag, 'type') || 'dxa').toLowerCase();
  if (type === 'pct') return value / 50;
  if (type === 'dxa' && Number.isFinite(totalGridWidth) && totalGridWidth > 0) return (value / totalGridWidth) * 100;
  return null;
}

function wordTableLayout(tableXml, styleResolver = null) {
  const source = String(tableXml || '');
  const gridWidths = [...source.matchAll(/<(?:w:)?gridCol\b[^>]*\/?>/gi)]
    .map((match) => Number(wordAttribute(match[0], 'w')))
    .filter((value) => Number.isFinite(value) && value > 0);
  const totalGridWidth = gridWidths.reduce((total, value) => total + value, 0);
  const widths = totalGridWidth > 0 ? gridWidths.map((value) => (value / totalGridWidth) * 100) : [];
  const rows = directWordElements(source, 'tr').map((rowElement) => {
    let gridCursor = 0;
    const cells = directWordElements(rowElement.xml, 'tc').map((cellElement) => {
      const properties = (cellElement.xml.match(/<(?:w:)?tcPr\b[^>]*>[\s\S]*?<\/(?:w:)?tcPr>/i) || [])[0] || '';
      const spanTag = (properties.match(/<(?:w:)?gridSpan\b[^>]*\/?>/i) || [])[0] || '';
      const gridSpan = Math.max(1, Math.min(20, Number(wordAttribute(spanTag, 'val')) || 1));
      const verticalMergeTag = (properties.match(/<(?:w:)?vMerge\b[^>]*\/?>/i) || [])[0] || '';
      const verticalMergeValue = verticalMergeTag
        ? String(wordAttribute(verticalMergeTag, 'val') || 'continue').toLowerCase()
        : '';
      const paragraphs = directWordElements(cellElement.xml, 'p')
        .map((element) => wordParagraphLayout(element.xml, styleResolver));
      const verticalValue = String(wordAttribute((properties.match(/<(?:w:)?vAlign\b[^>]*\/?>/i) || [])[0], 'val') || '').toLowerCase();
      let width = wordCellWidth(properties, totalGridWidth);
      if (width == null && widths.length) {
        width = widths.slice(gridCursor, gridCursor + gridSpan).reduce((total, value) => total + value, 0) || null;
      }
      gridCursor += gridSpan;
      return {
        gridStart: gridCursor - gridSpan,
        colSpan: gridSpan,
        rowSpan: 1,
        verticalMerge: verticalMergeValue === 'restart' ? 'restart' : (verticalMergeValue ? 'continue' : ''),
        mergedContinuation: false,
        width,
        align: paragraphs.find((paragraph) => paragraph.text)?.align || paragraphs[0]?.align || 'left',
        verticalAlign: verticalValue === 'center' ? 'middle' : (verticalValue === 'bottom' ? 'bottom' : 'top'),
        paragraphs,
      };
    });
    return { cells };
  });
  rows.forEach((row, rowIndex) => row.cells.forEach((cell) => {
    if (cell.verticalMerge !== 'restart') return;
    let rowSpan = 1;
    for (let nextRowIndex = rowIndex + 1; nextRowIndex < rows.length && rowSpan < 100; nextRowIndex += 1) {
      const continuation = rows[nextRowIndex].cells.find((candidate) => (
        candidate.gridStart === cell.gridStart
        && candidate.colSpan === cell.colSpan
        && candidate.verticalMerge === 'continue'
      ));
      if (!continuation) break;
      continuation.mergedContinuation = true;
      rowSpan += 1;
    }
    cell.rowSpan = rowSpan;
  }));
  const visibleRows = rows.map((row) => ({
    cells: row.cells.filter((cell) => !cell.mergedContinuation).map((cell) => ({
      width: cell.width,
      align: cell.align,
      verticalAlign: cell.verticalAlign,
      paragraphs: cell.paragraphs,
      ...(cell.colSpan > 1 ? { colSpan: cell.colSpan } : {}),
      ...(cell.rowSpan > 1 ? { rowSpan: cell.rowSpan } : {}),
    })),
  }));
  return { xml: source, widths, rows: visibleRows };
}

function extractDocxBodyLayout(buffer) {
  let zip;
  try { zip = new PizZip(buffer); } catch (_error) { return { items: [] }; }
  const documentXml = zip.file('word/document.xml')?.asText() || '';
  const styleResolver = createWordParagraphStyleResolver(zip.file('word/styles.xml')?.asText() || '');
  const bodyXml = wordDocumentBodyXml(documentXml);
  const items = directWordElements(bodyXml, ['p', 'tbl']).map((element) => (
    element.name.toLowerCase() === 'tbl'
      ? { kind: 'table', layout: wordTableLayout(element.xml, styleResolver) }
      : { kind: 'paragraph', layout: wordParagraphLayout(element.xml, styleResolver) }
  ));
  const isMeaningful = (item) => item.kind === 'table'
    || Boolean(item.layout.text || item.layout.hasDrawing || item.layout.pageBreakCount || item.layout.pageBreakBefore);
  items.forEach((item, index) => {
    if (item.kind !== 'paragraph' || item.layout.text || item.layout.hasDrawing) return;
    const hasMeaningfulBefore = items.slice(0, index).some(isMeaningful);
    const hasMeaningfulAfter = items.slice(index + 1).some(isMeaningful);
    item.layout.significantEmpty = !item.layout.pageBreakCount
      && !item.layout.pageBreakBefore
      && (item.layout.hasParagraphProperties || (hasMeaningfulBefore && hasMeaningfulAfter));
  });
  return { items };
}

function comparableParagraphText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function layoutBlockPlainText(block) {
  if (!block || !['paragraph', 'heading', 'list-item'].includes(block.type)) return '';
  return (block.runs || []).map((run) => run && run.text || '').join('');
}

function overlayWordMarksPreservingLinks(existingRuns, wordRuns) {
  const existing = Array.isArray(existingRuns) ? existingRuns.filter((run) => run && run.text) : [];
  const word = Array.isArray(wordRuns) ? wordRuns.filter((run) => run && run.text) : [];
  const existingText = existing.map((run) => run.text).join('');
  const wordText = word.map((run) => run.text).join('');
  if (existingText !== wordText) return existingRuns;
  if (!existingText) return existingRuns;
  const result = [];
  let existingIndex = 0;
  let wordIndex = 0;
  let existingOffset = 0;
  let wordOffset = 0;
  while (existingIndex < existing.length && wordIndex < word.length && result.length < MAX_RUNS_PER_BLOCK) {
    const existingRun = existing[existingIndex];
    const wordRun = word[wordIndex];
    const length = Math.min(
      existingRun.text.length - existingOffset,
      wordRun.text.length - wordOffset,
    );
    if (length <= 0) break;
    const next = {
      text: wordRun.text.slice(wordOffset, wordOffset + length),
      marks: normalizeMarks(wordRun.marks),
    };
    if (existingRun.link) next.link = existingRun.link;
    result.push(next);
    existingOffset += length;
    wordOffset += length;
    if (existingOffset >= existingRun.text.length) {
      existingIndex += 1;
      existingOffset = 0;
    }
    if (wordOffset >= wordRun.text.length) {
      wordIndex += 1;
      wordOffset = 0;
    }
  }
  if (result.map((run) => run.text).join('') !== wordText) return existingRuns;
  return result.map((run) => ({ ...run, marks: normalizeMarks(run.marks) }));
}

function sliceRunsByTextOffsets(runs, start, end) {
  const source = Array.isArray(runs) ? runs : [];
  const result = [];
  let cursor = 0;
  for (const run of source) {
    const text = String(run?.text || '');
    const runStart = cursor;
    const runEnd = cursor + text.length;
    cursor = runEnd;
    if (runEnd <= start || runStart >= end) continue;
    const from = Math.max(0, start - runStart);
    const to = Math.min(text.length, end - runStart);
    if (to <= from) continue;
    result.push({ ...run, text: text.slice(from, to), marks: normalizeMarks(run.marks) });
    if (result.length >= MAX_RUNS_PER_BLOCK) break;
  }
  return result.length ? result : [{ text: '', marks: {} }];
}

function extractDocxParagraphLayouts(buffer) {
  const layouts = [];
  extractDocxBodyLayout(buffer).items.forEach((item) => {
    if (item.kind === 'paragraph') layouts.push(item.layout);
    else item.layout.rows.forEach((row) => row.cells.forEach((cell) => layouts.push(...cell.paragraphs)));
  });
  return layouts.filter((paragraph) => paragraph.text);
}

function applyWordParagraphLayout(block, layout) {
  if (!block || !layout || !['paragraph', 'heading', 'list-item'].includes(block.type)) return block;
  const next = { ...block, align: layout.align };
  const blockText = layoutBlockPlainText(block);
  const wordRunsText = (layout.runs || []).map((run) => run?.text || '').join('');
  // La correspondance souple reste utile pour l'alignement, mais les styles de
  // caractères ne sont réattribués que si chaque caractère correspond. Cela
  // évite de mettre en gras le mauvais passage lorsque Mammoth a normalisé des
  // espaces, champs ou révisions Word.
  if (blockText === layout.rawText && wordRunsText === layout.rawText) {
    next.runs = overlayWordMarksPreservingLinks(block.runs, layout.runs);
  }
  if (layout.indent != null && Number.isFinite(layout.indent)) next.indent = Math.max(0, Math.min(80, layout.indent));
  if (Object.keys(layout.spacing || {}).length) {
    next.spacing = { ...(block.spacing || {}), ...layout.spacing };
  }
  return next;
}

function applyParagraphLayoutsToBlocks(blocks, layouts) {
  const sourceBlocks = Array.isArray(blocks) ? blocks : [];
  const sourceLayouts = Array.isArray(layouts) ? layouts : [];
  const usedLayouts = new Set();
  let cursor = 0;
  return sourceBlocks.map((block) => {
    const text = comparableParagraphText(layoutBlockPlainText(block));
    let found = -1;
    for (let index = cursor; index < sourceLayouts.length; index += 1) {
      if (usedLayouts.has(index)) continue;
      if (sourceLayouts[index].text === text && (text || sourceLayouts[index].significantEmpty)) {
        found = index;
        break;
      }
    }
    if (found < 0) {
      found = sourceLayouts.findIndex((layout, index) => !usedLayouts.has(index)
        && layout.text === text && (text || layout.significantEmpty));
    }
    if (found < 0) return block;
    usedLayouts.add(found);
    cursor = Math.max(cursor, found + 1);
    return applyWordParagraphLayout(block, sourceLayouts[found]);
  });
}

function applyWordTableLayout(block, layout) {
  if (!block || block.type !== 'table' || !layout) return block;
  const rows = (block.rows || []).map((row, rowIndex) => ({
    ...row,
    cells: (row.cells || []).map((cell, cellIndex) => {
      const cellLayout = layout.rows[rowIndex]?.cells[cellIndex];
      if (!cellLayout) return cell;
      return {
        ...cell,
        ...(cellLayout.width != null ? { width: Math.max(5, Math.min(90, cellLayout.width)) } : {}),
        ...(cellLayout.colSpan > 1 ? { colSpan: Math.max(1, Math.min(20, cellLayout.colSpan)) } : {}),
        ...(cellLayout.rowSpan > 1 ? { rowSpan: Math.max(1, Math.min(100, cellLayout.rowSpan)) } : {}),
        align: cellLayout.align,
        verticalAlign: cellLayout.verticalAlign,
        blocks: applyParagraphLayoutsToBlocks(cell.blocks, cellLayout.paragraphs),
      };
    }),
  }));
  return {
    ...block,
    rows,
    ...(layout.widths.length ? { widths: layout.widths.map((width) => Math.max(5, Math.min(100, width))) } : {}),
  };
}

function emptyParagraphFromWordLayout(layout) {
  return applyWordParagraphLayout({
    id: makeId('p'),
    type: 'paragraph',
    runs: [{ text: '', marks: {} }],
    align: 'left',
    indent: 0,
    spacing: { line: 1.15, before: 0, after: 0 },
  }, layout);
}

function pageBreakBlock() {
  return { id: makeId('break'), type: 'page-break' };
}

function splitWordParagraphAtPageBreaks(block, layout) {
  if (!block || !layout || !layout.pageBreakCount || !layout.text) return null;
  const segments = Array.isArray(layout.pageSegments) ? layout.pageSegments : [];
  if (segments.length !== layout.pageBreakCount + 1) return null;
  if (layoutBlockPlainText(block) !== layout.rawText) return null;
  if (segments.map((segment) => segment.text || '').join('\n') !== layout.rawText) return null;
  const pieces = [];
  let offset = 0;
  let paragraphCount = 0;
  segments.forEach((segment, index) => {
    const text = String(segment.text || '');
    if (text) {
      pieces.push(applyWordParagraphLayout({
        ...block,
        id: paragraphCount === 0 ? block.id : makeId(block.type === 'heading' ? 'heading' : 'p'),
        runs: sliceRunsByTextOffsets(block.runs, offset, offset + text.length),
      }, { ...layout, rawText: text, runs: segment.runs, pageBreakCount: 0, pageSegments: [segment] }));
      paragraphCount += 1;
    }
    offset += text.length;
    if (index < segments.length - 1) {
      pieces.push(pageBreakBlock());
      // wordParagraphRunPresentation représente le saut de page par un seul
      // caractère '\n' dans rawText, distinct des sauts de ligne ordinaires.
      offset += 1;
    }
  });
  return pieces.length ? pieces : null;
}

function findUnclaimedBlock(blocks, used, predicate, start = 0) {
  for (let index = Math.max(0, start); index < blocks.length; index += 1) {
    if (!used.has(index) && predicate(blocks[index])) return index;
  }
  for (let index = 0; index < Math.max(0, start); index += 1) {
    if (!used.has(index) && predicate(blocks[index])) return index;
  }
  return -1;
}

/**
 * Mammoth ne restitue pas systématiquement les propriétés de paragraphe et de
 * tableau. On les réapplique par correspondance séquentielle, y compris dans
 * les cellules, puis on restaure les sauts de page et paragraphes vides que
 * Mammoth omet fréquemment.
 */
function applyDocxParagraphAlignments(buffer, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  if (!Array.isArray(input.blocks)) return input;
  const bodyLayout = extractDocxBodyLayout(buffer);
  if (!bodyLayout.items.length) return input;

  const blocks = input.blocks.slice();
  const transformed = blocks.slice();
  const used = new Set();
  let cursor = 0;
  bodyLayout.items.forEach((item) => {
    let blockIndex = -1;
    if (item.kind === 'table') {
      blockIndex = findUnclaimedBlock(blocks, used, (block) => block?.type === 'table', cursor);
      if (blockIndex >= 0) transformed[blockIndex] = applyWordTableLayout(blocks[blockIndex], item.layout);
    } else if (item.layout.text) {
      blockIndex = findUnclaimedBlock(blocks, used, (block) => (
        ['paragraph', 'heading', 'list-item'].includes(block?.type)
        && comparableParagraphText(layoutBlockPlainText(block)) === item.layout.text
      ), cursor);
      if (blockIndex >= 0) transformed[blockIndex] = applyWordParagraphLayout(blocks[blockIndex], item.layout);
    } else if (item.layout.hasDrawing) {
      blockIndex = findUnclaimedBlock(blocks, used, (block) => block?.type === 'image', cursor);
    } else if (item.layout.significantEmpty || item.layout.pageBreakCount) {
      blockIndex = findUnclaimedBlock(blocks, used, (block) => (
        ['paragraph', 'heading', 'list-item'].includes(block?.type)
        && !comparableParagraphText(layoutBlockPlainText(block))
      ), cursor);
      if (blockIndex >= 0 && item.layout.significantEmpty) {
        transformed[blockIndex] = applyWordParagraphLayout(blocks[blockIndex], item.layout);
      }
    }
    if (blockIndex >= 0) {
      used.add(blockIndex);
      cursor = Math.max(cursor, blockIndex + 1);
      item.blockIndex = blockIndex;
    }
  });

  const before = new Map();
  const after = new Map();
  const replacements = new Map();
  const tail = [];
  const dropped = new Set();
  const schedule = (collection, index, block) => {
    if (index == null || index < 0 || index >= blocks.length) {
      tail.push(block);
      return;
    }
    const values = collection.get(index) || [];
    values.push(block);
    collection.set(index, values);
  };
  const nearestMapped = (itemIndex, direction) => {
    for (let index = itemIndex + direction; index >= 0 && index < bodyLayout.items.length; index += direction) {
      if (bodyLayout.items[index].blockIndex != null) return bodyLayout.items[index].blockIndex;
    }
    return null;
  };

  bodyLayout.items.forEach((item, itemIndex) => {
    if (item.kind !== 'paragraph') return;
    const layout = item.layout;
    const nextIndex = nearestMapped(itemIndex, 1);
    const previousIndex = nearestMapped(itemIndex, -1);
    const anchor = item.blockIndex ?? nextIndex ?? previousIndex;
    if (layout.pageBreakBefore) schedule(before, anchor, pageBreakBlock());
    if (layout.significantEmpty && item.blockIndex == null) {
      schedule(before, nextIndex ?? anchor, emptyParagraphFromWordLayout(layout));
    }
    if (layout.pageBreakCount) {
      const isStandalone = !layout.text && !layout.hasDrawing;
      const split = !isStandalone && item.blockIndex != null
        ? splitWordParagraphAtPageBreaks(transformed[item.blockIndex], layout)
        : null;
      if (split) replacements.set(item.blockIndex, split);
      if (isStandalone && item.blockIndex != null) dropped.add(item.blockIndex);
      if (!split) {
        for (let count = 0; count < layout.pageBreakCount; count += 1) {
          if (isStandalone) schedule(before, nextIndex ?? anchor, pageBreakBlock());
          else schedule(after, item.blockIndex ?? anchor, pageBreakBlock());
        }
      }
    }
    if (layout.sectionPageBreak) {
      if (item.blockIndex != null) schedule(after, item.blockIndex, pageBreakBlock());
      else schedule(before, nextIndex ?? anchor, pageBreakBlock());
    }
  });

  const restoredBlocks = [];
  transformed.forEach((block, index) => {
    restoredBlocks.push(...(before.get(index) || []));
    if (!dropped.has(index)) restoredBlocks.push(...(replacements.get(index) || [block]));
    restoredBlocks.push(...(after.get(index) || []));
  });
  restoredBlocks.push(...tail);
  return { ...input, blocks: restoredBlocks };
}

function relationshipTargetForHeader(zip, relationshipId) {
  if (!relationshipId) return '';
  const relationships = zip.file('word/_rels/document.xml.rels')?.asText() || '';
  const escaped = String(relationshipId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const relationship = relationships.match(new RegExp(`<Relationship\\b(?=[^>]*\\bId=["']${escaped}["'])[^>]*>`, 'i'))
    || relationships.match(new RegExp(`<Relationship\\b(?=[^>]*\\bId=["']${escaped}["'])[^>]*/>`, 'i'));
  const target = (relationship?.[0]?.match(/\bTarget=["']([^"']+)["']/i) || [])[1] || '';
  if (!target) return '';
  if (target.startsWith('/')) return target.replace(/^\//, '');
  return `word/${target.replace(/^\.\//, '')}`;
}

function wordRunMarks(runXml, inherited = {}, styleResolver = null) {
  const properties = wordRunPropertiesXml(runXml);
  const styleTag = (properties.match(/<(?:w:)?rStyle\b[^>]*\/?>/i) || [])[0] || '';
  const characterStyleId = wordAttribute(styleTag, 'val') || '';
  const characterProperties = styleResolver?.resolveCharacterRun
    ? styleResolver.resolveCharacterRun(characterStyleId)
    : {};
  return normalizeMarks(mergeWordRunProperties(
    mergeWordRunProperties(inherited, characterProperties),
    readWordRunProperties(properties),
  ));
}

function wordRunTokens(runXml) {
  return String(runXml || '').match(
    /<(?:w:)?t\b[^>]*>[\s\S]*?<\/(?:w:)?t>|<(?:w:)?tab\b[^>]*\/>|<(?:w:)?(?:br|cr)\b[^>]*\/>/gi,
  ) || [];
}

/**
 * Restitue les runs OOXML et la position des sauts de page. Les limites de
 * styles/runs empêchent un document hostile de provoquer une résolution sans
 * fin ; en cas de troncature, la vérification textuelle exacte en aval refuse
 * simplement de réattribuer les styles.
 */
function wordParagraphRunPresentation(
  paragraphXml,
  styleResolver = null,
  paragraphStyleId = '',
  paragraphPropertiesXml = '',
) {
  const effectiveParagraphStyleId = paragraphStyleId || styleResolver?.defaultStyleId || '';
  let inherited = styleResolver?.resolveParagraphRun
    ? styleResolver.resolveParagraphRun(effectiveParagraphStyleId)
    : (styleResolver?.runDefaults || {});
  inherited = mergeWordRunProperties(
    inherited,
    readWordRunProperties(wordRunPropertiesXml(paragraphPropertiesXml)),
  );
  const pageSegments = [{ runs: [] }];
  let pageBreakCount = 0;
  const append = (text, marks) => {
    if (!text) return;
    const segment = pageSegments[pageSegments.length - 1];
    if (segment.runs.length >= MAX_RUNS_PER_BLOCK) return;
    segment.runs.push({ text, marks });
  };
  directWordElements(paragraphXml, 'r', MAX_RUNS_PER_BLOCK).forEach((element) => {
    const marks = wordRunMarks(element.xml, inherited, styleResolver);
    wordRunTokens(element.xml).forEach((token) => {
      if (/^<(?:w:)?tab/i.test(token)) {
        append('\t', marks);
        return;
      }
      if (/^<(?:w:)?(?:br|cr)/i.test(token)) {
        const breakType = String(wordAttribute(token, 'type') || '').toLowerCase();
        if (breakType === 'page') {
          if (pageSegments.length <= MAX_RUNS_PER_BLOCK) pageSegments.push({ runs: [] });
          pageBreakCount += 1;
        } else {
          append('\n', marks);
        }
        return;
      }
      append(decodeEntities(
        token.replace(/^<(?:w:)?t\b[^>]*>/i, '').replace(/<\/(?:w:)?t>$/i, ''),
      ), marks);
    });
  });
  pageSegments.forEach((segment) => {
    segment.runs = normalizeRuns(segment.runs);
    segment.text = segment.runs.map((run) => run.text).join('');
  });
  const rawText = pageSegments.map((segment) => segment.text).join('\n');
  const runs = [];
  pageSegments.forEach((segment, index) => {
    if (index > 0) runs.push({ text: '\n', marks: {} });
    runs.push(...segment.runs);
  });
  return {
    rawText,
    pageBreakCount,
    pageSegments,
    runs: normalizeRuns(runs),
  };
}

function wordParagraphRuns(paragraphXml, styleResolver = null) {
  const paragraphProperties = wordParagraphPropertiesXml(paragraphXml);
  const paragraphStyleTag = (paragraphProperties.match(/<(?:w:)?pStyle\b[^>]*\/?>/i) || [])[0] || '';
  const paragraphStyleId = wordAttribute(paragraphStyleTag, 'val') || styleResolver?.defaultStyleId || '';
  const presentation = wordParagraphRunPresentation(
    paragraphXml,
    styleResolver,
    paragraphStyleId,
    paragraphProperties,
  );
  return presentation.runs.length
    ? presentation.runs
    : [{ text: wordParagraphText(paragraphXml), marks: {} }];
}

function headerParagraphBlocks(headerXml, styleResolver = null) {
  return directWordElements(headerXml, 'p')
    .map((element) => {
      const paragraph = element.xml;
      const runs = wordParagraphRuns(paragraph, styleResolver);
      if (!runs.some((run) => run.text.trim())) return null;
      const layout = wordParagraphLayout(paragraph, styleResolver);
      return {
        id: makeId('header'),
        type: 'paragraph',
        runs,
        align: layout.align,
        indent: layout.indent == null ? 0 : layout.indent,
        spacing: { line: 1.15, before: 0, after: 0, ...layout.spacing },
      };
    })
    .filter(Boolean);
}

function relationshipIdFromReference(tagXml) {
  return (String(tagXml || '').match(/(?:^|\s)r:id\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
}

function extractDocxHeaderFooterPresentation(buffer) {
  let zip;
  try { zip = new PizZip(buffer); } catch (_error) { return null; }
  const documentXml = zip.file('word/document.xml')?.asText() || '';
  const styleResolver = createWordParagraphStyleResolver(zip.file('word/styles.xml')?.asText() || '');
  const sections = directWordElements(documentXml, 'sectPr');
  const activeSection = sections[sections.length - 1]?.xml || documentXml;
  const presentation = {
    firstPageDifferent: wordElementEnabled(activeSection, 'titlePg'),
    oddEvenDifferent: wordElementEnabled(zip.file('word/settings.xml')?.asText() || '', 'evenAndOddHeaders'),
  };
  const fieldNames = {
    header: { default: 'header', first: 'firstPageHeader', even: 'evenPageHeader' },
    footer: { default: 'footer', first: 'firstPageFooter', even: 'evenPageFooter' },
  };

  ['header', 'footer'].forEach((kind) => {
    const references = activeSection.match(new RegExp(`<(?:w:)?${kind}Reference\\b[^>]*\\/>`, 'gi')) || [];
    references.forEach((tag) => {
      const type = String(wordAttribute(tag, 'type') || 'default').toLowerCase();
      const field = fieldNames[kind][type];
      const path = relationshipTargetForHeader(zip, relationshipIdFromReference(tag));
      const blocks = headerParagraphBlocks(path && zip.file(path)?.asText(), styleResolver);
      if (field && blocks.length) presentation[field] = { blocks };
    });
    const defaultField = fieldNames[kind].default;
    const fallbackPath = `word/${kind}1.xml`;
    if (!presentation[defaultField] && references.length === 0 && zip.file(fallbackPath)) {
      const blocks = headerParagraphBlocks(zip.file(fallbackPath).asText(), styleResolver);
      if (blocks.length) presentation[defaultField] = { blocks };
    }
  });

  return presentation;
}

function extractDocxHeader(buffer) {
  const presentation = extractDocxHeaderFooterPresentation(buffer);
  const selected = presentation?.firstPageHeader || presentation?.header || presentation?.evenPageHeader;
  if (!selected?.blocks?.length) return null;
  return {
    blocks: selected.blocks,
    firstPageOnly: Boolean(presentation.firstPageHeader && selected === presentation.firstPageHeader),
  };
}

/** Préserve, lors de l'ouverture dans Kheops, la présentation utile du DOCX. */
function applyDocxPresentation(buffer, input) {
  let next = applyDocxPageMargins(buffer, input);
  next = applyDocxParagraphAlignments(buffer, next);
  const presentation = extractDocxHeaderFooterPresentation(buffer);
  if (!presentation || !next || typeof next !== 'object' || Array.isArray(next)) return next;
  const page = next.page && typeof next.page === 'object' ? next.page : {};
  const fields = {};
  ['header', 'footer', 'firstPageHeader', 'firstPageFooter', 'evenPageHeader', 'evenPageFooter'].forEach((field) => {
    if (presentation[field]?.blocks?.length) fields[field] = presentation[field];
  });
  return {
    ...next,
    page: {
      ...page,
      ...fields,
      firstPageDifferent: Boolean(presentation.firstPageDifferent),
      oddEvenDifferent: Boolean(presentation.oddEvenDifferent),
    },
  };
}

function cleanText(value, max = MAX_TEXT_LENGTH) {
  return String(value == null ? '' : value)
    .replace(/\u0000/g, '')
    .slice(0, max);
}

function cleanColor(value, fallback = null) {
  const color = String(value || '').trim();
  if (/^#[0-9a-f]{3,8}$/i.test(color) || /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(color)) {
    return color;
  }
  return fallback;
}

function cleanUrl(value, { image = false } = {}) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (image && /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\r\n]+$/i.test(url)) return url;
  if (/^https:\/\//i.test(url)) return url.slice(0, 2000);
  if (!image && /^(?:https?:\/\/|mailto:)/i.test(url)) return url.slice(0, 2000);
  return '';
}

function normalizeMarks(input = {}) {
  const marks = {};
  if (input.bold) marks.bold = true;
  if (input.italic) marks.italic = true;
  if (input.underline) marks.underline = true;
  if (input.strike) marks.strike = true;
  if (input.subscript) marks.subscript = true;
  if (input.superscript) marks.superscript = true;
  const font = cleanText(input.font || '', 80).trim();
  if (font) marks.font = font;
  const size = clamp(input.size, 6, 96, null);
  if (size) marks.size = size;
  const color = cleanColor(input.color);
  if (color) marks.color = color;
  const highlight = cleanColor(input.highlight);
  if (highlight) marks.highlight = highlight;
  return marks;
}

function normalizeRuns(input) {
  const source = Array.isArray(input) ? input.slice(0, MAX_RUNS_PER_BLOCK) : [];
  const runs = source.map((run) => {
    const normalized = {
      text: cleanText(run && run.text, 50000),
      marks: normalizeMarks(run && run.marks),
    };
    const link = cleanUrl(run && run.link);
    if (link) normalized.link = link;
    return normalized;
  });
  return runs.length ? runs : [{ text: '', marks: {} }];
}

function normalizeTextBlock(block, type) {
  const result = {
    id: cleanText(block.id || makeId(type), 80),
    type,
    runs: normalizeRuns(block.runs),
    align: ['left', 'center', 'right', 'justify'].includes(block.align) ? block.align : 'left',
  };
  if (type === 'heading') result.level = clamp(block.level, 1, 6, 1);
  if (type === 'list-item') {
    result.ordered = Boolean(block.ordered);
    result.level = clamp(block.level, 0, 8, 0);
  }
  result.indent = clamp(block.indent, 0, 80, 0);
  result.spacing = {
    line: clamp(block.spacing && block.spacing.line, 1, 3, 1.15),
    before: clamp(block.spacing && block.spacing.before, 0, 72, 0),
    after: clamp(block.spacing && block.spacing.after, 0, 72, 6),
  };
  return result;
}

function normalizeBlock(block) {
  if (!block || typeof block !== 'object') return null;
  const type = String(block.type || 'paragraph');
  if (['paragraph', 'heading', 'list-item'].includes(type)) return normalizeTextBlock(block, type);
  if (type === 'page-break') return { id: cleanText(block.id || makeId('break'), 80), type };
  if (type === 'section-break') {
    return {
      id: cleanText(block.id || makeId('section'), 80),
      type,
      breakType: ['next-page', 'continuous', 'even-page', 'odd-page'].includes(block.breakType) ? block.breakType : 'next-page',
    };
  }
  if (type === 'reference') {
    const targetDocumentId = cleanText(block.targetDocumentId, 80);
    const referenceId = cleanText(block.referenceId, 120);
    if (!targetDocumentId || !referenceId) return null;
    return {
      id: cleanText(block.id || makeId('reference'), 80),
      type,
      referenceId,
      targetDossierId: cleanText(block.targetDossierId, 80),
      targetDocumentId,
      targetVersionId: block.followLatest ? null : cleanText(block.targetVersionId, 180),
      followLatest: Boolean(block.followLatest),
      referenceType: ['piece', 'annexe', 'document', 'authority', 'custom'].includes(block.referenceType) ? block.referenceType : 'piece',
      label: cleanText(block.label || 'Référence documentaire', 300),
      pieceNumber: cleanText(block.pieceNumber, 80),
      status: ['active', 'broken', 'denied'].includes(block.status) ? block.status : 'active',
    };
  }
  if (type === 'image') {
    const src = cleanUrl(block.src, { image: true });
    if (!src) return null;
    return {
      id: cleanText(block.id || makeId('image'), 80),
      type,
      src,
      alt: cleanText(block.alt || 'Image', 300),
      width: clamp(block.width, 40, 680, 320),
      align: ['left', 'center', 'right'].includes(block.align) ? block.align : 'center',
    };
  }
  if (type === 'table') {
    const rows = (Array.isArray(block.rows) ? block.rows : []).slice(0, 100).map((row) => ({
      cells: (Array.isArray(row && row.cells) ? row.cells : []).slice(0, 20).map((cell) => ({
        blocks: (Array.isArray(cell && cell.blocks) ? cell.blocks : [])
          .slice(0, 100)
          .map((child) => normalizeTextBlock(child || {}, 'paragraph')),
        ...(Number.isFinite(Number(cell && cell.width)) ? { width: clamp(cell.width, 5, 90, 25) } : {}),
        ...(Number.isFinite(Number(cell && cell.colSpan)) ? { colSpan: clamp(cell.colSpan, 1, 20, 1) } : {}),
        ...(Number.isFinite(Number(cell && cell.rowSpan)) ? { rowSpan: clamp(cell.rowSpan, 1, 100, 1) } : {}),
        align: ['left', 'center', 'right'].includes(cell && cell.align) ? cell.align : 'left',
        verticalAlign: ['top', 'middle', 'bottom'].includes(cell && cell.verticalAlign) ? cell.verticalAlign : 'top',
      })),
    })).filter((row) => row.cells.length);
    if (!rows.length) return null;
    return {
      id: cleanText(block.id || makeId('table'), 80),
      type,
      rows,
      widths: (Array.isArray(block.widths) ? block.widths : []).slice(0, 20)
        .map((width) => clamp(width, 5, 100, 25)),
    };
  }
  return null;
}

function normalizeHeaderFooter(value) {
  if (value && Array.isArray(value.blocks)) {
    return {
      blocks: value.blocks.slice(0, 20)
        .map((block) => normalizeTextBlock(block || {}, 'paragraph')),
    };
  }
  return { blocks: [normalizeTextBlock({}, 'paragraph')] };
}

function normalizeOptionalHeaderFooter(value) {
  if (!value || !Array.isArray(value.blocks)) return null;
  return normalizeHeaderFooter(value);
}

function normalizeSignature(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    source: ['none', 'cabinet', 'responsible_lawyer', 'explicit'].includes(value.source) ? value.source : 'responsible_lawyer',
    ownerUserId: cleanText(value.ownerUserId, 80) || null,
    text: cleanText(value.text, 4000),
    image: cleanUrl(value.image, { image: true }),
    altText: cleanText(value.altText || 'Signature', 300),
    alignment: ['left', 'center', 'right'].includes(value.alignment) ? value.alignment : 'right',
    placement: ['document_end', 'last_page_bottom', 'all_pages_footer'].includes(value.placement) ? value.placement : 'document_end',
    required: Boolean(value.required),
  };
}

function createDefaultDocument(title = 'Document sans titre') {
  return {
    schemaVersion: 2,
    title: cleanText(title, 250) || 'Document sans titre',
    documentType: 'generic',
    localOverrides: { layout: false, header: false, footer: false, signature: false, styles: false },
    styles: {},
    signature: null,
    page: {
      format: 'A4',
      orientation: 'portrait',
      margins: {
        top: 20,
        right: DEFAULT_HORIZONTAL_MARGIN_MM,
        bottom: 20,
        left: DEFAULT_HORIZONTAL_MARGIN_MM,
      },
      header: { blocks: [normalizeTextBlock({}, 'paragraph')] },
      footer: { blocks: [normalizeTextBlock({}, 'paragraph')] },
      showPageNumbers: true,
      columns: 1,
      firstPageDifferent: false,
      oddEvenDifferent: false,
      headerDistance: 12.7,
      footerDistance: 12.7,
      pageColor: '#ffffff',
      border: { style: 'none', color: '#000000', width: 1 },
      watermark: '',
    },
    blocks: [normalizeTextBlock({}, 'paragraph')],
  };
}

function normalizeStructuredDocument(input) {
  const source = input && typeof input === 'object' ? input : {};
  const page = source.page && typeof source.page === 'object' ? source.page : {};
  const margins = page.margins && typeof page.margins === 'object' ? page.margins : {};
  const blocks = (Array.isArray(source.blocks) ? source.blocks : [])
    .slice(0, MAX_BLOCKS)
    .map(normalizeBlock)
    .filter(Boolean);
  const localOverrides = source.localOverrides && typeof source.localOverrides === 'object' ? source.localOverrides : {};
  const templateBinding = source.templateBinding && typeof source.templateBinding === 'object' ? source.templateBinding : null;
  const border = page.border && typeof page.border === 'object' ? page.border : {};
  return {
    schemaVersion: 2,
    title: cleanText(source.title, 250) || 'Document sans titre',
    documentType: cleanText(source.documentType || 'generic', 80).toLowerCase(),
    ...(templateBinding ? { templateBinding: {
      templateKey: cleanText(templateBinding.templateKey, 100).toLowerCase(),
      version: clamp(templateBinding.version, 1, 1000000, 1),
      appliedAt: cleanText(templateBinding.appliedAt, 50),
    } } : {}),
    localOverrides: {
      layout: Boolean(localOverrides.layout),
      header: Boolean(localOverrides.header),
      footer: Boolean(localOverrides.footer),
      signature: Boolean(localOverrides.signature),
      styles: Boolean(localOverrides.styles),
    },
    styles: source.styles && typeof source.styles === 'object' ? source.styles : {},
    signature: normalizeSignature(source.signature),
    page: {
      format: ['A4', 'A3', 'Letter', 'Legal'].includes(page.format) ? page.format : 'A4',
      orientation: page.orientation === 'landscape' ? 'landscape' : 'portrait',
      margins: normalizePageMargins(margins),
      header: normalizeHeaderFooter(page.header),
      footer: normalizeHeaderFooter(page.footer),
      firstPageHeader: normalizeOptionalHeaderFooter(page.firstPageHeader),
      firstPageFooter: normalizeOptionalHeaderFooter(page.firstPageFooter),
      evenPageHeader: normalizeOptionalHeaderFooter(page.evenPageHeader),
      evenPageFooter: normalizeOptionalHeaderFooter(page.evenPageFooter),
      showPageNumbers: page.showPageNumbers !== false,
      columns: clamp(page.columns, 1, 3, 1),
      firstPageDifferent: Boolean(page.firstPageDifferent),
      oddEvenDifferent: Boolean(page.oddEvenDifferent),
      headerDistance: clamp(page.headerDistance, 0, 60, 12.7),
      footerDistance: clamp(page.footerDistance, 0, 60, 12.7),
      pageColor: cleanColor(page.pageColor, '#ffffff'),
      border: {
        style: ['none', 'single', 'double', 'dashed'].includes(border.style) ? border.style : 'none',
        color: cleanColor(border.color, '#000000'),
        width: clamp(border.width, 0, 12, 1),
      },
      watermark: cleanText(page.watermark, 120),
    },
    blocks: blocks.length ? blocks : [normalizeTextBlock({}, 'paragraph')],
  };
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function runsToHtml(runs) {
  return normalizeRuns(runs).map((run) => {
    let text = escapeHtml(run.text).replace(/\n/g, '<br>');
    const marks = run.marks || {};
    if (marks.bold) text = `<strong>${text}</strong>`;
    if (marks.italic) text = `<em>${text}</em>`;
    if (marks.underline) text = `<u>${text}</u>`;
    if (marks.strike) text = `<s>${text}</s>`;
    if (marks.subscript) text = `<sub>${text}</sub>`;
    if (marks.superscript) text = `<sup>${text}</sup>`;
    const styles = [];
    if (marks.font) styles.push(`font-family:${escapeHtml(marks.font)}`);
    if (marks.size) styles.push(`font-size:${marks.size}pt`);
    if (marks.color) styles.push(`color:${marks.color}`);
    if (marks.highlight) styles.push(`background-color:${marks.highlight}`);
    if (styles.length) text = `<span style="${styles.join(';')}">${text}</span>`;
    if (run.link) text = `<a href="${escapeHtml(run.link)}" rel="noopener noreferrer">${text}</a>`;
    return text;
  }).join('');
}

function textBlockStyle(block) {
  const spacing = block.spacing || {};
  return [
    `text-align:${block.align || 'left'}`,
    `margin-left:${Number(block.indent || 0)}mm`,
    `line-height:${Number(spacing.line || 1.15)}`,
    `margin-top:${Number(spacing.before || 0)}pt`,
    `margin-bottom:${Number(spacing.after == null ? 6 : spacing.after)}pt`,
  ].join(';');
}

function blockToHtml(block) {
  if (block.type === 'page-break') return '<hr data-kheops-page-break="true" class="kheops-page-break">';
  if (block.type === 'section-break') return `<hr data-kheops-section-break="${escapeHtml(block.breakType)}" class="kheops-section-break" aria-label="Saut de section">`;
  if (block.type === 'reference') {
    return `<p class="kheops-reference" data-kheops-reference="${escapeHtml(block.referenceId)}" data-document-id="${escapeHtml(block.targetDocumentId)}" data-version-id="${escapeHtml(block.targetVersionId || '')}"><span aria-hidden="true">§</span> ${escapeHtml(block.label)}</p>`;
  }
  if (block.type === 'image') {
    return `<figure style="text-align:${block.align || 'center'}"><img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}" style="max-width:100%;width:${block.width}px"></figure>`;
  }
  if (block.type === 'table') {
    const rows = block.rows.map((row) => `<tr>${row.cells.map((cell) => `<td${cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ''}${cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : ''} style="${cell.width ? `width:${cell.width}%;` : ''}text-align:${cell.align};vertical-align:${cell.verticalAlign}">${cell.blocks.map(blockToHtml).join('')}</td>`).join('')}</tr>`).join('');
    return `<table><tbody>${rows}</tbody></table>`;
  }
  const content = runsToHtml(block.runs) || '<br>';
  if (block.type === 'heading') return `<h${block.level} style="${textBlockStyle(block)}">${content}</h${block.level}>`;
  if (block.type === 'list-item') {
    const list = block.ordered ? 'ol' : 'ul';
    return `<${list}><li style="${textBlockStyle(block)}">${content}</li></${list}>`;
  }
  return `<p style="${textBlockStyle(block)}">${content}</p>`;
}

function documentToHtml(input, { standalone = true } = {}) {
  const doc = normalizeStructuredDocument(input);
  const page = doc.page;
  const landscape = page.orientation === 'landscape';
  const width = landscape ? A4.heightMm : A4.widthMm;
  const height = landscape ? A4.widthMm : A4.heightMm;
  const header = page.header.blocks.map(blockToHtml).join('');
  const footer = page.footer.blocks.map(blockToHtml).join('');
  const signature = doc.signature && doc.signature.source !== 'none'
    ? `<aside class="kheops-signature" style="text-align:${doc.signature.alignment}" aria-label="${escapeHtml(doc.signature.altText)}">${doc.signature.image ? `<img src="${escapeHtml(doc.signature.image)}" alt="${escapeHtml(doc.signature.altText)}">` : ''}${doc.signature.text ? `<p>${escapeHtml(doc.signature.text).replace(/\n/g, '<br>')}</p>` : ''}</aside>`
    : '';
  const content = doc.blocks.map(blockToHtml).join('');
  const cssBorderStyle = page.border?.style === 'single' ? 'solid' : page.border?.style;
  const borderStyle = cssBorderStyle && cssBorderStyle !== 'none' ? `${page.border.width}px ${cssBorderStyle} ${page.border.color}` : 'none';
  const body = `<article class="kheops-document" style="box-sizing:border-box;width:${width}mm;min-height:${height}mm;padding:${page.margins.top}mm ${page.margins.right}mm ${page.margins.bottom}mm ${page.margins.left}mm;background:${page.pageColor};border:${borderStyle}"><header>${header}</header><main>${page.watermark ? `<span class="kheops-watermark" aria-hidden="true">${escapeHtml(page.watermark)}</span>` : ''}${content}${signature}</main><footer>${footer}${page.showPageNumbers ? '<span class="kheops-page-number"></span>' : ''}</footer></article>`;
  if (!standalone) return body;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title><style>@page{size:${page.format} ${page.orientation};margin:0}body{margin:0;background:#eee;font-family:Calibri,Arial,sans-serif}.kheops-document{position:relative;margin:0 auto;background:#fff}main{position:relative;column-count:${page.columns}}table{width:100%;border-collapse:collapse;column-span:all}td{border:1px solid #999;padding:4px}.kheops-page-break,.kheops-section-break{break-after:page;border:0;column-span:all}.kheops-page-number:after{content:counter(page)}.kheops-reference{padding:4px 7px;border-left:3px solid #315f91;background:#eef5fc;column-span:all}.kheops-signature{margin-top:24px;break-inside:avoid;column-span:all}.kheops-signature img{max-width:40mm;max-height:20mm}.kheops-watermark{position:absolute;inset:38% 0 auto;transform:rotate(-35deg);color:rgba(80,90,105,.16);font-size:44pt;text-align:center;pointer-events:none}</style></head><body>${body}</body></html>`;
}

function blockPlainText(block) {
  if (block.type === 'page-break') return '\f';
  if (block.type === 'section-break') return '\f';
  if (block.type === 'reference') return block.label || 'Référence documentaire';
  if (block.type === 'image') return `[Image : ${block.alt || 'sans description'}]`;
  if (block.type === 'table') return block.rows.map((row) => row.cells.map((cell) => cell.blocks.map(blockPlainText).join(' ')).join('\t')).join('\n');
  return normalizeRuns(block.runs).map((run) => run.text).join('');
}

function documentCounts(input) {
  const doc = normalizeStructuredDocument(input);
  const text = doc.blocks.map(blockPlainText).join('\n');
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/u).length : 0;
  const characters = text.length;
  const charactersNoSpaces = text.replace(/\s/gu, '').length;
  const explicitBreaks = doc.blocks.filter((block) => block.type === 'page-break').length;
  // Une estimation stable avant le rendu. L'interface remplace ce nombre par
  // la hauteur réellement mesurée lorsque le navigateur est disponible.
  const pages = Math.max(1, explicitBreaks + Math.ceil(Math.max(1, characters) / 3200));
  return { words, characters, charactersNoSpaces, pages };
}

function escapeXml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function colorToHex(value) {
  const color = String(value || '').replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(color)) return color.toUpperCase();
  if (/^[0-9a-f]{3}$/i.test(color)) return color.split('').map((c) => c + c).join('').toUpperCase();
  return null;
}

function runToWordXml(run) {
  const marks = run.marks || {};
  const props = [];
  if (marks.bold) props.push('<w:b/>');
  if (marks.italic) props.push('<w:i/>');
  if (marks.underline) props.push('<w:u w:val="single"/>');
  if (marks.strike) props.push('<w:strike/>');
  if (marks.subscript) props.push('<w:vertAlign w:val="subscript"/>');
  if (marks.superscript) props.push('<w:vertAlign w:val="superscript"/>');
  if (marks.font) props.push(`<w:rFonts w:ascii="${escapeXml(marks.font)}" w:hAnsi="${escapeXml(marks.font)}"/>`);
  if (marks.size) props.push(`<w:sz w:val="${Math.round(marks.size * 2)}"/>`);
  const color = colorToHex(marks.color);
  if (color) props.push(`<w:color w:val="${color}"/>`);
  const highlight = colorToHex(marks.highlight);
  if (highlight) props.push(`<w:shd w:fill="${highlight}"/>`);
  const textParts = String(run.text || '').split('\n').map((part, index) => `${index ? '<w:br/>' : ''}<w:t xml:space="preserve">${escapeXml(part)}</w:t>`).join('');
  const xml = `<w:r>${props.length ? `<w:rPr>${props.join('')}</w:rPr>` : ''}${textParts}</w:r>`;
  return run.link
    ? `<w:fldSimple w:instr=" HYPERLINK &quot;${escapeXml(run.link)}&quot; ">${xml}</w:fldSimple>`
    : xml;
}

function paragraphWordXml(block) {
  const props = [];
  if (block.type === 'heading') props.push(`<w:pStyle w:val="Heading${block.level}"/>`);
  if (block.align && block.align !== 'left') props.push(`<w:jc w:val="${block.align === 'justify' ? 'both' : block.align}"/>`);
  if (block.indent) props.push(`<w:ind w:left="${Math.round(block.indent * 56.7)}"/>`);
  const spacing = block.spacing || {};
  props.push(`<w:spacing w:before="${Math.round((spacing.before || 0) * 20)}" w:after="${Math.round((spacing.after == null ? 6 : spacing.after) * 20)}" w:line="${Math.round((spacing.line || 1.15) * 240)}" w:lineRule="auto"/>`);
  if (block.type === 'list-item') props.push(`<w:numPr><w:ilvl w:val="${block.level || 0}"/><w:numId w:val="${block.ordered ? 2 : 1}"/></w:numPr>`);
  return `<w:p>${props.length ? `<w:pPr>${props.join('')}</w:pPr>` : ''}${normalizeRuns(block.runs).map(runToWordXml).join('')}</w:p>`;
}

function dataImage(value) {
  const match = String(value || '').match(/^data:image\/(png|jpe?g|gif|webp);base64,([a-z0-9+/=\r\n]+)$/i);
  if (!match) return null;
  const extension = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase();
  try {
    return { extension, mime: `image/${extension}`, buffer: Buffer.from(match[2], 'base64') };
  } catch (_err) {
    return null;
  }
}

function rasterDimensions(buffer, extension) {
  try {
    if (extension === 'png' && buffer.length >= 24) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (extension === 'gif' && buffer.length >= 10) {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }
    if (extension === 'jpeg') {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) { offset += 1; continue; }
        const marker = buffer[offset + 1];
        const size = buffer.readUInt16BE(offset + 2);
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
          return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
        }
        if (!size) break;
        offset += 2 + size;
      }
    }
  } catch (_err) { /* dimensions de repli */ }
  return { width: 4, height: 3 };
}

function imageWordXml(block, context) {
  const image = dataImage(block.src);
  if (!image || !context || typeof context.addImage !== 'function') {
    return paragraphWordXml({ type: 'paragraph', runs: [{ text: `[Image : ${block.alt || 'sans description'}]`, marks: { italic: true } }] });
  }
  const registered = context.addImage(image, block);
  const align = ['left', 'right'].includes(block.align) ? block.align : 'center';
  return `<w:p><w:pPr><w:jc w:val="${align}"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${registered.cx}" cy="${registered.cy}"/><wp:docPr id="${registered.id}" name="${escapeXml(block.alt || `Image ${registered.id}`)}" descr="${escapeXml(block.alt || '')}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${registered.id}" name="${escapeXml(registered.filename)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${registered.relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${registered.cx}" cy="${registered.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function tableCellWordXml(cell, { continuation = false, colSpan = 1, width = null } = {}) {
  const normalizedColSpan = Math.max(1, Math.min(20, Number(colSpan) || 1));
  const normalizedWidth = Number.isFinite(Number(width)) ? Math.max(0, Math.min(100, Number(width))) : 0;
  const widthValue = normalizedWidth ? Math.round(normalizedWidth * 100) : 0;
  const vertical = { top: 'top', middle: 'center', bottom: 'bottom' }[cell?.verticalAlign] || 'top';
  const properties = [
    `<w:tcW w:w="${widthValue}" w:type="${widthValue ? 'pct' : 'auto'}"/>`,
    ...(normalizedColSpan > 1 ? [`<w:gridSpan w:val="${normalizedColSpan}"/>`] : []),
    ...(continuation ? ['<w:vMerge/>'] : (cell?.rowSpan > 1 ? ['<w:vMerge w:val="restart"/>'] : [])),
    `<w:vAlign w:val="${vertical}"/>`,
  ];
  const content = continuation
    ? '<w:p/>'
    : (cell?.blocks || []).map((child) => paragraphWordXml({ ...child, align: cell.align || child.align })).join('');
  return `<w:tc><w:tcPr>${properties.join('')}</w:tcPr>${content}${continuation ? '' : '<w:p/>'}</w:tc>`;
}

function tableWordXml(block) {
  const visibleColumnCount = Math.max(1, ...(block.rows || []).map((row) => (
    (row.cells || []).reduce((total, cell) => total + Math.max(1, Math.min(20, Number(cell.colSpan) || 1)), 0)
  )));
  const columnCount = Math.max(visibleColumnCount, (block.widths || []).length || 0);
  const columnWidths = (block.widths || []).length
    ? block.widths.slice(0, columnCount)
    : Array.from({ length: columnCount }, () => 100 / columnCount);
  while (columnWidths.length < columnCount) columnWidths.push(100 / columnCount);
  const grid = `<w:tblGrid>${columnWidths.map((width) => `<w:gridCol w:w="${Math.max(1, Math.round((Number(width) || 0) * 90))}"/>`).join('')}</w:tblGrid>`;
  const activeMerges = new Map();
  const rows = (block.rows || []).map((row) => {
    const occupied = new Set();
    const entries = [];
    [...activeMerges.entries()].sort((left, right) => left[0] - right[0]).forEach(([start, merge]) => {
      entries.push({
        start,
        xml: tableCellWordXml(merge.cell, {
          continuation: true,
          colSpan: merge.colSpan,
          width: merge.width,
        }),
      });
      for (let column = start; column < start + merge.colSpan; column += 1) occupied.add(column);
      merge.remaining -= 1;
      if (merge.remaining <= 0) activeMerges.delete(start);
    });

    (row.cells || []).forEach((cell) => {
      const colSpan = Math.max(1, Math.min(20, Number(cell.colSpan) || 1));
      let start = 0;
      const rangeIsFree = () => Array.from({ length: colSpan }, (_unused, offset) => start + offset)
        .every((column) => !occupied.has(column));
      while (!rangeIsFree() && start < 200) start += 1;
      for (let column = start; column < start + colSpan; column += 1) occupied.add(column);
      const width = Number.isFinite(Number(cell.width))
        ? Number(cell.width)
        : columnWidths.slice(start, start + colSpan).reduce((total, value) => total + (Number(value) || 0), 0);
      entries.push({ start, xml: tableCellWordXml(cell, { colSpan, width }) });
      const rowSpan = Math.max(1, Math.min(100, Number(cell.rowSpan) || 1));
      if (rowSpan > 1) activeMerges.set(start, {
        remaining: rowSpan - 1,
        colSpan,
        width,
        cell,
      });
    });
    entries.sort((left, right) => left.start - right.start);
    return `<w:tr>${entries.map((entry) => entry.xml).join('')}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/><w:insideH w:val="single" w:sz="4" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:color="999999"/></w:tblBorders></w:tblPr>${grid}${rows}</w:tbl>`;
}

function blockWordXml(block, context) {
  if (block.type === 'page-break') return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  if (block.type === 'section-break') {
    const type = { 'continuous': 'continuous', 'even-page': 'evenPage', 'odd-page': 'oddPage' }[block.breakType] || 'nextPage';
    return `<w:p><w:pPr><w:sectPr><w:type w:val="${type}"/></w:sectPr></w:pPr></w:p>`;
  }
  if (block.type === 'reference') {
    return paragraphWordXml({
      type: 'paragraph',
      runs: [{ text: block.label || 'Référence documentaire', marks: { underline: true, color: '#245c96' } }],
      align: 'left',
      spacing: { line: 1.15, before: 0, after: 6 },
    });
  }
  if (block.type === 'image') return imageWordXml(block, context);
  if (block.type === 'table') return tableWordXml(block);
  return paragraphWordXml(block);
}

function signatureWordXml(signature, context) {
  if (!signature || signature.source === 'none') return '';
  let xml = '<w:p/>';
  if (signature.image) {
    xml += imageWordXml({
      type: 'image',
      src: signature.image,
      alt: signature.altText || 'Signature',
      width: 240,
      align: signature.alignment || 'right',
    }, context);
  }
  for (const line of String(signature.text || '').split('\n').filter((value) => value || signature.text)) {
    xml += paragraphWordXml({
      type: 'paragraph',
      runs: [{ text: line, marks: {} }],
      align: signature.alignment || 'right',
      spacing: { line: 1, before: 0, after: 0 },
    });
  }
  return xml === '<w:p/>' ? '' : xml;
}

function createDocxBuffer(input) {
  const doc = normalizeStructuredDocument(input);
  const zip = new PizZip();
  const media = [];
  const imageContext = {
    addImage(image, block) {
      const id = media.length + 1;
      const dimensions = rasterDimensions(image.buffer, image.extension);
      const widthPx = Math.max(40, Math.min(680, Number(block.width) || 320));
      const ratio = dimensions.width > 0 && dimensions.height > 0 ? dimensions.height / dimensions.width : 0.75;
      const heightPx = Math.max(20, Math.round(widthPx * ratio));
      const item = {
        ...image,
        id,
        filename: `image${id}.${image.extension === 'jpeg' ? 'jpg' : image.extension}`,
        relationshipId: `rIdImage${id}`,
        cx: Math.round(widthPx * 9525),
        cy: Math.round(heightPx * 9525),
      };
      media.push(item);
      return item;
    },
  };
  const page = doc.page;
  const landscape = page.orientation === 'landscape';
  const sizes = {
    A4: { width: 11906, height: 16838 },
    A3: { width: 16838, height: 23811 },
    Letter: { width: 12240, height: 15840 },
    Legal: { width: 12240, height: 20160 },
  };
  const logicalSize = sizes[page.format] || sizes.A4;
  const pageWidth = landscape ? logicalSize.height : logicalSize.width;
  const pageHeight = landscape ? logicalSize.width : logicalSize.height;
  const mmToTwip = (mm) => Math.round(mm * 56.6929);
  const headerXml = page.header.blocks.map(paragraphWordXml).join('') || '<w:p/>';
  const footerNumber = page.showPageNumbers
    ? '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p>'
    : '';
  const footerXml = page.footer.blocks.map(paragraphWordXml).join('') + footerNumber || '<w:p/>';
  const firstHeaderXml = page.firstPageHeader?.blocks?.map(paragraphWordXml).join('') || null;
  const firstFooterXml = page.firstPageFooter?.blocks?.map(paragraphWordXml).join('') || null;
  const evenHeaderXml = page.evenPageHeader?.blocks?.map(paragraphWordXml).join('') || null;
  const evenFooterXml = page.evenPageFooter?.blocks?.map(paragraphWordXml).join('') || null;
  const watermark = page.watermark
    ? paragraphWordXml({ type: 'paragraph', runs: [{ text: page.watermark, marks: { color: '#D0D5DD', size: 32 } }], align: 'center', spacing: { line: 1, before: 0, after: 6 } })
    : '';
  const body = `${watermark}${doc.blocks.map((block) => blockWordXml(block, imageContext)).join('')}${signatureWordXml(doc.signature, imageContext)}`;
  const imageRelationships = media.map((item) => `<Relationship Id="${item.relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${item.filename}"/>`).join('');
  const optionalOverrides = [
    firstHeaderXml && '<Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>',
    firstFooterXml && '<Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>',
    evenHeaderXml && '<Override PartName="/word/header3.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>',
    evenFooterXml && '<Override PartName="/word/footer3.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>',
    page.oddEvenDifferent && '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>',
  ].filter(Boolean).join('');
  const optionalRelationships = [
    firstHeaderXml && '<Relationship Id="rIdHeaderFirst" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/>',
    firstFooterXml && '<Relationship Id="rIdFooterFirst" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/>',
    evenHeaderXml && '<Relationship Id="rIdHeaderEven" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header3.xml"/>',
    evenFooterXml && '<Relationship Id="rIdFooterEven" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer3.xml"/>',
    page.oddEvenDifferent && '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>',
  ].filter(Boolean).join('');
  const sectionReferences = [
    '<w:headerReference w:type="default" r:id="rIdHeader"/>',
    '<w:footerReference w:type="default" r:id="rIdFooter"/>',
    firstHeaderXml && '<w:headerReference w:type="first" r:id="rIdHeaderFirst"/>',
    firstFooterXml && '<w:footerReference w:type="first" r:id="rIdFooterFirst"/>',
    evenHeaderXml && '<w:headerReference w:type="even" r:id="rIdHeaderEven"/>',
    evenFooterXml && '<w:footerReference w:type="even" r:id="rIdFooterEven"/>',
  ].filter(Boolean).join('');
  const pageBorder = page.border?.style && page.border.style !== 'none'
    ? `<w:pgBorders w:offsetFrom="page"><w:top w:val="${page.border.style}" w:sz="${Math.max(1, Math.round(page.border.width * 8))}" w:color="${colorToHex(page.border.color) || '000000'}"/><w:left w:val="${page.border.style}" w:sz="${Math.max(1, Math.round(page.border.width * 8))}" w:color="${colorToHex(page.border.color) || '000000'}"/><w:bottom w:val="${page.border.style}" w:sz="${Math.max(1, Math.round(page.border.width * 8))}" w:color="${colorToHex(page.border.color) || '000000'}"/><w:right w:val="${page.border.style}" w:sz="${Math.max(1, Math.round(page.border.width * 8))}" w:color="${colorToHex(page.border.color) || '000000'}"/></w:pgBorders>`
    : '';

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Default Extension="webp" ContentType="image/webp"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>${optionalOverrides}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${optionalRelationships}${imageRelationships}</Relationships>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr>${sectionReferences}${page.firstPageDifferent ? '<w:titlePg/>' : ''}<w:pgSz w:w="${pageWidth}" w:h="${pageHeight}"${landscape ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="${mmToTwip(page.margins.top)}" w:right="${mmToTwip(page.margins.right)}" w:bottom="${mmToTwip(page.margins.bottom)}" w:left="${mmToTwip(page.margins.left)}" w:header="${mmToTwip(page.headerDistance)}" w:footer="${mmToTwip(page.footerDistance)}" w:gutter="0"/><w:cols w:num="${page.columns}"/>${pageBorder}</w:sectPr></w:body></w:document>`);
  media.forEach((item) => zip.file(`word/media/${item.filename}`, item.buffer));
  zip.file('word/header1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${headerXml}</w:hdr>`);
  zip.file('word/footer1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${footerXml}</w:ftr>`);
  if (firstHeaderXml) zip.file('word/header2.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${firstHeaderXml}</w:hdr>`);
  if (firstFooterXml) zip.file('word/footer2.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${firstFooterXml}</w:ftr>`);
  if (evenHeaderXml) zip.file('word/header3.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${evenHeaderXml}</w:hdr>`);
  if (evenFooterXml) zip.file('word/footer3.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${evenFooterXml}</w:ftr>`);
  if (page.oddEvenDifferent) zip.file('word/settings.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:evenAndOddHeaders/></w:settings>');
  zip.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style></w:styles>');
  zip.file('word/numbering.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num></w:numbering>');
  // Pas de date dynamique ici : à contenu structuré identique, le DOCX doit
  // avoir une empreinte identique. Cela permet la déduplication des autosaves
  // et la détection fiable d'une modification externe.
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(doc.title)}</dc:title><dc:creator>Kheops 2</dc:creator></cp:coreProperties>`);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCodePoint(parseInt(code, 16)));
}

function inlineHtmlToRuns(html) {
  const tokens = String(html || '').match(/<[^>]+>|[^<]+/g) || [];
  const stack = [{}];
  const runs = [];
  for (const token of tokens) {
    if (!token.startsWith('<')) {
      const text = decodeEntities(token);
      if (text) runs.push({ text, marks: { ...stack[stack.length - 1].marks }, ...(stack[stack.length - 1].link ? { link: stack[stack.length - 1].link } : {}) });
      continue;
    }
    if (/^<br\b/i.test(token)) {
      runs.push({ text: '\n', marks: { ...stack[stack.length - 1].marks } });
      continue;
    }
    if (/^<\//.test(token)) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const parent = stack[stack.length - 1];
    const state = { marks: { ...(parent.marks || {}) }, link: parent.link || '' };
    const tag = (token.match(/^<\s*([a-z0-9]+)/i) || [])[1]?.toLowerCase();
    if (tag === 'strong' || tag === 'b') state.marks.bold = true;
    if (tag === 'em' || tag === 'i') state.marks.italic = true;
    if (tag === 'u') state.marks.underline = true;
    if (tag === 's' || tag === 'strike' || tag === 'del') state.marks.strike = true;
    if (tag === 'sub') state.marks.subscript = true;
    if (tag === 'sup') state.marks.superscript = true;
    if (tag === 'a') state.link = cleanUrl((token.match(/href\s*=\s*["']([^"']+)/i) || [])[1]);
    const style = (token.match(/style\s*=\s*["']([^"']+)/i) || [])[1] || '';
    const color = (style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i) || [])[1];
    const background = (style.match(/background(?:-color)?\s*:\s*([^;]+)/i) || [])[1];
    const font = (style.match(/font-family\s*:\s*([^;]+)/i) || [])[1];
    const size = (style.match(/font-size\s*:\s*([\d.]+)pt/i) || [])[1];
    if (cleanColor(color)) state.marks.color = cleanColor(color);
    if (cleanColor(background)) state.marks.highlight = cleanColor(background);
    if (font) state.marks.font = cleanText(font.replace(/["']/g, ''), 80);
    if (size) state.marks.size = clamp(size, 6, 96, 11);
    if (!/\/$/.test(token) && !['img', 'hr', 'br'].includes(tag)) stack.push(state);
  }
  return normalizeRuns(runs);
}

function mammothImageBlock(imageHtml) {
  const src = cleanUrl((String(imageHtml || '').match(/src\s*=\s*["']([^"']+)/i) || [])[1], { image: true });
  if (!src) return null;
  return {
    id: makeId('image'),
    type: 'image',
    src,
    alt: decodeEntities((String(imageHtml || '').match(/alt\s*=\s*["']([^"']*)/i) || [])[1] || 'Image'),
    width: 320,
    align: 'center',
  };
}

function mammothCellBlocks(cellHtml) {
  const blocks = [];
  const source = String(cellHtml || '');
  const paragraphRegex = /<h([1-6])\b[^>]*>[\s\S]*?<\/h\1>|<li\b[^>]*>[\s\S]*?<\/li>|<p\b[^>]*>[\s\S]*?<\/p>/gi;
  let match;
  while ((match = paragraphRegex.exec(source)) && blocks.length < 100) {
    const value = match[0];
    const heading = value.match(/^<h([1-6])/i);
    const listItem = /^<li/i.test(value);
    const inner = value.replace(/^<[^>]+>/, '').replace(/<\/[^>]+>$/, '');
    blocks.push({
      id: makeId(heading ? 'heading' : 'p'),
      type: heading ? 'heading' : (listItem ? 'list-item' : 'paragraph'),
      ...(heading ? { level: Number(heading[1]) } : {}),
      ...(listItem ? { ordered: false, level: 0 } : {}),
      runs: inlineHtmlToRuns(inner),
      align: 'left',
    });
  }
  if (blocks.length) return blocks;
  return [{ id: makeId('p'), type: 'paragraph', runs: inlineHtmlToRuns(source), align: 'left' }];
}

function mammothHtmlToStructured(html, title) {
  const blocks = [];
  const source = String(html || '');
  const tokenRegex = /<table\b[\s\S]*?<\/table>|<h([1-6])\b[^>]*>[\s\S]*?<\/h\1>|<li\b[^>]*>[\s\S]*?<\/li>|<p\b[^>]*>[\s\S]*?<\/p>|<img\b[^>]*>/gi;
  let token;
  while ((token = tokenRegex.exec(source)) && blocks.length < MAX_BLOCKS) {
    const value = token[0];
    if (/^<table/i.test(value)) {
      const rows = [];
      const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch;
      while ((rowMatch = rowRegex.exec(value)) && rows.length < 100) {
        const cells = [];
        const cellRegex = /<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
        let cellMatch;
        while ((cellMatch = cellRegex.exec(rowMatch[1])) && cells.length < 20) {
          const colSpan = Number((cellMatch[1].match(/\bcolspan\s*=\s*["']?(\d+)/i) || [])[1]);
          const rowSpan = Number((cellMatch[1].match(/\browspan\s*=\s*["']?(\d+)/i) || [])[1]);
          cells.push({
            blocks: mammothCellBlocks(cellMatch[2]),
            ...(Number.isFinite(colSpan) && colSpan > 1 ? { colSpan: Math.min(20, colSpan) } : {}),
            ...(Number.isFinite(rowSpan) && rowSpan > 1 ? { rowSpan: Math.min(100, rowSpan) } : {}),
          });
        }
        if (cells.length) rows.push({ cells });
      }
      if (rows.length) blocks.push({ id: makeId('table'), type: 'table', rows });
      continue;
    }
    if (/^<img/i.test(value)) {
      const image = mammothImageBlock(value);
      if (image) blocks.push(image);
      continue;
    }
    const inner = value.replace(/^<[^>]+>/, '').replace(/<\/[^>]+>$/, '');
    const heading = value.match(/^<h([1-6])/i);
    const runs = inlineHtmlToRuns(inner);
    const embeddedImages = inner.match(/<img\b[^>]*>/gi) || [];
    if (runs.some((run) => run.text) || embeddedImages.length === 0) {
      blocks.push({
        id: makeId(heading ? 'heading' : 'p'),
        type: heading ? 'heading' : (/^<li/i.test(value) ? 'list-item' : 'paragraph'),
        ...(heading ? { level: Number(heading[1]) } : {}),
        ...(/^<li/i.test(value) ? { ordered: false, level: 0 } : {}),
        runs,
        align: 'left',
      });
    }

    // Mammoth normally nests a Word drawing inside its containing <p>. The
    // outer token therefore consumes the <img> and the standalone image branch
    // above never sees it. Preserve every embedded data image explicitly; the
    // same cleanUrl/normalization path still rejects unsafe or remote sources.
    for (const imageHtml of embeddedImages) {
      const image = mammothImageBlock(imageHtml);
      if (image && blocks.length < MAX_BLOCKS) blocks.push(image);
    }
  }
  const doc = createDefaultDocument(title);
  doc.blocks = blocks.length ? blocks : [normalizeTextBlock({ runs: [{ text: decodeEntities(source.replace(/<[^>]+>/g, ' ')), marks: {} }] }, 'paragraph')];
  return normalizeStructuredDocument(doc);
}

function analyzeDocx(buffer) {
  const warnings = [];
  const severe = [];
  let zip;
  try {
    zip = new PizZip(buffer);
  } catch (_err) {
    return {
      level: 'complex',
      label: 'Document complexe',
      warnings: ['Le fichier n’est pas un document DOCX valide.'],
      analyzedAt: new Date(),
    };
  }
  const names = Object.keys(zip.files || {});
  const documentXml = zip.file('word/document.xml')?.asText() || '';
  const relationships = zip.file('word/_rels/document.xml.rels')?.asText() || '';
  if (names.some((name) => /vbaProject\.bin$/i.test(name))) severe.push('Macros VBA détectées : elles ne seront pas exécutées par l’Éditeur Kheops.');
  if (names.some((name) => /^word\/embeddings\//i.test(name))) severe.push('Objets incorporés détectés.');
  if (names.some((name) => /^word\/diagrams\//i.test(name))) severe.push('SmartArt ou diagrammes avancés détectés.');
  if (/<w:txbxContent\b/i.test(documentXml)) warnings.push('Zones de texte flottantes détectées.');
  if (/<w:sdt\b/i.test(documentXml)) warnings.push('Contrôles de contenu ou formulaires Word détectés.');
  if ((documentXml.match(/<w:sectPr\b/gi) || []).length > 1) warnings.push('Le document utilise plusieurs sections de mise en page.');
  if (/<w:cols\b[^>]*w:num="(?:[2-9]|\d{2,})"/i.test(documentXml)) warnings.push('Mise en page en colonnes détectée.');
  if (/<w:(?:ins|del|moveFrom|moveTo)\b/i.test(documentXml)) warnings.push('Suivi des modifications détecté.');
  if (/<w:fldChar\b|<w:instrText\b/i.test(documentXml)) warnings.push('Champs Word dynamiques détectés.');
  if (/TargetMode="External"/i.test(relationships)) warnings.push('Liens vers des données ou ressources externes détectés.');
  const fontsXml = zip.file('word/fontTable.xml')?.asText() || '';
  const fonts = [...fontsXml.matchAll(/<w:font\b[^>]*w:name="([^"]+)"/gi)].map((match) => match[1]);
  const uncommon = [...new Set(fonts.filter((font) => !SAFE_FONTS.has(font)))];
  if (uncommon.length) warnings.push(`Polices à vérifier sur cet appareil : ${uncommon.slice(0, 6).join(', ')}.`);
  const allWarnings = [...severe, ...warnings];
  const level = severe.length ? 'complex' : (warnings.length ? 'partial' : 'complete');
  return {
    level,
    label: level === 'complete' ? 'Compatibilité complète' : (level === 'partial' ? 'Compatibilité partielle' : 'Document complexe'),
    warnings: allWarnings,
    analyzedAt: new Date(),
  };
}

module.exports = {
  A4,
  analyzeDocx,
  applyDocxParagraphAlignments,
  applyDocxPageMargins,
  applyDocxPresentation,
  createDefaultDocument,
  createDocxBuffer,
  documentCounts,
  documentToHtml,
  extractDocxHeader,
  extractDocxPageMargins,
  extractDocxParagraphLayouts,
  mammothHtmlToStructured,
  normalizeStoredDocumentForClient,
  normalizeStructuredDocument,
};
