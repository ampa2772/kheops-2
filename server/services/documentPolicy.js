const STORAGE_PROVIDERS=Object.freeze(['managed_gcs','google_drive','onedrive','sharepoint']);
const EDITOR_MODES=Object.freeze(['kheops','word_desktop','word_web','google_docs']);

// Keep the historical Tenant defaults identical for availability and transfer.
// Explicit cabinet restrictions always win; a missing legacy field is a default.
function normalizeDocumentPolicy(raw) {
  const plain=(typeof raw?.toObject==='function'?raw.toObject():raw)||{};
  return {
    allowPersonalClouds:plain.allowPersonalClouds!==false,
    requireProfessionalMicrosoftAccount:plain.requireProfessionalMicrosoftAccount===true,
    allowedProviders:Array.isArray(plain.allowedProviders)
      ? [...new Set(plain.allowedProviders.filter(value=>STORAGE_PROVIDERS.includes(value)))]:[...STORAGE_PROVIDERS],
    forceMethod:EDITOR_MODES.includes(plain.forceMethod)?plain.forceMethod:null,
    allowGoogleConversion:plain.allowGoogleConversion===true,
    requireKheopsVersion:plain.requireKheopsVersion!==false,
    deleteExternalCopyAfterSync:plain.deleteExternalCopyAfterSync===true,
    updatedAt:plain.updatedAt||null,
  };
}
module.exports={normalizeDocumentPolicy};
