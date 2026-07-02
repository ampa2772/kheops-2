// Tests du moteur de génération .docx serveur (Phase 5).
// Construit un template .docx minimal EN MÉMOIRE (pizzip) puis vérifie le rendu.

const PizZip = require('pizzip');
const { renderDocxBuffer, generateDocx } = require('../docxGenerator');

function buildMinimalTemplate(bodyText) {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t xml:space="preserve">${bodyText}</w:t></w:r></w:p>
<w:sectPr/></w:body></w:document>`
  );
  return zip.generate({ type: 'nodebuffer' });
}

function docXml(buffer) {
  return new PizZip(buffer).file('word/document.xml').asText();
}

describe('docxGenerator.renderDocxBuffer', () => {
  test('remplit les placeholders {var}', () => {
    const tpl = buildMinimalTemplate('Bonjour {clientName}, dossier {ref}.');
    const xml = docXml(renderDocxBuffer(tpl, { clientName: 'Jean Dupont', ref: 'A-2026-1' }));
    expect(xml).toContain('Jean Dupont');
    expect(xml).toContain('A-2026-1');
    expect(xml).not.toContain('{clientName}');
  });

  test('tag non résolu → chaîne vide (nullGetter)', () => {
    const tpl = buildMinimalTemplate('X {inconnu} Y');
    const xml = docXml(renderDocxBuffer(tpl, {}));
    expect(xml).not.toContain('{inconnu}');
  });

  test('rejette un buffer non-docx (pas de signature PK)', () => {
    expect(() => renderDocxBuffer(Buffer.from('pas un zip'))).toThrow();
  });
});

describe('docxGenerator.generateDocx', () => {
  test('renvoie un .docx valide rempli (sans header/signature)', async () => {
    const tpl = buildMinimalTemplate('Maitre {avocat}');
    const out = await generateDocx({
      templateBuffer: tpl,
      variables: { avocat: 'Me Martin' },
      applyBold: false,
    });
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out[0]).toBe(0x50); // 'P'
    expect(out[1]).toBe(0x4b); // 'K'
    expect(docXml(out)).toContain('Me Martin');
  });
});
