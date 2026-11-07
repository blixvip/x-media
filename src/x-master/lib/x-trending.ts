import type { RadarEvent, RadarPost } from './x-radar-awareness.ts';
import { safeEvidenceUrl } from './x-radar-awareness.ts';
import type { MorningBriefingStory } from './x-radar-briefing.ts';

export type TrendingSort = 'popular' | 'recent' | 'active';
type Counts = { likes?: number; replies?: number; reposts?: number };
export type TrendingPost = {
  id: string; title: string; body?: string; source_url: string; published_at?: string;
  creator?: { username?: string; display_name?: string; avatar_url?: string };
  observed_metrics?: Counts;
};
export type TrendingSnapshot = {
  generated_at: string; items: TrendingPost[];
  awareness?: { events: RadarEvent[] };
  briefing?: MorningBriefingStory[];
};
export type TrendingTopic = {
  id: string; title: string; url: string; publishedAt: string;
  posts: RadarPost[];
  authors: Array<{ name: string; avatar?: string }>;
  interactions: number | null;
  activity: number | null;
};

function total(metrics?: Counts): number | null {
  const values = [metrics?.likes, metrics?.replies, metrics?.reposts];
  if (!values.every(value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)) return null;
  const sum = (values as number[]).reduce((result, value) => result + value, 0);
  return Number.isSafeInteger(sum) ? sum : null;
}

/** Topic candidates come from existing story grouping, never a fabricated trend list. */
export function buildTrendingTopics(current: TrendingSnapshot, previous?: TrendingSnapshot, now = Date.now()): TrendingTopic[] {
  const at = Date.parse(current.generated_at);
  if (!Number.isFinite(at)) return [];
  const postsById = new Map(current.items.map(post => [post.id, post]));
  const previousByUrl = new Map(previous?.items.map(post => [post.source_url, post]));
  const gap = previous ? (at - Date.parse(previous.generated_at)) / 60000 : 0;
  const canMeasure = Number.isFinite(gap) && gap >= 1 && gap <= 5 && now - at <= 300000 && at <= now + 5000;
  const events = current.awareness?.events ?? [];
  const covered = new Set(events.flatMap(event => event.posts.map(post => post.id)));
  const candidates = [
    ...events.map(event => ({ id: event.id, title: event.title, url: event.url, publishedAt: event.published_at, posts: event.posts })),
    ...(current.briefing ?? []).filter(story => !story.post_ids.some(id => covered.has(id))).map(story => ({
      id: story.id, title: story.title, url: story.top_post_url,
      publishedAt: new Date(at - Math.max(0, Number.isFinite(story.latest_age_seconds) ? story.latest_age_seconds : 0) * 1000).toISOString(),
      posts: story.post_ids.flatMap(id => {
        const post = postsById.get(id);
        return post ? [{ id, title: post.body ?? post.title, url: post.source_url, author: post.creator?.username ?? post.creator?.display_name ?? 'Source', published_at: post.published_at ?? current.generated_at }] : [];
      }),
    })),
  ];
  const topics = new Map<string, typeof candidates[number]>();
  for (const candidate of candidates) {
    const time = Date.parse(candidate.publishedAt);
    if (!candidate.title.trim() || !safeEvidenceUrl(candidate.url) || !Number.isFinite(time) || time < now - 7 * 86400000 || time > now + 300000) continue;
    const key = candidate.title.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    const existing = topics.get(key);
    if (existing) existing.posts.push(...candidate.posts);
    else topics.set(key, { ...candidate, posts: [...candidate.posts] });
  }
  return [...topics.values()].map(topic => {
    const seen = new Set<string>();
    const posts = topic.posts.filter(post => {
      const url = safeEvidenceUrl(post.url);
      if (!url || seen.has(url)) return false;
      seen.add(url); return true;
    });
    const authors = new Map<string, TrendingTopic['authors'][number]>();
    let interactions = 0, measured = 0, activity = 0, measuredActivity = 0;
    for (const post of posts) {
      const live = postsById.get(post.id);
      const name = live?.creator?.display_name ?? post.author;
      const authorKey = (live?.creator?.username ?? post.author).trim().toLocaleLowerCase();
      if (authorKey && !authors.has(authorKey)) authors.set(authorKey, { name, avatar: live?.creator?.avatar_url });
      // An ID alone must never attach another post's counts to a topic.
      const value = live?.source_url === post.url ? total(live.observed_metrics) : null;
      if (value !== null) { interactions += value; measured++; }
      const before = total(previousByUrl.get(post.url)?.observed_metrics);
      if (canMeasure && value !== null && before !== null && value >= before) {
        activity += (value - before) / gap; measuredActivity++;
      }
    }
    return { ...topic, posts, authors: [...authors.values()], interactions: measured ? interactions : null, activity: measuredActivity ? Math.round(activity * 10) / 10 : null };
  }).filter(topic => topic.posts.length > 0);
}

export function rankTrendingTopics(topics: TrendingTopic[], sort: TrendingSort): TrendingTopic[] {
  return [...topics].sort((a, b) => {
    const recent = Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    if (sort === 'recent') return recent || a.id.localeCompare(b.id);
    const left = sort === 'active' ? a.activity : a.interactions;
    const right = sort === 'active' ? b.activity : b.interactions;
    if (left === null && right !== null) return 1;
    if (right === null && left !== null) return -1;
    return (right ?? 0) - (left ?? 0) || recent || a.id.localeCompare(b.id);
  }).slice(0, 20);
}
