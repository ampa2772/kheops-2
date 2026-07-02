// server/utils/microsoftGraphMail.js
//
// Helper Microsoft Graph pour la boîte mail Outlook — équivalent côté serveur
// des appels Gmail dans mails.js. Expose les méthodes utilisées par les routes :
//   listInbox, getMessage, getAttachmentContent, sendMail, listFromContacts,
//   getMessageMetadata.
//
// Auth : refresh token rotation gérée. Le token frais est mis en cache mémoire
// par userId (TTL ~1h-60s). Si Microsoft fait tourner le refresh token,
// la nouvelle valeur est persistée en BDD.

const axios = require('axios');
const User = require('../models/App_Users/User');
// SECURITE rc37 (M-06) : refresh tokens chiffres au repos.
const { encryptIfNeeded, decryptIfNeeded } = require('./tokenCrypto');
const { escapeHtml } = require('./escapeHtml');

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || process.env.MSAL_CLIENT_ID;
const AUTHORITY = process.env.MICROSOFT_AUTHORITY || 'https://login.microsoftonline.com/common';
// Doit rester ALIGNÉ avec MICROSOFT_SCOPES de routes/auth.js (le refresh_token
// obtient un access_token couvrant ces portées). Calendars.Read + Contacts.Read
// alimentent microsoftGraphExtended (agenda/contacts, lecture seule).
const SCOPES = ['User.Read', 'Mail.Read', 'Mail.ReadWrite', 'Mail.Send', 'Files.ReadWrite', 'Calendars.Read', 'Contacts.Read', 'offline_access'];
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

// userId -> { accessToken, refreshToken, expiresAt }
const tokenCache = new Map();

async function _refresh(refreshToken) {
  const response = await axios.post(
    `${AUTHORITY}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: CLIENT_ID,
      scope: SCOPES.join(' '),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  );
  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token || refreshToken,
    expiresAt: Date.now() + (response.data.expires_in * 1000) - 60000,
  };
}

async function getAccessTokenForUser(userId) {
  const key = userId.toString();
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.accessToken;
  }

  const user = await User.findById(userId).select('microsoftRefreshToken');
  if (!user || !user.microsoftRefreshToken) {
    throw new Error('AUTH_REQUIRED');
  }

  // SECURITE rc37 (M-06) : decryption transparente avant utilisation.
  const refreshTokenPlain = decryptIfNeeded(user.microsoftRefreshToken);
  if (!refreshTokenPlain) {
    console.warn(`[microsoftGraphMail] refresh token MS indechiffrable user=${userId} (clef rotee ?). Re-OAuth requis.`);
    throw new Error('AUTH_REFRESH_FAILED');
  }

  try {
    const fresh = await _refresh(refreshTokenPlain);
    tokenCache.set(key, fresh);
    if (fresh.refreshToken !== refreshTokenPlain) {
      // Rotation : on persiste la nouvelle valeur (chiffree)
      await User.findByIdAndUpdate(userId, {
        $set: { microsoftRefreshToken: encryptIfNeeded(fresh.refreshToken) },
      });
    }
    return fresh.accessToken;
  } catch (err) {
    if (err.response?.data?.error === 'invalid_grant') {
      // Token expiré/révoqué → on le purge en BDD pour que l'user reconnecte
      try {
        await User.findByIdAndUpdate(userId, { $set: { microsoftRefreshToken: null } });
      } catch (_) {}
      throw new Error('AUTH_REFRESH_FAILED');
    }
    throw err;
  }
}

async function _graphCall(userId, method, urlPath, { params, data, responseType = 'json', headers } = {}) {
  const token = await getAccessTokenForUser(userId);
  const url = urlPath.startsWith('http') ? urlPath : `${GRAPH_BASE}${urlPath}`;
  return axios({
    method, url, params, data, responseType,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(headers || {}) },
    timeout: 30000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
}

function _formatFrom(microsoftFromObject) {
  if (!microsoftFromObject) return 'N/A';
  const { name, address } = microsoftFromObject.emailAddress || {};
  if (name && address) return `${name} <${address}>`;
  return address || name || 'N/A';
}

// ── Liste inbox (équivalent /api/mails/emails) ──────────────────────────────
async function listInbox(userId, { pageToken } = {}) {
  // pageToken est l'@odata.nextLink complet OU undefined
  let response;
  if (pageToken && pageToken.startsWith('http')) {
    response = await _graphCall(userId, 'get', pageToken);
  } else {
    response = await _graphCall(userId, 'get', '/me/mailFolders/Inbox/messages', {
      params: {
        $top: 20,
        $orderby: 'receivedDateTime DESC',
        $select: 'id,subject,bodyPreview,from,receivedDateTime',
      }
    });
  }
  const data = response.data;
  return {
    emails: (data.value || []).map(m => ({
      id: m.id,
      from: _formatFrom(m.from),
      subject: m.subject || '(Sans objet)',
      snippet: m.bodyPreview || '',
    })),
    nextPageToken: data['@odata.nextLink'] || null,
  };
}

// ── Détails d'un email (équivalent /api/mails/email/:id) ────────────────────
async function getMessage(userId, messageId) {
  const response = await _graphCall(userId, 'get', `/me/messages/${encodeURIComponent(messageId)}`, {
    params: {
      $select: 'id,subject,from,body,receivedDateTime,hasAttachments',
      $expand: 'attachments($select=id,name,contentType,size,isInline)',
    }
  });
  const m = response.data;
  return {
    id: m.id,
    from: _formatFrom(m.from),
    subject: m.subject || '(Sans objet)',
    body: m.body?.content || '',
    date: m.receivedDateTime,
    attachments: (m.attachments || [])
      .filter(a => !a.isInline)
      .map(a => ({
        attachmentId: a.id,
        filename: a.name,
        mimeType: a.contentType || 'application/octet-stream',
        size: a.size || 0,
      })),
  };
}

// ── Métadonnées (from + date) — équivalent partiel pour /check-email-presence ──
async function getMessageMetadata(userId, messageId) {
  const response = await _graphCall(userId, 'get', `/me/messages/${encodeURIComponent(messageId)}`, {
    params: { $select: 'id,from,receivedDateTime,subject' }
  });
  return response.data;
}

// ── Contenu d'une pièce jointe (renvoie Buffer + name + mimeType) ──────────
async function getAttachmentContent(userId, messageId, attachmentId) {
  const response = await _graphCall(userId, 'get',
    `/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
  const a = response.data;
  if (a['@odata.type'] !== '#microsoft.graph.fileAttachment') {
    throw new Error("Type de pièce jointe non supporté (referenceAttachment ou itemAttachment).");
  }
  return {
    filename: a.name,
    mimeType: a.contentType || 'application/octet-stream',
    contentBuffer: Buffer.from(a.contentBytes || '', 'base64'),
    contentBase64: a.contentBytes || '',
  };
}

// ── Envoi d'email (équivalent /api/mails/send-email) ────────────────────────
async function sendMail(userId, { to, subject, body, attachments = [] }) {
  const toRecipients = (to || '')
    .split(/[\s,;]+/)
    .filter(e => e && e.includes('@'))
    .map(addr => ({ emailAddress: { address: addr } }));

  if (toRecipients.length === 0) throw new Error('Aucun destinataire valide.');

  const message = {
    subject: subject || '(Sans objet)',
    body: { contentType: 'HTML', content: `<p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>` },
    toRecipients,
  };

  if (attachments.length > 0) {
    message.attachments = attachments.map(a => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.filename,
      contentType: a.contentType || 'application/octet-stream',
      contentBytes: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
    }));
  }

  await _graphCall(userId, 'post', '/me/sendMail', {
    data: { message, saveToSentItems: true },
  });
  return { ok: true };
}

// ── Liste inbox brute pour filtrage par contacts (notifications) ────────────
// Microsoft Graph $search supporte la syntaxe KQL "from:X OR from:Y" mais limite
// à ~32 termes. Pour scaler à beaucoup de contacts, on récupère N derniers
// messages et on filtre côté serveur.
async function listInboxRaw(userId, { pageToken, maxResults = 50 } = {}) {
  let response;
  if (pageToken && pageToken.startsWith('http')) {
    response = await _graphCall(userId, 'get', pageToken);
  } else {
    response = await _graphCall(userId, 'get', '/me/mailFolders/Inbox/messages', {
      params: {
        $top: maxResults,
        $orderby: 'receivedDateTime DESC',
        $select: 'id,subject,bodyPreview,from,receivedDateTime,hasAttachments',
      },
    });
  }
  return {
    messages: response.data.value || [],
    nextPageToken: response.data['@odata.nextLink'] || null,
  };
}

// Compte rapide des emails de contacts (équivalent /notifications/count)
async function countFromContacts(userId, contactEmailsLowerCase) {
  // Approche : on liste les 50 derniers messages et on compte ceux dont le
  // sender est dans la liste de contacts. Un comptage exact serait coûteux.
  const { messages } = await listInboxRaw(userId, { maxResults: 50 });
  const set = contactEmailsLowerCase instanceof Set ? contactEmailsLowerCase : new Set(contactEmailsLowerCase);
  let count = 0;
  for (const m of messages) {
    const addr = m.from?.emailAddress?.address?.toLowerCase();
    if (addr && set.has(addr)) count++;
  }
  return count;
}

module.exports = {
  // Auth
  getAccessTokenForUser,
  // Mail operations
  listInbox,
  getMessage,
  getMessageMetadata,
  getAttachmentContent,
  sendMail,
  listInboxRaw,
  countFromContacts,
  // Bas niveau partagé (réutilisé par microsoftGraphExtended : agenda/contacts).
  // Applique déjà la rotation de jeton + le refresh chiffré.
  _graphCall,
  // Helpers exposés (utile en tests)
  _formatFrom,
  _refresh,
};
