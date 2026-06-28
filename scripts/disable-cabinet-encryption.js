#!/usr/bin/env node
/**
 * Désactivation forcée de la protection E2E d'un cabinet (S26).
 *
 * Cas d'usage : la phrase secrète d'un cabinet est perdue / inconnue, et
 * on veut repartir de zéro avec un nouveau setup. Sans phrase, ni la
 * feuille de secours ni la route /setup ne permettent de reprendre la
 * main (la route /setup renvoie 409 si enabled=true).
 *
 * ⚠ DESTRUCTIF côté serveur : supprime le document CabinetEncryption.
 * Les fichiers `.kbox` déjà chiffrés sur Drive deviennent ILLISIBLES
 * (la MasterKey nécessaire pour les déchiffrer dépendait du sel supprimé).
 * À n'utiliser QUE si :
 *   - le cabinet est un compte de test / dev jetable, OU
 *   - il n'y a aucun fichier `.kbox` à préserver (cabinet protégé serveur
 *     mais chantier #1 jamais buildé en EXE, donc aucun fichier réel
 *     n'a jamais été chiffré).
 *
 * Cas du cabinet Pierre (sortie S26) : la machinerie crypto est livrée
 * mais le chantier #1 (couverture envois Drive) n'est PAS dans la prod
 * 2.0.5-rc1. Donc aucun fichier `.kbox` n'a été produit côté Pierre.
 * → désactivation sans perte.
 *
 * Usage :
 *   # Dry-run (par défaut, n'écrit RIEN) :
 *   node scripts/disable-cabinet-encryption.js --owner=USER_ID
 *
 *   # Exécution réelle :
 *   node scripts/disable-cabinet-encryption.js --owner=USER_ID --confirm
 *
 * Codes de sortie :
 *   0 = succès (dry-run ou suppression effective)
 *   1 = cabinet introuvable / pas de doc CabinetEncryption
 *   2 = erreur (params, Mongo, etc.)
 */

'use strict';

const path = require('path');
const dotenv = require('dotenv');

// Charge le .env du serveur (où vit MONGODB_URI)
dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

const mongoose = require(path.join(__dirname, '..', 'server', 'node_modules', 'mongoose'));
const CabinetEncryption = require(path.join(__dirname, '..', 'server', 'models', 'Cabinet', 'CabinetEncryption'));

function parseArgs() {
  const args = { confirm: false };
  for (const a of process.argv.slice(2)) {
    if (a === '--confirm') args.confirm = true;
    else {
      const m = a.match(/^--([a-zA-Z0-9_-]+)=(.+)$/);
      if (m) args[m[1]] = m[2];
    }
  }
  return args;
}

(async () => {
  try {
    const args = parseArgs();
    if (!args.owner || !/^[0-9a-f]{24}$/i.test(args.owner)) {
      console.error('Erreur : --owner=USER_ID requis (ObjectId hex 24 chars).');
      console.error('  Exemple : --owner=698941d40c8df05d76c7740e (cabinet Pierre)');
      process.exit(2);
    }

    if (!process.env.MONGODB_URI) {
      console.error('Erreur : MONGODB_URI absent de server/.env');
      process.exit(2);
    }

    console.log('=== Désactivation protection cabinet — Kheops 2 ===');
    console.log('Mode      : ' + (args.confirm ? '⚠ EXÉCUTION RÉELLE (--confirm)' : 'DRY-RUN (par défaut)'));
    console.log('Cible     : ownerUserId = ' + args.owner);
    console.log('Mongo URI : ' + process.env.MONGODB_URI.replace(/:[^:@]+@/, ':***@'));
    console.log('');

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connecté à MongoDB Atlas.');

    const doc = await CabinetEncryption.findOne({ ownerUserId: args.owner });
    if (!doc) {
      console.log('\n⚠ Aucun document CabinetEncryption trouvé pour owner ' + args.owner);
      console.log('   → rien à désactiver (le cabinet n\'a jamais activé la protection).');
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log('\nDocument trouvé :');
    console.log('  _id            : ' + doc._id);
    console.log('  enabled        : ' + doc.enabled);
    console.log('  enabledAt      : ' + (doc.enabledAt || 'null'));
    console.log('  salt           : ' + (doc.salt || 'null'));
    console.log('  verifier       : ' + (doc.verifier ? doc.verifier.slice(0, 16) + '...' : 'null'));
    console.log('  version        : ' + doc.version);
    console.log('  verifyAttempts : ' + (doc.verifyAttempts || 0));
    console.log('  lastVerifiedAt : ' + (doc.lastVerifiedAt || 'null'));
    console.log('  createdAt      : ' + doc.createdAt);
    console.log('  updatedAt      : ' + doc.updatedAt);

    if (!args.confirm) {
      console.log('\n[DRY-RUN] Aucune écriture effectuée.');
      console.log('  → pour supprimer pour de bon, relance avec --confirm');
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log('\n⚠ Suppression du document en cours...');
    const result = await CabinetEncryption.deleteOne({ _id: doc._id });
    console.log('Résultat : deletedCount = ' + result.deletedCount);

    // Vérification post-suppression
    const reCheck = await CabinetEncryption.findOne({ ownerUserId: args.owner });
    if (reCheck) {
      console.error('\n❌ ERREUR : le document existe toujours après deleteOne. État Atlas incohérent.');
      await mongoose.disconnect();
      process.exit(2);
    }
    console.log('\n✅ Document supprimé. Le cabinet est de nouveau "non protégé".');
    console.log('   GET /api/encryption/info renverra désormais { enabled: false, ... null }.');
    console.log('   Tu peux refaire un setup propre via la modale ou POST /api/encryption/setup.');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('\nErreur : ' + (err && err.message ? err.message : err));
    if (err && err.stack) console.error(err.stack);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(2);
  }
})();
