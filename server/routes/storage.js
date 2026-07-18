const express = require('express');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const auth = require('../middlewares/middleware-auth');
// requireTenant (chaîné après auth) pose req.tenantId = vrai cabinet (AUTH-002).
// Sans lui, resolveTenantId retombait sur req.user (userId). Voir migration
// scripts/backfill-tenant-id.js — à déployer dans le MÊME déploiement.
const requireTenant = require('../middlewares/requireTenant');
const StoredDocument = require('../models/Storage/StoredDocument');
const { ensureDossierOwnership } = require('../utils/ownershipHelpers');
const {
  getStorageProvider,
  getProviderForStorageKey,
  getUploadProvider,
  resolveTenantId,
  selectStorageProvider,
  toTenantObjectId,
  assertUploadCompleted,
} = require('../services/storage');
const {
  QuotaExceededError,
  reserveQuota,
  releaseQuota,
  getUsage,
} = require('../services/storage/quota');
const { assertAttachmentAllowed } = require('../services/attachmentPolicy');
const { readableMatterFolder } = require('../services/storage/matterFolderName');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 1,
  },
});

function toObjectId(value, fieldName) {
  if (!value) return null;
  if (!mongoose.Types.ObjectId.isValid(String(value))) {
    const err = new Error(`${fieldName} invalide.`);
    err.statusCode = 400;
    err.code = 'INVALID_OBJECT_ID';
    throw err;
  }
  return new mongoose.Types.ObjectId(String(value));
}

function currentVersionOf(doc, versionId) {
  if (!doc || !Array.isArray(doc.versions)) return null;
  return doc.versions.find((v) => String(v.versionId) === String(versionId || doc.currentVersionId)) || null;
}

function safeDownloadName(name, fallback) {
  const base = path.basename(String(name || fallback || 'document'));
  return base.replace(/[\r\n"]/g, '_') || 'document';
}

function toClientDocument(doc) {
  const plain = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(plain._id),
    tenantId: plain.tenantId ? String(plain.tenantId) : null,
    dossierId: plain.dossierId ? String(plain.dossierId) : null,
    documentId: plain.documentId ? String(plain.documentId) : null,
    currentVersionId: plain.currentVersionId || null,
    ownerUserId: plain.ownerUserId ? String(plain.ownerUserId) : null,
    deletedAt: plain.deletedAt || null,
    createdAt: plain.createdAt || null,
    updatedAt: plain.updatedAt || null,
    versions: (plain.versions || []).map((version) => ({
      versionId: version.versionId,
      size: version.size,
      mime: version.mime,
      filename: version.filename,
      createdAt: version.createdAt,
      createdBy: version.createdBy ? String(version.createdBy) : null,
      editor: version.editor || null,
      origin: version.origin || null,
      comment: version.comment || null,
      status: version.status || 'draft',
    })),
  };
}

async function findTenantDocument(tenantId, id, includeDeleted = false) {
  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    const err = new Error('Document invalide.');
    err.statusCode = 400;
    err.code = 'INVALID_DOCUMENT_ID';
    throw err;
  }
  const objectId = new mongoose.Types.ObjectId(String(id));
  const query = {
    tenantId,
    $or: [{ _id: objectId }, { documentId: objectId }],
  };
  if (!includeDeleted) query.deletedAt = null;
  return StoredDocument.findOne(query);
}

function handleStorageError(res, err) {
  if (err instanceof QuotaExceededError || err.statusCode === 413) {
    return res.status(413).json({
      error: err.code || 'QUOTA_EXCEEDED',
      message: err.message,
      usedBytes: err.usedBytes,
      quotaBytes: err.quotaBytes,
      addBytes: err.addBytes,
    });
  }
  const status = err.statusCode || 500;
  return res.status(status).json({
    error: err.code || 'STORAGE_ERROR',
    message: err.message || 'Erreur stockage.',
  });
}

router.post('/documents/upload', auth, requireTenant, upload.single('file'), async (req, res) => {
  let uploadedVersion = null;
  let quotaReserved = 0; // octets réservés (à libérer en cas d'échec)

  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'FILE_REQUIRED', message: 'Fichier manquant (champ "file").' });
    }

    // Défense commune anti-exécutables/scripts (même règle que chat et mail —
    // A15/A16), désormais aussi sur le dépôt direct (drag & drop web). On passe
    // maxBytes explicitement pour CONSERVER la limite propre au stockage
    // (100 Mo, alignée sur multer) au lieu des 25 Mo par défaut de la politique.
    assertAttachmentAllowed(
      { filename: req.file.originalname, mime: req.file.mimetype, size: req.file.size },
      { maxBytes: 100 * 1024 * 1024 },
    );

    const tenantId = resolveTenantId(req);
    const ownerUserId = toTenantObjectId(req.user);
    const dossierId = toObjectId(req.body.dossierId || req.body.matterId, 'dossierId');

    if (dossierId) {
      const own = await ensureDossierOwnership(req, res, dossierId);
      if (!own) return undefined;
    }

    // A5 : RÉSERVATION ATOMIQUE du quota AVANT l'upload. En cas de dépassement,
    // reserveQuota lève QuotaExceededError (413) sans rien écrire. Deux uploads
    // concurrents ne peuvent plus dépasser le quota (plus de TOCTOU).
    await reserveQuota(tenantId, req.file.size);
    quotaReserved = req.file.size;

    // Volet B : le provider d'UPLOAD depend de CET utilisateur — s'il a active son
    // propre SharePoint, ses documents y vont ; sinon provider du cabinet.
    const provider = await getUploadProvider(tenantId, req.user);
    const requestedDocumentId = toObjectId(req.body.documentId, 'documentId');
    const storedDocumentId = toObjectId(req.body.storedDocumentId, 'storedDocumentId');

    let storedDocument = null;
    if (storedDocumentId) {
      storedDocument = await StoredDocument.findOne({ _id: storedDocumentId, tenantId, deletedAt: null });
    } else if (requestedDocumentId) {
      storedDocument = await StoredDocument.findOne({ tenantId, documentId: requestedDocumentId, deletedAt: null });
    }

    if (storedDocument && dossierId && String(storedDocument.dossierId || '') !== String(dossierId)) {
      return res.status(409).json({
        error: 'DOSSIER_MISMATCH',
        message: 'Le document existe deja dans un autre dossier.',
      });
    }

    const documentId = storedDocument?.documentId || requestedDocumentId || new mongoose.Types.ObjectId();
    const versionId = provider.createVersionId();

    // Volet A : nom de dossier cloud LISIBLE (OneDrive/SharePoint). On recupere
    // le nom + la reference du dossier pour ranger le fichier sous un dossier au
    // vrai nom (ex. "Durand c- Petit — 202601") au lieu d'un identifiant.
    let matterLabel = null;
    if (dossierId) {
      try {
        const Dossier = require('../models/Folder/Dossier');
        const dossierDoc = await Dossier.findById(dossierId).select('reference dossier.dossier.nom').lean();
        if (dossierDoc) matterLabel = readableMatterFolder(dossierDoc?.dossier?.dossier?.nom, dossierDoc.reference);
      } catch (_) { /* repli : schema par IDs si le dossier est introuvable */ }
    }
    const versionOrdinal = (storedDocument?.versions?.length || 0) + 1;

    uploadedVersion = await provider.uploadVersion({
      tenantId,
      matterId: dossierId,
      documentId,
      versionId,
      filename: req.file.originalname,
      buffer: req.file.buffer,
      mime: req.file.mimetype,
      // A3 : pour les providers PAR UTILISATEUR (OneDrive), l'octet physique
      // est écrit dans le OneDrive de l'utilisateur qui uploade. Les providers
      // tenant-scopés (managed_gcs) ignorent ce champ.
      ownerUserId: req.user,
      matterLabel,       // Volet A : dossier cloud lisible (utilise par OneDrive)
      versionOrdinal,    // Volet A : suffixe " (v2)" pour les versions suivantes
    });

    // A4 : confirmer que le fichier est bien arrivé chez le cloud par utilisateur
    // AVANT de committer les métadonnées. En cas d'absence avérée → on lève, et
    // le catch fait le rollback (blob + quota).
    await assertUploadCompleted(provider, uploadedVersion.storageKey);

    const version = {
      versionId,
      storageKey: uploadedVersion.storageKey,
      size: uploadedVersion.size,
      mime: uploadedVersion.mime,
      filename: uploadedVersion.filename,
      createdAt: new Date(),
      createdBy: ownerUserId,
      // Un depot direct (bouton ou glisser-deposer) a une provenance connue.
      // La renseigner evite de traiter cette version comme un ancien import
      // sans metadata et alimente correctement l'historique documentaire.
      editor: 'upload',
      origin: 'upload',
    };

    if (!storedDocument) {
      storedDocument = new StoredDocument({
        tenantId,
        dossierId,
        documentId,
        versions: [version],
        currentVersionId: versionId,
        ownerUserId,
      });
    } else {
      storedDocument.versions.push(version);
      storedDocument.currentVersionId = versionId;
    }

    await storedDocument.save();
    if (dossierId) {
      try {
        const { saveVersion } = require('../services/documentHistoryService');
        await saveVersion({
          tenantId,
          dossierId,
          documentId,
          userId: ownerUserId,
          buffer: req.file.buffer,
          filename: req.file.originalname,
          mime: req.file.mimetype,
          editor: 'upload',
          origin: 'storage-upload',
          comment: storedDocument.versions.length > 1 ? 'Nouvelle version déposée' : 'Document original déposé',
          baseVersionId: req.body.baseVersionId || null,
        });
      } catch (historyError) {
        // Le stockage principal vient d'être committé : une indisponibilité du
        // journal central est signalée mais ne provoque pas la suppression du fichier utilisateur.
        console.warn('[storage/upload] Historique central non bloquant:', historyError.message);
      }
    }
    // Le quota est DÉJÀ à jour (réservé en amont) : on lit simplement l'usage.
    const usage = await getUsage(tenantId);

    return res.status(201).json({
      document: toClientDocument(storedDocument),
      usage,
    });
  } catch (err) {
    // A5 : ROLLBACK atomique — on défait dans l'ordre inverse : blob physique
    // puis réservation de quota. L'opération est ainsi tout-ou-rien.
    if (uploadedVersion?.storageKey) {
      try {
        const tenantId = resolveTenantId(req);
        const provider = await getProviderForStorageKey(tenantId, uploadedVersion.storageKey);
        await provider.deleteVersion({ storageKey: uploadedVersion.storageKey });
      } catch (cleanupErr) {
        console.warn('[storage/upload] cleanup blob failed:', cleanupErr.message);
      }
    }
    if (quotaReserved > 0) {
      try {
        await releaseQuota(resolveTenantId(req), quotaReserved);
      } catch (releaseErr) {
        console.warn('[storage/upload] release quota failed:', releaseErr.message);
      }
    }
    return handleStorageError(res, err);
  }
});

router.get('/documents/:id/download', auth, requireTenant, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const storedDocument = await findTenantDocument(tenantId, req.params.id);
    if (!storedDocument) {
      return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND', message: 'Document introuvable.' });
    }

    // Sans version explicitement demandée, l'historique central prévaut sur
    // l'ancien pointeur StoredDocument. Les éditions Word/Google/Kheops sont
    // ainsi visibles de façon identique depuis toutes les routes de téléchargement.
    if (!req.query.versionId) {
      const DocumentHistory = require('../models/Storage/DocumentHistory');
      const { readVersion } = require('../services/documentHistoryService');
      const history = await DocumentHistory.findOne({
        tenantId,
        dossierId: storedDocument.dossierId,
        documentId: storedDocument.documentId || storedDocument._id,
      });
      if (history?.currentVersionId) {
        const current = await readVersion(history, history.currentVersionId);
        if (current) {
          const filename = safeDownloadName(current.version.filename, `${storedDocument.documentId || storedDocument._id}`);
          res.setHeader('Content-Type', current.version.mime || 'application/octet-stream');
          res.setHeader('Content-Length', current.buffer.length);
          res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
          return res.send(current.buffer);
        }
      }
    }

    const version = currentVersionOf(storedDocument, req.query.versionId);
    if (!version) {
      return res.status(404).json({ error: 'VERSION_NOT_FOUND', message: 'Version introuvable.' });
    }

    const provider = await getProviderForStorageKey(tenantId, version.storageKey);
    if (String(req.query.signed || '').toLowerCase() === 'true') {
      try {
        const url = await provider.getDownloadUrl({
          storageKey: version.storageKey,
          expiresInSec: Number(req.query.expiresInSec) || 900,
        });
        return res.json({ url, expiresInSec: Number(req.query.expiresInSec) || 900 });
      } catch (signErr) {
        // Certains providers (Google Drive, fichiers privés) n'ont pas d'URL
        // signée : on bascule en téléchargement direct (streaming) plutôt que
        // de renvoyer une erreur au client.
        if (signErr.code !== 'SIGNED_URL_UNSUPPORTED') throw signErr;
      }
    }

    const buffer = await provider.downloadVersion({ storageKey: version.storageKey });
    const filename = safeDownloadName(version.filename, `${storedDocument.documentId || storedDocument._id}`);
    res.setHeader('Content-Type', version.mime || 'application/octet-stream');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return res.send(buffer);
  } catch (err) {
    return handleStorageError(res, err);
  }
});

// A4 : vérification à la demande de la complétion de sync d'un document.
// Renvoie `synced` : true (présent chez le fournisseur), false (métadonnées
// présentes mais fichier DISPARU → dérive à corriger), null (vérification
// inconclusive : réseau/jeton). Utile pour un contrôle d'intégrité côté client.
router.get('/documents/:id/verify', auth, requireTenant, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const storedDocument = await findTenantDocument(tenantId, req.params.id);
    if (!storedDocument) {
      return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND', message: 'Document introuvable.' });
    }
    const version = currentVersionOf(storedDocument, req.query.versionId);
    if (!version) {
      return res.status(404).json({ error: 'VERSION_NOT_FOUND', message: 'Version introuvable.' });
    }
    const provider = await getProviderForStorageKey(tenantId, version.storageKey);
    let synced = true;
    if (typeof provider.exists === 'function') {
      try {
        synced = (await provider.exists({ storageKey: version.storageKey })) !== false;
      } catch (_verifyErr) {
        synced = null; // inconclusif
      }
    }
    return res.json({ synced, versionId: version.versionId });
  } catch (err) {
    return handleStorageError(res, err);
  }
});

router.get('/documents', auth, requireTenant, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const dossierId = toObjectId(req.query.dossierId || req.query.matterId, 'dossierId');
    const provider = await getStorageProvider(tenantId);
    const documents = await provider.listDocuments({
      tenantId,
      matterId: dossierId,
      includeDeleted: String(req.query.includeDeleted || '').toLowerCase() === 'true',
    });
    return res.json({ documents: documents.map(toClientDocument) });
  } catch (err) {
    return handleStorageError(res, err);
  }
});

router.delete('/documents/:id', auth, requireTenant, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    // findTenantDocument exclut déjà les documents supprimés → une 2e suppression
    // renvoie 404, donc pas de double libération de quota possible.
    const storedDocument = await findTenantDocument(tenantId, req.params.id);
    if (!storedDocument) {
      return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND', message: 'Document introuvable.' });
    }

    // A17 : la corbeille (soft-delete) doit LIBÉRER le quota occupé par le
    // document (toutes ses versions). Sans ça, l'espace ne redescendait jamais.
    const bytesToRelease = (storedDocument.versions || [])
      .reduce((sum, v) => sum + (Number(v.size) || 0), 0);

    storedDocument.deletedAt = new Date();
    await storedDocument.save();

    let usage = null;
    if (bytesToRelease > 0) {
      try {
        usage = await releaseQuota(tenantId, bytesToRelease);
      } catch (releaseErr) {
        console.warn('[storage/delete] release quota failed:', releaseErr.message);
      }
    }
    return res.json({ ok: true, document: toClientDocument(storedDocument), usage });
  } catch (err) {
    return handleStorageError(res, err);
  }
});

router.get('/usage', auth, requireTenant, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    return res.json(await getUsage(tenantId));
  } catch (err) {
    return handleStorageError(res, err);
  }
});

// ---------------------------------------------------------------------------
// A3 — OneDrive PAR UTILISATEUR : statut de connexion du compte courant.
// Le client s'en sert pour afficher « OneDrive connecté » ou proposer le bouton
// de connexion (redirection vers le login Microsoft, qui consent Files.ReadWrite).
// ---------------------------------------------------------------------------
router.get('/onedrive/status', auth, async (req, res) => {
  try {
    const oneDrive = require('../services/storage/oneDriveClient');
    const connected = await oneDrive.isConnected(req.user);
    return res.json({
      connected,
      connectEndpoint: '/api/auth/microsoft/connect-url',
    });
  } catch (err) {
    return handleStorageError(res, err);
  }
});

// A3 — Google Drive PAR UTILISATEUR : statut de connexion du compte courant.
router.get('/googledrive/status', auth, async (req, res) => {
  try {
    const gdrive = require('../services/storage/googleDriveClient');
    const connected = await gdrive.isConnected(req.user);
    return res.json({
      connected,
      connectEndpoint: '/api/auth/google/connect-url',
    });
  } catch (err) {
    return handleStorageError(res, err);
  }
});

// ---------------------------------------------------------------------------
// Volet B — SharePoint PAR UTILISATEUR (optionnel, jamais partage).
// Chaque utilisateur connecte SON PROPRE SharePoint. Ces routes sont per-USER
// (auth seul, pas requireTenant) : elles lisent/ecrivent User.sharePoint.
// ---------------------------------------------------------------------------

// Statut + detection. Le client s'en sert pour :
//   - decider d'afficher (ou non) la modale d'invitation au login :
//     available === true && enabled === false && promptDismissed === false ;
//   - afficher l'etat dans Parametres > Rangement (site choisi, liste des sites).
router.get('/sharepoint/status', auth, async (req, res) => {
  try {
    const sharePoint = require('../services/storage/sharePointClient');
    const User = require('../models/App_Users/User');

    const user = await User.findById(req.user)
      .select('sharePoint microsoftSharePointRefreshToken microsoftRefreshToken')
      .lean();
    const sp = user?.sharePoint || {};

    // Detection tolerante (ne leve jamais) : { available, sites[] }.
    const { available, sites } = await sharePoint.detect(req.user);

    return res.json({
      connected: available,          // SharePoint joignable pour ce compte
      available,                     // idem (semantique modale)
      enabled: !!sp.enabled,         // l'utilisateur a active son SharePoint
      promptDismissed: !!sp.promptDismissed,
      selected: sp.enabled && sp.driveId
        ? { siteId: sp.siteId || null, siteName: sp.siteName || '', webUrl: sp.webUrl || '', driveId: sp.driveId }
        : null,
      sites,                         // sites disponibles pour le choix
      configured: Boolean(user?.microsoftSharePointRefreshToken || user?.microsoftRefreshToken),
      account: sp.accountEmail
        ? {
          email: sp.accountEmail,
          displayName: sp.accountDisplayName || '',
          accountType: sp.accountType || '',
        }
        : null,
      connectEndpoint: '/api/auth/microsoft/sharepoint-connect-url',
    });
  } catch (err) {
    return handleStorageError(res, err);
  }
});

// L'utilisateur CHOISIT un site SharePoint. On resout la bibliotheque de documents
// (drive) par defaut du site et on persiste le choix sur SON compte. Active
// egalement SharePoint pour cet utilisateur (enabled=true).
router.post('/sharepoint/select-site', auth, async (req, res) => {
  try {
    const sharePoint = require('../services/storage/sharePointClient');
    const User = require('../models/App_Users/User');

    const siteId = String(req.body.siteId || '').trim();
    if (!siteId) {
      return res.status(400).json({ error: 'SITE_ID_REQUIRED', message: 'siteId manquant.' });
    }

    // driveId fourni par le client (bibliotheque precise) OU drive par defaut du site.
    let driveId = String(req.body.driveId || '').trim();
    let siteName = String(req.body.siteName || '').trim();
    let webUrl = String(req.body.webUrl || '').trim();
    if (!driveId) {
      const drive = await sharePoint.getSiteDefaultDrive(req.user, siteId);
      driveId = drive.driveId;
      if (!webUrl) webUrl = drive.webUrl || '';
    }

    await User.findByIdAndUpdate(req.user, {
      $set: {
        'sharePoint.enabled': true,
        'sharePoint.driveId': driveId,
        'sharePoint.siteId': siteId,
        'sharePoint.siteName': siteName,
        'sharePoint.webUrl': webUrl,
        'sharePoint.promptDismissed': true, // choix effectue -> plus d'invitation
        'sharePoint.connectedAt': new Date(),
      },
    });

    // BACKFILL automatique (fire-and-forget) : des qu'un site est choisi, on
    // materialise sur SharePoint TOUS les dossiers existants de l'utilisateur
    // (au vrai nom) ET on y recopie les documents existants restes sur le
    // stockage interne, y compris ceux crees avant cette fonctionnalite.
    try {
      const { triggerBackfillUserCloud } = require('../services/storage/documentMigrator');
      triggerBackfillUserCloud(req.user, 'select-site');
    } catch (_) { /* best effort */ }

    return res.json({
      ok: true,
      selected: { siteId, siteName, webUrl, driveId },
      enabled: true,
    });
  } catch (err) {
    return handleStorageError(res, err);
  }
});

// Desactive SharePoint pour cet utilisateur (ses PROCHAINS documents repartent
// vers le provider du cabinet). Les documents deja ranges sur SharePoint restent
// telechargeables (le driveId est dans leur storageKey).
router.post('/sharepoint/disable', auth, async (req, res) => {
  try {
    const User = require('../models/App_Users/User');
    await User.findByIdAndUpdate(req.user, {
      $set: { 'sharePoint.enabled': false },
    });
    return res.json({ ok: true, enabled: false });
  } catch (err) {
    return handleStorageError(res, err);
  }
});

// BACKFILL a la demande : materialise sur le cloud de l'utilisateur (SharePoint
// perso si actif, sinon OneDrive/Google Drive du cabinet) les dossiers cloud de
// TOUS ses Dossiers ET y recopie les documents existants restes sur le stockage
// interne — y compris ceux crees AVANT la fonctionnalite. Idempotent (reutilise
// les dossiers cloud existants ; ignore les documents deja sur cloud perso) ->
// re-executable sans risque. C'est le bouton « Synchroniser mes dossiers existants ».
router.post('/cloud-folders/backfill', auth, async (req, res) => {
  try {
    const { backfillUserFolders } = require('../services/storage/matterFolderMaterializer');
    const { backfillUserDocuments } = require('../services/storage/documentMigrator');
    // Migration heritage Drive en arriere-plan (fire-and-forget) : le bouton
    // « Synchroniser » couvre aussi les fichiers de l'ancienne app de bureau,
    // sans attendre un re-login (les sessions durent 14 jours).
    try {
      const { triggerLegacyDriveMigration } = require('../services/storage/legacyDriveMigrator');
      triggerLegacyDriveMigration(req.user, 'backfill-bouton');
    } catch (_) { /* best effort */ }
    const folders = await backfillUserFolders(req.user);
    const documents = await backfillUserDocuments(req.user);
    // Retro-compat : on conserve les champs de niveau superieur (total/ok/skipped)
    // correspondant aux DOSSIERS pour ne rien casser cote client existant, et on
    // ajoute le detail documents.
    return res.json({ ...folders, folders, documents });
  } catch (err) {
    return handleStorageError(res, err);
  }
});

// MIGRATION HERITAGE GOOGLE DRIVE (Phase 1 « rangement coherent ») : deplace les
// fichiers de l'ancienne app de bureau (Files_Clients/<idDossier>) vers le
// rangement lisible Kheops2/Dossiers/<nom> ET les enregistre dans le systeme
// documentaire quand la correspondance est sans ambiguite. Idempotent, borne.
// Repond 202 : la migration se poursuit en arriere-plan (rapport dans les logs).
router.post('/legacy-drive/migrate', auth, async (req, res) => {
  try {
    const { migrateLegacyDriveForUser } = require('../services/storage/legacyDriveMigrator');
    migrateLegacyDriveForUser(req.user)
      .then((r) => console.log('[legacy-drive/migrate] rapport :', r))
      .catch(() => {});
    return res.status(202).json({ started: true });
  } catch (err) {
    return handleStorageError(res, err);
  }
});

// ARCHIVAGE HERITAGE (Phase 3, sur demande explicite de l'utilisateur) :
// renomme Files_Clients -> _ARCHIVE_Files_Clients dans SON Drive, UNIQUEMENT si
// plus aucun fichier n'y reste (sinon rapport de blocage, rien n'est touche).
// Jamais de suppression. Synchrone : le rapport est renvoye au client.
router.post('/legacy-drive/archive', auth, async (req, res) => {
  try {
    const { archiveLegacyDrive } = require('../services/storage/legacyDriveMigrator');
    const report = await archiveLegacyDrive(req.user);
    console.log('[legacy-drive/archive] rapport :', report);
    return res.json(report);
  } catch (err) {
    return handleStorageError(res, err);
  }
});

// SYNC D'UN DOSSIER (fire-and-forget) : a l'ouverture d'un dossier, on recopie
// vers le cloud PERSONNEL de l'utilisateur les documents de CE dossier restes
// sur le stockage interne. Idempotent (les documents deja sur cloud perso sont
// ignores). Repond 202 immediatement : la migration se poursuit en arriere-plan
// pour ne pas bloquer l'affichage du dossier.
router.post('/dossiers/:dossierId/sync-documents', auth, async (req, res) => {
  try {
    const dossierId = toObjectId(req.params.dossierId, 'dossierId');
    const { syncDossierDocuments } = require('../services/storage/documentMigrator');
    syncDossierDocuments(req.user, dossierId)
      .then((s) => {
        if (s && s.migrated) {
          console.log(`[dossier/sync-documents] 📄 ${s.migrated}/${s.total} documents migres`, s.reasons || {});
        }
      })
      .catch(() => {});
    return res.status(202).json({ started: true });
  } catch (err) {
    return handleStorageError(res, err);
  }
});

// « Ne plus me proposer » : la modale d'invitation au login ne reapparait plus.
router.post('/sharepoint/dismiss-prompt', auth, async (req, res) => {
  try {
    const User = require('../models/App_Users/User');
    await User.findByIdAndUpdate(req.user, {
      $set: { 'sharePoint.promptDismissed': true },
    });
    return res.json({ ok: true, promptDismissed: true });
  } catch (err) {
    return handleStorageError(res, err);
  }
});

router.post('/provider/select', auth, requireTenant, async (req, res) => {
  try {
    const tenantId = resolveTenantId(req);
    const config = await selectStorageProvider(tenantId, req.body.provider);
    return res.json({
      tenantId: config.tenantId ? String(config.tenantId) : null,
      provider: config.provider,
      quotaBytes: config.quotaBytes,
      usedBytes: config.usedBytes,
      updatedAt: config.updatedAt,
    });
  } catch (err) {
    return handleStorageError(res, err);
  }
});

module.exports = router;
module.exports._private = {
  findTenantDocument,
  handleStorageError,
  toClientDocument,
};
