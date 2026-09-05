/*
 * Exécute UNE opération de synchronisation journalisée. Le worker appelle les
 * services directement : aucune route utilisateur privilégiée n'est requise.
 *
 * node server/scripts/run-document-sync-worker.js --target=dev|test|preprod \
 *   --tenant=<ObjectId> --operation=<operationId> --worker-id=<instance-stable>
 * (preprod : --confirm-preprod + KHEOPS_DB_OVERRIDE=preprod + KHEOPS_DB_OVERRIDE_REASON)
 */
// Cible de base explicite (--target=...) : plus aucun .env implicite.
const { connectForScript } = require('./lib/dbTarget');
const mongoose = require('mongoose');

function option(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

async function main() {
  const tenantId = option('tenant');
  const operationId = option('operation');
  const workerId = option('worker-id') || `document-sync-${process.pid}`;
  if (!mongoose.Types.ObjectId.isValid(String(tenantId || ''))) throw new Error('--tenant=<ObjectId> obligatoire.');
  if (!operationId) throw new Error('--operation=<operationId> obligatoire.');
  await connectForScript({ argv: process.argv, purpose: 'run-document-sync-worker' });
  try {
    const worker = require('../services/sync/documentSyncWorker');
    const result = await worker.execute({ tenantId, operationId, workerId });
    console.log(JSON.stringify({
      operationId,
      status: result.operation?.status || null,
      succeeded: Boolean(result.succeeded),
      conflict: Boolean(result.conflict),
      failed: Boolean(result.failed),
      idempotent: Boolean(result.idempotent),
    }, null, 2));
    if (result.failed) process.exitCode = 2;
    if (result.conflict) process.exitCode = 3;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('[run-document-sync-worker]', error);
  process.exitCode = 1;
});
