"use client";
/* eslint-disable @next/next/no-img-element -- Originals are served from the device's verified local cache. */
import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, Check, Copy, RefreshCw, Wifi } from 'lucide-react';
import type { SyncItem } from '@/lib/wifi-sync/library';
import styles from './panel.module.css';

export type SyncStatus = { enabled?: boolean; paired?: boolean; running: boolean; pairingCodes?: string[]; message?: string; error?: string; lastSync: string | null; items: SyncItem[]; total: number; ready: number };
export type SyncTransport = (action: 'status' | 'enable' | 'disable' | 'sync' | 'pair' | 'forget', code?: string) => Promise<SyncStatus>;
const desktop: SyncTransport = async action => {
  const response = await fetch(`/api/wifi-sync${action === 'status' ? '' : `?action=${action}`}`, { method: action === 'status' ? 'GET' : 'POST', cache: 'no-store' });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Sync could not complete. Retry.'); return data;
};
export function WifiSyncPanel({ phone = false, transport = desktop }: { phone?: boolean; transport?: SyncTransport }) {
  const [status, setStatus] = useState<SyncStatus | null>(null), [code, setCode] = useState(''), [query, setQuery] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const reload = useCallback(async () => { try { setStatus(await transport('status')); } catch (e) { setError((e as Error).message); } }, [transport]);
  useEffect(() => { let active = true; const poll = async () => { try { const next = await transport('status'); if (active) setStatus(next); } catch (e) { if (active) setError((e as Error).message); } }; void poll(); const timer = setInterval(() => void poll(), 3000); return () => { active = false; clearInterval(timer); }; }, [transport]);
  async function run(action: Parameters<SyncTransport>[0]) { setBusy(true); setError(''); setNotice(''); try { setStatus(await transport(action, code)); if (action === 'pair') setCode(''); if (action === 'sync' && !phone) setNotice('Checking saved media. Originals will appear as they finish downloading.'); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  const connected = phone ? status?.paired : status?.enabled;
  const items = (status?.items || []).filter(item => `${item.title} ${item.postUrl}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  return <main className={styles.main}>
    <div className={styles.heading}><div><p className={styles.eyebrow}>PC + PHONE</p><h1>Synced saves</h1><p>Your memes, ready on both devices.</p></div><span className={styles.badge}><Wifi size={15} /> Wi-Fi only</span></div>
    <section className={styles.connection} aria-label="Wi-Fi connection">
      <div><h2>{connected ? phone ? 'Paired with your PC' : 'Ready for your phone' : 'Connect your devices'}</h2><p>{phone ? 'Open X Media on your PC and phone on the same Wi-Fi. Sync copies originals for offline viewing.' : 'Enable sync, then paste a pairing code into Synced saves in the phone app. Keep X Media open during transfers.'}</p></div>
      {!status && <p role="status">Opening your saved library…</p>}
      {status && !connected && (phone ? <form onSubmit={event => { event.preventDefault(); void run('pair'); }}><label htmlFor="wifi-pairing">PC pairing code</label><textarea id="wifi-pairing" value={code} onChange={event => setCode(event.target.value)} placeholder="Paste the full code from your PC" rows={3} spellCheck={false} autoComplete="off"/><button disabled={busy || !code.trim()} type="submit">{busy ? 'Pairing…' : 'Pair PC'}</button></form> : <button disabled={busy} onClick={() => void run('enable')}>{busy ? 'Starting…' : 'Enable Wi-Fi sync'}</button>)}
      {status && connected && <><div className={styles.actions}><button disabled={busy || (phone && status.running)} onClick={() => void run('sync')}><RefreshCw size={16} className={phone && status.running ? styles.spin : undefined}/>{busy || (phone && status.running) ? 'Syncing…' : 'Sync now'}</button><button className={styles.secondary} disabled={busy || (phone && status.running)} onClick={() => void run(phone ? 'forget' : 'disable')}>{phone ? 'Disconnect PC' : 'Disable & unpair'}</button></div>{!phone && status.pairingCodes?.map((value, i) => <details key={value} className={styles.pairing}><summary>Pairing code · {value.split('/')[0]}</summary><label htmlFor={`pair-${i}`}>Paste this entire code into the phone app</label><textarea id={`pair-${i}`} readOnly value={value} rows={4} spellCheck={false}/><button className={styles.secondary} onClick={async () => { try { await navigator.clipboard.writeText(value); setNotice('Pairing code copied. Paste it into the phone app.'); } catch { setNotice('Select the code above and copy it manually.'); } }}><Copy size={15}/>Copy code</button></details>)}</>}
      {(error || status?.error) && <p className={styles.error} role="alert">{error || status?.error} <button className={styles.inline} onClick={() => { setError(''); void reload(); }}>Retry</button></p>}
      {(notice || status?.message) && <p role="status">{notice || status?.message}</p>}
      {status?.lastSync && <p className={styles.muted}>Last sync: {new Date(status.lastSync).toLocaleString()}</p>}
      <p className={styles.note}>Includes saved X media, Reddit favourites, and media in folders. Copies stay here if you remove the source save. Drafts and notes aren’t synced.</p>
    </section>
    <div className={styles.libraryHeading}><h2>On this {phone ? 'phone' : 'PC'} <span>{status?.ready || 0}</span></h2><p>{status ? `${status.ready} of ${status.total} originals downloaded` : 'Loading…'}</p></div>
    <label className={styles.search}>Find saved media<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search your synced saves"/></label>
    {status && !items.length && <div className={styles.empty}><ArrowDownToLine size={28}/><h3>{query ? 'No matching saves' : 'Your saved memes will appear here'}</h3><p>{query ? 'Try another search.' : 'Save media in X Media, then sync with both apps open on the same Wi-Fi.'}</p></div>}
    <div className={styles.grid}>{items.map(item => <article key={item.id} className={styles.card}>{item.available ? item.kind === 'video' ? <video controls playsInline preload="none" src={`/api/wifi-sync?action=asset&id=${item.id}`}/> : <a href={`/api/wifi-sync?action=asset&id=${item.id}`} target="_blank" rel="noreferrer"><img src={`/api/wifi-sync?action=asset&id=${item.id}`} alt={item.title} loading="lazy"/></a> : <div className={styles.pending}><ArrowDownToLine size={25}/><span>Original waiting to download</span></div>}<div className={styles.cardBody}><h3>{item.title}</h3><p className={styles.state}>{item.available ? <><Check size={14}/> Available offline</> : item.error || 'Tap Sync now to retry.'}</p><a href={item.postUrl} target="_blank" rel="noreferrer">Original post ↗</a></div></article>)}</div>
    {status && status.total > status.items.length && <p className={styles.note}>Showing the first {status.items.length} saves. All {status.total} items are included in device transfers.</p>}
  </main>;
}
