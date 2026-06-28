// snapshotService.test.js — Tests du service snapshot (no-op)
const { beforeUpdate } = require('../snapshotService');

describe('snapshotService', () => {
  describe('beforeUpdate', () => {
    it('est une fonction', () => {
      expect(typeof beforeUpdate).toBe('function');
    });

    it('retourne null (no-op)', async () => {
      const result = await beforeUpdate({ _id: 'dossier1', nom: 'Test' });
      expect(result).toBeNull();
    });

    it('retourne null meme sans argument', async () => {
      const result = await beforeUpdate();
      expect(result).toBeNull();
    });

    it('retourne null avec un argument null', async () => {
      const result = await beforeUpdate(null);
      expect(result).toBeNull();
    });

    it('est une fonction async (retourne une promise)', () => {
      const result = beforeUpdate();
      expect(result).toBeInstanceOf(Promise);
    });
  });
});
