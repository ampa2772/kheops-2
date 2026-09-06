import {
  DEFAULT_HORIZONTAL_MARGIN_PX,
  MAX_PAGE_MARGIN_MM,
  MIN_HORIZONTAL_MARGIN_PX,
  blocksToEditableHtml,
  clampHorizontalMarginMm,
  collectStructuredDocument,
  countDocument,
  createEmptyDocument,
  documentToPrintHtml,
  domToBlocks,
  mmToPx,
  pxToMm,
  replaceInDocument,
} from '../documentModel';

describe('modèle structuré de l’Éditeur Kheops', () => {
  test('conserve les tailles en points après plusieurs ouvertures et réenregistrements', () => {
    let blocks = [{ id: 'size-test', type: 'paragraph', runs: [{ text: 'Acte', marks: { size: 11, font: 'Georgia' } }] }];
    for (let round = 0; round < 5; round += 1) {
      const root = document.createElement('div');
      root.innerHTML = blocksToEditableHtml(blocks);
      blocks = domToBlocks(root);
      expect(blocks[0].runs[0].marks).toMatchObject({ size: 11, font: 'Georgia' });
    }
    const root = document.createElement('div');
    root.innerHTML = '<p><span style="font-size:16px">Pixels</span></p>';
    expect(domToBlocks(root)[0].runs[0].marks.size).toBe(12);
  });
  test('crée un document A4 éditable', () => {
    const document = createEmptyDocument('Conclusions');
    expect(document.title).toBe('Conclusions');
    expect(document.page.format).toBe('A4');
    expect(document.page.orientation).toBe('portrait');
    expect(document.page.margins.top).toBe(20);
    expect(document.page.margins.bottom).toBe(20);
    expect(document.page.margins.left).toBeCloseTo(pxToMm(DEFAULT_HORIZONTAL_MARGIN_PX), 10);
    expect(document.page.margins.right).toBeCloseTo(pxToMm(DEFAULT_HORIZONTAL_MARGIN_PX), 10);
    expect(mmToPx(document.page.margins.left)).toBeCloseTo(5, 10);
    expect(document.blocks[0].type).toBe('paragraph');
  });

  test('convertit et borne les marges horizontales stockées en millimètres', () => {
    expect(pxToMm(96)).toBeCloseTo(25.4, 10);
    expect(mmToPx(25.4)).toBeCloseTo(96, 10);
    expect(clampHorizontalMarginMm(pxToMm(2))).toBeCloseTo(pxToMm(MIN_HORIZONTAL_MARGIN_PX), 10);
    expect(clampHorizontalMarginMm(80)).toBe(MAX_PAGE_MARGIN_MM);
  });

  test('convertit les blocs en DOM puis reconstitue leurs styles', () => {
    const root = document.createElement('div');
    root.innerHTML = blocksToEditableHtml([
      {
        id: 'p-1', type: 'paragraph', align: 'center', indent: 10,
        spacing: { line: 1.5, before: 2, after: 8 },
        runs: [{ text: 'Texte important', marks: { bold: true, italic: true }, link: 'https://example.test' }],
      },
      { id: 'break-1', type: 'page-break' },
    ]);
    const blocks = domToBlocks(root);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].align).toBe('center');
    expect(blocks[0].runs[0]).toMatchObject({ text: 'Texte important', link: 'https://example.test' });
    expect(blocks[0].runs[0].marks).toMatchObject({ bold: true, italic: true });
    expect(blocks[1].type).toBe('page-break');
  });

  test('collecte contenu, en-tête, pied et réglages de page', () => {
    const editor = document.createElement('div');
    const header = document.createElement('div');
    const footer = document.createElement('div');
    editor.innerHTML = '<p>Corps du document</p>';
    header.innerHTML = '<p>Cabinet</p>';
    footer.innerHTML = '<p>Confidentiel</p>';
    const structured = collectStructuredDocument({
      editor, header, footer, title: 'Courrier',
      page: { orientation: 'landscape', margins: { top: 10, right: 11, bottom: 12, left: 13 }, showPageNumbers: false },
    });
    expect(structured.page.orientation).toBe('landscape');
    expect(structured.page.margins).toEqual({ top: 10, right: 11, bottom: 12, left: 13 });
    expect(structured.page.header.blocks[0].runs[0].text).toBe('Cabinet');
    expect(structured.blocks[0].runs[0].text).toBe('Corps du document');
  });

  test('conserve 20 mm pour un ancien document sans marges horizontales', () => {
    const editor = document.createElement('div');
    const header = document.createElement('div');
    const footer = document.createElement('div');
    editor.innerHTML = '<p>Ancien document</p>';
    const structured = collectStructuredDocument({
      editor, header, footer, title: 'Ancien',
      page: { format: 'A4', orientation: 'portrait', margins: { top: 20, bottom: 20 } },
    });
    expect(structured.page.margins).toEqual({ top: 20, right: 20, bottom: 20, left: 20 });

    const html = documentToPrintHtml({ ...structured, page: { ...structured.page, margins: { top: 20, bottom: 20 } } });
    expect(html).toContain('padding:20mm 20mm 20mm 20mm');
  });

  test('imprime les nouvelles marges de 5 px avec leur valeur stockée en millimètres', () => {
    const source = createEmptyDocument('Marges fines');
    const html = documentToPrintHtml(source);
    const horizontalMm = pxToMm(DEFAULT_HORIZONTAL_MARGIN_PX);
    expect(html).toContain(`padding:20mm ${horizontalMm}mm 20mm ${horizontalMm}mm`);
  });

  test('remplace du texte sans perdre les marques', () => {
    const source = createEmptyDocument();
    source.blocks[0].runs = [{ text: 'Client client CLIENT', marks: { bold: true } }];
    const replaced = replaceInDocument(source, 'client', 'partie', true);
    expect(replaced.blocks[0].runs[0].text).toBe('partie partie partie');
    expect(replaced.blocks[0].runs[0].marks.bold).toBe(true);
    expect(countDocument(replaced).words).toBe(3);
  });

  test('produit un aperçu imprimable sans HTML actif issu du texte', () => {
    const source = createEmptyDocument('<script>titre</script>');
    source.blocks[0].runs = [{ text: '<img onerror=alert(1)>', marks: {} }];
    const html = documentToPrintHtml(source);
    expect(html).toContain('&lt;img onerror=alert(1)&gt;');
    expect(html).not.toContain('<img onerror=alert(1)>');
    expect(html).toContain('@page');
  });

  test('produit de vraies feuilles imprimables numérotées après un saut de page', () => {
    const source = createEmptyDocument('Deux pages');
    source.blocks = [
      { id: 'p-1', type: 'paragraph', runs: [{ text: 'Première page', marks: {} }] },
      { id: 'break-1', type: 'page-break' },
      { id: 'p-2', type: 'paragraph', runs: [{ text: 'Deuxième page', marks: {} }] },
    ];
    const html = documentToPrintHtml(source);
    expect((html.match(/<article class="page">/g) || [])).toHaveLength(2);
    expect(html).toContain('Page 1 sur 2');
    expect(html).toContain('Page 2 sur 2');
    expect(countDocument(source).pages).toBe(2);
  });

  test('conserve largeur et alignements des cellules de tableau', () => {
    const root = document.createElement('div');
    root.innerHTML = blocksToEditableHtml([{
      id: 'table-1',
      type: 'table',
      rows: [{ cells: [{
        width: 33,
        colSpan: 2,
        rowSpan: 3,
        align: 'center',
        verticalAlign: 'middle',
        blocks: [{ id: 'p-cell', type: 'paragraph', runs: [{ text: 'Cellule', marks: {} }] }],
      }] }],
    }]);
    const renderedCell = root.querySelector('td');
    expect(renderedCell).toHaveAttribute('colspan', '2');
    expect(renderedCell).toHaveAttribute('rowspan', '3');
    expect(renderedCell.style.width).toBe('33%');
    expect(renderedCell.style.textAlign).toBe('center');
    expect(renderedCell.style.verticalAlign).toBe('middle');
    const [table] = domToBlocks(root);
    expect(table.rows[0].cells[0]).toMatchObject({
      width: 33,
      colSpan: 2,
      rowSpan: 3,
      align: 'center',
      verticalAlign: 'middle',
    });
  });

  test('borne les fusions de cellules absurdes au rendu et à la collecte DOM', () => {
    const root = document.createElement('div');
    root.innerHTML = blocksToEditableHtml([{
      id: 'table-spans',
      type: 'table',
      rows: [{ cells: [{
        colSpan: 999999,
        rowSpan: 999999,
        blocks: [{ id: 'p-cell', type: 'paragraph', runs: [{ text: 'Fusion bornée', marks: {} }] }],
      }] }],
    }]);
    const renderedCell = root.querySelector('td');
    expect(renderedCell).toHaveAttribute('colspan', '20');
    expect(renderedCell).toHaveAttribute('rowspan', '100');

    renderedCell.setAttribute('colspan', '500000');
    renderedCell.setAttribute('rowspan', '500000');
    const [table] = domToBlocks(root);
    expect(table.rows[0].cells[0]).toMatchObject({ colSpan: 20, rowSpan: 100 });
  });

  test('ignore les spans invalides sans altérer largeur ni alignements', () => {
    const root = document.createElement('div');
    root.innerHTML = '<table><tbody><tr><td colspan="-4" rowspan="invalide" style="width:42%;text-align:right;vertical-align:bottom"><p>Valeur sûre</p></td></tr></tbody></table>';

    const [table] = domToBlocks(root);
    expect(table.rows[0].cells[0]).toMatchObject({
      width: 42,
      align: 'right',
      verticalAlign: 'bottom',
    });
    expect(table.rows[0].cells[0]).not.toHaveProperty('colSpan');
    expect(table.rows[0].cells[0]).not.toHaveProperty('rowSpan');
  });

  test('conserve les métadonnées v2 et les références lors de la collecte DOM', () => {
    const editor = document.createElement('div');
    const header = document.createElement('div');
    const footer = document.createElement('div');
    const base = createEmptyDocument('Acte');
    base.documentType = 'conclusions';
    base.signature = { source: 'explicit', text: 'Me Exemple', alignment: 'right' };
    base.templateBinding = { templateKey: 'conclusions', version: 4 };
    editor.innerHTML = blocksToEditableHtml([{
      type: 'reference', referenceId: 'ref-1', targetDossierId: 'd1', targetDocumentId: 'p1',
      targetVersionId: 'v1', followLatest: false, referenceType: 'piece', label: 'Pièce n° 1', status: 'active',
    }]);
    header.innerHTML = '<p>Cabinet</p>';
    footer.innerHTML = '<p>Page</p>';
    const result = collectStructuredDocument({ editor, header, footer, title: 'Acte', page: base.page, baseDocument: base });
    expect(result.schemaVersion).toBe(2);
    expect(result.documentType).toBe('conclusions');
    expect(result.signature.text).toBe('Me Exemple');
    expect(result.blocks[0]).toMatchObject({ type: 'reference', referenceId: 'ref-1', targetVersionId: 'v1' });
  });
});


test('répare les ancres clonées sans modifier le texte et les conserve à la collecte suivante', () => {
  const editor = document.createElement('div');
  editor.innerHTML = '<p data-kheops-block="original">Premier</p><p data-kheops-block="original">Second</p><table><tr><td><p data-kheops-block="original">Cellule</p></td></tr></table>';
  const header = document.createElement('div');
  const footer = document.createElement('div');
  header.innerHTML = '<p data-kheops-block="entete">Cabinet</p>';
  footer.innerHTML = '<p data-kheops-block="entete">Page</p>';
  const collect = () => collectStructuredDocument({ editor, header, footer, title: 'Test', page: {} });
  const anchors = result => [result.page.header.blocks[0].id, result.page.footer.blocks[0].id,
    result.blocks[0].id, result.blocks[1].id, result.blocks[2].rows[0].cells[0].blocks[0].id];
  const first = collect();
  expect(new Set(anchors(first)).size).toBe(5);
  expect(first.blocks[0].id).toBe('original');
  expect(first.page.header.blocks[0].id).toBe('entete');
  expect(anchors(collect())).toEqual(anchors(first));
  expect(editor.textContent).toBe('PremierSecondCellule');
});
