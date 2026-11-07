import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReferenceQueue} from '../extension/x-radar-companion/reference-queue.js';
const payload=id=>({post_id:id,source_url:`https://x.com/ada/status/${id}`,source_text:'Example',complete:true,attachments:[]});
const pairing={appUrl:'https://example.chatgpt.site',device:{id:'device-a'}};
function fixture(){let value=[];return {get:async()=>structuredClone(value),set:async next=>{value=structuredClone(next);}};}
test('durable queue deduplicates, preserves concurrent saves and survives recreation',async()=>{
 const storage=fixture();const queue=new ReferenceQueue(storage);await Promise.all([queue.add(pairing,payload('12345')),queue.add(pairing,payload('67890')),queue.add(pairing,payload('12345'))]);
 const restored=new ReferenceQueue(storage);assert.equal((await restored.list(pairing)).length,2);
 const result=await restored.flush(pairing,async()=>({item:{id:'ref-1'},media_configured:true}));assert.equal(result.saved,2);assert.equal((await restored.list(pairing)).length,0);
});
test('network failure stays queued; permanent error is visible and never falsely saved',async()=>{
 const queue=new ReferenceQueue(fixture());await queue.add(pairing,payload('12345'));
 await queue.flush(pairing,async()=>{throw new TypeError('Network offline');});assert.equal((await queue.list(pairing))[0].state,'pending');
 await queue.flush(pairing,async()=>{throw Object.assign(new Error('Invalid post'),{status:400});});assert.equal((await queue.list(pairing))[0].state,'failed');
 let calls=0;await queue.flush(pairing,async()=>{calls++;});assert.equal(calls,0);
});
test('re-pairing never sends another device queue; oversized payload rejected',async()=>{
 const queue=new ReferenceQueue(fixture());await queue.add(pairing,payload('12345'));let calls=0;
 await queue.flush({...pairing,device:{id:'device-b'}},async()=>{calls++;});assert.equal(calls,0);
 await assert.rejects(()=>queue.add(pairing,{...payload('67890'),source_text:'x'.repeat(90000)}),/large/);
});

for(const rejected of [false,true])test(`a video added during an in-flight save survives its ${rejected?'rejection':'success'}`,async()=>{
 const storage=fixture();const queue=new ReferenceQueue(storage);await queue.add(pairing,payload('12345'));
 let release;let started;const ready=new Promise(resolve=>{started=resolve;});
 const flushing=queue.flush(pairing,async()=>{started();await new Promise(resolve=>{release=resolve;});if(rejected)throw Object.assign(new Error('Old payload rejected'),{status:400});return {item:{id:'ref-1'}};});
 await ready;
 await queue.add(pairing,{...payload('12345'),attachments:[{kind:'video',position:0}]});
 release();const first=await flushing;assert.equal(first.results.length,0);
 assert.equal((await queue.list(pairing))[0].payload.attachments[0].kind,'video');
 let received;await queue.flush(pairing,async value=>{received=value;return {item:{id:'ref-1'}};});
 assert.equal(received.attachments[0].kind,'video');assert.equal((await queue.list(pairing)).length,0);
});
