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
const { MICROSOFT_MAIL_SCOPES, MICROSOFT_ONEDRIVE_SCOPES } = require('./microsoftOAuthScopes');

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || process.env.MSAL_CLIENT_ID;
const AUTHORITY = process.env.MICROSOFT_AUTHORITY || 'https://login.microsoftonline.com/common';
// Doit rester ALIGNÉ avec MICROSOFT_SCOPES de routes/auth.js (le refresh_token
// obtient un access_token couvrant ces portées). Calendars.Read + Contacts.Read
// alimentent microsoftGraphExtended (agenda/contacts, lecture seule).
const SCOPES = MICROSOFT_MAIL_SCOPES;
const ONEDRIVE_SCOPES = MICROSOFT_ONEDRIVE_SCOPES;
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

// userId -> { accessToken, refreshToken, expiresAt }
const tokenCache = new Map();

async function _refresh(refreshToken, scopes = SCOPES) {
  const response = await axios.post(
    `${AUTHORITY}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: CLIENT_ID,
      scope: scopes.join(' '),
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

// userId -> Promise en vol : SINGLE-FLIGHT. Coalesce les rafraichissements
// concurrents d'un meme utilisateur pour ne redeem le refresh_token PARTAGE
// qu'UNE fois par salve. Supprime la course mail/mail (ex. listInbox +
// countFromContacts declenches en parallele au chargement de la messagerie) qui
// pouvait, hors fenetre de grace Azure, purger un RT pourtant valide.
const inFlightRefresh = new Map();
const oneDriveTokenCache = new Map();
const oneDriveInFlightRefresh = new Map();
// Génération logique par utilisateur. Une déconnexion/reconnexion incrémente
// cette valeur : tout refresh démarré avec une ancienne génération devient
// caduc et n'a plus le droit de remplir le cache ni de persister une rotation.
const oneDriveTokenEpoch = new Map();

function currentOneDriveEpoch(key) {
  return oneDriveTokenEpoch.get(key) || 0;
}

function oneDriveContextChangedError() {
  const err = new Error('AUTH_CONTEXT_CHANGED');
  err.code = 'AUTH_CONTEXT_CHANGED';
  return err;
}

function assertCurrentOneDriveEpoch(key, epoch) {
  if (currentOneDriveEpoch(key) !== epoch) throw oneDriveContextChangedError();
}

function deleteOneDriveCacheForEpoch(key, epoch) {
  const cached = oneDriveTokenCache.get(key);
  if (!cached || cached.epoch === epoch) oneDriveTokenCache.delete(key);
}

async function getAccessTokenForUser(userId) {
  const key = userId.toString();
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.accessToken;
  }
  const existing = inFlightRefresh.get(key);
  if (existing) return existing;
  const p = _refreshAccessToken(userId, 0).finally(() => {
    if (inFlightRefresh.get(key) === p) inFlightRefresh.delete(key);
  });
  inFlightRefresh.set(key, p);
  return p;
}

async function _refreshAccessToken(userId, _retryDepth = 0) {
  const key = userId.toString();

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
      // Rotation : on persiste la nouvelle valeur (chiffree). Compare-and-set :
      // ce refresh_token est PARTAGE avec SharePoint/OneDrive ; on ne l'ecrase que
      // si personne d'autre ne l'a roule entre-temps (sinon on ecraserait un RT
      // plus recent -> l'autre module casserait).
      await User.updateOne(
        { _id: userId, microsoftRefreshToken: user.microsoftRefreshToken },
        { $set: { microsoftRefreshToken: encryptIfNeeded(fresh.refreshToken) } },
      );
    }
    return fresh.accessToken;
  } catch (err) {
    if (err.response?.data?.error === 'invalid_grant') {
      // invalid_grant = vraie revocation... OU le refresh_token PARTAGE vient
      // d'etre legitimement roule par un autre module (SharePoint) juste avant.
      // Purger inconditionnellement (comme avant) deconnecterait a tort mail +
      // OneDrive + SharePoint. On relit donc la valeur fraiche en base :
      tokenCache.delete(key);
      const latest = await User.findById(userId).select('microsoftRefreshToken');
      const latestPlain = latest && latest.microsoftRefreshToken
        ? decryptIfNeeded(latest.microsoftRefreshToken)
        : null;
      if (latestPlain && latestPlain !== refreshTokenPlain && _retryDepth < 2) {
        // Le RT a change sous nos pieds (rotation concurrente) : on reessaie avec
        // la valeur a jour plutot que de detruire un token en realite valide.
        return _refreshAccessToken(userId, _retryDepth + 1);
      }
      // Vraie revocation : purge CONDITIONNELLE (uniquement si c'est toujours
      // notre RT en base) pour ne jamais ecraser un RT roule par un autre module.
      try {
        await User.updateOne(
          { _id: userId, microsoftRefreshToken: user.microsoftRefreshToken },
          { $set: { microsoftRefreshToken: null } },
        );
      } catch (_) {}
      throw new Error('AUTH_REFRESH_FAILED');
    }
    throw err;
  }
}

/**
 * Jeton Graph réservé aux fichiers OneDrive. Le champ dédié empêche une
 * déconnexion OneDrive de révoquer la messagerie Outlook. Le repli sur l'ancien
 * champ conserve la compatibilité des comptes ayant déjà consenti Files.ReadWrite.
 */
async function getAccessTokenForOneDriveUser(userId) {
  const key = String(userId);
  const epoch = currentOneDriveEpoch(key);
  const cached = oneDriveTokenCache.get(key);
  if (cached && cached.epoch === epoch && Date.now() < cached.expiresAt) return cached.accessToken;
  if (cached && cached.epoch !== epoch) oneDriveTokenCache.delete(key);
  const existing = oneDriveInFlightRefresh.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const user = await User.findById(userId).select('microsoftOneDriveRefreshToken microsoftRefreshToken microsoftOneDriveAccount.connectedAt microsoftOneDriveAccount.disconnectedAt');
    assertCurrentOneDriveEpoch(key, epoch);
    const tokenField = user?.microsoftOneDriveRefreshToken
      ? 'microsoftOneDriveRefreshToken'
      : (user?.microsoftOneDriveAccount?.disconnectedAt ? null : 'microsoftRefreshToken');
    const encrypted = user?.[tokenField];
    if (!encrypted) throw new Error('AUTH_REQUIRED');
    const plain = decryptIfNeeded(encrypted);
    if (!plain) throw new Error('AUTH_REFRESH_FAILED');
    try {
      const fresh = await _refresh(plain, ONEDRIVE_SCOPES);
      assertCurrentOneDriveEpoch(key, epoch);
      if (fresh.refreshToken !== plain) {
        const rotationFilter = {
          _id: userId,
          [tokenField]: encrypted,
          // Ces marqueurs changent à chaque déconnexion/reconnexion. Ils
          // prolongent la protection au-delà du cache de cette instance Cloud
          // Run : une rotation issue d'un ancien contexte ne matche plus en DB.
          'microsoftOneDriveAccount.connectedAt': user?.microsoftOneDriveAccount?.connectedAt || null,
          'microsoftOneDriveAccount.disconnectedAt': user?.microsoftOneDriveAccount?.disconnectedAt || null,
        };
        if (tokenField === 'microsoftRefreshToken') {
          // Le repli historique doit en plus rester valable uniquement tant
          // qu'aucun consentement OneDrive dédié n'a été rattaché entre-temps.
          rotationFilter.microsoftOneDriveRefreshToken = user?.microsoftOneDriveRefreshToken || null;
        }
        const persisted = await User.updateOne(
          rotationFilter,
          { $set: { [tokenField]: encryptIfNeeded(fresh.refreshToken) } },
        );
        assertCurrentOneDriveEpoch(key, epoch);
        // matchedCount=0 signifie qu'une déconnexion, reconnexion ou autre
        // rotation a déjà remplacé le contexte lu au début du refresh.
        if (persisted && persisted.matchedCount === 0) throw oneDriveContextChangedError();
      }
      oneDriveTokenCache.set(key, { ...fresh, epoch });
      return fresh.accessToken;
    } catch (err) {
      deleteOneDriveCacheForEpoch(key, epoch);
      if (err?.code === 'AUTH_CONTEXT_CHANGED' || currentOneDriveEpoch(key) !== epoch) {
        throw oneDriveContextChangedError();
      }
      if (err.response?.data?.error === 'invalid_grant') {
        // Ne purge jamais le jeton Outlook historique depuis le module
        // OneDrive. Seul le consentement documentaire dédié peut être révoqué ici.
        if (tokenField === 'microsoftOneDriveRefreshToken') {
          try {
            await User.updateOne(
              { _id: userId, microsoftOneDriveRefreshToken: encrypted },
              { $set: { microsoftOneDriveRefreshToken: null } },
            );
          } catch (_) {}
        }
        throw new Error('AUTH_REFRESH_FAILED');
      }
      throw err;
    }
  })().finally(() => {
    // Un ancien refresh ne doit surtout pas effacer la nouvelle promesse créée
    // après clearOneDriveTokenCache().
    if (oneDriveInFlightRefresh.get(key) === pending) {
      oneDriveInFlightRefresh.delete(key);
    }
  });
  oneDriveInFlightRefresh.set(key, pending);
  return pending;
}

function clearOneDriveTokenCache(userId) {
  const key = String(userId);
  oneDriveTokenEpoch.set(key, currentOneDriveEpoch(key) + 1);
  oneDriveTokenCache.delete(key);
  // La promesse ne peut pas être réellement annulée, mais elle est détachée :
  // la prochaine requête démarre avec la nouvelle génération. Ses effets sont
  // neutralisés par les assertCurrentOneDriveEpoch ci-dessus.
  oneDriveInFlightRefresh.delete(key);
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
  getAccessTokenForOneDriveUser,
  clearOneDriveTokenCache,
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
