import type { XWatchCategory, XWatchedCreator } from "./x-watchlist.ts";

const X_RECENT_SEARCH_URL = "https://api.x.com/2/tweets/search/recent";
const X_SELF_SERVE_QUERY_LIMIT = 512;
const MAX_RESPONSE_BYTES = 4_000_000;

type OfficialXMetrics = {
  likes?: number;
  replies?: number;
  reposts?: number;
  quotes?: number;
  bookmarks?: number;
  views?: number;
};

export type OfficialXPost = {
  id: string;
  body: string;
  source_url: string;
  published_at: string;
  creator: {
    username: string;
    display_name: string;
    avatar_url?: string;
    category: XWatchCategory;
    organization?: string;
  };
  media?: Array<{
    type: "photo" | "video" | "animated_gif";
    preview_url: string;
    alt_text?: string;
    width?: number;
    height?: number;
  }>;
  observed_metrics?: OfficialXMetrics;
};

export function resolveXCollectionPolicy(environment: Record<string, string | undefined>) {
  const rawToken = environment.X_API_BEARER_TOKEN ?? environment.XV_X_BEARER_TOKEN ?? "";
  const bearerToken = rawToken.trim();
  const allowCompatibilityFallback = environment.X_UNOFFICIAL_FALLBACK_ENABLED?.trim().toLowerCase() !== "false";
  if (bearerToken && bearerToken.length <= 4_096) {
    return {
      mode: "official" as const,
      bearer_token: bearerToken,
      allow_compatibility_fallback: allowCompatibilityFallback,
    };
  }
  return allowCompatibilityFallback
    ? { mode: "compatibility" as const, allow_compatibility_fallback: true as const }
    : { mode: "unavailable" as const, allow_compatibility_fallback: false as const };
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedMetric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(value, 1_000_000_000_000)
    : undefined;
}

function safeXImageUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2_048) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "pbs.twimg.com") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function cleanText(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    // Keep line feeds, remove external control characters.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 4_000);
}

export function buildXRecentSearchQueries(handles: readonly string[], maximumLength = X_SELF_SERVE_QUERY_LIMIT) {
  const suffix = " -is:retweet -is:reply";
  const limit = Math.max(64, Math.min(X_SELF_SERVE_QUERY_LIMIT, Math.floor(maximumLength)));
  const terms = Array.from(new Set(handles
    .map((handle) => handle.replace(/^@/, ""))
    .filter((handle) => /^[A-Za-z0-9_]{1,15}$/.test(handle))))
    .map((handle) => `from:${handle}`);
  const queries: string[] = [];
  let group: string[] = [];
  for (const term of terms) {
    const candidate = `(${[...group, term].join(" OR ")})${suffix}`;
    if (candidate.length > limit && group.length) {
      queries.push(`(${group.join(" OR ")})${suffix}`);
      group = [term];
    } else {
      group.push(term);
    }
  }
  if (group.length) queries.push(`(${group.join(" OR ")})${suffix}`);
  return queries;
}

function normalizeMedia(value: unknown) {
  const media = recordValue(value);
  const type = media?.type;
  if (!media || !["photo", "video", "animated_gif"].includes(String(type))) return null;
  const previewUrl = safeXImageUrl(type === "photo" ? media.url : media.preview_image_url);
  if (!previewUrl) return null;
  const altText = cleanText(media.alt_text).replace(/\n+/g, " ").slice(0, 500);
  const width = boundedMetric(media.width);
  const height = boundedMetric(media.height);
  return {
    type: type as "photo" | "video" | "animated_gif",
    preview_url: previewUrl,
    ...(altText ? { alt_text: altText } : {}),
    ...(width && width <= 10_000 ? { width } : {}),
    ...(height && height <= 10_000 ? { height } : {}),
  };
}

function normalizeOfficialPayload(payload: unknown, watchedCreators: readonly XWatchedCreator[]) {
  const root = recordValue(payload);
  const includes = recordValue(root?.includes);
  const rawUsers = Array.isArray(includes?.users) ? includes.users : [];
  const rawMedia = Array.isArray(includes?.media) ? includes.media : [];
  const users = new Map(rawUsers.flatMap((value) => {
    const user = recordValue(value);
    return typeof user?.id === "string" ? [[user.id, user] as const] : [];
  }));
  const media = new Map(rawMedia.flatMap((value) => {
    const item = recordValue(value);
    return typeof item?.media_key === "string" ? [[item.media_key, item] as const] : [];
  }));
  const watchedByHandle = new Map(watchedCreators.map((creator) => [creator.handle.toLocaleLowerCase("en-US"), creator]));
  const rawPosts = Array.isArray(root?.data) ? root.data : [];

  return rawPosts.flatMap((value): OfficialXPost[] => {
    const post = recordValue(value);
    if (!post) return [];
    const id = post?.id;
    const authorId = post?.author_id;
    const body = cleanText(post?.text);
    const createdAt = post?.created_at;
    if (
      typeof id !== "string" || !/^\d{5,25}$/.test(id) ||
      typeof authorId !== "string" || !body || typeof createdAt !== "string" ||
      !Number.isFinite(Date.parse(createdAt))
    ) return [];
    const references = Array.isArray(post.referenced_tweets) ? post.referenced_tweets : [];
    if (references.some((reference) => {
      const type = recordValue(reference)?.type;
      return type === "retweeted" || type === "replied_to";
    })) return [];

    const user = users.get(authorId);
    const rawUsername = user?.username;
    if (typeof rawUsername !== "string") return [];
    const watchedCreator = watchedByHandle.get(rawUsername.toLocaleLowerCase("en-US"));
    if (!watchedCreator) return [];
    const displayName = cleanText(user?.name).replace(/\n+/g, " ").slice(0, 80) || watchedCreator.name;
    const avatarUrl = safeXImageUrl(user?.profile_image_url);
    const metrics = recordValue(post.public_metrics);
    const observedMetrics = metrics ? {
      ...(boundedMetric(metrics.like_count) !== undefined ? { likes: boundedMetric(metrics.like_count) } : {}),
      ...(boundedMetric(metrics.reply_count) !== undefined ? { replies: boundedMetric(metrics.reply_count) } : {}),
      ...(boundedMetric(metrics.retweet_count) !== undefined ? { reposts: boundedMetric(metrics.retweet_count) } : {}),
      ...(boundedMetric(metrics.quote_count) !== undefined ? { quotes: boundedMetric(metrics.quote_count) } : {}),
      ...(boundedMetric(metrics.bookmark_count) !== undefined ? { bookmarks: boundedMetric(metrics.bookmark_count) } : {}),
      ...(boundedMetric(metrics.impression_count) !== undefined ? { views: boundedMetric(metrics.impression_count) } : {}),
    } : undefined;
    const attachments = recordValue(post.attachments);
    const mediaKeys = Array.isArray(attachments?.media_keys) ? attachments.media_keys.slice(0, 4) : [];
    const normalizedMedia = mediaKeys.flatMap((key) => {
      if (typeof key !== "string") return [];
      const item = normalizeMedia(media.get(key));
      return item ? [item] : [];
    });
    return [{
      id,
      body,
      source_url: `https://x.com/${watchedCreator.handle}/status/${id}`,
      published_at: new Date(Date.parse(createdAt)).toISOString(),
      creator: {
        username: `@${watchedCreator.handle}`,
        display_name: displayName,
        category: watchedCreator.category,
        ...(watchedCreator.organization ? { organization: watchedCreator.organization } : {}),
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      },
      ...(normalizedMedia.length ? { media: normalizedMedia } : {}),
      ...(observedMetrics && Object.keys(observedMetrics).length ? { observed_metrics: observedMetrics } : {}),
    }];
  });
}

async function readBoundedJson(response: Response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new Error("X API response exceeded the configured size bound.");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw new Error("X API response exceeded the configured size bound.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("X API returned invalid JSON.");
  }
}

export async function fetchOfficialXRecentPosts(options: {
  bearerToken: string;
  watchedCreators: readonly XWatchedCreator[];
  fetchImpl?: typeof fetch;
}) {
  const bearerToken = options.bearerToken.trim();
  if (!bearerToken || bearerToken.length > 4_096) throw new Error("A valid server-side X API bearer token is required.");
  const fetchImpl = options.fetchImpl ?? fetch;
  const queries = buildXRecentSearchQueries(options.watchedCreators.map((creator) => creator.handle));
  const settled = await Promise.allSettled(queries.map(async (query) => {
    const url = new URL(X_RECENT_SEARCH_URL);
    url.searchParams.set("query", query);
    url.searchParams.set("max_results", "100");
    url.searchParams.set("sort_order", "recency");
    url.searchParams.set("tweet.fields", "attachments,author_id,created_at,public_metrics,referenced_tweets");
    url.searchParams.set("expansions", "author_id,attachments.media_keys");
    url.searchParams.set("user.fields", "name,profile_image_url,username");
    url.searchParams.set("media.fields", "alt_text,height,media_key,preview_image_url,type,url,width");
    const response = await fetchImpl(url.toString(), {
      headers: { accept: "application/json", authorization: `Bearer ${bearerToken}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`X API returned ${response.status}.`);
    return normalizeOfficialPayload(await readBoundedJson(response), options.watchedCreators);
  }));
  const posts = settled
    .flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .filter((post, index, all) => all.findIndex((candidate) => candidate.source_url === post.source_url) === index)
    .sort((left, right) => Date.parse(right.published_at) - Date.parse(left.published_at));
  return {
    posts,
    request_count: queries.length,
    failed_requests: settled.filter((result) => result.status === "rejected").length,
  };
}
