// Tests — fix 2026-07-04 : la signature ne doit apparaitre QUE sur la derniere
// page d'un document long. L'injecteur ne cree donc PLUS de pied de page
// (un footer se repete au bas de CHAQUE page) : il insere les paragraphes de
// signature EN FIN DE CORPS du document, juste avant le <w:sectPr> final.
// L'en-tete, lui, reste en zone header "premiere page seulement" (titlePg).

const fs = require('fs');
const os = require('os');
const path = require('path');
const PizZip = require('pizzip');

const { injectHeaderAndFooter } = require('../docxHeaderFooterInjector');

// PNG 1x1 transparent (permet le calcul de dimensions reelles)
const PNG_1PX_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Page 1 — corps du courrier.</w:t></w:r></w:p>
    <w:p><w:r><w:t>DERNIER-PARAGRAPHE-DU-TEXTE</w:t></w:r></w:p>
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/>
    </w:sectPr>
  </w:body>
</w:document>`;

function buildMinimalDocx() {
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
  zip.file('word/document.xml', DOCUMENT_XML);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);
  return zip.generate({ type: 'nodebuffer' });
}

function writeTmpDocx() {
  const p = path.join(os.tmpdir(), `sig-lastpage-${Date.now()}-${Math.random().toString(36).slice(2)}.docx`);
  fs.writeFileSync(p, buildMinimalDocx());
  return p;
}

function readZip(p) {
  return new PizZip(fs.readFileSync(p));
}

afterEach(() => {
  // rien : chaque test nettoie son fichier
});

describe('injectHeaderAndFooter — signature uniquement sur la derniere page', () => {
  test('signature (image + texte) inseree en fin de corps, AUCUN pied de page cree', () => {
    const p = writeTmpDocx();
    try {
      injectHeaderAndFooter(p, {
        headerText: 'Cabinet de Maitre Test',
        signatureText: 'Maitre Test\nAvocat au barreau',
        signatureImageBase64: PNG_1PX_BASE64,
      });

      const zip = readZip(p);
      const doc = zip.file('word/document.xml').asText();
      const rels = zip.file('word/_rels/document.xml.rels').asText();

      // 1. PLUS AUCUN pied de page : ni fichiers footer, ni references
      expect(zip.file('word/footer1.xml')).toBeNull();
      expect(zip.file('word/footer2.xml')).toBeNull();
      expect(zip.file('word/_rels/footer1.xml.rels')).toBeNull();
      expect(zip.file('word/_rels/footer2.xml.rels')).toBeNull();
      expect(doc).not.toMatch(/<w:footerReference\b/);

      // 2. La signature est dans le CORPS, une seule fois, APRES le dernier
      //    paragraphe du texte et AVANT le sectPr final (donc derniere page)
      const blipCount = (doc.match(/<a:blip\b/g) || []).length;
      expect(blipCount).toBe(1);
      expect((doc.match(/Maitre Test/g) || []).length).toBe(1);

      const lastTextIdx = doc.indexOf('DERNIER-PARAGRAPHE-DU-TEXTE');
      const signatureIdx = doc.indexOf('<a:blip');
      const sectPrIdx = doc.lastIndexOf('<w:sectPr');
      expect(lastTextIdx).toBeGreaterThan(-1);
      expect(signatureIdx).toBeGreaterThan(lastTextIdx);   // apres le texte
      expect(sectPrIdx).toBeGreaterThan(signatureIdx);     // avant le sectPr final

      // 3. Image presente dans word/media + relationship au niveau du document
      expect(zip.file('word/media/signature_image.png')).not.toBeNull();
      const relMatch = rels.match(/<Relationship Id="(rId\d+)"[^>]*Target="media\/signature_image\.png"/);
      expect(relMatch).not.toBeNull();
      // r:embed du corps pointe bien vers cette relationship
      expect(doc).toContain(`r:embed="${relMatch[1]}"`);

      // 4. L'en-tete reste "premiere page seulement" : ref first + titlePg, pas de default
      expect(doc).toMatch(/<w:headerReference w:type="first"/);
      expect(doc).not.toMatch(/<w:headerReference w:type="default"/);
      expect(doc).toContain('<w:titlePg/>');
      expect(zip.file('word/header1.xml')).not.toBeNull();
    } finally {
      fs.unlinkSync(p);
    }
  });

  test('signature texte seul : paragraphes en fin de corps, pas de media ni footer', () => {
    const p = writeTmpDocx();
    try {
      injectHeaderAndFooter(p, { signatureText: 'Maitre Solo' });

      const zip = readZip(p);
      const doc = zip.file('word/document.xml').asText();

      expect(zip.file('word/footer1.xml')).toBeNull();
      expect(zip.file('word/footer2.xml')).toBeNull();
      expect(doc).not.toMatch(/<w:footerReference\b/);
      expect(zip.file('word/media/signature_image.png')).toBeNull();

      const sigIdx = doc.indexOf('Maitre Solo');
      expect(sigIdx).toBeGreaterThan(doc.indexOf('DERNIER-PARAGRAPHE-DU-TEXTE'));
      expect(doc.lastIndexOf('<w:sectPr')).toBeGreaterThan(sigIdx);
    } finally {
      fs.unlinkSync(p);
    }
  });

  test('en-tete seul : aucun paragraphe de signature ajoute au corps', () => {
    const p = writeTmpDocx();
    try {
      injectHeaderAndFooter(p, { headerText: 'En-tete seul' });

      const zip = readZip(p);
      const doc = zip.file('word/document.xml').asText();

      expect(doc).not.toMatch(/<a:blip\b/);
      expect(doc).not.toMatch(/<w:footerReference\b/);
      expect(doc).toMatch(/<w:headerReference w:type="first"/);
      expect(doc).toContain('<w:titlePg/>');
    } finally {
      fs.unlinkSync(p);
    }
  });
});
