// server/scripts/backfill-tenant-id.js
//
// MIGRATION — Backfill `tenantId` (tâche E, AI_COORDINATION.md).
//
// Rend le vrai cabinet (`Tenant._id`) aux données Codex qui avaient été
// persistées avec `tenantId = userId` (fallback tant que `requireTenant`
// n'était pas chaîné). À exécuter DANS LE MÊME DÉPLOIEMENT que le chaînage de
// `requireTenant` (server/routes/storage.js + mailAccounts.js), sinon les
// données existantes deviennent invisibles.
//
// Collections traitées :
//   - StoredDocument        (ownerUserId → tenant du propriétaire)
//   - MailAccount           (ownerUserId → tenant du propriétaire)
//   - StorageProviderConfig (tenantId stocké = userId → cabinet ; fusion des
//                            collisions sur l'index unique {tenantId})
//
// SÉCURITÉ : DRY-RUN par défaut (n'écrit RIEN, affiche seulement le plan).
// Cible de base OBLIGATOIRE : --target=dev|test|preprod (scripts/lib/dbTarget.js).
//   Prévisualiser :  node scripts/backfill-tenant-id.js --target=dev
//   Appliquer     :  node scripts/backfill-tenant-id.js --target=dev --apply
//   Verbeux       :  ... --verbose   (liste chaque _id)
//   Préproduction :  KHEOPS_DB_OVERRIDE=preprod KHEOPS_DB_OVERRIDE_REASON="motif" \
//                    node scripts/backfill-tenant-id.js --target=preprod --confirm-preprod [--apply]
//
// Idempotent : relançable sans dégât (les enregistrements déjà migrés sont
// "unchanged" / "skippedAlreadyTenant").
//
// Note bash (PATH cassé) : préfixer par
//   export PATH="/usr/bin:/bin:/c/Program Files/Git/usr/bin:/c/Program Files/nodejs:$PATH"

const path = require('path');
// Cible de base explicite (--target=...) : plus aucun .env implicite.
const { resolveScriptTarget, connectForScript } = require('./lib/dbTarget');

const mongoose = require('mongoose');
const {
  planOwnerScopedUpdates,
  planStorageConfigUpdates,
} = require('./lib/tenantBackfill');

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

function log(...args) {
  console.log(...args);
}
function vlog(...args) {
  if (VERBOSE) console.log('   ', ...args);
}

function isValidId(value) {
  return value && mongoose.Types.ObjectId.isValid(String(value));
}

async function main() {
  // Cible resolue avant toute sortie : une cible absente ou ambigue arrete ici.
  resolveScriptTarget({ argv: process.argv });

  log('==============================================================');
  log(`  Backfill tenantId — mode ${APPLY ? 'APPLY (écriture réelle)' : 'DRY-RUN (aucune écriture)'}`);
  log('==============================================================\n');

  await connectForScript({ argv: process.argv, purpose: 'backfill-tenant-id' });

  const User = require(path.join(__dirname, '..', 'models', 'App_Users', 'User'));
  const Tenant = require(path.join(__dirname, '..', 'models', 'Cabinet', 'Tenant'));
  const StoredDocument = require(path.join(__dirname, '..', 'models', 'Storage', 'StoredDocument'));
  const MailAccount = require(path.join(__dirname, '..', 'models', 'Mail', 'MailAccount'));
  const StorageProviderConfig = require(path.join(__dirname, '..', 'models', 'Storage', 'StorageProviderConfig'));
  const { resolveTenantId } = require(path.join(__dirname, '..', 'services', 'tenantService'));

  // ----- Résolveurs mis en cache (async → maps synchrones pour la logique pure)
  const tenantCache = new Map(); // userId -> targetTenantId (string) | null
  const willCreate = new Set(); // userIds sans cabinet (dry-run)

  async function resolveUserTenant(userId) {
    const key = String(userId);
    if (tenantCache.has(key)) return tenantCache.get(key);
    let target = null;
    try {
      if (isValidId(userId)) {
        const user = await User.findById(userId).select('tenantId').lean();
        if (user && user.tenantId) {
          target = String(user.tenantId);
        } else if (user) {
          // Utilisateur sans cabinet : en APPLY on le crée (paresseux),
          // en DRY-RUN on signale sans écrire.
          if (APPLY) target = String(await resolveTenantId(userId));
          else { target = `new:${key}`; willCreate.add(key); }
        }
      }
    } catch (err) {
      console.error(`  [resolveUserTenant] ${key}: ${err.message}`);
      target = null;
    }
    tenantCache.set(key, target);
    return target;
  }

  const classifyCache = new Map(); // id -> 'user' | 'tenant' | 'unknown'
  async function classifyId(id) {
    const key = String(id);
    if (classifyCache.has(key)) return classifyCache.get(key);
    let kind = 'unknown';
    try {
      if (isValidId(id)) {
        if (await Tenant.exists({ _id: id })) kind = 'tenant';
        else if (await User.exists({ _id: id })) kind = 'user';
      }
    } catch (err) {
      console.error(`  [classifyId] ${key}: ${err.message}`);
    }
    classifyCache.set(key, kind);
    return kind;
  }

  // ============================================================
  // 1) StoredDocument + MailAccount (cloisonnées par ownerUserId)
  // ============================================================
  const ownerScoped = [
    { label: 'StoredDocument', Model: StoredDocument },
    { label: 'MailAccount', Model: MailAccount },
  ];

  const summary = {};

  for (const { label, Model } of ownerScoped) {
    const records = await Model.find({}, { _id: 1, tenantId: 1, ownerUserId: 1 }).lean();
    // Pré-résoudre le cabinet de chaque propriétaire distinct.
    const owners = [...new Set(records.map((r) => r.ownerUserId && String(r.ownerUserId)).filter(Boolean))];
    for (const o of owners) await resolveUserTenant(o);
    const tenantOfUser = (u) => tenantCache.get(String(u)) || null;

    const plan = planOwnerScopedUpdates(records, tenantOfUser);
    summary[label] = {
      total: records.length,
      toUpdate: plan.updates.length,
      unchanged: plan.unchanged,
      skippedNoOwner: plan.skippedNoOwner.length,
      skippedUnresolved: plan.skippedUnresolved.length,
    };

    log(`— ${label} : ${records.length} doc(s) — ${plan.updates.length} à remapper, ` +
      `${plan.unchanged} déjà ok, ${plan.skippedNoOwner.length} sans owner, ` +
      `${plan.skippedUnresolved.length} irrésolus.`);
    for (const u of plan.updates) vlog(`${u._id}: ${u.from} → ${u.to} (owner ${u.ownerUserId})`);
    if (plan.skippedNoOwner.length) console.warn(`   ⚠ ${label} sans ownerUserId : ${plan.skippedNoOwner.join(', ')}`);
    if (plan.skippedUnresolved.length) console.warn(`   ⚠ ${label} owner sans cabinet résolu : ${plan.skippedUnresolved.join(', ')}`);

    if (APPLY && plan.updates.length) {
      const ops = plan.updates.map((u) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(u._id) },
          update: { $set: { tenantId: new mongoose.Types.ObjectId(u.to) } },
        },
      }));
      const res = await Model.bulkWrite(ops, { ordered: false });
      log(`   ✔ ${label} : ${res.modifiedCount} document(s) mis à jour.`);
    }
  }

  // ============================================================
  // 2) StorageProviderConfig (pas de ownerUserId ; tenantId = userId)
  // ============================================================
  const configs = await StorageProviderConfig
    .find({}, { _id: 1, tenantId: 1, provider: 1, usedBytes: 1, quotaBytes: 1 })
    .lean();

  // Pré-classer chaque tenantId stocké, et pré-résoudre les userIds.
  for (const c of configs) {
    if (!c.tenantId) continue;
    const kind = await classifyId(c.tenantId);
    if (kind === 'user') await resolveUserTenant(c.tenantId);
  }
  const classify = (id) => classifyCache.get(String(id)) || 'unknown';
  const tenantOfUser = (u) => tenantCache.get(String(u)) || null;

  const cfgPlan = planStorageConfigUpdates(configs, classify, tenantOfUser);
  summary.StorageProviderConfig = {
    total: configs.length,
    toUpdate: cfgPlan.updates.length,
    merges: cfgPlan.merges.length,
    skippedAlreadyTenant: cfgPlan.skippedAlreadyTenant.length,
    skippedUnknown: cfgPlan.skippedUnknown.length,
  };

  log(`\n— StorageProviderConfig : ${configs.length} config(s) — ${cfgPlan.updates.length} à remapper, ` +
    `${cfgPlan.merges.length} fusion(s), ${cfgPlan.skippedAlreadyTenant.length} déjà migrées, ` +
    `${cfgPlan.skippedUnknown.length} inconnues.`);
  for (const u of cfgPlan.updates) vlog(`${u._id}: ${u.from} → ${u.to}`);
  for (const m of cfgPlan.merges) {
    console.warn(`   ⚠ FUSION cabinet ${m.target} : garde ${m.keep}, supprime [${m.drop.join(', ')}] ` +
      `→ provider=${m.mergedProvider}, quota=${m.mergedQuotaBytes}, used=${m.mergedUsedBytes} ` +
      `(usedBytes = MAX conservateur — à revérifier manuellement).`);
  }
  if (cfgPlan.skippedUnknown.length) console.warn(`   ⚠ config tenantId inconnu (ni user ni tenant) : ${cfgPlan.skippedUnknown.join(', ')}`);

  if (APPLY) {
    // a) Fusions d'abord : appliquer les valeurs fusionnées au gagnant + supprimer les perdants.
    for (const m of cfgPlan.merges) {
      await StorageProviderConfig.updateOne(
        { _id: new mongoose.Types.ObjectId(m.keep) },
        { $set: { provider: m.mergedProvider, quotaBytes: m.mergedQuotaBytes, usedBytes: m.mergedUsedBytes } },
      );
      if (m.drop.length) {
        await StorageProviderConfig.deleteMany({ _id: { $in: m.drop.map((id) => new mongoose.Types.ObjectId(id)) } });
      }
    }
    // b) Remaps tenantId. Catch dup-key (collision avec une config déjà migrée au même cabinet).
    let cfgUpdated = 0;
    for (const u of cfgPlan.updates) {
      try {
        const res = await StorageProviderConfig.updateOne(
          { _id: new mongoose.Types.ObjectId(u._id) },
          { $set: { tenantId: new mongoose.Types.ObjectId(u.to) } },
        );
        cfgUpdated += res.modifiedCount || 0;
      } catch (err) {
        if (err && (err.code === 11000 || err.codeName === 'DuplicateKey')) {
          console.warn(`   ⚠ config ${u._id} → ${u.to} : collision (une config existe déjà pour ce cabinet). ` +
            `Laissée en l'état — à fusionner manuellement.`);
        } else {
          throw err;
        }
      }
    }
    log(`   ✔ StorageProviderConfig : ${cfgUpdated} config(s) remappée(s), ${cfgPlan.merges.length} fusion(s).`);
  }

  // ----- Résumé
  log('\n==============================================================');
  log('  RÉSUMÉ');
  log('==============================================================');
  for (const [label, s] of Object.entries(summary)) {
    log(`  ${label}: ${JSON.stringify(s)}`);
  }
  if (!APPLY) {
    if (willCreate.size) {
      log(`\n  (DRY-RUN) ${willCreate.size} utilisateur(s) sans cabinet — un Tenant serait créé à l'exécution.`);
    }
    log('\n  DRY-RUN : rien n\'a été écrit. Relancer avec --apply pour appliquer.');
    log('  ⚠ À exécuter dans le MÊME déploiement que le chaînage de requireTenant.');
  } else {
    log('\n  ✔ Migration appliquée. Vérifier ensuite que le chaînage requireTenant est déployé.');
  }

  await mongoose.disconnect();
  log('\n[backfill] Terminé.');
}

main().catch((err) => {
  console.error('[backfill] ERREUR :', err);
  process.exit(1);
});
