import apiClient from './apiClient';

const prefix = '/api/mail-sync';

export const listMailAccounts = async (options = {}) => {
  const { data } = await apiClient.get(`${prefix}/accounts`, {
    params: options.includeDisabled ? { includeDisabled: true } : undefined,
  });
  return data?.accounts || [];
};

export const setDefaultMailAccount = async (accountId) => {
  const { data } = await apiClient.put(`${prefix}/accounts/${encodeURIComponent(accountId)}/default`);
  return data?.account;
};

export const testMailAccount = async (accountId) => {
  const { data } = await apiClient.post(`${prefix}/accounts/${encodeURIComponent(accountId)}/test`);
  return data;
};

export const synchronizeMailAccount = async (accountId, { forceFull = false, idempotencyKey } = {}) => {
  const { data } = await apiClient.post(
    `${prefix}/accounts/${encodeURIComponent(accountId)}/sync`,
    { forceFull, idempotencyKey },
    idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined,
  );
  return data;
};

export const renewMailSubscription = async (accountId) => {
  const { data } = await apiClient.post(`${prefix}/accounts/${encodeURIComponent(accountId)}/subscription`);
  return data?.subscription;
};

export const getMailAccountHealth = async (accountId) => {
  const { data } = await apiClient.get(`${prefix}/accounts/${encodeURIComponent(accountId)}/health`);
  return data;
};

export const disconnectMailAccount = async (accountId) => {
  const { data } = await apiClient.delete(`${prefix}/accounts/${encodeURIComponent(accountId)}`);
  return data;
};

export const getMailAccountConnectUrl = async (provider) => {
  if (!['google', 'microsoft'].includes(provider)) throw new Error('Fournisseur de messagerie inconnu.');
  const { data } = await apiClient.post(`/api/auth/${provider}/mail-connect-url`);
  if (!data?.authorizationUrl) throw new Error("L'adresse de connexion n'a pas été fournie.");
  return data.authorizationUrl;
};

export const listArchivedMessages = async (params = {}) => {
  const { data } = await apiClient.get(`${prefix}/messages`, { params });
  return data;
};

export const getArchivedMessage = async (messageId) => {
  const { data } = await apiClient.get(`${prefix}/messages/${encodeURIComponent(messageId)}`);
  return data;
};

const filenameFromDisposition = (value, fallback = 'piece-jointe') => {
  const header = String(value || '');
  const utf8 = header.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
  if (utf8?.[1]) {
    try { return decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, '')); } catch (_error) {}
  }
  const quoted = header.match(/filename="([^"]+)"/i);
  const plain = header.match(/filename=([^;]+)/i);
  return (quoted?.[1] || plain?.[1] || fallback).trim().replace(/^"|"$/g, '');
};

export const downloadArchivedAttachment = async (messageId, index) => {
  const response = await apiClient.get(
    `${prefix}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(index)}`,
    { responseType: 'blob' },
  );
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition']),
    mime: response.headers?.['content-type'] || response.data?.type || 'application/octet-stream',
  };
};

export const triggerMailAttachmentDownload = ({ blob, filename }) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'piece-jointe';
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const contactCandidates = (data = {}) => [
  ...(data.physiques || []).map((contact) => ({
    id: String(contact._id),
    kind: 'person',
    displayName: [contact.prenoms, contact.nom].filter(Boolean).join(' ') || 'Contact',
    email: contact.email || '',
  })),
  ...(data.organisationsPrivees || []).map((contact) => ({
    id: String(contact._id),
    kind: 'organization',
    displayName: contact.raisonSociale || 'Organisation',
    email: contact.emailEntreprise || '',
  })),
  ...(data.organisationsPubliques || []).map((contact) => ({
    id: String(contact._id),
    kind: 'public_organization',
    displayName: contact.denomination || 'Organisme public',
    email: contact.email || contact.contactEmail || '',
  })),
];

export const listMailMatterCandidates = async () => {
  const [dossiersResponse, contactsResponse] = await Promise.all([
    apiClient.get('/api/folder/last-25-dossiers', { params: { limit: 500 } }),
    apiClient.get('/api/folder/contacts'),
  ]);
  return {
    dossiers: (dossiersResponse.data || []).map((dossier) => ({
      id: String(dossier._id || dossier.id),
      reference: dossier.reference || '',
      name: dossier.dossier?.dossier?.nom || dossier.nom || '',
    })),
    contacts: contactCandidates(contactsResponse.data),
  };
};

export const sendArchivedMessage = async (payload) => {
  const idempotencyKey = payload?.idempotencyKey;
  const { data } = await apiClient.post(`${prefix}/messages/send`, payload, {
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  });
  return data;
};

export const sendDocumentByEmail = async (documentId, payload) => {
  const idempotencyKey = payload?.idempotencyKey;
  const { data } = await apiClient.post(
    `/api/documents/${encodeURIComponent(documentId)}/send-by-email`,
    payload,
    { headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined },
  );
  return data;
};

export const getMailSendOperation = async (operationId) => {
  const { data } = await apiClient.get(`${prefix}/send-operations/${encodeURIComponent(operationId)}`);
  return data?.operation;
};

export const linkArchivedMessageToMatter = async (messageId, payload) => {
  const { data } = await apiClient.post(
    `${prefix}/messages/${encodeURIComponent(messageId)}/link-to-matter`,
    payload,
  );
  return data?.link;
};

const mailSyncClient = {
  listAccounts: listMailAccounts,
  setDefaultAccount: setDefaultMailAccount,
  testAccount: testMailAccount,
  synchronizeAccount: synchronizeMailAccount,
  renewSubscription: renewMailSubscription,
  getAccountHealth: getMailAccountHealth,
  disconnectAccount: disconnectMailAccount,
  getConnectUrl: getMailAccountConnectUrl,
  listMessages: listArchivedMessages,
  getMessage: getArchivedMessage,
  downloadAttachment: downloadArchivedAttachment,
  triggerAttachmentDownload: triggerMailAttachmentDownload,
  listMatterCandidates: listMailMatterCandidates,
  sendMessage: sendArchivedMessage,
  sendDocumentMessage: sendDocumentByEmail,
  getSendOperation: getMailSendOperation,
  linkMessageToMatter: linkArchivedMessageToMatter,
};

export default mailSyncClient;
