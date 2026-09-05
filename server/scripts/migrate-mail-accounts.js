/*
 * Registre OAuth mail — migration non destructive, dry-run par défaut.
 * Cible de base obligatoire : --target=dev|test|preprod (preprod : ajouter
 * --confirm-preprod, KHEOPS_DB_OVERRIDE=preprod et KHEOPS_DB_OVERRIDE_REASON).
 *
 *   node server/scripts/migrate-mail-accounts.js --target=dev
 *   node server/scripts/migrate-mail-accounts.js --target=dev --apply
 *   node server/scripts/migrate-mail-accounts.js --target=dev --rollback
 *
 * Le rollback ne supprime que les lignes-pont créées à partir des champs
 * legacy du User. Les jetons historiques restent dans User : revenir à
 * l'ancienne implémentation reste donc possible.
 */
// Cible de base explicite (--target=...) : plus aucun .env implicite.
const { connectForScript } = require('./lib/dbTarget');
const mongoose = require('mongoose');

async function main() {
  await connectForScript({ argv: process.argv, purpose: 'migrate-mail-accounts' });
  const User = require('../models/App_Users/User');
  const OAuthMailAccount = require('../models/Mail/OAuthMailAccount');
  const { ensureLegacyAccounts } = require('../services/mail/oauthAccountService');
  const apply = process.argv.includes('--apply');
  const rollback = process.argv.includes('--rollback');
  try {
    if (rollback) {
      const filter = {
        legacyTokenField: { $in: ['googleRefreshToken', 'microsoftRefreshToken'] },
        encryptedRefreshToken: null,
      };
      const candidates = await OAuthMailAccount.countDocuments(filter);
      if (!apply) {
        console.log(JSON.stringify({ mode: 'rollback-dry-run', candidates }, null, 2));
        console.log('Aucune écriture. Ajouter --rollback --apply pour supprimer uniquement les lignes-pont legacy.');
        return;
      }
      const result = await OAuthMailAccount.deleteMany(filter);
      console.log(JSON.stringify({ mode: 'rollback', removed: result.deletedCount || 0 }, null, 2));
      return;
    }

    const users = await User.find({
      $or: [
        { googleRefreshToken: { $nin: [null, ''] } },
        { microsoftRefreshToken: { $nin: [null, ''] } },
      ],
    }).select('_id googleRefreshToken microsoftRefreshToken').lean();
    const planned = users.reduce((count, user) => (
      count + (user.googleRefreshToken ? 1 : 0) + (user.microsoftRefreshToken ? 1 : 0)
    ), 0);
    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', users: users.length, planned }, null, 2));
      console.log('Aucune écriture. Ajouter --apply pour créer ou compléter le registre OAuth mail.');
      return;
    }
    let touched = 0;
    const errors = [];
    for (const user of users) {
      try {
        const rows = await ensureLegacyAccounts(user._id);
        touched += rows.length;
      } catch (error) {
        errors.push({ userId: String(user._id), code: error?.code || error?.name || 'ERROR' });
      }
    }
    console.log(JSON.stringify({ mode: 'apply', users: users.length, touched, errors }, null, 2));
    if (errors.length) process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('[migrate-mail-accounts]', error?.code || error?.name || 'ERROR', error?.message || '');
  process.exitCode = 1;
});
