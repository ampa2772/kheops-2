import apiClient from './apiClient';

export async function openExternalDocument(docId, method, options = {}) {
  const { data } = await apiClient.post(`/api/external-edit/${encodeURIComponent(docId)}/open`, {
    method,
    consentExternalTransfer: options.consentExternalTransfer === true,
    keepRemoteCopy: options.keepRemoteCopy !== false,
    convertToGoogle: options.convertToGoogle === true,
  });
  return data;
}

export async function listExternalSessions(docId) {
  const { data } = await apiClient.get(`/api/external-edit/${encodeURIComponent(docId)}/sessions`);
  return data.sessions || [];
}

export async function getExternalSessionStatus(sessionId, { localOnly = false } = {}) {
  const { data } = await apiClient.get(`/api/external-edit/sessions/${encodeURIComponent(sessionId)}/status`, {
    params: { localOnly },
  });
  return data;
}

export async function setExternalAutomaticSync(sessionId, enabled) {
  const {data}=await apiClient.patch(`/api/external-edit/sessions/${encodeURIComponent(sessionId)}/automatic`,{enabled});
  return data;
}

export async function syncExternalSession(sessionId, options = {}) {
  const { data } = await apiClient.post(`/api/external-edit/sessions/${encodeURIComponent(sessionId)}/sync`, {
    comment: options.comment || '',
    status: options.status || 'draft',
  });
  return data;
}

export async function closeExternalSession(sessionId, { deleteRemote = false } = {}) {
  const { data } = await apiClient.delete(`/api/external-edit/sessions/${encodeURIComponent(sessionId)}`, {
    params: { deleteRemote },
  });
  return data;
}

export async function getDocumentCompatibility(docId) {
  const { data } = await apiClient.get(`/api/external-edit/${encodeURIComponent(docId)}/compatibility`);
  return data.compatibility;
}

export async function getDocumentHistory(docId) {
  const { data } = await apiClient.get(`/api/document-history/${encodeURIComponent(docId)}`);
  return data.history;
}

export function documentHistoryDownloadUrl(docId, versionId) {
  return `/api/document-history/${encodeURIComponent(docId)}/versions/${encodeURIComponent(versionId)}/download`;
}

export async function downloadDocumentHistoryVersion(docId, version) {
  const response = await apiClient.get(documentHistoryDownloadUrl(docId, version.versionId), {
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = version.filename || 'document.docx';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 4000);
}

export async function promoteDocumentVersion(docId, versionId, operationKey) {
  const key = operationKey || (window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `promote-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const { data } = await apiClient.post(
    `/api/document-history/${encodeURIComponent(docId)}/versions/${encodeURIComponent(versionId)}/promote`,
    { operationKey: key },
    { headers: { 'Idempotency-Key': key } },
  );
  return data.history;
}

export async function restoreDocumentVersion(docId, versionId, operationKey) {
  const key = operationKey || (window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `restore-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const { data } = await apiClient.post(
    `/api/document-history/${encodeURIComponent(docId)}/versions/${encodeURIComponent(versionId)}/restore`,
    { operationKey: key },
    { headers: { 'Idempotency-Key': key } },
  );
  return data;
}
