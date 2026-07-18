const mammoth = require('mammoth');
const PizZip = require('pizzip');

const {
  applyDocxPresentation,
  mammothHtmlToStructured,
  normalizeStructuredDocument,
} = require('../../documentEditorFormat');
const { generateDocx } = require('../docxGenerator');

const SIGNATURE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function paragraph(content) {
  return `<w:p><w:r><w:t xml:space="preserve">${content}</w:t></w:r></w:p>`;
}

function buildLetterTemplate() {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${paragraph('{titre}')}
    ${paragraph('{adresse}')}
    ${paragraph('{cp} {ville}')}
    ${paragraph('Objet : {objet}')}
    ${paragraph('Corps du courrier inchangé.')}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr>
  </w:body>
</w:document>`);
  return zip.generate({ type: 'nodebuffer' });
}

function bodyParagraphs(buffer) {
  const xml = new PizZip(buffer).file('word/document.xml').asText();
  return (xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/gi) || []).map((value) => ({
    value,
    text: (value.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi) || [])
      .map((node) => node.replace(/^<w:t\b[^>]*>/i, '').replace(/<\/w:t>$/i, ''))
      .join(''),
  }));
}

function variables() {
  return {
    titre: 'Madame Alice Martin',
    adresse: '12 rue des Lilas',
    cp: '75012',
    ville: 'Paris',
    objet: 'Votre dossier',
  };
}

describe('présentation des nouveaux courriers générés', () => {
  test('aligne seulement le bloc destinataire à droite dans le DOCX', async () => {
    const output = await generateDocx({
      templateBuffer: buildLetterTemplate(),
      variables: variables(),
      applyBold: false,
    });
    const paragraphs = bodyParagraphs(output);

    ['Madame Alice Martin', '12 rue des Lilas', '75012 Paris'].forEach((text) => {
      expect(paragraphs.find((item) => item.text === text)?.value).toContain('<w:jc w:val="right"/>');
    });
    expect(paragraphs.find((item) => item.text === 'Objet : Votre dossier')?.value).not.toContain('w:val="right"');
    expect(paragraphs.find((item) => item.text === 'Corps du courrier inchangé.')?.value).not.toContain('w:val="right"');
  });

  test('injecte exactement l’en-tête et la signature configurés', async () => {
    const output = await generateDocx({
      templateBuffer: buildLetterTemplate(),
      variables: variables(),
      header: 'Cabinet Martin\nAvocate au Barreau de Paris',
      signatureText: 'Maître Alice Martin',
      signatureImageBase64: SIGNATURE_PNG,
      fontOptions: { fontFamily: 'Georgia', fontSize: 12, fontWeight: 'bold', textAlign: 'right' },
      applyBold: false,
    });
    const zip = new PizZip(output);
    const header = zip.file('word/header1.xml').asText();
    const body = zip.file('word/document.xml').asText();

    expect(header).toContain('Cabinet Martin');
    expect(header).toContain('Avocate au Barreau de Paris');
    expect(header).toContain('w:ascii="Georgia"');
    expect(header).toContain('w:sz w:val="24"');
    expect(header).toContain('<w:jc w:val="right"/>');
    expect(body).toContain('Maître Alice Martin');
    expect(body).toContain('Signature Image');
    expect(zip.file('word/media/signature_image.png')).not.toBeNull();
    expect(body).toContain('<w:headerReference w:type="first"');
  });

  test('n’invente aucun en-tête ni signature quand le profil est vide', async () => {
    const output = await generateDocx({
      templateBuffer: buildLetterTemplate(),
      variables: variables(),
      header: '',
      signatureText: '',
      signatureImageBase64: '',
      applyBold: false,
    });
    const zip = new PizZip(output);
    const body = zip.file('word/document.xml').asText();

    expect(zip.file('word/header1.xml')).toBeNull();
    expect(body).not.toContain('<w:headerReference');
    expect(body).not.toContain('Signature Image');
  });

  test('l’Éditeur Kheops récupère l’alignement, l’en-tête et la signature du DOCX', async () => {
    const output = await generateDocx({
      templateBuffer: buildLetterTemplate(),
      variables: variables(),
      header: 'Cabinet Martin',
      signatureText: 'Maître Alice Martin',
      signatureImageBase64: SIGNATURE_PNG,
      fontOptions: { fontFamily: 'Georgia', fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
      applyBold: false,
    });
    const html = await mammoth.convertToHtml({ buffer: output }, {
      // Keep the test aligned with the production Editor import pipeline:
      // Mammoth only embeds the image in its HTML when a converter is supplied.
      convertImage: mammoth.images.imgElement((image) => image.read('base64').then((data) => ({
        src: `data:${image.contentType};base64,${data}`,
      }))),
    });
    const imported = normalizeStructuredDocument(applyDocxPresentation(
      output,
      mammothHtmlToStructured(html.value, 'Courrier'),
    ));
    const byText = (text) => imported.blocks.find((block) => (
      (block.runs || []).map((run) => run.text).join('') === text
    ));

    expect(byText('Madame Alice Martin')?.align).toBe('right');
    expect(byText('12 rue des Lilas')?.align).toBe('right');
    expect(byText('75012 Paris')?.align).toBe('right');
    expect(byText('Objet : Votre dossier')?.align).toBe('left');
    expect(byText('Corps du courrier inchangé.')?.align).toBe('left');
    expect(byText('Maître Alice Martin')).toBeTruthy();
    expect(imported.blocks.some((block) => (
      block.type === 'image'
      && /^data:image\/png;base64,/i.test(block.src || '')
    ))).toBe(true);
    expect(imported.page.firstPageDifferent).toBe(true);
    expect(imported.page.firstPageHeader.blocks[0]).toMatchObject({
      align: 'center',
      runs: [{ text: 'Cabinet Martin', marks: expect.objectContaining({ font: 'Georgia', size: 12, bold: true }) }],
    });
    expect(imported.page.header.blocks[0].runs[0].text).toBe('');
  });
});
