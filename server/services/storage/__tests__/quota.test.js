const mongoose = require('mongoose');

describe('storage quota service', () => {
  function loadQuota({ config, updatedConfig } = {}) {
    jest.resetModules();
    const tenantObjectId = new mongoose.Types.ObjectId();
    const getStorageProviderConfig = jest.fn().mockResolvedValue(config || {
      tenantId: tenantObjectId,
      usedBytes: 50,
      quotaBytes: 100,
    });
    const toTenantObjectId = jest.fn(() => tenantObjectId);
    const findOneAndUpdate = jest.fn().mockResolvedValue(updatedConfig || {
      tenantId: tenantObjectId,
      usedBytes: 60,
      quotaBytes: 100,
    });

    jest.doMock('../index', () => ({
      getStorageProviderConfig,
      toTenantObjectId,
    }));
    jest.doMock('../../../models/Storage/StorageProviderConfig', () => ({
      findOneAndUpdate,
    }));

    return {
      quota: require('../quota'),
      getStorageProviderConfig,
      findOneAndUpdate,
      tenantObjectId,
    };
  }

  test('assertWithinQuota retourne le futur usage sous quota', async () => {
    const { quota } = loadQuota({
      config: { usedBytes: 50, quotaBytes: 100 },
    });

    await expect(quota.assertWithinQuota(new mongoose.Types.ObjectId(), 25))
      .resolves.toMatchObject({ usedBytes: 75, quotaBytes: 100, percent: 75, warning: false });
  });

  test('assertWithinQuota refuse proprement en 413 au depassement', async () => {
    const { quota } = loadQuota({
      config: { usedBytes: 95, quotaBytes: 100 },
    });

    await expect(quota.assertWithinQuota(new mongoose.Types.ObjectId(), 10))
      .rejects.toMatchObject({
        name: 'QuotaExceededError',
        code: 'QUOTA_EXCEEDED',
        statusCode: 413,
        usedBytes: 95,
        quotaBytes: 100,
        addBytes: 10,
      });
  });

  test('addUsage ne descend jamais sous zero', async () => {
    const { quota, findOneAndUpdate } = loadQuota({
      config: { usedBytes: 5, quotaBytes: 100 },
      updatedConfig: { usedBytes: 0, quotaBytes: 100 },
    });

    await expect(quota.addUsage(new mongoose.Types.ObjectId(), -10))
      .resolves.toMatchObject({ usedBytes: 0, quotaBytes: 100, percent: 0 });
    const [, update] = findOneAndUpdate.mock.calls[0];
    expect(update.$set.usedBytes).toBe(0);
  });
});
