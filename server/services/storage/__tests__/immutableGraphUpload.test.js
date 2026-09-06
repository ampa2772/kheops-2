const {immutableGraphUpload}=require('../immutableGraphUpload');
const buffer=Buffer.from('fictitious document');
const args={token:'test-token',driveRoot:'https://graph.microsoft.com/v1.0/drives/pinned',path:'Document.docx',buffer,idempotencyKey:'operation-1'};
test('creates with fail-on-collision and no OAuth token on the preauthenticated upload URL',async()=>{
 const http={get:jest.fn().mockResolvedValue({status:404}),post:jest.fn().mockResolvedValue({data:{uploadUrl:'https://upload.test/session'}}),put:jest.fn().mockResolvedValue({status:201,data:{id:'file-1',size:buffer.length}})};
 await expect(immutableGraphUpload({...args,http})).resolves.toMatchObject({itemId:'file-1',idempotent:false});
 expect(http.post).toHaveBeenCalledWith(expect.stringMatching(/\/drives\/pinned\/root:\/Document__sync_.*\.docx:\/createUploadSession$/),{item:expect.objectContaining({'@microsoft.graph.conflictBehavior':'fail'})},expect.anything());
 expect(http.put.mock.calls[0][2].headers.Authorization).toBeUndefined();
 expect(http.put.mock.calls[0][2].headers['Content-Range']).toBe(`bytes 0-${buffer.length-1}/${buffer.length}`);
});
test('finds a completed upload after a lost response and verifies its actual bytes',async()=>{
 const http={get:jest.fn().mockResolvedValueOnce({status:200,data:{id:'file-1',size:buffer.length}}).mockResolvedValueOnce({data:buffer}),post:jest.fn(),put:jest.fn()};
 await expect(immutableGraphUpload({...args,http})).resolves.toMatchObject({itemId:'file-1',idempotent:true});
 expect(http.post).not.toHaveBeenCalled();expect(http.put).not.toHaveBeenCalled();
});
test('preserves a colliding file with different content',async()=>{
 const http={get:jest.fn().mockResolvedValueOnce({status:200,data:{id:'file-1'}}).mockResolvedValueOnce({data:Buffer.from('external edit')}),post:jest.fn(),put:jest.fn()};
 await expect(immutableGraphUpload({...args,http})).rejects.toMatchObject({conflictKind:'checksum_mismatch'});
 expect(http.put).not.toHaveBeenCalled();
});
test('handles a race at commit by confirming the winning file, without renaming',async()=>{
 const http={get:jest.fn().mockResolvedValueOnce({status:404}).mockResolvedValueOnce({status:200,data:{id:'winner'}}).mockResolvedValueOnce({data:buffer}),post:jest.fn().mockResolvedValue({data:{uploadUrl:'https://upload.test/session'}}),put:jest.fn().mockRejectedValue({response:{status:409}})};
 await expect(immutableGraphUpload({...args,http})).resolves.toMatchObject({itemId:'winner',idempotent:true});
 expect(http.put).toHaveBeenCalledTimes(1);
});
