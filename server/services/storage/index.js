const mongoose = require('mongoose');
const StorageProviderConfig = require('../../models/Storage/StorageProviderConfig');
const User = require('../../models/App_Users/User');
const managedGcs = require('./providers/managedGcs');
const googleDrive = require('./providers/googleDrive');
const onedrive = require('./providers/onedrive');
const sharepoint = require('./providers/sharepoint');

const providers = {
  managed_gcs: managedGcs,
  google_drive: googleDrive,
  onedrive,
  sharepoint,
};

// Correspondance schema de storageKey -> provider. Les providers PAR UTILISATEUR
// prefixent leur cle (onedrive:/googledrive:/sharepoint:). managed_gcs utilise un
// chemin « tenants/... » sans prefixe.
const KEY_SCHEME_TO_PROVIDER = {
  onedrive: 'onedrive',
  googledrive: 'google_drive',
  sharepoint: 'sharepoint',
};

function providerNameForKey(storageKey) {
  const s = String(storageKey || '');
  const colon = s.indexOf(':');
  if (colon > 0) {
    const scheme = s.slice(0, colon);
    if (KEY_SCHEME_TO_PROVIDER[scheme]) return KEY_SCHEME_TO_PROVIDER[scheme];
  }
  return null; // cle « chemin » (managed_gcs) -> provider du cabinet
}

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

// Provider a utiliser pour DOWNLOAD/DELETE/EXISTS : deduit du storageKey lui-meme
// (auto-suffisant), pas du provider courant du cabinet. Robustesse : un document
// reste lisible meme si le cabinet a change de provider depuis, et le stockage
// PAR UTILISATEUR mixte (certains sur SharePoint, d'autres non) fonctionne.
async function getProviderForStorageKey(tenantId, storageKey) {
  const name = providerNameForKey(storageKey);
  if (name && providers[name]) return providers[name];
  return getStorageProvider(tenantId);
}

// Provider a utiliser pour un UPLOAD par CET utilisateur. Volet B : si
// l'utilisateur a active SON PROPRE SharePoint (User.sharePoint.enabled + driveId),
// ses documents y sont ranges — quel que soit le provider du cabinet. Sinon on
// retombe sur le provider du cabinet (OneDrive perso / managed_gcs / Google Drive).
async function getUploadProvider(tenantId, ownerUserId) {
  if (ownerUserId) {
    try {
      const user = await User.findById(ownerUserId).select('sharePoint').lean();
      if (user?.sharePoint?.enabled && user.sharePoint.driveId) {
        return providers.sharepoint;
      }
    } catch (_) { /* repli silencieux sur le provider du cabinet */ }
  }
  return getStorageProvider(tenantId);
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
  getProviderForStorageKey,
  getUploadProvider,
  providerNameForKey,
  providers,
  resolveTenantId,
  selectStorageProvider,
  toTenantObjectId,
  assertUploadCompleted,
};
