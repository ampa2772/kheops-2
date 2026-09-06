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

  test('une panne de vérification exige une reprise et ne confirme jamais le transfert', async () => {
    await expect(assertUploadCompleted({ perUser: true, exists: async () => { throw new Error('net'); } }, 'k'))
      .rejects.toMatchObject({code:'SYNC_NOT_CONFIRMED',retryable:true});
  });

  test('un fournisseur sans méthode de confirmation ne peut annoncer un succès', async () => {
    await expect(assertUploadCompleted({ perUser: true }, 'k')).rejects.toMatchObject({code:'SYNC_NOT_CONFIRMED'});
  });

  test('une référence absente ne peut annoncer un succès', async () => {
    const exists = jest.fn();
    await expect(assertUploadCompleted({ perUser: true, exists }, '')).rejects.toMatchObject({code:'SYNC_NOT_CONFIRMED'});
    expect(exists).not.toHaveBeenCalled();
  });
});
