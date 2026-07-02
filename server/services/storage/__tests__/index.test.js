const mongoose = require('mongoose');

describe('storage registry', () => {
  function loadStorageWithModel(findOneAndUpdate) {
    jest.resetModules();
    jest.doMock('../providers/managedGcs', () => ({ name: 'managed_gcs' }));
    jest.doMock('../providers/googleDrive', () => ({ name: 'google_drive' }));
    jest.doMock('../providers/onedrive', () => ({ name: 'onedrive' }));
    jest.doMock('../../../models/Storage/StorageProviderConfig', () => ({
      DEFAULT_QUOTA_BYTES: 1234,
      findOneAndUpdate,
    }));
    return {
      storage: require('../index'),
      model: require('../../../models/Storage/StorageProviderConfig'),
    };
  }

  test('getStorageProvider lit la config tenant et renvoie le provider choisi', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const findOneAndUpdate = jest.fn().mockResolvedValue({
      tenantId,
      provider: 'managed_gcs',
      quotaBytes: 1234,
      usedBytes: 0,
    });
    const { storage, model } = loadStorageWithModel(findOneAndUpdate);

    const provider = await storage.getStorageProvider(tenantId);

    expect(provider.name).toBe('managed_gcs');
    expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [query, update, options] = model.findOneAndUpdate.mock.calls[0];
    expect(String(query.tenantId)).toBe(String(tenantId));
    expect(update.$setOnInsert.provider).toBe('managed_gcs');
    expect(options).toMatchObject({ new: true, upsert: true });
  });

  test('selectStorageProvider refuse un provider inconnu sans ecrire en base', async () => {
    const findOneAndUpdate = jest.fn();
    const { storage, model } = loadStorageWithModel(findOneAndUpdate);

    await expect(storage.selectStorageProvider(new mongoose.Types.ObjectId(), 'dropbox'))
      .rejects.toMatchObject({ statusCode: 400, code: 'UNSUPPORTED_STORAGE_PROVIDER' });
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('selectStorageProvider persiste un provider supporte', async () => {
    const tenantId = new mongoose.Types.ObjectId();
    const findOneAndUpdate = jest.fn().mockResolvedValue({
      tenantId,
      provider: 'onedrive',
      quotaBytes: 1234,
      usedBytes: 0,
    });
    const { storage, model } = loadStorageWithModel(findOneAndUpdate);

    const config = await storage.selectStorageProvider(tenantId, 'onedrive');

    expect(config.provider).toBe('onedrive');
    const [query, update, options] = model.findOneAndUpdate.mock.calls[0];
    expect(String(query.tenantId)).toBe(String(tenantId));
    expect(update.$set.provider).toBe('onedrive');
    expect(update.$setOnInsert).toMatchObject({ quotaBytes: 1234, usedBytes: 0 });
    expect(options).toMatchObject({ new: true, upsert: true });
  });
});
