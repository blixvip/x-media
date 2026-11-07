import type { D1DatabaseLike } from './x-automation-store.ts';

export type AttachmentInput = { kind:'image'|'video'; source_url?:string; preview_url?:string; position:number };
export type ReferenceInput = { post_id:string; source_url:string; source_text:string; author_name:string; author_handle:string; author_avatar_url?:string; published_at?:string; complete:boolean; attachments:AttachmentInput[] };
export type ReferenceAttachment = AttachmentInput & { id:string; state:'queued'|'processing'|'complete'|'failed'; error:string|null; bytes:number|null; mime:string|null; attempts:number };
export type SavedReference = Omit<ReferenceInput,'attachments'> & { id:string; notes:string; tags:string[]; favourite:boolean; collection_id:string|null; revision:number; created_at:string; updated_at:string; deleted_at:string|null; attachments:ReferenceAttachment[] };
type Row = { owner_id:string; id:string; post_id:string; source_json:string; notes:string; tags_json:string; favourite:number; collection_id:string|null; revision:number; created_at:string; updated_at:string; deleted_at:string|null };
export type ArchiveClaim = Omit<ReferenceAttachment,'source_url'|'preview_url'> & { owner_id:string; reference_id:string; post_url:string; lease:string; lease_until:number; object_key:string|null; source_url:string|null; preview_url:string|null; video_index:number };
export class ReferenceError extends Error { status:number; constructor(message:string,status=400){super(message);this.status=status;} }

export const REFERENCE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS x_references (owner_id TEXT NOT NULL,id TEXT NOT NULL,post_id TEXT NOT NULL,source_json TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',tags_json TEXT NOT NULL DEFAULT '[]',favourite INTEGER NOT NULL DEFAULT 0,collection_id TEXT,revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,deleted_at TEXT,PRIMARY KEY(owner_id,id),UNIQUE(owner_id,post_id))`,
  `CREATE TABLE IF NOT EXISTS x_reference_collections (owner_id TEXT NOT NULL,id TEXT NOT NULL,name TEXT NOT NULL,PRIMARY KEY(owner_id,id),UNIQUE(owner_id,name))`,
  `CREATE TABLE IF NOT EXISTS x_reference_assets (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,reference_id TEXT NOT NULL,kind TEXT NOT NULL,position INTEGER NOT NULL,source_url TEXT,preview_url TEXT,state TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,lease TEXT,lease_until INTEGER NOT NULL DEFAULT 0,object_key TEXT,mime TEXT,bytes INTEGER,error TEXT,UNIQUE(owner_id,reference_id,position))`,
  `CREATE INDEX IF NOT EXISTS x_references_owner_updated ON x_references(owner_id,deleted_at,updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS x_reference_assets_queue ON x_reference_assets(state,next_attempt,lease_until)`,
  `CREATE TABLE IF NOT EXISTS x_reference_uploads (object_key TEXT PRIMARY KEY,asset_id TEXT NOT NULL,created_at INTEGER NOT NULL)`,
];
export async function initializeReferences(db:D1DatabaseLike){for(const sql of REFERENCE_SCHEMA)await db.prepare(sql).run();}
const text=(value:unknown,max:number)=>typeof value==='string'?value.trim().slice(0,max):'';
export function trustedMediaUrl(value:unknown,avatar=false):string|undefined {
  if(value===undefined||value===null||value==='')return undefined;
  if(typeof value!=='string'||value.length>2048)throw new ReferenceError('Invalid media URL.');
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!['pbs.twimg.com','video.twimg.com'].includes(url.hostname)||(!avatar&&url.hostname==='pbs.twimg.com'&&!url.pathname.startsWith('/media/')))throw new ReferenceError('Unsupported media host.');
  url.hash='';return url.toString();
}
export function normalizeReference(value:unknown):ReferenceInput {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ReferenceError('Reference required.');
  const input=value as Record<string,unknown>;
  let url:URL;try{url=new URL(String(input.source_url));}catch{throw new ReferenceError('A valid X post URL is required.');}
  const match=url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:\/(?:photo|video)\/\d+)?\/?$/);
  if(!match||url.protocol!=='https:'||url.username||url.password||url.port||!['x.com','www.x.com','twitter.com','www.twitter.com','mobile.twitter.com'].includes(url.hostname))throw new ReferenceError('A public X post URL is required.');
  const raw=Array.isArray(input.attachments)?input.attachments:[];
  if(raw.length>8)throw new ReferenceError('Too many attachments.');
  const positions=new Set<number>();
  const attachments=raw.map((a:Record<string,unknown>,i:number):AttachmentInput=>{
    if(!a||!['image','video'].includes(String(a.kind)))throw new ReferenceError('Unsupported attachment.');
    const position=a.position??i;
    if(typeof position!=='number'||!Number.isInteger(position)||position<0||position>7||positions.has(position))throw new ReferenceError('Invalid attachment order.');
    positions.add(position);
    const source_url=trustedMediaUrl(a.source_url);const preview_url=trustedMediaUrl(a.preview_url,true);
    if(a.kind==='image'&&(!source_url||new URL(source_url).hostname!=='pbs.twimg.com'))throw new ReferenceError('An image URL is required.');
    if(a.kind==='video'&&source_url&&new URL(source_url).hostname!=='video.twimg.com')throw new ReferenceError('Invalid video URL.');
    return {kind:a.kind as 'image'|'video',position,source_url,preview_url};
  }).sort((a,b)=>a.position-b.position);
  const source_text=text(input.source_text,32000);
  const published=text(input.published_at,40);
  return {post_id:match[2],source_url:`https://x.com/${match[1]}/status/${match[2]}`,source_text,author_name:text(input.author_name,150)||match[1],author_handle:match[1],author_avatar_url:trustedMediaUrl(input.author_avatar_url,true),published_at:published&&Number.isFinite(Date.parse(published))?new Date(published).toISOString():undefined,complete:input.complete===true&&typeof input.source_text==='string'&&input.source_text.length<=32000,attachments};
}
async function materialize(db:D1DatabaseLike,row:Row):Promise<SavedReference>{
  const assets=await db.prepare('SELECT id,kind,position,source_url,preview_url,state,error,bytes,mime,attempts FROM x_reference_assets WHERE owner_id=? AND reference_id=? ORDER BY position').bind(row.owner_id,row.id).all<ReferenceAttachment>();
  return {...JSON.parse(row.source_json),id:row.id,notes:row.notes,tags:JSON.parse(row.tags_json),favourite:Boolean(row.favourite),collection_id:row.collection_id,revision:row.revision,created_at:row.created_at,updated_at:row.updated_at,deleted_at:row.deleted_at,attachments:assets.results??[]};
}
export async function getReference(db:D1DatabaseLike,owner:string,id:string){const row=await db.prepare('SELECT * FROM x_references WHERE owner_id=? AND id=?').bind(owner,id).first<Row>();return row?materialize(db,row):null;}
export async function saveReference(db:D1DatabaseLike,owner:string,value:unknown){
  const input=normalizeReference(value);const now=new Date().toISOString();const id=`ref-${crypto.randomUUID()}`;
  await db.prepare('INSERT INTO x_references(owner_id,id,post_id,source_json,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(owner_id,post_id) DO NOTHING').bind(owner,id,input.post_id,JSON.stringify(input),now,now).run();
  const row=(await db.prepare('SELECT * FROM x_references WHERE owner_id=? AND post_id=?').bind(owner,input.post_id).first<Row>())!;
  if(row.deleted_at)throw new ReferenceError('This reference is in Trash. Restore it first.',409);
  const previous=JSON.parse(row.source_json) as ReferenceInput;
  if((!previous.complete&&input.complete)||(!previous.source_text&&input.source_text))await db.prepare('UPDATE x_references SET source_json=?,revision=revision+1,updated_at=? WHERE owner_id=? AND id=? AND revision=?').bind(JSON.stringify(input),now,owner,row.id,row.revision).run();
  if(input.attachments.length)await db.batch(input.attachments.map(a=>db.prepare('INSERT INTO x_reference_assets(id,owner_id,reference_id,kind,position,source_url,preview_url) VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner_id,reference_id,position) DO NOTHING').bind(`asset-${crypto.randomUUID()}`,owner,row.id,a.kind,a.position,a.source_url??null,a.preview_url??null)));
  return (await getReference(db,owner,row.id))!;
}
export type ReferenceQuery={q?:string;kind?:string;favourite?:boolean;collection?:string;trash?:boolean;offset?:number;limit?:number};
export async function listReferences(db:D1DatabaseLike,owner:string,query:ReferenceQuery){
  const clauses=['r.owner_id=?',query.trash?'r.deleted_at IS NOT NULL':'r.deleted_at IS NULL'];const args:unknown[]=[owner];
  if(query.q){clauses.push("(r.source_json LIKE ? ESCAPE '\\' OR r.notes LIKE ? ESCAPE '\\' OR r.tags_json LIKE ? ESCAPE '\\')");const q=`%${query.q.slice(0,200).replace(/[\\%_]/g,'\\$&')}%`;args.push(q,q,q);}
  if(query.favourite)clauses.push('r.favourite=1');
  if(query.collection){clauses.push('r.collection_id=?');args.push(query.collection);}
  if(query.kind==='image'||query.kind==='video'){clauses.push('EXISTS(SELECT 1 FROM x_reference_assets a WHERE a.owner_id=r.owner_id AND a.reference_id=r.id AND a.kind=?)');args.push(query.kind);}
  const limit=Math.max(1,Math.min(60,Math.floor(query.limit||30)));const offset=Math.max(0,Math.min(100000,Math.floor(query.offset||0)));
  const where=clauses.join(' AND ');const total=await db.prepare(`SELECT COUNT(*) AS count FROM x_references r WHERE ${where}`).bind(...args).first<{count:number}>();
  const rows=await db.prepare(`SELECT r.* FROM x_references r WHERE ${where} ORDER BY r.created_at DESC,r.id LIMIT ? OFFSET ?`).bind(...args,limit,offset).all<Row>();
  return {items:await Promise.all((rows.results??[]).map(row=>materialize(db,row))),total:total?.count??0,offset,limit};
}
export async function editReference(db:D1DatabaseLike,owner:string,id:string,input:Record<string,unknown>){
  const row=await db.prepare('SELECT * FROM x_references WHERE owner_id=? AND id=?').bind(owner,id).first<Row>();
  if(!row)throw new ReferenceError('Reference not found.',404);
  if(!Number.isSafeInteger(input.revision)||row.revision!==input.revision)throw new ReferenceError('This reference changed on another device. Your edit has not been overwritten.',409);
  const notes=input.notes===undefined?row.notes:text(input.notes,20000);
  const tags=input.tags===undefined?JSON.parse(row.tags_json):Array.isArray(input.tags)?[...new Set(input.tags.map(t=>text(t,40)).filter(Boolean))].slice(0,20):[];
  const favourite=input.favourite===undefined?row.favourite:input.favourite===true?1:0;
  const collection=input.collection_id===undefined?row.collection_id:input.collection_id===null?null:text(input.collection_id,100);
  if(collection&&!await db.prepare('SELECT id FROM x_reference_collections WHERE owner_id=? AND id=?').bind(owner,collection).first())throw new ReferenceError('Collection not found.',404);
  const now=new Date().toISOString();const deleted=input.trash===true?now:input.restore===true?null:row.deleted_at;
  if(input.restore&&row.deleted_at&&Date.parse(row.deleted_at)<Date.now()-7*86400000)throw new ReferenceError('The restore period has expired.',410);
  const result=await db.prepare('UPDATE x_references SET notes=?,tags_json=?,favourite=?,collection_id=?,deleted_at=?,revision=revision+1,updated_at=? WHERE owner_id=? AND id=? AND revision=?').bind(notes,JSON.stringify(tags),favourite,collection,deleted,now,owner,id,input.revision).run();
  if(!result.meta?.changes)throw new ReferenceError('This reference changed on another device.',409);
  if(input.retry===true&&!deleted)await db.prepare("UPDATE x_reference_assets SET state='queued',attempts=0,next_attempt=0,error=NULL WHERE owner_id=? AND reference_id=? AND state='failed'").bind(owner,id).run();
  return (await getReference(db,owner,id))!;
}
export async function createCollection(db:D1DatabaseLike,owner:string,value:unknown){const name=text(value,80);if(!name)throw new ReferenceError('Collection name required.');const id=`collection-${crypto.randomUUID()}`;await db.prepare('INSERT INTO x_reference_collections(owner_id,id,name) VALUES(?,?,?) ON CONFLICT(owner_id,name) DO NOTHING').bind(owner,id,name).run();return (await db.prepare('SELECT id,name FROM x_reference_collections WHERE owner_id=? AND name=?').bind(owner,name).first<{id:string;name:string}>())!;}
export async function listCollections(db:D1DatabaseLike,owner:string){return (await db.prepare('SELECT id,name FROM x_reference_collections WHERE owner_id=? ORDER BY name').bind(owner).all<{id:string;name:string}>()).results??[];}
export async function deleteCollection(db:D1DatabaseLike,owner:string,id:string){await db.batch([db.prepare('UPDATE x_references SET collection_id=NULL,revision=revision+1 WHERE owner_id=? AND collection_id=?').bind(owner,id),db.prepare('DELETE FROM x_reference_collections WHERE owner_id=? AND id=?').bind(owner,id)]);}

export async function claimAttachment(db:D1DatabaseLike):Promise<ArchiveClaim|null>{
  const now=Date.now();const lease=crypto.randomUUID();
  await db.prepare("UPDATE x_reference_assets SET state='failed',error='Worker stopped before completion.' WHERE state='processing' AND lease_until<? AND attempts>=3").bind(now).run();
  const row=await db.prepare(`UPDATE x_reference_assets SET state='processing',lease=?,lease_until=?,attempts=attempts+1,error=NULL WHERE id=(SELECT a.id FROM x_reference_assets a JOIN x_references r ON r.owner_id=a.owner_id AND r.id=a.reference_id WHERE r.deleted_at IS NULL AND a.attempts<3 AND ((a.state='queued' AND a.next_attempt<=?) OR (a.state='processing' AND a.lease_until<?)) ORDER BY a.next_attempt,a.id LIMIT 1) AND (SELECT COUNT(*) FROM x_reference_assets WHERE state='processing' AND lease_until>?)<2 RETURNING *`).bind(lease,now+10*60000,now,now,now).first<ArchiveClaim>();
  if(!row)return null;
  const ref=await getReference(db,row.owner_id,row.reference_id);
  return {...row,post_url:ref!.source_url,video_index:ref!.attachments.filter(a=>a.kind==='video'&&a.position<row.position).length};
}
export async function finishAttachment(db:D1DatabaseLike,id:string,lease:string,result:{object_key?:string;mime?:string;bytes?:number;error?:string;retryable?:boolean}){
  const row=await db.prepare("SELECT * FROM x_reference_assets WHERE id=? AND lease=? AND state='processing' AND lease_until>?").bind(id,lease,Date.now()).first<ArchiveClaim>();
  if(!row)throw new ReferenceError('Archive lease expired or invalid.',409);
  const success=Boolean(result.object_key&&result.mime&&result.bytes&&result.bytes>0);
  const state=success?'complete':result.retryable!==false&&row.attempts<3?'queued':'failed';
  const update=await db.prepare("UPDATE x_reference_assets SET state=?,object_key=?,mime=?,bytes=?,error=?,lease=NULL,lease_until=0,next_attempt=? WHERE id=? AND lease=? AND state='processing'").bind(state,result.object_key??null,result.mime??null,result.bytes??null,success?null:text(result.error,300)||'Media could not be archived.',Date.now()+row.attempts*30000,id,lease).run();
  if(!update.meta?.changes)throw new ReferenceError('Archive lease changed.',409);
}
export async function purgeReference(db:D1DatabaseLike,owner:string,id:string,remove:(key:string)=>Promise<unknown>){
  const row=await db.prepare('SELECT deleted_at FROM x_references WHERE owner_id=? AND id=?').bind(owner,id).first<{deleted_at:string|null}>();
  if(!row?.deleted_at)throw new ReferenceError('Move this reference to Trash before permanent deletion.');
  // Invalidate upload leases before deleting objects; upload completion also checks the parent.
  await db.prepare("UPDATE x_reference_assets SET state='failed',lease=NULL,lease_until=0 WHERE owner_id=? AND reference_id=?").bind(owner,id).run();
  const assets=await db.prepare('SELECT id,object_key FROM x_reference_assets WHERE owner_id=? AND reference_id=?').bind(owner,id).all<{id:string;object_key:string|null}>();
  for(const asset of assets.results??[]){const uploads=await db.prepare('SELECT object_key FROM x_reference_uploads WHERE asset_id=?').bind(asset.id).all<{object_key:string}>();const keys=new Set([asset.object_key,...(uploads.results??[]).map(u=>u.object_key)].filter(Boolean) as string[]);for(const key of keys)await remove(key);await db.prepare('DELETE FROM x_reference_uploads WHERE asset_id=?').bind(asset.id).run();}
  await db.batch([db.prepare('DELETE FROM x_reference_assets WHERE owner_id=? AND reference_id=?').bind(owner,id),db.prepare('DELETE FROM x_references WHERE owner_id=? AND id=?').bind(owner,id)]);
}
