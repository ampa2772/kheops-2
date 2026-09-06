const {makeExternalSessionSync}=require('../externalSessionSync');

function fixture() {
  const session={_id:'session',userId:'user',tenantId:'tenant',dossierId:'matter',documentId:'document',
    provider:'google_drive',editor:'google_docs',sourceFormat:'txt',sourceFilename:'Essai.txt',remoteId:'file',
    remoteName:'Essai',remoteRevision:'revision-1',baseVersionId:'base',state:'open',keepRemoteCopy:true,autoSyncEnabled:true};
  const Model={findOneAndUpdate:jest.fn(async()=>session),updateOne:jest.fn().mockResolvedValue({matchedCount:1})};
  const google={getItemMetadata:jest.fn().mockResolvedValue({version:'revision-2',name:'Essai',modifiedTime:'2026-09-06T00:00:00Z'}),
    downloadEditableFile:jest.fn().mockResolvedValue({buffer:Buffer.from('Texte fictif modifié'),name:'Essai.txt',downloadedMime:'text/plain'})};
  const history={saveVersion:jest.fn().mockResolvedValue({version:{versionId:'next'},history:{currentVersionId:'next'},conflict:false})};
  const content={saveCanonicalDocument:jest.fn()},authorize=jest.fn().mockResolvedValue(true);
  return {session,Model,google,history,content,authorize,clock:()=>new Date('2026-09-06T00:01:00Z')};
}
test('imports one stable remote revision with a mandatory base and durable operation identity',async()=>{
  const f=fixture();const result=await makeExternalSessionSync(f).synchronize({session:f.session,userId:'user',automatic:true});
  expect(result.ok).toBe(true);expect(f.google.getItemMetadata).toHaveBeenCalledTimes(2);
  expect(f.history.saveVersion).toHaveBeenCalledWith(expect.objectContaining({requireBaseVersion:true,baseVersionId:'base',operationKey:expect.stringMatching(/^external:session:/)}));
  expect(f.session).toMatchObject({baseVersionId:'next',remoteRevision:'revision-2',state:'synced'});
  expect(f.content.saveCanonicalDocument).not.toHaveBeenCalled();
});
test('does not download unchanged content in automatic mode',async()=>{
  const f=fixture();f.session.remoteRevision='revision-2';
  expect((await makeExternalSessionSync(f).synchronize({session:f.session,userId:'user',automatic:true})).unchanged).toBe(true);
  expect(f.google.downloadEditableFile).not.toHaveBeenCalled();expect(f.history.saveVersion).not.toHaveBeenCalled();
});
test('retries an edit occurring during download without saving partial content',async()=>{
  const f=fixture();f.google.getItemMetadata.mockResolvedValueOnce({version:'revision-2'}).mockResolvedValueOnce({version:'revision-3'});
  await expect(makeExternalSessionSync(f).synchronize({session:f.session,userId:'user'})).rejects.toMatchObject({code:'REMOTE_CHANGED_DURING_READ',retryable:true});
  expect(f.history.saveVersion).not.toHaveBeenCalled();
  expect(f.Model.updateOne).toHaveBeenLastCalledWith(expect.objectContaining({'syncLease.token':expect.any(String)}),{$set:{syncLease:{token:null,expiresAt:null}}});
});
test('refuses a second worker/manual import while the session lease is held',async()=>{
  const f=fixture();f.Model.findOneAndUpdate.mockResolvedValue(null);
  await expect(makeExternalSessionSync(f).synchronize({session:f.session,userId:'user'})).rejects.toMatchObject({code:'EXTERNAL_SYNC_BUSY'});
  expect(f.google.getItemMetadata).not.toHaveBeenCalled();
});
test('preserves a conflicting version and stops automatic import without changing the base',async()=>{
  const f=fixture();f.history.saveVersion.mockResolvedValue({version:{versionId:'conflicting'},history:{currentVersionId:'other'},conflict:true});
  const result=await makeExternalSessionSync(f).synchronize({session:f.session,userId:'user'});
  expect(result.conflict).toBe(true);expect(f.session).toMatchObject({state:'conflict',baseVersionId:'base',lastSyncedVersionId:'conflicting'});
  expect(f.content.saveCanonicalDocument).not.toHaveBeenCalled();
});
test('rechecks permissions before contacting the provider',async()=>{
  const f=fixture();f.authorize.mockRejectedValue({statusCode:403});
  await expect(makeExternalSessionSync(f).synchronize({session:f.session,userId:'user'})).rejects.toMatchObject({statusCode:403});
  expect(f.google.getItemMetadata).not.toHaveBeenCalled();expect(f.Model.findOneAndUpdate).not.toHaveBeenCalled();
});
test('respects provider throttling without disabling the connection or exposing credentials',async()=>{
  const f=fixture();f.google.getItemMetadata.mockRejectedValue({response:{status:429,headers:{'retry-after':'7200'}},config:{headers:{Authorization:'secret'}}});
  await expect(makeExternalSessionSync(f).synchronize({session:f.session,userId:'user'})).rejects.toMatchObject({externalStateRecorded:true});
  expect(f.Model.updateOne).toHaveBeenCalledWith(expect.anything(),{$set:expect.objectContaining({nextSyncAt:new Date('2026-09-06T02:01:00Z'),syncAttempts:1})});
  expect(JSON.stringify(f.Model.updateOne.mock.calls)).not.toContain('secret');
});

test('backs up a temporary copy before moving it to the recoverable trash',async()=>{
  const f=fixture();f.session.keepRemoteCopy=false;f.google.trashItem=jest.fn().mockResolvedValue({ok:true});
  const result=await makeExternalSessionSync(f).synchronize({session:f.session,userId:'user'});
  expect(result.cleanupPending).toBe(false);expect(f.session.state).toBe('closed');
  expect(f.history.saveVersion.mock.invocationCallOrder[0]).toBeLessThan(f.google.trashItem.mock.invocationCallOrder[0]);
  expect(f.google.getItemMetadata).toHaveBeenCalledTimes(3);
});

test('does not remove a remote copy changed after its backup',async()=>{
  const f=fixture();f.session.keepRemoteCopy=false;f.google.trashItem=jest.fn();
  f.google.getItemMetadata.mockResolvedValueOnce({version:'2'}).mockResolvedValueOnce({version:'2'}).mockResolvedValueOnce({version:'3'});
  const result=await makeExternalSessionSync(f).synchronize({session:f.session,userId:'user'});
  expect(result.cleanupPending).toBe(true);expect(f.session.state).toBe('synced');expect(f.google.trashItem).not.toHaveBeenCalled();
});

test('never removes a conflicting copy, including an explicit close request',async()=>{
  const f=fixture();f.google.trashItem=jest.fn();
  f.history.saveVersion.mockResolvedValue({version:{versionId:'conflict'},history:{currentVersionId:'other'},conflict:true});
  const result=await makeExternalSessionSync(f).synchronize({session:f.session,userId:'user',removeRemote:true});
  expect(result.conflict).toBe(true);expect(f.google.trashItem).not.toHaveBeenCalled();
});
