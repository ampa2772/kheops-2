const Session=require('../models/Storage/ExternalEditSession');
const service=require('./externalSessionSync');
const {retryable,retryAfterMs}=require('./sync/providerErrors');

function makeExternalSessionSyncLoop({Model=Session,synchronizer=service,clock=()=>new Date(),schedule=setTimeout,cancel=clearTimeout,logger=console}={}) {
  let running=false,timer=null;
  const inFlight=new Map();
  async function runOnce() {
    const capacity=2-inFlight.size;if(capacity<=0)return [];
    const now=clock();
    const candidates=await Model.find({autoSyncEnabled:true,state:{$in:['open','synced']},
      $and:[{$or:[{nextSyncAt:null},{nextSyncAt:{$lte:now}}]},{$or:[{'syncLease.expiresAt':null},{'syncLease.expiresAt':{$lte:now}}]}],
    }).sort({nextSyncAt:1,_id:1}).limit(capacity).lean();
    return Promise.all(candidates.map(session=>{
      const key=String(session._id);if(inFlight.has(key))return {skipped:true};
      const task=synchronizer.synchronize({session,userId:session.userId,automatic:true}).then(result=>{
        if(!result.unchanged) logger.info?.('[ExternalSync]',{event:result.conflict?'conflict':'version_saved',
          documentId:String(session.documentId),sessionId:String(session._id),versionId:result.session?.lastSyncedVersionId||null});
        return result;
      }).catch(async error=>{
        const transient=retryable(error);
        // Covers access refusals occurring before a session can be claimed.
        // Do not touch a lease currently owned by a different executor.
        if(!error.externalStateRecorded) await Model.updateOne({_id:session._id,$or:[{'syncLease.expiresAt':null},{'syncLease.expiresAt':{$lte:clock()}}]},{$set:{
          nextSyncAt:new Date(clock().getTime()+Math.max(60000,retryAfterMs(error,clock().getTime()))),
          ...(!transient?{autoSyncEnabled:false,lastSyncError:'La connexion ou les droits doivent être vérifiés avant de reprendre.'}:{}),
        }});
        logger.warn?.('[ExternalSync]',transient?'retry_scheduled':'attention_required');
        return {failed:true,retryable:transient};
      }).finally(()=>inFlight.delete(key));
      inFlight.set(key,task);return task;
    }));
  }
  function arm(){if(!running)return;timer=schedule(async()=>{timer=null;try{await runOnce();}catch(_){logger.warn?.('[ExternalSync] file_unavailable');}arm();},15000);timer?.unref?.();}
  function start(){if(running)return {started:false};running=true;arm();return {started:true};}
  async function stop({drainMs=7000}={}){
    running=false;if(timer)cancel(timer);timer=null;
    if(inFlight.size){
      let deadline;
      await Promise.race([Promise.allSettled([...inFlight.values()]),new Promise(resolve=>{deadline=schedule(resolve,Math.max(0,Math.min(60000,drainMs)));})]);
      if(deadline)cancel(deadline);
    }
    return {stopped:true,pending:inFlight.size};
  }
  return {runOnce,start,stop,status:()=>({running,inFlight:inFlight.size})};
}
module.exports={makeExternalSessionSyncLoop,...makeExternalSessionSyncLoop()};
