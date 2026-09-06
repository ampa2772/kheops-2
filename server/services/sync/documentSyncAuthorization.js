const mongoose = require('mongoose');
const LogicalDocument = require('../../models/Documents/LogicalDocument');
const DocumentLocation = require('../../models/Documents/DocumentLocation');
const StoredDocument = require('../../models/Storage/StoredDocument');
const DocumentHistory = require('../../models/Storage/DocumentHistory');
const Dossier = require('../../models/Folder/Dossier');
const access = require('./documentSyncAccess');

function denied(message = 'Le fichier ne correspond pas au document autorisé.') {
  return Object.assign(new Error(message), { statusCode: 403, code: 'SYNC_STORAGE_SCOPE_DENIED' });
}

function makeDocumentSyncAuthorization({
  Logical = LogicalDocument, Location = DocumentLocation, Stored = StoredDocument,
  History = DocumentHistory, DossierModel = Dossier, dossierAccess = access.assertDossierAccess,
} = {}) {
  async function assertStorageReference({ tenantId, logicalDocumentId, userId, storageKey }) {
    const key = String(storageKey || '');
    if (!key || key.includes('\\') || /(^|\/)\.\.?($|\/)/.test(key)) throw denied();
    const logical = await Logical.findOne({ _id: logicalDocumentId, tenantId }).lean();
    if (!logical || logical.status === 'archived') throw denied();
    await dossierAccess({ tenantId, userId, dossierId: logical.dossierId });
    // Cette attestation est uniquement écrite par les services après vérification,
    // jamais depuis un champ fourni par les routes publiques.
    const verified = await Location.exists({
      tenantId, logicalDocumentId, storageKey: key, verifiedStorageKey: key,
      storageVerifiedAt: { $type: 'date' }, state: { $nin: ['revoked', 'deleted'] },
    });
    if (verified) return { logical, storageKey: key };
    const ids = (logical.aliases || [])
      .filter(a => ['legacy-dossier-document', 'legacy-stored-document'].includes(a.system))
      .map(a => String(a.externalId || '')).filter(value => mongoose.Types.ObjectId.isValid(value));
    for (const documentId of ids) {
      const embedded = await DossierModel.exists({ _id: logical.dossierId, tenantId, 'dossier.documents._id': documentId });
      if (!embedded) continue;
      const scope = { tenantId, dossierId: logical.dossierId, documentId };
      const [stored, history] = await Promise.all([
        Stored.exists({ ...scope, deletedAt: null, 'versions.storageKey': key }),
        History.exists({ ...scope, 'versions.storageKey': key }),
      ]);
      if (stored || history) return { logical, storageKey: key };
      const prefixes = [
        `tenants/${tenantId}/dossiers/${logical.dossierId}/documents/${documentId}`,
        `tenants/${tenantId}/documents/${documentId}`, `documents/${documentId}`,
      ];
      if (prefixes.some(prefix => ['.docx', '.doc', '.txt'].some(ext => key === prefix + ext))) {
        return { logical, storageKey: key };
      }
    }
    throw denied();
  }
  async function assertDestination({ tenantId, logicalDocumentId, userId, location }) {
    const logical = await Logical.findOne({ _id: logicalDocumentId, tenantId }).lean();
    if (!logical || logical.status === 'archived') throw denied();
    await dossierAccess({ tenantId, userId, dossierId: logical.dossierId });
    if (['revoked', 'deleted'].includes(location.state)) throw denied('Cet emplacement a été révoqué.');
    const providerName = location.provider === 'canonical' ? 'managed_gcs' : location.provider;
    if (providerName === 'managed_gcs') {
      if (location.accountRef || location.containerId) throw denied('La destination interne ne doit pas désigner un autre compte ou conteneur.');
      return { providerName, ownerUserId: userId, containerId: '' };
    }
    if (!['google_drive', 'onedrive', 'sharepoint'].includes(providerName)) throw denied('Destination non prise en charge.');
    const ownerUserId = String(location.accountRef || '');
    if (!mongoose.Types.ObjectId.isValid(ownerUserId) || ownerUserId !== String(location.createdBy)) {
      throw denied('Le compte de destination doit être celui qui a enregistré cet emplacement.');
    }
    await dossierAccess({ tenantId, userId: ownerUserId, dossierId: logical.dossierId });
    if (!location.containerId) throw denied('Sélectionnez un conteneur cloud explicite avant le transfert.');
    return { providerName, ownerUserId, containerId: String(location.containerId) };
  }
  return { assertStorageReference, assertDestination };
}

module.exports = { denied, makeDocumentSyncAuthorization, ...makeDocumentSyncAuthorization() };
