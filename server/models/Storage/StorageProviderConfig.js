const mongoose = require('mongoose');

const STORAGE_PROVIDERS = ['google_drive', 'onedrive', 'managed_gcs'];
const DEFAULT_QUOTA_BYTES = 10 * 1024 * 1024 * 1024;

const StorageProviderConfigSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true,
  },
  provider: {
    type: String,
    enum: STORAGE_PROVIDERS,
    default: 'managed_gcs',
    required: true,
  },
  quotaBytes: {
    type: Number,
    default: DEFAULT_QUOTA_BYTES,
    min: 0,
    required: true,
  },
  usedBytes: {
    type: Number,
    default: 0,
    min: 0,
    required: true,
  },
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
});

StorageProviderConfigSchema.index(
  { tenantId: 1 },
  {
    unique: true,
    partialFilterExpression: { tenantId: { $type: 'objectId' } },
  },
);

module.exports = mongoose.model('StorageProviderConfig', StorageProviderConfigSchema);
module.exports.STORAGE_PROVIDERS = STORAGE_PROVIDERS;
module.exports.DEFAULT_QUOTA_BYTES = DEFAULT_QUOTA_BYTES;
