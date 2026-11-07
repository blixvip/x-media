import {xMasterRuntime,isD1Database,readBoundedObject} from '@/x-master/lib/x-master-api';
import {initializeReferences,claimAttachment,finishAttachment,purgeReference,type ArchiveClaim} from '@/x-master/lib/x-references';
import {mediaSignature} from '@/x-master/lib/x-reference-media';
async function workerContext(request:Request){
 const runtime=await xMasterRuntime();const expected=runtime.X_REFERENCE_WORKER_TOKEN;const actual=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
 if(!expected||expected.length<32||actual.length!==expected.length)return null;
 let difference=0;for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^actual.charCodeAt(i);
 if(difference||!isD1Database(runtime.DB)||!runtime.MEDIA?.delete)return null;
 await initializeReferences(runtime.DB);return {...runtime,DB:runtime.DB};
}
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
export async function POST(request:Request){const c=await workerContext(request);if(!c)return response({error:'Worker unavailable or unauthorized.'},401);
 let body:Record<string,unknown>;try{body=await readBoundedObject(request,2000);}catch{return response({error:'Invalid worker request.'},400);}
 if(body.action==='cleanup'){const rows=await c.DB.prepare('SELECT owner_id,id FROM x_references WHERE deleted_at IS NOT NULL AND deleted_at<? LIMIT 10').bind(new Date(Date.now()-7*86400000).toISOString()).all<{owner_id:string;id:string}>();for(const row of rows.results??[])await purgeReference(c.DB,row.owner_id,row.id,key=>c.MEDIA!.delete!(key));const orphaned=await c.DB.prepare('SELECT u.object_key FROM x_reference_uploads u LEFT JOIN x_reference_assets a ON a.id=u.asset_id WHERE u.created_at<? AND (a.object_key IS NULL OR a.object_key!=u.object_key) AND (a.id IS NULL OR a.lease_until<?) LIMIT 20').bind(Date.now()-30*60000,Date.now()).all<{object_key:string}>();for(const row of orphaned.results??[]){await c.MEDIA!.delete!(row.object_key);await c.DB.prepare('DELETE FROM x_reference_uploads WHERE object_key=?').bind(row.object_key).run();}return response({ok:true});}
 if(body.action!=='claim')return response({error:'Invalid worker action.'},400);
 return response({job:await claimAttachment(c.DB)});
}
export async function PATCH(request:Request){const c=await workerContext(request);if(!c)return response({error:'Unauthorized.'},401);try{const body=await readBoundedObject(request,2000);await finishAttachment(c.DB,String(body.id),String(body.lease),{error:typeof body.error==='string'?body.error:'Media download failed.',retryable:body.retryable!==false});return response({ok:true});}catch{return response({error:'Archive lease expired.'},409);}}
export async function PUT(request:Request){
 const c=await workerContext(request);if(!c)return response({error:'Unauthorized.'},401);
 const id=request.headers.get('x-asset-id')??'';const lease=request.headers.get('x-archive-lease')??'';
 const asset=await c.DB.prepare("SELECT a.* FROM x_reference_assets a JOIN x_references r ON r.owner_id=a.owner_id AND r.id=a.reference_id WHERE a.id=? AND a.lease=? AND a.state='processing' AND a.lease_until>? AND r.deleted_at IS NULL").bind(id,lease,Date.now()).first<ArchiveClaim>();
 if(!asset)return response({error:'Archive lease expired.'},409);
 const maximum=asset.kind==='image'?20*1024*1024:200*1024*1024;const declared=Number(request.headers.get('content-length'));
 if(!Number.isSafeInteger(declared)||declared<=0||declared>maximum||!request.body)return response({error:'File size invalid.'},413);
 const reader=request.body.getReader();const chunks:Uint8Array[]=[];let length=0;const key=`private/references/${asset.id}/${lease}`;
 await c.DB.prepare('INSERT INTO x_reference_uploads(object_key,asset_id,created_at) VALUES(?,?,?) ON CONFLICT(object_key) DO NOTHING').bind(key,asset.id,Date.now()).run();
 try{
  while(length<16){const result=await reader.read();if(result.done)break;chunks.push(result.value);length+=result.value.byteLength;if(length>maximum)throw new Error('size');}
  const prefix=new Uint8Array(length);let offset=0;for(const chunk of chunks){prefix.set(chunk,offset);offset+=chunk.length;}
  const mime=mediaSignature(prefix,asset.kind);if(!mime)throw new Error('signature');
  const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(prefix);},async pull(controller){try{const part=await reader.read();if(part.done){if(length!==declared)throw new Error('size');controller.close();return;}length+=part.value.byteLength;if(length>maximum||length>declared)throw new Error('size');controller.enqueue(part.value);}catch(error){await reader.cancel();controller.error(error);}},cancel(){return reader.cancel();}});
  // R2 needs a known-length stream. Preserve backpressure without buffering videos.
  const Fixed=(globalThis as typeof globalThis & {FixedLengthStream?:new(length:number)=>{readable:ReadableStream;writable:WritableStream}}).FixedLengthStream;
  if(Fixed){const fixed=new Fixed(declared);await Promise.all([stream.pipeTo(fixed.writable),c.MEDIA!.put(key,fixed.readable,{httpMetadata:{contentType:mime}})]);}
  else await c.MEDIA!.put(key,stream,{httpMetadata:{contentType:mime}});
  const parent=await c.DB.prepare('SELECT deleted_at FROM x_references WHERE owner_id=? AND id=?').bind(asset.owner_id,asset.reference_id).first<{deleted_at:string|null}>();
  if(!parent||parent.deleted_at)throw new Error('deleted');
  await finishAttachment(c.DB,id,lease,{object_key:key,mime,bytes:length});return response({ok:true,bytes:length});
 }catch{await reader.cancel().catch(()=>{});await c.MEDIA!.delete!(key);await c.DB.prepare('DELETE FROM x_reference_uploads WHERE object_key=?').bind(key).run();return response({error:'File rejected or archive lease expired.'},422);}
}
