const crypto=require('crypto');
const History=require('../../models/Storage/DocumentHistory');
const Logical=require('../../models/Documents/LogicalDocument');
const Version=require('../../models/Documents/DocumentVersion');
const Dossier=require('../../models/Folder/Dossier');
const logicalService=require('./logicalDocumentService');
const syncService=require('./documentSyncService');
const access=require('./documentSyncAccess');

const failure=code=>Object.assign(new Error('Le registre documentaire doit être vérifié.'),{code});
const digest=value=>crypto.createHash('sha256').update(String(value)).digest('hex');

function makeDocumentHistoryProjection({Model=History,Documents=Logical,Versions=Version,Dossiers=Dossier,
  registry=logicalService,journal=syncService,authorize=access.assertDossierAccess,clock=()=>new Date()}={}) {
  async function projectVersion(history,version) {
    const actor=history.versions.find(row=>row.versionId===history.currentVersionId)?.createdBy||version.createdBy;
    const scope={tenantId:history.tenantId,dossierId:history.dossierId,userId:actor};
    await authorize(scope);
    if(!await Dossiers.exists({_id:history.dossierId,tenantId:history.tenantId,'dossier.documents._id':history.documentId})) throw failure('HISTORY_SCOPE_CHANGED');
    let document=await Documents.findOne({tenantId:history.tenantId,dossierId:history.dossierId,
      aliases:{$elemMatch:{system:'legacy-dossier-document',externalId:String(history.documentId)}}}).lean();
    if(!document) ({document}=await registry.registerDocument({...scope,input:{
      identityKey:`history_${history.documentId}`,idempotencyKey:`history-document:${history.documentId}`,
      title:version.filename||'Document',preferredMime:version.mime,
      aliases:[{system:'legacy-dossier-document',externalId:String(history.documentId)}],
      provenance:{source:'sync',sourceId:String(history._id),sourceCollection:'documenthistories'},
    }}));
    if(document.status==='archived') throw failure('HISTORY_DOCUMENT_ARCHIVED');
    const versionScope={tenantId:history.tenantId,logicalDocumentId:document._id};
    let registered=await Versions.findOne({...versionScope,versionId:version.versionId}).lean();
    if(!registered) {
      const latest=await Versions.findOne(versionScope).sort({sequence:-1}).select('sequence').lean();
      const legalStatus=['draft','review','validated','signed','archived','conflict'].includes(version.status)?version.status:'review';
      try {registered=await Versions.create({...versionScope,versionId:version.versionId,sequence:Number(latest?.sequence||0)+1,
        parentVersionIds:version.baseVersionId?[version.baseVersionId]:[],checksum:version.checksum,size:version.size,
        mime:version.mime,filename:version.filename,storageRef:{provider:'managed_gcs',storageKey:version.storageKey},
        editor:version.editor==='collabora'?'system':version.editor,origin:version.origin,status:legalStatus,
        conflictWithVersionId:version.conflictWithVersionId,comment:version.comment,createdBy:version.createdBy,
        idempotencyKey:`history-version:${history._id}:${version.versionId}`,
      });} catch(error) {
        if(error.code!==11000) throw error;
        registered=await Versions.findOne({...versionScope,versionId:version.versionId}).lean();
        if(!registered) throw failure('HISTORY_SEQUENCE_RACE');
      }
    }
    if(registered.checksum!==version.checksum || registered.storageRef?.storageKey!==version.storageKey) throw failure('HISTORY_VERSION_MISMATCH');
    if(registered.status==='conflict' && version.status!=='conflict' && !version.conflictWithVersionId) {
      await Versions.updateOne({...versionScope,versionId:version.versionId,checksum:version.checksum},{$set:{status:version.status,conflictWithVersionId:null}});
    }
    const key=digest(`${history._id}:${version.versionId}`).slice(0,40);
    const {copy}=await registry.registerCopy({tenantId:history.tenantId,logicalDocumentId:document._id,userId:actor,input:{
      copyKey:`history_${key}`,basedOnVersionId:version.versionId,purpose:'canonical',format:version.filename?.split('.').pop()?.toLowerCase()||'binary',
      checksum:version.checksum,size:version.size,state:'ready',retentionPolicy:'keep',
    }});
    const {location}=await registry.registerLocation({tenantId:history.tenantId,copyId:copy._id,userId:actor,input:{
      locationKey:`history_${key}`,provider:'canonical',storageKey:version.storageKey,remoteChecksum:version.checksum,
    }});
    // The authoritative history alone decides which version is current. Other
    // registry branches remain intact and require an explicit reconciliation.
    if(String(history.currentVersionId)===String(version.versionId) && !version.conflictWithVersionId && version.status!=='conflict') {
      const current=await Documents.findOne({_id:document._id,tenantId:history.tenantId}).lean();
      if(current.currentVersionId && current.currentVersionId!==version.versionId
        && current.currentVersionId!==current.projectedHistoryVersionId
        && !history.versions.some(row=>row.versionId===current.currentVersionId)) throw failure('HISTORY_REGISTRY_DIVERGED');
      const changed=await Documents.updateOne({_id:document._id,tenantId:history.tenantId,currentVersionId:current.currentVersionId||null,revision:current.revision??{$exists:false},status:{$ne:'archived'}},{$set:{
        currentVersionId:version.versionId,projectedHistoryVersionId:version.versionId,canonicalCopyId:copy._id,updatedBy:version.createdBy,
      },$inc:{revision:1}});
      if(changed.matchedCount!==1) throw failure('HISTORY_REGISTRY_RACE');
    }
    // The normal worker reads back this existing immutable file. No extra
    // physical upload or external transfer is implied by registration.
    await journal.enqueue({tenantId:history.tenantId,logicalDocumentId:document._id,userId:actor,input:{
      idempotencyKey:`history-check:${history._id}:${version.versionId}`,direction:'reconcile',
      source:{versionId:version.versionId,checksum:version.checksum},target:{copyId:copy._id,locationId:location._id},
      metadata:{origin:'document_history'},
    }});
    return {logicalDocumentId:document._id,versionId:version.versionId};
  }

  async function runOnce() {
    const now=clock(),token=crypto.randomUUID();
    const history=await Model.findOneAndUpdate({'versions.syncProjectionPending':true,
      $and:[{$or:[{syncProjectionNextAt:null},{syncProjectionNextAt:{$lte:now}}]},
        {$or:[{'syncProjectionLease.expiresAt':null},{'syncProjectionLease.expiresAt':{$lte:now}}]}],
    },{$set:{syncProjectionLease:{token,expiresAt:new Date(now.getTime()+300000)}}},{new:true,sort:{updatedAt:1}});
    if(!history) return {processed:0};
    const pending=history.versions.filter(row=>row.syncProjectionPending).slice(0,20);
    let processed=0;
    const guard=()=>({_id:history._id,'syncProjectionLease.token':token,'syncProjectionLease.expiresAt':{$gt:clock()}});
    try {
      for(const version of pending) {
        const renewed=await Model.updateOne(guard(),{$set:{'syncProjectionLease.expiresAt':new Date(clock().getTime()+300000)}});
        if(renewed.matchedCount!==1) throw failure('HISTORY_PROJECTION_LEASE_LOST');
        await projectVersion(history,version);
        const recorded=await Model.updateOne(guard(),{$set:{'versions.$[version].syncProjectionPending':false,syncProjectionError:'',syncProjectionNextAt:null},$inc:{__v:1}},
          {arrayFilters:[{'version.versionId':version.versionId}]});
        if(recorded.matchedCount!==1) throw failure('HISTORY_PROJECTION_LEASE_LOST');
        processed++;
      }
      return {processed};
    } catch(_) {
      await Model.updateOne(guard(),{$set:{syncProjectionError:'La vérification du registre sera reprise ; les versions restent conservées.',syncProjectionNextAt:new Date(clock().getTime()+60000)}});
      return {processed,pending:true};
    } finally {
      await Model.updateOne({_id:history._id,'syncProjectionLease.token':token},{$set:{syncProjectionLease:{token:null,expiresAt:null}}});
    }
  }
  return {runOnce,projectVersion};
}
module.exports={makeDocumentHistoryProjection,...makeDocumentHistoryProjection()};
