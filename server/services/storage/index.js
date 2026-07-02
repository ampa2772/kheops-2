const mongoose = require('mongoose');
const StorageProviderConfig = require('../../models/Storage/StorageProviderConfig');
const managedGcs = require('./providers/managedGcs');
const googleDrive = require('./providers/googleDrive');
const onedrive = require('./providers/onedrive');

const providers = {
  managed_gcs: managedGcs,
  google_drive: googleDrive,
  onedrive,
};

function toTenantObjectId(tenantId) {
  if (!tenantId || !mongoose.Types.ObjectId.isValid(String(tenantId))) {
    const err = new Error('tenantId invalide ou manquant.');
    err.statusCode = 400;
    err.code = 'INVALID_TENANT_ID';
    throw err;
  }
  return new mongoose.Types.ObjectId(String(tenantId));
}

function resolveTenantId(req) {
  const tenantId = req?.tenantId || req?.user;
  return toTenantObjectId(tenantId);
}

async function getStorageProviderConfig(tenantId) {
  const tenantObjectId = toTenantObjectId(tenantId);
  return StorageProviderConfig.findOneAndUpdate(
    { tenantId: tenantObjectId },
    {
      $setOnInsert: {
        tenantId: tenantObjectId,
        provider: 'managed_gcs',
        quotaBytes: StorageProviderConfig.DEFAULT_QUOTA_BYTES,
        usedBytes: 0,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

async function getStorageProvider(tenantId) {
  const config = await getStorageProviderConfig(tenantId);
  const provider = providers[config.provider];
  if (!provider) {
    const err = new Error(`Provider de stockage non supporte: ${config.provider}`);
    err.statusCode = 500;
    err.code = 'UNSUPPORTED_STORAGE_PROVIDER';
    throw err;
  }
  return provider;
}

async function selectStorageProvider(tenantId, providerName) {
  if (!providers[providerName]) {
    const err = new Error(`Provider de stockage non supporte: ${providerName}`);
    err.statusCode = 400;
    err.code = 'UNSUPPORTED_STORAGE_PROVIDER';
    throw err;
  }

  const tenantObjectId = toTenantObjectId(tenantId);
  return StorageProviderConfig.findOneAndUpdate(
    { tenantId: tenantObjectId },
    {
      $set: {
        tenantId: tenantObjectId,
        provider: providerName,
      },
      $setOnInsert: {
        quotaBytes: StorageProviderConfig.DEFAULT_QUOTA_BYTES,
        usedBytes: 0,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

// A4 — VALIDATION DE COMPLÉTION DE SYNC. Après un upload vers un cloud PAR
// UTILISATEUR (OneDrive/Google Drive), on CONFIRME que le fichier est bien
// présent chez le fournisseur avant de committer les métadonnées. Pour le
// stockage interne (managed_gcs), l'écriture réussie vaut confirmation → on ne
// vérifie pas (pas de round-trip inutile).
//
// Sémantique volontaire :
//   - provider.exists() renvoie FALSE explicite  → fichier absent → on LÈVE
//     (l'appelant fait le rollback) ;
//   - provider.exists() LÈVE (réseau, jeton...)   → vérification inconclusive →
//     on NE bloque PAS un upload dont l'écriture a pourtant réussi.
async function assertUploadCompleted(provider, storageKey) {
  if (!provider || provider.perUser !== true || typeof provider.exists !== 'function') return;
  if (!storageKey) return;
  let exists;
  try {
    exists = await provider.exists({ storageKey });
  } catch (_err) {
    return; // inconclusif → ne pas bloquer
  }
  if (exists === false) {
    const err = new Error(
      "La synchronisation n'a pas pu être confirmée : le fichier est introuvable chez le fournisseur cloud.",
    );
    err.statusCode = 502;
    err.code = 'SYNC_NOT_CONFIRMED';
    throw err;
  }
}

module.exports = {
  getStorageProvider,
  getStorageProviderConfig,
  providers,
  resolveTenantId,
  selectStorageProvider,
  toTenantObjectId,
  assertUploadCompleted,
};
