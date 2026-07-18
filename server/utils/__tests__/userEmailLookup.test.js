const {
  escapeRegExp,
  findUserByEmailCaseInsensitive,
} = require('../userEmailLookup');

describe('recherche exacte d’un compte par adresse OAuth', () => {
  test('neutralise tous les métacaractères regex d’une adresse', () => {
    expect(escapeRegExp('a+b.test[1]@example.com')).toBe(
      'a\\+b\\.test\\[1\\]@example\\.com'
    );
  });

  test('une adresse Google avec + et . ne peut pas correspondre à un autre compte', async () => {
    const User = { findOne: jest.fn().mockResolvedValue(null) };

    await findUserByEmailCaseInsensitive(User, 'victim+alias@example.com');

    const query = User.findOne.mock.calls[0][0];
    expect(query).toEqual({
      email: {
        $regex: '^victim\\+alias@example\\.com$',
        $options: 'i',
      },
    });
    expect(new RegExp(query.email.$regex, query.email.$options).test(
      'victimmmmmalias@exampleXcom'
    )).toBe(false);
    expect(new RegExp(query.email.$regex, query.email.$options).test(
      'VICTIM+ALIAS@EXAMPLE.COM'
    )).toBe(true);
  });

  test('refuse une valeur vide sans interroger MongoDB', async () => {
    const User = { findOne: jest.fn() };
    await expect(findUserByEmailCaseInsensitive(User, '   ')).resolves.toBeNull();
    expect(User.findOne).not.toHaveBeenCalled();
  });
});
