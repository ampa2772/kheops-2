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

    const provider = await getStorageProvider(tenantId);
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
        const provider = await getStorageProvider(tenantId);
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

    const version = currentVersionOf(storedDocument, req.query.versionId);
    if (!version) {
      return res.status(404).json({ error: 'VERSION_NOT_FOUND', message: 'Version introuvable.' });
    }

    const provider = await getStorageProvider(tenantId);
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
    const provider = await getStorageProvider(tenantId);
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
      // Le client redirige l'utilisateur ici pour (re)connecter son OneDrive.
      // Le login Microsoft existant consent déjà Files.ReadWrite + offline_access.
      connectUrl: '/api/auth/microsoft',
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
      // Le login Google existant consent déjà le scope drive.file.
      connectUrl: '/api/auth/google',
    });
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
