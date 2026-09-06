const crypto = require('crypto');
const Session = require('../models/Storage/ExternalEditSession');
const Dossier = require('../models/Folder/Dossier');
const historyService = require('./documentHistoryService');
const contentService = require('./documentContentService');
const oneDrive = require('./storage/oneDriveClient');
const googleDrive = require('./storage/googleDriveClient');
const access = require('./sync/documentSyncAccess');
const {retryable,retryAfterMs} = require('./sync/providerErrors');
const {DOCX_MIME,TEXT_MIME,assertEditableDocx,assertEditableText,safeFilename,safeTextFilename} = require('./externalDocumentFormats');

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const stamp = meta => String(meta?.version || meta?.etag || meta?.eTag || meta?.modifiedTime || meta?.lastModifiedDateTime || '');
const failure = (code,message,statusCode=409,retry=false) => Object.assign(new Error(message),{code,statusCode,retryable:retry});

async function assertAccess(session,userId) {
  if(String(userId)!==String(session.userId)) throw failure('SESSION_ACCESS_DENIED','Session inaccessible.',403);
  await access.assertDossierAccess({tenantId:session.tenantId,dossierId:session.dossierId,userId});
  const embedded=await Dossier.exists({_id:session.dossierId,tenantId:session.tenantId,'dossier.documents._id':session.documentId});
  if(!embedded) throw failure('SESSION_SCOPE_MISMATCH','Le document n’appartient plus à ce dossier.',403);
}

function makeExternalSessionSync({Model=Session,history=historyService,content=contentService,microsoft=oneDrive,google=googleDrive,
  authorize=assertAccess,clock=()=>new Date()}={}) {
  const metadata = s => s.provider==='onedrive'
    ? microsoft.getItemMetadata(s.userId,s.remoteId,...(s.remoteDriveId?[s.remoteDriveId]:[]))
    : google.getItemMetadata(s.userId,s.remoteId);

  async function synchronize({session,userId,automatic=false,removeRemote=false,comment='',status='draft'}) {
    await authorize(session,userId);
    if(session.state==='conflict') throw failure('DOCUMENT_VERSION_CONFLICT','Les deux versions sont conservées ; résolvez le conflit avant de reprendre.');
    if(session.state==='closed') throw failure('SESSION_CLOSED','Cette session est terminée.');
    const leaseToken=crypto.randomUUID(), now=clock();
    const locked=await Model.findOneAndUpdate({_id:session._id,userId,tenantId:session.tenantId,
      state:{$in:automatic?['open','synced']:['open','synced','remote_missing']},
      ...(automatic?{autoSyncEnabled:true}:{}),
      $or:[{'syncLease.expiresAt':null},{'syncLease.expiresAt':{$lte:now}}],
    },{$set:{syncLease:{token:leaseToken,expiresAt:new Date(now.getTime()+300000)}}},{new:true});
    if(!locked) throw failure('EXTERNAL_SYNC_BUSY','Une synchronisation est déjà en cours.',409,true);
    session=locked;
    const guard=()=>({_id:session._id,'syncLease.token':leaseToken,'syncLease.expiresAt':{$gt:clock()}});
    const store=async fields=>{
      const changed=await Model.updateOne(guard(),{$set:fields});
      if(changed.matchedCount!==1) throw failure('EXTERNAL_SYNC_LEASE_LOST','La synchronisation sera reprise sans écraser de version.',409,true);
      for(const [key,value] of Object.entries(fields)) if(!key.includes('.')) session[key]=value;
    };
    try {
      const before=await metadata(session);
      if(before.trashed) throw failure('REMOTE_DOCUMENT_MISSING','La copie externe est à la corbeille.',404);
      const revision=stamp(before);
      if(automatic && revision && revision===session.remoteRevision) {
        await store({nextSyncAt:new Date(clock().getTime()+60000),syncAttempts:0,lastSyncError:''});
        return {ok:true,unchanged:true,session};
      }
      const format=session.sourceFormat||'docx'; let remote;
      if(format==='txt') {
        if(session.provider!=='google_drive') throw failure('TXT_SYNC_PROVIDER_UNSUPPORTED','Ce parcours texte nécessite Google Docs.',415);
        remote=await google.downloadEditableFile(userId,session.remoteId,{exportMime:TEXT_MIME,exportExtension:'.txt'});
        remote.buffer=assertEditableText({filename:session.sourceFilename||remote.name,mime:remote.downloadedMime||TEXT_MIME,buffer:remote.buffer});
      } else if(session.provider==='onedrive') {
        assertEditableDocx({filename:before.name||session.remoteName,size:before.size});
        remote={buffer:await microsoft.downloadFile(userId,session.remoteId,...(session.remoteDriveId?[session.remoteDriveId]:[])),name:before.name};
      } else {
        assertEditableDocx({filename:before.mimeType==='application/vnd.google-apps.document'?`${before.name}.docx`:before.name,size:before.size});
        remote=await google.downloadEditableFile(userId,session.remoteId);
      }
      if(format!=='txt') assertEditableDocx({filename:remote.name||session.remoteName,buffer:remote.buffer});
      const after=await metadata(session);
      if(after.trashed || stamp(after)!==revision) throw failure('REMOTE_CHANGED_DURING_READ','La copie externe change encore ; la lecture sera reprise.',409,true);
      // Renew before committing the immutable version. A retry uses the same
      // operation identity, including when the first result was a conflict.
      await store({'syncLease.expiresAt':new Date(clock().getTime()+300000)});
      const result=await history.saveVersion({tenantId:session.tenantId,dossierId:session.dossierId,documentId:session.documentId,userId,
        buffer:remote.buffer,filename:format==='txt'?safeTextFilename(session.sourceFilename||remote.name,session.remoteName):safeFilename(remote.name,session.remoteName),
        mime:format==='txt'?`${TEXT_MIME}; charset=utf-8`:DOCX_MIME,editor:session.editor,origin:session.provider,
        comment:comment||`Synchronisation depuis ${session.editor==='word_web'?'Word pour le web':'Google Docs'}`,
        status,baseVersionId:session.baseVersionId,requireBaseVersion:true,
        operationKey:`external:${session._id}:${hash(Buffer.from(revision+':'+hash(remote.buffer)))}`,
      });
      const updates={remoteModifiedAt:after.modifiedTime||after.lastModifiedDateTime||clock(),remoteRevision:revision,
        lastSyncedAt:clock(),lastSyncedVersionId:result.version.versionId,
        state:result.conflict?'conflict':'synced',nextSyncAt:new Date(clock().getTime()+60000),syncAttempts:0,lastSyncError:''};
      if(!result.conflict) updates.baseVersionId=result.version.versionId;
      await store(updates);
      if(result.conflict) return {ok:false,conflict:true,session,history:result.history};
      let canonicalSynced=true;
      try {if(format!=='txt') await content.saveCanonicalDocument(session.documentId,remote.buffer,DOCX_MIME,{tenantId:session.tenantId,dossierId:session.dossierId});}
      catch(_) {canonicalSynced=false;}
      // Keep the native file recoverable in the provider's recycle bin. A fresh
      // revision check prevents closing over an edit detected after the backup.
      let cleanupPending=false;
      if(!automatic && (removeRemote || !session.keepRemoteCopy)) {
        try {
          const latest=await metadata(session);
          if(stamp(latest)!==revision) throw failure('REMOTE_CHANGED_BEFORE_CLOSE','La copie a changé ; synchronisez-la à nouveau.');
          await store({'syncLease.expiresAt':new Date(clock().getTime()+300000)});
          if(session.provider==='onedrive') {
            if(!latest.etag) throw failure('REMOTE_REVISION_REQUIRED','La révision distante ne permet pas une fermeture sûre.');
            await microsoft.deleteItem(userId,session.remoteId,session.remoteDriveId||undefined,latest.etag);
          } else await google.trashItem(userId,session.remoteId,latest.etag);
          await store({state:'closed',autoSyncEnabled:false,nextSyncAt:null,cleanupPending:false});
        } catch(_) {
          cleanupPending=true;
          await store({cleanupPending:true,lastSyncError:'Version sauvegardée. La copie externe reste à fermer ; vérifiez-la puis réessayez.'});
        }
      }
      return {ok:true,session,history:result.history,cleanupPending,canonicalSynced,canonicalCopySynced:canonicalSynced&&format!=='txt'};
    } catch(error) {
      const missing=Number(error?.response?.status||error?.statusCode)===404;
      const attempts=Number(session.syncAttempts||0)+1;
      const transient=retryable(error);
      const delay=Math.max(60000*Math.min(30,2**Math.min(5,attempts-1)),retryAfterMs(error,clock().getTime()));
      const fields={syncAttempts:attempts,lastSyncError:missing?'Copie externe introuvable.':transient?'Connexion temporairement indisponible ; reprise prévue.':'Vérifiez la connexion et les autorisations de cette copie.',
        nextSyncAt:new Date(clock().getTime()+delay)};
      if(missing) fields.state='remote_missing';
      if(!transient) fields.autoSyncEnabled=false;
      const recorded=await Model.updateOne(guard(),{$set:fields});
      if(recorded.matchedCount===1) error.externalStateRecorded=true;
      throw error;
    } finally {
      await Model.updateOne({_id:session._id,'syncLease.token':leaseToken},{$set:{syncLease:{token:null,expiresAt:null}}});
    }
  }
  return {synchronize,metadata};
}
module.exports={stamp,assertAccess,makeExternalSessionSync,...makeExternalSessionSync()};
