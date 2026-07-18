// server/services/storage/matterFolderMaterializer.js
// ------------------------------------------------------------------------
// MATERIALISATION des dossiers sur le cloud de l'utilisateur.
//
// Demande Kubilay : « un dossier créé dans l'appli doit être visible sur
// OneDrive/SharePoint (et donc sur le bureau via la synchro) même sans
// document ». On cree donc, au VRAI NOM (Volet A), le dossier cloud vide :
//     Kheops2/Dossiers/<Nom c- Nom — reference>
// chez le provider EFFECTIF de l'utilisateur — meme regle que l'upload
// (getUploadProvider) : son SharePoint personnel s'il l'a active, sinon le
// provider du cabinet (OneDrive / Google Drive). managed_gcs (stockage interne)
// n'a pas d'espace visible par l'utilisateur -> rien a materialiser.
//
// TOUJOURS best-effort : une erreur cloud ne doit JAMAIS bloquer la creation
// d'un dossier dans l'appli. Les appels sont idempotents (reutilisent le
// dossier cloud s'il existe deja) -> re-executable sans risque (backfill).
// ------------------------------------------------------------------------

const User = require('../../models/App_Users/User');
const { readableMatterFolder } = require('./matterFolderName');
const { getStorageProviderConfig } = require('./index');
const { resolveTenantId } = require('../tenantService');
const oneDrive = require('./oneDriveClient');
const sharePoint = require('./sharePointClient');
const gdrive = require('./googleDriveClient');

const ROOT_FOLDER = 'Kheops2';

/**
 * Cree (si besoin) le dossier cloud lisible d'un Dossier pour son proprietaire.
 * Ne leve jamais : renvoie { ok, provider?, reason? }.
 * @param {string|ObjectId} ownerUserId
 * @param {object} dossier  Document Dossier (ou lean) : reference + dossier.dossier.nom
 */
async function materializeMatterFolder(ownerUserId, dossier) {
  try {
    const nom = dossier?.dossier?.dossier?.nom;
    const reference = dossier?.reference;
    if (!nom && !reference) return { ok: false, reason: 'dossier-sans-nom-ni-reference' };
    const label = readableMatterFolder(nom, reference);
    const segments = [ROOT_FOLDER, 'Dossiers', label];

    const user = await User.findById(ownerUserId)
      .select('sharePoint microsoftOneDriveRefreshToken microsoftRefreshToken googleDriveRefreshToken googleRefreshToken')
      .lean();
    if (!user) return { ok: false, reason: 'user-not-found' };

    // 1) SharePoint PERSONNEL actif -> prioritaire (meme regle que l'upload).
    if (user.sharePoint?.enabled && user.sharePoint.driveId) {
      const r = await sharePoint.ensureFolderPath(ownerUserId, user.sharePoint.driveId, segments);
      return { ok: true, provider: 'sharepoint', label, ...r };
    }

    // 2) Sinon provider du cabinet.
    const tenantId = await resolveTenantId(ownerUserId);
    const config = await getStorageProviderConfig(tenantId);
    if (config.provider === 'onedrive') {
      if (!user.microsoftOneDriveRefreshToken && !user.microsoftRefreshToken) return { ok: false, reason: 'onedrive-non-connecte' };
      const r = await oneDrive.ensureFolderPath(ownerUserId, segments);
      return { ok: true, provider: 'onedrive', label, ...r };
    }
    if (config.provider === 'google_drive') {
      if (!user.googleDriveRefreshToken && !user.googleRefreshToken) return { ok: false, reason: 'googledrive-non-connecte' };
      const r = await gdrive.ensureFolderPathForUser(ownerUserId, segments);
      return { ok: true, provider: 'google_drive', label, ...r };
    }
    // managed_gcs (ou provider inconnu) : pas d'espace utilisateur visible.
    return { ok: false, reason: `provider-${config.provider}-sans-espace-visible` };
  } catch (err) {
    return { ok: false, reason: err.code || err.message || 'erreur-inconnue' };
  }
}

/**
 * BACKFILL : materialise les dossiers cloud de TOUS les Dossiers de l'utilisateur
 * (y compris ceux crees AVANT cette fonctionnalite). Idempotent. Concurrence
 * limitee pour menager Graph/Drive. Ne leve jamais.
 * @returns {Promise<{total:number, ok:number, skipped:number, reasons:Object}>}
 */
async function backfillUserFolders(ownerUserId, { concurrency = 3 } = {}) {
  const UserDossier = require('../../models/Folder/modelsLiaisons/UserDossier');
  const Dossier = require('../../models/Folder/Dossier');

  const links = await UserDossier.find({ user: ownerUserId }).select('dossier').lean();
  const ids = links.map((l) => l.dossier);
  const dossiers = await Dossier.find({ _id: { $in: ids } })
    .select('reference dossier.dossier.nom')
    .lean();

  let ok = 0;
  let skipped = 0;
  const reasons = {}; // reason -> count (diagnostic compact)

  for (let i = 0; i < dossiers.length; i += concurrency) {
    const batch = dossiers.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((d) => materializeMatterFolder(ownerUserId, d)));
    for (const r of results) {
      if (r.ok) ok += 1;
      else {
        skipped += 1;
        reasons[r.reason] = (reasons[r.reason] || 0) + 1;
      }
    }
  }
  return { total: dossiers.length, ok, skipped, reasons };
}

module.exports = { materializeMatterFolder, backfillUserFolders };
