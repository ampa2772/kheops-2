// Tests A18 — classement front des erreurs de messagerie.
import { classifyMailError } from './mailErrorMessage';

describe('classifyMailError (front)', () => {
  test('aucune réponse serveur (hors-ligne) → offline, réessayable, transitoire', () => {
    const r = classifyMailError({ request: {} }); // pas de response
    expect(r.category).toBe('offline');
    expect(r.retryable).toBe(true);
    expect(r.transient).toBe(true);
  });

  test('IMAP_CONNECTION_FAILED → mail-network, transitoire (ne vide pas la vue)', () => {
    const r = classifyMailError({ response: { status: 502, data: { code: 'IMAP_CONNECTION_FAILED', message: 'msg serveur' } } });
    expect(r.category).toBe('mail-network');
    expect(r.transient).toBe(true);
    expect(r.retryable).toBe(true);
    expect(r.message).toBe('msg serveur');
  });

  test('IMAP_TIMEOUT → mail-network transitoire', () => {
    const r = classifyMailError({ response: { status: 504, data: { code: 'IMAP_TIMEOUT' } } });
    expect(r.category).toBe('mail-network');
    expect(r.transient).toBe(true);
  });

  test('🔒 IMAP_AUTH_FAILED → mail-auth, NON transitoire, non réessayable', () => {
    const r = classifyMailError({ response: { status: 401, data: { code: 'IMAP_AUTH_FAILED' } } });
    expect(r.category).toBe('mail-auth');
    expect(r.transient).toBe(false);
    expect(r.retryable).toBe(false);
  });

  test('401 sans code mail (session Kheops) → session (vide la vue)', () => {
    const r = classifyMailError({ response: { status: 401, data: {} } });
    expect(r.category).toBe('session');
    expect(r.transient).toBe(false);
  });

  test('403 → session', () => {
    expect(classifyMailError({ response: { status: 403, data: {} } }).category).toBe('session');
  });

  test('erreur générique → generic', () => {
    const r = classifyMailError({ response: { status: 500, data: { message: 'oups' } } });
    expect(r.category).toBe('generic');
    expect(r.message).toBe('oups');
  });
});
