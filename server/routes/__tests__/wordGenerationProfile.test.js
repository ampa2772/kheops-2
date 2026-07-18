const router = require('../word');

const { resolveDocumentGenerationOptions } = router._private;

describe('profil documentaire des nouveaux courriers', () => {
  test('reprend exactement l’en-tête, la signature et leur mise en forme sauvegardés', () => {
    const result = resolveDocumentGenerationOptions({}, {
      header: 'Cabinet Martin\n12 rue de Paris',
      signature: 'Maître Alice Martin',
      signatureImage: 'data:image/png;base64,AAAA',
      headerFontFamily: 'Georgia',
      headerFontSize: 12,
      headerFontWeight: 'bold',
      headerTextAlign: 'right',
    });

    expect(result).toEqual({
      header: 'Cabinet Martin\n12 rue de Paris',
      signatureText: 'Maître Alice Martin',
      signatureImageBase64: 'data:image/png;base64,AAAA',
      fontOptions: {
        fontFamily: 'Georgia',
        fontSize: 12,
        fontWeight: 'bold',
        textAlign: 'right',
      },
    });
  });

  test('ne compose aucun contenu quand ces paramètres sont absents', () => {
    const result = resolveDocumentGenerationOptions({}, {
      firstName: 'Alice',
      lastName: 'Martin',
      address: '12 rue de Paris',
      city: 'Paris',
    });

    expect(result.header).toBe('');
    expect(result.signatureText).toBe('');
    expect(result.signatureImageBase64).toBe('');
    expect(result.fontOptions).toEqual({
      fontFamily: undefined,
      fontSize: undefined,
      fontWeight: undefined,
      textAlign: undefined,
    });
  });

  test('ignore toute décoration fournie par le navigateur', () => {
    const result = resolveDocumentGenerationOptions({
      header: 'En-tête injecté par le client',
      signatureText: 'Signature injectée par le client',
      signatureImageBase64: 'data:image/png;base64,CLIENT',
      fontOptions: { fontFamily: 'Police cliente' },
    }, {});

    expect(result).toMatchObject({
      header: '',
      signatureText: '',
      signatureImageBase64: '',
    });
  });
});
