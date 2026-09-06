// server/services/storage/documentMigrator.js
// ------------------------------------------------------------------------
// MIGRATION / BACKFILL des DOCUMENTS existants vers le cloud PERSONNEL de
// l'utilisateur (OneDrive / SharePoint / Google Drive).
//
// Complement de matterFolderMaterializer.js (qui, lui, ne cree que la
// STRUCTURE de dossiers cloud, VIDE). Ici on s'occupe du CONTENU : les
// documents deposes AVANT que l'utilisateur ne connecte son cloud personnel
// ont leur octet physique dans le stockage interne (managed_gcs). Resultat :
// le dossier apparait bien dans OneDrive/l'explorateur, mais VIDE. Ce module
// recopie ces documents vers le cloud de l'utilisateur, au VRAI NOM de dossier,
// et repointe le storageKey pour que l'app lise desormais depuis ce cloud.
//
// PRINCIPES (voulus, prudents — prod juridique) :
//   - PORTEE : uniquement les documents dont la version courante est encore sur
//     managed_gcs (cle SANS prefixe « scheme: »). Les documents deja sur un
//     cloud PAR UTILISATEUR (onedrive:/sharepoint:/googledrive:) sont IGNORES
//     (deja visibles quelque part) -> idempotence naturelle.
//   - CIBLE : le provider d'upload de l'utilisateur (getUploadProvider). Si
//     c'est managed_gcs (aucun cloud perso connecte) -> on ne migre RIEN.
//   - NON DESTRUCTIF : l'octet GCS d'origine n'est PAS supprime (filet de
//     securite). On ne fait qu'AJOUTER une copie chez l'utilisateur et repointer
//     le storageKey. Un job de menage pourra purger les orphelins plus tard.
//   - QUOTA INCHANGE : le document existe deja et est deja compte ; on ne
//     reserve/libere aucun quota (pas de reserveQuota ici).
//   - BEST-EFFORT : une erreur cloud sur un document ne bloque jamais les autres
//     ni l'appel appelant (fire-and-forget). Aucune exception ne remonte.
//   - ANTI-CONCURRENCE (2 niveaux, car le login ET l'ouverture d'un dossier
//     peuvent viser le meme document en meme temps) :
//       1. verrou en memoire PAR DOCUMENT (inFlightDocs) : evite le double
//          upload dans un MEME processus (login + open, double useEffect...).
//       2. REPOINTAGE COMPARE-AND-SWAP : le storageKey n'est repointe que s'il
//          vaut ENCORE l'ancienne cle managed_gcs. Si une autre migration a deja
//          repointe (autre instance Cloud Run — la ou le verrou memoire ne porte
//          pas), le CAS echoue et on SUPPRIME notre upload en doublon. C'est la
//          protection reelle contre le « fichier (1) » orphelin.
//     Un verrou de plus haut niveau (inFlight par utilisateur/dossier) evite en
//     plus de relancer un scan complet deja en cours.
// ------------------------------------------------------------------------

const StoredDocument = require('../../models/Storage/StoredDocument');
const Dossier = require('../../models/Folder/Dossier');
const {
  providers,
  providerNameForKey,
  getUploadProvider,
  assertUploadCompleted,
} = require('./index');
const { resolveTenantId } = require('../tenantService');
const { readableMatterFolder } = require('./matterFolderName');
const { backfillUserFolders } = require('./matterFolderMaterializer');

// Verrous en memoire (par processus) : evite les backfills concurrents.
const inFlight = new Set();          // verrou par utilisateur / dossier (scan)
const inFlightDocs = new Set();      // verrou par document (upload) — anti double upload

// Plafond de documents scannes par passe de backfill (borne le cout Mongo + les
// appels cloud d'une seule connexion). Idempotent : une passe ulterieure (login
// suivant, ouverture de dossier, bouton manuel) poursuit le reliquat.
const MAX_BACKFILL_DOCS = 1000;

// Cooldown du backfill declenche par LOGIN (par utilisateur, par instance) :
// evite de re-scanner toute la collection a CHAQUE connexion rapprochee. Les
// declencheurs deliberes (selection de site, bouton « Synchroniser », ouverture
// d'un dossier) ne sont PAS soumis a ce cooldown.
const LOGIN_BACKFILL_COOLDOWN_MS = 10 * 60 * 1000;
const lastLoginBackfillAt = new Map(); // userId -> timestamp (ms)

/** Provider SOURCE deduit du storageKey (auto-suffisant). managed_gcs si pas de prefixe. */
function sourceProviderForKey(storageKey) {
  const name = providerNameForKey(storageKey);
  return name ? providers[name] : providers.managed_gcs;
}

/** Version « courante » d'un document (ou la premiere a defaut). */
function currentVersion(doc) {
  if (!doc || !Array.isArray(doc.versions) || doc.versions.length === 0) return null;
  const byId = doc.versions.find((v) => String(v.versionId) === String(doc.currentVersionId));
  return byId || doc.versions[doc.versions.length - 1];
}

/**
 * Migre la VERSION COURANTE d'UN document depuis son stockage interne vers le
 * cloud PERSONNEL de l'utilisateur (repointe le storageKey). Idempotent, ne
 * leve jamais : renvoie { ok, reason?, provider? }.
 *
 * @param {object} args
 * @param {string|ObjectId} args.ownerUserId
 * @param {object} args.doc            document StoredDocument (lean OK)
 * @param {object} args.targetProvider provider d'upload de l'utilisateur (deja resolu)
 * @param {string|ObjectId} args.tenantId
 * @param {string|null} args.matterLabel  nom de dossier cloud lisible (ou null)
 */
async function migrateOneDocument({ ownerUserId, doc, targetProvider, tenantId, matterLabel }) {
  const version = currentVersion(doc);
  if (!version || !version.storageKey) return { ok: false, reason: 'version-introuvable' };

  const oldKey = version.storageKey;
  // Deja sur un cloud PAR UTILISATEUR -> rien a faire (idempotent).
  const sourceName=providerNameForKey(oldKey);
  if(!sourceName) return {ok:false,reason:'reference-inconnue'};
  if (sourceName!=='managed_gcs') return { ok: false, reason: 'deja-sur-cloud-perso' };
  // Cible sans espace utilisateur -> rien a faire.
  if (targetProvider.name === 'managed_gcs') return { ok: false, reason: 'cible-managed_gcs' };

  // Verrou PAR DOCUMENT (meme processus) : empeche deux migrations simultanees
  // du meme document (login + ouverture de dossier, double useEffect, deux
  // onglets...). Le CAS ci-dessous couvre en plus le cas multi-instances.
  const docGuard = `${doc._id}:${version.versionId}`;
  if (inFlightDocs.has(docGuard)) return { ok: false, reason: 'migration-en-cours' };
  inFlightDocs.add(docGuard);
  try {
    // 1) Telecharger l'octet depuis la source (managed_gcs).
    const source = sourceProviderForKey(oldKey);
    const buffer = await source.downloadVersion({ storageKey: oldKey });
    if (!Buffer.isBuffer(buffer)) return { ok: false, reason: 'download-non-buffer' };

    // 2) Reuploader vers le cloud de l'utilisateur, au VRAI NOM de dossier.
    const versionOrdinal =
      doc.versions.findIndex((v) => String(v.versionId) === String(version.versionId)) + 1;
    const uploaded = await targetProvider.uploadVersion({
      tenantId,
      matterId: doc.dossierId || null,
      documentId: doc.documentId,
      versionId: version.versionId,
      filename: version.filename,
      buffer,
      mime: version.mime,
      ownerUserId,
      matterLabel: matterLabel || null,
      versionOrdinal: versionOrdinal > 0 ? versionOrdinal : 1,
    });

    // 3) Confirmer la presence chez le fournisseur AVANT de repointer (sinon on
    //    laisserait le storageKey GCS d'origine, comme sur echec -> jamais de perte).
    await assertUploadCompleted(targetProvider, uploaded.storageKey);

    // 4) Repointage COMPARE-AND-SWAP : on ne repointe QUE si la version est
    //    ENCORE sur l'ancienne cle (managed_gcs). $elemMatch garantit que le '$'
    //    positionnel vise bien l'element (versionId + storageKey) matche. Si une
    //    autre migration concurrente (autre instance Cloud Run) a deja repointe,
    //    matchedCount = 0 -> notre upload est un DOUBLON qu'on supprime.
    const upd = await StoredDocument.updateOne(
      { _id: doc._id, versions: { $elemMatch: { versionId: version.versionId, storageKey: oldKey } } },
      {
        $set: {
          'versions.$.storageKey': uploaded.storageKey,
          'versions.$.size': typeof uploaded.size === 'number' ? uploaded.size : version.size,
        },
      },
    );
    const changed = !!upd && ((upd.modifiedCount || upd.nModified || upd.matchedCount || 0) > 0);
    if (!changed) {
      // Course perdue : une autre migration a deja repointe cette version. Notre
      // upload (fichier « (1) » distinct cree par conflictBehavior=rename) est un
      // doublon orphelin -> on le supprime (best-effort) pour ne rien laisser.
      try {
        if (typeof targetProvider.deleteVersion === 'function') {
          await targetProvider.deleteVersion({ storageKey: uploaded.storageKey });
        }
      } catch (_) { /* best effort : au pire un orphelin, jamais de perte */ }
      return { ok: false, reason: 'course-concurrente-nettoyee' };
    }

    return { ok: true, provider: uploaded.provider || targetProvider.name };
  } catch (err) {
    return { ok: false, reason: err.code || err.message || 'erreur-inconnue' };
  } finally {
    inFlightDocs.delete(docGuard);
  }
}

/** Construit une Map dossierId -> label cloud lisible pour un lot de documents. */
async function buildLabelMap(docs) {
  const ids = [
    ...new Set(docs.map((d) => (d.dossierId ? String(d.dossierId) : null)).filter(Boolean)),
  ];
  const labels = new Map();
  if (ids.length === 0) return labels;
  const dossiers = await Dossier.find({ _id: { $in: ids } })
    .select('reference dossier.dossier.nom')
    .lean();
  for (const d of dossiers) {
    labels.set(String(d._id), readableMatterFolder(d?.dossier?.dossier?.nom, d.reference));
  }
  return labels;
}

/**
 * Migre un LOT de documents (deja charges) vers le cloud de l'utilisateur.
 * Concurrence bornee pour menager Graph/Drive. Ne leve jamais.
 * @returns {Promise<{total,migrated,skipped,reasons}>}
 */
async function migrateDocuments(ownerUserId, docs, { concurrency = 3 } = {}) {
  const tenantId = await resolveTenantId(ownerUserId);
  const targetProvider = await getUploadProvider(tenantId, ownerUserId);

  // Aucun cloud perso -> rien a migrer (les octets restent dans le stockage interne).
  if (!targetProvider || targetProvider.name === 'managed_gcs') {
    return { total: docs.length, migrated: 0, skipped: docs.length, reasons: { 'cible-managed_gcs': docs.length } };
  }

  const labelMap = await buildLabelMap(docs);

  let migrated = 0;
  let skipped = 0;
  const reasons = {};

  for (let i = 0; i < docs.length; i += concurrency) {
    const batch = docs.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((doc) =>
        migrateOneDocument({
          ownerUserId,
          doc,
          targetProvider,
          tenantId,
          matterLabel: doc.dossierId ? labelMap.get(String(doc.dossierId)) || null : null,
        }),
      ),
    );
    for (const r of results) {
      if (r.ok) migrated += 1;
      else {
        skipped += 1;
        reasons[r.reason] = (reasons[r.reason] || 0) + 1;
      }
    }
  }
  return { total: docs.length, migrated, skipped, reasons };
}

/**
 * BACKFILL DOCUMENTS — migre TOUS les documents (version courante) encore sur le
 * stockage interne de l'utilisateur vers son cloud personnel. Idempotent.
 * @returns {Promise<{total,migrated,skipped,reasons}>}
 */
async function backfillUserDocuments(ownerUserId, { limit = MAX_BACKFILL_DOCS } = {}) {
  const guardKey = `docs:${ownerUserId}`;
  if (inFlight.has(guardKey)) return { total: 0, migrated: 0, skipped: 0, reasons: { 'deja-en-cours': 1 } };
  inFlight.add(guardKey);
  try {
    const docs = await StoredDocument.find({ ownerUserId, deletedAt: null })
      .select('documentId dossierId tenantId versions currentVersionId updatedAt')
      .sort({ updatedAt: -1 }) // les plus recents d'abord (plus susceptibles d'etre consultes)
      .limit(limit)
      .lean();
    // Journalise (sans silence) si le plafond est atteint : un reliquat existe
    // peut-etre, qu'une passe ulterieure (idempotente) traitera.
    if (docs.length >= limit) {
      // eslint-disable-next-line no-console
      console.log(`[cloud-backfill] plafond de ${limit} documents atteint — une passe ulterieure poursuivra le reliquat.`);
    }
    // Ne garder que ceux encore sur stockage interne (cle sans prefixe).
    const pending = docs.filter((d) => {
      const v = currentVersion(d);
      return v && v.storageKey && providerNameForKey(v.storageKey)==='managed_gcs';
    });
    if (pending.length === 0) return { total: 0, migrated: 0, skipped: 0, reasons: {} };
    return await migrateDocuments(ownerUserId, pending);
  } catch (err) {
    return { total: 0, migrated: 0, skipped: 0, reasons: { [err.code || err.message || 'erreur']: 1 } };
  } finally {
    inFlight.delete(guardKey);
  }
}

/**
 * SYNC D'UN DOSSIER — migre les documents (version courante) encore sur le
 * stockage interne pour CE dossier uniquement. Utilise a l'ouverture d'un
 * dossier (ciblage leger). Idempotent, ne leve jamais.
 * @returns {Promise<{total,migrated,skipped,reasons}>}
 */
async function syncDossierDocuments(ownerUserId, dossierId) {
  if (!dossierId) return { total: 0, migrated: 0, skipped: 0, reasons: { 'dossier-manquant': 1 } };
  const guardKey = `dossier:${ownerUserId}:${dossierId}`;
  if (inFlight.has(guardKey)) return { total: 0, migrated: 0, skipped: 0, reasons: { 'deja-en-cours': 1 } };
  inFlight.add(guardKey);
  try {
    const docs = await StoredDocument.find({ ownerUserId, dossierId, deletedAt: null })
      .select('documentId dossierId tenantId versions currentVersionId')
      .limit(MAX_BACKFILL_DOCS)
      .lean();
    const pending = docs.filter((d) => {
      const v = currentVersion(d);
      return v && v.storageKey && providerNameForKey(v.storageKey)==='managed_gcs';
    });
    if (pending.length === 0) return { total: 0, migrated: 0, skipped: 0, reasons: {} };
    return await migrateDocuments(ownerUserId, pending);
  } catch (err) {
    return { total: 0, migrated: 0, skipped: 0, reasons: { [err.code || err.message || 'erreur']: 1 } };
  } finally {
    inFlight.delete(guardKey);
  }
}

/**
 * BACKFILL COMPLET (fire-and-forget) declenchable au LOGIN : d'abord la
 * structure de dossiers (matterFolderMaterializer), puis le contenu (documents).
 * Best-effort total : ne leve jamais, log un resume compact.
 * @param {string|ObjectId} ownerUserId
 * @param {string} [origin]  libelle pour les logs (ex. 'login', 'select-site')
 */
async function backfillUserCloud(ownerUserId, origin = 'trigger') {
  try {
    const folders = await backfillUserFolders(ownerUserId);
    // eslint-disable-next-line no-console
    console.log(`[cloud-backfill:${origin}] 📁 Dossiers: ${folders.ok}/${folders.total}`, folders.reasons || {});
  } catch (_) { /* best effort */ }
  // Phase 1 « rangement coherent » : migre aussi l'HERITAGE Google Drive de
  // l'ancienne app de bureau (Files_Clients -> Kheops2/Dossiers, avec
  // enregistrement documentaire). No-op propre si pas d'heritage / pas Google.
  try {
    const { migrateLegacyDriveForUser } = require('./legacyDriveMigrator');
    const legacy = await migrateLegacyDriveForUser(ownerUserId);
    if (legacy && (legacy.moved || legacy.registered)) {
      // eslint-disable-next-line no-console
      console.log(`[cloud-backfill:${origin}] 📦 Heritage Drive: ${legacy.moved} deplaces, ${legacy.registered} enregistres`, legacy);
    }
  } catch (_) { /* best effort */ }
  try {
    const docs = await backfillUserDocuments(ownerUserId);
    // eslint-disable-next-line no-console
    console.log(`[cloud-backfill:${origin}] 📄 Documents: ${docs.migrated}/${docs.total} migres`, docs.reasons || {});
    return docs;
  } catch (_) {
    return { total: 0, migrated: 0, skipped: 0, reasons: { erreur: 1 } };
  }
}

/**
 * Declencheur FIRE-AND-FORGET (ne bloque jamais l'appelant). A utiliser aux
 * points de login et a la selection de site : lance le backfill en arriere-plan.
 */
function triggerBackfillUserCloud(ownerUserId, origin = 'trigger') {
  if (!ownerUserId) return;
  // Throttle des declenchements de LOGIN (par utilisateur, par instance) : evite
  // de re-scanner toute la collection a chaque connexion rapprochee. Les
  // declencheurs deliberes (select-site, bouton manuel) ne passent PAS ici.
  if (String(origin).startsWith('login')) {
    const key = String(ownerUserId);
    const last = lastLoginBackfillAt.get(key) || 0;
    if (Date.now() - last < LOGIN_BACKFILL_COOLDOWN_MS) return; // deja lance recemment
    lastLoginBackfillAt.set(key, Date.now());
  }
  Promise.resolve()
    .then(() => backfillUserCloud(ownerUserId, origin))
    .catch(() => { /* best effort */ });
}

module.exports = {
  migrateOneDocument,
  migrateDocuments,
  backfillUserDocuments,
  syncDossierDocuments,
  backfillUserCloud,
  triggerBackfillUserCloud,
};
