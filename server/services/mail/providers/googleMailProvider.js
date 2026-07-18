// Le client généré `@googleapis/gmail` s'appuie sur la version de
// google-auth-library embarquée par `googleapis-common`. Employer le même
// OAuth2Client évite qu'un client d'une autre version ne soit ignoré et que
// Gmail réponde « Login Required » malgré un jeton valide.
const { OAuth2Client } = require('googleapis-common');
const { gmail: gmailApi } = require('@googleapis/gmail');
const MailComposer = require('nodemailer/lib/mail-composer');
const {
  normalizeRecipients,
  stripHtml,
  sanitizeArchivedHtml,
  messageFingerprint,
} = require('../messageNormalization');

const MESSAGE_FETCH_CONCURRENCY = 10;
const AUTH_REFRESH_COOLDOWN_MS = 10 * 1000;

function decodeBase64Url(value) {
  if (!value) return '';
  return Buffer.from(String(value).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function headerMap(headers = []) {
  return new Map(headers.map((header) => [String(header.name || '').toLowerCase(), String(header.value || '')]));
}

function readBody(payload = {}) {
  const result = { text: '', html: '', attachments: [] };
  const visit = (part) => {
    const disposition = headerMap(part.headers).get('content-disposition') || '';
    if (part.filename && part.body?.attachmentId) {
      result.attachments.push({
        providerAttachmentId: part.body.attachmentId,
        filename: part.filename,
        mime: part.mimeType || 'application/octet-stream',
        size: Number(part.body.size || 0),
        inline: /inline/i.test(disposition),
      });
      return;
    }
    const decoded = decodeBase64Url(part.body?.data);
    if (decoded && part.mimeType === 'text/plain' && !result.text) result.text = decoded;
    if (decoded && part.mimeType === 'text/html' && !result.html) result.html = decoded;
    (part.parts || []).forEach(visit);
  };
  visit(payload);
  return result;
}

function normalizeMessage(data, account) {
  const headers = headerMap(data.payload?.headers || []);
  const body = readBody(data.payload || {});
  const sentAt = new Date(Number(data.internalDate || Date.now()));
  const message = {
    tenantId: account.tenantId,
    accountId: account._id,
    ownerUserId: account.ownerUserId,
    provider: 'google',
    providerMessageId: String(data.id),
    internetMessageId: headers.get('message-id') || null,
    providerThreadId: data.threadId || null,
    folderKey: (data.labelIds || []).includes('SENT') ? 'sent' : 'inbox',
    labels: data.labelIds || [],
    from: headers.get('from') || '',
    to: normalizeRecipients(headers.get('to')).map((item) => item.email),
    cc: normalizeRecipients(headers.get('cc')).map((item) => item.email),
    bcc: normalizeRecipients(headers.get('bcc')).map((item) => item.email),
    subject: headers.get('subject') || '',
    bodyText: String(body.text || stripHtml(body.html)).slice(0, 2000000),
    bodyHtml: sanitizeArchivedHtml(body.html),
    receivedAt: sentAt,
    sentAt,
    providerUpdatedAt: sentAt,
    isRead: !(data.labelIds || []).includes('UNREAD'),
    isDeleted: false,
    attachments: body.attachments,
    lastSyncedAt: new Date(),
  };
  message.deduplicationFingerprint = messageFingerprint(message);
  return message;
}

class GoogleMailProvider {
  constructor({ refreshToken }) {
    const auth = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_CALLBACK_URL,
    );
    auth.setCredentials({ refresh_token: refreshToken });
    auth.forceRefreshOnFailure = true;
    this.auth = auth;
    this.refreshToken = refreshToken;
    this.authenticationPromise = null;
    this.authRefreshPromise = null;
    this.lastForcedRefreshAt = 0;
    this.gmail = gmailApi({ version: 'v1', auth });
  }

  async ensureAuthenticated() {
    const expiry = Number(this.auth.credentials?.expiry_date || 0);
    if (this.auth.credentials?.access_token && (!expiry || expiry > Date.now() + 60 * 1000)) {
      return undefined;
    }
    if (this.authenticationPromise) return this.authenticationPromise;
    this.authenticationPromise = this.auth.getAccessToken();
    try {
      await this.authenticationPromise;
      return undefined;
    } finally {
      this.authenticationPromise = null;
    }
  }

  async refreshAuthentication() {
    if (this.authRefreshPromise) return this.authRefreshPromise;
    if (
      this.auth.credentials?.access_token
      && Date.now() - this.lastForcedRefreshAt < AUTH_REFRESH_COOLDOWN_MS
    ) {
      return undefined;
    }
    this.authRefreshPromise = (async () => {
      const { credentials } = await this.auth.refreshAccessToken();
      this.auth.setCredentials({
        ...credentials,
        refresh_token: credentials.refresh_token || this.refreshToken,
      });
      this.lastForcedRefreshAt = Date.now();
    })();
    try {
      return await this.authRefreshPromise;
    } finally {
      this.authRefreshPromise = null;
    }
  }

  async withAuthRetry(operation, phase) {
    await this.ensureAuthenticated();
    try {
      return await operation();
    } catch (error) {
      if (Number(error?.response?.status || error?.statusCode || 0) !== 401) throw error;
      await this.refreshAuthentication();
      try {
        return await operation();
      } catch (retryError) {
        if (Number(retryError?.response?.status || retryError?.statusCode || 0) === 401) {
          retryError.message = `Gmail (${phase}) : ${retryError.message || 'autorisation refusée.'}`;
        }
        throw retryError;
      }
    }
  }

  async test() {
    const { data } = await this.withAuthRetry(
      () => this.gmail.users.getProfile({ userId: 'me' }),
      'test du compte',
    );
    return { email: data.emailAddress, historyId: data.historyId, messagesTotal: data.messagesTotal };
  }

  async getMessages(ids, account) {
    const unique = [...new Set(ids.filter(Boolean))].slice(0, 500);
    const rows = [];
    for (let offset = 0; offset < unique.length; offset += MESSAGE_FETCH_CONCURRENCY) {
      const batch = unique.slice(offset, offset + MESSAGE_FETCH_CONCURRENCY);
      rows.push(...await Promise.all(batch.map(async (id) => {
        try {
          const { data } = await this.withAuthRetry(
            () => this.gmail.users.messages.get({ userId: 'me', id, format: 'full' }),
            'lecture des messages',
          );
          return normalizeMessage(data, account);
        } catch (error) {
          if (error?.response?.status === 404) return null;
          throw error;
        }
      })));
    }
    return rows.filter(Boolean);
  }

  async downloadAttachment(messageId, attachmentId) {
    const { data } = await this.withAuthRetry(
      () => this.gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId,
      }),
      'téléchargement de pièce jointe',
    );
    return Buffer.from(String(data.data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  }

  async initialSync({ account, continuation = null, pageSize = 100 }) {
    const { data } = await this.withAuthRetry(
      () => this.gmail.users.messages.list({
        userId: 'me',
        maxResults: Math.max(1, Math.min(500, Number(pageSize || 100))),
        pageToken: continuation || undefined,
      }),
      'synchronisation initiale',
    );
    const messages = await this.getMessages((data.messages || []).map((item) => item.id), account);
    let cursor = null;
    if (!data.nextPageToken) {
      const profile = await this.test();
      cursor = profile.historyId || null;
    }
    return { messages, deletedProviderIds: [], continuation: data.nextPageToken || null, cursor };
  }

  async incrementalSync({ account, cursor, continuation = null, pageSize = 100 }) {
    try {
      const { data } = await this.withAuthRetry(
        () => this.gmail.users.history.list({
          userId: 'me',
          startHistoryId: cursor,
          maxResults: Math.max(1, Math.min(500, Number(pageSize || 100))),
          pageToken: continuation || undefined,
          historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
        }),
        'synchronisation incrémentale',
      );
      const changed = [];
      const deleted = [];
      for (const history of data.history || []) {
        (history.messagesAdded || []).forEach((entry) => changed.push(entry.message?.id));
        (history.labelsAdded || []).forEach((entry) => changed.push(entry.message?.id));
        (history.labelsRemoved || []).forEach((entry) => changed.push(entry.message?.id));
        (history.messagesDeleted || []).forEach((entry) => deleted.push(entry.message?.id));
      }
      return {
        messages: await this.getMessages(changed, account),
        deletedProviderIds: [...new Set(deleted.filter(Boolean))],
        continuation: data.nextPageToken || null,
        cursor: data.historyId || cursor,
      };
    } catch (error) {
      if (error?.response?.status === 404) {
        const reset = new Error('Le curseur Gmail a expiré ; une synchronisation complète est requise.');
        reset.code = 'MAIL_CURSOR_EXPIRED';
        reset.requiresFullSync = true;
        throw reset;
      }
      throw error;
    }
  }

  async send(operation, attachmentBuffers = []) {
    const attachments = attachmentBuffers.map((item) => ({
      filename: item.filename,
      content: item.buffer,
      contentType: item.mime,
    }));
    const raw = Buffer.from(await new MailComposer({
      from: operation.from?.name ? `${operation.from.name} <${operation.from.email}>` : operation.from?.email,
      to: (operation.to || []).map((item) => item.email).join(', '),
      cc: (operation.cc || []).map((item) => item.email).join(', ') || undefined,
      bcc: (operation.bcc || []).map((item) => item.email).join(', ') || undefined,
      subject: operation.subject || '',
      text: operation.bodyText || stripHtml(operation.bodyHtml),
      html: operation.bodyHtml || undefined,
      attachments,
      headers: {
        'Message-ID': operation.stableMessageId,
        'X-Kheops-Idempotency': operation.idempotencyKey,
      },
    }).compile().build()).toString('base64url');
    const { data } = await this.withAuthRetry(
      () => this.gmail.users.messages.send({ userId: 'me', requestBody: { raw } }),
      'envoi du message',
    );
    return {
      providerMessageId: data.id || null,
      providerThreadId: data.threadId || null,
      providerStatus: 'accepted',
    };
  }

  async findSentByMessageId(messageId) {
    const normalized = String(messageId || '').trim().replace(/^<|>$/g, '');
    if (!normalized) return null;
    const { data } = await this.withAuthRetry(
      () => this.gmail.users.messages.list({
        userId: 'me',
        q: `in:sent rfc822msgid:${normalized}`,
        maxResults: 5,
      }),
      'vérification du message envoyé',
    );
    const first = (data.messages || [])[0];
    if (!first) return null;
    return {
      providerMessageId: first.id,
      providerThreadId: first.threadId || null,
      providerStatus: 'reconciled',
    };
  }

  async findSentOperation(operation) {
    return this.findSentByMessageId(operation?.stableMessageId);
  }

  async startWatch({ topicName }) {
    if (!topicName) throw Object.assign(new Error('Topic Pub/Sub Gmail non configuré.'), { code: 'GMAIL_TOPIC_MISSING' });
    const { data } = await this.withAuthRetry(
      () => this.gmail.users.watch({
        userId: 'me',
        requestBody: { topicName, labelFilterBehavior: 'include', labelIds: ['INBOX', 'SENT'] },
      }),
      'activation des notifications',
    );
    return {
      providerSubscriptionId: null,
      cursor: data.historyId || null,
      expiresAt: data.expiration ? new Date(Number(data.expiration)) : new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
      resource: 'users/me',
    };
  }
}

module.exports = {
  GoogleMailProvider,
  normalizeMessage,
  decodeBase64Url,
  MESSAGE_FETCH_CONCURRENCY,
};
