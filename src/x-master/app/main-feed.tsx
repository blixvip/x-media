"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { buildHubActivity, buildHubTopics, isHubStreamItem, isRecentHubItem, type HubActivity } from '../lib/trend-hub';
import { HubTopics, HubCreators, HubActivityPanel, GitHubPanel } from './trend-hub-panels';
import { X_WATCHED_CREATORS } from '../lib/x-watchlist';
import hub from './trend-hub.module.css';
import { FEED_SAVED_KEY, filterFeed, mergeFeed, normalizeFeed, parseFeedFilter, parseFeedSaved, sourceName, type FeedFilter, type FeedLane, type MainFeedItem } from '../lib/main-feed';
import styles from './main-feed.module.css';
import { WorkspaceNav, LibraryNav, CreatorDirectory, MediaLibrary, DraftWorkbench, type WorkspaceView, type DraftSeed } from './creator-workspace';
import { useWorkspaceAccount, WorkspaceSettings } from './workspace-account';
import { AccountDrafts } from './account-drafts';
import { ReferenceLibrary } from './x-radar/reference-library';

const filters: [FeedFilter, string][] = [['all', 'All'], ['x', 'X'], ['hacker_news', 'Hacker News'], ['github', 'GitHub'], ['news', 'News']];
type LaneState = { loading: boolean; error: boolean; degraded: boolean; observedAt: number; interval: number };
const initialLane = (interval: number): LaneState => ({ loading: true, error: false, degraded: false, observedAt: 0, interval });
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
function ago(time: number | null, now: number) {
  if (time === null) return '';
  const minutes = Math.max(0, Math.floor((now - time) / 60_000));
  return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 1440)}d`;
}

function SourceMark({ source }: { source: string }) {
  if (source === 'x') return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.3l8.2-9.4L.8 2h6.5l4.5 6.8L18.9 2ZM17.8 20h1.7L6.3 4H4.5l13.3 16Z"/></svg>;
  if (source === 'github') return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .8a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.2.8-.6v-2.2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.6-1.3-1.6-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.1c0 .4.2.7.8.6A11.5 11.5 0 0 0 12 .8Z"/></svg>;
  if (source === 'hacker_news') return <span aria-hidden="true">Y</span>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>;
}

function FeedPost({ item, saved, onSave, onDraft, now, changes = [] }: { item: MainFeedItem; saved: boolean; onSave: () => void; onDraft: () => void; now: number; changes?: HubActivity[] }) {
  const [expanded, setExpanded] = useState(false);
  const [badAvatar, setBadAvatar] = useState(false);
  const [badImage, setBadImage] = useState(false);
  const content = item.body || item.title;
  const isLong = content.length > 440;
  return <article className={styles.post} aria-label={`${sourceName(item.source)}: ${item.title}`}>
    <div className={styles.postHead}>
      <span className={styles.avatar} data-source={item.source}>
        {item.avatar && !badAvatar ? <img src={item.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBadAvatar(true)} /> : <SourceMark source={item.source} />}
      </span>
      <div className={styles.identity}><strong>{item.author || sourceName(item.source)}</strong><span><i className={styles.sourceBadge} data-source={item.source}><SourceMark source={item.source}/></i>{sourceName(item.source)}{item.handle && item.handle !== item.author ? ` · ${item.handle}` : ''}</span></div>
      {item.publishedAt !== null && <time className={styles.time} dateTime={new Date(item.publishedAt).toISOString()} title={new Date(item.publishedAt).toLocaleString()}>{ago(item.publishedAt, now)}</time>}
    </div>
    <div className={styles.postContent}>
      {item.source === 'x' ? <p className={styles.postText}>{isLong && !expanded ? `${content.slice(0, 440)}…` : content}</p> : <h2><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a></h2>}
      {item.source === 'x' && isLong && <button className={styles.more} onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? 'Show less' : 'Read more'}</button>}
      {item.image && !badImage && <a href={item.url} target="_blank" rel="noopener noreferrer" className={styles.media}><img src={item.image} alt={item.imageAlt || 'Image attached to the original post'} loading="lazy" referrerPolicy="no-referrer" onError={() => setBadImage(true)} /></a>}
      {changes.length > 0 && <div className={hub.changes}>{changes.slice(0, 3).map(change => <span key={change.id}>{(change.delta ?? 0) > 0 ? '+' : ''}{compact.format(change.delta ?? 0)} {change.metric} since last scan</span>)}</div>}
      <div className={styles.postFooter}>
        <div className={styles.metrics} title={`Counts observed ${new Date(item.observedAt).toLocaleString()}`}>
          {Object.entries(item.metrics).slice(0, 3).map(([name, count]) => <span key={name} title={`${count.toLocaleString()} ${name} · observed ${new Date(item.observedAt).toLocaleString()}`}><b>{compact.format(count)}</b> {name}</span>)}
          {!Object.keys(item.metrics).length && <span>From the original source</span>}
        </div>
        <div className={styles.actions}>
          <button onClick={onDraft}>Draft from this</button>
          <button onClick={onSave} aria-label={saved ? 'Unsave post' : 'Save post'} aria-pressed={saved}><svg viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4Z"/></svg><span>{saved ? 'Saved' : 'Save'}</span></button>
          <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={`Open original: ${item.title}`}>Open <span aria-hidden="true">↗</span></a>
        </div>
      </div>
    </div>
  </article>;
}

export default function MainFeed() {
  const {account, error:accountError, refresh:refreshAccount} = useWorkspaceAccount();
  const [feed, setFeed] = useState<{ visible: MainFeedItem[]; pending: MainFeedItem[] }>({ visible: [], pending: [] });
  const [lanes, setLanes] = useState({ x: initialLane(60), public: initialLane(120) });
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [savedOnly, setSavedOnly] = useState(false);
  const [view, setView] = useState<WorkspaceView>('feed');
  const [draftSeed, setDraftSeed] = useState<DraftSeed | null>(null);
  const [creator, setCreator] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [saved, setSaved] = useState<MainFeedItem[]>([]);
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(0);
  const [offline, setOffline] = useState(false);
  const [monitor, setMonitor] = useState(false);
  const monitorRef = useRef(false);
  const streamRef = useRef<HTMLDivElement>(null);
  const [activity, setActivity] = useState<HubActivity[]>([]);
  const observed = useRef<MainFeedItem[]>([]);
  const baselined = useRef(new Set<FeedLane>());
  const [topic, setTopic] = useState<string | null>(null);
  const refresh = useRef<() => void>(() => {});

  useEffect(() => {
    const readUrl = () => {
      const query = new URLSearchParams(location.search);
      const view = query.get('view');
      // Preserve shared links into older tools without putting that UI on the default route.
      if (view && !['saved', 'radar', 'creators', 'drafts', 'media', 'settings', 'library'].includes(view)) { location.replace(`/tools${location.search}${location.hash}`); return; }
      setView(view && ['saved', 'creators', 'drafts', 'media', 'settings', 'library'].includes(view) ? view as WorkspaceView : 'feed');
      setCreator(query.get('creator'));
      setFilter(parseFeedFilter(query.get('source'))); setSavedOnly(view === 'saved');
    };
    const readSaved = () => { try { setSaved(parseFeedSaved(localStorage.getItem(FEED_SAVED_KEY))); } catch { setNotice('Saving is unavailable in this browser.'); } };
    readUrl(); readSaved();
    const onStorage = (event: StorageEvent) => { if (event.key === FEED_SAVED_KEY || event.key === null) readSaved(); };
    window.addEventListener('popstate', readUrl);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener('popstate', readUrl); window.removeEventListener('storage', onStorage); };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    let stopped = false;
    const active = new Map<FeedLane, AbortController>();
    const due: Record<FeedLane, number> = { x: 0, public: 0 };
    const seconds: Record<FeedLane, number> = { x: 60, public: 120 };
    const receive = (incoming: MainFeedItem[], lane: FeedLane) => {
      const events = baselined.current.has(lane) ? buildHubActivity(observed.current, incoming) : [];
      baselined.current.add(lane);
      observed.current = mergeFeed(observed.current, incoming);
      if (events.length) setActivity(previous => [...new Map([...events, ...previous].map(event => [event.id, event])).values()].slice(0,60));
      if (monitorRef.current && events.some(event => event.kind === 'post')) streamRef.current?.scrollTo({ top: 0, behavior: 'instant' });
      const atTop = window.scrollY < 160 || monitorRef.current;
      setFeed(previous => {
        if (atTop || !previous.visible.length) return { visible: mergeFeed(mergeFeed(previous.visible, previous.pending), incoming), pending: [] };
        const known = new Set(previous.visible.map(item => item.url));
        const updated = new Map(mergeFeed(previous.visible, incoming.filter(item => known.has(item.url))).map(item => [item.url, item]));
        return { visible: previous.visible.map(item => updated.get(item.url) ?? item), pending: mergeFeed(previous.pending, incoming.filter(item => !known.has(item.url))) };
      });
    };
    const load = async (lane: FeedLane, force = false) => {
      if (stopped || active.has(lane) || document.hidden || !navigator.onLine || (!force && Date.now() < due[lane])) return;
      const controller = new AbortController(); active.set(lane, controller);
      const timeout = window.setTimeout(() => controller.abort(), 25_000);
      setLanes(previous => ({ ...previous, [lane]: { ...previous[lane], loading: true } }));
      try {
        const response = await fetch(lane === 'x' ? '/api/x-radar?keywords=&country=US' : '/api/public-signals', { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) throw new Error('Source unavailable');
        const payload = await response.json() as { refresh_after_seconds?:number; generated_at:string; sources?: {posts?:{status?:string}} | {status?:string}[] };
        const items = normalizeFeed(payload, lane).filter(item => isHubStreamItem(item) && isRecentHubItem(item));
        if (stopped) return;
        const interval = Number(payload.refresh_after_seconds);
        seconds[lane] = Number.isFinite(interval) ? Math.max(lane === 'x' ? 60 : 120, Math.min(900, interval)) : seconds[lane];
        const degraded = lane === 'x' ? !Array.isArray(payload.sources) && ['degraded', 'unavailable', 'stale'].includes(payload.sources?.posts?.status ?? '') : Array.isArray(payload.sources) && payload.sources.some((s: {status?: string}) => s && ['degraded', 'unavailable', 'stale'].includes(s.status ?? ''));
        receive(items, lane);
        setLanes(previous => ({ ...previous, [lane]: { loading: false, error: false, degraded, observedAt: Date.parse(payload.generated_at), interval: seconds[lane] } }));
      } catch {
        if (!stopped) setLanes(previous => ({ ...previous, [lane]: { ...previous[lane], loading: false, error: true } }));
      } finally {
        clearTimeout(timeout); active.delete(lane); due[lane] = Date.now() + seconds[lane] * 1000;
      }
    };
    const tick = () => { void load('x'); void load('public'); };
    const connectivity = () => { setOffline(!navigator.onLine); tick(); };
    refresh.current = () => { void load('x', true); void load('public', true); };
    queueMicrotask(() => { if (!stopped) { setNow(Date.now()); connectivity(); } });
    const polling = window.setInterval(tick, 1000);
    const clock = window.setInterval(() => setNow(Date.now()), 15_000);
    document.addEventListener('visibilitychange', connectivity);
    window.addEventListener('online', connectivity); window.addEventListener('offline', connectivity);
    return () => {
      stopped = true; clearInterval(polling); clearInterval(clock);
      for (const controller of active.values()) controller.abort();
      document.removeEventListener('visibilitychange', connectivity);
      window.removeEventListener('online', connectivity); window.removeEventListener('offline', connectivity);
    };
  }, []);

  function choose(nextFilter: FeedFilter, nextSaved = savedOnly) {
    setFilter(nextFilter); setSavedOnly(nextSaved); setTopic(null); setCreator(null); setView(nextSaved ? 'saved' : 'feed');
    const query = new URLSearchParams();
    if (nextFilter !== 'all') query.set('source', nextFilter);
    if (nextSaved) query.set('view', 'saved');
    const url = query.size ? `/?${query}` : '/';
    if (`${location.pathname}${location.search}` !== url) history.pushState({}, '', url);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function navigate(next: WorkspaceView, handle?: string) {
    setView(next); setSavedOnly(next === 'saved'); setTopic(null); setCreator(handle ?? null); setSearch(''); setFilter(handle ? 'x' : 'all');
    const query = new URLSearchParams();
    if (next !== 'feed') query.set('view', next);
    if (handle) { query.set('creator', handle); query.set('source', 'x'); }
    const url = query.size ? `/?${query}` : '/';
    if (`${location.pathname}${location.search}` !== url) history.pushState({}, '', url);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function toggleSave(item: MainFeedItem) {
    try {
      const current = parseFeedSaved(localStorage.getItem(FEED_SAVED_KEY));
      const exists = current.some(post => post.url === item.url);
      if (!exists && current.length >= 200) { setNotice('Your saved feed holds 200 posts. Remove one to save another.'); return; }
      const next = exists ? current.filter(post => post.url !== item.url) : [item, ...current];
      localStorage.setItem(FEED_SAVED_KEY, JSON.stringify(next)); setSaved(next);
      setNotice(exists ? 'Removed from saved posts.' : 'Saved on this device.');
    } catch { setNotice('Couldn’t save. Browser storage may be full or unavailable.'); }
  }
  const recentVisible = feed.visible.filter(item => isRecentHubItem(item, now || item.observedAt));
  const recentPending = feed.pending.filter(item => isRecentHubItem(item, now || item.observedAt));
  const recentCollected = [...recentVisible, ...recentPending];
  const topics = buildHubTopics(recentCollected, now || undefined);
  const selectedTopic = topics.find(item => item.id === topic);
  const items = filterFeed(savedOnly ? saved : recentVisible, filter).filter(item => (!topic || selectedTopic?.posts.some(post => post.url === item.url)) && (!creator || item.handle.replace(/^@/, '').toLowerCase() === creator.toLowerCase()) && (!search.trim() || `${item.title} ${item.body} ${item.author} ${item.handle}`.toLowerCase().includes(search.trim().toLowerCase())));
  const pending = filterFeed(recentPending, filter).length;
  const busy = lanes.x.loading || lanes.public.loading;
  const initial = !feed.visible.length && busy;
  const problems = (Object.entries(lanes) as [FeedLane, LaneState][]).flatMap(([lane, state]) => {
    const name = lane === 'x' ? 'X' : 'News';
    if (state.error) return [`${name} unavailable — retrying automatically`];
    if (state.observedAt && now - state.observedAt > Math.max(300, state.interval * 3) * 1000) return [`${name} showing older observations`];
    if (state.degraded) return [`Some ${name.toLowerCase()} sources are delayed`];
    return [];
  });
  return <div className={`${styles.shell} ${hub.hub} ${monitor ? hub.monitor : ''}`}>
    <a className={styles.skip} href="#feed">Skip to feed</a>
    <WorkspaceNav view={view} choose={navigate}/>
    <header className={styles.header}><div className={styles.headerInner}>
      <span className={styles.breadcrumb}>Workspace <span>/</span> {{feed:'Live feed',drafts:'Posts',media:'Library',library:'Library',saved:'Library',creators:'Creators',settings:'Settings'}[view]}</span>
      <button className={styles.settingsButton} onClick={()=>navigate('settings')} aria-label="Settings">Settings</button>
      <button className={styles.writeButton} onClick={() => navigate('drafts')}>Write a post <span aria-hidden="true">↗</span></button>
    </div></header>
    <main id="feed" className={styles.main} tabIndex={-1}>
      {view !== 'feed' && view !== 'saved' && <div className={hub.masthead}><div><p className={hub.eyebrow}>YOUR CREATOR WORKSPACE</p><h1>{view === 'drafts' ? 'Ideas & drafts' : view === 'media' ? 'Media library' : view === 'settings' ? 'Account & connections' : view === 'library' ? 'Reference library' : 'Creators'}</h1><p className={hub.subtitle}>{view === 'drafts' ? 'From something worth noticing to something worth posting.' : view === 'media' ? 'The right clip, without leaving your flow.' : view === 'settings' ? 'One account. Clear connection status.' : view === 'library' ? 'Your saved sources, notes and archived media.' : 'Founders, developers, labs and the people moving the conversation.'}</p></div></div>}
      <div hidden={view !== 'drafts'}>{account?.user && account.capabilities.drafts ? <AccountDrafts key={account.user.id} owner={account.user.id} seed={draftSeed} browse={()=>navigate('media')}/> : account ? <><p className={styles.savedNote}>Local workspace — <button onClick={()=>navigate('settings')}>connect your account</button> to sync. Existing local drafts are kept until you import them.</p><DraftWorkbench seed={draftSeed} browse={() => navigate('media')}/></> : <p role="status">{accountError||'Checking your account…'}{accountError&&<button onClick={()=>void refreshAccount()}>Retry account connection</button>}</p>}</div>
      {view === 'settings' && <WorkspaceSettings account={account} error={accountError} refresh={refreshAccount}/>}
      {['library','media','saved'].includes(view)&&<LibraryNav view={view} choose={navigate}/>}
      {view === 'library' && <ReferenceLibrary/>}
      {view === 'creators' && <CreatorDirectory items={recentCollected} select={handle => navigate('feed', handle)}/>}
      {view === 'media' && <MediaLibrary choose={meme => { setDraftSeed({ token: Date.now(), meme }); navigate('drafts'); }}/>}
      {(view === 'feed' || view === 'saved') && <>
      <div className={hub.masthead}><div><p className={hub.eyebrow}>VIRALITY TRACKER / TREND HUB</p><h1>{savedOnly ? 'Saved posts' : 'The builder pulse.'}</h1><p className={hub.subtitle}>{savedOnly ? 'Your next idea might already be here.' : 'Tech Twitter, memes and launches. X posts from the last 48 hours.'}</p></div><div className={hub.monitorTools}><div className={hub.clock}><strong>{now ? new Date(now).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—'}</strong>Your local time</div><button aria-pressed={monitor} onClick={() => { const enabled = !monitor; setMonitor(enabled); monitorRef.current = enabled; if (enabled) setFeed(previous => ({visible:mergeFeed(previous.visible,previous.pending),pending:[]})); }}>Monitor mode</button></div></div>
      {!savedOnly && <HubTopics topics={topics} selected={topic} select={id => { choose('all',false); setTopic(id); }} />}
      <div className={hub.body} style={savedOnly ? {gridTemplateColumns:'1fr'} : undefined}>
      <div className={hub.stream} ref={streamRef}>
      <div className={hub.streamHead}><h2><i className={hub.dot} />{savedOnly ? 'Your collection' : 'Live stream'}</h2><span>{monitor ? 'Following new arrivals' : 'Newest posts first'} · {items.length} posts</span></div>
      <label className={styles.feedSearch}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input aria-label="Search loaded posts" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search posts, people, ideas…"/></label>
      {creator && <div className={hub.topicFilter}>Posts from @{creator}<button onClick={() => navigate('feed')} aria-label="Clear creator filter">Clear ×</button></div>}
      {topic && <div className={hub.topicFilter}>Conversation: {selectedTopic?.title ?? topic}<button aria-label="Clear topic" onClick={() => setTopic(null)}>Clear ×</button></div>}
      <div className={styles.feedBar}>
        <div className={styles.filters} role="group" aria-label="Filter by source">{filters.map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => choose(id)}>{label}</button>)}</div>
        <button className={styles.refresh} onClick={() => refresh.current()} aria-label="Refresh feed" disabled={busy || offline} title="Refresh feed"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M19 11a7 7 0 0 0-12-5L4 9M5 13a7 7 0 0 0 12 5l3-3"/></svg></button>
      </div>
      <div className={styles.statusLine}><span className={styles.update} data-warning={offline || problems.length > 0}><i />{offline ? 'Offline · showing loaded posts' : busy ? 'Checking for new posts…' : 'Updates automatically'}</span><span>X ~{Math.ceil(lanes.x.interval / 60)} min · News ~{Math.ceil(lanes.public.interval / 60)} min</span></div>
      {problems.length > 0 && !offline && <p className={styles.warning} role="status">{problems.join(' · ')}. Existing posts stay visible.</p>}
      {savedOnly && <p className={styles.savedNote}>Saved on this device, not cloud synced. <Link href="/x-master?view=saved">Reference library</Link> · <Link href="/tools">Earlier bookmarks</Link></p>}
      {!savedOnly && pending > 0 && <div className={styles.newPosts}><button onClick={() => { setFeed(previous => ({ visible: mergeFeed(previous.visible, previous.pending), pending: [] })); window.scrollTo({ top: 0, behavior: 'instant' }); }}>↑ {pending} new {pending === 1 ? 'post' : 'posts'}</button></div>}
      <p className={styles.notice} role="status">{notice}</p>
      <section aria-label={savedOnly ? 'Saved posts' : 'Latest posts'} className={styles.list}>
        {items.map(item => <FeedPost key={item.url} item={item} now={now || item.observedAt} saved={saved.some(post => post.url === item.url)} onSave={() => toggleSave(item)} onDraft={() => { setDraftSeed({ token: Date.now(), source: item }); navigate('drafts'); }} changes={activity.filter(event => event.kind === 'metric' && event.item.url === item.url && now - event.at < 120000)} />)}
        {!items.length && <div className={styles.empty}>
          <span aria-hidden="true">{initial && !savedOnly ? '◌' : '◎'}</span>
          <h2>{savedOnly ? 'Keep something worth returning to' : offline ? 'You’re offline' : initial ? 'Loading your feed' : lanes.x.error && lanes.public.error ? 'Couldn’t update the feed' : 'Nothing new here yet'}</h2>
          <p>{savedOnly ? 'Tap Save on a post and it will appear here.' : offline ? 'Your feed will resume when your connection returns.' : initial ? 'Fetching posts from X and public sources…' : lanes.x.error && lanes.public.error ? 'We’ll keep trying. You can also refresh above.' : 'New posts appear automatically when your sources update.'}</p>
          {filter !== 'all' && <button onClick={() => choose('all')}>Show all sources</button>}
        </div>}
      </section>
      {items.length > 0 && <footer className={styles.end}>You’re through the loaded posts. More appear as sources update.<br/><small>Tracked sources, not all of X. Counts are observed snapshots.</small></footer>}
      </div>
      {!savedOnly && <aside className={hub.rail} aria-label="Trend hub"><HubActivityPanel events={activity} now={now} /><GitHubPanel /><HubCreators items={recentCollected} /></aside>}
      </div>
      <footer className={hub.statusFooter}><span>{X_WATCHED_CREATORS.length} watched X accounts · founders, builders, developers & labs</span><span>Observed activity, never simulated · {monitor ? 'Monitor following updates' : 'Reading position protected'}</span></footer>
      </>}
    </main>
  </div>;
}
