// Tests A18 — classement serveur des erreurs de messagerie.
const { classifyMailError } = require('../mailErrors');

describe('classifyMailError', () => {
  test('erreur déjà qualifiée (4xx + code métier) → respectée', () => {
    const r = classifyMailError({ statusCode: 404, code: 'MESSAGE_NOT_FOUND', message: 'x' });
    expect(r).toEqual({ statusCode: 404, code: 'MESSAGE_NOT_FOUND', message: 'x' });
  });

  test.each(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'EHOSTUNREACH'])(
    'code réseau %s → 502 IMAP_CONNECTION_FAILED',
    (code) => {
      const r = classifyMailError(Object.assign(new Error('boom'), { code }));
      expect(r.statusCode).toBe(502);
      expect(r.code).toBe('IMAP_CONNECTION_FAILED');
    },
  );

  test('message getaddrinfo ENOTFOUND → 502 IMAP_CONNECTION_FAILED', () => {
    const r = classifyMailError(new Error('getaddrinfo ENOTFOUND imap.orange.fr'));
    expect(r.code).toBe('IMAP_CONNECTION_FAILED');
  });

  test('timeout → 504 IMAP_TIMEOUT', () => {
    expect(classifyMailError(Object.assign(new Error('x'), { code: 'ETIMEDOUT' })).code).toBe('IMAP_TIMEOUT');
    expect(classifyMailError(new Error('Command timed out')).code).toBe('IMAP_TIMEOUT');
  });

  test('auth IMAP refusée → 401 IMAP_AUTH_FAILED', () => {
    expect(classifyMailError(new Error('AUTHENTICATIONFAILED Invalid credentials')).code).toBe('IMAP_AUTH_FAILED');
    expect(classifyMailError(new Error('Invalid password')).statusCode).toBe(401);
  });

  test('erreur inconnue → 500 MAIL_ERROR', () => {
    const r = classifyMailError(new Error('quelque chose'));
    expect(r).toEqual({ statusCode: 500, code: 'MAIL_ERROR', message: 'quelque chose' });
  });

  test('null → défaut sûr', () => {
    expect(classifyMailError(null).statusCode).toBe(500);
  });
});
