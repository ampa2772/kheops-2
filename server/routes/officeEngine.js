const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const auth = require('../middlewares/middleware-auth');
const requireTenant = require('../middlewares/requireTenant');
const Dossier = require('../models/Folder/Dossier');
const UserDossier = require('../models/Folder/modelsLiaisons/UserDossier');
const User = require('../models/App_Users/User');
const DocumentHistory = require('../models/Storage/DocumentHistory');
const OfficeDocumentLock = require('../models/Storage/OfficeDocumentLock');
const StoredDocument = require('../models/Storage/StoredDocument');
const { getAccessibleUserIds } = require('../services/cabinetAccess');
const { resolveDocumentContent, saveCanonicalDocument } = require('../services/documentContentService');
const { saveVersion } = require('../services/documentHistoryService');
const featureFlags = require('../config/featureFlags');
const officeEngine = require('../services/officeEngineService');

const router = express.Router();
const TOKEN_AUDIENCE = 'kheops-office-engine';
const TOKEN_ISSUER = 'kheops-2';
const TOKEN_TTL_SECONDS = Math.max(300, Number(process.env.OFFICE_ENGINE_TOKEN_TTL_SECONDS || 3600));
const LOCK_TTL_MS = Math.max(60_000, Number(process.env.OFFICE_ENGINE_LOCK_TTL_MS || 30 * 60 * 1000));
const MAX_FILE_BYTES = Math.max(8 * 1024 * 1024, Number(process.env.OFFICE_ENGINE_MAX_FILE_BYTES || 100 * 1024 * 1024));

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function id(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''))
    ? new mongoose.Types.ObjectId(String(value))
    : null;
}

function safeFilename(value, fallback = 'document.docx') {
  const normalized = String(value || fallback).replace(/[\r\n"\\/]/g, '_').trim();
  return normalized || fallback;
}

function requestOrigin(req) {
  const configured = String(process.env.FRONTEND_URL || '').split(',')[0].trim().replace(/\/+$/, '');
  if (configured) return configured;
  return `${req.protocol}://${req.get('host')}`;
}

async function resolveScopeForUser({ userId, tenantId, requestedDocumentId }) {
  const requestedId = id(requestedDocumentId);
  if (!requestedId) return null;
  const accessibleUsers = await getAccessibleUserIds(userId);
  const dossierLinks = await UserDossier.find({ user: { $in: accessibleUsers } }).select('dossier').lean();
  const dossierIds = dossierLinks.map((link) => link.dossier);
  if (dossierIds.length === 0) return null;

  const stored = await StoredDocument.findOne({
    tenantId,
    deletedAt: null,
    $or: [{ _id: requestedId }, { documentId: requestedId }],
  }).select('_id tenantId dossierId documentId currentVersionId versions').lean();
  if (stored && dossierIds.some((dossierId) => String(dossierId) === String(stored.dossierId))) {
    const current = (stored.versions || []).find((version) => String(version.versionId) === String(stored.currentVersionId))
      || (stored.versions || [])[stored.versions.length - 1];
    return {
      tenantId: stored.tenantId || tenantId,
      dossierId: stored.dossierId,
      documentId: stored.documentId || stored._id,
      filename: current?.filename || '',
    };
  }

  const dossier = await Dossier.findOne({
    _id: { $in: dossierIds },
    $or: [
      { 'dossier.documents._id': requestedId },
      { 'dossier.documents.documentId': requestedId },
    ],
  }).select('_id tenantId dossier.documents').lean();
  if (!dossier || String(dossier.tenantId || tenantId) !== String(tenantId)) return null;
  const embedded = (dossier.dossier?.documents || []).find((document) => (
    String(document._id) === String(requestedId) || String(document.documentId || '') === String(requestedId)
  ));
  return {
    tenantId: dossier.tenantId || tenantId,
    dossierId: dossier._id,
    documentId: embedded?.documentId || embedded?._id || requestedId,
    filename: embedded?.nomDocument || embedded?.filename || '',
  };
}

async function currentContent(scope) {
  const content = await resolveDocumentContent({
    tenantId: scope.tenantId,
    dossierId: scope.dossierId,
    documentId: scope.documentId,
    fallbackFilename: scope.filename,
  });
  if (!content?.buffer) return null;
  return {
    ...content,
    filename: safeFilename(content.filename || scope.filename, `${scope.documentId}.docx`),
  };
}

function signAccessToken(scope, userId) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({
    sub: String(userId),
    tenantId: String(scope.tenantId),
    dossierId: String(scope.dossierId),
    documentId: String(scope.documentId),
    scope: 'office:edit',
  }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_TTL_SECONDS,
    audience: TOKEN_AUDIENCE,
    issuer: TOKEN_ISSUER,
    jwtid: jti,
  });
  return { token, jti };
}

function verifyAccessToken(req, res, next) {
  const accessToken = String(req.query.access_token || req.body?.access_token || '').trim();
  if (!accessToken) return res.status(401).json({ error: 'OFFICE_ACCESS_TOKEN_REQUIRED' });
  try {
    req.officeClaims = jwt.verify(accessToken, process.env.JWT_SECRET, {
      audience: TOKEN_AUDIENCE,
      issuer: TOKEN_ISSUER,
    });
    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'OFFICE_ACCESS_TOKEN_INVALID' });
  }
}

async function revalidateClaims(req, res) {
  const claims = req.officeClaims || {};
  if (String(claims.documentId) !== String(req.params.documentId)) {
    res.status(403).json({ error: 'OFFICE_DOCUMENT_SCOPE_MISMATCH' });
    return null;
  }
  const scope = await resolveScopeForUser({
    userId: claims.sub,
    tenantId: id(claims.tenantId),
    requestedDocumentId: claims.documentId,
  });
  if (!scope || String(scope.dossierId) !== String(claims.dossierId)) {
    res.status(403).json({ error: 'OFFICE_DOCUMENT_ACCESS_REVOKED' });
    return null;
  }
  return scope;
}

function wopiLock(req) {
  return String(req.get('X-WOPI-Lock') || '').slice(0, 1024);
}

function setLockConflict(res, existing) {
  if (existing?.lockId) res.set('X-WOPI-Lock', existing.lockId);
  return res.status(409).end();
}

async function acquireOrRefreshLock(scope, claims, lockId) {
  if (!lockId) return { ok: false, code: 'missing' };
  const now = new Date();
  const expiresAt = new Date(Date.now() + LOCK_TTL_MS);
  const lockScope = { tenantId: scope.tenantId, dossierId: scope.dossierId, documentId: scope.documentId };
  let existing = await OfficeDocumentLock.findOne(lockScope);
  if (!existing) {
    const history = await DocumentHistory.findOne({
      tenantId: scope.tenantId,
      dossierId: scope.dossierId,
      documentId: scope.documentId,
    }).lean();
    try {
      existing = await OfficeDocumentLock.create({
        tenantId: scope.tenantId,
        dossierId: scope.dossierId,
        documentId: scope.documentId,
        userId: claims.sub,
        sessionJti: claims.jti,
        lockId,
        currentVersionId: history?.currentVersionId || null,
        expiresAt,
      });
      return { ok: true, lock: existing };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      existing = await OfficeDocumentLock.findOne(lockScope);
    }
  }
  if (existing.expiresAt <= now) {
    const history = await DocumentHistory.findOne({
      tenantId: scope.tenantId,
      dossierId: scope.dossierId,
      documentId: scope.documentId,
    }).select('currentVersionId').lean();
    existing.lockId = lockId;
    existing.userId = claims.sub;
    existing.sessionJti = claims.jti;
    // An expired lock starts a new editing session. Rebase it on the version
    // which is authoritative now, otherwise a later PUT could report a false
    // optimistic conflict after another editor saved while this lock slept.
    existing.currentVersionId = history?.currentVersionId || null;
    existing.expiresAt = expiresAt;
    await existing.save();
    return { ok: true, lock: existing };
  }
  if (existing.lockId !== lockId) return { ok: false, lock: existing, code: 'conflict' };
  existing.expiresAt = expiresAt;
  existing.sessionJti = claims.jti;
  await existing.save();
  return { ok: true, lock: existing };
}

router.get('/session/:documentId', auth, requireTenant, async (req, res) => {
  try {
    if (!featureFlags.enabled('officeEngine') || !officeEngine.isConfigured()) {
      return res.json({ available: false, reason: 'not-configured' });
    }
    const scope = await resolveScopeForUser({
      userId: req.user,
      tenantId: req.tenantId,
      requestedDocumentId: req.params.documentId,
    });
    if (!scope) return res.status(404).json({ available: false, reason: 'not-found' });
    const content = await currentContent(scope);
    if (!content) return res.status(404).json({ available: false, reason: 'content-not-found' });
    const action = await officeEngine.resolveEditAction(content.filename);
    if (!action) return res.json({ available: false, reason: 'unsupported-format', filename: content.filename });
    const { token } = signAccessToken(scope, req.user);
    const wopiBase = String(process.env.WOPI_PUBLIC_BASE_URL || requestOrigin(req)).replace(/\/+$/, '');
    const wopiSrc = `${wopiBase}/api/office-engine/wopi/files/${encodeURIComponent(String(scope.documentId))}`;
    const separator = action.actionUrl.includes('?')
      ? (action.actionUrl.endsWith('?') || action.actionUrl.endsWith('&') ? '' : '&')
      : '?';
    const actionUrl = `${action.actionUrl}${separator}WOPISrc=${encodeURIComponent(wopiSrc)}`;
    return res.json({
      available: true,
      engine: 'collabora-online',
      actionUrl,
      accessToken: token,
      accessTokenTtl: Date.now() + (TOKEN_TTL_SECONDS * 1000),
      filename: content.filename,
      fileExtension: action.ext,
      defaultTheme: 'mixed',
    });
  } catch (error) {
    console.warn('[officeEngine] Session indisponible :', error.message);
    return res.status(503).json({ available: false, reason: 'engine-unavailable', message: 'Le moteur bureautique est momentanément indisponible.' });
  }
});

router.get('/health', asyncRoute(async (_req, res) => {
  if (!featureFlags.enabled('officeEngine') || !officeEngine.isConfigured()) {
    return res.status(503).json({ ok: false, configured: false });
  }
  try {
    const actions = await officeEngine.fetchDiscovery({ force: true });
    return res.json({ ok: true, configured: true, actions: actions.length });
  } catch (error) {
    return res.status(503).json({ ok: false, configured: true, message: error.message });
  }
}));

router.get('/wopi/files/:documentId', verifyAccessToken, asyncRoute(async (req, res) => {
  const scope = await revalidateClaims(req, res);
  if (!scope) return undefined;
  const content = await currentContent(scope);
  if (!content) return res.status(404).end();
  const history = await DocumentHistory.findOne({
    tenantId: scope.tenantId,
    dossierId: scope.dossierId,
    documentId: scope.documentId,
  }).lean();
  const user = await User.findById(req.officeClaims.sub).select('firstName lastName email').lean();
  res.set('X-WOPI-ItemVersion', String(history?.currentVersionId || content.versionId || '0'));
  return res.json({
    BaseFileName: content.filename,
    Size: content.buffer.length,
    Version: String(history?.currentVersionId || content.versionId || '0'),
    OwnerId: String(req.officeClaims.sub),
    UserId: String(req.officeClaims.sub),
    UserFriendlyName: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Utilisateur Kheops',
    UserCanWrite: true,
    ReadOnly: false,
    SupportsLocks: true,
    SupportsUpdate: true,
    SupportsRename: false,
    SupportsUserInfo: false,
    PostMessageOrigin: requestOrigin(req),
  });
}));

router.get('/wopi/files/:documentId/contents', verifyAccessToken, asyncRoute(async (req, res) => {
  const scope = await revalidateClaims(req, res);
  if (!scope) return undefined;
  const content = await currentContent(scope);
  if (!content) return res.status(404).end();
  res.set({
    'Content-Type': content.mime || 'application/octet-stream',
    'Content-Length': String(content.buffer.length),
    'Content-Disposition': `inline; filename="${safeFilename(content.filename)}"`,
  });
  return res.send(content.buffer);
}));

router.post('/wopi/files/:documentId', verifyAccessToken, asyncRoute(async (req, res) => {
  const scope = await revalidateClaims(req, res);
  if (!scope) return undefined;
  const override = String(req.get('X-WOPI-Override') || '').toUpperCase();
  const lockId = wopiLock(req);
  const existing = await OfficeDocumentLock.findOne({
    tenantId: scope.tenantId,
    dossierId: scope.dossierId,
    documentId: scope.documentId,
  });
  if (override === 'GET_LOCK') {
    if (existing?.lockId && existing.expiresAt > new Date()) res.set('X-WOPI-Lock', existing.lockId);
    return res.status(200).end();
  }
  if (override === 'UNLOCK') {
    if (!existing || existing.lockId !== lockId) return setLockConflict(res, existing);
    await OfficeDocumentLock.deleteOne({ _id: existing._id, lockId });
    return res.status(200).end();
  }
  if (override === 'LOCK' || override === 'REFRESH_LOCK') {
    const result = await acquireOrRefreshLock(scope, req.officeClaims, lockId);
    if (!result.ok) return setLockConflict(res, result.lock);
    return res.status(200).end();
  }
  return res.status(501).end();
}));

router.post(
  '/wopi/files/:documentId/contents',
  verifyAccessToken,
  express.raw({ type: () => true, limit: MAX_FILE_BYTES }),
  asyncRoute(async (req, res) => {
    const scope = await revalidateClaims(req, res);
    if (!scope) return undefined;
    if (String(req.get('X-WOPI-Override') || '').toUpperCase() !== 'PUT') return res.status(501).end();
    const lockId = wopiLock(req);
    const lock = await OfficeDocumentLock.findOne({
      tenantId: scope.tenantId,
      dossierId: scope.dossierId,
      documentId: scope.documentId,
    });
    if (!lock || lock.lockId !== lockId || lock.expiresAt <= new Date()) return setLockConflict(res, lock);
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
    if (buffer.length === 0) return res.status(400).json({ error: 'EMPTY_DOCUMENT' });
    const previous = await currentContent(scope);
    const filename = safeFilename(req.get('X-WOPI-SuggestedTarget') || previous?.filename, `${scope.documentId}.docx`);
    const mime = previous?.mime || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const result = await saveVersion({
      tenantId: scope.tenantId,
      dossierId: scope.dossierId,
      documentId: scope.documentId,
      userId: req.officeClaims.sub,
      buffer,
      filename,
      mime,
      editor: 'collabora',
      origin: 'office_engine',
      comment: 'Enregistrement depuis l’Éditeur Kheops avancé',
      status: 'draft',
      baseVersionId: lock.currentVersionId || null,
      requireBaseVersion: Boolean(lock.currentVersionId),
      operationKey: officeEngine.operationKey(req.officeClaims.jti, buffer),
    });
    if (result.conflict) return res.status(409).json({ error: 'VERSION_CONFLICT' });
    lock.currentVersionId = result.version?.versionId || lock.currentVersionId;
    lock.expiresAt = new Date(Date.now() + LOCK_TTL_MS);
    await lock.save();
    await saveCanonicalDocument(scope.documentId, buffer, mime, {
      tenantId: scope.tenantId,
      dossierId: scope.dossierId,
      filename,
    }).catch((error) => console.warn('[officeEngine] Copie canonique différée :', error.message));
    res.set('X-WOPI-ItemVersion', String(result.version?.versionId || ''));
    return res.status(200).json({ LastModifiedTime: new Date().toISOString() });
  }),
);

router.use((error, _req, res, _next) => {
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'OFFICE_DOCUMENT_TOO_LARGE' });
  console.error('[officeEngine]', error);
  return res.status(Number(error?.statusCode) || 500).json({
    error: error?.code || 'OFFICE_ENGINE_ERROR',
    message: 'Le moteur bureautique n’a pas pu terminer cette opération.',
  });
});

module.exports = router;
