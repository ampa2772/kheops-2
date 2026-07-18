const CompanionSession = require('../CompanionSession');

describe('modele CompanionSession', () => {
  test('stocke uniquement les empreintes jti et porte un TTL a echeance absolue', () => {
    const paths = CompanionSession.schema.paths;
    expect(paths.sessionId.options).toEqual(expect.objectContaining({ required: true, unique: true }));
    expect(paths.userId.options).toEqual(expect.objectContaining({ required: true }));
    expect(paths.currentJtiHash.options).toEqual(expect.objectContaining({ required: true }));
    expect(paths.previousJtiHash).toBeDefined();
    expect(paths.previousValidUntil).toBeDefined();
    expect(paths.revokedAt).toBeDefined();

    const ttlIndex = CompanionSession.schema.indexes().find(
      ([fields]) => fields.absoluteExpiresAt === 1,
    );
    expect(ttlIndex).toEqual([
      { absoluteExpiresAt: 1 },
      expect.objectContaining({ expireAfterSeconds: 0 }),
    ]);
    expect(paths).not.toHaveProperty('currentJti');
    expect(paths).not.toHaveProperty('previousJti');
  });
});
