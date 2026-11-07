import { buildLaunchEvents, type GrowthSignal } from './x-growth-copilot.ts';

export type RadarPost = { id: string; title: string; url: string; author: string; published_at: string };
export type RadarEvent = {
  id: string; title: string; kind: 'launch' | 'topic' | 'breakout'; summary: string; why: string;
  confirmation: 'official' | 'corroborated' | 'unverified'; importance: number; alert: boolean;
  published_at: string; first_seen_at: string; last_seen_at: string; url: string;
  posts: RadarPost[]; author_count: number; trend_rank?: number; growth_per_minute?: number;
};
export type MetricSample = { at: number; value: number };
export function measuredGrowth(previous: MetricSample | undefined, current: MetricSample) {
  if (!previous || ![previous.at, previous.value, current.at, current.value].every(Number.isFinite)) return null;
  const minutes = (current.at - previous.at) / 60000;
  const delta = current.value - previous.value;
  if (minutes < 1 || minutes > 60 || delta < 0 || previous.value < 0) return null;
  return { per_minute: Math.round(delta / minutes * 10) / 10, delta, minutes };
}
export function notificationKey(event: RadarEvent) {
  return `${event.id}:${event.confirmation}:${event.kind === 'breakout' && (event.growth_per_minute ?? 0) >= 100 ? 'surging' : 'noticed'}`;
}
export function safeEvidenceUrl(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
const normalized = (text: string) => text.toLowerCase().replace(/chatgpt/g, 'gpt').replace(/[^a-z0-9]+/g, ' ').trim();
const matches = (text: string, phrase: string) => ` ${normalized(text)} `.includes(` ${normalized(phrase)} `);
const textOf = (p: GrowthSignal) => `${p.title ?? ''} ${p.body ?? ''}`;
const published = (p: GrowthSignal, now: Date) => p.published_at && Number.isFinite(Date.parse(p.published_at)) ? p.published_at : new Date(now.getTime() - (p.age_seconds ?? (p.age_minutes ?? 0) * 60) * 1000).toISOString();
const postOf = (p: GrowthSignal, now: Date): RadarPost => ({id:p.id, title:(p.title ?? p.body ?? '').replace(/\s+/g,' ').slice(0,300), url:p.source_url ?? p.url ?? '', author:p.creator?.username ?? p.source, published_at:published(p,now)});
const authors = (posts: RadarPost[]) => new Set(posts.map(p=>p.author.toLowerCase())).size;

/** Importance is independent of opportunity/reply scores. Counts describe only our collected sample. */
export function buildRadarEvents(signals: GrowthSignal[], trends: Array<{name:string;rank:number}>, keywords: string[], now = new Date(), growth = new Map<string, ReturnType<typeof measuredGrowth>>()) {
  const unique = new Map<string,GrowthSignal>();
  for (const signal of signals.slice(0,500)) {
    if (!safeEvidenceUrl(signal.source_url ?? signal.url ?? '')) continue;
    const age = now.getTime()-Date.parse(published(signal,now));
    if (age < -300000 || age > 7*86400000) continue;
    unique.set(signal.id,signal);
  }
  const items = [...unique.values()];
  const launches = buildLaunchEvents(items,[],now).sort((a,b)=>Number(b.confirmation==='official')-Number(a.confirmation==='official') || b.entity.length-a.entity.length);
  const events: RadarEvent[] = [];
  const covered = new Set<string>();
  for (const launch of launches) {
    const title = launch.entity.replace(/^ChatGPT-(\d)/,'GPT-$1');
    const base = title.match(/^(GPT-[\d.]+)/)?.[1];
    const baseIsUnique = !base || launches.filter(e=>e.entity.replace(/^ChatGPT-/,'GPT-').startsWith(`${base} `)).length <= 1;
    if (baseIsUnique && events.some(e=>base && e.title.startsWith(base) && title===base)) continue;
    const codename = title.match(/^GPT-[\d.]+\s+(.+)$/)?.[1];
    const aliases = [title, ...(base && baseIsUnique ? [base] : []), ...(codename ? [codename] : [])];
    const evidence = launch.evidence;
    const related = items.filter(p=>evidence.some(e=>e.signal_id===p.id) || aliases.some(a=>matches(textOf(p),a)));
    const posts = related.map(p=>postOf(p,now)).sort((a,b)=>Number(!evidence.some(e=>e.signal_id===a.id&&e.official))-Number(!evidence.some(e=>e.signal_id===b.id&&e.official)) || Date.parse(b.published_at)-Date.parse(a.published_at));
    const official = launch.confirmation==='official';
    const trend = trends.find(t=>aliases.some(a=>matches(t.name,a)||matches(a,t.name)));
    const head = evidence.find(e=>e.official) ?? evidence[0];
    if (!head || !safeEvidenceUrl(head.url)) continue;
    related.forEach(p=>covered.add(p.id));
    events.push({id:launch.id,title,kind:official?'launch':'topic',confirmation:launch.confirmation,importance:official?Math.max(90,launch.importance):Math.min(78,launch.importance),alert:official,
      summary:head.summary.slice(0,300),why:official?'First-party announcement. Important even before engagement builds.':'Launch discussion; not an official confirmation.',
      published_at:head.published_at,first_seen_at:now.toISOString(),last_seen_at:now.toISOString(),url:head.url,posts:posts.slice(0,12),author_count:authors(posts),...(trend?{trend_rank:trend.rank}:{})});
  }
  for (const trend of trends.slice(0,50)) {
    if (events.some(e=>matches(e.title,trend.name) || e.posts.some(p=>matches(p.title,trend.name)))) continue;
    const related = items.filter(p=>matches(textOf(p),trend.name));
    const relevant = related.some(p=>(typeof p.score==='object' && (p.score.relevance ?? 0)>0) || keywords.some(k=>matches(textOf(p),k))) || keywords.some(k=>matches(trend.name,k));
    if (!relevant || !related.length) continue;
    const posts = related.map(p=>postOf(p,now));
    const count = authors(posts); const important = count>=3 && trend.rank<=10;
    events.push({id:`topic:${normalized(trend.name).replaceAll(' ','-')}`,title:trend.name,kind:'topic',confirmation:'unverified',importance:important?82:55,alert:important,
      summary:posts[0].title,why:`Topic board #${trend.rank}; ${count} distinct authors in our collected sample. Not a measurement of all X.`,
      published_at:posts[0].published_at,first_seen_at:now.toISOString(),last_seen_at:now.toISOString(),url:posts[0].url,posts:posts.slice(0,12),author_count:count,trend_rank:trend.rank});
  }
  for (const item of items) {
    const sample = growth.get(item.id);
    if (!sample || sample.per_minute<20 || sample.delta<100 || covered.has(item.id)) continue;
    if (!(typeof item.score==='object' && (item.score.relevance ?? 0)>0) && !keywords.some(k=>matches(textOf(item),k))) continue;
    const post = postOf(item,now);
    events.push({id:`breakout:${item.id}`,title:post.title.slice(0,120),kind:'breakout',confirmation:'corroborated',importance:sample.per_minute>=100?95:80,alert:true,
      summary:post.title,why:`${sample.delta} additional public engagements across ${Math.round(sample.minutes)} minutes. Two measured snapshots.`,
      published_at:post.published_at,first_seen_at:now.toISOString(),last_seen_at:now.toISOString(),url:post.url,posts:[post],author_count:1,growth_per_minute:sample.per_minute});
  }
  return events.sort((a,b)=>b.importance-a.importance || Date.parse(b.published_at)-Date.parse(a.published_at)).slice(0,60);
}
