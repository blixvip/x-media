export type FeedLane = 'x' | 'public';
export type FeedFilter = 'all' | 'x' | 'hacker_news' | 'github' | 'news';
export type MainFeedItem = {
  id: string; lane: FeedLane; source: string; url: string; title: string; body: string;
  author: string; handle: string; avatar?: string; image?: string; imageAlt?: string;
  publishedAt: number | null; observedAt: number; metrics: Record<string, number>;
};
const metricNames = ['likes', 'replies', 'reposts', 'views', 'points', 'comments', 'stars', 'forks', 'downloads'];
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, limit = 500) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

export function safeFeedUrl(value: unknown): string | undefined {
  try {
    const url = new URL(text(value, 4000));
    if (url.protocol !== 'https:' || url.username || url.password) return;
    if (['twitter.com', 'www.twitter.com', 'www.x.com'].includes(url.hostname)) url.hostname = 'x.com';
    url.hash = '';
    return url.href;
  } catch { return; }
}
function safeImage(value: unknown) {
  const url = safeFeedUrl(value);
  if (!url) return;
  return ['pbs.twimg.com', 'abs.twimg.com', 'avatars.githubusercontent.com'].includes(new URL(url).hostname) ? url : undefined;
}

export function normalizeFeed(value: unknown, lane: FeedLane): MainFeedItem[] {
  const root = record(value);
  const observedAt = Date.parse(text(root.generated_at));
  if (!Array.isArray(root.items) || !Number.isFinite(observedAt)) throw new Error('Invalid feed response');
  return root.items.slice(0, 500).flatMap(value => {
    const item = record(value);
    const url = safeFeedUrl(item.source_url);
    const title = text(item.title, 2000);
    if (!url || !title || !text(item.id)) return [];
    const creator = record(item.creator);
    const metrics: Record<string, number> = {};
    for (const name of metricNames) {
      const count = record(item.observed_metrics)[name];
      if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) metrics[name] = count;
    }
    const published = Date.parse(text(item.published_at));
    const age = item.age_seconds;
    const publishedAt = Number.isFinite(published) ? published : typeof age === 'number' && Number.isFinite(age) && age >= 0 && age <= 315_576_000 ? observedAt - age * 1000 : null;
    const media = Array.isArray(item.media) ? item.media.map(record).find(m => m.type === 'photo' && safeImage(m.preview_url)) : undefined;
    return [{ id: `${lane}:${text(item.id, 200)}`, lane, source: lane === 'x' ? 'x' : text(item.source, 80) || 'news', url,
      title, body: text(item.body, 8000), author: text(creator.display_name, 120) || text(creator.username, 120), handle: text(creator.username, 120),
      avatar: safeImage(creator.avatar_url), image: safeImage(media?.preview_url), imageAlt: text(media?.alt_text, 500),
      publishedAt, observedAt, metrics }];
  });
}

/** Only newer observations replace counts; preserve the first-known publication time. */
export function mergeFeed(previous: MainFeedItem[], incoming: MainFeedItem[]): MainFeedItem[] {
  const items = new Map(previous.map(item => [item.url, item]));
  for (const item of incoming) {
    const old = items.get(item.url);
    if (!old) items.set(item.url, item);
    else if (item.observedAt > old.observedAt) items.set(item.url, { ...item, id: old.id, publishedAt: old.publishedAt ?? item.publishedAt });
  }
  return [...items.values()].sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0) || a.id.localeCompare(b.id)).slice(0, 300);
}
export function filterFeed(items: MainFeedItem[], filter: FeedFilter) {
  return items.filter(item => filter === 'all' || (filter === 'news' ? !['x', 'hacker_news', 'github'].includes(item.source) : item.source === filter));
}
export function parseFeedFilter(value: string | null): FeedFilter {
  return ['x', 'hacker_news', 'github', 'news'].includes(value ?? '') ? value as FeedFilter : 'all';
}
export function sourceName(source: string) {
  const names: Record<string, string> = { x: 'X', hacker_news: 'Hacker News', github: 'GitHub', bluesky: 'Bluesky', youtube: 'YouTube', hugging_face: 'Hugging Face', gitee: 'Gitee', feed_openai: 'OpenAI', feed_deepmind: 'Google DeepMind', feed_huggingface_blog: 'Hugging Face', feed_mistral: 'Mistral', feed_microsoft: 'Microsoft', feed_google_ai: 'Google AI', feed_google_research: 'Google Research', status_openai: 'OpenAI Status', status_anthropic: 'Claude Status', feed_arxiv: 'arXiv' };
  return names[source] ?? source.replace(/^feed_/, '').replaceAll('_', ' ');
}

export const FEED_SAVED_KEY = 'virality-tracker:feed-saved:v1';
export function parseFeedSaved(raw: string | null): MainFeedItem[] {
  try {
    const values: unknown = JSON.parse(raw ?? 'null');
    if (!Array.isArray(values)) return [];
    return values.slice(0, 200).flatMap(value => {
      const item = record(value);
      const lane = item.lane === 'x' ? 'x' : 'public';
      if (typeof item.observedAt !== 'number' || !Number.isFinite(item.observedAt) || Math.abs(item.observedAt) > 8.64e15) return [];
      return normalizeFeed({ generated_at: new Date(item.observedAt).toISOString(), items: [{
        ...item, id: text(item.id).replace(/^(x|public):/, ''), source_url: item.url,
        published_at: typeof item.publishedAt === 'number' && Number.isFinite(item.publishedAt) && Math.abs(item.publishedAt) <= 8.64e15 ? new Date(item.publishedAt).toISOString() : undefined,
        observed_metrics: item.metrics, creator: { display_name: item.author, username: item.handle, avatar_url: item.avatar },
        media: item.image ? [{ type: 'photo', preview_url: item.image, alt_text: item.imageAlt }] : [],
      }] }, lane);
    });
  } catch { return []; }
}
