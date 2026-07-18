import apiClient from './apiClient';

function data(response) {
  return response?.data?.data || response?.data || response;
}

export async function listRelations(params) {
  const payload = data(await apiClient.get('/api/relations', { params }));
  return payload?.relations || [];
}

export async function getRelationHistory(logicalRelationId) {
  const payload = data(await apiClient.get(`/api/relations/${encodeURIComponent(logicalRelationId)}/history`));
  return payload?.revisions || [];
}

export async function archiveRelation(logicalRelationId, note = '') {
  return data(await apiClient.post(`/api/relations/${encodeURIComponent(logicalRelationId)}/archive`, {
    idempotencyKey: `ui-archive:${logicalRelationId}:${Date.now()}`,
    note,
  }));
}

export async function createRelation(input) {
  return data(await apiClient.post('/api/relations', input));
}

const relationClient = { archiveRelation, createRelation, getRelationHistory, listRelations };
export default relationClient;
