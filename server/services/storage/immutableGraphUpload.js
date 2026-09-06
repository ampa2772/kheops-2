const crypto = require('crypto');
const axios = require('axios');

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const encodePath = path => path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
const unavailable = message => Object.assign(new Error(message), { code:'SYNC_NOT_CONFIRMED', retryable:true });

// Only used for journaled transfers. A stable name and create-only upload
// session make an interrupted retry discoverable without overwriting a file.
async function immutableGraphUpload({ token, driveRoot, path, buffer, idempotencyKey, http = axios }) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw Object.assign(new Error('Le transfert nécessite un fichier non vide.'), {statusCode:422, code:'SYNC_EMPTY_FILE'});
  const segments = String(path).split('/').filter(Boolean);
  const original = segments.pop() || 'document'; const dot = original.lastIndexOf('.');
  const suffix = `__sync_${hash(String(idempotencyKey)).slice(0, 32)}`;
  const name = dot > 0 ? original.slice(0,dot) + suffix + original.slice(dot) : original + suffix;
  const headers = {Authorization:`Bearer ${token}`};
  const request = {headers, timeout:30000};
  let parent = '';
  for (const segment of segments) {
    const next = parent ? `${parent}/${segment}` : segment;
    const lookup = await http.get(`${driveRoot}/root:/${encodePath(next)}`, {...request, validateStatus:s => (s>=200&&s<300)||s===404});
    if (lookup.status === 404) {
      const created = await http.post(parent ? `${driveRoot}/root:/${encodePath(parent)}:/children` : `${driveRoot}/root/children`,
        {name:segment,folder:{},'@microsoft.graph.conflictBehavior':'fail'},
        {...request,validateStatus:s => (s>=200&&s<300)||s===409});
      if (created.status === 409) await http.get(`${driveRoot}/root:/${encodePath(next)}`, request);
    }
    parent = next;
  }
  const target = `${driveRoot}/root:/${encodePath([...segments,name].join('/'))}`;
  const found = async () => {
    const r=await http.get(target,{...request,validateStatus:s => (s>=200&&s<300)||s===404});
    if (r.status===404) return null;
    if (!r.data?.id) throw unavailable('La référence du fichier existant est absente.');
    const content=await http.get(`${driveRoot}/items/${encodeURIComponent(r.data.id)}/content`,
      {...request,responseType:'arraybuffer',timeout:60000,maxContentLength:Infinity});
    if (hash(Buffer.from(content.data))!==hash(buffer)) throw Object.assign(new Error('La copie de reprise contient une modification distante ; elle est conservée.'),
      {statusCode:409,code:'SYNC_CONTENT_CONFLICT',conflictKind:'checksum_mismatch'});
    return {itemId:r.data.id,size:Number(r.data.size)||buffer.length,name:r.data.name,webUrl:r.data.webUrl,idempotent:true};
  };
  const existing=await found(); if(existing) return existing;
  try {
    const session=await http.post(`${target}:/createUploadSession`,{item:{name,'@microsoft.graph.conflictBehavior':'fail'}},request);
    const uploadUrl=session.data?.uploadUrl;
    if (!uploadUrl || !String(uploadUrl).startsWith('https://')) throw unavailable('Session de transfert indisponible.');
    const chunkSize=10*1024*1024; let last;
    for(let offset=0;offset<buffer.length;offset+=chunkSize) {
      const chunk=buffer.subarray(offset,Math.min(buffer.length,offset+chunkSize));
      // Graph's upload URL is preauthenticated; never forward the OAuth token.
      last=await http.put(uploadUrl,chunk,{headers:{'Content-Length':String(chunk.length),'Content-Range':`bytes ${offset}-${offset+chunk.length-1}/${buffer.length}`},
        timeout:60000,maxBodyLength:Infinity,maxContentLength:Infinity});
    }
    if (![200,201].includes(last?.status) || !last?.data?.id) throw unavailable('Le fournisseur n’a pas confirmé la fin du transfert.');
    return {itemId:last.data.id,size:last.data.size,name:last.data.name,webUrl:last.data.webUrl,idempotent:false};
  } catch(error) {
    if ([409,412].includes(Number(error?.response?.status))) {
      const winner=await found(); if(winner) return winner;
    }
    throw error;
  }
}

module.exports={immutableGraphUpload};
