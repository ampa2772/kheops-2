const { GoogleMailProvider } = require('./providers/googleMailProvider');
const { MicrosoftMailProvider } = require('./providers/microsoftMailProvider');
const { refreshTokenForAccount } = require('./oauthAccountService');
const { encryptIfNeeded } = require('../../utils/tokenCrypto');

async function createMailProvider(account) {
  if (account.provider === 'google') {
    return new GoogleMailProvider({ refreshToken: await refreshTokenForAccount(account) });
  }
  if (account.provider === 'microsoft') {
    if (account.encryptedRefreshToken && !account.legacyTokenField) {
      return new MicrosoftMailProvider({
        userId: account.ownerUserId,
        refreshToken: await refreshTokenForAccount(account),
        onRefreshToken: async (token) => {
          account.encryptedRefreshToken = encryptIfNeeded(token);
          account.updatedBy = account.ownerUserId;
          await account.save();
        },
      });
    }
    return new MicrosoftMailProvider({ userId: account.ownerUserId });
  }
  throw Object.assign(new Error('Fournisseur de messagerie non pris en charge.'), { code: 'MAIL_PROVIDER_UNSUPPORTED' });
}

module.exports = { createMailProvider };
