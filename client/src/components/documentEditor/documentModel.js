const ALLOWED_ALIGNMENTS = new Set(['left', 'center', 'right', 'justify']);

const CSS_PIXELS_PER_INCH = 96;
const MILLIMETERS_PER_INCH = 25.4;
const LEGACY_PAGE_MARGIN_MM = 20;
const MAX_TABLE_COL_SPAN = 20;
const MAX_TABLE_ROW_SPAN = 100;

export const DEFAULT_HORIZONTAL_MARGIN_PX = 5;
export const MIN_HORIZONTAL_MARGIN_PX = 5;
export const MAX_PAGE_MARGIN_MM = 60;

export function pxToMm(value) {
  const pixels = Number(value);
  return Number.isFinite(pixels) ? pixels * MILLIMETERS_PER_INCH / CSS_PIXELS_PER_INCH : 0;
}

export function mmToPx(value) {
  const millimeters = Number(value);
  return Number.isFinite(millimeters) ? millimeters * CSS_PIXELS_PER_INCH / MILLIMETERS_PER_INCH : 0;
}

function marginValue(value, fallback = LEGACY_PAGE_MARGIN_MM) {
  if (value == null || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function clampHorizontalMarginMm(value, fallback = LEGACY_PAGE_MARGIN_MM) {
  return Math.max(
    pxToMm(MIN_HORIZONTAL_MARGIN_PX),
    Math.min(MAX_PAGE_MARGIN_MM, marginValue(value, fallback)),
  );
}

export function normalizePageMargins(margins = {}) {
  const source = margins && typeof margins === 'object' ? margins : {};
  return {
    top: Math.max(5, Math.min(MAX_PAGE_MARGIN_MM, marginValue(source.top))),
    right: clampHorizontalMarginMm(source.right),
    bottom: Math.max(5, Math.min(MAX_PAGE_MARGIN_MM, marginValue(source.bottom))),
    left: clampHorizontalMarginMm(source.left),
  };
}

export function makeBlockId(prefix = 'block') {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

export function createEmptyDocument(title = 'Document sans titre') {
  return {
    schemaVersion: 2,
    title: title || 'Document sans titre',
    documentType: 'generic',
    localOverrides: { layout: false, header: false, footer: false, signature: false, styles: false },
    styles: {},
    signature: null,
    page: {
      format: 'A4',
      orientation: 'portrait',
      margins: {
        top: LEGACY_PAGE_MARGIN_MM,
        right: pxToMm(DEFAULT_HORIZONTAL_MARGIN_PX),
        bottom: LEGACY_PAGE_MARGIN_MM,
        left: pxToMm(DEFAULT_HORIZONTAL_MARGIN_PX),
      },
      header: { blocks: [emptyParagraph('header')] },
      footer: { blocks: [emptyParagraph('footer')] },
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
    blocks: [emptyParagraph()],
  };
}

export function emptyParagraph(prefix = 'p') {
  return {
    id: makeBlockId(prefix),
    type: 'paragraph',
    runs: [{ text: '', marks: {} }],
    align: 'left',
    indent: 0,
    spacing: { line: 1.15, before: 0, after: 6 },
  };
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{3,8}$/i.test(color) || /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(color)
    ? color
    : '';
}

function safeUrl(value, image = false) {
  const url = String(value || '').trim();
  if (image && /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\r\n]+$/i.test(url)) return url;
  if (/^https:\/\//i.test(url)) return url.slice(0, 2000);
  if (!image && /^(?:https?:\/\/|mailto:)/i.test(url)) return url.slice(0, 2000);
  return '';
}

function runToHtml(run = {}) {
  const marks = run.marks || {};
  let text = escapeHtml(run.text || '').replace(/\n/g, '<br>');
  if (marks.bold) text = `<strong>${text}</strong>`;
  if (marks.italic) text = `<em>${text}</em>`;
  if (marks.underline) text = `<u>${text}</u>`;
  if (marks.strike) text = `<s>${text}</s>`;
  if (marks.subscript) text = `<sub>${text}</sub>`;
  if (marks.superscript) text = `<sup>${text}</sup>`;
  const styles = [];
  if (marks.font) styles.push(`font-family:${escapeHtml(String(marks.font).slice(0, 80))}`);
  if (Number(marks.size) >= 6 && Number(marks.size) <= 96) styles.push(`font-size:${Number(marks.size)}pt`);
  if (safeColor(marks.color)) styles.push(`color:${safeColor(marks.color)}`);
  if (safeColor(marks.highlight)) styles.push(`background-color:${safeColor(marks.highlight)}`);
  if (styles.length) text = `<span style="${styles.join(';')}">${text}</span>`;
  const link = safeUrl(run.link);
  if (link) text = `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  return text;
}

function blockStyle(block = {}) {
  const spacing = block.spacing || {};
  const align = ALLOWED_ALIGNMENTS.has(block.align) ? block.align : 'left';
  return [
    `text-align:${align}`,
    `margin-left:${Math.max(0, Math.min(80, Number(block.indent) || 0))}mm`,
    `line-height:${Math.max(1, Math.min(3, Number(spacing.line) || 1.15))}`,
    `margin-top:${Math.max(0, Math.min(72, Number(spacing.before) || 0))}pt`,
    `margin-bottom:${Math.max(0, Math.min(72, spacing.after == null ? 6 : Number(spacing.after) || 0))}pt`,
  ].join(';');
}

function normalizeTableSpan(value, maximum) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.min(maximum, Math.trunc(numeric)));
}

export function blockToEditableHtml(block = {}) {
  if (block.type === 'page-break') {
    return `<hr class="kheops-editor-page-break" data-kheops-page-break="true" contenteditable="false" aria-label="Saut de page">`;
  }
  if (block.type === 'section-break') {
    return `<hr class="kheops-editor-section-break" data-kheops-section-break="${escapeHtml(block.breakType || 'next-page')}" contenteditable="false" aria-label="Saut de section">`;
  }
  if (block.type === 'reference') {
    const state = block.status === 'active' ? '' : ` is-${escapeHtml(block.status)}`;
    return `<p class="kheops-editor-reference${state}" data-kheops-reference="${escapeHtml(block.referenceId || '')}" data-target-dossier-id="${escapeHtml(block.targetDossierId || '')}" data-target-document-id="${escapeHtml(block.targetDocumentId || '')}" data-target-version-id="${escapeHtml(block.targetVersionId || '')}" data-follow-latest="${block.followLatest ? 'true' : 'false'}" data-reference-type="${escapeHtml(block.referenceType || 'piece')}" data-piece-number="${escapeHtml(block.pieceNumber || '')}" data-reference-status="${escapeHtml(block.status || 'active')}" contenteditable="false" role="link" tabindex="0" aria-label="Ouvrir la référence ${escapeHtml(block.label || 'documentaire')}"><span aria-hidden="true">§</span> ${escapeHtml(block.label || 'Référence documentaire')}</p>`;
  }
  if (block.type === 'image') {
    const src = safeUrl(block.src, true);
    if (!src) return '';
    return `<figure class="kheops-editor-image" style="text-align:${['left', 'right'].includes(block.align) ? block.align : 'center'}" data-kheops-image="true"><img src="${escapeHtml(src)}" alt="${escapeHtml(block.alt || 'Image')}" style="width:${Math.max(40, Math.min(680, Number(block.width) || 320))}px;max-width:100%"><figcaption contenteditable="true">${escapeHtml(block.alt || '')}</figcaption></figure>`;
  }
  if (block.type === 'table') {
    const rows = (block.rows || []).map((row) => `<tr>${(row.cells || []).map((cell) => {
      const width = Number(cell && cell.width);
      const align = ['left', 'center', 'right'].includes(cell && cell.align) ? cell.align : 'left';
      const verticalAlign = ['top', 'middle', 'bottom'].includes(cell && cell.verticalAlign) ? cell.verticalAlign : 'top';
      const colSpan = normalizeTableSpan(cell && (cell.colSpan ?? cell.colspan), MAX_TABLE_COL_SPAN);
      const rowSpan = normalizeTableSpan(cell && (cell.rowSpan ?? cell.rowspan), MAX_TABLE_ROW_SPAN);
      const style = `${width >= 5 && width <= 90 ? `width:${width}%;` : ''}text-align:${align};vertical-align:${verticalAlign}`;
      const spanAttributes = `${colSpan > 1 ? ` colspan="${colSpan}"` : ''}${rowSpan > 1 ? ` rowspan="${rowSpan}"` : ''}`;
      return `<td${spanAttributes} style="${style}">${((cell && cell.blocks) || [emptyParagraph()]).map(blockToEditableHtml).join('')}</td>`;
    }).join('')}</tr>`).join('');
    return `<table data-kheops-table="true"><tbody>${rows}</tbody></table>`;
  }
  const content = (block.runs || [{ text: '', marks: {} }]).map(runToHtml).join('') || '<br>';
  if (block.type === 'heading') {
    const level = Math.max(1, Math.min(6, Number(block.level) || 1));
    return `<h${level} data-kheops-block="${escapeHtml(block.id || makeBlockId('h'))}" style="${blockStyle(block)}">${content}</h${level}>`;
  }
  if (block.type === 'list-item') {
    const tag = block.ordered ? 'ol' : 'ul';
    return `<${tag}><li data-kheops-block="${escapeHtml(block.id || makeBlockId('li'))}" style="${blockStyle(block)}">${content}</li></${tag}>`;
  }
  return `<p data-kheops-block="${escapeHtml(block.id || makeBlockId('p'))}" style="${blockStyle(block)}">${content}</p>`;
}

export function blocksToEditableHtml(blocks) {
  const source = Array.isArray(blocks) && blocks.length ? blocks : [emptyParagraph()];
  return source.map(blockToEditableHtml).join('');
}

function colorFromStyle(value) {
  if (!value) return '';
  const temp = document.createElement('span');
  temp.style.color = value;
  document.body.appendChild(temp);
  const color = getComputedStyle(temp).color;
  temp.remove();
  return safeColor(color);
}

function marksForElement(element, inherited) {
  const marks = { ...inherited };
  const tag = element.tagName.toLowerCase();
  if (tag === 'strong' || tag === 'b') marks.bold = true;
  if (tag === 'em' || tag === 'i') marks.italic = true;
  if (tag === 'u') marks.underline = true;
  if (tag === 's' || tag === 'strike' || tag === 'del') marks.strike = true;
  if (tag === 'sub') marks.subscript = true;
  if (tag === 'sup') marks.superscript = true;
  const style = element.style || {};
  if (style.fontWeight && (Number(style.fontWeight) >= 600 || style.fontWeight === 'bold')) marks.bold = true;
  if (style.fontStyle === 'italic') marks.italic = true;
  if (style.textDecorationLine && style.textDecorationLine.includes('underline')) marks.underline = true;
  if (style.textDecorationLine && style.textDecorationLine.includes('line-through')) marks.strike = true;
  if (style.fontFamily) marks.font = style.fontFamily.replace(/["']/g, '').slice(0, 80);
  if (style.fontSize) {
    const size = parseFloat(style.fontSize);
    // Le modèle produit des points ; seule une taille en pixels est convertie.
    if (Number.isFinite(size) && /(?:pt|px)$/i.test(style.fontSize)) {
      marks.size = Math.round(size * (style.fontSize.endsWith('px') ? 0.75 : 1) * 10) / 10;
    }
  }
  if (style.color) marks.color = colorFromStyle(style.color);
  if (style.backgroundColor && style.backgroundColor !== 'transparent') marks.highlight = colorFromStyle(style.backgroundColor);
  return marks;
}

function domNodeToRuns(node, inheritedMarks = {}, inheritedLink = '') {
  if (!node) return [];
  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue ? [{ text: node.nodeValue, marks: { ...inheritedMarks }, ...(inheritedLink ? { link: inheritedLink } : {}) }] : [];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  if (node.tagName === 'BR') return [{ text: '\n', marks: { ...inheritedMarks }, ...(inheritedLink ? { link: inheritedLink } : {}) }];
  const marks = marksForElement(node, inheritedMarks);
  const link = node.tagName === 'A' ? safeUrl(node.getAttribute('href')) : inheritedLink;
  return Array.from(node.childNodes).flatMap((child) => domNodeToRuns(child, marks, link));
}

function elementSpacing(element) {
  const style = element.style || {};
  const toPt = (value, fallback) => {
    const n = parseFloat(value);
    if (!Number.isFinite(n)) return fallback;
    return value.includes('px') ? Math.round(n * 0.75 * 10) / 10 : n;
  };
  return {
    line: Math.max(1, Math.min(3, parseFloat(style.lineHeight) || 1.15)),
    before: Math.max(0, Math.min(72, toPt(style.marginTop || '', 0))),
    after: Math.max(0, Math.min(72, toPt(style.marginBottom || '', 6))),
  };
}

function domTextBlock(element, overrides = {}, seenIds = new Set()) {
  // Native editing may clone a paragraph's attributes when splitting it.
  // Retain the first anchor; allocate and persist distinct IDs for its clones.
  let id = element.dataset.kheopsBlock;
  if (!id || seenIds.has(id)) {
    id = makeBlockId(overrides.type || 'p');
    element.dataset.kheopsBlock = id;
  }
  seenIds.add(id);
  const margin = parseFloat(element.style && element.style.marginLeft) || 0;
  const marginMm = element.style && element.style.marginLeft.includes('px') ? margin * 0.264583 : margin;
  return {
    id,
    type: overrides.type || 'paragraph',
    ...(overrides.level ? { level: overrides.level } : {}),
    ...(overrides.type === 'list-item' ? { ordered: Boolean(overrides.ordered), level: 0 } : {}),
    runs: domNodeToRuns(element).length ? domNodeToRuns(element) : [{ text: '', marks: {} }],
    align: ALLOWED_ALIGNMENTS.has(element.style.textAlign) ? element.style.textAlign : 'left',
    indent: Math.round(Math.max(0, Math.min(80, marginMm)) * 10) / 10,
    spacing: elementSpacing(element),
  };
}

function tableFromDom(table, seenIds) {
  const rows = Array.from(table.rows || []).slice(0, 100).map((row) => ({
    cells: Array.from(row.cells || []).slice(0, 20).map((cell) => {
      const rawWidth = parseFloat(cell.style.width);
      const colSpan = normalizeTableSpan(cell.getAttribute('colspan'), MAX_TABLE_COL_SPAN);
      const rowSpan = normalizeTableSpan(cell.getAttribute('rowspan'), MAX_TABLE_ROW_SPAN);
      return {
        blocks: domToBlocks(cell, seenIds).filter((block) => ['paragraph', 'heading', 'list-item'].includes(block.type)),
        ...(Number.isFinite(rawWidth) ? { width: Math.max(5, Math.min(90, rawWidth)) } : {}),
        ...(colSpan > 1 ? { colSpan } : {}),
        ...(rowSpan > 1 ? { rowSpan } : {}),
        align: ALLOWED_ALIGNMENTS.has(cell.style.textAlign) && cell.style.textAlign !== 'justify' ? cell.style.textAlign : 'left',
        verticalAlign: ['top', 'middle', 'bottom'].includes(cell.style.verticalAlign) ? cell.style.verticalAlign : 'top',
      };
    }),
  })).filter((row) => row.cells.length);
  return rows.length ? { id: makeBlockId('table'), type: 'table', rows } : null;
}

export function domToBlocks(root, seenIds = new Set()) {
  if (!root) return [emptyParagraph()];
  const blocks = [];
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.nodeValue) blocks.push({ ...emptyParagraph(), runs: [{ text: node.nodeValue, marks: {} }] });
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = node.tagName.toLowerCase();
    if (node.dataset?.kheopsReference) {
      blocks.push({
        id: makeBlockId('reference'),
        type: 'reference',
        referenceId: node.dataset.kheopsReference,
        targetDossierId: node.dataset.targetDossierId || '',
        targetDocumentId: node.dataset.targetDocumentId || '',
        targetVersionId: node.dataset.followLatest === 'true' ? null : (node.dataset.targetVersionId || null),
        followLatest: node.dataset.followLatest === 'true',
        referenceType: node.dataset.referenceType || 'piece',
        pieceNumber: node.dataset.pieceNumber || '',
        status: node.dataset.referenceStatus || 'active',
        label: node.textContent.replace(/^§\s*/, '').trim() || 'Référence documentaire',
      });
    } else if (tag === 'hr' && node.dataset.kheopsPageBreak === 'true') {
      blocks.push({ id: makeBlockId('break'), type: 'page-break' });
    } else if (tag === 'hr' && node.dataset.kheopsSectionBreak) {
      blocks.push({ id: makeBlockId('section'), type: 'section-break', breakType: node.dataset.kheopsSectionBreak });
    } else if (tag === 'table') {
      const table = tableFromDom(node, seenIds);
      if (table) blocks.push(table);
    } else if (tag === 'figure' || tag === 'img') {
      const image = tag === 'img' ? node : node.querySelector('img');
      const caption = tag === 'figure' ? node.querySelector('figcaption') : null;
      const src = image && safeUrl(image.getAttribute('src'), true);
      if (src) blocks.push({
        id: makeBlockId('image'), type: 'image', src,
        alt: (caption && caption.textContent) || image.getAttribute('alt') || 'Image',
        width: Math.max(40, Math.min(680, parseFloat(image.style.width) || image.width || 320)),
        align: ['left', 'right'].includes(node.style.textAlign) ? node.style.textAlign : 'center',
      });
    } else if (tag === 'ul' || tag === 'ol') {
      Array.from(node.children).filter((child) => child.tagName === 'LI').forEach((li) => {
        blocks.push(domTextBlock(li, { type: 'list-item', ordered: tag === 'ol' }, seenIds));
      });
    } else if (/^h[1-6]$/.test(tag)) {
      blocks.push(domTextBlock(node, { type: 'heading', level: Number(tag.slice(1)) }, seenIds));
    } else if (tag === 'li') {
      blocks.push(domTextBlock(node, { type: 'list-item', ordered: false }, seenIds));
    } else if (['p', 'div', 'blockquote'].includes(tag)) {
      blocks.push(domTextBlock(node, {}, seenIds));
    } else {
      blocks.push(domTextBlock(node, {}, seenIds));
    }
  }
  return blocks.length ? blocks : [emptyParagraph()];
}

export function collectStructuredDocument({ editor, header, footer, title, page, baseDocument = null }) {
  const base = baseDocument && typeof baseDocument === 'object' ? baseDocument : createEmptyDocument(title);
  const seenIds = new Set();
  const headerBlocks = domToBlocks(header, seenIds);
  const editsFirstPageHeader = Boolean(page.firstPageDifferent);
  return {
    ...base,
    schemaVersion: 2,
    title: title || 'Document sans titre',
    page: {
      ...base.page,
      ...page,
      format: ['A4', 'A3', 'Letter', 'Legal'].includes(page.format) ? page.format : 'A4',
      orientation: page.orientation === 'landscape' ? 'landscape' : 'portrait',
      margins: normalizePageMargins(page.margins),
      // L'éditeur affiche la première page. Quand elle possède un en-tête
      // distinct (cas des courriers générés depuis le profil), la saisie doit
      // mettre à jour firstPageHeader sans transformer l'en-tête en en-tête de
      // toutes les pages.
      header: editsFirstPageHeader
        ? (base.page?.header || { blocks: [emptyParagraph('header')] })
        : { blocks: headerBlocks },
      ...(editsFirstPageHeader ? { firstPageHeader: { blocks: headerBlocks } } : {}),
      footer: { blocks: domToBlocks(footer, seenIds) },
      showPageNumbers: page.showPageNumbers !== false,
      columns: Math.max(1, Math.min(3, Number(page.columns) || 1)),
      firstPageDifferent: Boolean(page.firstPageDifferent),
      oddEvenDifferent: Boolean(page.oddEvenDifferent),
      headerDistance: Math.max(0, Math.min(60, Number(page.headerDistance) || 12.7)),
      footerDistance: Math.max(0, Math.min(60, Number(page.footerDistance) || 12.7)),
      pageColor: /^#[0-9a-f]{6}$/i.test(page.pageColor || '') ? page.pageColor : '#ffffff',
      border: page.border || { style: 'none', color: '#000000', width: 1 },
      watermark: String(page.watermark || '').slice(0, 120),
    },
    blocks: domToBlocks(editor, seenIds),
  };
}

function textOfBlock(block) {
  if (block.type === 'page-break') return '\f';
  if (block.type === 'section-break') return '\f';
  if (block.type === 'reference') return block.label || 'Référence documentaire';
  if (block.type === 'image') return `[Image : ${block.alt || ''}]`;
  if (block.type === 'table') return (block.rows || []).map((row) => (row.cells || []).map((cell) => (cell.blocks || []).map(textOfBlock).join(' ')).join('\t')).join('\n');
  return (block.runs || []).map((run) => run.text || '').join('');
}

function blockPageWeight(block) {
  if (block.type === 'image') return 900;
  if (block.type === 'table') return Math.max(450, (block.rows || []).length * 260);
  if (block.type === 'heading') return Math.max(180, textOfBlock(block).length * 1.4);
  return Math.max(90, textOfBlock(block).length);
}

function paginateBlocks(blocks, capacity = 3200) {
  const pages = [[]];
  let used = 0;
  for (const block of blocks || []) {
    if (block.type === 'page-break' || (block.type === 'section-break' && block.breakType !== 'continuous')) {
      pages.push([]);
      used = 0;
      continue;
    }
    const weight = blockPageWeight(block);
    if (pages[pages.length - 1].length && used + weight > capacity) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(block);
    used += weight;
  }
  return pages.length ? pages : [[]];
}

export function countDocument(document) {
  const blocks = document && Array.isArray(document.blocks) ? document.blocks : [];
  const text = blocks.map(textOfBlock).join('\n');
  const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
  return {
    words,
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/gu, '').length,
    pages: paginateBlocks(blocks).length,
  };
}

function replaceRuns(block, search, replacement, replaceAll) {
  if (block.type === 'table') {
    return {
      ...block,
      rows: (block.rows || []).map((row) => ({
        ...row,
        cells: (row.cells || []).map((cell) => ({
          ...cell,
          blocks: (cell.blocks || []).map((child) => replaceRuns(child, search, replacement, replaceAll)),
        })),
      })),
    };
  }
  if (!Array.isArray(block.runs)) return block;
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(escaped, replaceAll ? 'gi' : 'i');
  let replaced = false;
  return {
    ...block,
    runs: block.runs.map((run) => {
      if (!replaceAll && replaced) return run;
      const next = String(run.text || '').replace(expression, (match) => {
        replaced = true;
        return replacement;
      });
      return { ...run, text: next };
    }),
  };
}

export function replaceInDocument(document, search, replacement, replaceAll = true) {
  if (!search) return document;
  return { ...document, blocks: (document.blocks || []).map((block) => replaceRuns(block, search, replacement, replaceAll)) };
}

export function documentToPrintHtml(document) {
  const doc = document || createEmptyDocument();
  const defaultPage = createEmptyDocument().page;
  const page = {
    ...defaultPage,
    ...(doc.page || {}),
    margins: normalizePageMargins(doc.page && doc.page.margins),
  };
  const landscape = page.orientation === 'landscape';
  const sizes = { A4: [210, 297], A3: [297, 420], Letter: [215.9, 279.4], Legal: [215.9, 355.6] };
  const logical = sizes[page.format] || sizes.A4;
  const width = landscape ? logical[1] : logical[0];
  const height = landscape ? logical[0] : logical[1];
  const header = blocksToEditableHtml((page.header && page.header.blocks) || []);
  const footer = blocksToEditableHtml((page.footer && page.footer.blocks) || []);
  const pages = paginateBlocks(doc.blocks);
  const signature = doc.signature && doc.signature.source !== 'none'
    ? `<aside class="signature" style="text-align:${doc.signature.alignment || 'right'}" aria-label="${escapeHtml(doc.signature.altText || 'Signature')}">${doc.signature.image ? `<img src="${escapeHtml(doc.signature.image)}" alt="${escapeHtml(doc.signature.altText || 'Signature')}">` : ''}${doc.signature.text ? `<p>${escapeHtml(doc.signature.text).replace(/\n/g, '<br>')}</p>` : ''}</aside>`
    : '';
  const content = pages.map((pageBlocks, index) => {
    const isFirst = index === 0;
    const isEven = (index + 1) % 2 === 0;
    const selectedHeader = isFirst && page.firstPageDifferent && page.firstPageHeader
      ? blocksToEditableHtml(page.firstPageHeader.blocks || [])
      : (isEven && page.oddEvenDifferent && page.evenPageHeader ? blocksToEditableHtml(page.evenPageHeader.blocks || []) : header);
    const selectedFooter = isFirst && page.firstPageDifferent && page.firstPageFooter
      ? blocksToEditableHtml(page.firstPageFooter.blocks || [])
      : (isEven && page.oddEvenDifferent && page.evenPageFooter ? blocksToEditableHtml(page.evenPageFooter.blocks || []) : footer);
    return `<article class="page"><header>${selectedHeader}</header><main>${page.watermark ? `<span class="watermark" aria-hidden="true">${escapeHtml(page.watermark)}</span>` : ''}${blocksToEditableHtml(pageBlocks)}${index === pages.length - 1 ? signature : ''}</main><footer>${selectedFooter}${page.showPageNumbers ? `<div class="page-number">Page ${index + 1} sur ${pages.length}</div>` : ''}</footer></article>`;
  }).join('');
  const cssBorderStyle = page.border?.style === 'single' ? 'solid' : page.border?.style;
  const border = cssBorderStyle && cssBorderStyle !== 'none' ? `${page.border.width || 1}px ${cssBorderStyle} ${page.border.color || '#000'}` : 'none';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title><style>@page{size:${page.format || 'A4'} ${page.orientation};margin:0}*{box-sizing:border-box}html,body{margin:0;background:#dfe3e9;font-family:Calibri,Arial,sans-serif;color:#111}.page{position:relative;width:${width}mm;min-height:${height}mm;margin:0 auto 8mm;padding:${page.margins.top}mm ${page.margins.right}mm ${page.margins.bottom}mm ${page.margins.left}mm;background:${page.pageColor || '#fff'};border:${border};break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}header{min-height:10mm;border-bottom:1px solid #ddd;margin-bottom:7mm}main{position:relative;min-height:${Math.max(20, height - page.margins.top - page.margins.bottom - 36)}mm;column-count:${page.columns || 1}}footer{position:relative;min-height:13mm;border-top:1px solid #ddd;margin-top:7mm;padding-top:3mm}.page-number{position:absolute;right:0;bottom:0;color:#666;font-size:9pt}table{width:100%;border-collapse:collapse;table-layout:fixed;column-span:all}td{border:1px solid #777;padding:4px}figure{text-align:center;column-span:all}img{max-width:100%}.kheops-editor-reference{column-span:all;padding:4px 7px;border-left:3px solid #315f91;background:#eef5fc}.signature{column-span:all;margin-top:24px;break-inside:avoid}.signature img{max-width:40mm;max-height:20mm}.watermark{position:absolute;inset:38% 0 auto;transform:rotate(-35deg);color:rgba(80,90,105,.16);font-size:44pt;text-align:center;pointer-events:none}@media print{html,body{background:#fff}.page{margin:0}}</style></head><body>${content}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),150));</script></body></html>`;
}
