const crypto=require('crypto');
const Reservation=require('../../models/Storage/CloudUploadReservation');
function makeCloudUploadReservation(Model=Reservation) {
  return async function reserve({provider,accountRef,containerId,idempotencyKey,checksum,allocate}) {
    const query={provider,accountRef,key:crypto.createHash('sha256').update(String(idempotencyKey)).digest('hex')};
    let row=await Model.findOne(query);
    if (!row) {
      const remoteId=await allocate();
      if (!remoteId) throw Object.assign(new Error('Identifiant distant indisponible.'),{retryable:true,code:'SYNC_ALLOCATION_FAILED'});
      // Mongo's built-in _id uniqueness is available even before an optional
      // secondary index has finished building on a fresh deployment.
      const _id=crypto.createHash('sha256').update(JSON.stringify([provider,String(accountRef),query.key])).digest('hex');
      try { row=await Model.create({_id,...query,containerId,checksum,remoteId}); }
      catch(error) {if(error?.code!==11000) throw error;row=await Model.findOne(query);}
    }
    if (!row || row.containerId!==containerId || row.checksum!==checksum) throw Object.assign(new Error('Une reprise désigne une autre destination ou un autre contenu.'),{statusCode:409,code:'SYNC_RESERVATION_CONFLICT',conflictKind:'checksum_mismatch'});
    return row.remoteId;
  };
}
module.exports={makeCloudUploadReservation,reserve:makeCloudUploadReservation()};
