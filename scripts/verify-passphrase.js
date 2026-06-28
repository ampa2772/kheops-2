#!/usr/bin/env node
/**
 * Vérificateur OFFLINE de phrase secrète cabinet — Kheops 2 (S25).
 *
 * Utilité : tester si une phrase secrète est correcte SANS avoir à lancer
 * l'application packagée. La phrase saisie ne quitte JAMAIS la machine
 * (pas d'envoi réseau, pas d'écriture sur disque, pas de log de la phrase).
 *
 * Principe :
 *   1. Récupère le sel public + le verifier du cabinet (depuis le serveur
 *      dev sur 127.0.0.1:5000 OU depuis des arguments --salt= / --verifier=).
 *   2. Demande la phrase secrète dans le terminal (stdin local).
 *   3. Dérive la MasterKey via shared/crypto (scrypt, normalisation NFC).
 *   4. Calcule le verifier correspondant.
 *   5. Compare avec le verifier stocké : OK / KO.
 *
 * Aucune transmission réseau de la phrase. Aucune écriture sur disque.
 * Le buffer MasterKey est effacé après comparaison (best-effort).
 *
 * Usage :
 *   # Mode auto (récupère salt+verifier du serveur dev) :
 *   node scripts/verify-passphrase.js
 *
 *   # Mode manuel (utile si le serveur dev n'est pas lancé) :
 *   node scripts/verify-passphrase.js --salt=HEX32 --verifier=HEX64
 *
 * Codes de sortie :
 *   0 = phrase correcte (ou cabinet pas protégé : rien à vérifier)
 *   1 = phrase incorrecte
 *   2 = erreur (paramètres invalides, serveur injoignable, etc.)
 */

'use strict';

const readline = require('readline');
const http = require('http');
const path = require('path');
const kheopsCrypto = require(path.join(__dirname, '..', 'shared', 'crypto'));

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([a-zA-Z0-9_-]+)=(.+)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function fetchServerConfig() {
  return new Promise((resolve, reject) => {
    const req = http.get(
      'http://127.0.0.1:5000/api/encryption/info',
      { headers: { Authorization: 'Bearer dev-bypass-token' } },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (!json || !json.encryption) {
              return reject(new Error('Réponse serveur sans champ "encryption" : ' + body.slice(0, 200)));
            }
            resolve(json.encryption);
          } catch (e) {
            reject(new Error('Réponse serveur non JSON : ' + body.slice(0, 200)));
          }
        });
      }
    );
    req.on('error', (err) => reject(new Error('Serveur dev injoignable sur 127.0.0.1:5000 : ' + err.message)));
    req.setTimeout(5000, () => {
      req.destroy(new Error('Timeout : serveur dev injoignable sur 127.0.0.1:5000 (5 s).'));
    });
  });
}

function askPhrase() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question('Phrase secrète (6 mots français séparés par un espace) : ', (answer) => {
      rl.close();
      resolve((answer || '').trim());
    });
  });
}

(async () => {
  try {
    console.log('=== Vérificateur OFFLINE de phrase secrète — Kheops 2 ===');
    console.log('   (la phrase ne quitte PAS cette machine)\n');

    const args = parseArgs();
    let salt, verifier, source;

    if (args.salt && args.verifier) {
      salt = args.salt.toLowerCase();
      verifier = args.verifier.toLowerCase();
      source = 'arguments CLI';
    } else {
      console.log('Récupération de la config cabinet depuis le serveur dev (127.0.0.1:5000)...');
      const conf = await fetchServerConfig();
      if (!conf.enabled) {
        console.log('\n⚠ La protection n\'est PAS activée pour ce cabinet (enabled=false).');
        console.log('   Aucune phrase secrète à vérifier — n\'importe quel mot serait accepté.\n');
        process.exit(0);
      }
      salt = conf.salt;
      verifier = conf.verifier;
      source = 'serveur dev';
      console.log('   Config récupérée :');
      console.log('     enabled    : ' + conf.enabled);
      console.log('     enabledAt  : ' + conf.enabledAt);
      console.log('     version    : ' + conf.version);
      console.log('     salt       : ' + salt);
      console.log('     verifier   : ' + verifier.slice(0, 16) + '...');
    }

    if (!/^[0-9a-f]{32}$/i.test(salt)) {
      throw new Error('Salt invalide (attendu : hex 32 caractères, reçu : ' + (salt || 'vide') + ')');
    }
    if (!/^[0-9a-f]{64}$/i.test(verifier)) {
      throw new Error('Verifier invalide (attendu : hex 64 caractères, reçu : ' + (verifier || 'vide') + ')');
    }

    console.log('\nSource salt/verifier : ' + source);
    console.log('La phrase sera AFFICHÉE à l\'écran pendant la saisie (limitation de readline).');
    console.log('Pense à effacer l\'historique de ton terminal après si nécessaire.\n');

    const phrase = await askPhrase();
    if (!phrase) {
      console.log('Phrase vide — abandon.');
      process.exit(2);
    }

    // Validation syntaxique optionnelle (mots dans la wordlist) — non bloquante
    try {
      const diceware = require(path.join(__dirname, '..', 'shared', 'crypto', 'lib', 'diceware'));
      const v = diceware.validatePassphrase(phrase);
      if (!v.valid) {
        console.log('⚠ Validation syntaxique : ' + v.error);
        console.log('   (Tentative de vérification cryptographique quand même)\n');
      }
    } catch (_) { /* facultatif */ }

    console.log('Dérivation MasterKey en cours (scrypt, ~1-3 secondes)...');
    const t0 = Date.now();
    const saltBuf = Buffer.from(salt, 'hex');
    const masterKey = kheopsCrypto.deriveMasterKey(phrase, saltBuf);
    const ms = Date.now() - t0;
    console.log('Dérivation terminée en ' + ms + ' ms.');

    const computed = kheopsCrypto.computeVerifier(masterKey);
    const computedHex = typeof computed === 'string' ? computed : computed.toString('hex');

    // Comparaison case-insensitive (sécurisée car les deux côtés sont des hex)
    const ok = computedHex.toLowerCase() === verifier.toLowerCase();

    // Wipe best-effort de la MasterKey
    if (Buffer.isBuffer(masterKey)) masterKey.fill(0);

    if (ok) {
      console.log('\n✅ PHRASE CORRECTE — c\'est bien la phrase de ton cabinet.');
      console.log('   Tu peux l\'utiliser pour déverrouiller Kheops dans l\'application packagée.\n');
      process.exit(0);
    } else {
      console.log('\n❌ PHRASE INCORRECTE — cette phrase ne correspond pas au verifier du cabinet.');
      console.log('   Verifier attendu  : ' + verifier);
      console.log('   Verifier calculé  : ' + computedHex);
      console.log('   Réessaie avec une autre phrase, ou utilise la feuille de secours si tu l\'as.\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('\nErreur : ' + (err && err.message ? err.message : err));
    process.exit(2);
  }
})();
