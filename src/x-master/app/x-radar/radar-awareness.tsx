'use client';
import { useEffect, useState } from 'react';
import type { RadarEvent } from '../../lib/x-radar-awareness';
import styles from './radar-awareness.module.css';
import { SourceAvatar, LivePostMetrics, type LivePost } from './live-post-details';
import { LeadSignalBorder } from './lead-signal-border';
import type { MetricChange } from '../../lib/x-live-metrics';

export type AwarenessSnapshot={events:RadarEvent[];storage:string;checked_at:string;reason?:string};
type Props={snapshot?:AwarenessSnapshot;monitor:string;alertsEnabled:boolean;onEnableAlerts:()=>void;sources?:{posts:{status:string;label:string};trends:{status:string}};livePosts?:LivePost[];changes?:Record<string,MetricChange[]>;observedAt?:string;countdown?:number;refreshing?:boolean};
const VISIT_KEY='x-master:radar:last-visit:v1';
const tabs=['Top stories','Launches','Topics','Breakouts','Since last visit'] as const;
export function RadarAwareness({snapshot,monitor,alertsEnabled,onEnableAlerts,sources,livePosts=[],changes={},observedAt,countdown=60,refreshing=false}:Props) {
  const [tab,setTab]=useState<typeof tabs[number]>('Top stories');
  const [since,setSince]=useState<number|null>(null);
  const [storageError,setStorageError]=useState(false);
  const [limit,setLimit]=useState(12);
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),15000);return()=>window.clearInterval(timer);},[]);
  useEffect(()=>{
    const timer=setTimeout(()=>{
      try{const value=Number(localStorage.getItem(VISIT_KEY));setSince(value>0&&value<=Date.now()?value:null);localStorage.setItem(VISIT_KEY,String(Date.now()));}catch{setStorageError(true);}
    },0);
    return()=>clearTimeout(timer);
  },[]);
  if(!snapshot)return null;
  const recent=since??Date.parse(snapshot.checked_at)-48*3600000;
  const unseen=snapshot.events.filter(e=>Date.parse(e.first_seen_at)>recent);
  const events=tab==='Since last visit'?unseen:snapshot.events.filter(e=>tab==='Top stories'||e.kind===(tab==='Launches'?'launch':tab==='Topics'?'topic':'breakout'));
  const markCaughtUp=()=>{const next=Date.now();setSince(next);try{localStorage.setItem(VISIT_KEY,String(next));}catch{setStorageError(true);}};
  const postsById=new Map(livePosts.map(post=>[post.id,post]));
  const observationAge=observedAt&&Number.isFinite(Date.parse(observedAt))?Math.max(0,Math.floor((now-Date.parse(observedAt))/60000)):null;
  return <section className={styles.awareness} aria-labelledby="awareness-title">
    <header className={styles.header}><div><p className={styles.eyebrow}>YOUR SIGNAL DESK</p><h1 id="awareness-title">What matters now</h1><p>The news, the people behind it, and the response on X.</p></div><button type="button" onClick={onEnableAlerts}>{alertsEnabled?'Browser alerts on':'Enable browser alerts'}</button></header>
    <div className={styles.health} role="status"><span>{monitor==='cloud'?'Cloud monitor active':monitor==='local'?'Background monitor active on this PC':'Background monitor not active'}</span><span>{sources?.posts.status==='live'?'Sources responding':'Post source degraded'} · {sources?.trends.status==='live'?'Topic board available':'Topic board degraded'}</span><span>{snapshot.storage==='durable'?'History saved':'History unavailable'}</span></div>
    <div className={styles.observation}><span>{refreshing?'Checking sources…':`Next check in ${countdown}s`}</span><span>{observationAge===null?'Count timestamp unavailable':observationAge>5?`Count snapshot ${observationAge}m old · delayed`:observationAge===0?'Count snapshot under a minute old':`Count snapshot ${observationAge}m old`}</span></div>
    <details className={styles.coverage}><summary>Coverage &amp; freshness</summary><p>Watched accounts + official feeds + topic board. Not all of X. Checks every 60 seconds; source caches can delay counts. Changes only appear when observed. {monitor==='local'?'Keep this PC running; the browser can close.':monitor!=='cloud'?'Open-page refresh is active; off-page checks are not running.':''}</p></details>
    {(snapshot.reason||storageError)&&<p className={styles.warning} role="status">{snapshot.reason||'Could not save your last-visit preference on this device.'}</p>}
    <nav className={styles.tabs} aria-label="Story filters">{tabs.map(name=><button type="button" key={name} aria-pressed={tab===name} onClick={()=>{setTab(name);setLimit(12);}}>{name}{name==='Since last visit'&&<span>{unseen.length}</span>}</button>)}</nav>
    {tab==='Since last visit'&&<div className={styles.catchup}><p>{since?'Newly found since your previous visit on this device.':'Your first visit: stories found in the past 48 hours.'}</p>{unseen.length>0&&<button type="button" onClick={markCaughtUp}>Mark caught up</button>}</div>}
    {events.length===0?<div className={styles.empty}><h3>{tab==='Breakouts'?'No measured breakouts yet':tab==='Since last visit'?'You’re caught up':'No stories in this view yet'}</h3><p>{tab==='Breakouts'?'Breakouts require two fresh engagement snapshots. A high total alone does not prove growth.':'Radar will keep checking. Source outages are shown above, not disguised as a quiet day.'}</p></div>:<ol className={styles.stories}>{events.slice(0,limit).map((event,index)=>{
      const observed=event.posts.map(post=>postsById.get(post.id)).find(Boolean);
      const primary=event.posts.find(post=>post.id===observed?.id)??event.posts[0];
      const name=observed?.creator?.display_name??primary?.author??'Source';
      const contributors=event.posts.filter((post,index,all)=>all.findIndex(other=>other.author===post.author)===index).slice(0,4);
      return <li key={event.id} className={event.kind==='launch'?styles.launch:undefined}>
      {index===0&&<LeadSignalBorder />}
      <div className={styles.storyBody}>
      <div className={styles.meta}><span>{event.kind==='launch'?'OFFICIAL LAUNCH':event.kind==='topic'?'TOPIC TO WATCH':'MEASURED BREAKOUT'}</span>{Date.parse(event.first_seen_at)>recent&&<b>New to you</b>}<time dateTime={event.published_at}>{new Date(event.published_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time></div>
      <h2><a href={event.url} target="_blank" rel="noreferrer">{event.title}</a></h2><p className={styles.summary}>{primary?.title??event.summary}</p><p className={styles.why}>{event.why}</p>
      </div>
      <aside className={styles.sourcePanel} aria-label={`Source evidence for ${event.title}`}>
        <a className={styles.identity} href={primary?.url??event.url} target="_blank" rel="noreferrer"><SourceAvatar name={name} src={observed?.creator?.avatar_url} /><span><strong>{name}</strong><small>{observed?.creator?.username??primary?.author??'Original source'}</small></span><span className={styles.platform} aria-label={observed?'X post':'Source'}>{observed?<svg aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.3l8.2-9.4L1 2h6.5l5.5 7.1L18.9 2ZM17.8 20h1.7L6.6 4H4.8l13 16Z" /></svg>:'↗'}</span></a>
        {observed?<><LivePostMetrics metrics={observed.observed_metrics} changes={changes[observed.id]} /><p className={styles.sourceNote}>Reported on this post · not topic totals</p></>:<p className={styles.sourceNote}>Post counts unavailable in the current source snapshot.</p>}
        <div className={styles.contributors}><span className={styles.avatarStack}>{contributors.map(post=><SourceAvatar small key={post.author} name={post.author} src={postsById.get(post.id)?.creator?.avatar_url} />)}</span><span>{event.author_count} {event.author_count===1?'author':'authors'} in sample</span></div>
      </aside>
      <div className={styles.evidence}><span>{event.author_count} {event.author_count===1?'author':'authors'} in sample</span>{event.trend_rank&&<span>Topic board #{event.trend_rank}</span>}{event.growth_per_minute!==undefined&&<span>+{event.growth_per_minute} engagements/min</span>}<span>{event.confirmation==='official'?'First-party evidence':event.kind==='breakout'?'Measured public metrics':'Not officially confirmed'}</span></div>
      <footer><a href={event.url} target="_blank" rel="noreferrer">{event.kind==='launch'?'Original announcement':'Open source'} ↗</a><details><summary>{event.posts.length} collected {event.posts.length===1?'post':'posts'}</summary><ul>{event.posts.map(post=><li key={post.id}><a href={post.url} target="_blank" rel="noreferrer"><strong>{post.author}</strong><span>{post.title}</span></a></li>)}</ul></details></footer>
    </li>;})}</ol>}
    {events.length>limit&&<button className={styles.more} type="button" onClick={()=>setLimit(n=>n+12)}>Show more stories</button>}
    <p className={styles.checked}>Last checked {new Date(snapshot.checked_at).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}. Story dates show publication, not discovery. News importance is separate from reply priority.</p>
  </section>;
}
