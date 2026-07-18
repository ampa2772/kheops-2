const service = require('../mailCompositionService');

describe('mailCompositionService', () => {
  test('produit des clés stables pour modèles et signatures', () => {
    expect(service.keyOf('Signature de Maître Jalet')).toBe('signature-de-maitre-jalet');
    expect(service.keyOf('')).toBe('');
  });

  test('ajoute une signature versionnée sans masquer le brouillon', () => {
    const result = service.appendSignature(
      { bodyText: 'Bonjour', bodyHtml: '<p>Bonjour</p>' },
      {
        _id: 'sig-1', signatureKey: 'principale', version: 3, name: 'Signature principale',
        bodyText: 'Maître Jalet', bodyHtml: '<p>Maître Jalet</p>',
      },
    );
    expect(result.bodyText).toBe('Bonjour\n\nMaître Jalet');
    expect(result.bodyHtml).toBe('<p>Bonjour</p><br><br><p>Maître Jalet</p>');
    expect(result.signature).toEqual({ id: 'sig-1', key: 'principale', version: 3, name: 'Signature principale' });
  });

  test('la composition reste valide lorsqu’aucune signature ne s’applique', () => {
    expect(service.appendSignature({ bodyText: 'Texte' }, null)).toEqual({ bodyText: 'Texte', signature: null });
  });
});
