describe('mail credentialCrypto', () => {
  const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  let oldKey;

  beforeEach(() => {
    jest.resetModules();
    oldKey = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = key;
  });

  afterEach(() => {
    if (oldKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = oldKey;
  });

  test('encrypt/decrypt round-trip sans stocker le secret en clair', () => {
    const crypto = require('../credentialCrypto');
    const encrypted = crypto.encrypt('app-password');

    expect(encrypted).toMatch(/^mailenc:v1:/);
    expect(encrypted).not.toContain('app-password');
    expect(crypto.decrypt(encrypted)).toBe('app-password');
  });

  test('decrypt refuse une valeur non chiffree', () => {
    const crypto = require('../credentialCrypto');
    expect(() => crypto.decrypt('plain-password'))
      .toThrow('Credential mail non chiffre');
  });

  test('encrypt exige TOKEN_ENCRYPTION_KEY valide', () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    const crypto = require('../credentialCrypto');
    crypto.resetKeyCacheForTests();

    expect(() => crypto.encrypt('secret'))
      .toThrow('TOKEN_ENCRYPTION_KEY doit etre defini');
  });
});
