// Storage is injected: browser storage in production, deterministic storage in tests.
const ownerKey=paired=>`${paired.appUrl}|${paired.device?.id}`;
export class ReferenceQueue {
 constructor(storage){this.storage=storage;this.pending=Promise.resolve();this.flushing=null;}
 transaction(task){const result=this.pending.then(task);this.pending=result.catch(()=>{});return result;}
 async list(paired){await this.pending;return (await this.storage.get()).filter(item=>item.owner===ownerKey(paired));}
 add(paired,payload){return this.transaction(async()=>{
  if(!paired?.device?.id)throw new Error('Pair this extension first.');
  if(!payload||JSON.stringify(payload).length>80000)throw new Error('Reference is too large.');
  let url;try{url=new URL(payload.source_url);}catch{throw new Error('Select a public X post.');}
  const match=url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})\/?$/);
  if(!match||url.protocol!=='https:'||!['x.com','twitter.com'].includes(url.hostname)||url.username||url.password)throw new Error('Select a public X post.');
  const owner=ownerKey(paired);const key=`${owner}|${match[2]}`;const items=await this.storage.get();const existing=items.find(item=>item.key===key);
  if(existing){
   const attachments=new Map((existing.payload.attachments||[]).map(item=>[item.position,item]));
   for(const attachment of payload.attachments||[])attachments.set(attachment.position,attachment);
   const merged={...existing.payload,...payload,attachments:[...attachments.values()].sort((a,b)=>a.position-b.position)};
   if(existing.payload.complete&&!payload.complete){merged.complete=true;merged.source_text=existing.payload.source_text;}
   if(merged.attachments.length>8||JSON.stringify(merged).length>80000)throw new Error('Reference is too large.');
   if(existing.state==='failed'||JSON.stringify(existing.payload)!==JSON.stringify(merged)){
    existing.state='pending';existing.error=null;existing.payload=merged;existing.revision=(existing.revision||0)+1;await this.storage.set(items);
   }
   return existing;
  }
  if(items.length>=100)throw new Error('Local queue is full. Review queued saves in the extension popup.');
  const item={key,owner,payload,state:'pending',created_at:new Date().toISOString(),error:null};items.push(item);await this.storage.set(items);return item;
 });}
 clear(paired){return this.transaction(async()=>this.storage.set((await this.storage.get()).filter(item=>item.owner!==ownerKey(paired))));}
 flush(paired,send){
  if(this.flushing)return this.flushing;
  this.flushing=(async()=>{let saved=0;const results=[];
   for(const item of (await this.list(paired)).filter(item=>item.state==='pending').slice(0,10)){
    try{const data=await send(item.payload);if(!data?.item?.id)throw new Error('Save was not confirmed by the server.');const finished=await this.transaction(async()=>{const items=await this.storage.get();const current=items.find(value=>value.key===item.key);if(!current||(current.revision||0)!==(item.revision||0))return false;await this.storage.set(items.filter(value=>value.key!==item.key));return true;});if(finished){saved++;results.push({key:item.key,data});}}
    catch(error){const permanent=error.status>=400&&error.status<500&&![408,429].includes(error.status);await this.transaction(async()=>{const items=await this.storage.get();const current=items.find(value=>value.key===item.key);if(current&&(current.revision||0)===(item.revision||0)){current.state=permanent?'failed':'pending';current.error=error.message;await this.storage.set(items);}});if(!permanent)break;}
   }return {saved,results};
  })().finally(()=>{this.flushing=null;});return this.flushing;
 }
}
