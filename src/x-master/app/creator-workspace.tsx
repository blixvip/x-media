"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createManualTweetDraft, parseManualTweetDrafts, type ManualTweetDraft } from '../lib/x-draft-workspace';
import { filterMemeLibrary, X_MEMES, type XMeme } from '../lib/x-meme-library';
import { X_WATCHED_CREATORS } from '../lib/x-watchlist';
import type { MainFeedItem } from '../lib/main-feed';
import s from './creator-workspace.module.css';

export type WorkspaceView = 'feed' | 'saved' | 'creators' | 'drafts' | 'media' | 'settings' | 'library';
const nav: [WorkspaceView, string, string][] = [
  ['feed', 'Feed', 'M3 4h18v16H3zM3 9h18M9 9v11'],
  ['creators', 'Creators', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'],
  ['library', 'Library', 'M3 4h6l2 3h10v14H3z'],
  ['drafts', 'Posts', 'M12 20h9M16 3l5 5-12 12-6 1 1-6zM14 5l5 5'],
];

export function WorkspaceNav({ view, choose }: { view: WorkspaceView; choose: (view: WorkspaceView) => void }) {
  const active = view === 'media' || view === 'saved' ? 'library' : view;
  return <aside className={s.sidebar}>
    <Link href="/" className={s.wordmark}><img src="/favicon.svg" width="34" height="34" alt=""/><span>X Master<small>Your creator workspace</small></span></Link>
    <p className={s.sectionLabel}>WORKSPACE</p>
    <nav aria-label="Main navigation">{nav.map(([id, label, path]) => <button key={id} aria-current={active === id ? 'page' : undefined} onClick={() => choose(id)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={path}/></svg>{label}</button>)}</nav>
    <div className={s.sidebarBottom}><div className={s.sidebarNote}><i/> Real signals. Your next idea.<small>Counts update when new observations arrive.</small></div></div>
  </aside>;
}

export function LibraryNav({view,choose}:{view:WorkspaceView;choose:(view:WorkspaceView)=>void}) {
  return <nav className={s.libraryNav} aria-label="Library sections">{([['library','Captures'],['saved','Saved posts'],['media','Clips']] as const).map(([id,label])=><button key={id} aria-current={view===id?'page':undefined} onClick={()=>choose(id)}>{label}</button>)}</nav>;
}

function Avatar({ name, src }: { name: string; src?: string }) {
  const [failed, setFailed] = useState(false);
  return <span className={s.avatar}>{src && !failed ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/> : name.slice(0, 1)}</span>;
}

export function CreatorDirectory({ items, select }: { items: MainFeedItem[]; select: (handle: string) => void }) {
  const [query, setQuery] = useState('');
  const roster = X_WATCHED_CREATORS.map(creator => ({ ...creator, posts: items.filter(item => item.source === 'x' && item.handle.replace(/^@/, '').toLowerCase() === creator.handle.toLowerCase()) }))
    .filter(creator => `${creator.name} ${creator.handle} ${creator.organization ?? ''} ${creator.category}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.posts.length - a.posts.length);
  return <section className={s.workspacePanel} aria-label="Creator directory"><div className={s.panelHeading}><div><h2>Your watchlist</h2><p>{X_WATCHED_CREATORS.length} tracked accounts. Active creators first—not a prediction of virality.</p></div><label className={s.search}>Search creators<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name, handle, company…"/></label></div>
    <div className={s.creatorGrid}>{roster.map(creator => <div className={s.creatorCard} key={creator.handle}><div className={s.creatorIdentity}><Avatar name={creator.name} src={creator.posts.find(post => post.avatar)?.avatar}/><div><strong>{creator.name}</strong><a href={`https://x.com/${creator.handle}`} target="_blank" rel="noopener noreferrer">@{creator.handle} ↗</a></div></div><p>{creator.organization ?? creator.category}</p><div className={s.cardFoot}><span>{creator.posts.length ? `${creator.posts.length} recent posts observed` : 'No recent posts observed'}</span><button aria-label={`Show posts from ${creator.name}`} onClick={() => select(creator.handle)}>View posts ↗</button></div></div>)}</div>
    {!roster.length && <p className={s.empty}>No creators match. Try a name or company.</p>}
    <p className={s.footnote}>This watchlist does not follow accounts on your X account. Coverage is sampled; missing posts do not mean an account is inactive.</p>
  </section>;
}

export function MediaLibrary({ choose }: { choose: (meme: XMeme) => void }) {
  const [query, setQuery] = useState('');
  const clips = filterMemeLibrary(X_MEMES.filter(meme => meme.id !== 'test-clip'), query);
  return <section className={s.workspacePanel} aria-label="Clip library"><div className={s.panelHeading}><div><h2>A reaction, ready when you need it.</h2><p>Your existing clips. Preview, download, or pair one with a draft.</p></div><label className={s.search}>Search media<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Reaction, coding, chaos…"/></label></div><div className={s.mediaGrid}>{clips.map(meme => <div className={s.mediaCard} key={meme.id}><video controls preload="none" poster={meme.poster} aria-label={`Preview ${meme.title}`}><source src={meme.src} type="video/mp4"/><track kind="captions" src="/memes/preview-captions.vtt" srcLang="en" label="English"/></video><div><h3>{meme.title}<small>{meme.duration_seconds}s</small></h3><p>{meme.tags.slice(0, 3).join(' · ')}</p><div className={s.cardFoot}><a href={meme.src} download>Download ↓</a><button onClick={() => choose(meme)}>Use in draft</button></div></div></div>)}</div>{!clips.length && <p className={s.empty}>No clips match. Try “reaction” or “coding”.</p>}<p className={s.footnote}>Need saved posts, images, or extension captures? <Link href="/x-master?view=saved">Open your reference library ↗</Link>. Check permission before reusing someone else’s media.</p></section>;
}

const DRAFT_KEY = 'x-virality-radar/tweet-drafts-v1';
function readDrafts() { return parseManualTweetDrafts(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '[]')); }
export type DraftSeed = { token: number; source?: MainFeedItem; meme?: XMeme };

export function DraftWorkbench({ seed, browse }: { seed: DraftSeed | null; browse: () => void }) {
  const [drafts, setDrafts] = useState<ManualTweetDraft[]>([]);
  const [editing, setEditing] = useState<ManualTweetDraft | null>(null);
  const [text, setText] = useState('');
  const [meme, setMeme] = useState<XMeme | undefined>(seed?.meme);
  const [source, setSource] = useState<MainFeedItem | undefined>(seed?.source);
  const [status, setStatus] = useState('');
  const [previousSeed, setPreviousSeed] = useState(seed);
  if (seed !== previousSeed) {
    setPreviousSeed(seed);
    if (seed?.source) setSource(seed.source);
    if (seed?.meme) setMeme(seed.meme);
  }
  useEffect(() => {
    const read = () => { try { setDrafts(readDrafts()); } catch { setStatus('Draft storage is unavailable. Keep a copy of your text.'); } };
    read();
    const change = (event: StorageEvent) => { if (!event.key || event.key === DRAFT_KEY) read(); };
    window.addEventListener('storage', change);
    return () => window.removeEventListener('storage', change);
  }, []);
  function save() {
    try {
      const latest = readDrafts();
      if (!editing && latest.length >= 50) { setStatus('50 drafts saved. Manage older drafts in the X workspace before adding more.'); return; }
      const draft = createManualTweetDraft(text, editing?.id ?? `draft-${crypto.randomUUID()}`, new Date(), meme?.id);
      if (editing) draft.created_at = editing.created_at;
      const next = [draft, ...latest.filter(item => item.id !== draft.id)];
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); setDrafts(next); setEditing(draft);
      setStatus('Draft saved on this device. Nothing has been published.');
    } catch { setStatus('Couldn’t save. Keep your text and try again; storage may be unavailable.'); }
  }
  function newDraft() { if (text.trim() && (!editing || text.trim() !== editing.text || meme?.id !== editing.meme_id) && !window.confirm('Discard unsaved changes and start a new draft?')) return; setEditing(null); setText(''); setMeme(undefined); setSource(undefined); setStatus(''); }
  function edit(draft: ManualTweetDraft) { if (text.trim() && (!editing || text.trim() !== editing.text || meme?.id !== editing.meme_id) && !window.confirm('Discard unsaved changes and open this draft?')) return; setEditing(draft); setText(draft.text); setMeme(X_MEMES.find(item => item.id === draft.meme_id)); setSource(undefined); setStatus(''); }
  return <div className={s.draftLayout}><section className={s.workspacePanel}><div className={s.panelHeading}><div><h2>{editing ? 'Keep shaping it.' : 'What’s your take?'}</h2><p>Start with your own angle. Keep the source close.</p></div><button onClick={newDraft}>New draft</button></div>{source && <div className={s.sourceContext}><span>INSPIRATION · {source.author}</span><p>{source.body || source.title}</p><a href={source.url} target="_blank" rel="noopener noreferrer">View original ↗</a></div>}<label className={s.editorLabel} htmlFor="workspace-draft">Your post</label><textarea id="workspace-draft" className={s.editor} maxLength={280} value={text} onChange={e => setText(e.target.value)} placeholder="The interesting part is…"/><div className={s.editorMeta}><button onClick={browse}>Browse clips</button><span>{text.length} / 280</span></div>{meme && <div className={s.attachment}><img src={meme.poster} alt=""/><div><strong>{meme.title}</strong><a href={meme.src} download>Download clip ↓</a></div><button onClick={() => setMeme(undefined)} aria-label="Remove attached clip">×</button></div>}<div className={s.composeActions}><button className={s.primary} onClick={save} disabled={!text.trim()}>Save draft</button>{text.trim() && <a href={`https://x.com/intent/post?text=${encodeURIComponent(text.trim())}`} target="_blank" rel="noopener noreferrer">Review on X ↗</a>}</div><p role="status" className={s.feedback}>{status}</p><p className={s.footnote}>Device-local drafts, shared with your existing X workspace. “Review on X” opens a composer; you publish manually. Download and attach clips there.</p><Link className={s.vaultLink} href="/x-master?view=drafts">Connected draft vault & publishing tools ↗</Link></section><section className={s.workspacePanel}><div className={s.panelHeading}><h2>Saved drafts <span>{drafts.length}</span></h2></div>{drafts.length ? <div className={s.draftList}>{drafts.map(draft => <button key={draft.id} aria-label={`Edit draft: ${draft.text}`} aria-pressed={editing?.id === draft.id} onClick={() => edit(draft)}><p>{draft.text}</p><small>{draft.meme_id ? 'Clip attached · ' : ''}{new Date(draft.updated_at).toLocaleDateString()}</small></button>)}</div> : <div className={s.empty}>A place for your next good take.<p>Your saved drafts will appear here.</p></div>}</section></div>;
}
