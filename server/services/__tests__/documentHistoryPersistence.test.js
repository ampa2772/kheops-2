jest.mock('../../models/Storage/DocumentHistory',()=>({findOne:jest.fn()}));
jest.mock('../fileStorage',()=>({getFileStorage:jest.fn()}));
const Model=require('../../models/Storage/DocumentHistory');
const {getFileStorage}=require('../fileStorage');
const {saveVersion}=require('../documentHistoryService');
const id='64b64b64b64b64b64b64b64b';
const input={tenantId:id,dossierId:id,documentId:id,userId:id,buffer:Buffer.from('new content'),filename:'recette.txt',mime:'text/plain',baseVersionId:'base',requireBaseVersion:true,operationKey:'operation'};
function history(){return {currentVersionId:'base',versions:[{versionId:'base',checksum:'other',status:'draft'}],save:jest.fn()};}
let storage;
beforeEach(()=>{jest.clearAllMocks();storage={save:jest.fn().mockResolvedValue(),delete:jest.fn().mockResolvedValue()};getFileStorage.mockReturnValue(storage);});
test('an acknowledged database version survives a lost save response',async()=>{
  const row=history();row.save.mockRejectedValue(new Error('connection lost'));Model.findOne.mockResolvedValue(row);
  const result=await saveVersion(input);
  expect(result.idempotent).toBe(true);expect(result.version.checksum).toBeTruthy();expect(storage.delete).not.toHaveBeenCalled();
  expect(result.version.syncProjectionPending).toBe(true);
});
test('uncertain database state never deletes the uploaded backup',async()=>{
  const row=history();row.save.mockRejectedValue(new Error('connection lost'));
  Model.findOne.mockResolvedValueOnce(row).mockRejectedValue(new Error('read unavailable'));
  await expect(saveVersion(input)).rejects.toThrow('connection lost');expect(storage.delete).not.toHaveBeenCalled();
});
test('optimistic race is retried against the new base and preserves the competing version',async()=>{
  const first=history();first.save.mockRejectedValue(Object.assign(new Error('race'),{name:'VersionError'}));
  const winner=history();winner.currentVersionId='winner';winner.versions.push({versionId:'winner',checksum:'winner-bytes',status:'draft'});winner.save.mockResolvedValue();
  Model.findOne.mockResolvedValueOnce(first).mockResolvedValueOnce(winner).mockResolvedValue(winner);
  const result=await saveVersion(input);
  expect(result.conflict).toBe(true);expect(result.history.currentVersionId).toBe('winner');
  expect(result.version).toMatchObject({status:'conflict',conflictWithVersionId:'winner'});
  expect(storage.delete).toHaveBeenCalledTimes(1);
});
test('retrying an existing conflicting operation does not claim success or write a second version',async()=>{
  const row=history();row.versions.push({versionId:'conflicting',operationKey:'operation',status:'conflict',conflictWithVersionId:'winner'});
  Model.findOne.mockResolvedValue(row);
  expect(await saveVersion(input)).toMatchObject({idempotent:true,conflict:true,version:{versionId:'conflicting'}});
  expect(storage.save).not.toHaveBeenCalled();expect(row.save).not.toHaveBeenCalled();
});
