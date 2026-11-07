'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { XMasterDraft } from '../lib/x-master-store';
import { parseManualTweetDrafts } from '../lib/x-draft-workspace';
import { X_MEMES } from '../lib/x-meme-library';
import type { DraftSeed } from './creator-workspace';
import s from './creator-workspace.module.css';

const pendingKey=(owner:string)=>`virality:pending-draft:${owner}`;
const content=(draft:XMasterDraft)=>JSON.stringify([draft.body,draft.source_text,draft.source_url,draft.author_name,draft.author_handle,draft.media_id,draft.format,draft.state]);
function validAccountDraft(value:unknown):value is XMasterDraft {
  if(!value||typeof value!=='object')return false;
  const draft=value as XMasterDraft;
  if(typeof draft.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(draft.id)||typeof draft.body!=='string'||draft.body.length>32000||typeof draft.source_text!=='string'||draft.source_text.length>32000||!Number.isSafeInteger(draft.revision)||Number(draft.revision)<1)return false;
  if(!['post','reply','quote','thread','article','meme'].includes(draft.format)||!['draft','ready','scheduled','published','archived'].includes(draft.state))return false;
  for(const key of ['created_at','updated_at'] as const)if(typeof draft[key]!=='string'||!Number.isFinite(Date.parse(draft[key])))return false;
  for(const key of ['author_name','author_handle','media_id'] as const)if(draft[key]!==null&&(typeof draft[key]!=='string'||draft[key]!.length>200))return false;
  if(draft.source_url!==null){if(typeof draft.source_url!=='string'||draft.source_url.length>2048)return false;try{const url=new URL(draft.source_url);if(url.protocol!=='https:'||url.username||url.password)return false;}catch{return false;}}
  return true;
}
function blank():XMasterDraft {const time=new Date().toISOString();return {id:`draft-${crypto.randomUUID()}`,body:'',source_text:'',source_url:null,author_name:null,author_handle:null,media_id:null,format:'post',state:'draft',scheduled_at:null,created_at:time,updated_at:time,revision:0};}
function pendingDraft(raw:string|null):XMasterDraft|null {
  if(!raw||raw.length>80000)return null;
  try{const value=JSON.parse(raw);if(!value||typeof value.id!=='string'||!/^draft-[a-zA-Z0-9-]{1,100}$/.test(value.id)||typeof value.body!=='string'||value.body.length>32000||!Number.isSafeInteger(value.revision)||value.revision<0||typeof value.source_text!=='string'||value.source_text.length>32000)return null;
    if(value.source_url){const url=new URL(value.source_url);if(url.protocol!=='https:'||url.username||url.password)return null;}
    if(!['post','reply','quote','thread','article','meme'].includes(value.format)||!['draft','ready'].includes(value.state))return null;
    for(const key of ['created_at','updated_at'])if(typeof value[key]!=='string'||!Number.isFinite(Date.parse(value[key])))return null;
    for(const key of ['author_name','author_handle','media_id'])if(value[key]!==null&&(typeof value[key]!=='string'||value[key].length>200))return null;
    return {...blank(),...value,scheduled_at:null};
  }catch{return null;}
}

export function AccountDrafts({owner,seed,browse}:{owner:string;seed:DraftSeed|null;browse:()=>void}) {
  const [draft,setDraft]=useState<XMasterDraft|null>(null);const [drafts,setDrafts]=useState<XMasterDraft[]>([]);
  const [savedContent,setSavedContent]=useState('');const [state,setState]=useState<'loading'|'idle'|'saving'|'error'|'conflict'>('loading');const [message,setMessage]=useState('');
  const [previousSeed,setPreviousSeed]=useState<DraftSeed|null>(null);const [imports,setImports]=useState<ReturnType<typeof parseManualTweetDrafts>|null>(null);
  const active=useRef(true);const saving=useRef(false);const restored=useRef(false);const current=useRef(draft);
  useEffect(()=>{current.current=draft;},[draft]);
  const dirty=Boolean(draft&&content(draft)!==savedContent);
  const hasContent=Boolean(draft&&(draft.body.trim()||draft.source_text.trim()));
  const editable=Boolean(draft&&['draft','ready'].includes(draft.state));
  const [loadAttempt,setLoadAttempt]=useState(0);
  const load=useCallback(async()=>{
    const response=await fetch('/api/x-master/drafts?identity=app',{cache:'no-store',credentials:'same-origin',headers:{'x-workspace-owner':owner},signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error(response.status===401?'Sign in again before syncing.':'Could not load account drafts. Your pending edits are preserved.');
    const result=await response.json() as {drafts?:XMasterDraft[]};if(!Array.isArray(result.drafts)||!result.drafts.every(validAccountDraft))throw new Error('Invalid draft response. Retry loading.');
    if(active.current)setDrafts(result.drafts);return result.drafts as XMasterDraft[];
  },[owner]);
  useEffect(()=>{
    active.current=true;
    void load().then(()=>{
      if(!active.current||restored.current)return;restored.current=true;
      let pending:XMasterDraft|null=null;try{pending=pendingDraft(localStorage.getItem(pendingKey(owner)));}catch{/* browser storage is optional */}
      const next=pending??blank();setDraft(next);setSavedContent(pending?'':content(next));setState('idle');
      if(pending)setMessage('Recovered pending edits for this account.');
    }).catch(error=>{if(active.current){setState('error');setMessage(error.message);}});
    const refresh=()=>{if(!document.hidden)void load().catch(error=>{if(active.current)setMessage(error.message);});};
    const interval=setInterval(refresh,15000);window.addEventListener('focus',refresh);
    return()=>{active.current=false;clearInterval(interval);window.removeEventListener('focus',refresh);};
  },[load,owner,loadAttempt]);
  if(seed!==previousSeed&&draft){setPreviousSeed(seed);setDraft({...draft,...(seed?.source?{source_text:seed.source.body||seed.source.title,source_url:seed.source.url,author_name:seed.source.author,author_handle:seed.source.source==='x'?seed.source.handle.replace(/^@/,''):null}:{}),...(seed?.meme?{media_id:seed.meme.id}:{})});}
  useEffect(()=>{
    if(!draft||!dirty)return;
    try{localStorage.setItem(pendingKey(owner),JSON.stringify(draft));}catch{queueMicrotask(()=>{if(active.current)setMessage('Browser recovery is unavailable. Keep this tab open until account saving completes.');});}
  },[draft,dirty,owner]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  const save=useCallback(async(snapshot:XMasterDraft)=>{
    if(saving.current||(!snapshot.body.trim()&&!snapshot.source_text.trim())||!['draft','ready'].includes(snapshot.state))return;saving.current=true;setState('saving');
    try{
      const response=await fetch('/api/x-master/drafts?identity=app',{method:'POST',headers:{'content-type':'application/json','x-workspace-owner':owner},body:JSON.stringify(snapshot),credentials:'same-origin',signal:AbortSignal.timeout(20000)});
      const result=await response.json() as {draft:XMasterDraft;error?:string};
      if(!active.current)return;
      if(!response.ok){setState(response.status===409?'conflict':'error');setMessage(result.error||'Could not sync. Your edits are still here.');return;}
      const saved=result.draft;
      if(!validAccountDraft(saved)||saved.id!==snapshot.id)throw new Error('Invalid save acknowledgement.');
      setDrafts(previous=>[saved,...previous.filter(item=>item.id!==saved.id)]);
      if(current.current?.id===snapshot.id){setDraft(previous=>previous?{...previous,revision:saved.revision,created_at:saved.created_at,updated_at:saved.updated_at}:previous);setSavedContent(content(snapshot));}
      setState('idle');setMessage('');
      if(current.current?.id===snapshot.id&&content(current.current)===content(snapshot))try{localStorage.removeItem(pendingKey(owner));}catch{/* no recovery entry */}
    }catch{if(active.current){setState('error');setMessage('Offline or server unavailable. Pending edits stay on this device until you retry.');}}finally{saving.current=false;}
  },[owner]);
  useEffect(()=>{if(!draft||!dirty||!hasContent||!editable||state!=='idle')return;const timer=setTimeout(()=>void save(draft),900);return()=>clearTimeout(timer);},[draft,dirty,hasContent,editable,state,save]);
  function open(next:XMasterDraft,confirmed=false){if(saving.current)return;if(dirty&&!confirmed&&!confirm('Discard pending edits and open another draft?'))return;try{localStorage.removeItem(pendingKey(owner));}catch{/* no entry */}setDraft(next);setSavedContent(content(next));setState('idle');setMessage('');}
  function change(body:string){setDraft(previous=>previous?{...previous,body}:previous);}
  async function importLocal(){
    if(!imports||dirty||saving.current)return;saving.current=true;setState('saving');let count=0;
    try{
      for(const item of imports){const response=await fetch('/api/x-master/drafts?identity=app',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-workspace-owner':owner},body:JSON.stringify({id:item.id,body:item.text,source_text:'',media_id:item.meme_id,created_at:item.created_at,updated_at:item.updated_at,revision:0})});if(!response.ok)throw new Error('Some drafts could not be imported. Existing account drafts and local originals were not overwritten.');count++;}
      await load();setImports(null);setState('idle');setMessage(`Imported ${count} drafts. Local originals kept as a backup.`);
    }catch(error){setState('error');setMessage(error instanceof Error?error.message:'Import failed.');}finally{saving.current=false;}
  }
  const meme=X_MEMES.find(item=>item.id===draft?.media_id);
  return <div className={s.draftLayout}><section className={s.workspacePanel}><div className={s.panelHeading}><div><h2>Your next post</h2><p>Synced to your account</p></div><button disabled={state==='loading'||state==='saving'} onClick={()=>open(blank())}>New draft</button></div>{draft?<>{draft.source_text&&<div className={s.sourceContext}><span>INSPIRATION · {draft.author_name}</span><p>{draft.source_text}</p>{draft.source_url&&<a href={draft.source_url} target="_blank" rel="noopener noreferrer">View original ↗</a>}</div>}<label className={s.editorLabel} htmlFor="account-draft">Your post</label><textarea id="account-draft" className={s.editor} value={draft.body} maxLength={32000} readOnly={!editable} onChange={e=>change(e.target.value)} placeholder="The interesting part is…"/><div className={s.editorMeta}><button onClick={browse}>Browse clips</button><span>{draft.body.length} characters · {draft.format}</span></div>{meme&&<div className={s.attachment}><img src={meme.poster} alt=""/><div><strong>{meme.title}</strong><a href={meme.src} download>Download clip ↓</a></div><button aria-label="Remove attached clip" onClick={()=>setDraft({...draft,media_id:null})}>×</button></div>}<div className={s.composeActions}><button className={s.primary} disabled={!dirty||!hasContent||!editable||state==='saving'||state==='conflict'} onClick={()=>void save(draft)}>{state==='saving'?'Saving…':'Save draft'}</button>{draft.body.trim()&&draft.body.length<=280&&<a href={`https://x.com/intent/post?text=${encodeURIComponent(draft.body)}`} target="_blank" rel="noopener noreferrer">Review on X ↗</a>}</div><p role="status" data-state={state} className={s.feedback}>{dirty&&!hasContent?'Add text before saving. Your previous account version has not changed.':message|| (state==='saving'?'Saving to your account…':dirty?'Unsaved changes':'All changes saved')}</p>{state==='conflict'&&<div className={s.composeActions}><button onClick={()=>{const copy={...draft,id:`draft-${crypto.randomUUID()}`,revision:0};setDraft(copy);setSavedContent('');setState('idle');setMessage('');}}>Save my edits as a copy</button><button onClick={()=>void load().then(items=>{const latest=items.find(item=>item.id===draft.id);if(latest&&confirm('Replace your pending text with the latest account version?'))open(latest,true);}).catch(error=>setMessage(error.message))}>Load account version</button></div>}{!editable&&<p className={s.footnote}>This {draft.state} item is read-only. Manage it in the existing publishing workspace.</p>}{state==='error'&&<button disabled={!hasContent||!editable} onClick={()=>void save(draft)}>Retry sync</button>}<p className={s.footnote}>Nothing publishes automatically. Review on X opens text only; attach any clip yourself. Approved scheduling is not connected yet.</p></>:<><p role="status">{message||'Loading account drafts…'}</p>{state==='error'&&<button onClick={()=>setLoadAttempt(attempt=>attempt+1)}>Retry loading drafts</button>}</>}</section><section className={s.workspacePanel}><div className={s.panelHeading}><h2>Account drafts <span>{drafts.length}</span></h2></div><div className={s.draftList}>{drafts.map(item=><button key={item.id} aria-label={`Edit draft: ${item.body}`} onClick={()=>open(item)} disabled={state==='saving'}><p>{item.body||item.source_text}</p><small>Revision {item.revision} · {item.state}</small></button>)}</div>{!drafts.length&&<p className={s.empty}>Your account drafts will appear here.</p>}<button disabled={state==='saving'||dirty} onClick={()=>{try{setImports(parseManualTweetDrafts(JSON.parse(localStorage.getItem('x-virality-radar/tweet-drafts-v1')??'[]')));}catch{setMessage('Local drafts could not be read.');}}}>Preview local draft import</button>{imports&&<div className={s.sourceContext}><p>{imports.length} local drafts. Import adds copies to this account; local originals remain.</p>{imports.slice(0,5).map(item=><p key={item.id}>{item.text}</p>)}<button disabled={!imports.length||state==='saving'||dirty} onClick={()=>void importLocal()}>Import {imports.length} drafts</button></div>}</section></div>;
}
