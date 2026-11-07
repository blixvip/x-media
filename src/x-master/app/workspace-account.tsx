'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceCapabilities } from '../lib/workspace-capabilities';
import s from './creator-workspace.module.css';

export type WorkspaceAccount = { capabilities:WorkspaceCapabilities; user:{id:string;email:string}|null };
export function useWorkspaceAccount() {
  const [account,setAccount]=useState<WorkspaceAccount|null>(null);
  const [error,setError]=useState('');
  const generation=useRef(0);
  const inFlight=useRef<AbortController|null>(null);
  const cancelRefresh=useCallback(()=>{generation.current++;inFlight.current?.abort();},[]);
  const refresh=useCallback(async()=>{
    const requestId=++generation.current;
    inFlight.current?.abort();
    const controller=new AbortController();inFlight.current=controller;
    try {
      const response=await fetch('/api/workspace',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
      if(!response.ok)throw new Error();
      const next=await response.json() as WorkspaceAccount;
      if(!next.capabilities||typeof next.capabilities.account!=='boolean'||(next.user!==null&&(!next.user||typeof next.user.id!=='string'||typeof next.user.email!=='string')))throw new Error();
      if(requestId!==generation.current)return;
      setAccount(next);setError('');
    } catch {if(requestId===generation.current&&!controller.signal.aborted)setError('Account status unavailable. Retry before editing synced work.');}
  },[]);
  useEffect(()=>{
    queueMicrotask(()=>void refresh());
    const visible=()=>{if(!document.hidden)void refresh();};
    window.addEventListener('workspace:account-changed',visible);
    window.addEventListener('focus',visible);
    return()=>{cancelRefresh();window.removeEventListener('workspace:account-changed',visible);window.removeEventListener('focus',visible);};
  },[refresh,cancelRefresh]);
  return {account,error,refresh};
}

export function WorkspaceSettings({account,error,refresh}:{account:WorkspaceAccount|null;error:string;refresh:()=>Promise<void>}) {
  const [email,setEmail]=useState('');const [code,setCode]=useState('');const [sent,setSent]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  async function authenticate(signout=false) {
    setBusy(true);setMessage('');
    try {
      const response=await fetch('/api/x-master/auth',{method:signout?'DELETE':'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:signout?undefined:JSON.stringify({action:sent?'verify':'send',email,code}),signal:AbortSignal.timeout(20000)});
      const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error||'Sign-in failed.');
      if(signout||sent){setSent(false);setCode('');await refresh();window.dispatchEvent(new Event('workspace:account-changed'));}
      else{setSent(true);setMessage('If your email is invited, a code is on its way.');}
    }catch(error){setMessage(error instanceof Error?error.message:'Account request failed.');}finally{setBusy(false);}
  }
  const capabilities=account?.capabilities;
  const rows:[string,boolean|undefined,string][]=[
    ['Private account',capabilities?.account,'Invited-email sign-in for desktop, phone and paired Chrome.'],
    ['Account drafts',capabilities?.drafts,'Shared storage with revision protection.'],
    ['Media archive',capabilities?.media_archive,'Private file storage and archival worker configuration.'],
    ['Official X collection',capabilities?.official_x,'Requires approved X API access and a spending limit.'],
    ['Background collection',capabilities?.collection_enabled,'Configuration only; verify the hosted collector heartbeat before relying on it.'],
    ['X publishing configuration',capabilities?.publishing,'Requires linked credentials and explicit approval of each post.'],
    ['Phone push',capabilities?.phone_push,'Not activated. Alert inbox remains separate from notification delivery.'],
  ];
  return <div className={s.draftLayout}><section className={s.workspacePanel}><div className={s.panelHeading}><div><h2>Your private account</h2><p>Use the same invited email on your monitor and phone.</p></div></div>{account?.user?<><p>{account.user.email}</p><p className={s.footnote}>Signed in. Your account-backed data is private to this account.</p><button disabled={busy} onClick={()=>void authenticate(true)}>Sign out</button></>:<form onSubmit={e=>{e.preventDefault();void authenticate();}}><label className={s.search}>Email<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} disabled={sent} /></label>{sent&&<label className={s.search}>Sign-in code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value)}/></label>}<div className={s.composeActions}><button disabled={busy||!capabilities?.account||!capabilities.storage}>{busy?'Working…':sent?'Verify code':'Send sign-in code'}</button>{sent&&<button type="button" onClick={()=>{setSent(false);setCode('');}}>Change email</button>}</div>{!capabilities?.account&&<p className={s.footnote}>Invited-email authentication has not been configured. Local drafts remain on this device until you explicitly import them.</p>}</form>}{(message||error)&&<p role="status" className={s.feedback}>{message||error}</p>}<button onClick={()=>void refresh()} disabled={busy}>Refresh connection status</button><p className={s.footnote}>Phone setup: open the production HTTPS address, sign in, then use Chrome’s “Add to home screen”. Desktop Chrome capture does not run on Android.</p></section><section className={s.workspacePanel}><div className={s.panelHeading}><h2>Connections & release readiness</h2></div><div className={s.connectionList}>{rows.map(([title,configured,description])=><div key={title}><div><strong>{title}</strong><span data-ready={configured}>{configured?'Configured':'Setup required'}</span></div><p>{description}</p></div>)}</div><p className={s.footnote}>Configured does not mean deployment-tested. Paid services and a real publishing test still require your approval.</p></section></div>;
}
