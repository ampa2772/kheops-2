const router = require('../auth');

function has(method, path) {
  return router.stack.some((layer) => layer.route?.path === path && layer.route.methods?.[method]);
}

describe('connexion de comptes mail additionnels', () => {
  test('expose un flux authentifié Google et Microsoft distinct du login', () => {
    expect(has('post', '/google/mail-connect-url')).toBe(true);
    expect(has('post', '/microsoft/mail-connect-url')).toBe(true);
  });
});
