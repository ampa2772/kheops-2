const StorageProviderConfig = require('../../models/Storage/StorageProviderConfig');
const { getStorageProviderConfig, toTenantObjectId } = require('./index');

const QUOTA_WARNING_THRESHOLD = 90;

class QuotaExceededError extends Error {
  constructor({ usedBytes, quotaBytes, addBytes }) {
    super('Quota de stockage depasse.');
    this.name = 'QuotaExceededError';
    this.code = 'QUOTA_EXCEEDED';
    this.statusCode = 413;
    this.usedBytes = usedBytes;
    this.quotaBytes = quotaBytes;
    this.addBytes = addBytes;
  }
}

function usagePayload(config) {
  const usedBytes = Number(config.usedBytes || 0);
  const quotaBytes = Number(config.quotaBytes || 0);
  const percent = quotaBytes > 0 ? Math.round((usedBytes / quotaBytes) * 10000) / 100 : 0;
  return {
    usedBytes,
    quotaBytes,
    percent,
    warning: quotaBytes > 0 && percent >= QUOTA_WARNING_THRESHOLD,
  };
}

async function getUsage(tenantId) {
  const config = await getStorageProviderConfig(tenantId);
  return usagePayload(config);
}

async function assertWithinQuota(tenantId, addBytes) {
  const bytesToAdd = Math.max(0, Number(addBytes || 0));
  const config = await getStorageProviderConfig(tenantId);
  const usedBytes = Number(config.usedBytes || 0);
  const quotaBytes = Number(config.quotaBytes || 0);

  if (quotaBytes > 0 && usedBytes + bytesToAdd > quotaBytes) {
    throw new QuotaExceededError({ usedBytes, quotaBytes, addBytes: bytesToAdd });
  }

  return usagePayload({
    usedBytes: usedBytes + bytesToAdd,
    quotaBytes,
  });
}

async function addUsage(tenantId, deltaBytes) {
  const tenantObjectId = toTenantObjectId(tenantId);
  const current = await getStorageProviderConfig(tenantObjectId);
  const nextUsedBytes = Math.max(0, Number(current.usedBytes || 0) + Number(deltaBytes || 0));
  const config = await StorageProviderConfig.findOneAndUpdate(
    { tenantId: tenantObjectId },
    { $set: { usedBytes: nextUsedBytes } },
    { new: true },
  );
  return usagePayload(config);
}

// A5 — RÉSERVATION ATOMIQUE de quota. Contrairement au couple
// assertWithinQuota()+addUsage() (vulnérable au TOCTOU : deux uploads
// concurrents passent le check puis s'écrasent au $set), on incrémente
// `usedBytes` de manière CONDITIONNELLE et atomique : l'update ne s'applique que
// si le total reste dans le quota. Sinon findOneAndUpdate renvoie null → dépassement.
async function reserveQuota(tenantId, addBytes) {
  const tenantObjectId = toTenantObjectId(tenantId);
  const bytes = Math.max(0, Number(addBytes || 0));
  // Garantit l'existence de la config (upsert) avant la réservation.
  await getStorageProviderConfig(tenantObjectId);

  if (bytes === 0) return getUsage(tenantObjectId);

  const config = await StorageProviderConfig.findOneAndUpdate(
    {
      tenantId: tenantObjectId,
      $or: [
        { quotaBytes: { $lte: 0 } }, // quota 0 = illimité (convention historique)
        { $expr: { $lte: [{ $add: ['$usedBytes', bytes] }, '$quotaBytes'] } },
      ],
    },
    { $inc: { usedBytes: bytes } },
    { new: true },
  );

  if (!config) {
    const fresh = await getStorageProviderConfig(tenantObjectId);
    throw new QuotaExceededError({
      usedBytes: Number(fresh.usedBytes || 0),
      quotaBytes: Number(fresh.quotaBytes || 0),
      addBytes: bytes,
    });
  }
  return usagePayload(config);
}

// A5 — LIBÉRATION de quota (rollback d'une réservation dont l'upload/la
// persistance a échoué). Clampé à 0 via pipeline d'agrégation pour ne jamais
// passer sous zéro même en cas d'incohérence.
async function releaseQuota(tenantId, addBytes) {
  const tenantObjectId = toTenantObjectId(tenantId);
  const bytes = Math.max(0, Number(addBytes || 0));
  if (bytes === 0) return getUsage(tenantObjectId);
  const config = await StorageProviderConfig.findOneAndUpdate(
    { tenantId: tenantObjectId },
    [{ $set: { usedBytes: { $max: [0, { $subtract: ['$usedBytes', bytes] }] } } }],
    { new: true },
  );
  return usagePayload(config || { usedBytes: 0, quotaBytes: 0 });
}

module.exports = {
  QUOTA_WARNING_THRESHOLD,
  QuotaExceededError,
  addUsage,
  assertWithinQuota,
  reserveQuota,
  releaseQuota,
  getUsage,
};
