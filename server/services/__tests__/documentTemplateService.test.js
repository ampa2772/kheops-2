jest.mock('../../models/DocumentEditor/DocumentTemplate', () => ({}));

const { applyTemplateToDocument, scoreTemplate } = require('../documentTemplateService');

describe('documentTemplateService', () => {
  const template = {
    _id: 'template-1', templateKey: 'conclusions', version: 3, name: 'Conclusions', active: true,
    documentType: 'conclusions', priority: 2, scope: { language: 'fr' },
    layout: { orientation: 'landscape', columns: 2 },
    header: { default: { blocks: [{ type: 'paragraph', runs: [{ text: 'Cabinet', marks: {} }] }] } },
    footer: {}, styles: { normal: { font: 'Arial' } },
    signature: { source: 'cabinet', text: 'Le cabinet' },
  };

  test('applique seulement les sections non protégées par une exception locale', () => {
    const document = {
      documentType: 'conclusions', page: { orientation: 'portrait', header: { blocks: [] } },
      styles: {}, signature: { source: 'explicit', text: 'Signature locale' }, blocks: [],
    };
    const result = applyTemplateToDocument(document, template, {
      sections: ['layout', 'header', 'signature', 'styles'],
      localOverrides: { signature: true },
    });
    expect(result.page.orientation).toBe('landscape');
    expect(result.page.header.blocks[0].runs[0].text).toBe('Cabinet');
    expect(result.signature.text).toBe('Signature locale');
    expect(result.templateBinding).toMatchObject({ templateKey: 'conclusions', version: 3 });
  });

  test('préfère un modèle au bon type et rejette une portée incompatible', () => {
    expect(scoreTemplate(template, { documentType: 'conclusions', language: 'fr' })).toBeGreaterThan(0);
    expect(scoreTemplate({ ...template, scope: { jurisdiction: 'paris' } }, { documentType: 'conclusions', jurisdiction: 'lyon' })).toBe(Number.NEGATIVE_INFINITY);
  });
});
