export type LiveXTrend = {
  rank: number;
  name: string;
  query: string;
  url: string;
  is_hashtag: boolean;
};

export type StoredXTrend = LiveXTrend & {
  first_seen_at: string;
  last_seen_at: string;
};

export type MarkedXTrend = StoredXTrend & {
  status: "trending_now" | "active_now" | "earlier_today";
  is_current: boolean;
};

type TrendPost = {
  id: string;
  title: string;
  body?: string;
  source_url: string;
};

const DAY_MS = 24 * 60 * 60 * 1_000;
const FUTURE_GRACE_MS = 5 * 60 * 1_000;
const STOP_WORDS = new Set(["about", "after", "again", "from", "into", "news", "that", "the", "their", "this", "today", "with"]);

function identity(name: string) {
  return name.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

function normalizeText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isSafeXSearchUrl(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "x.com" || url.hostname === "www.x.com") && url.pathname === "/search";
  } catch {
    return false;
  }
}

function validDate(value: unknown, nowMs: number) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed > nowMs + FUTURE_GRACE_MS) return null;
  return new Date(parsed).toISOString();
}

function sanitizeLiveTrend(value: unknown): LiveXTrend | null {
  if (!value || typeof value !== "object") return null;
  const trend = value as Partial<LiveXTrend>;
  const name = typeof trend.name === "string" ? trend.name.trim() : "";
  if (!name || name.length > 140 || !Number.isInteger(trend.rank) || (trend.rank ?? 0) < 1 || (trend.rank ?? 0) > 500 || !isSafeXSearchUrl(trend.url)) return null;
  return {
    rank: trend.rank as number,
    name,
    query: typeof trend.query === "string" && trend.query.length <= 500 ? trend.query : encodeURIComponent(name),
    url: trend.url as string,
    is_hashtag: trend.is_hashtag === true || name.startsWith("#"),
  };
}

function sameLocalDay(leftMs: number, rightMs: number) {
  return new Date(leftMs).toDateString() === new Date(rightMs).toDateString();
}

export function mergeTrendHistory(
  liveTrends: readonly LiveXTrend[],
  storedTrends: readonly unknown[],
  nowIso: string,
  maxItems = 100,
): { history: StoredXTrend[]; marked: MarkedXTrend[] } {
  const parsedNow = Date.parse(nowIso);
  const nowMs = Number.isFinite(parsedNow) ? parsedNow : Date.now();
  const canonicalNow = new Date(nowMs).toISOString();
  const storedByName = new Map<string, StoredXTrend>();

  for (const value of storedTrends) {
    const trend = sanitizeLiveTrend(value);
    if (!trend || storedByName.has(identity(trend.name))) continue;
    const record = value as Partial<StoredXTrend>;
    const firstSeen = validDate(record.first_seen_at, nowMs);
    const lastSeen = validDate(record.last_seen_at, nowMs);
    if (!firstSeen || !lastSeen || nowMs - Date.parse(lastSeen) > DAY_MS || !sameLocalDay(Date.parse(lastSeen), nowMs)) continue;
    storedByName.set(identity(trend.name), { ...trend, first_seen_at: firstSeen, last_seen_at: lastSeen });
  }

  const currentNames = new Set<string>();
  const current: MarkedXTrend[] = [];
  for (const value of liveTrends) {
    const trend = sanitizeLiveTrend(value);
    if (!trend) continue;
    const key = identity(trend.name);
    if (currentNames.has(key)) continue;
    currentNames.add(key);
    const previous = storedByName.get(key);
    const record: StoredXTrend = {
      ...trend,
      first_seen_at: previous?.first_seen_at ?? canonicalNow,
      last_seen_at: canonicalNow,
    };
    storedByName.set(key, record);
    current.push({ ...record, status: trend.rank <= 10 ? "trending_now" : "active_now", is_current: true });
  }

  const earlier: MarkedXTrend[] = Array.from(storedByName.entries())
    .filter(([key]) => !currentNames.has(key))
    .map(([, trend]) => ({ ...trend, status: "earlier_today" as const, is_current: false }))
    .sort((left, right) => Date.parse(right.last_seen_at) - Date.parse(left.last_seen_at));
  const marked = [...current.sort((left, right) => left.rank - right.rank), ...earlier].slice(0, Math.max(1, maxItems));
  return {
    marked,
    history: marked.map((trend) => ({
      rank: trend.rank,
      name: trend.name,
      query: trend.query,
      url: trend.url,
      is_hashtag: trend.is_hashtag,
      first_seen_at: trend.first_seen_at,
      last_seen_at: trend.last_seen_at,
    })),
  };
}

export function relatedPostsForTrend<T extends TrendPost>(trendName: string, posts: readonly T[], limit = 3): T[] {
  const phrase = normalizeText(trendName.replace(/^#/, ""));
  if (!phrase) return [];
  const tokens = phrase.split(" ").filter((token) => (token.length >= 3 || /^\d+$/.test(token)) && !STOP_WORDS.has(token));
  if (!tokens.length) return [];

  return posts.filter((post) => {
    const haystack = normalizeText(`${post.title} ${post.body ?? ""}`);
    if (phrase.length >= 4 && haystack.includes(phrase)) return true;
    const words = new Set(haystack.split(" "));
    return tokens.length === 1 ? words.has(tokens[0]) : tokens.every((token) => words.has(token));
  }).slice(0, Math.max(1, limit));
}
