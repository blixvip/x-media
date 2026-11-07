import {referenceContext} from '@/x-master/lib/x-reference-api';
import {xMasterJson} from '@/x-master/lib/x-master-api';
import {parseByteRange} from '@/x-master/lib/x-reference-media';
export async function GET(request:Request){
 const auth=await referenceContext(request);if(!auth.ok)return auth.response;const c=auth.context;const params=new URL(request.url).searchParams;
 const asset=await c.database.prepare("SELECT a.object_key,a.bytes,a.mime,a.kind FROM x_reference_assets a JOIN x_references r ON r.id=a.reference_id AND r.owner_id=a.owner_id WHERE a.owner_id=? AND a.id=? AND a.state='complete' AND r.deleted_at IS NULL").bind(c.ownerId,params.get('id')).first<{object_key:string;bytes:number;mime:string;kind:string}>();
 if(!asset||!c.runtime.MEDIA?.get)return xMasterJson(request,{error:'Archived file unavailable.'},404,c.cookie);
 const header=request.headers.get('range');const range=header?parseByteRange(header,asset.bytes):undefined;
 if(header&&!range)return new Response(null,{status:416,headers:{'content-range':`bytes */${asset.bytes}`,'cache-control':'private, no-store'}});
 const file=await c.runtime.MEDIA.get(asset.object_key,range?{range}:undefined);if(!file)return xMasterJson(request,{error:'Archived file unavailable.'},404,c.cookie);
 const headers:Record<string,string>={'content-type':asset.mime,'content-length':String(range?.length??asset.bytes),'accept-ranges':'bytes','cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"};
 if(range)headers['content-range']=`bytes ${range.offset}-${range.offset+range.length-1}/${asset.bytes}`;
 if(params.get('download')==='true')headers['content-disposition']=`attachment; filename="reference.${asset.mime==='image/jpeg'?'jpg':asset.mime.split('/')[1]}"`;
 if(c.cookie)headers['set-cookie']=c.cookie;
 return new Response(file.body,{status:range?206:200,headers});
}
