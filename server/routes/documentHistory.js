const express = require('express');
const auth = require('../middlewares/middleware-auth');
const { ensureDocOwnership } = require('../utils/ownershipHelpers');
const DocumentHistory = require('../models/Storage/DocumentHistory');
const Dossier = require('../models/Folder/Dossier');
const UserOfficeUser = require('../models/App_Users/modelsLiaisons/UserOfficeUser');
const { readVersion, restoreVersion, toClient } = require('../services/documentHistoryService');
const { saveCanonicalDocument } = require('../services/documentContentService');
const { getCabinetRole, ROLES } = require('../services/cabinetRoles');
const audit = require('../utils/auditLogger');

const router = express.Router();
const PROTECTED_STATUSES = new Set(['validated', 'ready_to_send', 'sent', 'signed', 'archived']);

function requestUserId(req) {
  if (req.user && typeof req.user === 'object') return req.user._id || req.user.id || req.user.user;
  return req.user;
}

async function ownedHistory(req, res) {
  const own = await ensureDocOwnership(req, res, req.params.docId);
  if (!own.ok) return null;
  const history = await DocumentHistory.findOne({
    tenantId: own.tenantId,
    dossierId: own.dossierId,
    documentId: req.params.docId,
  });
  if (!history) res.status(404).json({ error: 'HISTORY_NOT_FOUND', message: 'Aucun historique pour ce document.' });
  return history ? { history, own } : null;
}

function currentVersion(history) {
  return history?.versions?.find((version) => String(version.versionId) === String(history.currentVersionId));
}

async function canRestoreVersion(req, history, versionId) {
  const selected = history?.versions?.find((version) => String(version.versionId) === String(versionId));
  if (!selected) return { ok: false, notFound: true };
  const current = currentVersion(history);
  const touchesProtectedVersion = PROTECTED_STATUSES.has(String(selected.status || ''))
    || PROTECTED_STATUSES.has(String(current?.status || ''));
  if (!touchesProtectedVersion) return { ok: true, selected };

  const role = await getCabinetRole(requestUserId(req));
  if ([ROLES.OWNER, ROLES.ADMIN].includes(role)) return { ok: true, selected };

  const [dossier, officeLinks] = await Promise.all([
    Dossier.findOne({ _id: history.dossierId, tenantId: history.tenantId })
      .select('dossier.avocatsResponsables')
      .lean(),
    UserOfficeUser.find({ user: requestUserId(req) }).select('officeUser').lean(),
  ]);
  const officeUserIds = new Set(officeLinks.map((link) => String(link.officeUser?._id || link.officeUser || '')));
  const isResponsible = (dossier?.dossier?.avocatsResponsables || []).some((responsible) => {
    const responsibleId = responsible?._id || responsible?.id || responsible?.officeUserId || responsible;
    const responsibleUserId = responsible?.userId || responsible?.user;
    return officeUserIds.has(String(responsibleId || ''))
      || String(responsibleUserId || '') === String(requestUserId(req) || '');
  });
  if (isResponsible) return { ok: true, selected };
  return { ok: false, forbidden: true };
}

function operationKeyFrom(req) {
  return (typeof req.get === 'function' && req.get('Idempotency-Key'))
    || req.body?.operationKey
    || null;
}

async function restoreAsNewVersion(req, res, auditAction = 'restored') {
  const owned = await ownedHistory(req, res);
  if (!owned) return null;
  const { history, own } = owned;
  const permission = await canRestoreVersion(req, history, req.params.versionId);
  if (permission.notFound) {
    res.status(404).json({ error: 'VERSION_NOT_FOUND' });
    return null;
  }
  if (permission.forbidden) {
    res.status(403).json({
      error: 'PROTECTED_VERSION_RESTORE_FORBIDDEN',
      message: 'Seul un responsable du dossier, le propriétaire ou un administrateur peut restaurer une version protégée.',
    });
    return null;
  }

  const operationKey = operationKeyFrom(req);
  if (!operationKey) {
    res.status(400).json({
      error: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Une clé d’idempotence est requise pour restaurer une version.',
    });
    return null;
  }
  const result = await restoreVersion({
    history,
    versionId: req.params.versionId,
    userId: requestUserId(req),
    operationKey,
    comment: req.body?.comment,
  });
  if (!result?.version) {
    res.status(404).json({ error: 'VERSION_NOT_FOUND' });
    return null;
  }
  const restored = await readVersion(result.history, result.version.versionId);
  if (restored) {
    await saveCanonicalDocument(req.params.docId, restored.buffer, result.version.mime, {
      tenantId: own.tenantId,
      dossierId: own.dossierId,
    });
  }
  audit.update(req, 'document-version', req.params.docId, {
    action: auditAction,
    restoredFromVersionId: req.params.versionId,
    createdVersionId: result.version.versionId,
    idempotent: Boolean(result.deduplicated || result.idempotent),
  });
  return result;
}

router.get('/:docId', auth, async (req, res) => {
  try {
    const owned = await ownedHistory(req, res);
    if (!owned) return;
    const { history } = owned;
    return res.json({ history: toClient(history) });
  } catch (err) {
    return res.status(500).json({ error: 'HISTORY_ERROR', message: err.message });
  }
});

router.get('/:docId/versions/:versionId/download', auth, async (req, res) => {
  try {
    const owned = await ownedHistory(req, res);
    if (!owned) return;
    const { history } = owned;
    const found = await readVersion(history, req.params.versionId);
    if (!found) return res.status(404).json({ error: 'VERSION_NOT_FOUND' });
    res.setHeader('Content-Type', found.version.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(found.version.filename || 'document')}`);
    return res.send(found.buffer);
  } catch (err) {
    return res.status(500).json({ error: 'HISTORY_DOWNLOAD_ERROR', message: err.message });
  }
});

// Restauration non destructive : le contenu choisi devient une NOUVELLE
// version, l'ancienne version courante et la version source restent intactes.
router.post('/:docId/versions/:versionId/restore', auth, async (req, res) => {
  try {
    const result = await restoreAsNewVersion(req, res, 'restore');
    if (!result) return;
    return res.status(result.deduplicated ? 200 : 201).json({
      ok: true,
      restoredFromVersionId: req.params.versionId,
      createdVersionId: result.version.versionId,
      idempotent: Boolean(result.deduplicated || result.idempotent),
      history: toClient(result.history),
    });
  } catch (err) {
    const status = Number(err?.statusCode) || 500;
    return res.status(status).json({ error: err?.code || 'HISTORY_RESTORE_ERROR', message: err.message });
  }
});

router.post('/:docId/versions/:versionId/promote', auth, async (req, res) => {
  try {
    // Compatibilité de l’ancienne API : « promouvoir » restaure désormais la
    // version choisie sous forme d’une nouvelle version. Aucun pointeur
    // d’historique n’est déplacé et aucune version validée n’est altérée.
    const result = await restoreAsNewVersion(req, res, 'legacy-promote-as-restore');
    if (!result) return;
    return res.status(result.deduplicated ? 200 : 201).json({
      ok: true,
      restoredFromVersionId: req.params.versionId,
      createdVersionId: result.version.versionId,
      idempotent: Boolean(result.deduplicated || result.idempotent),
      history: toClient(result.history),
    });
  } catch (err) {
    const status = Number(err?.statusCode) || 500;
    return res.status(status).json({ error: err?.code || 'HISTORY_PROMOTE_ERROR', message: err.message });
  }
});

module.exports = router;
