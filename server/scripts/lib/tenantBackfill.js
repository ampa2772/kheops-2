// server/scripts/lib/tenantBackfill.js
//
// Logique PURE (sans base de données) de la migration de backfill `tenantId`
// (tâche E — AI_COORDINATION.md). Testée dans __tests__/tenantBackfill.test.js.
// L'orchestration réelle (connexion Mongo, lecture/écriture) vit dans
// server/scripts/backfill-tenant-id.js et ne fait qu'appeler ces fonctions.
//
// CONTEXTE — pourquoi cette migration existe :
//   Les routes Codex (`/api/storage`, `/api/mail`) cloisonnent par `tenantId`
//   via `resolveTenantId(req)` = `req.tenantId || req.user`. Tant que
//   `requireTenant` n'était pas chaîné, `req.tenantId` était absent → les
//   documents/comptes/config ont été persistés avec `tenantId = userId`.
//   Au chaînage de `requireTenant`, `req.tenantId` devient le VRAI cabinet
//   (`resolveTenantId(userId)` = Tenant._id). Sans backfill, les données
//   existantes (clé = userId) deviennent invisibles → orphelines.
//
// STRATÉGIE de remap :
//   - StoredDocument / MailAccount : possèdent `ownerUserId` → cible =
//     tenant du propriétaire = `tenantOfUser(ownerUserId)`. Robuste et
//     idempotent quelle que soit la valeur actuelle de `tenantId`.
//   - StorageProviderConfig : PAS de `ownerUserId`. La valeur `tenantId`
//     stockée EST un userId (le fallback). On la reclasse : si c'est un
//     User → remap vers son cabinet ; si c'est déjà un Tenant → déjà migré
//     (skip) ; sinon inconnu (skip + alerte).

/** Normalise un id (ObjectId | string | {toString}) en chaîne, ou null. */
function idStr(value) {
  if (value === null || value === undefined) return null;
  const s = String(value);
  return s.length ? s : null;
}

/**
 * Planifie le remap des collections cloisonnées par propriétaire
 * (StoredDocument, MailAccount). La cible de chaque enregistrement est le
 * cabinet de son `ownerUserId`.
 *
 * @param {Array<{_id:*, tenantId:*, ownerUserId:*}>} records
 * @param {(userId:string)=>(string|null)} tenantOfUser  userId -> tenantId cible (chaîne) ou null si irrésolu
 * @returns {{
 *   updates: Array<{_id:string, from:(string|null), to:string, ownerUserId:string}>,
 *   unchanged: number,
 *   skippedNoOwner: Array<string>,
 *   skippedUnresolved: Array<string>
 * }}
 */
function planOwnerScopedUpdates(records, tenantOfUser) {
  const updates = [];
  const skippedNoOwner = [];
  const skippedUnresolved = [];
  let unchanged = 0;

  for (const rec of records || []) {
    const recId = idStr(rec && rec._id);
    const ownerId = idStr(rec && rec.ownerUserId);
    if (!ownerId) {
      if (recId) skippedNoOwner.push(recId);
      continue;
    }
    const target = idStr(tenantOfUser(ownerId));
    if (!target) {
      if (recId) skippedUnresolved.push(recId);
      continue;
    }
    const current = idStr(rec && rec.tenantId);
    if (current === target) {
      unchanged += 1;
      continue;
    }
    updates.push({ _id: recId, from: current, to: target, ownerUserId: ownerId });
  }

  return { updates, unchanged, skippedNoOwner, skippedUnresolved };
}

/**
 * Choisit le config "gagnant" quand plusieurs StorageProviderConfig mappent
 * vers le MÊME cabinet cible (collision sur l'index unique {tenantId}).
 * Règle : on privilégie l'espace consommé réel (usedBytes le plus élevé), puis
 * le provider non-défaut (choix explicite de l'avocat), puis le quota le plus
 * élevé, puis l'_id le plus ancien (stable). Fonction PURE et déterministe.
 *
 * @param {Array<{_id:*, provider?:string, usedBytes?:number, quotaBytes?:number}>} configs
 * @returns {object} le config gagnant (référence de l'entrée d'origine)
 */
function chooseConfigWinner(configs) {
  const list = (configs || []).slice();
  list.sort((a, b) => {
    const ub = (b.usedBytes || 0) - (a.usedBytes || 0);
    if (ub !== 0) return ub;
    const defA = (a.provider || 'managed_gcs') === 'managed_gcs' ? 1 : 0;
    const defB = (b.provider || 'managed_gcs') === 'managed_gcs' ? 1 : 0;
    if (defA !== defB) return defA - defB; // non-défaut d'abord
    const qb = (b.quotaBytes || 0) - (a.quotaBytes || 0);
    if (qb !== 0) return qb;
    return idStr(a._id) < idStr(b._id) ? -1 : 1; // _id stable
  });
  return list[0];
}

/**
 * Planifie le remap des StorageProviderConfig (sans ownerUserId).
 *
 * @param {Array<{_id:*, tenantId:*, provider?:string, usedBytes?:number, quotaBytes?:number}>} configs
 * @param {(id:string)=>('user'|'tenant'|'unknown')} classify  nature de la valeur tenantId stockée
 * @param {(userId:string)=>(string|null)} tenantOfUser
 * @returns {{
 *   updates: Array<{_id:string, from:string, to:string}>,
 *   merges: Array<{ target:string, keep:string, drop:string[], mergedProvider:string, mergedQuotaBytes:number, mergedUsedBytes:number }>,
 *   skippedAlreadyTenant: Array<string>,
 *   skippedUnknown: Array<string>
 * }}
 */
function planStorageConfigUpdates(configs, classify, tenantOfUser) {
  const skippedAlreadyTenant = [];
  const skippedUnknown = [];

  // 1. Résoudre la cible de chaque config remappable.
  //    byTarget: tenantId cible -> [{config, from}]
  const byTarget = new Map();
  for (const cfg of configs || []) {
    const cfgId = idStr(cfg && cfg._id);
    const stored = idStr(cfg && cfg.tenantId);
    if (!cfgId || !stored) continue;
    const kind = classify(stored);
    if (kind === 'tenant') {
      skippedAlreadyTenant.push(cfgId);
      continue;
    }
    if (kind !== 'user') {
      skippedUnknown.push(cfgId);
      continue;
    }
    const target = idStr(tenantOfUser(stored));
    if (!target) {
      skippedUnknown.push(cfgId);
      continue;
    }
    if (!byTarget.has(target)) byTarget.set(target, []);
    byTarget.get(target).push({ config: cfg, from: stored });
  }

  // 2. Émettre updates + merges.
  const updates = [];
  const merges = [];
  for (const [target, entries] of byTarget.entries()) {
    if (entries.length === 1) {
      const { config, from } = entries[0];
      // Un config peut déjà pointer vers la bonne cible mais avoir été classé
      // 'user' à tort — on ne l'émet que s'il change réellement.
      if (from !== target) {
        updates.push({ _id: idStr(config._id), from, to: target });
      }
      continue;
    }
    // Collision : plusieurs configs -> un même cabinet. On fusionne.
    const winner = chooseConfigWinner(entries.map((e) => e.config));
    const winnerId = idStr(winner._id);
    const drop = entries
      .map((e) => idStr(e.config._id))
      .filter((id) => id !== winnerId);
    const mergedQuotaBytes = entries.reduce(
      (m, e) => Math.max(m, e.config.quotaBytes || 0),
      0,
    );
    // usedBytes : MAX (conservateur ; le cumul réel doit être revérifié
    // manuellement — cf. log). On ne somme pas pour éviter un double comptage.
    const mergedUsedBytes = entries.reduce(
      (m, e) => Math.max(m, e.config.usedBytes || 0),
      0,
    );
    merges.push({
      target,
      keep: winnerId,
      drop,
      mergedProvider: winner.provider || 'managed_gcs',
      mergedQuotaBytes,
      mergedUsedBytes,
    });
    // Le gagnant est mis à jour vers la cible s'il ne l'a pas déjà.
    const winnerEntry = entries.find((e) => idStr(e.config._id) === winnerId);
    if (winnerEntry && winnerEntry.from !== target) {
      updates.push({ _id: winnerId, from: winnerEntry.from, to: target });
    }
  }

  return { updates, merges, skippedAlreadyTenant, skippedUnknown };
}

module.exports = {
  idStr,
  planOwnerScopedUpdates,
  chooseConfigWinner,
  planStorageConfigUpdates,
};
