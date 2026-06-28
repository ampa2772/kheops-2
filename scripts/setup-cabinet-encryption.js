#!/usr/bin/env node
/**
 * Activation programmatique de la protection E2E d'un cabinet (S26).
 *
 * Cas d'usage : refaire un setup propre après désactivation forcée
 * (cf. disable-cabinet-encryption.js) sans passer par l'UI modale. Utile
 * pour les comptes de test et pour rétablir un état déterministe avant
 * de builder/tester le chantier #1.
 *
 * Génère une phrase Diceware FR (ou accepte une phrase passée en CLI),
 * dérive la MasterKey via scrypt (shared/crypto), calcule le verifier,
 * et écrit directement le doc CabinetEncryption dans Atlas.
 *
 * ⚠ La phrase reste sur cette machine (affichage stdout uniquement).
 * Pour un cabinet de prod réel, utilise la modale UI de l'app packagée
 * (qui passe par POST /api/encryption/setup avec auth).
 *
 * Usage :
 *   # Dry-run (par défaut, génère phrase + paramètres mais n'écrit pas) :
 *   node scripts/setup-cabinet-encryption.js --owner=USER_ID
 *
 *   # Exécution réelle (génère phrase aléatoire) :
 *   node scripts/setup-cabinet-encryption.js --owner=USER_ID --confirm
 *
 *   # Avec phrase fournie (ex : reproduire un setup connu) :
 *   node scripts/setup-cabinet-encryption.js --owner=USER_ID --phrase="six mots ici exactement comme ca" --confirm
 *
 * Codes de sortie :
 *   0 = succès (dry-run ou setup effectué)
 *   1 = doc CabinetEncryption déjà actif (utiliser disable-... d'abord)
 *   2 = erreur (params, Mongo, etc.)
 */

'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });

const mongoose = require(path.join(__dirname, '..', 'server', 'node_modules', 'mongoose'));
const CabinetEncryption = require(path.join(__dirname, '..', 'server', 'models', 'Cabinet', 'CabinetEncryption'));
const kheopsCrypto = require(path.join(__dirname, '..', 'shared', 'crypto'));

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
      process.exit(2);
    }

    if (!process.env.MONGODB_URI) {
      console.error('Erreur : MONGODB_URI absent de server/.env');
      process.exit(2);
    }

    console.log('=== Setup protection cabinet — Kheops 2 ===');
    console.log('Mode      : ' + (args.confirm ? '⚠ EXÉCUTION RÉELLE (--confirm)' : 'DRY-RUN (par défaut)'));
    console.log('Cible     : ownerUserId = ' + args.owner);
    console.log('Mongo URI : ' + process.env.MONGODB_URI.replace(/:[^:@]+@/, ':***@'));
    console.log('');

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connecté à MongoDB Atlas.');

    // Refuse si déjà actif (comme la vraie route /setup serveur)
    const existing = await CabinetEncryption.findOne({ ownerUserId: args.owner });
    if (existing && existing.enabled) {
      console.error('\n❌ La protection est déjà active pour ce cabinet.');
      console.error('   ownerUserId       : ' + args.owner);
      console.error('   doc _id           : ' + existing._id);
      console.error('   enabledAt         : ' + existing.enabledAt);
      console.error('   salt              : ' + existing.salt);
      console.error('   verifier          : ' + existing.verifier.slice(0, 16) + '...');
      console.error('\n   Pour repartir de zéro : node scripts/disable-cabinet-encryption.js --owner=' + args.owner + ' --confirm');
      await mongoose.disconnect();
      process.exit(1);
    }

    // 1. Phrase : fournie ou générée
    const phrase = args.phrase ? args.phrase.normalize('NFC') : kheopsCrypto.generatePassphrase();

    // Validation syntaxique
    const validation = kheopsCrypto.validatePassphrase(phrase);
    if (!validation.valid) {
      console.error('\n❌ Phrase invalide : ' + validation.error);
      console.error('   Phrase reçue : ' + phrase);
      await mongoose.disconnect();
      process.exit(2);
    }

    console.log('\nParamètres générés :');
    console.log('  Phrase secrète    : ' + phrase);
    console.log('  Entropie          : ~' + kheopsCrypto.entropyBits(phrase.split(/\s+/).length) + ' bits');

    // 2. Sel
    const salt = kheopsCrypto.generateSalt();
    console.log('  Salt (hex)        : ' + salt.toString('hex'));

    // 3. Dérivation MasterKey
    console.log('\nDérivation MasterKey (scrypt N=2^17, ~1-2 s)...');
    const t0 = Date.now();
    const masterKey = kheopsCrypto.deriveMasterKey(phrase, salt);
    const ms = Date.now() - t0;
    console.log('  Dérivation        : ' + ms + ' ms');

    // 4. Verifier
    const computed = kheopsCrypto.computeVerifier(masterKey);
    const verifierHex = typeof computed === 'string' ? computed : computed.toString('hex');
    console.log('  Verifier (hex)    : ' + verifierHex);

    // 5. Wipe MasterKey
    if (Buffer.isBuffer(masterKey)) masterKey.fill(0);

    if (!args.confirm) {
      console.log('\n[DRY-RUN] Aucune écriture effectuée. Relance avec --confirm pour persister.');
      console.log('  En production, ces salt + verifier seraient envoyés via POST /api/encryption/setup.');
      await mongoose.disconnect();
      process.exit(0);
    }

    // 6. Persistance
    console.log('\nÉcriture du document CabinetEncryption dans Atlas...');
    const saltHex = salt.toString('hex').toLowerCase();
    const verifierLow = verifierHex.toLowerCase();

    let doc;
    if (existing) {
      // Doc existant non-enabled : mise à jour
      existing.salt = saltHex;
      existing.verifier = verifierLow;
      existing.enabled = true;
      existing.enabledAt = new Date();
      existing.version = 2;
      existing.verifyAttempts = 0;
      existing.lastVerifiedAt = null;
      await existing.save();
      doc = existing;
      console.log('  → doc existant mis à jour, _id ' + doc._id);
    } else {
      doc = new CabinetEncryption({
        ownerUserId: args.owner,
        salt: saltHex,
        verifier: verifierLow,
        enabled: true,
        enabledAt: new Date(),
        version: 2,
      });
      await doc.save();
      console.log('  → nouveau doc créé, _id ' + doc._id);
    }

    console.log('\n✅ Setup terminé.');
    console.log('   ownerUserId       : ' + doc.ownerUserId);
    console.log('   enabled           : ' + doc.enabled);
    console.log('   enabledAt         : ' + doc.enabledAt);
    console.log('   salt              : ' + doc.salt);
    console.log('   verifier          : ' + doc.verifier);
    console.log('   version           : ' + doc.version);
    console.log('\n⚠ NOTE LA PHRASE QUELQUE PART DE SÛR :');
    console.log('   « ' + phrase + ' »');
    console.log('\n   Vérifier la cohérence : node scripts/verify-passphrase.js');
    console.log('   (le serveur dev devra tourner sur 127.0.0.1:5000)');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('\nErreur : ' + (err && err.message ? err.message : err));
    if (err && err.stack) console.error(err.stack);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(2);
  }
})();
