const crypto = require('crypto');
const microsoftGraphMail = require('../../../utils/microsoftGraphMail');
const {
  normalizeRecipients,
  stripHtml,
  sanitizeArchivedHtml,
  messageFingerprint,
} = require('../messageNormalization');

function graphRecipient(recipient) {
  return { emailAddress: { name: recipient.name || undefined, address: recipient.email } };
}

function normalizeMessage(data, account, folderKey = 'inbox') {
  const bodyHtml = data.body?.contentType?.toLowerCase() === 'html' ? data.body?.content || '' : '';
  const bodyText = data.body?.contentType?.toLowerCase() === 'text'
    ? data.body?.content || ''
    : stripHtml(bodyHtml || data.bodyPreview || '');
  const internetHeaders = new Map((data.internetMessageHeaders || []).map((header) => [String(header.name || '').toLowerCase(), header.value]));
  const sentAt = data.sentDateTime ? new Date(data.sentDateTime) : null;
  const receivedAt = data.receivedDateTime ? new Date(data.receivedDateTime) : sentAt;
  const message = {
    tenantId: account.tenantId,
    accountId: account._id,
    ownerUserId: account.ownerUserId,
    provider: 'microsoft',
    providerMessageId: String(data.id),
    internetMessageId: data.internetMessageId || internetHeaders.get('message-id') || null,
    providerThreadId: data.conversationId || null,
    folderKey,
    labels: data.categories || [],
    from: data.from?.emailAddress?.address || data.sender?.emailAddress?.address || '',
    to: normalizeRecipients(data.toRecipients || []).map((item) => item.email),
    cc: normalizeRecipients(data.ccRecipients || []).map((item) => item.email),
    bcc: normalizeRecipients(data.bccRecipients || []).map((item) => item.email),
    subject: data.subject || '',
    bodyText: String(bodyText).slice(0, 2000000),
    bodyHtml: sanitizeArchivedHtml(bodyHtml),
    receivedAt,
    sentAt,
    providerUpdatedAt: data.lastModifiedDateTime ? new Date(data.lastModifiedDateTime) : receivedAt,
    isRead: data.isRead === true,
    isDeleted: false,
    attachments: (data.attachments || []).filter((item) => !item.isInline).map((item) => ({
      providerAttachmentId: item.id || null,
      filename: item.name || '',
      mime: item.contentType || 'application/octet-stream',
      size: Number(item.size || 0),
      inline: false,
    })),
    lastSyncedAt: new Date(),
  };
  message.deduplicationFingerprint = messageFingerprint(message);
  return message;
}

class MicrosoftMailProvider {
  constructor({ userId, refreshToken = null, onRefreshToken = null }) {
    this.userId = userId;
    this.refreshToken = refreshToken;
    this.onRefreshToken = onRefreshToken;
    this.token = null;
  }

  async graphCall(method, path, options = {}, retry = true) {
    if (!this.refreshToken) {
      return microsoftGraphMail._graphCall(this.userId, method, path, options);
    }
    if (!this.token || Date.now() >= this.token.expiresAt) {
      const fresh = await microsoftGraphMail._refresh(this.refreshToken);
      this.token = fresh;
      if (fresh.refreshToken && fresh.refreshToken !== this.refreshToken) {
        this.refreshToken = fresh.refreshToken;
        await this.onRefreshToken?.(fresh.refreshToken);
      }
    }
    const axios = require('axios');
    const url = String(path).startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`;
    try {
      return await axios({
        method,
        url,
        params: options.params,
        data: options.data,
        responseType: options.responseType,
        timeout: 30000,
        headers: {
          Authorization: `Bearer ${this.token.accessToken}`,
          ...(options.headers || {}),
        },
      });
    } catch (error) {
      if (retry && error?.response?.status === 401) {
        this.token = null;
        return this.graphCall(method, path, options, false);
      }
      throw error;
    }
  }

  async test() {
    const response = await this.graphCall('get', '/me', {
      params: { $select: 'id,displayName,mail,userPrincipalName' },
    });
    return response.data;
  }

  async listSyncFolders() {
    const response = await this.graphCall('get', '/me/mailFolders', {
      params: {
        includeHiddenFolders: 'true',
        $top: 100,
        $select: 'id,displayName,parentFolderId',
      },
      headers: { Prefer: 'IdType="ImmutableId"' },
    });
    const ids = (response.data.value || []).map((folder) => folder.id).filter(Boolean);
    return ids.length ? [...new Set(ids)] : ['inbox', 'sentitems'];
  }

  async getAttachmentMetadata(messageId) {
    const response = await this.graphCall('get', `/me/messages/${encodeURIComponent(messageId)}/attachments`, {
      params: { $select: 'id,name,contentType,size,isInline' },
      headers: { Prefer: 'IdType="ImmutableId"' },
    });
    return (response.data.value || []).map((item) => ({
      providerAttachmentId: item.id || null,
      filename: item.name || '',
      mime: item.contentType || 'application/octet-stream',
      size: Number(item.size || 0),
      inline: item.isInline === true,
    }));
  }

  async downloadAttachment(messageId, attachmentId) {
    const response = await this.graphCall('get', `/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`, {
      params: { $select: 'id,name,contentType,size,isInline,contentBytes' },
      headers: { Prefer: 'IdType="ImmutableId"' },
    });
    if (!response.data.contentBytes) {
      const error = new Error('Cette pièce jointe Microsoft ne peut pas être téléchargée comme fichier simple.');
      error.code = 'MAIL_ATTACHMENT_KIND_UNSUPPORTED';
      error.statusCode = 409;
      throw error;
    }
    return Buffer.from(response.data.contentBytes, 'base64');
  }

  async sync({ account, cursor = null, continuation = null, folderKey = 'inbox', pageSize = 100 }) {
    const select = 'id,internetMessageId,conversationId,subject,body,bodyPreview,from,sender,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,lastModifiedDateTime,isRead,hasAttachments,categories';
    const path = continuation || cursor || `/me/mailFolders/${encodeURIComponent(folderKey)}/messages/delta`;
    const response = await this.graphCall('get', path, {
      params: (!continuation && !cursor) ? { $select: select, $top: Math.max(1, Math.min(250, Number(pageSize || 100))) } : undefined,
      headers: { Prefer: 'IdType="ImmutableId"' },
    });
    const messages = [];
    const deletedProviderIds = [];
    for (const item of response.data.value || []) {
      if (item['@removed']) deletedProviderIds.push(item.id);
      else {
        const normalized = normalizeMessage(item, account, folderKey);
        if (item.hasAttachments) {
          normalized.attachments = await this.getAttachmentMetadata(item.id);
        }
        messages.push(normalized);
      }
    }
    return {
      messages,
      deletedProviderIds,
      continuation: response.data['@odata.nextLink'] || null,
      cursor: response.data['@odata.deltaLink'] || cursor || null,
    };
  }

  initialSync(options) { return this.sync({ ...options, cursor: null }); }
  incrementalSync(options) { return this.sync(options); }

  async send(operation, attachmentBuffers = []) {
    const message = {
      subject: operation.subject || '',
      body: {
        contentType: operation.bodyHtml ? 'HTML' : 'Text',
        content: operation.bodyHtml || operation.bodyText || '',
      },
      toRecipients: (operation.to || []).map(graphRecipient),
      ccRecipients: (operation.cc || []).map(graphRecipient),
      bccRecipients: (operation.bcc || []).map(graphRecipient),
      internetMessageHeaders: [
        { name: 'X-Kheops-Idempotency', value: operation.idempotencyKey },
      ],
      attachments: attachmentBuffers.map((item) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: item.filename,
        contentType: item.mime,
        contentBytes: item.buffer.toString('base64'),
      })),
    };
    const draft = await this.graphCall('post', '/me/messages', {
      data: message,
      headers: { Prefer: 'IdType="ImmutableId"' },
    });
    await this.graphCall('post', `/me/messages/${encodeURIComponent(draft.data.id)}/send`, {
      headers: { Prefer: 'IdType="ImmutableId"' },
    });
    return {
      providerMessageId: draft.data.id || null,
      providerThreadId: draft.data.conversationId || null,
      providerStatus: 'accepted',
    };
  }

  async findSentOperation(operation) {
    const key = String(operation?.idempotencyKey || '');
    if (!key) return null;
    const since = new Date(operation?.createdAt || Date.now() - 7 * 24 * 60 * 60 * 1000);
    since.setUTCDate(since.getUTCDate() - 1);
    const response = await this.graphCall('get', '/me/mailFolders/sentitems/messages', {
      params: {
        $filter: `sentDateTime ge ${since.toISOString()}`,
        $orderby: 'sentDateTime desc',
        $select: 'id,conversationId,internetMessageId,internetMessageHeaders,sentDateTime',
        $top: 100,
      },
      headers: { Prefer: 'IdType="ImmutableId"' },
    });
    const first = (response.data.value || []).find((message) => (
      message.internetMessageHeaders || []
    ).some((header) => (
      String(header.name || '').toLowerCase() === 'x-kheops-idempotency'
      && String(header.value || '') === key
    )));
    if (!first) return null;
    return {
      providerMessageId: first.id,
      providerThreadId: first.conversationId || null,
      providerStatus: 'reconciled',
    };
  }

  async createSubscription({ notificationUrl, lifecycleNotificationUrl, resource = '/me/messages', expiresAt, clientState }) {
    if (!notificationUrl) throw Object.assign(new Error('URL de notification Microsoft non configurée.'), { code: 'GRAPH_WEBHOOK_MISSING' });
    const expirationDateTime = (expiresAt || new Date(Date.now() + 55 * 60 * 1000)).toISOString();
    const response = await this.graphCall('post', '/subscriptions', {
      data: {
        changeType: 'created,updated,deleted',
        notificationUrl,
        lifecycleNotificationUrl: lifecycleNotificationUrl || undefined,
        resource,
        expirationDateTime,
        clientState,
      },
    });
    return {
      providerSubscriptionId: response.data.id,
      resource: response.data.resource || resource,
      expiresAt: new Date(response.data.expirationDateTime || expirationDateTime),
      clientStateHash: crypto.createHash('sha256').update(clientState).digest('hex'),
    };
  }

  async renewSubscription(subscriptionId, expiresAt) {
    const response = await this.graphCall('patch', `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      data: { expirationDateTime: expiresAt.toISOString() },
    });
    return { expiresAt: new Date(response.data.expirationDateTime || expiresAt) };
  }
}

module.exports = { MicrosoftMailProvider, normalizeMessage };
