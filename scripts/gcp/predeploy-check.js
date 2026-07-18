#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const envFile = path.resolve(ROOT, process.argv[2] || 'server/.env');

function fail(message) {
  console.error(`[Pré-déploiement] ERREUR : ${message}`);
  process.exitCode = 1;
}

function parseEnv(file) {
  const values = {};
  const firstLineByKey = new Map();
  const duplicates = [];

  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const separator = line.indexOf('=');
    if (separator < 1) return;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (firstLineByKey.has(key)) {
      duplicates.push({ key, firstLine: firstLineByKey.get(key), duplicateLine: lineNumber });
    } else {
      firstLineByKey.set(key, lineNumber);
    }
    values[key] = value;
  });

  return { values, duplicates };
}

function sourceExists(relative) {
  const absolute = path.join(ROOT, relative);
  if (!fs.existsSync(absolute)) fail(`fichier requis absent : ${relative}`);
}

if (!fs.existsSync(envFile)) {
  fail(`fichier d'environnement absent : ${envFile}`);
} else {
  const { values: env, duplicates } = parseEnv(envFile);
  for (const duplicate of duplicates) {
    fail(`variable ${duplicate.key} définie plusieurs fois (lignes ${duplicate.firstLine} et ${duplicate.duplicateLine}).`);
  }

  // Ces valeurs correspondent aux liaisons de secrets déjà utilisées par
  // la production. Les rendre obligatoires évite qu'un déploiement désactive
  // silencieusement OAuth ou l'envoi d'e-mails.
  const required = [
    'MONGODB_URI',
    'JWT_SECRET',
    'TOKEN_ENCRYPTION_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GMAIL_USER',
    'GMAIL_APP_PASSWORD',
    'MICROSOFT_CLIENT_ID',
    'MAIL_WEBHOOK_SECRET',
    'GMAIL_PUBSUB_TOPIC',
  ];
  for (const key of required) {
    if (!env[key]) fail(`${key} est absent du fichier d'environnement.`);
  }

  const weak = new Set(['changeme', 'secret', 'your_jwt_secret_here', 'jwt_secret']);
  if (weak.has(String(env.JWT_SECRET || '').toLowerCase()) || String(env.JWT_SECRET || '').length < 32) {
    fail('JWT_SECRET est absent, connu ou trop court (32 caractères minimum).');
  }
  if (!/^[0-9a-f]{64}$/i.test(String(env.TOKEN_ENCRYPTION_KEY || ''))) {
    fail('TOKEN_ENCRYPTION_KEY doit contenir exactement 64 caractères hexadécimaux (32 octets).');
  }
  if (env.TOKEN_ENCRYPTION_KEY === env.JWT_SECRET) {
    fail('TOKEN_ENCRYPTION_KEY et JWT_SECRET doivent être deux secrets distincts.');
  }
  if (String(env.MAIL_WEBHOOK_SECRET || '').length < 32) {
    fail('MAIL_WEBHOOK_SECRET doit contenir au moins 32 caractères.');
  }
  if (!/^projects\/kheops-2\/topics\/[A-Za-z0-9._~-]+$/.test(String(env.GMAIL_PUBSUB_TOPIC || ''))) {
    fail('GMAIL_PUBSUB_TOPIC doit cibler un topic du projet kheops-2.');
  }

  const mongoUri = String(env.MONGODB_URI || '');
  if (!/^mongodb(?:\+srv)?:\/\//i.test(mongoUri)) {
    fail('MONGODB_URI doit utiliser le schéma mongodb:// ou mongodb+srv://.');
  }
  try {
    const hostname = new URL(mongoUri).hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
      fail('MONGODB_URI ne doit pas cibler une base locale pour un déploiement de production.');
    }
  } catch (_) {
    fail('MONGODB_URI est syntaxiquement invalide.');
  }

  if (env.AI_SECRET_PROVIDER && !['gcp', 'google-secret-manager', 'encrypted-mongo', 'mongodb'].includes(env.AI_SECRET_PROVIDER)) {
    fail('AI_SECRET_PROVIDER doit valoir gcp, google-secret-manager, encrypted-mongo ou mongodb.');
  }
  if (['encrypted-mongo', 'mongodb'].includes(env.AI_SECRET_PROVIDER || '') && !env.AI_SECRET_MASTER_KEY) {
    fail('AI_SECRET_MASTER_KEY est requis avec le coffre encrypted-mongo.');
  }
}

[
  'server/routes/ai.js',
  'server/services/ai/gateway.js',
  'server/services/ai/taskService.js',
  'server/models/AI/AITask.js',
  'client/src/components/ai/AIAssistantPanel.js',
  'client/src/components/documentEditor/KheopsDocumentEditor.js',
  'server/routes/relations.js',
  'server/routes/documentSync.js',
  'server/services/sync/documentSyncWorker.js',
  'server/services/sync/documentSyncWorkerLoop.js',
  'server/services/mail/mailWorkerLoop.js',
  'server/services/mail/mailSubscriptionService.js',
  'server/routes/mailSync.js',
  'server/scripts/migrate-contact-identities.js',
  'server/scripts/migrate-legacy-relations.js',
  'server/scripts/migrate-logical-documents.js',
  'server/scripts/migrate-mail-accounts.js',
  'server/scripts/migrate-document-editor-v2.js',
  'server/scripts/check-production-migrations.js',
  'scripts/gcp/apply-migrations.sh',
  'scripts/gcp/deploy.ps1',
  'client/public/config.js',
  'Dockerfile',
].forEach(sourceExists);

if (!process.exitCode) {
  console.log('[Pré-déploiement] Sources, garde-fous et variables obligatoires présents.');
  console.log('[Pré-déploiement] Doublons absents ; clé de chiffrement hex64 et URI Mongo de production validées.');
  console.log('[Pré-déploiement] Aucune valeur secrète n’a été affichée.');
}
