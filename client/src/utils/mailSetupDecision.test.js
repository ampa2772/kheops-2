// Tests — décision d'affichage de la fenêtre "connecter ma boîte mail" (cloche).
import { userHasOAuthMail, shouldOfferMailSetup } from './mailSetupDecision';

describe('userHasOAuthMail', () => {
  test('Google → true', () => {
    expect(userHasOAuthMail({ googleRefreshToken: 'x' })).toBe(true);
  });
  test('Microsoft → true', () => {
    expect(userHasOAuthMail({ microsoftRefreshToken: 'x' })).toBe(true);
  });
  test('ni Google ni Microsoft → false', () => {
    expect(userHasOAuthMail({ email: 'jean@orange.fr' })).toBe(false);
    expect(userHasOAuthMail(null)).toBe(false);
    expect(userHasOAuthMail(undefined)).toBe(false);
  });
});

describe('shouldOfferMailSetup', () => {
  test('compte Google/Microsoft → NE PAS proposer (mails automatiques)', () => {
    expect(shouldOfferMailSetup({ googleRefreshToken: 'x' }, [])).toBe(false);
    expect(shouldOfferMailSetup({ microsoftRefreshToken: 'x' }, null)).toBe(false);
  });

  test('vérification pas terminée (imapAccounts null) → NE PAS proposer (évite le clignotement)', () => {
    expect(shouldOfferMailSetup({ email: 'jean@orange.fr' }, null)).toBe(false);
  });

  test('✅ compte Yahoo/Orange/OVH SANS boîte configurée → proposer', () => {
    expect(shouldOfferMailSetup({ email: 'jean@orange.fr' }, [])).toBe(true);
    expect(shouldOfferMailSetup({ email: 'x@yahoo.fr' }, [])).toBe(true);
  });

  test('compte générique AVEC une boîte déjà configurée → NE PAS proposer', () => {
    expect(shouldOfferMailSetup({ email: 'jean@orange.fr' }, [{ id: 'a', status: 'active' }])).toBe(false);
  });
});
