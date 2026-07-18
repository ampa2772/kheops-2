const router = require('../mailSync');

function paths() {
  return router.stack
    .filter((layer) => layer.route)
    .flatMap((layer) => Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${layer.route.path}`));
}

describe('contrat routes messagerie OAuth durable', () => {
  test('expose comptes, santé, synchronisation, archive et outbox', () => {
    const routes = paths();
    expect(routes).toEqual(expect.arrayContaining([
      'GET /accounts',
      'POST /accounts/:id/test',
      'POST /accounts/:id/sync',
      'GET /accounts/:id/health',
      'POST /accounts/:id/subscription',
      'GET /messages',
      'GET /messages/:id',
      'GET /messages/:id/attachments/:index',
      'POST /messages/send',
      'POST /messages/:id/link-to-matter',
      'GET /send-operations/:id',
    ]));
  });

  test('expose signatures/modèles versionnés et notifications fournisseur', () => {
    expect(paths()).toEqual(expect.arrayContaining([
      'GET /signatures',
      'POST /signatures',
      'GET /templates',
      'POST /templates',
      'POST /webhooks/microsoft',
      'POST /webhooks/google',
    ]));
  });
});
