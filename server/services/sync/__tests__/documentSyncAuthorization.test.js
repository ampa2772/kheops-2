const mongoose=require('mongoose');
const {makeDocumentSyncAuthorization}=require('../documentSyncAuthorization');
const id=()=>new mongoose.Types.ObjectId();
function fixture(){
 const tenantId=id(), logicalDocumentId=id(), userId=id(), dossierId=id(), documentId=id();
 const logical={_id:logicalDocumentId,tenantId,dossierId,aliases:[{system:'legacy-dossier-document',externalId:String(documentId)}]};
 const Logical={findOne:jest.fn(()=>({lean:async()=>logical}))};
 const Location={exists:jest.fn().mockResolvedValue(false)},Stored={exists:jest.fn().mockResolvedValue(false)},History={exists:jest.fn().mockResolvedValue(false)},DossierModel={exists:jest.fn().mockResolvedValue(true)};
 const dossierAccess=jest.fn().mockResolvedValue(true);
 return {tenantId,logicalDocumentId,userId,dossierId,documentId,logical,Logical,Location,Stored,History,DossierModel,dossierAccess};
}
test('rejects a known key outside the logical document, without trusting client metadata',async()=>{
 const f=fixture();const service=makeDocumentSyncAuthorization(f);
 await expect(service.assertStorageReference({...f,storageKey:'onedrive:another-user:known-file'})).rejects.toMatchObject({statusCode:403});
 expect(f.Location.exists).toHaveBeenCalledWith(expect.objectContaining({tenantId:f.tenantId,logicalDocumentId:f.logicalDocumentId,verifiedStorageKey:'onedrive:another-user:known-file',storageVerifiedAt:{$type:'date'}}));
});
test('accepts only an exact recorded historical version after checking its dossier and user access',async()=>{
 const f=fixture();f.History.exists.mockResolvedValue(true);
 await expect(makeDocumentSyncAuthorization(f).assertStorageReference({...f,storageKey:'googledrive:owner:version'})).resolves.toBeDefined();
 expect(f.History.exists).toHaveBeenCalledWith({tenantId:f.tenantId,dossierId:f.dossierId,documentId:String(f.documentId),'versions.storageKey':'googledrive:owner:version'});
 f.DossierModel.exists.mockResolvedValue(false);
 await expect(makeDocumentSyncAuthorization(f).assertStorageReference({...f,storageKey:'googledrive:owner:version'})).rejects.toMatchObject({statusCode:403});
});
test('accepts an owned legacy canonical file but rejects a neighboring id or traversal',async()=>{
 const f=fixture();const service=makeDocumentSyncAuthorization(f);
 await expect(service.assertStorageReference({...f,storageKey:`documents/${f.documentId}.docx`})).resolves.toBeDefined();
 for(const key of [`documents/${id()}.docx`,`documents/../${f.documentId}.docx`]) await expect(service.assertStorageReference({...f,storageKey:key})).rejects.toMatchObject({statusCode:403});
});
test('rechecks revoked access even for server-attested references',async()=>{
 const f=fixture();f.Location.exists.mockResolvedValue(true);f.dossierAccess.mockRejectedValue(Object.assign(new Error('denied'),{statusCode:403}));
 await expect(makeDocumentSyncAuthorization(f).assertStorageReference({...f,storageKey:'verified'})).rejects.toMatchObject({statusCode:403});
 expect(f.Location.exists).not.toHaveBeenCalled();
});
test('pins a cloud destination to its registering account and requires a container',async()=>{
 const f=fixture(); const service=makeDocumentSyncAuthorization(f);
 const location={provider:'onedrive',accountRef:String(f.userId),createdBy:f.userId,containerId:'drive-A',state:'available'};
 await expect(service.assertDestination({...f,location})).resolves.toMatchObject({ownerUserId:String(f.userId),containerId:'drive-A'});
 for(const bad of [{containerId:''},{accountRef:String(id())},{state:'revoked'}]) await expect(service.assertDestination({...f,location:{...location,...bad}})).rejects.toMatchObject({statusCode:403});
});
test('canonical destination is internal, independent of preferences',async()=>{
 const f=fixture();await expect(makeDocumentSyncAuthorization(f).assertDestination({...f,location:{provider:'canonical'}})).resolves.toMatchObject({providerName:'managed_gcs'});
});
