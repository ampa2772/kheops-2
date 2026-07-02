// Test unitaire (pur, sans DB) de la logique de nommage du cabinet (AUTH-002).
// La résolution/création (resolveTenantId, createTenantForUser) nécessite Mongo
// et est couverte par les tests d'intégration (à exécuter avec un Mongo de test
// — mongodb-memory-server non installé ici, voir AI_COORDINATION.md / Tests).

const { defaultTenantName } = require('../tenantService');

describe('tenantService.defaultTenantName', () => {
  test('nom + prénom → "Cabinet Prénom Nom"', () => {
    expect(defaultTenantName({ firstName: 'Jean', lastName: 'Dupont' })).toBe('Cabinet Jean Dupont');
  });

  test('prénom seul', () => {
    expect(defaultTenantName({ firstName: 'Jean' })).toBe('Cabinet Jean');
  });

  test('ni prénom ni nom → fallback e-mail', () => {
    expect(defaultTenantName({ email: 'me@example.com' })).toBe('Cabinet me@example.com');
  });

  test('rien → "Cabinet"', () => {
    expect(defaultTenantName({})).toBe('Cabinet');
    expect(defaultTenantName(null)).toBe('Cabinet');
  });
});
