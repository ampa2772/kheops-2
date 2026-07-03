import apiClient from './apiClient';

export const mailAccountService = {
  async listPresets() {
    const { data } = await apiClient.get('/api/mail/presets');
    return data.presets || [];
  },

  async listAccounts() {
    const { data } = await apiClient.get('/api/mail/accounts');
    return data.accounts || [];
  },

  async createAccount(payload) {
    const { data } = await apiClient.post('/api/mail/accounts', payload);
    return data;
  },

  async testImap(accountId) {
    const { data } = await apiClient.post(`/api/mail/accounts/${accountId}/test-imap`);
    return data;
  },

  async testSmtp(accountId) {
    const { data } = await apiClient.post(`/api/mail/accounts/${accountId}/test-smtp`);
    return data;
  },

  async listFolders(accountId) {
    const { data } = await apiClient.get(`/api/mail/accounts/${accountId}/folders`);
    return data.folders || [];
  },

  async listMessages(accountId, { folder = 'INBOX', page = 1, pageSize = 20, since } = {}) {
    const params = new URLSearchParams({
      folder,
      page: String(page),
      pageSize: String(pageSize),
    });
    if (since) params.set('since', since);
    const { data } = await apiClient.get(`/api/mail/accounts/${accountId}/messages?${params.toString()}`);
    return data;
  },

  async getMessage(messageId) {
    const { data } = await apiClient.get(`/api/mail/messages/${encodeURIComponent(messageId)}`);
    return data.message || data;
  },

  async downloadAttachment(messageId, attachmentIndex) {
    return apiClient.get(
      `/api/mail/messages/${encodeURIComponent(messageId)}/attachments/${attachmentIndex}`,
      { responseType: 'blob' },
    );
  },

  // Contenu brut d'une PJ IMAP pour l'APERÇU inline (ArrayBuffer). Même route
  // que le téléchargement : pour un fetch en mémoire, le Content-Disposition
  // du serveur est sans effet — seul le Content-Type (correct) compte.
  async getAttachmentContent(messageId, attachmentIndex) {
    return apiClient.get(
      `/api/mail/messages/${encodeURIComponent(messageId)}/attachments/${attachmentIndex}`,
      { responseType: 'arraybuffer' },
    );
  },

  async sendMail(payload) {
    const { data } = await apiClient.post('/api/mail/send', payload);
    return data;
  },
};

export default mailAccountService;
