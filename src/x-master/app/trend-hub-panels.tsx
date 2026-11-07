"use client";

import { useEffect, useState } from 'react';
import type { MainFeedItem } from '../lib/main-feed';
import { X_WATCHED_CREATORS } from '../lib/x-watchlist';
import type { HubActivity, HubTopic } from '../lib/trend-hub';
import type { GitHubTrending } from '../lib/github-trending';
import styles from './trend-hub.module.css';

const number = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export function HubTopics({ topics, selected, select }: { topics: HubTopic[]; selected: string | null; select: (id: string) => void }) {
  return <section className={styles.topics} aria-label="Developing conversations">
    <div className={styles.sectionHead}><h2>Developing conversations</h2><span>Across your sources · last 48h</span></div>
    <div className={styles.topicGrid}>{topics.slice(0, 3).map((topic, i) => <button key={topic.id} className={styles.topicCard} onClick={() => select(topic.id)} aria-label={`Follow topic ${topic.title}`} aria-pressed={selected === topic.id}>
      <div className={styles.topicTop}><span>0{i + 1} / IN CONVERSATION</span><span aria-hidden="true">↗</span></div>
      <strong>{topic.title}</strong><p>{topic.posts[0].title}</p>
      <div className={styles.topicBottom}><span className={styles.faces}>{topic.posts.filter((p, i, all) => all.findIndex(a => a.handle === p.handle) === i).slice(0, 3).map(post => <span key={post.url}>{(post.author || post.source).replace('@','').slice(0,1)}{post.avatar && <img src={post.avatar} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; }} />}</span>)}</span><span><b>{topic.authors}</b> voices · {topic.posts.length} posts collected</span></div>
    </button>)}</div>
    {!topics.length && <p className={styles.quiet}>Listening for shared conversations. Topics appear when at least two collected voices mention the same subject.</p>}
  </section>;
}

export function HubActivityPanel({ events, now }: { events: HubActivity[]; now: number }) {
  return <section className={styles.panel} aria-label="Live changes"><div className={styles.sectionHead}><h2><i className={styles.dot} />Live changes</h2><span>This session</span></div>
    <div className={styles.activityList}>{events.slice(0, 8).map(event => <a href={event.item.url} target="_blank" rel="noopener noreferrer" key={event.id} className={styles.activityItem}>
      <span className={styles.activityMark} data-kind={event.kind}>{event.kind === 'metric' ? '↗' : '•'}</span>
      <div><strong>{event.kind === 'metric' ? `${(event.delta ?? 0) > 0 ? '+' : ''}${number.format(event.delta ?? 0)} ${event.metric}` : 'New post'}</strong><span>{event.item.author || event.item.source} · {event.item.title}</span></div>
      <time>{Math.max(0,Math.floor((now - event.at) / 60000)) < 1 ? 'now' : `${Math.floor((now - event.at) / 60000)}m`}</time>
    </a>)}</div>
    {!events.length && <p className={styles.quiet}>First scan is your baseline. New posts and measured count changes will land here as sources refresh.</p>}
  </section>;
}

export function HubCreators({ items }: { items: MainFeedItem[] }) {
  const [query, setQuery] = useState('');
  const creators = new Map<string, { post: MainFeedItem; count: number }>();
  for (const post of items) {
    if (post.source !== 'x' || !post.handle) continue;
    const key = post.handle.toLowerCase(); const old = creators.get(key);
    creators.set(key, { post: old && (old.post.publishedAt ?? 0) > (post.publishedAt ?? 0) ? old.post : post, count: (old?.count ?? 0) + 1 });
  }
  const active = [...creators.values()].sort((a, b) => (b.post.publishedAt ?? 0) - (a.post.publishedAt ?? 0));
  const matches = X_WATCHED_CREATORS.filter(creator => `${creator.handle} ${creator.name} ${creator.organization ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return <section className={styles.panel} aria-label="Active creators"><div className={styles.sectionHead}><h2>Active creators</h2><span>{creators.size} seen</span></div>
    <div>{active.slice(0, 6).map(({post,count}) => <a className={styles.creator} key={post.handle} href={post.url} target="_blank" rel="noopener noreferrer"><span className={styles.creatorAvatar}>{(post.author || post.source).replace('@','').slice(0,1)}{post.avatar && <img src={post.avatar} alt="" loading="lazy" onError={e => {e.currentTarget.style.display='none';}} />}</span><span><strong>{post.author}</strong><small>{post.handle}</small></span><em>{count} {count === 1 ? 'post' : 'posts'}</em></a>)}</div>
    {!active.length && <p className={styles.quiet}>Waiting for watched X accounts to respond.</p>}
    <details className={styles.watchlist}><summary>Explore {X_WATCHED_CREATORS.length} watched accounts <span>↗</span></summary><label>Find a creator<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Founder, builder or handle" /></label><div className={styles.roster}>{matches.map(creator => <a key={creator.handle} href={`https://x.com/${creator.handle}`} target="_blank" rel="noopener noreferrer"><strong>{creator.name}</strong><span>@{creator.handle}</span></a>)}{!matches.length && <p>No matching watched account.</p>}</div><p className={styles.quiet}>Watchlist coverage is not all of X. An account may have no recent collected post.</p></details>
  </section>;
}

export function GitHubPanel() {
  const [data, setData] = useState<GitHubTrending | null>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let stopped = false; let due = 0; let active: AbortController | null = null;
    async function load() {
      if (stopped || active || document.hidden || !navigator.onLine || Date.now() < due) return;
      const controller = new AbortController(); active = controller;
      let retrySeconds = 60;
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch('/api/github-trending', {signal:controller.signal});
        if (!response.ok) throw new Error('Unavailable');
        const value = await response.json() as GitHubTrending;
        if (!Array.isArray(value.repos) || !['live','stale','unavailable'].includes(value.status)) throw new Error('Invalid response');
        retrySeconds = value.status === 'live' ? 600 : 60;
        const repos = value.repos.slice(0,25).filter(r => r && typeof r.full_name === 'string' && /^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(r.full_name) && r.url === `https://github.com/${r.full_name}` && typeof r.description === 'string' && typeof r.language === 'string' && (r.stars_today === undefined || (Number.isSafeInteger(r.stars_today) && Number(r.stars_today) >= 0)));
        if (!stopped) setData({ ...value, repos });
      } catch { if (!stopped) setData(previous => ({ generated_at: previous?.generated_at ?? null, repos: previous?.repos ?? [], status: previous?.repos.length ? 'stale' : 'unavailable', refresh_after_seconds:600 })); }
      finally { clearTimeout(timeout); active = null; due = Date.now() + retrySeconds * 1000; }
    }
    void load(); const timer = window.setInterval(() => void load(), 15000);
    const resume = () => void load(); document.addEventListener('visibilitychange',resume); window.addEventListener('online',resume);
    return () => { stopped=true;active?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume); };
  }, []);
  return <section className={styles.panel} aria-label="GitHub today"><div className={styles.sectionHead}><h2>GitHub today <span aria-hidden="true">↗</span></h2><a href="https://github.com/trending?since=daily" target="_blank" rel="noopener noreferrer">Daily Trending</a></div>
    {data?.repos.slice(0,expanded ? 25 : 5).map(repo => <a className={styles.repo} href={repo.url} key={repo.full_name} target="_blank" rel="noopener noreferrer"><div><strong>{repo.full_name}</strong>{repo.stars_today !== undefined && <b>+{number.format(repo.stars_today)}</b>}</div><p>{repo.description}</p><small>{repo.language || 'Repository'}{repo.stars_today !== undefined ? ' · stars today' : ''}</small></a>)}
    {!data && <p className={styles.quiet}>Checking GitHub’s daily movers…</p>}
    {data?.status === 'unavailable' && <p className={styles.quiet}>GitHub Trending is temporarily unavailable. Retrying automatically.</p>}
    {data?.status === 'stale' && <p className={styles.quiet}>Showing the last successful GitHub scan.</p>}
    {(data?.repos.length ?? 0) > 5 && <button className={styles.expand} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show fewer repositories' : `Explore all ${data?.repos.length} repositories`}</button>}
    <p className={styles.sourceNote}>GitHub’s ranking · checked every 10 minutes</p>
  </section>;
}
