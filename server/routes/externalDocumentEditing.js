const express = require('express');
const mongoose = require('mongoose');

const auth = require('../middlewares/middleware-auth');
const { ensureDocOwnership } = require('../utils/ownershipHelpers');
const Dossier = require('../models/Folder/Dossier');
const Tenant = require('../models/Cabinet/Tenant');
const User = require('../models/App_Users/User');
const ExternalEditSession = require('../models/Storage/ExternalEditSession');
const oneDrive = require('../services/storage/oneDriveClient');
const googleDrive = require('../services/storage/googleDriveClient');
const { resolveDocumentContent, DOCX_MIME } = require('../services/documentContentService');
const { saveVersion, toClient } = require('../services/documentHistoryService');
const { analyzeDocx } = require('../services/documentCompatibilityService');
const audit = require('../utils/auditLogger');

const router = express.Router();
const { TEXT_MIME, assertEditableDocx, assertEditableText, sourceFormat, safeFilename, safeTextFilename } = require('../services/externalDocumentFormats');

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
    autoSyncEnabled: session.autoSyncEnabled === true,
    lastSyncError: session.lastSyncError || '',
    cleanupPending: session.cleanupPending === true,
    nextSyncAt: session.nextSyncAt || null,
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
    const policy = require('../services/documentPolicy').normalizeDocumentPolicy(tenant?.documentPolicy);
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
    const displayFilename = embeddedFormat === format
      ? context.embedded.nomDocument
      : content.filename || context.embedded.nomDocument;
    const filename = format === 'txt'
      ? safeTextFilename(displayFilename, req.params.docId)
      : safeFilename(displayFilename, req.params.docId);
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
      baseVersionId: content.versionId || null,
      requireBaseVersion: true,
      structuredDocument: content.structuredDocument || null,
    });
    if(initial.conflict) return res.status(409).json({error:'DOCUMENT_VERSION_CONFLICT',message:'Le document a changé pendant son ouverture. Rechargez sa version actuelle avant le transfert.'});
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
      const driveId=await oneDrive.getDriveId(req.user);
      await oneDrive.ensureFolderPath(req.user, ['Kheops2', 'Modifications Kheops', String(req.params.docId)],driveId);
      remote = await oneDrive.uploadFile(req.user, {
        path: `Kheops2/Modifications Kheops/${req.params.docId}/${Date.now()}-${filename}`,
        buffer: transferBuffer,
        mime: DOCX_MIME,
        driveId,
      });
      remote.driveId=driveId;
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
        remoteDriveId: remote.driveId || '',
        remoteRevision: String(remote.version || remote.etag || remote.modifiedTime || ''),
        sourceFormat: format || 'docx',
        sourceFilename: filename,
        sourceMime: format === 'txt' ? `${TEXT_MIME}; charset=utf-8` : (content.mime || DOCX_MIME),
        returnFormat: format || 'docx',
        baseVersionId,
        keepRemoteCopy,
        autoSyncEnabled: keepRemoteCopy && req.body?.autoSync !== false,
        nextSyncAt: new Date(Date.now()+60000),
        convertedToNative: convertToNative,
        state: 'open',
      });
    } catch (sessionError) {
      // Compensation : un échec Mongo après l'upload ne doit jamais laisser un
      // document juridique orphelin dans le cloud personnel.
      try {
        if (provider === 'onedrive') await oneDrive.deleteItem(req.user, remote.itemId,...(remote.driveId?[remote.driveId]:[]));
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
      state: { $in: ['open', 'synced', 'conflict', 'remote_missing'] },
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
    let session = await ownedSession(req, res);
    if (!session) return;
    if(req.query?.localOnly==='true') return res.json({session:toSession(session),localOnly:true});
    let meta;
    try {
      if(session.state==='closed') return res.json({session:toSession(session),remoteExists:false,changed:false});
      meta = await require('../services/externalSessionSync').metadata(session);
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
    if(session.state==='remote_missing') {
      const restored=await ExternalEditSession.findOneAndUpdate({_id:session._id,userId:req.user,state:'remote_missing',
        $or:[{'syncLease.expiresAt':null},{'syncLease.expiresAt':{$lte:new Date()}}]},
      {$set:{state:session.lastSyncedAt?'synced':'open',autoSyncEnabled:false,nextSyncAt:null,lastSyncError:''}},{new:true});
      if(restored) session=restored;
    }
    const modifiedTime = meta.modifiedTime || meta.lastModifiedDateTime || null;
    const revision = require('../services/externalSessionSync').stamp(meta);
    const changed = revision && session.remoteRevision
      ? revision !== session.remoteRevision
      : Boolean(modifiedTime && (!session.remoteModifiedAt || new Date(modifiedTime) > new Date(session.remoteModifiedAt)));
    return res.json({ session: toSession(session), remoteExists: true, changed, remote: { modifiedTime, size: meta.size || 0 } });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.code || 'SESSION_STATUS_ERROR', message: err.message });
  }
});

router.post('/sessions/:sessionId/sync', auth, async (req, res) => {
  try {
    const session = await ownedSession(req, res);
    if (!session) return;
    const result = await require('../services/externalSessionSync').synchronize({
      session, userId: req.user, comment: req.body?.comment || '', status: req.body?.status || 'draft',
    });
    audit.update(req, 'external-document-session', session._id, {
      action: result.conflict ? 'SYNC_CONFLICT' : 'SYNC',
      documentId: String(session.documentId), versionId: result.session.lastSyncedVersionId,
    });
    return res.status(result.conflict ? 409 : 200).json({
      ...result, session: toSession(result.session), history: toClient(result.history),
      ...(result.conflict ? {error:'DOCUMENT_VERSION_CONFLICT',message:'Une autre version existe. Les deux versions sont conservées sans écrasement.'} : {}),
    });
  } catch (err) {
    const code = /^[A-Z0-9_]{1,100}$/.test(String(err.code || '')) ? err.code : 'EXTERNAL_SYNC_ERROR';
    audit.failure(req, 'SYNC', 'external-document-session', req.params.sessionId, code);
    return res.status(err.statusCode || err.response?.status || 500).json({error:code,message:err.statusCode ? err.message : 'La copie externe ne peut pas être synchronisée pour le moment.'});
  }
});
router.patch('/sessions/:sessionId/automatic', auth, async (req, res) => {
  try {
    const session = await ownedSession(req,res);
    if(!session) return;
    if(typeof req.body?.enabled !== 'boolean') return res.status(400).json({error:'INVALID_AUTOMATIC_STATE'});
    if(req.body.enabled && (!session.keepRemoteCopy || !['open','synced'].includes(session.state))) {
      return res.status(409).json({error:'AUTOMATIC_SYNC_UNAVAILABLE',message:'Vérifiez la session avant d’activer le retour automatique.'});
    }
    const changed = await ExternalEditSession.findOneAndUpdate({_id:session._id,userId:req.user,state:session.state},{$set:{
      autoSyncEnabled:req.body.enabled,nextSyncAt:req.body.enabled?new Date():null,
    }},{new:true});
    if(!changed) return res.status(409).json({error:'SESSION_CHANGED'});
    return res.json({session:toSession(changed)});
  } catch(err) { return res.status(err.statusCode||500).json({error:'AUTOMATIC_SYNC_ERROR',message:'Impossible de modifier le retour automatique.'}); }
});

router.delete('/sessions/:sessionId', auth, async (req, res) => {
  try {
    const session = await ownedSession(req, res);
    if (!session) return;
    const removeCopy = req.query.deleteRemote === 'true' || !session.keepRemoteCopy;
    if (removeCopy && !['remote_missing','closed'].includes(session.state)) {
      const result = await require('../services/externalSessionSync').synchronize({session,userId:req.user,removeRemote:true});
      if(result.conflict || result.cleanupPending) return res.status(409).json({
        error:result.conflict?'DOCUMENT_VERSION_CONFLICT':'REMOTE_CLOSE_PENDING',session:toSession(result.session),
        message:result.conflict?'Les deux versions sont conservées. Résolvez le conflit avant de fermer la copie.':'La version a été sauvegardée ; la copie externe reste à fermer. Vérifiez-la puis réessayez.',
      });
      audit.update(req,'external-document-session',session._id,{action:'CLOSE',remoteCopyDeleted:true});
      return res.json({ok:true,session:toSession(result.session)});
    }
    const closed=await ExternalEditSession.findOneAndUpdate({_id:session._id,userId:req.user,state:session.state,
      $or:[{'syncLease.expiresAt':null},{'syncLease.expiresAt':{$lte:new Date()}}]},
    {$set:{state:'closed',autoSyncEnabled:false,nextSyncAt:null}},{new:true});
    if(!closed) {
      return res.status(409).json({error:'EXTERNAL_SYNC_BUSY',message:'Attendez la fin de la synchronisation avant de fermer.'});
    }
    audit.update(req, 'external-document-session', session._id, { action: 'CLOSE', remoteCopyDeleted: removeCopy });
    return res.json({ ok: true, session: toSession(closed) });
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
