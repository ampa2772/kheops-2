const contactRouter = require('../contactActions');
const documentRouter = require('../documentMail');

function has(router, method, path) {
  return router.stack.some((layer) => layer.route?.path === path && layer.route.methods?.[method]);
}

describe('contrats actions Contact et Document', () => {
  test('un contact expose contexte, courrier et brouillon e-mail', () => {
    expect(has(contactRouter, 'get', '/:id/context')).toBe(true);
    expect(has(contactRouter, 'post', '/:id/letters')).toBe(true);
    expect(has(contactRouter, 'post', '/:id/email-drafts')).toBe(true);
  });

  test('un document expose l’envoi de sa version figée', () => {
    expect(has(documentRouter, 'post', '/:id/send-by-email')).toBe(true);
  });
});
