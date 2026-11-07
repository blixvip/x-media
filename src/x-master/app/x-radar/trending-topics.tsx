'use client';

import { useEffect, useState } from 'react';
import { rankTrendingTopics, type TrendingSort, type TrendingTopic } from '../../lib/x-trending';
import { SourceAvatar } from './live-post-details';
import styles from './trending-topics.module.css';

const OPTIONS: Array<{ id: TrendingSort; label: string; description: string }> = [
  { id: 'popular', label: 'Most popular', description: 'Most likes, replies, and reposts on collected posts.' },
  { id: 'recent', label: 'Most recent', description: 'Newest news first.' },
  { id: 'active', label: 'Most active', description: 'Most new interactions per minute on collected posts.' },
];
const compact = (value: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
function age(date: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(date)) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

export function TrendingTopics({ topics, loading, refreshing, error, updatedAt, onRefresh }: {
  topics: TrendingTopic[]; loading: boolean; refreshing: boolean; error: string;
  updatedAt?: string; onRefresh: () => void;
}) {
  const [sort, setSort] = useState<TrendingSort>('popular');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer); }, []);
  const visible = rankTrendingTopics(topics, sort);
  return <section className={styles.trending} aria-labelledby="trending-heading">
    <header className={styles.header}><div><h1 id="trending-heading">Trending</h1><p>Top 20 topics from your tracked sources.</p></div><button type="button" disabled={refreshing} onClick={onRefresh}>{refreshing ? 'Updating…' : 'Refresh'}</button></header>
    <nav className={styles.tabs} aria-label="Trending order">{OPTIONS.map(option => <button type="button" key={option.id} aria-pressed={sort === option.id} onClick={() => setSort(option.id)}>{option.label}</button>)}</nav>
    <p className={styles.description}>{OPTIONS.find(option => option.id === sort)?.description}</p>
    {loading && !topics.length ? <p className={styles.empty} role="status">Loading topics…</p>
      : error && !topics.length ? <div className={styles.empty} role="alert"><h2>Couldn’t load topics</h2><button type="button" onClick={onRefresh}>Try again</button></div>
      : !visible.length ? <div className={styles.empty}><h2>No trending topics yet</h2><p>New stories will appear here automatically.</p></div>
      : <ol className={styles.list} aria-label="Trending topics">{visible.map((topic, index) => <li key={topic.id} data-topic-id={topic.id}>
        <span className={styles.rank} aria-hidden="true">{index + 1}</span>
        <article><h2><a href={topic.url} target="_blank" rel="noreferrer">{topic.title}</a></h2>
          <div className={styles.meta}><span className={styles.avatars}>{topic.authors.slice(0, 3).map((author, index) => <SourceAvatar key={`${author.name}-${index}`} name={author.name} src={author.avatar} small />)}</span><time dateTime={topic.publishedAt}>{age(topic.publishedAt, now)}</time><span>{sort === 'active' ? topic.activity === null ? 'Activity not available yet' : `${compact(topic.activity)}/min` : topic.interactions === null ? 'Interactions unavailable' : `${compact(topic.interactions)} interactions`}</span></div>
          <details className={styles.sources}><summary>{topic.posts.length} collected {topic.posts.length === 1 ? 'post' : 'posts'}</summary><ul>{topic.posts.map(post => <li key={post.url}><a href={post.url} target="_blank" rel="noreferrer"><strong>{post.author}</strong><span>{post.title}</span></a></li>)}</ul></details>
        </article>
      </li>)}</ol>}
    <p className={styles.updated} role="status">{error && topics.length ? 'Update failed. Showing the last loaded topics.' : updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Waiting for sources'} · Checks every minute · Last 7 days</p>
  </section>;
}
