const {makeCloudUploadReservation}=require('../cloudUploadReservation');
const args={provider:'google_drive',accountRef:'account',containerId:'folder',idempotencyKey:'operation',checksum:'digest',allocate:jest.fn().mockResolvedValue('new-id')};
test('persists an allocated identity before upload and reuses it after restart',async()=>{
 let saved;const Model={findOne:jest.fn(async()=>saved),create:jest.fn(async row=>(saved=row))};
 const first=await makeCloudUploadReservation(Model)(args);
 const second=await makeCloudUploadReservation(Model)(args);
 expect(first).toBe('new-id');expect(second).toBe(first);expect(Model.create).toHaveBeenCalledTimes(1);
});
test('uses the winner of a concurrent reservation',async()=>{
 const winner={remoteId:'winner',containerId:'folder',checksum:'digest'};
 const Model={findOne:jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(winner),create:jest.fn().mockRejectedValue({code:11000})};
 await expect(makeCloudUploadReservation(Model)(args)).resolves.toBe('winner');
});
test.each([{containerId:'other'},{checksum:'other'}])('rejects changed scope/content on retry %j',async change=>{
 const Model={findOne:jest.fn().mockResolvedValue({remoteId:'old-id',containerId:'folder',checksum:'digest',...change}),create:jest.fn()};
 await expect(makeCloudUploadReservation(Model)(args)).rejects.toMatchObject({code:'SYNC_RESERVATION_CONFLICT'});
 expect(Model.create).not.toHaveBeenCalled();
});
