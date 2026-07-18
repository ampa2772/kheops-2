import apiClient from '../../services/apiClient';

export async function createOfficeEngineSession(documentId, options = {}) {
  const { data } = await apiClient.get(
    `/api/office-engine/session/${encodeURIComponent(documentId)}`,
    options.signal ? { signal: options.signal } : undefined,
  );
  return data;
}
