const PizZip = require('pizzip');
const {
  analyzeDocx,
  applyDocxPageMargins,
  applyDocxPresentation,
  createDefaultDocument,
  createDocxBuffer,
  documentCounts,
  documentToHtml,
  mammothHtmlToStructured,
  normalizeStoredDocumentForClient,
  normalizeStructuredDocument,
} = require('../documentEditorFormat');

describe('documentEditorFormat', () => {
  const fiveCssPixelsInMillimeters = (5 * 25.4) / 96;

  test('crée les nouveaux documents avec 5 px de marge horizontale et 20 mm verticalement', () => {
    const document = createDefaultDocument('Marges par défaut');

    expect(document.page.margins.top).toBe(20);
    expect(document.page.margins.bottom).toBe(20);
    expect(document.page.margins.left).toBeCloseTo(fiveCssPixelsInMillimeters, 12);
    expect(document.page.margins.right).toBeCloseTo(fiveCssPixelsInMillimeters, 12);
  });

  test('préserve le repli historique à 20 mm quand les marges horizontales sont absentes', () => {
    const normalized = normalizeStructuredDocument({
      title: 'Document historique',
      page: { margins: { top: 12, bottom: 14 } },
    });

    expect(normalized.page.margins).toMatchObject({ top: 12, right: 20, bottom: 14, left: 20 });
  });

  test('traite null et une chaîne vide comme des marges historiques absentes', () => {
    const normalized = normalizeStructuredDocument({
      page: { margins: { top: 20, right: null, bottom: 20, left: '' } },
      blocks: [],
    });

    expect(normalized.page.margins.right).toBe(20);
    expect(normalized.page.margins.left).toBe(20);
  });

  test('hydrate pour le client un ancien état sans marges horizontales avec le repli à 20 mm', () => {
    const legacyStateDocument = {
      title: 'Ancien état enregistré',
      page: { margins: { top: 12, bottom: 14 } },
      blocks: [],
    };

    const hydrated = normalizeStoredDocumentForClient(legacyStateDocument);

    expect(hydrated.page.margins).toEqual({ top: 12, right: 20, bottom: 14, left: 20 });
    expect(legacyStateDocument.page.margins).toEqual({ top: 12, bottom: 14 });
  });

  test('préserve les quatre marges w:pgMar lors de la conversion d’un DOCX importé', () => {
    const zip = new PizZip();
    zip.file('word/document.xml', [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '<w:body><w:p/><w:sectPr>',
      '<w:pgMar w:top="1440" w:right="720" w:bottom="1080" w:left="576"/>',
      '</w:sectPr></w:body></w:document>',
    ].join(''));
    const buffer = zip.generate({ type: 'nodebuffer' });
    const converted = mammothHtmlToStructured('<p>Contenu importé</p>', 'Import Word');

    const imported = normalizeStructuredDocument(applyDocxPageMargins(buffer, converted));

    expect(imported.page.margins.top).toBeCloseTo(25.4, 10);
    expect(imported.page.margins.right).toBeCloseTo(12.7, 10);
    expect(imported.page.margins.bottom).toBeCloseTo(19.05, 10);
    expect(imported.page.margins.left).toBeCloseTo(10.16, 10);
  });

  test('réapplique alignements, retraits, espacements et géométrie OOXML jusque dans les cellules', () => {
    const zip = new PizZip();
    zip.file('word/document.xml', [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      '<w:p><w:pPr><w:jc w:val="center"/><w:ind w:left="720"/>',
      '<w:spacing w:before="120" w:after="240" w:line="360" w:lineRule="auto"/></w:pPr>',
      '<w:r><w:t>Paragraphe centré</w:t></w:r></w:p>',
      '<w:tbl><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="6000"/></w:tblGrid>',
      '<w:tr>',
      '<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>',
      '<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>Cellule A1</w:t></w:r></w:p>',
      '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Cellule A2</w:t></w:r></w:p></w:tc>',
      '<w:tc><w:tcPr><w:tcW w:w="3333" w:type="pct"/><w:vAlign w:val="bottom"/></w:tcPr>',
      '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Cellule B</w:t></w:r></w:p></w:tc>',
      '</w:tr></w:tbl>',
      '<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>Après le tableau</w:t></w:r></w:p>',
      '<w:sectPr/></w:body></w:document>',
    ].join(''));
    const buffer = zip.generate({ type: 'nodebuffer' });
    const converted = mammothHtmlToStructured([
      '<p>Paragraphe centré</p>',
      '<table><tr><td><p>Cellule A1</p><p>Cellule A2</p></td><td><p>Cellule B</p></td></tr></table>',
      '<p>Après le tableau</p>',
    ].join(''), 'Import fidèle');

    const imported = applyDocxPresentation(buffer, converted);
    const firstParagraph = imported.blocks[0];
    const table = imported.blocks[1];
    const lastParagraph = imported.blocks[2];

    expect(firstParagraph.align).toBe('center');
    expect(firstParagraph.indent).toBeCloseTo(12.7, 10);
    expect(firstParagraph.spacing).toMatchObject({ before: 6, after: 12, line: 1.5 });
    expect(table.widths[0]).toBeCloseTo(33.333333, 5);
    expect(table.widths[1]).toBeCloseTo(66.666667, 5);
    expect(table.rows[0].cells[0]).toMatchObject({ align: 'right', verticalAlign: 'middle' });
    expect(table.rows[0].cells[0].width).toBeCloseTo(33.333333, 5);
    expect(table.rows[0].cells[0].blocks.map((block) => block.align)).toEqual(['right', 'center']);
    expect(table.rows[0].cells[1]).toMatchObject({ align: 'center', verticalAlign: 'bottom' });
    expect(table.rows[0].cells[1].width).toBeCloseTo(66.66, 2);
    expect(lastParagraph.align).toBe('right');
  });

  test('résout docDefaults, basedOn et pStyle avant les propriétés directes du paragraphe', () => {
    const zip = new PizZip();
    zip.file('word/styles.xml', [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '<w:docDefaults><w:pPrDefault><w:pPr>',
      '<w:spacing w:before="40" w:after="80" w:line="240" w:lineRule="auto"/>',
      '</w:pPr></w:pPrDefault></w:docDefaults>',
      '<w:style w:type="paragraph" w:styleId="CentreBase"><w:pPr>',
      '<w:jc w:val="center"/><w:ind w:left="360"/><w:spacing w:before="100"/>',
      '</w:pPr></w:style>',
      '<w:style w:type="paragraph" w:styleId="DroiteEnfant">',
      '<w:basedOn w:val="CentreBase"/><w:pPr><w:jc w:val="right"/><w:spacing w:after="200"/></w:pPr>',
      '</w:style>',
      '<w:style w:type="paragraph" w:styleId="JustifiePetitEnfant">',
      '<w:basedOn w:val="DroiteEnfant"/><w:pPr><w:jc w:val="both"/></w:pPr>',
      '</w:style>',
      '</w:styles>',
    ].join(''));
    zip.file('word/document.xml', [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      '<w:p><w:pPr><w:pStyle w:val="CentreBase"/></w:pPr><w:r><w:t>Centre hérité</w:t></w:r></w:p>',
      '<w:p><w:pPr><w:pStyle w:val="DroiteEnfant"/></w:pPr><w:r><w:t>Droite héritée</w:t></w:r></w:p>',
      '<w:p><w:pPr><w:pStyle w:val="JustifiePetitEnfant"/></w:pPr><w:r><w:t>Justifié hérité</w:t></w:r></w:p>',
      '<w:p><w:pPr><w:pStyle w:val="JustifiePetitEnfant"/><w:jc w:val="left"/>',
      '<w:ind w:left="720"/><w:spacing w:before="20"/></w:pPr><w:r><w:t>Direct prioritaire</w:t></w:r></w:p>',
      '<w:sectPr/></w:body></w:document>',
    ].join(''));
    const buffer = zip.generate({ type: 'nodebuffer' });
    const converted = mammothHtmlToStructured([
      '<p>Centre hérité</p><p>Droite héritée</p><p>Justifié hérité</p><p>Direct prioritaire</p>',
    ].join(''), 'Styles Word');

    const imported = applyDocxPresentation(buffer, converted);
    const [center, right, justify, direct] = imported.blocks;

    expect(center.align).toBe('center');
    expect(right.align).toBe('right');
    expect(justify.align).toBe('justify');
    expect(center.indent).toBeCloseTo(6.35, 10);
    expect(right.indent).toBeCloseTo(6.35, 10);
    expect(justify.indent).toBeCloseTo(6.35, 10);
    expect(center.spacing).toMatchObject({ before: 5, after: 4, line: 1 });
    expect(right.spacing).toMatchObject({ before: 5, after: 10, line: 1 });
    expect(justify.spacing).toMatchObject({ before: 5, after: 10, line: 1 });
    expect(direct.align).toBe('left');
    expect(direct.indent).toBeCloseTo(12.7, 10);
    expect(direct.spacing).toMatchObject({ before: 1, after: 10, line: 1 });
  });

  test('coupe sans boucle une chaîne basedOn cyclique', () => {
    const zip = new PizZip();
    zip.file('word/styles.xml', [
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '<w:style w:type="paragraph" w:styleId="CycleA"><w:basedOn w:val="CycleB"/>',
      '<w:pPr><w:jc w:val="center"/></w:pPr></w:style>',
      '<w:style w:type="paragraph" w:styleId="CycleB"><w:basedOn w:val="CycleA"/>',
      '<w:pPr><w:ind w:left="720"/></w:pPr></w:style>',
      '</w:styles>',
    ].join(''));
    zip.file('word/document.xml', [
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      '<w:p><w:pPr><w:pStyle w:val="CycleA"/></w:pPr><w:r><w:t>Cycle borné</w:t></w:r></w:p>',
      '<w:sectPr/></w:body></w:document>',
    ].join(''));
    const buffer = zip.generate({ type: 'nodebuffer' });

    const imported = applyDocxPresentation(buffer, mammothHtmlToStructured('<p>Cycle borné</p>', 'Cycle'));

    expect(imported.blocks[0].align).toBe('center');
    expect(imported.blocks[0].indent).toBeCloseTo(12.7, 10);
  });

  test('réapplique les styles de runs OOXML hérités et directs uniquement sur une correspondance exacte', () => {
    const zip = new PizZip();
    zip.file('word/styles.xml', [
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia"/>',
      '<w:sz w:val="20"/><w:color w:val="112233"/></w:rPr></w:rPrDefault></w:docDefaults>',
      '<w:style w:type="paragraph" w:styleId="Base"><w:rPr><w:b/><w:highlight w:val="yellow"/></w:rPr></w:style>',
      '<w:style w:type="paragraph" w:styleId="Enfant"><w:basedOn w:val="Base"/><w:rPr><w:i/></w:rPr></w:style>',
      '<w:style w:type="character" w:styleId="Accent"><w:rPr><w:strike/><w:color w:val="445566"/></w:rPr></w:style>',
      '</w:styles>',
    ].join(''));
    zip.file('word/document.xml', [
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      '<w:p><w:pPr><w:pStyle w:val="Enfant"/><w:rPr><w:u/></w:rPr></w:pPr>',
      '<w:r><w:t>Hérité</w:t></w:r>',
      '<w:r><w:rPr><w:rStyle w:val="Accent"/></w:rPr><w:t> accent</w:t></w:r>',
      '<w:r><w:rPr><w:b w:val="0"/><w:vertAlign w:val="superscript"/>',
      '<w:rFonts w:ascii="Arial"/><w:sz w:val="28"/><w:shd w:fill="ABCDEF"/></w:rPr><w:t> direct</w:t></w:r>',
      '</w:p>',
      '<w:p><w:pPr><w:pStyle w:val="Base"/><w:jc w:val="center"/></w:pPr>',
      '<w:r><w:rPr><w:b/></w:rPr><w:t>A  B</w:t></w:r></w:p>',
      '<w:sectPr/></w:body></w:document>',
    ].join(''));
    const converted = mammothHtmlToStructured(
      '<p>Hérité accent direct</p><p><em>A B</em></p>',
      'Runs Word',
    );

    const imported = applyDocxPresentation(zip.generate({ type: 'nodebuffer' }), converted);
    const [exact, normalizedOnly] = imported.blocks;

    expect(exact.runs).toHaveLength(3);
    expect(exact.runs[0]).toMatchObject({
      text: 'Hérité',
      marks: {
        bold: true, italic: true, underline: true, font: 'Georgia', size: 10,
        color: '#112233', highlight: '#FFFF00',
      },
    });
    expect(exact.runs[1]).toMatchObject({
      text: ' accent',
      marks: expect.objectContaining({ strike: true, color: '#445566' }),
    });
    expect(exact.runs[2]).toMatchObject({
      text: ' direct',
      marks: expect.objectContaining({
        italic: true, underline: true, superscript: true, font: 'Arial', size: 14,
        highlight: '#ABCDEF',
      }),
    });
    expect(exact.runs[2].marks.bold).toBeUndefined();
    // « A B » correspond après normalisation, donc l'alignement reste sûr,
    // mais le gras OOXML de « A  B » ne doit pas être attribué au mauvais texte.
    expect(normalizedOnly.align).toBe('center');
    expect(normalizedOnly.runs).toEqual([{ text: 'A B', marks: { italic: true } }]);
  });

  test('conserve les liens Mammoth tout en remplaçant leurs marques par les marques OOXML exactes', () => {
    const zip = new PizZip();
    zip.file('word/document.xml', [
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Lien</w:t></w:r>',
      '<w:r><w:rPr><w:i/></w:rPr><w:t> externe</w:t></w:r></w:p><w:sectPr/>',
      '</w:body></w:document>',
    ].join(''));
    const converted = mammothHtmlToStructured(
      '<p><a href="https://example.test"><u>Lien externe</u></a></p>',
      'Lien',
    );

    const imported = applyDocxPresentation(zip.generate({ type: 'nodebuffer' }), converted);

    expect(imported.blocks[0].runs).toEqual([
      { text: 'Lien', marks: { bold: true }, link: 'https://example.test' },
      { text: ' externe', marks: { italic: true }, link: 'https://example.test' },
    ]);
  });

  test('n’utilise jamais une police cs/eastAsia comme repli pour un texte latin', () => {
    const zip = new PizZip();
    zip.file('word/styles.xml', [
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>',
      '</w:rPr></w:rPrDefault></w:docDefaults>',
      '<w:style w:type="paragraph" w:styleId="ComplexeSeul"><w:rPr>',
      '<w:rFonts w:cs="font1343" w:eastAsia="font1343"/></w:rPr></w:style>',
      '<w:style w:type="paragraph" w:styleId="LatinExplicite"><w:rPr>',
      '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="font1343"/></w:rPr></w:style>',
      '</w:styles>',
    ].join(''));
    zip.file('word/document.xml', [
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      '<w:p><w:pPr><w:pStyle w:val="ComplexeSeul"/></w:pPr><w:r><w:t>Police héritée</w:t></w:r></w:p>',
      '<w:p><w:pPr><w:pStyle w:val="LatinExplicite"/></w:pPr><w:r><w:t>Police latine</w:t></w:r></w:p>',
      '<w:sectPr/></w:body></w:document>',
    ].join(''));

    const imported = applyDocxPresentation(
      zip.generate({ type: 'nodebuffer' }),
      mammothHtmlToStructured('<p>Police héritée</p><p>Police latine</p>', 'Polices'),
    );

    expect(imported.blocks[0].runs[0].marks.font).toBe('Times New Roman');
    expect(imported.blocks[1].runs[0].marks.font).toBe('Calibri');
    expect(JSON.stringify(imported.blocks)).not.toContain('font1343');
  });

  test('applique le style de paragraphe Word par défaut en l’absence de pStyle', () => {
    const zip = new PizZip();
    zip.file('word/styles.xml', [
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
      '<w:docDefaults><w:pPrDefault><w:pPr><w:spacing w:after="80"/></w:pPr></w:pPrDefault></w:docDefaults>',
      '<w:style w:type="paragraph" w:styleId="Base"><w:pPr><w:jc w:val="right"/><w:ind w:left="360"/></w:pPr></w:style>',
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:basedOn w:val="Base"/>',
      '<w:pPr><w:jc w:val="center"/><w:spacing w:before="100"/></w:pPr></w:style>',
      '</w:styles>',
    ].join(''));
    zip.file('word/document.xml', [
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      '<w:p><w:r><w:t>Style implicite</w:t></w:r></w:p>',
      '<w:p><w:pPr><w:jc w:val="both"/><w:ind w:left="720"/></w:pPr><w:r><w:t>Direct dessus</w:t></w:r></w:p>',
      '<w:sectPr/></w:body></w:document>',
    ].join(''));
    const imported = applyDocxPresentation(
      zip.generate({ type: 'nodebuffer' }),
      mammothHtmlToStructured('<p>Style implicite</p><p>Direct dessus</p>', 'Style par défaut'),
    );

    expect(imported.blocks[0]).toMatchObject({ align: 'center', spacing: { before: 5, after: 4 } });
    expect(imported.blocks[0].indent).toBeCloseTo(6.35, 10);
    expect(imported.blocks[1].align).toBe('justify');
    expect(imported.blocks[1].indent).toBeCloseTo(12.7, 10);
    expect(imported.blocks[1].spacing).toMatchObject({ before: 5, after: 4 });
  });

  test('importe gridSpan et vMerge, les borne, puis les régénère en OOXML', () => {
    const zip = new PizZip();
    zip.file('word/document.xml', [
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      '<w:tbl><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>',
      '<w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>A fusionnée</w:t></w:r></w:p></w:tc>',
      '<w:tc><w:tcPr/><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr>',
      '<w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vMerge/></w:tcPr><w:p/></w:tc>',
      '<w:tc><w:tcPr/><w:p><w:r><w:t>C</w:t></w:r></w:p></w:tc></w:tr>',
      '</w:tbl><w:sectPr/></w:body></w:document>',
    ].join(''));
    const converted = mammothHtmlToStructured([
      '<table><tr><td colspan="2" rowspan="2"><p>A fusionnée</p></td><td><p>B</p></td></tr>',
      '<tr><td><p>C</p></td></tr></table>',
    ].join(''), 'Cellules fusionnées');
    const imported = applyDocxPresentation(zip.generate({ type: 'nodebuffer' }), converted);
    const table = imported.blocks[0];

    expect(table.rows[0].cells[0]).toMatchObject({ colSpan: 2, rowSpan: 2 });
    expect(table.rows[1].cells).toHaveLength(1);
    expect(table.rows[1].cells[0].blocks[0].runs[0].text).toBe('C');

    const bounded = normalizeStructuredDocument({
      blocks: [{
        type: 'table',
        rows: [{ cells: [{ colSpan: 999, rowSpan: 999, blocks: [{ runs: [{ text: 'Bornée', marks: {} }] }] }] }],
      }],
    });
    expect(bounded.blocks[0].rows[0].cells[0]).toMatchObject({ colSpan: 20, rowSpan: 100 });

    const regeneratedXml = new PizZip(createDocxBuffer(imported)).file('word/document.xml').asText();
    expect(regeneratedXml).toContain('<w:gridSpan w:val="2"/>');
    expect(regeneratedXml).toContain('<w:vMerge w:val="restart"/>');
    expect(regeneratedXml).toContain('<w:vMerge/>');
  });

  test('convertit les sauts de section nextPage, oddPage et evenPage en sauts de page explicites', () => {
    const zip = new PizZip();
    zip.file('word/document.xml', [
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      '<w:p><w:pPr><w:sectPr><w:type w:val="nextPage"/></w:sectPr></w:pPr><w:r><w:t>A</w:t></w:r></w:p>',
      '<w:p><w:pPr><w:sectPr><w:type w:val="oddPage"/></w:sectPr></w:pPr><w:r><w:t>B</w:t></w:r></w:p>',
      '<w:p><w:pPr><w:sectPr><w:type w:val="evenPage"/></w:sectPr></w:pPr><w:r><w:t>C</w:t></w:r></w:p>',
      '<w:p><w:pPr><w:sectPr><w:type w:val="continuous"/></w:sectPr></w:pPr><w:r><w:t>D</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>E</w:t></w:r></w:p><w:sectPr/>',
      '</w:body></w:document>',
    ].join(''));
    const imported = applyDocxPresentation(
      zip.generate({ type: 'nodebuffer' }),
      mammothHtmlToStructured('<p>A</p><p>B</p><p>C</p><p>D</p><p>E</p>', 'Sections'),
    );

    expect(imported.blocks.map((block) => block.type)).toEqual([
      'paragraph', 'page-break', 'paragraph', 'page-break', 'paragraph', 'page-break', 'paragraph', 'paragraph',
    ]);
  });

  test('importe séparément en-têtes et pieds default, first et even sans dupliquer le premier', () => {
    const zip = new PizZip();
    zip.file('word/document.xml', [
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ',
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>',
      '<w:p><w:r><w:t>Corps</w:t></w:r></w:p><w:sectPr>',
      '<w:headerReference w:type="default" r:id="rIdH1"/><w:headerReference w:type="first" r:id="rIdH2"/>',
      '<w:headerReference w:type="even" r:id="rIdH3"/><w:footerReference w:type="default" r:id="rIdF1"/>',
      '<w:footerReference w:type="first" r:id="rIdF2"/><w:footerReference w:type="even" r:id="rIdF3"/>',
      '<w:titlePg/></w:sectPr></w:body></w:document>',
    ].join(''));
    zip.file('word/_rels/document.xml.rels', [
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '<Relationship Id="rIdH1" Type="header" Target="header1.xml"/><Relationship Id="rIdH2" Type="header" Target="header2.xml"/>',
      '<Relationship Id="rIdH3" Type="header" Target="header3.xml"/><Relationship Id="rIdF1" Type="footer" Target="footer1.xml"/>',
      '<Relationship Id="rIdF2" Type="footer" Target="footer2.xml"/><Relationship Id="rIdF3" Type="footer" Target="footer3.xml"/>',
      '</Relationships>',
    ].join(''));
    zip.file('word/header1.xml', '<w:hdr xmlns:w="x"><w:p><w:r><w:t>Défaut </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>gras</w:t></w:r></w:p></w:hdr>');
    zip.file('word/header2.xml', '<w:hdr xmlns:w="x"><w:p><w:r><w:t>Première page</w:t></w:r></w:p></w:hdr>');
    zip.file('word/header3.xml', '<w:hdr xmlns:w="x"><w:p><w:r><w:t>Page paire</w:t></w:r></w:p></w:hdr>');
    zip.file('word/footer1.xml', '<w:ftr xmlns:w="x"><w:p><w:r><w:t>Pied défaut</w:t></w:r></w:p></w:ftr>');
    zip.file('word/footer2.xml', '<w:ftr xmlns:w="x"><w:p><w:r><w:t>Pied première</w:t></w:r></w:p></w:ftr>');
    zip.file('word/footer3.xml', '<w:ftr xmlns:w="x"><w:p><w:r><w:t>Pied pair</w:t></w:r></w:p></w:ftr>');
    zip.file('word/settings.xml', '<w:settings xmlns:w="x"><w:evenAndOddHeaders/></w:settings>');
    const imported = applyDocxPresentation(
      zip.generate({ type: 'nodebuffer' }),
      mammothHtmlToStructured('<p>Corps</p>', 'En-têtes'),
    );
    const plain = (container) => container.blocks.flatMap((block) => block.runs.map((run) => run.text)).join('');

    expect(imported.page.firstPageDifferent).toBe(true);
    expect(imported.page.oddEvenDifferent).toBe(true);
    expect(plain(imported.page.header)).toBe('Défaut gras');
    expect(plain(imported.page.firstPageHeader)).toBe('Première page');
    expect(plain(imported.page.evenPageHeader)).toBe('Page paire');
    expect(plain(imported.page.footer)).toBe('Pied défaut');
    expect(plain(imported.page.firstPageFooter)).toBe('Pied première');
    expect(plain(imported.page.evenPageFooter)).toBe('Pied pair');
    expect(imported.page.header.blocks[0].runs).toHaveLength(2);
    expect(imported.page.header.blocks[0].runs[1].marks.bold).toBe(true);
  });

  test('restaure les paragraphes vides significatifs et les deux formes de saut de page Word', () => {
    const zip = new PizZip();
    zip.file('word/document.xml', [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      '<w:p><w:r><w:t>A</w:t></w:r></w:p>',
      '<w:p><w:pPr><w:spacing w:after="160"/></w:pPr></w:p>',
      '<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:t>B</w:t></w:r></w:p>',
      '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
      '<w:p><w:r><w:t>C</w:t></w:r></w:p>',
      '<w:sectPr/></w:body></w:document>',
    ].join(''));
    const buffer = zip.generate({ type: 'nodebuffer' });
    const converted = mammothHtmlToStructured('<p>A</p><p>B</p><p>C</p>', 'Sauts Word');

    const imported = applyDocxPresentation(buffer, converted);

    expect(imported.blocks.map((block) => block.type)).toEqual([
      'paragraph', 'paragraph', 'page-break', 'paragraph', 'page-break', 'paragraph',
    ]);
    expect(imported.blocks[1].runs[0].text).toBe('');
    expect(imported.blocks[1].spacing.after).toBe(8);
    expect(imported.blocks[3].runs[0].text).toBe('B');
    expect(imported.blocks[5].runs[0].text).toBe('C');
  });

  test('découpe un saut de page au milieu du paragraphe sans transformer les sauts de ligne ordinaires', () => {
    const zip = new PizZip();
    zip.file('word/document.xml', [
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
      '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Avant</w:t><w:br w:type="page"/>',
      '<w:t>Après</w:t><w:br/><w:t>Ligne</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>Fin</w:t></w:r></w:p><w:sectPr/>',
      '</w:body></w:document>',
    ].join(''));
    const converted = mammothHtmlToStructured(
      '<p>Avant<br>Après<br>Ligne</p><p>Fin</p>',
      'Saut interne',
    );

    const imported = applyDocxPresentation(zip.generate({ type: 'nodebuffer' }), converted);

    expect(imported.blocks.map((block) => block.type)).toEqual([
      'paragraph', 'page-break', 'paragraph', 'paragraph',
    ]);
    expect(imported.blocks[0].runs).toEqual([{ text: 'Avant', marks: { bold: true } }]);
    expect(imported.blocks[2].runs.map((run) => run.text).join('')).toBe('Après\nLigne');
    expect(imported.blocks[2].runs.every((run) => run.marks.bold)).toBe(true);
    expect(imported.blocks[3].runs[0].text).toBe('Fin');
  });

  test('borne les marges horizontales entre 5 px et 60 mm', () => {
    const minimum = normalizeStructuredDocument({
      page: { margins: { left: 0, right: -10 } },
    });
    const maximum = normalizeStructuredDocument({
      page: { margins: { left: 61, right: 1000 } },
    });

    expect(minimum.page.margins.left).toBeCloseTo(fiveCssPixelsInMillimeters, 12);
    expect(minimum.page.margins.right).toBeCloseTo(fiveCssPixelsInMillimeters, 12);
    expect(maximum.page.margins.left).toBe(60);
    expect(maximum.page.margins.right).toBe(60);
  });

  test('normalise un modèle structuré et élimine les URL exécutables', () => {
    const normalized = normalizeStructuredDocument({
      title: 'Contrat',
      page: { orientation: 'diagonale', margins: { top: -50, left: 500 } },
      blocks: [
        { type: 'paragraph', runs: [{ text: 'Bonjour', link: 'javascript:alert(1)', marks: { bold: true, size: 500 } }] },
        { type: 'image', src: 'javascript:alert(2)' },
      ],
    });

    expect(normalized.page.orientation).toBe('portrait');
    expect(normalized.page.margins.top).toBe(5);
    expect(normalized.page.margins.left).toBe(60);
    expect(normalized.blocks).toHaveLength(1);
    expect(normalized.blocks[0].runs[0].link).toBeUndefined();
    expect(normalized.blocks[0].runs[0].marks.bold).toBe(true);
    expect(normalized.blocks[0].runs[0].marks.size).toBe(96);
  });

  test('compte mots, caractères et sauts de page', () => {
    const document = createDefaultDocument('Test');
    document.blocks = [
      { type: 'paragraph', runs: [{ text: 'Deux mots', marks: {} }] },
      { type: 'page-break' },
      { type: 'paragraph', runs: [{ text: 'encore', marks: {} }] },
    ];
    expect(documentCounts(document)).toMatchObject({ words: 3, pages: 2 });
  });

  test('génère du HTML autonome sans réintroduire de script', () => {
    const document = createDefaultDocument('<script>alert(1)</script>');
    document.blocks[0].runs = [{ text: '<img src=x onerror=alert(1)>', marks: { bold: true } }];
    const html = documentToHtml(document);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x onerror');
    expect(html).toContain('<strong>');
    expect(html).toContain(`padding:20mm ${fiveCssPixelsInMillimeters}mm 20mm ${fiveCssPixelsInMillimeters}mm`);
  });

  test('fabrique un DOCX OOXML lisible avec en-tête, pied et contenu', () => {
    const document = createDefaultDocument('Convention');
    document.page.header.blocks[0].runs = [{ text: 'Cabinet NovaForge', marks: { bold: true } }];
    document.blocks = [
      { type: 'heading', level: 1, runs: [{ text: 'Convention', marks: {} }], align: 'center' },
      { type: 'paragraph', runs: [{ text: 'Texte principal', marks: { italic: true } }] },
      {
        type: 'image',
        src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        alt: 'Logo du cabinet',
        width: 120,
        align: 'center',
      },
      { type: 'page-break' },
    ];
    const buffer = createDocxBuffer(document);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    const zip = new PizZip(buffer);
    expect(zip.file('word/document.xml')).toBeTruthy();
    expect(zip.file('word/header1.xml').asText()).toContain('Cabinet NovaForge');
    expect(zip.file('word/footer1.xml').asText()).toContain('PAGE');
    expect(zip.file('word/document.xml').asText()).toContain('Texte principal');
    expect(zip.file('word/document.xml').asText()).toContain('<w:drawing>');
    expect(zip.file('word/media/image1.png')).toBeTruthy();
    expect(zip.file('word/_rels/document.xml.rels').asText()).toContain('relationships/image');
    expect(zip.file('word/document.xml').asText()).toContain('<w:pgMar w:top="1134" w:right="75" w:bottom="1134" w:left="75"');
    expect(createDocxBuffer(document).equals(buffer)).toBe(true);
  });

  test('classe un DOCX avec macros et objets comme complexe', () => {
    const zip = new PizZip();
    zip.file('word/document.xml', '<w:document><w:body><w:txbxContent/></w:body></w:document>');
    zip.file('word/vbaProject.bin', Buffer.from([1, 2, 3]));
    zip.file('word/embeddings/object1.bin', Buffer.from([4]));
    const compatibility = analyzeDocx(zip.generate({ type: 'nodebuffer' }));
    expect(compatibility.level).toBe('complex');
    expect(compatibility.warnings.join(' ')).toMatch(/Macros VBA/);
    expect(compatibility.warnings.join(' ')).toMatch(/Objets incorporés/);
  });

  test('convertit le HTML Mammoth en blocs structurés', () => {
    const document = mammothHtmlToStructured(
      '<h1>Titre</h1><p>Texte <strong>important</strong></p><table><tr><td>Cellule</td></tr></table>',
      'Import',
    );
    expect(document.title).toBe('Import');
    expect(document.blocks.map((block) => block.type)).toEqual(['heading', 'paragraph', 'table']);
    expect(document.blocks[1].runs.some((run) => run.marks.bold && run.text === 'important')).toBe(true);
  });

  test('préserve largeur et alignements des cellules dans le DOCX', () => {
    const document = createDefaultDocument('Tableau');
    document.blocks = [{
      type: 'table',
      rows: [{ cells: [{
        width: 40,
        align: 'center',
        verticalAlign: 'middle',
        blocks: [{ type: 'paragraph', runs: [{ text: 'Centrée', marks: {} }] }],
      }] }],
    }];
    const normalized = normalizeStructuredDocument(document);
    expect(normalized.blocks[0].rows[0].cells[0]).toMatchObject({ width: 40, align: 'center', verticalAlign: 'middle' });
    const xml = new PizZip(createDocxBuffer(document)).file('word/document.xml').asText();
    expect(xml).toContain('<w:tcW w:w="4000" w:type="pct"/>');
    expect(xml).toContain('<w:vAlign w:val="center"/>');
    expect(xml).toContain('<w:jc w:val="center"/>');
  });

  test('préserve référence, section, signature et règles de page dans le DOCX', () => {
    const document = createDefaultDocument('Acte');
    document.page = {
      ...document.page,
      format: 'Legal', columns: 2, firstPageDifferent: true, oddEvenDifferent: true,
      pageColor: '#fff8e1', border: { style: 'double', color: '#315f91', width: 1.5 }, watermark: 'CONFIDENTIEL',
      firstPageHeader: { blocks: [{ type: 'paragraph', runs: [{ text: 'Première page', marks: {} }] }] },
      evenPageFooter: { blocks: [{ type: 'paragraph', runs: [{ text: 'Page paire', marks: {} }] }] },
    };
    document.signature = { source: 'explicit', text: 'Me Exemple', altText: 'Signature de Me Exemple', alignment: 'right' };
    document.blocks = [
      { type: 'reference', referenceId: 'ref-1', targetDossierId: 'd1', targetDocumentId: 'p1', targetVersionId: 'v1', label: 'Pièce n° 1', status: 'active' },
      { type: 'section-break', breakType: 'next-page' },
    ];
    const zip = new PizZip(createDocxBuffer(document));
    const xml = zip.file('word/document.xml').asText();
    expect(xml).toContain('Pièce n° 1');
    expect(xml).toContain('Me Exemple');
    expect(xml).toContain('<w:cols w:num="2"/>');
    expect(xml).toContain('<w:pgBorders');
    expect(zip.file('word/header2.xml').asText()).toContain('Première page');
    expect(zip.file('word/footer3.xml').asText()).toContain('Page paire');
  });
});
