import apiClient from '../../services/apiClient';

const prefix = '/api/document-editor';

export async function loadEditorDocument(documentId) {
  const { data } = await apiClient.get(`${prefix}/${encodeURIComponent(documentId)}`);
  return data;
}

export async function saveEditorDocument(documentId, payload) {
  const { data } = await apiClient.put(`${prefix}/${encodeURIComponent(documentId)}`, payload);
  return data;
}

export async function importEditorDocx(documentId, file, expectedRevision, baseVersionId) {
  const form = new FormData();
  form.append('file', file);
  if (expectedRevision !== undefined && expectedRevision !== null) form.append('expectedRevision', String(expectedRevision));
  if (baseVersionId) form.append('baseVersionId', String(baseVersionId));
  const { data } = await apiClient.post(`${prefix}/${encodeURIComponent(documentId)}/import`, form);
  return data;
}

export async function reloadEditorCanonical(documentId, expectedRevision, localDraft = null) {
  const { data } = await apiClient.post(
    `${prefix}/${encodeURIComponent(documentId)}/reload-canonical`,
    { expectedRevision, ...(localDraft ? { localDraft } : {}) },
  );
  return data;
}

export async function reconvertEditorOriginal(documentId, expectedRevision, localDraft = null) {
  const { data } = await apiClient.post(
    `${prefix}/${encodeURIComponent(documentId)}/reconvert-original`,
    { expectedRevision, ...(localDraft ? { localDraft } : {}) },
  );
  return data;
}

function filenameFromDisposition(value, fallback) {
  const match = String(value || '').match(/filename="?([^";]+)"?/i);
  return match ? match[1] : fallback;
}

export async function downloadEditorExport(documentId, format = 'docx') {
  const response = await apiClient.get(`${prefix}/${encodeURIComponent(documentId)}/export`, {
    params: { format },
    responseType: 'blob',
  });
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers['content-disposition'], `document.${format}`),
  };
}

export async function downloadEditorOriginal(documentId) {
  const response = await apiClient.get(`${prefix}/${encodeURIComponent(documentId)}/original`, { responseType: 'blob' });
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers['content-disposition'], 'document-original.docx'),
  };
}

export async function listDocumentTemplates(documentType = '') {
  const { data } = await apiClient.get(`${prefix}/templates`, { params: { documentType: documentType || undefined } });
  return data.templates || [];
}

export async function createDocumentTemplateVersion(templateKey, payload) {
  const path = templateKey
    ? `${prefix}/templates/${encodeURIComponent(templateKey)}/versions`
    : `${prefix}/templates`;
  const { data } = await apiClient.post(path, payload);
  return data.template;
}

export async function applyDocumentTemplate(documentId, payload) {
  const { data } = await apiClient.post(`${prefix}/${encodeURIComponent(documentId)}/template/apply`, payload);
  return data;
}

export async function getReferenceCandidates(documentId, params = {}) {
  const { data } = await apiClient.get(`${prefix}/${encodeURIComponent(documentId)}/reference-candidates`, { params });
  return data.candidates || [];
}

export async function listDocumentReferences(documentId) {
  const { data } = await apiClient.get(`${prefix}/${encodeURIComponent(documentId)}/references`);
  return data.references || [];
}

export async function createDocumentReference(documentId, payload) {
  const { data } = await apiClient.post(`${prefix}/${encodeURIComponent(documentId)}/references`, payload);
  return data;
}

export async function openDocumentReference(documentId, referenceId) {
  const { data } = await apiClient.get(`${prefix}/${encodeURIComponent(documentId)}/references/${encodeURIComponent(referenceId)}/open`);
  return data;
}

export async function updateDocumentReference(documentId, referenceId, patch) {
  const { data } = await apiClient.patch(
    `${prefix}/${encodeURIComponent(documentId)}/references/${encodeURIComponent(referenceId)}`,
    patch,
  );
  return data;
}

export async function deleteDocumentReference(documentId, referenceId) {
  const { data } = await apiClient.delete(`${prefix}/${encodeURIComponent(documentId)}/references/${encodeURIComponent(referenceId)}`);
  return data;
}

export async function listDocumentComments(documentId, status) {
  const { data } = await apiClient.get(`${prefix}/${encodeURIComponent(documentId)}/comments`, { params: { status: status || undefined } });
  return data.comments || [];
}

export async function createDocumentComment(documentId, payload) {
  const { data } = await apiClient.post(`${prefix}/${encodeURIComponent(documentId)}/comments`, payload);
  return data.comment;
}

export async function updateDocumentComment(documentId, commentId, patch) {
  const { data } = await apiClient.patch(`${prefix}/${encodeURIComponent(documentId)}/comments/${encodeURIComponent(commentId)}`, patch);
  return data.comment;
}

export async function getEditorDocumentHistory(documentId) {
  const { data } = await apiClient.get(`/api/document-history/${encodeURIComponent(documentId)}`);
  return data.history;
}

export async function restoreEditorDocumentVersion(documentId, versionId, operationKey) {
  const { data } = await apiClient.post(
    `/api/document-history/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/restore`,
    { operationKey },
    { headers: operationKey ? { 'Idempotency-Key': operationKey } : undefined },
  );
  return data;
}

export async function prepareDocumentPublication(documentId, payload, operationKey) {
  const { data } = await apiClient.post(
    `${prefix}/${encodeURIComponent(documentId)}/publications/prepare`,
    { ...payload, operationKey },
    { headers: operationKey ? { 'Idempotency-Key': operationKey } : undefined },
  );
  return data;
}

export function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
