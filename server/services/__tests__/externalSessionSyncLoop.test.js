const {makeExternalSessionSyncLoop}=require('../externalSessionSyncLoop');
function fixture(rows=[{_id:'one',userId:'owner'}]) {
  const query={sort:jest.fn().mockReturnThis(),limit:jest.fn().mockReturnThis(),lean:jest.fn().mockResolvedValue(rows)};
  const Model={find:jest.fn(()=>query),updateOne:jest.fn().mockResolvedValue({matchedCount:1})};
  const synchronizer={synchronize:jest.fn().mockResolvedValue({unchanged:true})};
  const logger={info:jest.fn(),warn:jest.fn()};
  return {query,Model,synchronizer,logger,clock:()=>new Date('2026-09-06T01:00:00Z')};
}
test('selects only due active sessions and limits cloud work',async()=>{
  const f=fixture();await makeExternalSessionSyncLoop(f).runOnce();
  expect(f.Model.find).toHaveBeenCalledWith(expect.objectContaining({autoSyncEnabled:true,state:{$in:['open','synced']},$and:expect.any(Array)}));
  expect(f.query.limit).toHaveBeenCalledWith(2);
  expect(f.synchronizer.synchronize).toHaveBeenCalledWith({session:{_id:'one',userId:'owner'},userId:'owner',automatic:true});
  expect(f.logger.info).not.toHaveBeenCalled();
});
test('does not duplicate an in-flight session and drains it on stop',async()=>{
  const f=fixture();let finish;f.synchronizer.synchronize.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const loop=makeExternalSessionSyncLoop(f);const first=loop.runOnce();
  await new Promise(resolve=>setImmediate(resolve));
  await loop.runOnce();expect(f.synchronizer.synchronize).toHaveBeenCalledTimes(1);
  const stopping=loop.stop();finish({unchanged:true});await first;
  expect(await stopping).toEqual({stopped:true,pending:0});
});
test('disables automatic import after access revocation without logging credentials',async()=>{
  const f=fixture();f.synchronizer.synchronize.mockRejectedValue({statusCode:403,config:{headers:{Authorization:'secret'}}});
  await makeExternalSessionSyncLoop(f).runOnce();
  expect(f.Model.updateOne).toHaveBeenCalledWith(expect.objectContaining({_id:'one',$or:expect.any(Array)}),{$set:expect.objectContaining({autoSyncEnabled:false})});
  expect(JSON.stringify(f.logger.warn.mock.calls)).not.toContain('secret');
});
test('does not shorten the retry already recorded by the executor',async()=>{
  const f=fixture();f.synchronizer.synchronize.mockRejectedValue({externalStateRecorded:true,response:{status:429}});
  await makeExternalSessionSyncLoop(f).runOnce();expect(f.Model.updateOne).not.toHaveBeenCalled();
});
