const PizZip = require('pizzip');
const { analyzeDocx } = require('../documentCompatibilityService');

function makeDocx(documentXml, extra = {}) {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', '<Types/>');
  zip.file('word/document.xml', documentXml || '<w:document><w:body><w:p/></w:body></w:document>');
  Object.entries(extra).forEach(([name, content]) => zip.file(name, content));
  return zip.generate({ type: 'nodebuffer' });
}

describe('documentCompatibilityService', () => {
  test('document simple -> compatibilité complète', () => {
    const result = analyzeDocx(makeDocx());
    expect(result.level).toBe('complete');
    expect(result.score).toBe(0);
  });

  test('macros et suivi des modifications -> document complexe', () => {
    const buffer = makeDocx(
      '<w:document><w:body><w:ins><w:r/></w:ins><w:sectPr/></w:body></w:document>',
      { 'word/vbaProject.bin': Buffer.from([1, 2, 3]) },
    );
    const result = analyzeDocx(buffer);
    expect(result.level).toBe('complex');
    expect(result.features.macros).toBe(true);
    expect(result.features.trackedChanges).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/Macros/);
  });

  test('champ Word seul -> compatibilité partielle', () => {
    const result = analyzeDocx(makeDocx('<w:document><w:body><w:fldSimple w:instr="DATE"/></w:body></w:document>'));
    expect(result.level).toBe('partial');
    expect(result.features.complexFields).toBe(true);
  });

  test('buffer invalide -> document complexe sans exception', () => {
    const result = analyzeDocx(Buffer.from('pas un docx'));
    expect(result.level).toBe('complex');
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

