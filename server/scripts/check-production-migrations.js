#!/usr/bin/env node
/*
 * Garde de lecture seule exécutée par deploy.sh avant toute mutation GCP.
 * Elle empêche l'activation des registres relationnel/documentaire tant que les
 * migrations de production explicites ne sont pas terminées sans erreur.
 *
 * Lit toujours MONGODB_URI dans server/.env (fichier de déploiement), jamais
 * dans process.env ni dans un autre .env. Appelée sans argument par deploy.sh ;
 * `--target=preprod` est accepté, toute autre cible est refusée.
 *
 * main() est exportée pour les tests (argv, chemin du fichier et journal
 * injectables) ; le script ne s'exécute que lancé directement.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { readDeploymentMongoUri, describeMongoUri } = require('../config/mongoTarget');

const ROOT = path.join(__dirname, '..', '..');
const DEPLOYMENT_ENV_PATH = path.join(ROOT, 'server', '.env');

const TENANT_ID = '6a4717e6e32d5a7d3a5ad059';
const USER_ID = '698941d40c8df05d76c7740e';
const EXPECTED_RUNS = [
  { runId: 'contacts-20260710-v1', domain: 'relations' },
  { runId: 'relations-20260710-v1', domain: 'relations' },
  { runId: 'documents-20260710-v1', domain: 'documents' },
];

async function assertEditorV2Applied() {
  const DocumentEditorState = require('../models/DocumentEditor/DocumentEditorState');
  const DocumentEditorRevision = require('../models/DocumentEditor/DocumentEditorRevision');
  const DocumentHistory = require('../models/Storage/DocumentHistory');
  const StoredDocument = require('../models/Storage/StoredDocument');
  const [states, revisions, histories, stored] = await Promise.all([
    DocumentEditorState.countDocuments({
      tenantId: TENANT_ID,
      $or: [
        { status: 'approved' },
        { status: { $exists: false } },
        { documentType: { $exists: false } },
        { localOverrides: { $exists: false } },
      ],
    }),
    DocumentEditorRevision.countDocuments({ tenantId: TENANT_ID, status: 'approved' }),
    DocumentHistory.countDocuments({ tenantId: TENANT_ID, 'versions.status': 'approved' }),
    StoredDocument.countDocuments({ tenantId: TENANT_ID, 'versions.status': 'approved' }),
  ]);
  const pending = states + revisions + histories + stored;
  if (pending) throw new Error(`document-editor-v2: ${pending} élément(s) encore au format historique`);
}

async function assertMailAccountsApplied() {
  const User = require('../models/App_Users/User');
  const OAuthMailAccount = require('../models/Mail/OAuthMailAccount');
  const users = await User.find({
    $or: [
      { googleRefreshToken: { $nin: [null, ''] } },
      { microsoftRefreshToken: { $nin: [null, ''] } },
    ],
  }).select('_id googleRefreshToken microsoftRefreshToken').lean();
  const ownerIds = users.map((user) => user._id);
  const accounts = await OAuthMailAccount.find({ ownerUserId: { $in: ownerIds } })
    .select('ownerUserId provider legacyTokenField +encryptedRefreshToken').lean();
  const usable = new Set(accounts
    .filter((account) => account.encryptedRefreshToken || account.legacyTokenField)
    .map((account) => `${account.ownerUserId}:${account.provider}`));
  const missing = [];
  for (const user of users) {
    if (user.googleRefreshToken && !usable.has(`${user._id}:google`)) missing.push(`${user._id}:google`);
    if (user.microsoftRefreshToken && !usable.has(`${user._id}:microsoft`)) missing.push(`${user._id}:microsoft`);
  }
  if (missing.length) throw new Error(`migrate-mail-accounts: ${missing.length} compte(s) historique(s) non relié(s)`);
}

async function main({ argv = process.argv, envPath = DEPLOYMENT_ENV_PATH, logger = console } = {}) {
  // Même source immuable que deploy.sh et predeploy-check.js. Ne charge jamais
  // le .env racine, ni une valeur MONGODB_URI déjà présente dans le processus.
  // Garde de deploiement : seule la base de deploiement a un sens ici. Un
  // --target explicite est accepte s'il vaut preprod (scripts/gcp/deploy.sh
  // appelle ce script sans argument) ; toute autre cible est refusee.
  const targets = argv.filter((arg) => String(arg).startsWith('--target='));
  if (targets.some((arg) => arg !== '--target=preprod')) {
    throw new Error(`cette garde ne vise que la base de deploiement (${targets.join(' ')} refuse ; seul --target=preprod est accepte).`);
  }
  if (!fs.existsSync(envPath)) throw new Error(`fichier d'environnement absent: ${envPath}`);
  const mongoUri = readDeploymentMongoUri(envPath);
  if (!mongoUri) throw new Error('MONGODB_URI absent.');
  const described = describeMongoUri(mongoUri);
  logger.log(`[DB] script=check-production-migrations cible=preprod base=${described.dbName} empreinte=${described.fingerprint}`);
  mongoose.set('autoIndex', false);
  await mongoose.connect(mongoUri, { autoIndex: false });
  const DataMigrationRun = require('../models/Documents/DataMigrationRun');
  const rows = await DataMigrationRun.find({
    tenantId: TENANT_ID,
    runId: { $in: EXPECTED_RUNS.map((item) => item.runId) },
  }).select('runId domain status stats.errors startedBy').lean();
  const byRunId = new Map(rows.map((row) => [row.runId, row]));
  const failures = [];
  for (const expected of EXPECTED_RUNS) {
    const row = byRunId.get(expected.runId);
    if (!row) {
      failures.push(`${expected.runId}: absente`);
      continue;
    }
    if (row.domain !== expected.domain) failures.push(`${expected.runId}: domaine ${row.domain}`);
    if (row.status !== 'completed') failures.push(`${expected.runId}: statut ${row.status}`);
    if (Number(row.stats?.errors || 0) !== 0) failures.push(`${expected.runId}: ${row.stats.errors} erreur(s)`);
    if (String(row.startedBy || '') !== USER_ID) failures.push(`${expected.runId}: acteur inattendu`);
  }
  if (failures.length) {
    throw new Error(`migrations de production non validées (${failures.join('; ')}). Utiliser scripts/gcp/apply-migrations.sh après autorisation.`);
  }
  await assertEditorV2Applied();
  await assertMailAccountsApplied();
  logger.log('[Migrations] Trois run-id stables et les migrations éditeur/messagerie sont validés.');
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`[Migrations] ERREUR : ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => {});
    });
}

module.exports = { main, DEPLOYMENT_ENV_PATH };
