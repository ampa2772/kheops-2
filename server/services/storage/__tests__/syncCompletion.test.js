// Tests A4 — assertUploadCompleted : confirmation de sync chez les clouds
// PAR UTILISATEUR uniquement, avec la bonne sémantique false vs inconclusif.

const { assertUploadCompleted } = require('../index');

describe('assertUploadCompleted', () => {
  test('provider NON per-user (managed_gcs) → aucune vérification', async () => {
    const exists = jest.fn();
    await assertUploadCompleted({ perUser: false, exists }, 'k');
    await assertUploadCompleted({ exists }, 'k'); // perUser absent
    expect(exists).not.toHaveBeenCalled();
  });

  test('per-user + fichier présent → OK', async () => {
    await expect(assertUploadCompleted({ perUser: true, exists: async () => true }, 'k'))
      .resolves.toBeUndefined();
  });

  test('🔒 per-user + fichier ABSENT (false explicite) → 502 SYNC_NOT_CONFIRMED', async () => {
    await expect(assertUploadCompleted({ perUser: true, exists: async () => false }, 'k'))
      .rejects.toMatchObject({ statusCode: 502, code: 'SYNC_NOT_CONFIRMED' });
  });

  test('per-user + vérification qui LÈVE (réseau/jeton) → inconclusif, ne bloque PAS', async () => {
    await expect(assertUploadCompleted({ perUser: true, exists: async () => { throw new Error('net'); } }, 'k'))
      .resolves.toBeUndefined();
  });

  test('per-user sans méthode exists → no-op', async () => {
    await expect(assertUploadCompleted({ perUser: true }, 'k')).resolves.toBeUndefined();
  });

  test('storageKey vide → no-op', async () => {
    const exists = jest.fn();
    await assertUploadCompleted({ perUser: true, exists }, '');
    expect(exists).not.toHaveBeenCalled();
  });
});
