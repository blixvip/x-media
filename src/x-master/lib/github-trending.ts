export type TrendingRepo = { rank: number; full_name: string; url: string; description: string; language: string; stars?: number; stars_today?: number };
export type GitHubTrending = { generated_at: string | null; status: 'live' | 'stale' | 'unavailable'; repos: TrendingRepo[]; refresh_after_seconds: number };
const decode = (value: string) => value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&(?:amp|lt|gt|quot|#39);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[entity] ?? entity).replace(/\s+/g, ' ').trim();
const count = (value?: string) => value && /^[\d,]+$/.test(value) ? Number(value.replaceAll(',', '')) : undefined;

export function parseGitHubTrending(html: string): TrendingRepo[] {
  if (html.length > 1_500_000) throw new Error('GitHub page too large');
  const repos: TrendingRepo[] = [];
  for (const match of html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)) {
    const fragment = match[0];
    const heading = fragment.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? '';
    const fullName = heading.match(/href="\/([A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+)"/)?.[1];
    if (!fullName || repos.some(repo => repo.full_name === fullName)) continue;
    const starsAnchor = [...fragment.matchAll(/<a\b[^>]*href="([^"<>]+)"[^>]*>([\s\S]*?)<\/a>/gi)].find(a => a[1] === `/${fullName}/stargazers`);
    const stars = count(starsAnchor ? decode(starsAnchor[2]) : undefined);
    const daily = count(decode(fragment).match(/([\d,]+) stars today/)?.[1]);
    repos.push({ rank: repos.length + 1, full_name: fullName, url: `https://github.com/${fullName}`,
      description: decode(fragment.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '').slice(0, 500),
      language: decode(fragment.match(/itemprop="programmingLanguage"[^>]*>([^<]*)</)?.[1] ?? '').slice(0, 50),
      ...(stars !== undefined ? { stars } : {}), ...(daily !== undefined ? { stars_today: daily } : {}) });
    if (repos.length >= 25) break;
  }
  return repos;
}

export function createGitHubTrendingObserver(fetchImpl: typeof fetch = fetch, now: () => number = Date.now) {
  let cache: GitHubTrending | undefined;
  let expires = 0;
  let pending: Promise<GitHubTrending> | undefined;
  return async function observe(): Promise<GitHubTrending> {
    if (cache && now() < expires) return cache;
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await fetchImpl('https://github.com/trending?since=daily', { headers: { accept: 'text/html', 'user-agent': 'ViralityTracker/1.0' }, redirect: 'error', signal: AbortSignal.timeout(8000) });
        if (!response.ok || !response.body) throw new Error('GitHub unavailable');
        const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
        try {
          while (true) { const {done,value} = await reader.read(); if (done) break; size += value.length; if (size > 1_500_000) { await reader.cancel(); throw new Error('GitHub page too large'); } chunks.push(value); }
        } finally { reader.releaseLock(); }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        const repos = parseGitHubTrending(new TextDecoder().decode(bytes));
        if (!repos.length) throw new Error('GitHub layout unavailable');
        cache = { generated_at: new Date(now()).toISOString(), status: 'live', repos, refresh_after_seconds: 600 };
      } catch {
        cache = { generated_at: cache?.generated_at ?? null, repos: cache?.repos ?? [], status: cache?.repos.length ? 'stale' : 'unavailable', refresh_after_seconds: 60 };
      }
      expires = now() + cache.refresh_after_seconds * 1000;
      return cache;
    })().finally(() => { pending = undefined; });
    return pending;
  };
}
