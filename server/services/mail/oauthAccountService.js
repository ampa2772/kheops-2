const OAuthMailAccount = require('../../models/Mail/OAuthMailAccount');
const User = require('../../models/App_Users/User');
const { resolveTenantId } = require('../tenantService');
const { encryptIfNeeded, decryptIfNeeded } = require('../../utils/tokenCrypto');

function publicAccount(account) {
  const value = account?.toObject ? account.toObject() : { ...(account || {}) };
  delete value.encryptedRefreshToken;
  delete value.legacyTokenField;
  return {
    ...value,
    id: String(value._id || value.id),
    tenantId: value.tenantId ? String(value.tenantId) : null,
    ownerUserId: value.ownerUserId ? String(value.ownerUserId) : null,
    health: {
      status: value.status,
      lastTestAt: value.lastTestAt,
      lastSyncAt: value.lastSyncAt,
      lastSuccessfulSyncAt: value.lastSuccessfulSyncAt,
      nextRenewalAt: value.nextRenewalAt,
      recentErrorCount: value.recentErrorCount || 0,
      lastError: value.lastError?.code ? value.lastError : null,
    },
  };
}

async function ensureLegacyAccounts(userId) {
  const [tenantId, user] = await Promise.all([
    resolveTenantId(userId),
    User.findById(userId).select('email firstName lastName googleRefreshToken microsoftRefreshToken'),
  ]);
  if (!user) throw Object.assign(new Error('Utilisateur introuvable.'), { statusCode: 404 });
  const candidates = [
    user.googleRefreshToken && { provider: 'google', field: 'googleRefreshToken' },
    user.microsoftRefreshToken && { provider: 'microsoft', field: 'microsoftRefreshToken' },
  ].filter(Boolean);
  const count = await OAuthMailAccount.countDocuments({ tenantId, ownerUserId: user._id });
  const created = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const item = candidates[index];
    const account = await OAuthMailAccount.findOneAndUpdate(
      {
        tenantId,
        ownerUserId: user._id,
        provider: item.provider,
        email: String(user.email).toLowerCase(),
        sharedMailboxAddress: null,
      },
      {
        $setOnInsert: {
          displayName: [user.firstName, user.lastName].filter(Boolean).join(' '),
          accountType: 'unknown',
          legacyTokenField: item.field,
          isDefault: count === 0 && index === 0,
          status: 'active',
          createdBy: user._id,
        },
        $set: { updatedBy: user._id },
      },
      { upsert: true, new: true, runValidators: true },
    );
    created.push(account);
  }
  return created;
}

async function listAccounts({ userId, includeDisabled = false }) {
  await ensureLegacyAccounts(userId);
  const tenantId = await resolveTenantId(userId);
  const query = { tenantId, ownerUserId: userId };
  if (!includeDisabled) query.status = { $nin: ['disabled', 'disconnected'] };
  const accounts = await OAuthMailAccount.find(query).sort({ isDefault: -1, createdAt: 1 });
  return accounts.map(publicAccount);
}

async function findOwnedAccount({ userId, accountId, withSecret = false }) {
  const tenantId = await resolveTenantId(userId);
  let query = OAuthMailAccount.findOne({ _id: accountId, tenantId, ownerUserId: userId });
  if (withSecret) query = query.select('+encryptedRefreshToken +legacyTokenField');
  const account = await query;
  if (!account) throw Object.assign(new Error('Compte de messagerie introuvable.'), { statusCode: 404, code: 'MAIL_ACCOUNT_NOT_FOUND' });
  return account;
}

async function refreshTokenForAccount(account) {
  if (!account) throw Object.assign(new Error('Compte de messagerie requis.'), { statusCode: 400 });
  if (account.encryptedRefreshToken) return decryptIfNeeded(account.encryptedRefreshToken);
  if (!account.legacyTokenField) throw Object.assign(new Error('Reconnexion requise.'), { statusCode: 401, code: 'MAIL_REAUTH_REQUIRED' });
  const user = await User.findById(account.ownerUserId).select(account.legacyTokenField);
  const encrypted = user?.[account.legacyTokenField];
  const plain = encrypted ? decryptIfNeeded(encrypted) : null;
  if (!plain) throw Object.assign(new Error('Reconnexion requise.'), { statusCode: 401, code: 'MAIL_REAUTH_REQUIRED' });
  return plain;
}

async function upsertOAuthAccount({ tenantId, userId, provider, email, displayName, accountType, refreshToken, scopes = [] }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!['google', 'microsoft'].includes(provider) || !normalizedEmail) {
    throw Object.assign(new Error('Fournisseur et adresse requis.'), { statusCode: 400, code: 'MAIL_ACCOUNT_INVALID' });
  }
  const existingDefault = await OAuthMailAccount.exists({ tenantId, ownerUserId: userId, isDefault: true });
  const set = {
    displayName: String(displayName || '').slice(0, 200),
    accountType: ['personal', 'organization', 'shared'].includes(accountType) ? accountType : 'unknown',
    scopes: [...new Set((scopes || []).map(String))],
    status: 'active',
    lastError: { code: null, message: null, at: null },
    updatedBy: userId,
  };
  if (refreshToken) set.encryptedRefreshToken = encryptIfNeeded(refreshToken);
  return OAuthMailAccount.findOneAndUpdate(
    { tenantId, ownerUserId: userId, provider, email: normalizedEmail, sharedMailboxAddress: null },
    {
      $set: set,
      $setOnInsert: { createdBy: userId, isDefault: !existingDefault },
    },
    { upsert: true, new: true, runValidators: true },
  ).select('+encryptedRefreshToken +legacyTokenField');
}

async function setDefaultAccount({ userId, accountId }) {
  const account = await findOwnedAccount({ userId, accountId });
  await OAuthMailAccount.updateMany(
    { tenantId: account.tenantId, ownerUserId: account.ownerUserId, _id: { $ne: account._id } },
    { $set: { isDefault: false, updatedBy: userId } },
  );
  account.isDefault = true;
  account.updatedBy = userId;
  await account.save();
  return publicAccount(account);
}

async function markSyncStarted(account) {
  account.status = 'syncing';
  account.lastSyncStartedAt = new Date();
  await account.save();
}

async function markHealthy(account, { nextRenewalAt = undefined } = {}) {
  const now = new Date();
  account.status = 'active';
  account.lastSyncAt = now;
  account.lastSuccessfulSyncAt = now;
  account.lastTestAt = account.lastTestAt || now;
  account.recentErrorCount = 0;
  account.lastError = { code: null, message: null, at: null };
  if (nextRenewalAt !== undefined) account.nextRenewalAt = nextRenewalAt;
  await account.save();
}

async function markError(account, error) {
  const code = String(error?.code || error?.response?.data?.error || 'MAIL_SYNC_FAILED').slice(0, 120);
  account.status = ['MAIL_REAUTH_REQUIRED', 'AUTH_REQUIRED', 'AUTH_REFRESH_FAILED'].includes(code) ? 'reauth_required' : 'error';
  account.recentErrorCount = Number(account.recentErrorCount || 0) + 1;
  account.lastError = {
    code,
    message: String(error?.message || 'Erreur de synchronisation.').slice(0, 1000),
    at: new Date(),
  };
  await account.save();
}

module.exports = {
  publicAccount,
  ensureLegacyAccounts,
  listAccounts,
  findOwnedAccount,
  refreshTokenForAccount,
  upsertOAuthAccount,
  setDefaultAccount,
  markSyncStarted,
  markHealthy,
  markError,
};

