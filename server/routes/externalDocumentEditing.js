const express = require('express');
const mongoose = require('mongoose');
const { TextDecoder } = require('util');
const auth = require('../middlewares/middleware-auth');
const { ensureDocOwnership } = require('../utils/ownershipHelpers');
const Dossier = require('../models/Folder/Dossier');
const Tenant = require('../models/Cabinet/Tenant');
const User = require('../models/App_Users/User');
const DocumentHistory = require('../models/Storage/DocumentHistory');
const ExternalEditSession = require('../models/Storage/ExternalEditSession');
const oneDrive = require('../services/storage/oneDriveClient');
const googleDrive = require('../services/storage/googleDriveClient');
const { resolveDocumentContent, saveCanonicalDocument, DOCX_MIME } = require('../services/documentContentService');
const { saveVersion, toClient } = require('../services/documentHistoryService');
const { analyzeDocx, isDocxBuffer } = require('../services/documentCompatibilityService');
const audit = require('../utils/auditLogger');

const router = express.Router();
const MAX_EXTERNAL_DOCUMENT_BYTES = 25 * 1024 * 1024;
const MAX_EXTERNAL_TEXT_BYTES = 5 * 1024 * 1024;
const TEXT_MIME = 'text/plain';

function assertEditableDocx({ filename, buffer, size }) {
  if (!/\.docx$/i.test(String(filename || ''))) {
    const err = new Error('Seuls les documents Word .docx peuvent être ouverts dans cet éditeur. Téléchargez les autres formats.');
    err.statusCode = 415;
    err.code = 'DOCX_REQUIRED';
    throw err;
  }
  const effectiveSize = Number(size) || buffer?.length || 0;
  if (effectiveSize > MAX_EXTERNAL_DOCUMENT_BYTES) {
    const err = new Error('Ce document dépasse la limite de 25 Mo pour une édition en ligne.');
    err.statusCode = 413;
    err.code = 'DOCUMENT_TOO_LARGE';
    throw err;
  }
  if (buffer && !isDocxBuffer(buffer)) {
    const err = new Error('Le fichier ne contient pas un document DOCX valide. Le document original reste inchangé.');
    err.statusCode = 415;
    err.code = 'INVALID_DOCX';
    throw err;
  }
}

function safeFilename(value, fallback) {
  const name = String(value || fallback || 'document.docx').replace(/[\\/:*?"<>|\r\n]/g, '_').trim();
  return /\.docx$/i.test(name) ? name : `${name}.docx`;
}

function safeTextFilename(value, fallback) {
  const name = String(value || fallback || 'document.txt').replace(/[\\/:*?"<>|\r\n]/g, '_').trim();
  if (/\.txt$/i.test(name)) return name;
  const withoutExtension = name.replace(/\.[^.]+$/, '');
  return `${withoutExtension || 'document'}.txt`;
}

function sourceFormat({ filename, mime } = {}) {
  const name = String(filename || '').trim().toLowerCase();
  const type = String(mime || '').split(';')[0].trim().toLowerCase();
  if (/\.txt$/i.test(name) || type === TEXT_MIME) return 'txt';
  if (/\.docx$/i.test(name) || type === DOCX_MIME) return 'docx';
  return null;
}

function normalizePlainTextBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    const err = new Error('Le contenu du fichier texte est indisponible.');
    err.statusCode = 400;
    err.code = 'MISSING_TEXT_BUFFER';
    throw err;
  }
  if (buffer.length > MAX_EXTERNAL_TEXT_BYTES) {
    const err = new Error('Ce fichier texte dépasse la limite de 5 Mo pour une édition en ligne.');
    err.statusCode = 413;
    err.code = 'TEXT_DOCUMENT_TOO_LARGE';
    throw err;
  }
  if (buffer.includes(0)) {
    const err = new Error('Ce fichier contient des données binaires et ne peut pas être traité comme du texte.');
    err.statusCode = 415;
    err.code = 'INVALID_TEXT_CONTENT';
    throw err;
  }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return Buffer.from(decoded.replace(/^\uFEFF/, ''), 'utf8');
  } catch (_error) {
    const err = new Error('Le fichier texte doit être encodé en UTF-8. Le document original reste inchangé.');
    err.statusCode = 415;
    err.code = 'INVALID_TEXT_ENCODING';
    throw err;
  }
}

function assertEditableText({ filename, mime, buffer, size }) {
  const type = String(mime || '').split(';')[0].trim().toLowerCase();
  if (!/\.txt$/i.test(String(filename || '')) && type !== TEXT_MIME) {
    const err = new Error('Seuls les fichiers texte .txt peuvent utiliser ce parcours.');
    err.statusCode = 415;
    err.code = 'TXT_REQUIRED';
    throw err;
  }
  if (type && ![TEXT_MIME, 'application/octet-stream'].includes(type)) {
    const err = new Error('Le type de contenu ne correspond pas à un fichier texte brut.');
    err.statusCode = 415;
    err.code = 'INVALID_TEXT_MIME';
    throw err;
  }
  const effectiveSize = Number(size) || buffer?.length || 0;
  if (effectiveSize > MAX_EXTERNAL_TEXT_BYTES) {
    const err = new Error('Ce fichier texte dépasse la limite de 5 Mo pour une édition en ligne.');
    err.statusCode = 413;
    err.code = 'TEXT_DOCUMENT_TOO_LARGE';
    throw err;
  }
  return buffer ? normalizePlainTextBuffer(buffer) : null;
}

function toSession(session) {
  return {
    id: String(session._id),
    documentId: String(session.documentId),
    dossierId: String(session.dossierId),
    provider: session.provider,
    editor: session.editor,
    remoteName: session.remoteName,
    openUrl: session.openUrl,
    remoteMime: session.remoteMime,
    remoteModifiedAt: session.remoteModifiedAt,
    sourceFormat: session.sourceFormat || 'docx',
    sourceFilename: session.sourceFilename || session.remoteName,
    sourceMime: session.sourceMime || null,
    returnFormat: session.returnFormat || session.sourceFormat || 'docx',
    formatWarning: session.sourceFormat === 'txt'
      ? 'Google Docs peut ajouter de la mise en forme, mais le retour dans Kheops conservera uniquement le texte brut.'
      : null,
    baseVersionId: session.baseVersionId,
    lastSyncedVersionId: session.lastSyncedVersionId,
    lastSyncedAt: session.lastSyncedAt,
    keepRemoteCopy: session.keepRemoteCopy,
    convertedToNative: session.convertedToNative,
    state: session.state,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

async function documentContext(req, res, docId) {
  const own = await ensureDocOwnership(req, res, docId);
  if (!own.ok) return null;
  const dossier = await Dossier.findById(own.dossierId);
  const embedded = dossier?.dossier?.documents?.find((d) => String(d._id) === String(docId));
  if (!dossier || !embedded) {
    res.status(404).json({ error: 'DOCUMENT_NOT_FOUND', message: 'Document introuvable.' });
    return null;
  }
  return { dossier, embedded, dossierId: dossier._id, tenantId: own.tenantId };
}

async function removeRemote(session) {
  if (session.provider === 'onedrive') return oneDrive.deleteItem(session.userId, session.remoteId);
  return googleDrive.deleteItem(session.userId, session.remoteId);
}

// Crée une copie de travail et renvoie l'URL officielle de l'éditeur externe.
router.post('/:docId/open', auth, async (req, res) => {
  try {
    const method = String(req.body?.method || '');
    if (!['word_web', 'google_docs'].includes(method)) {
      return res.status(400).json({ error: 'INVALID_OPEN_METHOD' });
    }
    if (req.body?.consentExternalTransfer !== true) {
      return res.status(428).json({
        error: 'EXTERNAL_TRANSFER_CONSENT_REQUIRED',
        message: 'Ce document sera copié dans votre espace cloud personnel. Votre accord est requis.',
      });
    }
    const context = await documentContext(req, res, req.params.docId);
    if (!context) return;
    const [tenant, connectedUser] = await Promise.all([
      Tenant.findById(context.tenantId).select('documentPolicy').lean(),
      User.findById(req.user).select('googleDriveAccount.accountType microsoftOneDriveAccount.accountType').lean(),
    ]);
    const policy = tenant?.documentPolicy || {};
    const providerRequired = method === 'word_web' ? 'onedrive' : 'google_drive';
    const allowedProviders = Array.isArray(policy.allowedProviders)
      ? policy.allowedProviders
      : ['managed_gcs', 'google_drive', 'onedrive', 'sharepoint'];
    const accountType = method === 'word_web'
      ? connectedUser?.microsoftOneDriveAccount?.accountType
      : connectedUser?.googleDriveAccount?.accountType;
    const professionalAccount = accountType === 'organization';
    const professionalMicrosoftRequired = method === 'word_web'
      && policy.requireProfessionalMicrosoftAccount === true;
    if ((!policy.allowPersonalClouds && !professionalAccount)
      || professionalMicrosoftRequired && !professionalAccount
      || !allowedProviders.includes(providerRequired)) {
      return res.status(403).json({
        error: 'METHOD_FORBIDDEN_BY_POLICY',
        message: 'La politique documentaire du cabinet interdit cette copie vers un cloud personnel.',
      });
    }
    if (policy.forceMethod && policy.forceMethod !== method) {
      return res.status(403).json({
        error: 'CABINET_METHOD_ENFORCED',
        message: 'Le cabinet impose une autre méthode d’ouverture.',
      });
    }
    const embeddedFormat = sourceFormat({ filename: context.embedded.nomDocument });
    if (embeddedFormat === 'txt' && method === 'word_web') {
      return res.status(415).json({
        error: 'WORD_WEB_TXT_UNSUPPORTED',
        message: 'Word pour le web ne modifie pas directement les fichiers .txt. Utilisez Google Docs, l’Éditeur Kheops ou créez explicitement une copie DOCX.',
      });
    }
    const content = await resolveDocumentContent({
      tenantId: context.tenantId,
      dossierId: context.dossierId,
      documentId: req.params.docId,
      fallbackFilename: context.embedded.nomDocument,
    });
    if (!content) {
      return res.status(404).json({ error: 'DOCUMENT_CONTENT_NOT_FOUND', message: 'Le fichier du document est introuvable.' });
    }
    const format = sourceFormat({
      filename: content.filename || context.embedded.nomDocument,
      mime: content.mime,
    });
    if (format === 'txt' && method === 'word_web') {
      return res.status(415).json({
        error: 'WORD_WEB_TXT_UNSUPPORTED',
        message: 'Word pour le web ne modifie pas directement les fichiers .txt. Utilisez Google Docs, l’Éditeur Kheops ou créez explicitement une copie DOCX.',
      });
    }
    if (format === 'txt' && method === 'google_docs' && policy.allowGoogleConversion !== true) {
      return res.status(403).json({
        error: 'GOOGLE_TEXT_CONVERSION_FORBIDDEN',
        message: 'La conversion d’un fichier texte en document Google natif est désactivée par la politique du cabinet.',
      });
    }
    if (!format) assertEditableDocx({ filename: content.filename || context.embedded.nomDocument, buffer: content.buffer });
    const filename = format === 'txt'
      ? safeTextFilename(content.filename || context.embedded.nomDocument, req.params.docId)
      : safeFilename(content.filename || context.embedded.nomDocument, req.params.docId);
    const transferBuffer = format === 'txt'
      ? assertEditableText({ filename, mime: content.mime, buffer: content.buffer })
      : content.buffer;
    if (format !== 'txt') assertEditableDocx({ filename, buffer: transferBuffer });

    // Capture de la version de départ avant le transfert externe.
    const initial = await saveVersion({
      tenantId: context.tenantId,
      dossierId: context.dossierId,
      documentId: req.params.docId,
      userId: req.user,
      buffer: content.buffer,
      filename,
      mime: format === 'txt' ? (content.mime || `${TEXT_MIME}; charset=utf-8`) : (content.mime || DOCX_MIME),
      editor: 'system',
      origin: content.source,
      comment: 'Version avant ouverture dans un éditeur externe',
    });
    const baseVersionId = initial.history.currentVersionId;
    const keepRemoteCopy = policy.deleteExternalCopyAfterSync === true
      ? false
      : req.body?.keepRemoteCopy !== false;
    const convertToNative = method === 'google_docs'
      && (format === 'txt' || (policy.allowGoogleConversion === true && req.body?.convertToGoogle === true));

    let remote;
    let provider;
    let openUrl;
    if (method === 'word_web') {
      provider = 'onedrive';
      await oneDrive.ensureFolderPath(req.user, ['Kheops2', 'Modifications Kheops', String(req.params.docId)]);
      remote = await oneDrive.uploadFile(req.user, {
        path: `Kheops2/Modifications Kheops/${req.params.docId}/${Date.now()}-${filename}`,
        buffer: transferBuffer,
        mime: DOCX_MIME,
      });
      openUrl = remote.webUrl;
    } else {
      provider = 'google_drive';
      remote = await googleDrive.uploadFile(req.user, {
        name: filename,
        buffer: transferBuffer,
        mime: format === 'txt' ? `${TEXT_MIME}; charset=utf-8` : DOCX_MIME,
        folderSegments: ['Kheops2', 'Modifications Kheops'],
        convertToGoogle: convertToNative,
      });
      openUrl = remote.webViewLink || `https://docs.google.com/document/d/${encodeURIComponent(remote.fileId)}/edit`;
    }

    let session;
    try {
      session = await ExternalEditSession.create({
        tenantId: context.tenantId,
        dossierId: context.dossierId,
        documentId: req.params.docId,
        userId: req.user,
        provider,
        editor: method,
        remoteId: remote.itemId || remote.fileId,
        remoteName: remote.name || filename,
        openUrl,
        remoteMime: remote.mimeType || content.mime || DOCX_MIME,
        remoteModifiedAt: remote.modifiedTime || null,
        sourceFormat: format || 'docx',
        sourceFilename: filename,
        sourceMime: format === 'txt' ? `${TEXT_MIME}; charset=utf-8` : (content.mime || DOCX_MIME),
        returnFormat: format || 'docx',
        baseVersionId,
        keepRemoteCopy,
        convertedToNative: convertToNative,
        state: 'open',
      });
    } catch (sessionError) {
      // Compensation : un échec Mongo après l'upload ne doit jamais laisser un
      // document juridique orphelin dans le cloud personnel.
      try {
        if (provider === 'onedrive') await oneDrive.deleteItem(req.user, remote.itemId);
        else await googleDrive.deleteItem(req.user, remote.fileId);
      } catch (cleanupError) {
        audit.failure(req, 'DELETE', 'external-document-copy', req.params.docId, 'orphan-cleanup-failed', {
          provider,
          remoteId: remote.itemId || remote.fileId,
          message: cleanupError.message,
        });
      }
      throw sessionError;
    }
    audit.create(req, 'external-document-session', session._id, {
      documentId: req.params.docId,
      provider,
      editor: method,
      convertedToNative: convertToNative,
      keepRemoteCopy,
      sourceFormat: format || 'docx',
    });
    return res.status(201).json({ session: toSession(session), openUrl });
  } catch (err) {
    const status = err.statusCode || 500;
    audit.failure(req, 'CREATE', 'external-document-session', req.params.docId, err.code || err.message);
    return res.status(status).json({ error: err.code || 'EXTERNAL_OPEN_ERROR', message: err.message });
  }
});

router.get('/:docId/sessions', auth, async (req, res) => {
  try {
    const context = await documentContext(req, res, req.params.docId);
    if (!context) return;
    const sessions = await ExternalEditSession.find({
      tenantId: context.tenantId,
      documentId: req.params.docId,
      userId: req.user,
      state: { $in: ['open', 'synced', 'conflict'] },
    }).sort({ updatedAt: -1 }).limit(20);
    return res.json({ sessions: sessions.map(toSession) });
  } catch (err) {
    return res.status(500).json({ error: 'SESSION_LIST_ERROR', message: err.message });
  }
});

async function ownedSession(req, res) {
  if (!mongoose.Types.ObjectId.isValid(String(req.params.sessionId))) {
    res.status(400).json({ error: 'INVALID_SESSION_ID' });
    return null;
  }
  const session = await ExternalEditSession.findOne({ _id: req.params.sessionId, userId: req.user });
  if (!session) res.status(404).json({ error: 'SESSION_NOT_FOUND' });
  if (!session) return null;
  // Une session créée avant le retrait d'un collaborateur ne doit jamais
  // constituer une porte dérobée vers le dossier.
  const own = await ensureDocOwnership(req, res, session.documentId);
  if (!own.ok) return null;
  if (String(own.tenantId) !== String(session.tenantId) || String(own.dossierId) !== String(session.dossierId)) {
    res.status(403).json({ error: 'SESSION_SCOPE_MISMATCH', message: 'Cette session ne correspond plus au dossier autorisé.' });
    return null;
  }
  return session;
}

router.get('/sessions/:sessionId/status', auth, async (req, res) => {
  try {
    const session = await ownedSession(req, res);
    if (!session) return;
    let meta;
    try {
      meta = session.provider === 'onedrive'
        ? await oneDrive.getItemMetadata(req.user, session.remoteId)
        : await googleDrive.getItemMetadata(req.user, session.remoteId);
    } catch (err) {
      if (err.response?.status === 404) {
        session.state = 'remote_missing';
        await session.save();
        return res.json({ session: toSession(session), remoteExists: false, changed: false });
      }
      throw err;
    }
    if (meta.trashed === true) {
      session.state = 'remote_missing';
      await session.save();
      return res.json({ session: toSession(session), remoteExists: false, changed: false });
    }
    const modifiedTime = meta.modifiedTime || meta.lastModifiedDateTime || null;
    const changed = Boolean(modifiedTime && (!session.remoteModifiedAt || new Date(modifiedTime) > new Date(session.remoteModifiedAt)));
    return res.json({ session: toSession(session), remoteExists: true, changed, remote: { modifiedTime, size: meta.size || 0 } });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.code || 'SESSION_STATUS_ERROR', message: err.message });
  }
});

router.post('/sessions/:sessionId/sync', auth, async (req, res) => {
  try {
    const session = await ownedSession(req, res);
    if (!session) return;
    let remote;
    const format = session.sourceFormat || 'docx';
    if (format === 'txt') {
      if (session.provider !== 'google_drive' || session.editor !== 'google_docs') {
        const err = new Error('Cette session texte ne peut pas être synchronisée depuis Word pour le web. Le document original reste inchangé.');
        err.statusCode = 415;
        err.code = 'TXT_SYNC_PROVIDER_UNSUPPORTED';
        throw err;
      }
      const meta = await googleDrive.getItemMetadata(req.user, session.remoteId);
      if (meta.trashed === true) {
        const err = new Error('La copie Google Docs a été supprimée.');
        err.statusCode = 404;
        err.code = 'REMOTE_DOCUMENT_MISSING';
        throw err;
      }
      remote = await googleDrive.downloadEditableFile(req.user, session.remoteId, {
        exportMime: TEXT_MIME,
        exportExtension: '.txt',
      });
      remote.buffer = assertEditableText({
        filename: session.sourceFilename || remote.name,
        mime: remote.downloadedMime || TEXT_MIME,
        buffer: remote.buffer,
      });
      remote.name = safeTextFilename(session.sourceFilename || remote.name, `${session.documentId}.txt`);
    } else if (session.provider === 'onedrive') {
      const meta = await oneDrive.getItemMetadata(req.user, session.remoteId);
      assertEditableDocx({ filename: meta.name || session.remoteName, size: meta.size });
      const buffer = await oneDrive.downloadFile(req.user, session.remoteId);
      remote = { buffer, name: meta.name, modifiedTime: meta.modifiedTime, sourceMime: meta.mime || DOCX_MIME };
    } else {
      const meta = await googleDrive.getItemMetadata(req.user, session.remoteId);
      assertEditableDocx({
        filename: meta.mimeType === 'application/vnd.google-apps.document' ? `${meta.name}.docx` : meta.name,
        size: meta.size,
      });
      remote = await googleDrive.downloadEditableFile(req.user, session.remoteId);
    }
    if (format !== 'txt') assertEditableDocx({ filename: remote.name || session.remoteName, buffer: remote.buffer });
    const result = await saveVersion({
      tenantId: session.tenantId,
      dossierId: session.dossierId,
      documentId: session.documentId,
      userId: req.user,
      buffer: remote.buffer,
      filename: format === 'txt'
        ? safeTextFilename(session.sourceFilename || remote.name, session.remoteName)
        : safeFilename(remote.name, session.remoteName),
      mime: format === 'txt' ? `${TEXT_MIME}; charset=utf-8` : DOCX_MIME,
      editor: session.editor,
      origin: session.provider,
      comment: req.body?.comment || `Synchronisation depuis ${session.editor === 'word_web' ? 'Word pour le web' : 'Google Docs'}`,
      status: req.body?.status || 'draft',
      baseVersionId: session.baseVersionId,
    });
    session.remoteModifiedAt = remote.modifiedTime || new Date();
    session.lastSyncedAt = new Date();
    session.lastSyncedVersionId = result.version.versionId;
    if (result.conflict) {
      session.state = 'conflict';
      await session.save();
      audit.failure(req, 'SYNC', 'external-document-session', session._id, 'version-conflict', {
        documentId: String(session.documentId),
        savedConflictVersionId: result.version.versionId,
      });
      return res.status(409).json({
        error: 'DOCUMENT_VERSION_CONFLICT',
        message: 'Une autre version a été enregistrée entre-temps. Les deux versions sont conservées.',
        session: toSession(session),
        history: toClient(result.history),
      });
    }

    session.baseVersionId = result.version.versionId;
    session.state = 'synced';
    await session.save();
    if (!session.keepRemoteCopy) {
      try {
        await removeRemote(session);
        session.state = 'closed';
        await session.save();
      } catch (cleanupError) {
        audit.failure(req, 'DELETE', 'external-document-copy', session._id, cleanupError.code || cleanupError.message);
      }
    }
    let canonicalSynced = true;
    let canonicalCopySynced = format !== 'txt';
    try {
      // Le chemin canonique historique est un cache nommé .docx. Pour un TXT,
      // l'historique courant enregistré ci-dessus est déjà la source de vérité ;
      // y écrire du texte sous une clé .docx rendrait les lecteurs incohérents.
      if (format !== 'txt') {
        await saveCanonicalDocument(session.documentId, remote.buffer, DOCX_MIME, {
          tenantId: session.tenantId,
          dossierId: session.dossierId,
        });
      }
    } catch (canonicalError) {
      // L'historique courant est la source de vérité : la synchronisation est
      // acquise et idempotente même si sa copie canonique dérivée est momentanément indisponible.
      canonicalSynced = false;
      canonicalCopySynced = false;
      audit.failure(req, 'UPDATE', 'document-canonical-copy', session.documentId, canonicalError.code || canonicalError.message);
    }
    audit.update(req, 'external-document-session', session._id, {
      action: 'SYNC',
      documentId: String(session.documentId),
      versionId: result.version.versionId,
      remoteCopyDeleted: !session.keepRemoteCopy,
    });
    return res.json({
      ok: true,
      session: toSession(session),
      history: toClient(result.history),
      canonicalSynced,
      canonicalCopySynced,
      warning: canonicalSynced ? null : 'La version est conservée dans l’historique ; la copie de consultation sera régénérée automatiquement.',
    });
  } catch (err) {
    audit.failure(req, 'SYNC', 'external-document-session', req.params.sessionId, err.code || err.message);
    return res.status(err.statusCode || 500).json({ error: err.code || 'EXTERNAL_SYNC_ERROR', message: err.message });
  }
});

router.delete('/sessions/:sessionId', auth, async (req, res) => {
  try {
    const session = await ownedSession(req, res);
    if (!session) return;
    const removeCopy = req.query.deleteRemote === 'true' || !session.keepRemoteCopy;
    if (removeCopy && session.state !== 'remote_missing') await removeRemote(session);
    session.state = 'closed';
    await session.save();
    audit.update(req, 'external-document-session', session._id, { action: 'CLOSE', remoteCopyDeleted: removeCopy });
    return res.json({ ok: true, session: toSession(session) });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.code || 'SESSION_CLOSE_ERROR', message: err.message });
  }
});

router.get('/:docId/compatibility', auth, async (req, res) => {
  try {
    const context = await documentContext(req, res, req.params.docId);
    if (!context) return;
    const content = await resolveDocumentContent({
      tenantId: context.tenantId,
      dossierId: context.dossierId,
      documentId: req.params.docId,
      fallbackFilename: context.embedded.nomDocument,
    });
    if (!content) return res.status(404).json({ error: 'DOCUMENT_CONTENT_NOT_FOUND' });
    return res.json({ compatibility: analyzeDocx(content.buffer) });
  } catch (err) {
    return res.status(500).json({ error: 'COMPATIBILITY_ANALYSIS_ERROR', message: err.message });
  }
});

module.exports = router;
