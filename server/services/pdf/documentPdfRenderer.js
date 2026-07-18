const {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
} = require('pdf-lib');

const { normalizeStructuredDocument } = require('../documentEditorFormat');

const POINTS_PER_MM = 72 / 25.4;
const A4 = Object.freeze({ width: 210 * POINTS_PER_MM, height: 297 * POINTS_PER_MM });
const PDF_MIME = 'application/pdf';
const FIXED_METADATA_DATE = new Date('2000-01-01T00:00:00.000Z');

function mmToPoints(value) {
  return Number(value || 0) * POINTS_PER_MM;
}

function sanitizePdfText(value) {
  return String(value == null ? '' : value)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/\u2026/g, '...')
    .replace(/[^\x09\x0a\x20-\x7e\u00a1-\u00ff\u20ac\u2018\u2019\u201c\u201d\u2022\u2039\u203a\u0152\u0153\u0160\u0161\u0178\u017d\u017e]/gu, '?');
}

function colorFrom(value, fallback = rgb(0, 0, 0)) {
  const source = String(value || '').trim();
  const short = source.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short) {
    return rgb(
      parseInt(`${short[1]}${short[1]}`, 16) / 255,
      parseInt(`${short[2]}${short[2]}`, 16) / 255,
      parseInt(`${short[3]}${short[3]}`, 16) / 255,
    );
  }
  const hex = source.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return rgb(
      parseInt(hex[1].slice(0, 2), 16) / 255,
      parseInt(hex[1].slice(2, 4), 16) / 255,
      parseInt(hex[1].slice(4, 6), 16) / 255,
    );
  }
  const functional = source.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (functional) {
    return rgb(
      Math.min(255, Number(functional[1])) / 255,
      Math.min(255, Number(functional[2])) / 255,
      Math.min(255, Number(functional[3])) / 255,
    );
  }
  return fallback;
}

function fontKey(marks = {}) {
  if (marks.bold && marks.italic) return 'boldItalic';
  if (marks.bold) return 'bold';
  if (marks.italic) return 'italic';
  return 'regular';
}

function segmentFromRun(run, fonts, fallbackSize) {
  const marks = run?.marks || {};
  return {
    text: sanitizePdfText(run?.text),
    font: fonts[fontKey(marks)],
    size: Number(marks.size) || fallbackSize,
    color: colorFrom(marks.color),
    highlight: marks.highlight ? colorFrom(marks.highlight, null) : null,
    underline: Boolean(marks.underline),
    strike: Boolean(marks.strike),
  };
}

function tokenizeSegment(segment) {
  return segment.text.split(/(\n|[ \t]+)/).filter((token) => token !== '');
}

function widthOf(segment, text = segment.text) {
  if (!text) return 0;
  return segment.font.widthOfTextAtSize(text, segment.size);
}

function pushLine(lines, current) {
  lines.push({
    segments: current.segments,
    width: current.width,
    maxSize: current.maxSize,
  });
  current.segments = [];
  current.width = 0;
  current.maxSize = 0;
}

function splitLongToken(segment, token, maxWidth) {
  const chunks = [];
  let current = '';
  for (const char of token) {
    if (current && widthOf(segment, current + char) > maxWidth) {
      chunks.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [''];
}

function layoutSegments(segments, maxWidth) {
  const lines = [];
  const current = { segments: [], width: 0, maxSize: 0 };
  const append = (segment, text) => {
    const width = widthOf(segment, text);
    current.segments.push({ ...segment, text, width });
    current.width += width;
    current.maxSize = Math.max(current.maxSize, segment.size);
  };

  for (const segment of segments) {
    for (const rawToken of tokenizeSegment(segment)) {
      if (rawToken === '\n') {
        pushLine(lines, current);
        continue;
      }
      const token = rawToken.replace(/\t/g, '    ');
      const whitespace = /^\s+$/.test(token);
      if (whitespace && current.segments.length === 0) continue;
      const tokenWidth = widthOf(segment, token);
      if (current.segments.length && current.width + tokenWidth > maxWidth) {
        pushLine(lines, current);
        if (whitespace) continue;
      }
      if (tokenWidth <= maxWidth) {
        append(segment, token);
        continue;
      }
      const chunks = splitLongToken(segment, token, maxWidth);
      chunks.forEach((chunk, index) => {
        if (index > 0) pushLine(lines, current);
        append(segment, chunk);
      });
    }
  }
  if (current.segments.length || lines.length === 0) pushLine(lines, current);
  return lines;
}

function plainTextFromBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : []).map((block) => (
    Array.isArray(block?.runs)
      ? block.runs.map((run) => sanitizePdfText(run?.text)).join('')
      : ''
  )).join('\n');
}

function dataImage(value) {
  const match = String(value || '').match(/^data:image\/(png|jpeg|jpg);base64,([a-z0-9+/=\r\n]+)$/i);
  if (!match) return null;
  return { type: match[1].toLowerCase(), buffer: Buffer.from(match[2], 'base64') };
}

class PdfPainter {
  constructor(pdf, document, fonts) {
    this.pdf = pdf;
    this.document = document;
    this.fonts = fonts;
    this.page = null;
    this.cursorY = 0;
    this.listCounters = new Map();
    this.createPage();
  }

  get pageWidth() {
    return this.document.page.orientation === 'landscape' ? A4.height : A4.width;
  }

  get pageHeight() {
    return this.document.page.orientation === 'landscape' ? A4.width : A4.height;
  }

  get margins() {
    const value = this.document.page.margins;
    return {
      top: mmToPoints(value.top),
      right: mmToPoints(value.right),
      bottom: mmToPoints(value.bottom),
      left: mmToPoints(value.left),
    };
  }

  createPage() {
    this.page = this.pdf.addPage([this.pageWidth, this.pageHeight]);
    const background = colorFrom(this.document.page.pageColor, rgb(1, 1, 1));
    this.page.drawRectangle({ x: 0, y: 0, width: this.pageWidth, height: this.pageHeight, color: background });
    this.drawPageBorder();
    this.drawWatermark();
    this.cursorY = this.pageHeight - this.margins.top;
    return this.page;
  }

  drawPageBorder() {
    const border = this.document.page.border || {};
    if (!border.style || border.style === 'none' || Number(border.width) <= 0) return;
    const inset = Math.max(4, Number(border.width));
    const dashArray = border.style === 'dashed' ? [5, 3] : undefined;
    const options = {
      x: inset,
      y: inset,
      width: this.pageWidth - (2 * inset),
      height: this.pageHeight - (2 * inset),
      borderColor: colorFrom(border.color),
      borderWidth: Math.max(0.5, Number(border.width)),
      ...(dashArray ? { borderDashArray: dashArray } : {}),
    };
    this.page.drawRectangle(options);
    if (border.style === 'double') {
      this.page.drawRectangle({ ...options, x: inset + 3, y: inset + 3, width: options.width - 6, height: options.height - 6, borderWidth: 0.5 });
    }
  }

  drawWatermark() {
    const text = sanitizePdfText(this.document.page.watermark);
    if (!text) return;
    let size = 46;
    const font = this.fonts.bold;
    while (size > 18 && font.widthOfTextAtSize(text, size) > this.pageWidth * 0.75) size -= 2;
    const width = font.widthOfTextAtSize(text, size);
    this.page.drawText(text, {
      x: (this.pageWidth - width) / 2,
      y: this.pageHeight * 0.45,
      size,
      font,
      color: rgb(0.45, 0.5, 0.58),
      opacity: 0.14,
      rotate: degrees(35),
    });
  }

  ensureSpace(height) {
    if (this.cursorY - height < this.margins.bottom) this.createPage();
  }

  drawLine(line, { left, width, align = 'left', lineHeight }) {
    let x = left;
    if (align === 'center') x += Math.max(0, (width - line.width) / 2);
    if (align === 'right') x += Math.max(0, width - line.width);
    const baseline = this.cursorY - Math.max(line.maxSize || 10, lineHeight * 0.78);
    for (const segment of line.segments) {
      if (!segment.text) continue;
      if (segment.highlight) {
        this.page.drawRectangle({
          x,
          y: baseline - 1,
          width: segment.width,
          height: segment.size + 2,
          color: segment.highlight,
        });
      }
      this.page.drawText(segment.text, {
        x,
        y: baseline,
        size: segment.size,
        font: segment.font,
        color: segment.color,
      });
      if (segment.underline || segment.strike) {
        const y = segment.strike ? baseline + (segment.size * 0.34) : baseline - 1;
        this.page.drawLine({
          start: { x, y },
          end: { x: x + segment.width, y },
          thickness: Math.max(0.5, segment.size / 18),
          color: segment.color,
        });
      }
      x += segment.width;
    }
    this.cursorY -= lineHeight;
  }

  drawTextBlock(block, overrides = {}) {
    const isHeading = block.type === 'heading';
    const headingSizes = { 1: 22, 2: 18, 3: 15, 4: 13, 5: 11, 6: 10 };
    const fallbackSize = overrides.size || (isHeading ? headingSizes[block.level] || 14 : 11);
    const level = Number(block.level || 0);
    let prefix = '';
    if (block.type === 'list-item') {
      if (block.ordered) {
        const counter = (this.listCounters.get(level) || 0) + 1;
        this.listCounters.set(level, counter);
        for (const key of [...this.listCounters.keys()]) if (key > level) this.listCounters.delete(key);
        prefix = `${counter}. `;
      } else {
        prefix = '• ';
        this.listCounters.delete(level);
      }
    } else {
      this.listCounters.clear();
    }
    const baseSegments = (block.runs || []).map((run) => segmentFromRun(run, this.fonts, fallbackSize));
    if (prefix) {
      baseSegments.unshift({
        text: prefix,
        font: this.fonts.regular,
        size: fallbackSize,
        color: rgb(0, 0, 0),
        highlight: null,
        underline: false,
        strike: false,
      });
    }
    const indent = mmToPoints(Number(block.indent || 0))
      + (block.type === 'list-item' ? mmToPoints(Math.max(0, level) * 5) : 0);
    const left = this.margins.left + indent;
    const width = Math.max(24, this.pageWidth - left - this.margins.right);
    const lines = layoutSegments(baseSegments, width);
    const spacing = block.spacing || {};
    const before = Number(spacing.before || 0);
    const after = Number(spacing.after == null ? (isHeading ? 8 : 6) : spacing.after);
    const lineMultiplier = Number(spacing.line || 1.15);
    this.ensureSpace(before + Math.max(12, fallbackSize * lineMultiplier));
    this.cursorY -= before;
    lines.forEach((line) => {
      const lineHeight = Math.max(10, (line.maxSize || fallbackSize) * lineMultiplier);
      this.ensureSpace(lineHeight);
      this.drawLine(line, {
        left,
        width,
        align: overrides.align || block.align || 'left',
        lineHeight,
      });
    });
    this.cursorY -= after;
  }

  drawReference(block) {
    const text = sanitizePdfText(block.label || 'Référence documentaire');
    const fontSize = 10;
    const left = this.margins.left + 8;
    const width = this.pageWidth - this.margins.left - this.margins.right - 16;
    const lines = layoutSegments([{
      text: `§ ${text}`,
      font: this.fonts.regular,
      size: fontSize,
      color: rgb(0.12, 0.25, 0.4),
      highlight: null,
      underline: false,
      strike: false,
    }], width);
    const height = Math.max(24, lines.length * 12 + 8);
    this.ensureSpace(height + 6);
    const top = this.cursorY;
    this.page.drawRectangle({ x: this.margins.left, y: top - height, width: width + 16, height, color: rgb(0.93, 0.96, 0.99) });
    this.page.drawRectangle({ x: this.margins.left, y: top - height, width: 3, height, color: rgb(0.2, 0.42, 0.65) });
    this.cursorY -= 4;
    lines.forEach((line) => this.drawLine(line, { left, width, align: 'left', lineHeight: 12 }));
    this.cursorY = top - height - 6;
  }

  columnWidths(block, count, availableWidth) {
    const explicit = Array.isArray(block.widths) && block.widths.length === count
      ? block.widths.map(Number)
      : null;
    const total = explicit?.reduce((sum, value) => sum + (Number.isFinite(value) ? Math.max(1, value) : 0), 0);
    if (explicit && total > 0) return explicit.map((value) => availableWidth * Math.max(1, value) / total);
    return Array.from({ length: count }, () => availableWidth / count);
  }

  drawTable(block) {
    const rows = Array.isArray(block.rows) ? block.rows : [];
    const count = Math.max(1, ...rows.map((row) => row.cells?.length || 0));
    const left = this.margins.left;
    const availableWidth = this.pageWidth - this.margins.left - this.margins.right;
    const widths = this.columnWidths(block, count, availableWidth);
    const padding = 4;
    const fontSize = 8.5;
    const lineHeight = 10.5;
    this.cursorY -= 4;

    for (const row of rows) {
      const cellLines = Array.from({ length: count }, (_, index) => {
        const text = plainTextFromBlocks(row.cells?.[index]?.blocks);
        return layoutSegments([{
          text,
          font: this.fonts.regular,
          size: fontSize,
          color: rgb(0, 0, 0),
          highlight: null,
          underline: false,
          strike: false,
        }], Math.max(8, widths[index] - (padding * 2)));
      });
      let offset = 0;
      const totalLines = Math.max(1, ...cellLines.map((lines) => lines.length));
      while (offset < totalLines) {
        const availableHeight = this.cursorY - this.margins.bottom;
        let lineCapacity = Math.floor((availableHeight - (padding * 2)) / lineHeight);
        if (lineCapacity < 1) {
          this.createPage();
          lineCapacity = Math.max(1, Math.floor((this.cursorY - this.margins.bottom - (padding * 2)) / lineHeight));
        }
        const take = Math.min(lineCapacity, totalLines - offset);
        const rowHeight = Math.max(20, (take * lineHeight) + (padding * 2));
        const top = this.cursorY;
        let x = left;
        widths.forEach((columnWidth, index) => {
          this.page.drawRectangle({
            x,
            y: top - rowHeight,
            width: columnWidth,
            height: rowHeight,
            borderColor: rgb(0.52, 0.56, 0.62),
            borderWidth: 0.6,
          });
          const lines = cellLines[index].slice(offset, offset + take);
          let lineTop = top - padding;
          lines.forEach((line) => {
            const cell = row.cells?.[index] || {};
            let lineX = x + padding;
            if (cell.align === 'center') lineX += Math.max(0, (columnWidth - (padding * 2) - line.width) / 2);
            if (cell.align === 'right') lineX += Math.max(0, columnWidth - (padding * 2) - line.width);
            line.segments.forEach((segment) => {
              this.page.drawText(segment.text, {
                x: lineX,
                y: lineTop - fontSize,
                size: fontSize,
                font: this.fonts.regular,
                color: rgb(0, 0, 0),
              });
              lineX += segment.width;
            });
            lineTop -= lineHeight;
          });
          x += columnWidth;
        });
        this.cursorY -= rowHeight;
        offset += take;
        if (offset < totalLines) this.createPage();
      }
    }
    this.cursorY -= 8;
  }

  async embedImage(source) {
    const parsed = dataImage(source);
    if (!parsed) return null;
    try {
      if (parsed.type === 'png') return await this.pdf.embedPng(parsed.buffer);
      return await this.pdf.embedJpg(parsed.buffer);
    } catch (_error) {
      return null;
    }
  }

  async drawImageBlock(block) {
    const image = await this.embedImage(block.src);
    if (!image) {
      this.drawTextBlock({ type: 'paragraph', runs: [{ text: `[Image non rendue : ${block.alt || 'image'}]`, marks: { italic: true } }], align: block.align || 'center' });
      return;
    }
    const maxWidth = this.pageWidth - this.margins.left - this.margins.right;
    const requestedWidth = Math.min(maxWidth, Number(block.width || 320) * 0.75);
    const scale = requestedWidth / image.width;
    const height = image.height * scale;
    this.ensureSpace(height + 10);
    let x = this.margins.left;
    if (block.align === 'center') x += (maxWidth - requestedWidth) / 2;
    if (block.align === 'right') x += maxWidth - requestedWidth;
    this.page.drawImage(image, { x, y: this.cursorY - height, width: requestedWidth, height });
    this.cursorY -= height + 10;
  }

  signatureHeight(signature, image) {
    const textLines = sanitizePdfText(signature?.text).split('\n').filter(Boolean).length;
    const imageHeight = image ? Math.min(58, image.height * Math.min(110 / image.width, 58 / image.height)) : 0;
    return Math.max(20, imageHeight + (textLines * 12) + 8);
  }

  async drawSignatureFlow(signature) {
    const image = await this.embedImage(signature.image);
    const height = this.signatureHeight(signature, image);
    this.ensureSpace(height + 14);
    const availableWidth = this.pageWidth - this.margins.left - this.margins.right;
    const align = signature.alignment || 'right';
    if (image) {
      const scale = Math.min(110 / image.width, 58 / image.height, 1);
      const width = image.width * scale;
      const imageHeight = image.height * scale;
      let x = this.margins.left;
      if (align === 'center') x += (availableWidth - width) / 2;
      if (align === 'right') x += availableWidth - width;
      this.page.drawImage(image, { x, y: this.cursorY - imageHeight, width, height: imageHeight });
      this.cursorY -= imageHeight + 4;
    }
    for (const line of sanitizePdfText(signature.text).split('\n')) {
      this.drawTextBlock({
        type: 'paragraph',
        runs: [{ text: line, marks: {} }],
        align,
        spacing: { line: 1, before: 0, after: 2 },
      }, { size: 10, align });
    }
  }

  async drawSignatureFixed(signature, page, yBottom) {
    const image = await this.embedImage(signature.image);
    const availableWidth = this.pageWidth - this.margins.left - this.margins.right;
    const align = signature.alignment || 'right';
    let y = yBottom;
    for (const line of sanitizePdfText(signature.text).split('\n').reverse()) {
      if (!line) continue;
      const width = this.fonts.regular.widthOfTextAtSize(line, 9);
      let x = this.margins.left;
      if (align === 'center') x += (availableWidth - width) / 2;
      if (align === 'right') x += availableWidth - width;
      page.drawText(line, { x, y, size: 9, font: this.fonts.regular, color: rgb(0, 0, 0) });
      y += 11;
    }
    if (image) {
      const scale = Math.min(100 / image.width, 48 / image.height, 1);
      const width = image.width * scale;
      const height = image.height * scale;
      let x = this.margins.left;
      if (align === 'center') x += (availableWidth - width) / 2;
      if (align === 'right') x += availableWidth - width;
      page.drawImage(image, { x, y: y + 2, width, height });
    }
  }

  simpleHeaderFooter(page, blocks, y, size = 8) {
    const availableWidth = this.pageWidth - this.margins.left - this.margins.right;
    const source = (blocks || []).filter((block) => plainTextFromBlocks([block]).trim()).slice(0, 4);
    let currentY = y;
    source.forEach((block) => {
      const text = plainTextFromBlocks([block]);
      const lines = layoutSegments([{
        text,
        font: this.fonts.regular,
        size,
        color: rgb(0.25, 0.28, 0.32),
        highlight: null,
        underline: false,
        strike: false,
      }], availableWidth).slice(0, 2);
      lines.forEach((line) => {
        let x = this.margins.left;
        if (block.align === 'center') x += Math.max(0, (availableWidth - line.width) / 2);
        if (block.align === 'right') x += Math.max(0, availableWidth - line.width);
        line.segments.forEach((segment) => {
          page.drawText(segment.text, { x, y: currentY, size, font: segment.font, color: segment.color });
          x += segment.width;
        });
        currentY -= size + 2;
      });
    });
  }

  async finalizeDecorations(signature) {
    const pages = this.pdf.getPages();
    const config = this.document.page;
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      const number = index + 1;
      const useFirst = index === 0 && config.firstPageDifferent;
      const useEven = number % 2 === 0 && config.oddEvenDifferent;
      const header = useFirst && config.firstPageHeader
        ? config.firstPageHeader
        : (useEven && config.evenPageHeader ? config.evenPageHeader : config.header);
      const footer = useFirst && config.firstPageFooter
        ? config.firstPageFooter
        : (useEven && config.evenPageFooter ? config.evenPageFooter : config.footer);
      this.simpleHeaderFooter(page, header?.blocks, this.pageHeight - mmToPoints(config.headerDistance) - 8);
      this.simpleHeaderFooter(page, footer?.blocks, mmToPoints(config.footerDistance) + 8);
      if (config.showPageNumbers) {
        const text = String(number);
        const width = this.fonts.regular.widthOfTextAtSize(text, 8);
        page.drawText(text, {
          x: this.pageWidth - this.margins.right - width,
          y: mmToPoints(config.footerDistance),
          size: 8,
          font: this.fonts.regular,
          color: rgb(0.3, 0.33, 0.38),
        });
      }
      if (signature?.placement === 'all_pages_footer') {
        await this.drawSignatureFixed(signature, page, mmToPoints(config.footerDistance) + 16);
      }
    }
  }

  async render() {
    for (const block of this.document.blocks) {
      if (block.type === 'page-break') {
        this.createPage();
      } else if (block.type === 'section-break') {
        if (block.breakType !== 'continuous') this.createPage();
      } else if (block.type === 'table') {
        this.drawTable(block);
      } else if (block.type === 'reference') {
        this.drawReference(block);
      } else if (block.type === 'image') {
        await this.drawImageBlock(block);
      } else {
        this.drawTextBlock(block);
      }
    }

    const signature = this.document.signature && this.document.signature.source !== 'none'
      ? this.document.signature
      : null;
    if (signature?.placement === 'document_end') await this.drawSignatureFlow(signature);
    if (signature?.placement === 'last_page_bottom') {
      const image = await this.embedImage(signature.image);
      const height = this.signatureHeight(signature, image);
      if (this.cursorY < this.margins.bottom + height + 12) this.createPage();
      await this.drawSignatureFixed(signature, this.page, this.margins.bottom + 10);
    }
    await this.finalizeDecorations(signature);
  }
}

async function renderStructuredDocumentPdf(input) {
  const document = normalizeStructuredDocument(input);
  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.setTitle(sanitizePdfText(document.title));
  pdf.setAuthor('Kheops 2');
  pdf.setCreator('Kheops 2 deterministic renderer');
  pdf.setProducer('Kheops 2 / pdf-lib');
  pdf.setCreationDate(FIXED_METADATA_DATE);
  pdf.setModificationDate(FIXED_METADATA_DATE);
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const painter = new PdfPainter(pdf, document, fonts);
  await painter.render();
  return Buffer.from(await pdf.save({ useObjectStreams: false, addDefaultPage: false }));
}

module.exports = {
  A4,
  PDF_MIME,
  FIXED_METADATA_DATE,
  mmToPoints,
  sanitizePdfText,
  renderStructuredDocumentPdf,
};
