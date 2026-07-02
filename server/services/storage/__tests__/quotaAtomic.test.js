// Tests A5 — réservation/libération ATOMIQUE de quota.
// On mocke le modèle : on ne teste pas la concurrence réelle mais la FORME de la
// requête (conditionnelle + $inc, et non un read-then-$set vulnérable au TOCTOU)
// ainsi que le comportement dépassement/rollback.

jest.mock('../index', () => ({
  getStorageProviderConfig: jest.fn(),
  toTenantObjectId: (id) => id,
}));
jest.mock('../../../models/Storage/StorageProviderConfig', () => ({ findOneAndUpdate: jest.fn() }));

const StorageProviderConfig = require('../../../models/Storage/StorageProviderConfig');
const { getStorageProviderConfig } = require('../index');
const { reserveQuota, releaseQuota, QuotaExceededError } = require('../quota');

beforeEach(() => {
  getStorageProviderConfig.mockResolvedValue({ usedBytes: 0, quotaBytes: 100 });
  StorageProviderConfig.findOneAndUpdate.mockReset();
});

describe('reserveQuota', () => {
  test('réservation dans le quota : $inc conditionnel atomique', async () => {
    StorageProviderConfig.findOneAndUpdate.mockResolvedValue({ usedBytes: 40, quotaBytes: 100 });

    const usage = await reserveQuota('T1', 40);

    expect(usage).toMatchObject({ usedBytes: 40, quotaBytes: 100, percent: 40 });
    const [filter, update, opts] = StorageProviderConfig.findOneAndUpdate.mock.calls[0];
    // La condition garantit qu'on n'incrémente QUE si on reste dans le quota.
    expect(filter.tenantId).toBe('T1');
    expect(Array.isArray(filter.$or)).toBe(true);
    const exprBranch = filter.$or.find((b) => b.$expr);
    expect(exprBranch).toBeTruthy();
    // Mise à jour = incrément atomique (PAS un $set lu-puis-écrit).
    expect(update).toEqual({ $inc: { usedBytes: 40 } });
    expect(opts).toMatchObject({ new: true });
  });

  test('🔒 dépassement : findOneAndUpdate ne matche pas → QuotaExceededError (413)', async () => {
    StorageProviderConfig.findOneAndUpdate.mockResolvedValue(null); // condition non remplie
    getStorageProviderConfig.mockResolvedValue({ usedBytes: 95, quotaBytes: 100 });

    await expect(reserveQuota('T1', 20)).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
      statusCode: 413,
      usedBytes: 95,
      quotaBytes: 100,
      addBytes: 20,
    });
  });

  test('quota illimité (0) : la condition $or autorise via la branche quotaBytes<=0', async () => {
    StorageProviderConfig.findOneAndUpdate.mockResolvedValue({ usedBytes: 999999, quotaBytes: 0 });
    await reserveQuota('T1', 500);
    const [filter] = StorageProviderConfig.findOneAndUpdate.mock.calls[0];
    expect(filter.$or.some((b) => b.quotaBytes && b.quotaBytes.$lte === 0)).toBe(true);
  });

  test('0 octet → pas de réservation (court-circuit)', async () => {
    await reserveQuota('T1', 0);
    expect(StorageProviderConfig.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('releaseQuota (rollback)', () => {
  test('décrémente via pipeline clampé à 0 ($max)', async () => {
    StorageProviderConfig.findOneAndUpdate.mockResolvedValue({ usedBytes: 10, quotaBytes: 100 });
    await releaseQuota('T1', 40);
    const [filter, update] = StorageProviderConfig.findOneAndUpdate.mock.calls[0];
    expect(filter.tenantId).toBe('T1');
    // Update = pipeline d'agrégation (tableau) avec $max pour ne jamais passer <0.
    expect(Array.isArray(update)).toBe(true);
    const json = JSON.stringify(update);
    expect(json).toContain('$max');
    expect(json).toContain('$subtract');
  });

  test('0 octet → pas d\'écriture', async () => {
    await releaseQuota('T1', 0);
    expect(StorageProviderConfig.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
