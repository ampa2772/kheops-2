const crypto = require('crypto');
const { PDFDocument } = require('pdf-lib');
const pdfParse = require('pdf-parse');

const { createDefaultDocument } = require('../documentEditorFormat');
const {
  A4,
  renderStructuredDocumentPdf,
  sanitizePdfText,
} = require('../pdf/documentPdfRenderer');

function richDocument() {
  const document = createDefaultDocument('Convention déterministe');
  document.page.orientation = 'landscape';
  document.page.margins = { top: 25, right: 18, bottom: 22, left: 24 };
  document.page.watermark = 'CONFIDENTIEL';
  document.page.header.blocks = [{ type: 'paragraph', runs: [{ text: 'Cabinet Kheops', marks: { bold: true } }], align: 'left' }];
  document.page.footer.blocks = [{ type: 'paragraph', runs: [{ text: 'Document de travail', marks: {} }], align: 'center' }];
  document.signature = {
    source: 'explicit',
    text: 'Me Jeanne Dupont\nAvocate',
    alignment: 'right',
    placement: 'document_end',
  };
  document.blocks = [
    {
      type: 'heading', level: 1, align: 'center',
      runs: [{ text: 'Convention d’honoraires', marks: { bold: true, color: '#17365d' } }],
      spacing: { line: 1.2, before: 0, after: 12 },
    },
    {
      type: 'paragraph', align: 'justify',
      runs: [
        { text: 'Entre les parties, il est convenu ce qui suit. ', marks: {} },
        { text: 'Texte important', marks: { bold: true, underline: true } },
      ],
      spacing: { line: 1.3, before: 0, after: 8 },
    },
    { type: 'list-item', ordered: true, level: 0, runs: [{ text: 'Première obligation', marks: {} }] },
    { type: 'list-item', ordered: true, level: 0, runs: [{ text: 'Deuxième obligation', marks: {} }] },
    {
      type: 'table',
      widths: [35, 65],
      rows: [
        { cells: [
          { blocks: [{ runs: [{ text: 'Prestation', marks: {} }] }], align: 'left' },
          { blocks: [{ runs: [{ text: 'Montant', marks: {} }] }], align: 'right' },
        ] },
        { cells: [
          { blocks: [{ runs: [{ text: 'Consultation et rédaction', marks: {} }] }] },
          { blocks: [{ runs: [{ text: '1 200 EUR', marks: {} }] }], align: 'right' },
        ] },
      ],
    },
    { type: 'page-break' },
    { type: 'heading', level: 2, runs: [{ text: 'Deuxième page', marks: { bold: true } }] },
    { type: 'paragraph', runs: [{ text: 'Fin du document.', marks: {} }] },
  ];
  return document;
}

describe('documentPdfRenderer', () => {
  test('remplace les glyphes incompatibles sans laisser planter pdf-lib', () => {
    expect(sanitizePdfText('A\u2011B 🧪')).toBe('A-B ?');
  });

  test('rend un PDF A4 paysage déterministe avec contenu, table, décorations et signature', async () => {
    const source = richDocument();
    const first = await renderStructuredDocumentPdf(source);
    const second = await renderStructuredDocumentPdf(source);

    expect(Buffer.compare(first, second)).toBe(0);
    expect(crypto.createHash('sha256').update(first).digest('hex')).toHaveLength(64);
    expect(first.subarray(0, 5).toString('ascii')).toBe('%PDF-');

    const parsedDocument = await PDFDocument.load(first);
    expect(parsedDocument.getPageCount()).toBe(2);
    const firstPage = parsedDocument.getPage(0).getSize();
    expect(firstPage.width).toBeCloseTo(A4.height, 1);
    expect(firstPage.height).toBeCloseTo(A4.width, 1);

    const text = (await pdfParse(first)).text;
    expect(text).toContain('Convention');
    expect(text).toContain('Cabinet Kheops');
    expect(text).toContain('Consultation et rédaction');
    expect(text).toContain('Deuxième page');
    expect(text).toContain('Me Jeanne Dupont');
    expect(text).toContain('CONFIDENTIEL');
  });

  test('pagine un texte long sans dépasser une seule feuille', async () => {
    const document = createDefaultDocument('Texte long');
    document.blocks = [{
      type: 'paragraph',
      runs: [{ text: Array.from({ length: 280 }, (_, index) => `Ligne contractuelle ${index + 1}.`).join('\n'), marks: {} }],
      spacing: { line: 1.15, before: 0, after: 0 },
    }];
    const buffer = await renderStructuredDocumentPdf(document);
    expect((await PDFDocument.load(buffer)).getPageCount()).toBeGreaterThan(2);
  });

  test('incorpore une signature image PNG représentée dans le document', async () => {
    const document = createDefaultDocument('Signature image');
    document.signature = {
      source: 'explicit',
      image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZK0sAAAAASUVORK5CYII=',
      altText: 'Signature test',
      alignment: 'right',
      placement: 'last_page_bottom',
    };
    const buffer = await renderStructuredDocumentPdf(document);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect((await PDFDocument.load(buffer)).getPageCount()).toBe(1);
  });
});
