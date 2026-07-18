const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const OAuthMailAccount = require('../../models/Mail/OAuthMailAccount');
const MailSubscription = require('../../models/Mail/MailSubscription');
const MailSyncState = require('../../models/Mail/MailSyncState');
const { createMailProvider } = require('./providerFactory');
const { enqueueSync } = require('./mailSyncService');

function webhookSecret() {
  return String(process.env.MAIL_WEBHOOK_SECRET || process.env.JWT_SECRET || '');
}

function assertWebhookSecret() {
  const secret = webhookSecret();
  if (secret.length < 32) {
    const error = new Error('MAIL_WEBHOOK_SECRET doit contenir au moins 32 caractères.');
    error.code = 'MAIL_WEBHOOK_SECRET_INVALID';
    error.statusCode = 503;
    throw error;
  }
  return secret;
}

function deriveClientState({ accountId, resource }) {
  return crypto.createHmac('sha256', assertWebhookSecret())
    .update(`${accountId}:${resource}`)
    .digest('base64url');
}

function hashClientState(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

function renewalDate(expiresAt, leadMs) {
  const expiry = new Date(expiresAt);
  const now = Date.now();
  const ttl = Math.max(60 * 1000, expiry.getTime() - now);
  return new Date(Math.max(now + 30 * 1000, expiry.getTime() - Math.min(leadMs, Math.floor(ttl / 3))));
}

function publicSubscription(subscription) {
  if (!subscription) return null;
  const value = subscription.toObject ? subscription.toObject() : { ...subscription };
  delete value.clientStateHash;
  return {
    ...value,
    id: String(value._id || value.id),
    accountId: String(value.accountId),
    tenantId: String(value.tenantId),
  };
}

async function persistSubscription(account, details) {
  const lead = account.provider === 'google' ? 24 * 60 * 60 * 1000 : 20 * 60 * 1000;
  const subscription = await MailSubscription.findOneAndUpdate(
    { tenantId: account.tenantId, accountId: account._id, resource: details.resource },
    {
      $set: {
        provider: account.provider,
        providerSubscriptionId: details.providerSubscriptionId || null,
        clientStateHash: details.clientStateHash || null,
        status: 'active',
        expiresAt: details.expiresAt,
        renewAfter: renewalDate(details.expiresAt, lead),
        lastRenewedAt: new Date(),
        lastError: null,
      },
    },
    { upsert: true, new: true, runValidators: true },
  ).select('+clientStateHash');
  account.nextRenewalAt = subscription.renewAfter;
  account.updatedBy = account.updatedBy || account.ownerUserId;
  await account.save();
  return subscription;
}

async function createOrReplaceSubscription(account) {
  const provider = await createMailProvider(account);
  if (account.provider === 'google') {
    const details = await provider.startWatch({ topicName: process.env.GMAIL_PUBSUB_TOPIC });
    const subscription = await persistSubscription(account, {
      ...details,
      resource: details.resource || 'users/me',
    });
    if (details.cursor) {
      await MailSyncState.updateOne(
        {
          tenantId: account.tenantId,
          accountId: account._id,
          folderKey: 'mailbox',
          cursor: null,
          initialSyncComplete: true,
        },
        { $set: { cursor: details.cursor } },
      );
    }
    return subscription;
  }

  const resource = process.env.MICROSOFT_MAIL_SUBSCRIPTION_RESOURCE || '/me/messages';
  const clientState = deriveClientState({ accountId: account._id, resource });
  const details = await provider.createSubscription({
    notificationUrl: process.env.MICROSOFT_MAIL_NOTIFICATION_URL,
    lifecycleNotificationUrl: process.env.MICROSOFT_MAIL_LIFECYCLE_URL,
    resource,
    expiresAt: new Date(Date.now() + 55 * 60 * 1000),
    clientState,
  });
  return persistSubscription(account, {
    ...details,
    resource,
    clientStateHash: hashClientState(clientState),
  });
}

async function renewSubscription(subscription) {
  const account = await OAuthMailAccount.findOne({
    _id: subscription.accountId,
    tenantId: subscription.tenantId,
    status: { $nin: ['disabled', 'disconnected'] },
  }).select('+encryptedRefreshToken +legacyTokenField');
  if (!account) {
    subscription.status = 'disabled';
    subscription.lastError = 'Compte absent ou déconnecté.';
    await subscription.save();
    return subscription;
  }
  subscription.status = 'renewing';
  await subscription.save();
  try {
    if (account.provider === 'google' || !subscription.providerSubscriptionId) {
      return createOrReplaceSubscription(account);
    }
    const provider = await createMailProvider(account);
    const details = await provider.renewSubscription(
      subscription.providerSubscriptionId,
      new Date(Date.now() + 55 * 60 * 1000),
    );
    subscription.expiresAt = details.expiresAt;
    subscription.renewAfter = renewalDate(details.expiresAt, 20 * 60 * 1000);
    subscription.status = 'active';
    subscription.lastRenewedAt = new Date();
    subscription.lastError = null;
    await subscription.save();
    account.nextRenewalAt = subscription.renewAfter;
    await account.save();
    return subscription;
  } catch (error) {
    subscription.status = new Date(subscription.expiresAt) <= new Date() ? 'expired' : 'error';
    subscription.lastError = String(error?.message || 'Échec du renouvellement.').slice(0, 1000);
    await subscription.save();
    throw error;
  }
}

async function renewDueSubscriptions({ now = new Date(), limit = 25 } = {}) {
  const rows = await MailSubscription.find({
    status: { $in: ['active', 'error', 'expired'] },
    renewAfter: { $lte: now },
  }).sort({ renewAfter: 1 }).limit(limit).select('+clientStateHash');
  const results = [];
  for (const row of rows) {
    try {
      results.push({ id: row._id, ok: true, subscription: await renewSubscription(row) });
    } catch (error) {
      results.push({ id: row._id, ok: false, error: error?.code || error?.name || 'ERROR' });
    }
  }
  return results;
}

async function processMicrosoftNotifications(payload = {}) {
  const accepted = [];
  const rejected = [];
  for (const notification of payload.value || []) {
    const subscription = await MailSubscription.findOne({
      provider: 'microsoft',
      providerSubscriptionId: notification.subscriptionId,
    }).select('+clientStateHash');
    const valid = subscription
      && subscription.clientStateHash
      && constantTimeEqual(hashClientState(notification.clientState), subscription.clientStateHash);
    if (!valid) {
      rejected.push({ subscriptionId: notification.subscriptionId || null, reason: 'client-state' });
      continue;
    }
    subscription.lastNotificationAt = new Date();
    await subscription.save();
    const signal = notification.resourceData?.id
      || notification.sequenceNumber
      || notification.resource
      || notification.changeType
      || Date.now();
    const enqueued = await enqueueSync({
      tenantId: subscription.tenantId,
      accountId: subscription.accountId,
      trigger: notification.lifecycleEvent ? 'renewal' : 'notification',
      idempotencyKey: `ms:${subscription.providerSubscriptionId}:${signal}:${notification.changeType || notification.lifecycleEvent || 'change'}`,
    });
    accepted.push({ subscriptionId: subscription.providerSubscriptionId, jobId: enqueued.job?._id });
  }
  return { accepted, rejected };
}

function decodeGoogleNotification(payload = {}) {
  const encoded = payload.message?.data;
  if (!encoded) throw Object.assign(new Error('Notification Gmail vide.'), { statusCode: 400, code: 'GMAIL_NOTIFICATION_INVALID' });
  try {
    const data = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    const emailAddress = String(data.emailAddress || '').trim().toLowerCase();
    const historyId = String(data.historyId || '').trim();
    if (!emailAddress || !historyId) throw new Error('missing fields');
    return { emailAddress, historyId, messageId: payload.message?.messageId || null };
  } catch (_error) {
    throw Object.assign(new Error('Notification Gmail illisible.'), { statusCode: 400, code: 'GMAIL_NOTIFICATION_INVALID' });
  }
}

async function verifyGoogleNotificationRequest(req) {
  const configuredToken = String(process.env.GMAIL_WEBHOOK_TOKEN || '');
  const presentedToken = String(req.get?.('x-kheops-webhook-token') || req.headers?.['x-kheops-webhook-token'] || '');
  if (configuredToken.length >= 32 && constantTimeEqual(configuredToken, presentedToken)) return true;
  const authHeader = String(req.get?.('authorization') || req.headers?.authorization || '');
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
  const audience = String(process.env.GMAIL_PUBSUB_AUDIENCE || '').trim();
  if (!bearer || !audience) {
    throw Object.assign(new Error('Notification Gmail non authentifiée.'), { statusCode: 401, code: 'GMAIL_NOTIFICATION_UNAUTHENTICATED' });
  }
  const client = new OAuth2Client();
  await client.verifyIdToken({ idToken: bearer, audience });
  return true;
}

async function processGoogleNotification(payload = {}) {
  const decoded = decodeGoogleNotification(payload);
  const accounts = await OAuthMailAccount.find({
    provider: 'google',
    email: decoded.emailAddress,
    status: { $nin: ['disabled', 'disconnected'] },
  });
  if (!accounts.length) {
    return { accepted: false, reason: 'account-not-found' };
  }
  const jobs = [];
  for (const account of accounts) {
    const subscription = await MailSubscription.findOne({
      tenantId: account.tenantId,
      accountId: account._id,
      provider: 'google',
    });
    if (subscription) {
      subscription.lastNotificationAt = new Date();
      await subscription.save();
    }
    const enqueued = await enqueueSync({
      account,
      trigger: 'notification',
      idempotencyKey: `gmail:${account._id}:${decoded.historyId}`,
    });
    jobs.push({ accountId: account._id, jobId: enqueued.job?._id, reused: enqueued.reused });
  }
  return { accepted: true, jobs };
}

module.exports = {
  assertWebhookSecret,
  deriveClientState,
  hashClientState,
  constantTimeEqual,
  renewalDate,
  publicSubscription,
  createOrReplaceSubscription,
  renewSubscription,
  renewDueSubscriptions,
  processMicrosoftNotifications,
  decodeGoogleNotification,
  verifyGoogleNotificationRequest,
  processGoogleNotification,
};
