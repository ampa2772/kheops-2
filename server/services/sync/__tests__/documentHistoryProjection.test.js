const {makeDocumentHistoryProjection}=require('../documentHistoryProjection');
const query=value=>({lean:jest.fn().mockResolvedValue(value),sort:jest.fn().mockReturnThis(),select:jest.fn().mockReturnThis()});
function fixture(){
  const version={versionId:'v1',checksum:'digest',storageKey:'history/file',size:3,filename:'recette.txt',mime:'text/plain',editor:'kheops',origin:'kheops',status:'draft',createdBy:'actor',syncProjectionPending:true};
  const history={_id:'history',tenantId:'tenant',dossierId:'matter',documentId:'document',currentVersionId:'v1',versions:[version]};
  const document={_id:'logical',revision:0,currentVersionId:null,status:'draft'};
  let savedVersion;
  const Documents={findOne:jest.fn(()=>query(document)),updateOne:jest.fn().mockImplementation(async(_query,update)=>{Object.assign(document,update.$set);document.revision++;return {matchedCount:1};})};
  const Versions={findOne:jest.fn(q=>query(q.versionId?savedVersion:null)),create:jest.fn(async v=>(savedVersion=v)),updateOne:jest.fn()};
  const Dossiers={exists:jest.fn().mockResolvedValue(true)},authorize=jest.fn().mockResolvedValue(true);
  const registry={registerDocument:jest.fn(),registerCopy:jest.fn().mockResolvedValue({copy:{_id:'copy'}}),registerLocation:jest.fn().mockResolvedValue({location:{_id:'location'}})};
  const journal={enqueue:jest.fn().mockResolvedValue({created:true})};
  const Model={findOneAndUpdate:jest.fn().mockResolvedValue(history),updateOne:jest.fn().mockResolvedValue({matchedCount:1})};
  return {history,version,document,Documents,Versions,Dossiers,authorize,registry,journal,Model,clock:()=>new Date('2026-09-06T01:00:00Z')};
}
test('registers a business save and queues physical verification without sending to an external cloud',async()=>{
  const f=fixture();expect(await makeDocumentHistoryProjection(f).runOnce()).toEqual({processed:1});
  expect(f.Versions.create).toHaveBeenCalledWith(expect.objectContaining({versionId:'v1',storageRef:{provider:'managed_gcs',storageKey:'history/file'}}));
  expect(f.registry.registerLocation).toHaveBeenCalledWith(expect.objectContaining({input:expect.objectContaining({provider:'canonical',storageKey:'history/file'})}));
  expect(f.journal.enqueue).toHaveBeenCalledWith(expect.objectContaining({input:expect.objectContaining({direction:'reconcile',source:{versionId:'v1',checksum:'digest'},target:{copyId:'copy',locationId:'location'}})}));
  const completion=f.Model.updateOne.mock.calls.find(([,update])=>update.$set?.['versions.$[version].syncProjectionPending']===false);
  expect(completion[2].arrayFilters).toEqual([{'version.versionId':'v1'}]);
  expect(f.document.currentVersionId).toBe('v1');
});
test('a failure before enqueue keeps the outbox pending and retries the same version identity',async()=>{
  const f=fixture();f.journal.enqueue.mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue({idempotent:true});
  const projector=makeDocumentHistoryProjection(f);
  expect(await projector.runOnce()).toEqual({processed:0,pending:true});
  expect(f.Model.updateOne.mock.calls.some(([,update])=>update.$set?.['versions.$[version].syncProjectionPending']===false)).toBe(false);
  expect(await projector.runOnce()).toEqual({processed:1});
  expect(f.Versions.create).toHaveBeenCalledTimes(1);
  expect(f.journal.enqueue.mock.calls[0][0].input.idempotencyKey).toBe(f.journal.enqueue.mock.calls[1][0].input.idempotencyKey);
});
test('never replaces an independent registry branch with a historical snapshot',async()=>{
  const f=fixture();f.document.currentVersionId='independent';
  await expect(makeDocumentHistoryProjection(f).projectVersion(f.history,f.version)).rejects.toMatchObject({code:'HISTORY_REGISTRY_DIVERGED'});
  expect(f.Documents.updateOne).not.toHaveBeenCalled();expect(f.document.currentVersionId).toBe('independent');
});
test('a saved conflicting version is registered without becoming the canonical current version',async()=>{
  const f=fixture();f.version.status='conflict';f.version.conflictWithVersionId='other';
  await makeDocumentHistoryProjection(f).projectVersion(f.history,f.version);
  expect(f.Versions.create).toHaveBeenCalledWith(expect.objectContaining({status:'conflict',conflictWithVersionId:'other'}));
  expect(f.Documents.updateOne).not.toHaveBeenCalled();
});
test('scope revocation stops registration and leaves the business version intact',async()=>{
  const f=fixture();f.Dossiers.exists.mockResolvedValue(false);
  expect(await makeDocumentHistoryProjection(f).runOnce()).toMatchObject({pending:true,processed:0});
  expect(f.Versions.create).not.toHaveBeenCalled();expect(f.journal.enqueue).not.toHaveBeenCalled();
  expect(f.history.versions[0].storageKey).toBe('history/file');
});
test('an expired lease prevents any projection work',async()=>{
  const f=fixture();f.Model.updateOne.mockResolvedValue({matchedCount:0});
  expect(await makeDocumentHistoryProjection(f).runOnce()).toMatchObject({pending:true});
  expect(f.Versions.create).not.toHaveBeenCalled();
});
