import type { MainFeedItem } from './main-feed';

export type HubTopic = { id: string; title: string; posts: MainFeedItem[]; authors: number };
export type HubActivity = { id: string; kind: 'post' | 'metric'; item: MainFeedItem; metric?: string; delta?: number; at: number };
const entities = ['Claude', 'Codex', 'Cursor', 'OpenClaw', 'ChatGPT', 'GPT-6', 'Astra', 'Gemini', 'Grok', 'Llama', 'Qwen', 'DeepSeek', 'Mistral', 'Replit', 'Lovable', 'Vercel', 'Supabase', 'Bun', 'React', 'MCP', 'TypeScript', 'Rust', 'YC', 'funding', 'agents'];
const authorKey = (item: MainFeedItem) => `${item.source}:${(item.handle || item.author).replace(/^@/, '').toLowerCase()}`;
export const isHubStreamItem = (item: MainFeedItem) => !(item.source === 'github' && item.id.startsWith('public:github-repository-'));
export const isRecentHubItem = (item: MainFeedItem, now = Date.now()) => item.source !== 'x' ||
  (item.publishedAt !== null && Number.isFinite(item.publishedAt) && item.publishedAt > now - 48 * 3600_000 && item.publishedAt <= now + 300_000);

/** Topic counts describe this collected sample, never platform-wide volume. */
export function buildHubTopics(items: MainFeedItem[], now = Date.now()): HubTopic[] {
  const byUrl = new Map<string, MainFeedItem>();
  for (const item of items) if (!byUrl.has(item.url) && item.publishedAt !== null && now - item.publishedAt < 48 * 3600_000 && item.publishedAt <= now + 300_000) byUrl.set(item.url, item);
  const unique = [...byUrl.values()];
  const topics = entities.flatMap(title => {
    const pattern = new RegExp(`\\b${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const posts = unique.filter(item => pattern.test(`${item.title} ${item.body}`));
    const authors = new Set(posts.filter(item => item.handle || item.author).map(authorKey)).size;
    return authors >= 2 ? [{ id: title.toLowerCase(), title, posts, authors }] : [];
  });
  // Combine a named model and its codename only when the collected text ties them together.
  const model = topics.find(topic => topic.id === 'gpt-6');
  const codename = topics.find(topic => topic.id === 'astra');
  const linked = model?.posts.filter(post => /\bGPT-6\s+Astra\b/i.test(`${post.title} ${post.body}`)) ?? [];
  if (model && codename && new Set(linked.map(authorKey)).size >= 2 && linked.length >= Math.min(model.posts.length, codename.posts.length) / 2) {
    model.id = 'gpt-6-astra'; model.title = 'GPT-6 Astra';
    model.posts = [...new Map([...model.posts, ...codename.posts].map(post => [post.url, post])).values()];
    model.authors = new Set(model.posts.filter(post => post.handle || post.author).map(authorKey)).size;
    topics.splice(topics.indexOf(codename), 1);
  }
  return topics.sort((a, b) => b.authors - a.authors || b.posts.length - a.posts.length).slice(0, 12);
}

/** No baseline means no delta; repeat snapshots produce no events. */
export function buildHubActivity(previous: MainFeedItem[], incoming: MainFeedItem[]): HubActivity[] {
  const known = new Map(previous.map(item => [item.url, item]));
  const events: HubActivity[] = [];
  for (const item of new Map(incoming.map(item => [item.url, item])).values()) {
    const old = known.get(item.url);
    if (!old) { events.push({ id: `post:${item.url}`, kind: 'post', item, at: item.observedAt }); continue; }
    if (item.observedAt <= old.observedAt || item.observedAt - old.observedAt > 3600_000) continue;
    for (const [metric, value] of Object.entries(item.metrics)) {
      const before = old.metrics[metric];
      if (!Number.isSafeInteger(value) || !Number.isSafeInteger(before) || before < 0 || value < 0 || before === value) continue;
      events.push({ id: `${item.url}:${metric}:${item.observedAt}`, kind: 'metric', item, metric, delta: value - before, at: item.observedAt });
    }
  }
  return events.sort((a, b) => b.at - a.at).slice(0, 60);
}
