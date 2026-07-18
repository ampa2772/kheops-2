import apiClient from './apiClient';

function data(response) {
  return response?.data?.data || response?.data || response;
}

export async function resolveLogicalDocument({ dossierId, externalId, system = 'legacy-dossier-document' }) {
  const payload = data(await apiClient.get('/api/document-sync/documents/resolve', {
    params: { dossierId, system, externalId },
  }));
  return payload?.document || payload;
}

export async function registerLogicalDocument({ dossierId, document }) {
  const id = document?._id || document?.documentId;
  const payload = data(await apiClient.post('/api/document-sync/documents', {
    dossierId,
    title: document?.nomDocument || document?.title || 'Document sans titre',
    identityKey: `legacy-document:${id}`,
    preferredMime: document?.mime || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    documentType: document?.categorie || 'document',
    aliases: [
      { system: 'legacy-dossier-document', externalId: id },
      { system: 'dossier_embedded_document', externalId: id },
    ],
    provenance: {
      source: 'migration',
      sourceCollection: 'Dossier.dossier.documents',
      sourceId: id,
      originalFilename: document?.nomDocument || '',
    },
    idempotencyKey: `ui-logical-document:${dossierId}:${id}`,
  }));
  return payload?.document || payload;
}

export async function getLogicalDocumentGraph(logicalDocumentId) {
  return data(await apiClient.get(`/api/document-sync/documents/${encodeURIComponent(logicalDocumentId)}`));
}

export async function listSyncOperations(logicalDocumentId, params = {}) {
  const payload = data(await apiClient.get('/api/document-sync/operations', {
    params: { logicalDocumentId, limit: 50, ...params },
  }));
  return payload?.operations || [];
}

export async function resolveSyncConflict(operationId, resolution, note = '') {
  return data(await apiClient.post(`/api/document-sync/operations/${encodeURIComponent(operationId)}/resolve`, { resolution, note }));
}

export async function resumeSyncOperation(operationId) {
  return data(await apiClient.post(`/api/document-sync/operations/${encodeURIComponent(operationId)}/resume`, {}));
}

const documentSyncClient = {
  getLogicalDocumentGraph,
  listSyncOperations,
  registerLogicalDocument,
  resolveLogicalDocument,
  resolveSyncConflict,
  resumeSyncOperation,
};

export default documentSyncClient;
