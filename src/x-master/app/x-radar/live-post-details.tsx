'use client';

import Image from 'next/image';
import { useState } from 'react';
import { observedMetricNames, type MetricChange, type ObservedMetrics } from '../../lib/x-live-metrics';
import styles from './live-post-details.module.css';

export type LivePost = {
  id: string;
  source_url: string;
  creator?: { username?: string; display_name?: string; avatar_url?: string };
  observed_metrics?: ObservedMetrics;
};

export function SourceAvatar({ name, src, small = false }: { name: string; src?: string; small?: boolean }) {
  const [failed, setFailed] = useState<string>();
  const initials = name.replace(/^@/, '').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
  return <span className={`${styles.avatar} ${small ? styles.small : ''}`}>
    <span role="img" aria-hidden={Boolean(src && failed !== src)} aria-label={`${name} profile unavailable`}>{initials}</span>
    {src && failed !== src && <Image unoptimized src={src} alt={`${name} profile`} width={44} height={44} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(src)} />}
  </span>;
}

const paths = {
  views: 'M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Zm9-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  likes: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  reposts: 'm4 8 3-3 3 3M7 5v11h8m5 0-3 3-3-3m3 3V8H9',
  replies: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5A8.5 8.5 0 0 1 10.5 3h2a8.5 8.5 0 0 1 8.5 8.5Z',
};

export function LivePostMetrics({ metrics = {}, changes = [] }: { metrics?: ObservedMetrics; changes?: MetricChange[] }) {
  return <div className={styles.metrics} aria-label="Observed X metrics">{observedMetricNames.map(metric => {
    const value = metrics[metric];
    const change = changes.find(item => item.metric === metric);
    return <div className={styles.metric} key={metric}>
      <span className={styles.label}><svg aria-hidden="true" viewBox="0 0 24 24"><path d={paths[metric]} /></svg>{metric}</span>
      <b key={value} className={change ? styles.changed : undefined}>{typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : '—'}</b>
      {change && <span className={styles.delta} data-correction={change.delta < 0} title="Difference between the two latest fresh source snapshots">{change.delta > 0 ? '+' : '−'}{Math.abs(change.delta).toLocaleString()} {change.delta < 0 ? 'correction' : 'this check'}</span>}
    </div>;
  })}</div>;
}
