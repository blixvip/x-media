import { observePublicEvidenceHistory, type PublicEvidenceHistory } from "@/x-master/lib/public-evidence-history";
import {
  canonicalPublicEvidenceUrl as canonicalPublicSourceUrl,
  stablePublicEvidenceHash as stableHash,
} from "@/x-master/lib/public-evidence-links";
import { retainLastKnownXSignals, selectRollingXSignals } from "@/x-master/lib/x-radar";
import {
  fetchOfficialXRecentPosts,
  resolveXCollectionPolicy,
  type OfficialXPost,
} from "@/x-master/lib/x-official-api";
import { X_WATCHED_CREATORS, X_WATCHED_HANDLES, type XWatchCategory } from "@/x-master/lib/x-watchlist";

const HACKER_NEWS_API = "https://hacker-news.firebaseio.com/v0";
const HACKER_NEWS_ITEM_URL = "https://news.ycombinator.com/item?id=";
const BLUESKY_PUBLIC_API = "https://public.api.bsky.app/xrpc";
const HUGGING_FACE_API = "https://huggingface.co/api/models";
const GITEE_API = "https://gitee.com/api/v5";
const GITHUB_API = "https://api.github.com";
const YOUTUBE_FEED_API = "https://www.youtube.com/feeds/videos.xml";
const X_GUEST_ACTIVATE_API = "https://api.x.com/1.1/guest/activate.json";
const X_GRAPHQL_API = "https://x.com/i/api/graphql";
const FXTWITTER_PROFILE_API = "https://api.fxtwitter.com/2/profile";
// Public web-client bearer used by X's guest API; it is not an operator secret.
const X_GUEST_BEARER = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const X_USER_QUERY_ID = "G3KGOASz96M-Qu0nwmGXNg";
const X_TIMELINE_QUERY_ID = "V7H0Ap3_Hh2FyS75OCDO3Q";
const MAX_X_JSON_BYTES = 4_000_000;
const CACHE_TTL_MS = 120_000;
const X_RADAR_CACHE_TTL_MS = 60_000;
const MAX_HN_CANDIDATES = 28;
const MAX_ITEMS_PER_SOURCE = 4;
const MAX_SIGNALS = 28;
const MAX_EXACT_LINK_GROUPS = 6;
const MAX_EXACT_LINK_MEMBERS = 8;
const MAX_RELATED_URLS = 4;
const MAX_FEED_BYTES = 1_000_000;
const MAX_JSON_BYTES = 1_000_000;
const MAX_SIGNAL_AGE_SECONDS = 21 * 24 * 60 * 60;
const MAX_X_POST_AGE_SECONDS = 120 * 24 * 60 * 60;
const MAX_BLUESKY_POSTS_PER_CREATOR = 8;
const MAX_BLUESKY_FACETS = 24;
const MAX_BLUESKY_FACET_FEATURES = 8;
const MAX_HUGGING_FACE_MODELS_PER_OWNER = 4;
const MAX_PUBLIC_METRIC_VALUE = 1_000_000_000_000;

export { X_WATCHED_HANDLES };

// Query shape adapted from DevamShah/pravaha's working guest timeline adapter.
const X_TWEET_FEATURES = JSON.stringify({
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  communities_web_enable_tweet_community_results_featuring: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  responsive_web_enhance_cards_enabled: false,
});

const X_USER_FEATURES = JSON.stringify({
  hidden_profile_subscriptions_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  highlights_tweets_tab_ui_enabled: true,
  responsive_web_twitter_article_notes_tab_enabled: true,
  subscriptions_feature_can_gift_premium: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  responsive_web_graphql_timeline_navigation_enabled: true,
});
const X_FIELD_TOGGLES = JSON.stringify({ withArticlePlainText: false });

const YOUTUBE_CHANNELS = [
  { channelId: "UCXZCJLdBC09xxGZ6gcdrc6A", name: "OpenAI" },
  { channelId: "UCrDwWp7EBBv4NwvScIpBDOA", name: "Anthropic" },
  { channelId: "UCP7jMXSY2xbc3KCAE0MHQ-A", name: "Google DeepMind" },
] as const;

const CHINESE_AI_MODEL_OWNERS = [
  { owner: "deepseek-ai", name: "DeepSeek" },
  { owner: "Qwen", name: "Qwen" },
  { owner: "moonshotai", name: "Moonshot AI" },
  { owner: "zai-org", name: "Z.ai" },
] as const;

const GITEE_CHINESE_AI_REPOSITORIES = [
  { owner: "mindspore", name: "mindspore", label: "MindSpore" },
] as const;

const GITHUB_AI_REPOSITORIES = [
  { owner: "openai", name: "codex", label: "OpenAI Codex", topic: "AI coding", niche: "AI coding" },
] as const;

const BLUESKY_CREATORS = [
  {
    did: "did:plc:flxq4uyjfotciovpw3x3fxnu",
    handle: "emollick.bsky.social",
    name: "Ethan Mollick",
  },
  {
    did: "did:plc:7chsbgw6o6oh5oiglpgc3467",
    handle: "hardmaru.bsky.social",
    name: "hardmaru",
  },
  {
    did: "did:plc:kft6lu4trxowqmter2b6vg6z",
    handle: "simonwillison.net",
    name: "Simon Willison",
  },
  {
    did: "did:plc:3tmaleaxipegsectvamyrkyi",
    handle: "mmitchell.bsky.social",
    name: "Margaret Mitchell",
  },
] as const;

const PUBLIC_FEEDS = [
  {
    id: "openai_news",
    label: "OpenAI News",
    url: "https://openai.com/news/rss.xml",
    format: "rss",
    source: "feed_openai",
    creator: "OpenAI",
    coverage: "official OpenAI news feed",
    allowedHosts: ["openai.com"],
  },
  {
    id: "google_deepmind_news",
    label: "Google DeepMind News",
    url: "https://deepmind.google/blog/rss.xml",
    format: "rss",
    source: "feed_deepmind",
    creator: "Google DeepMind",
    coverage: "official Google DeepMind news feed",
    allowedHosts: ["deepmind.google"],
  },
  {
    id: "hugging_face_blog",
    label: "Hugging Face Blog",
    url: "https://huggingface.co/blog/feed.xml",
    format: "rss",
    source: "feed_huggingface_blog",
    creator: "Hugging Face",
    coverage: "official Hugging Face blog feed",
    allowedHosts: ["huggingface.co"],
  },
  {
    id: "mistral_news",
    label: "Mistral AI News",
    url: "https://mistral.ai/news/rss",
    format: "rss",
    source: "feed_mistral",
    creator: "Mistral AI",
    coverage: "official Mistral AI news feed",
    allowedHosts: ["mistral.ai"],
  },
  {
    id: "microsoft_official_blog",
    label: "Official Microsoft Blog",
    url: "https://blogs.microsoft.com/feed/",
    format: "rss",
    source: "feed_microsoft",
    creator: "Microsoft",
    coverage: "AI-matching posts from the official Microsoft blog feed",
    allowedHosts: ["blogs.microsoft.com"],
    requiresAiMatch: true,
  },
  {
    id: "google_ai_blog",
    label: "Google AI Blog",
    url: "https://blog.google/innovation-and-ai/technology/ai/rss/",
    format: "rss",
    source: "feed_google_ai",
    creator: "Google AI Blog",
    coverage: "AI-matching posts from the official Google AI blog feed",
    allowedHosts: ["blog.google"],
    requiresAiMatch: true,
  },
  {
    id: "google_research_blog",
    label: "Google Research",
    url: "https://research.google/blog/rss/",
    format: "rss",
    source: "feed_google_research",
    creator: "Google Research",
    coverage: "official Google Research blog feed",
    allowedHosts: ["research.google"],
  },
  {
    id: "openai_status",
    label: "OpenAI Status",
    url: "https://status.openai.com/history.rss",
    format: "rss",
    source: "status_openai",
    creator: "OpenAI Status",
    coverage: "official OpenAI incident history",
    allowedHosts: ["status.openai.com"],
  },
  {
    id: "anthropic_status",
    label: "Claude Status",
    url: "https://status.claude.com/history.rss",
    format: "rss",
    source: "status_anthropic",
    creator: "Claude Status",
    coverage: "official Claude incident history",
    allowedHosts: ["status.claude.com"],
  },
  {
    id: "arxiv_ai_papers",
    label: "arXiv AI papers",
    url: "https://export.arxiv.org/api/query?search_query=cat%3Acs.AI&start=0&max_results=4&sortBy=submittedDate&sortOrder=descending",
    format: "atom",
    source: "feed_arxiv",
    creator: "arXiv · cs.AI",
    coverage: "latest cs.AI submissions through the official arXiv API",
    allowedHosts: ["arxiv.org", "export.arxiv.org"],
  },
  {
    id: "openai_codex_releases",
    label: "OpenAI Codex releases",
    url: "https://github.com/openai/codex/releases.atom",
    format: "atom",
    source: "github",
    creator: "openai/codex",
    coverage: "official GitHub release feed",
    allowedHosts: ["github.com"],
    allowedPathPrefix: "/openai/codex/releases/",
    relatedUrl: "https://github.com/openai/codex",
  },
  {
    id: "anthropic_claude_code_releases",
    label: "Claude Code releases",
    url: "https://github.com/anthropics/claude-code/releases.atom",
    format: "atom",
    source: "github",
    creator: "anthropics/claude-code",
    coverage: "official GitHub release feed",
    allowedHosts: ["github.com"],
    allowedPathPrefix: "/anthropics/claude-code/releases/",
    relatedUrl: "https://github.com/anthropics/claude-code",
  },
  {
    id: "google_gemini_cli_releases",
    label: "Gemini CLI releases",
    url: "https://github.com/google-gemini/gemini-cli/releases.atom",
    format: "atom",
    source: "github",
    creator: "google-gemini/gemini-cli",
    coverage: "stable and preview releases from the official GitHub feed",
    allowedHosts: ["github.com"],
    allowedPathPrefix: "/google-gemini/gemini-cli/releases/",
    relatedUrl: "https://github.com/google-gemini/gemini-cli",
    excludeTitleMatch: /\bnightly\b/i,
  },
] as const;

type HackerNewsItem = {
  id?: number;
  by?: string;
  deleted?: boolean;
  dead?: boolean;
  time?: number;
  title?: string;
  type?: string;
  url?: string;
  score?: number;
  descendants?: number;
};

type BlueskyFeedEntry = {
  reason?: unknown;
  post?: {
    uri?: string;
    author?: {
      did?: string;
      handle?: string;
      displayName?: string;
    };
    record?: {
      text?: string;
      createdAt?: string;
      facets?: Array<{
        features?: Array<{ $type?: string; uri?: string }>;
      }>;
      embed?: {
        $type?: string;
        external?: { uri?: string };
        media?: {
          $type?: string;
          external?: { uri?: string };
        };
      };
    };
    embed?: {
      $type?: string;
      external?: { uri?: string };
      media?: {
        $type?: string;
        external?: { uri?: string };
      };
    };
    likeCount?: number;
    replyCount?: number;
    repostCount?: number;
    quoteCount?: number;
  };
};

type HuggingFaceModel = {
  id?: string;
  modelId?: string;
  createdAt?: string;
  lastModified?: string;
  private?: boolean;
  gated?: boolean | string | null;
  downloads?: number;
  likes?: number;
};

type GiteeRepository = {
  id?: number;
  full_name?: string;
  private?: boolean;
  updated_at?: string;
  stargazers_count?: number;
  forks_count?: number;
  watchers_count?: number;
  open_issues_count?: number;
};

type GitHubRepository = {
  id?: number;
  full_name?: string;
  private?: boolean;
  archived?: boolean;
  disabled?: boolean;
  pushed_at?: string;
  stargazers_count?: number;
  forks_count?: number;
  subscribers_count?: number;
  open_issues_count?: number;
};

type PublicMetricName = "points" | "comments" | "likes" | "replies" | "reposts" | "quotes" | "bookmarks" | "views" | "downloads" | "stars" | "forks" | "watchers" | "open_issues";
type PublicMetricSnapshot = Partial<Record<PublicMetricName, number>>;

export type PublicSignal = {
  id: string;
  title: string;
  topic: string;
  niche: string;
  source: string;
  source_url: string;
  related_urls?: string[];
  age_seconds: number;
  scores: { heat: null };
  body?: string;
  published_at?: string;
  creator?: { username?: string; display_name?: string; avatar_url?: string; category?: XWatchCategory; organization?: string };
  media?: Array<{
    type: "photo" | "video" | "animated_gif";
    preview_url: string;
    alt_text?: string;
    width?: number;
    height?: number;
  }>;
  observed_metrics?: PublicMetricSnapshot;
  metric_evidence?: "single_provider_snapshot";
};

type PublicSourceStatus = {
  id: string;
  label: string;
  status: "live" | "degraded";
  coverage: string;
  scoring: "unavailable";
  item_count: number;
  reason?: string;
  provider?: "x_official_api" | "x_compatibility_bridge";
  official?: boolean;
};

type SourceResult = {
  status: PublicSourceStatus;
  items: PublicSignal[];
};

type PublicExactLinkMember = {
  item_id: string;
  title: string;
  lane_id: string;
  lane_label: string;
  source: string;
  source_url: string;
  matched_url: string;
  match_kind: "source_url" | "related_url";
  topic: string;
  niche: string;
  age_seconds: number;
  creator?: { username?: string };
};

type PublicExactLinkGroup = {
  id: string;
  canonical_url: string;
  lane_count: number;
  item_count: number;
  lanes: Array<{ id: string; label: string }>;
  newest_age_seconds: number;
  oldest_age_seconds: number;
  observed_span_seconds: number;
  members: PublicExactLinkMember[];
};

export type PublicSignalsPayload = {
  mode: "public_multi_source";
  generated_at: string;
  refresh_after_seconds: number;
  sources: PublicSourceStatus[];
  items: PublicSignal[];
  exact_link_groups: PublicExactLinkGroup[];
  history?: PublicEvidenceHistory;
};

let cachedPayload: { expiresAt: number; value: PublicSignalsPayload } | null = null;
let pendingPayload: Promise<PublicSignalsPayload> | null = null;
let cachedXRadarPayload: { expiresAt: number; value: XGuestSignalsPayload } | null = null;
let pendingXRadarPayload: Promise<XGuestSignalsPayload> | null = null;

export type XGuestSignalsPayload = {
  generated_at: string;
  refresh_after_seconds: number;
  source: PublicSourceStatus;
  items: PublicSignal[];
  history: PublicEvidenceHistory;
};

const AI_TERMS = /\b(ai|llms?|gpt|openai|anthropic|claude|codex|gemini|deepseek|qwen|kimi|mistral|hugging\s*face|machine learning|language model|neural|inference|agentic|ai agent|vibe cod(?:e|ing)|cursor|copilot|model context protocol|mcp)\b/i;

function decodeText(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: '"',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|quot);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    }
    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    }
    return named[normalized] ?? match;
  });
}

function cleanXmlText(value: string) {
  return decodeText(
    value
      .replace(/^\s*<!\[CDATA\[/, "")
      .replace(/\]\]>\s*$/, "")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function xmlValue(fragment: string, tag: string) {
  const match = fragment.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? cleanXmlText(match[1]) : "";
}

function atomLink(fragment: string) {
  const links = fragment.match(/<link\b[^>]*>/gi) ?? [];
  for (const link of links) {
    const rel = link.match(/\brel=["']([^"']+)["']/i)?.[1];
    const href = link.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (href && (!rel || rel === "alternate")) return decodeText(href);
  }
  return "";
}

function safeSourceUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      !parsed.username && !parsed.password && parsed.toString().length <= 2_048
    ) return parsed.toString();
  } catch {
    // Invalid provider URLs never reach the public result.
  }
  return null;
}

function blueskyRelatedUrls(post: NonNullable<BlueskyFeedEntry["post"]>, sourceUrl: string) {
  const record = post.record;
  const candidates: unknown[] = [];
  if (post.embed?.$type === "app.bsky.embed.external#view") {
    candidates.push(post.embed.external?.uri);
  }
  if (
    post.embed?.$type === "app.bsky.embed.recordWithMedia#view" &&
    post.embed.media?.$type === "app.bsky.embed.external#view"
  ) candidates.push(post.embed.media.external?.uri);
  if (record?.embed?.$type === "app.bsky.embed.external") {
    candidates.push(record.embed.external?.uri);
  }
  if (
    record?.embed?.$type === "app.bsky.embed.recordWithMedia" &&
    record.embed.media?.$type === "app.bsky.embed.external"
  ) candidates.push(record.embed.media.external?.uri);
  const facets = Array.isArray(record?.facets) ? record.facets.slice(0, MAX_BLUESKY_FACETS) : [];
  for (const facet of facets) {
    const features = Array.isArray(facet?.features)
      ? facet.features.slice(0, MAX_BLUESKY_FACET_FEATURES)
      : [];
    for (const feature of features) {
      if (feature.$type === "app.bsky.richtext.facet#link") candidates.push(feature.uri);
    }
  }

  const sourceKey = canonicalPublicSourceUrl(sourceUrl);
  const seen = new Set<string>();
  const relatedUrls: string[] = [];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const safeUrl = safeSourceUrl(candidate);
    const canonicalUrl = safeUrl ? canonicalPublicSourceUrl(safeUrl) : null;
    if (!safeUrl || !canonicalUrl || canonicalUrl === sourceKey || seen.has(canonicalUrl)) continue;
    seen.add(canonicalUrl);
    relatedUrls.push(safeUrl);
    if (relatedUrls.length >= MAX_RELATED_URLS) break;
  }
  return relatedUrls;
}

function classifySignal(title: string) {
  const normalized = title.toLowerCase();
  if (/outage|incident|degrad|unavailable|disrupt|elevated error|error rate|issues? (?:logging|accessing|with)|service status/.test(normalized)) {
    return { topic: "Pricing & outages", niche: "Pricing & outages" };
  }
  if (/codex|claude code|gemini cli|cursor|copilot|vibe cod|coding agent|developer tool/.test(normalized)) {
    return { topic: "AI coding", niche: "AI coding" };
  }
  if (/deepseek|qwen|kimi|glm|modelscope|chinese ai/.test(normalized)) {
    return { topic: "Chinese AI", niche: "Chinese AI" };
  }
  if (/launch|release|announc|introduc|open.?source|new model/.test(normalized)) {
    return { topic: "Models & launches", niche: "Models & launches" };
  }
  if (/agent|mcp|tool use|computer use/.test(normalized)) {
    return { topic: "AI agents", niche: "Coding agents" };
  }
  return { topic: "AI discussion", niche: "Frontier AI" };
}

function ageFromDate(value: string, nowSeconds: number, maximumAgeSeconds = MAX_SIGNAL_AGE_SECONDS) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const age = Math.max(0, nowSeconds - Math.floor(milliseconds / 1_000));
  return age <= maximumAgeSeconds ? age : null;
}

function boundedPublicMetric(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_PUBLIC_METRIC_VALUE
    ? value
    : null;
}

function publicMetricSnapshot(values: Partial<Record<PublicMetricName, unknown>>) {
  const snapshot: PublicMetricSnapshot = {};
  for (const [name, value] of Object.entries(values) as Array<[PublicMetricName, unknown]>) {
    const metric = boundedPublicMetric(value);
    if (metric !== null) snapshot[name] = metric;
  }
  return Object.keys(snapshot).length ? snapshot : null;
}

function normalizeFeedEntry(
  fragment: string,
  feed: (typeof PUBLIC_FEEDS)[number],
  nowSeconds: number,
): PublicSignal | null {
  const title = xmlValue(fragment, "title").slice(0, 280);
  const rawUrl = feed.format === "atom" ? atomLink(fragment) : xmlValue(fragment, "link");
  const sourceUrl = safeSourceUrl(rawUrl);
  const published = feed.format === "atom"
    ? xmlValue(fragment, "published") || xmlValue(fragment, "updated")
    : xmlValue(fragment, "pubDate") || xmlValue(fragment, "date");
  const ageSeconds = ageFromDate(published, nowSeconds);
  const parsedSourceUrl = sourceUrl ? new URL(sourceUrl) : null;
  const sourceHost = parsedSourceUrl?.hostname.toLowerCase() ?? "";
  if (
    !title || !sourceUrl || ageSeconds === null ||
    !(feed.allowedHosts as readonly string[]).includes(sourceHost) ||
    ("allowedPathPrefix" in feed && !parsedSourceUrl?.pathname.startsWith(feed.allowedPathPrefix)) ||
    ("requiresAiMatch" in feed && feed.requiresAiMatch && !AI_TERMS.test(title)) ||
    ("excludeTitleMatch" in feed && feed.excludeTitleMatch.test(title))
  ) return null;
  const relatedUrl = "relatedUrl" in feed ? safeSourceUrl(feed.relatedUrl) : null;
  const relatedUrls = relatedUrl && canonicalPublicSourceUrl(relatedUrl) !== canonicalPublicSourceUrl(sourceUrl)
    ? [relatedUrl]
    : [];
  const classification = classifySignal(`${feed.label} ${title}`);
  return {
    id: `public-${feed.id}-${stableHash(sourceUrl)}`,
    title,
    ...classification,
    source: feed.source,
    source_url: sourceUrl,
    ...(relatedUrls.length ? { related_urls: relatedUrls } : {}),
    age_seconds: ageSeconds,
    scores: { heat: null },
    creator: { username: feed.creator },
  };
}

function parseFeed(text: string, feed: (typeof PUBLIC_FEEDS)[number], nowSeconds: number) {
  const pattern = feed.format === "atom" ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi;
  const items: PublicSignal[] = [];
  for (const match of text.matchAll(pattern)) {
    const item = normalizeFeedEntry(match[0], feed, nowSeconds);
    if (item) items.push(item);
    if (items.length >= MAX_ITEMS_PER_SOURCE) break;
  }
  return items.sort((left, right) => left.age_seconds - right.age_seconds);
}

function normalizeHackerNewsItem(item: HackerNewsItem, nowSeconds: number): PublicSignal | null {
  if (
    item.deleted || item.dead || item.type !== "story" ||
    typeof item.id !== "number" || typeof item.time !== "number" ||
    typeof item.title !== "string" || /\bnon[- ]?ai\b/i.test(item.title) || !AI_TERMS.test(item.title)
  ) return null;

  const title = decodeText(item.title.trim()).slice(0, 280);
  const ageSeconds = Math.max(0, nowSeconds - item.time);
  if (!title || ageSeconds > MAX_SIGNAL_AGE_SECONDS) return null;
  const classification = classifySignal(title);
  const sourceUrl = `${HACKER_NEWS_ITEM_URL}${item.id}`;
  const externalUrl = safeSourceUrl(item.url ?? "");
  const relatedUrls = externalUrl && canonicalPublicSourceUrl(externalUrl) !== canonicalPublicSourceUrl(sourceUrl)
    ? [externalUrl]
    : [];
  const observedMetrics = publicMetricSnapshot({ points: item.score, comments: item.descendants });
  return {
    id: `hn-${item.id}`,
    title,
    ...classification,
    source: "hacker_news",
    source_url: sourceUrl,
    ...(relatedUrls.length ? { related_urls: relatedUrls } : {}),
    age_seconds: ageSeconds,
    scores: { heat: null },
    ...(item.by ? { creator: { username: item.by.slice(0, 80) } } : {}),
    ...(observedMetrics ? { observed_metrics: observedMetrics, metric_evidence: "single_provider_snapshot" as const } : {}),
  };
}

function normalizeBlueskyItem(
  entry: BlueskyFeedEntry,
  creator: (typeof BLUESKY_CREATORS)[number],
  nowSeconds: number,
): PublicSignal | null {
  if (entry.reason !== undefined) return null;
  const post = entry.post;
  const record = post?.record;
  if (
    !post?.uri || !record?.createdAt || typeof record.text !== "string" ||
    post.author?.did !== creator.did || !post.uri.startsWith(`at://${creator.did}/app.bsky.feed.post/`)
  ) return null;

  const rkey = post.uri.slice(`at://${creator.did}/app.bsky.feed.post/`.length);
  if (!/^[a-z0-9._~:-]{1,512}$/i.test(rkey)) return null;
  const title = record.text.replace(/\s+/g, " ").trim().slice(0, 280);
  const ageSeconds = ageFromDate(record.createdAt, nowSeconds);
  if (!title || ageSeconds === null || !AI_TERMS.test(title)) return null;
  const classification = classifySignal(title);
  const sourceUrl = `https://bsky.app/profile/${creator.did}/post/${rkey}`;
  const relatedUrls = blueskyRelatedUrls(post, sourceUrl);
  const observedMetrics = publicMetricSnapshot({
    likes: post.likeCount,
    replies: post.replyCount,
    reposts: post.repostCount,
    quotes: post.quoteCount,
  });
  return {
    id: `bluesky-${stableHash(post.uri)}`,
    title,
    ...classification,
    source: "bluesky",
    source_url: sourceUrl,
    ...(relatedUrls.length ? { related_urls: relatedUrls } : {}),
    age_seconds: ageSeconds,
    scores: { heat: null },
    creator: { username: (post.author.handle || creator.handle).slice(0, 80) },
    ...(observedMetrics ? { observed_metrics: observedMetrics, metric_evidence: "single_provider_snapshot" as const } : {}),
  };
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function xMetricValue(value: unknown) {
  if (typeof value === "string" && /^\d{1,15}$/.test(value)) return Number(value);
  return value;
}

function safeXImageUrl(value: unknown, kind: "avatar" | "media") {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const parsed = new URL(value);
    const allowedPath = kind === "avatar"
      ? parsed.pathname.startsWith("/profile_images/")
      : ["/media/", "/ext_tw_video_thumb/", "/tweet_video_thumb/", "/amplify_video_thumb/"].some((prefix) => parsed.pathname.startsWith(prefix));
    if (
      parsed.protocol === "https:" && parsed.hostname.toLowerCase() === "pbs.twimg.com" &&
      !parsed.username && !parsed.password && allowedPath
    ) return parsed.toString();
  } catch {
    // Invalid external media never reaches the browser.
  }
  return null;
}

function cleanXPostBody(value: unknown) {
  if (typeof value !== "string") return "";
  return decodeText(value)
    .replace(/\r\n?/g, "\n")
    // External post text may contain unsafe ASCII controls; line feeds remain useful formatting.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 4_000);
}

function xCreatorClassification(title: string, watchedCreator: (typeof X_WATCHED_CREATORS)[number]) {
  const classification = classifySignal(title);
  if (classification.topic !== "AI discussion") return classification;
  if (watchedCreator.category === "creator") return { topic: "Creator watch", niche: "Coding creators" };
  if (watchedCreator.category === "executive") return { topic: "Founder watch", niche: "Startup leaders" };
  if (watchedCreator.category === "company") return { topic: "Company watch", niche: "AI startups" };
  return classification;
}

function normalizeOfficialXPost(post: OfficialXPost, nowSeconds: number): PublicSignal | null {
  const watchedCreator = X_WATCHED_CREATORS.find((creator) =>
    creator.handle.toLocaleLowerCase("en-US") === post.creator.username.replace(/^@/, "").toLocaleLowerCase("en-US"),
  );
  const body = cleanXPostBody(post.body);
  const title = body.replace(/\s+/g, " ").slice(0, 280);
  const ageSeconds = ageFromDate(post.published_at, nowSeconds, MAX_X_POST_AGE_SECONDS);
  if (!watchedCreator || !title || ageSeconds === null) return null;
  const observedMetrics = publicMetricSnapshot(post.observed_metrics ?? {});
  return {
    id: `x-${post.id}`,
    title,
    body,
    ...xCreatorClassification(title, watchedCreator),
    source: "x",
    source_url: post.source_url,
    age_seconds: ageSeconds,
    published_at: post.published_at,
    scores: { heat: null },
    creator: post.creator,
    ...(post.media?.length ? { media: post.media } : {}),
    ...(observedMetrics ? { observed_metrics: observedMetrics, metric_evidence: "single_provider_snapshot" as const } : {}),
  };
}

function fxTwitterMedia(value: unknown) {
  const media = recordValue(value);
  const rawItems = Array.isArray(media?.all) ? media.all.slice(0, 4) : [];
  return rawItems.flatMap((rawItem) => {
    const item = recordValue(rawItem);
    const type = item?.type;
    const previewUrl = safeXImageUrl(type === "photo" ? item?.url : item?.thumbnail_url, "media");
    if (!previewUrl || !["photo", "video", "animated_gif"].includes(String(type))) return [];
    const width = boundedPublicMetric(item?.width);
    const height = boundedPublicMetric(item?.height);
    const rawAltText = item?.alt_text ?? item?.altText;
    const altText = typeof rawAltText === "string" ? rawAltText.replace(/\s+/g, " ").trim().slice(0, 500) : "";
    return [{
      type: type as "photo" | "video" | "animated_gif",
      preview_url: previewUrl,
      ...(altText ? { alt_text: altText } : {}),
      ...(width && width <= 10_000 ? { width } : {}),
      ...(height && height <= 10_000 ? { height } : {}),
    }];
  });
}

function normalizeFxTwitterStatus(
  rawStatus: unknown,
  watchedCreator: (typeof X_WATCHED_CREATORS)[number],
  nowSeconds: number,
): PublicSignal | null {
  const status = recordValue(rawStatus);
  const author = recordValue(status?.author);
  const id = status?.id;
  const handle = author?.screen_name;
  if (
    status?.type !== "status" || status?.reposted_by || status?.replying_to ||
    typeof id !== "string" || !/^\d{5,25}$/.test(id) ||
    typeof handle !== "string" || handle.toLowerCase() !== watchedCreator.handle.toLowerCase()
  ) return null;
  const body = cleanXPostBody(status?.text);
  const title = body.replace(/\s+/g, " ").slice(0, 280);
  const createdAt = status?.created_at;
  const ageSeconds = typeof createdAt === "string" ? ageFromDate(createdAt, nowSeconds, MAX_X_POST_AGE_SECONDS) : null;
  if (!title || ageSeconds === null) return null;
  const displayName = typeof author?.name === "string"
    ? author.name.replace(/\s+/g, " ").trim().slice(0, 80)
    : watchedCreator.name;
  const avatarUrl = safeXImageUrl(author?.avatar_url, "avatar");
  const media = fxTwitterMedia(status?.media);
  const observedMetrics = publicMetricSnapshot({
    likes: status?.likes,
    replies: status?.replies,
    reposts: status?.reposts,
    quotes: status?.quotes,
    bookmarks: status?.bookmarks,
    views: status?.views,
  });
  return {
    id: `x-${id}`,
    title,
    body,
    ...xCreatorClassification(title, watchedCreator),
    source: "x",
    source_url: `https://x.com/${handle}/status/${id}`,
    age_seconds: ageSeconds,
    published_at: new Date(Date.parse(createdAt as string)).toISOString(),
    scores: { heat: null },
    creator: {
      username: `@${handle}`,
      display_name: displayName || watchedCreator.name,
      category: watchedCreator.category,
      ...(watchedCreator.organization ? { organization: watchedCreator.organization } : {}),
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    },
    ...(media.length ? { media } : {}),
    ...(observedMetrics ? { observed_metrics: observedMetrics, metric_evidence: "single_provider_snapshot" as const } : {}),
  };
}

async function fetchFxTwitterCreatorTimeline(
  watchedCreator: (typeof X_WATCHED_CREATORS)[number],
  maximumItems: number,
) {
  const url = new URL(`${FXTWITTER_PROFILE_API}/${watchedCreator.handle}/statuses`);
  url.searchParams.set("count", String(Math.max(6, Math.min(20, maximumItems * 3))));
  const payload = recordValue(await fetchFxTwitterJson(url.toString()));
  const results = Array.isArray(payload?.results) ? payload.results.slice(0, 100) : [];
  const nowSeconds = Math.floor(Date.now() / 1_000);
  return results
    .map((result) => normalizeFxTwitterStatus(result, watchedCreator, nowSeconds))
    .filter((item): item is PublicSignal => item !== null)
    .sort((left, right) => left.age_seconds - right.age_seconds || xMomentum(right) - xMomentum(left))
    .slice(0, Math.max(1, Math.min(8, Math.floor(maximumItems))));
}

function xPostMedia(legacy: Record<string, unknown>) {
  const extendedEntities = recordValue(legacy.extended_entities);
  const rawMedia = Array.isArray(extendedEntities?.media) ? extendedEntities.media.slice(0, 4) : [];
  return rawMedia.flatMap((rawItem) => {
    const item = recordValue(rawItem);
    const type = item?.type;
    const previewUrl = safeXImageUrl(item?.media_url_https, "media");
    if (!previewUrl || !["photo", "video", "animated_gif"].includes(String(type))) return [];
    const originalInfo = recordValue(item?.original_info);
    const width = boundedPublicMetric(originalInfo?.width);
    const height = boundedPublicMetric(originalInfo?.height);
    const altText = typeof item?.ext_alt_text === "string"
      ? item.ext_alt_text.replace(/\s+/g, " ").trim().slice(0, 500)
      : "";
    return [{
      type: type as "photo" | "video" | "animated_gif",
      preview_url: previewUrl,
      ...(altText ? { alt_text: altText } : {}),
      ...(width && width <= 10_000 ? { width } : {}),
      ...(height && height <= 10_000 ? { height } : {}),
    }];
  });
}

function normalizeXGuestTweet(
  rawResult: Record<string, unknown>,
  watchedCreator: (typeof X_WATCHED_CREATORS)[number],
  nowSeconds: number,
): PublicSignal | null {
  let result = rawResult;
  if (result.__typename === "TweetWithVisibilityResults") {
    const unwrapped = recordValue(result.tweet);
    if (!unwrapped) return null;
    result = unwrapped;
  }
  if (["TweetTombstone", "TweetUnavailable"].includes(String(result.__typename ?? ""))) return null;
  const legacy = recordValue(result.legacy);
  if (!legacy || legacy.retweeted_status_result) return null;
  const core = recordValue(result.core);
  const userResults = recordValue(core?.user_results);
  const userResult = recordValue(userResults?.result);
  const userLegacy = recordValue(userResult?.legacy);
  const handle = userLegacy?.screen_name;
  const id = legacy.id_str ?? result.rest_id;
  if (
    typeof id !== "string" || !/^\d{5,25}$/.test(id) ||
    typeof handle !== "string" || !/^[A-Za-z0-9_]{1,15}$/.test(handle) ||
    handle.toLowerCase() !== watchedCreator.handle.toLowerCase()
  ) return null;

  const noteTweet = recordValue(result.note_tweet);
  const noteResults = recordValue(noteTweet?.note_tweet_results);
  const noteResult = recordValue(noteResults?.result);
  const rawText = noteResult?.text ?? legacy.full_text ?? legacy.text;
  const body = cleanXPostBody(rawText);
  const title = body.replace(/\s+/g, " ").slice(0, 280);
  const createdAt = legacy.created_at;
  const ageSeconds = typeof createdAt === "string" ? ageFromDate(createdAt, nowSeconds, MAX_X_POST_AGE_SECONDS) : null;
  if (!title || ageSeconds === null) return null;
  const views = recordValue(result.views);
  const observedMetrics = publicMetricSnapshot({
    likes: xMetricValue(legacy.favorite_count),
    replies: xMetricValue(legacy.reply_count),
    reposts: xMetricValue(legacy.retweet_count),
    quotes: xMetricValue(legacy.quote_count),
    bookmarks: xMetricValue(legacy.bookmark_count),
    views: xMetricValue(views?.count),
  });
  const displayName = typeof userLegacy?.name === "string"
    ? userLegacy.name.replace(/\s+/g, " ").trim().slice(0, 80)
    : watchedCreator.name;
  const avatarUrl = safeXImageUrl(userLegacy?.profile_image_url_https, "avatar");
  const media = xPostMedia(legacy);
  return {
    id: `x-${id}`,
    title,
    ...xCreatorClassification(title, watchedCreator),
    source: "x",
    source_url: `https://x.com/${handle}/status/${id}`,
    age_seconds: ageSeconds,
    body,
    published_at: new Date(Date.parse(createdAt as string)).toISOString(),
    scores: { heat: null },
    creator: {
      username: `@${handle}`,
      display_name: displayName || watchedCreator.name,
      category: watchedCreator.category,
      ...(watchedCreator.organization ? { organization: watchedCreator.organization } : {}),
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    },
    ...(media.length ? { media } : {}),
    ...(observedMetrics ? { observed_metrics: observedMetrics, metric_evidence: "single_provider_snapshot" as const } : {}),
  };
}

function xTimelineResults(payload: unknown) {
  const root = recordValue(payload);
  const data = recordValue(root?.data);
  const user = recordValue(data?.user);
  const result = recordValue(user?.result);
  const timelineRoot = recordValue(result?.timeline_v2) ?? recordValue(result?.timeline);
  const timeline = recordValue(timelineRoot?.timeline);
  const instructions = Array.isArray(timeline?.instructions) ? timeline.instructions.slice(0, 20) : [];
  const tweetResults: Record<string, unknown>[] = [];
  const addItem = (rawItem: unknown) => {
    const item = recordValue(rawItem);
    const itemContent = recordValue(item?.itemContent);
    const results = recordValue(itemContent?.tweet_results);
    const tweet = recordValue(results?.result);
    if (itemContent?.itemType === "TimelineTweet" && tweet) tweetResults.push(tweet);
  };
  for (const rawInstruction of instructions) {
    const instruction = recordValue(rawInstruction);
    const entries = Array.isArray(instruction?.entries) ? instruction.entries.slice(0, 40) : [];
    for (const rawEntry of entries) {
      const entry = recordValue(rawEntry);
      const content = recordValue(entry?.content);
      if (content?.entryType === "TimelineTimelineItem") addItem(content);
      if (content?.entryType === "TimelineTimelineModule") {
        const items = Array.isArray(content.items) ? content.items.slice(0, 40) : [];
        for (const rawModuleItem of items) addItem(recordValue(rawModuleItem)?.item);
      }
      if (tweetResults.length >= 40) return tweetResults;
    }
  }
  return tweetResults;
}

function xMomentum(signal: PublicSignal) {
  const metrics = signal.observed_metrics ?? {};
  const engagement =
    (metrics.likes ?? 0) + (metrics.replies ?? 0) * 1.5 + (metrics.reposts ?? 0) * 2 +
    (metrics.quotes ?? 0) * 2.5 + (metrics.bookmarks ?? 0) * 0.5;
  const ageHours = Math.max(signal.age_seconds / 3_600, 0.25);
  return engagement / Math.pow(ageHours, 0.75);
}

function normalizeHuggingFaceModel(
  model: HuggingFaceModel,
  owner: (typeof CHINESE_AI_MODEL_OWNERS)[number],
  nowSeconds: number,
): PublicSignal | null {
  const modelId = model.id || model.modelId;
  if (
    typeof modelId !== "string" || model.private === true || Boolean(model.gated) ||
    !modelId.startsWith(`${owner.owner}/`) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(modelId)
  ) return null;

  const ageSeconds = ageFromDate(model.lastModified ?? "", nowSeconds);
  if (ageSeconds === null) return null;
  const createdAge = ageFromDate(model.createdAt ?? "", nowSeconds);
  const activity = createdAge === null ? "Updated" : "New";
  const sourceUrl = safeSourceUrl(`https://huggingface.co/${modelId}`);
  if (!sourceUrl) return null;
  const observedMetrics = publicMetricSnapshot({ downloads: model.downloads, likes: model.likes });
  return {
    id: `hugging-face-${stableHash(modelId)}`,
    title: `${activity} model repository: ${modelId}`,
    topic: "Chinese AI",
    niche: "Chinese AI",
    source: "hugging_face",
    source_url: sourceUrl,
    age_seconds: ageSeconds,
    scores: { heat: null },
    creator: { username: owner.name },
    ...(observedMetrics ? { observed_metrics: observedMetrics, metric_evidence: "single_provider_snapshot" as const } : {}),
  };
}

function normalizeGiteeRepository(
  repository: GiteeRepository,
  configured: (typeof GITEE_CHINESE_AI_REPOSITORIES)[number],
  nowSeconds: number,
): PublicSignal | null {
  const fullName = `${configured.owner}/${configured.name}`;
  if (
    repository.private !== false || repository.full_name !== fullName ||
    typeof repository.id !== "number" || !Number.isSafeInteger(repository.id) || repository.id <= 0
  ) throw new Error("Gitee repository identity did not match the reviewed public source.");

  const ageSeconds = ageFromDate(repository.updated_at ?? "", nowSeconds);
  const sourceUrl = safeSourceUrl(`https://gitee.com/${configured.owner}/${configured.name}`);
  if (!sourceUrl) throw new Error("The reviewed Gitee repository URL was invalid.");
  if (ageSeconds === null) return null;
  const observedMetrics = publicMetricSnapshot({
    stars: repository.stargazers_count,
    forks: repository.forks_count,
    watchers: repository.watchers_count,
    open_issues: repository.open_issues_count,
  });
  return {
    id: `gitee-repository-${repository.id}`,
    title: `Repository updated: ${fullName}`,
    topic: "Chinese AI",
    niche: "Chinese AI",
    source: "gitee",
    source_url: sourceUrl,
    age_seconds: ageSeconds,
    scores: { heat: null },
    creator: { username: configured.label },
    ...(observedMetrics ? { observed_metrics: observedMetrics, metric_evidence: "single_provider_snapshot" as const } : {}),
  };
}

function normalizeGitHubRepository(
  repository: GitHubRepository,
  configured: (typeof GITHUB_AI_REPOSITORIES)[number],
  nowSeconds: number,
): PublicSignal | null {
  const fullName = `${configured.owner}/${configured.name}`;
  if (
    repository.private !== false || repository.archived === true || repository.disabled === true ||
    repository.full_name !== fullName || typeof repository.id !== "number" ||
    !Number.isSafeInteger(repository.id) || repository.id <= 0
  ) throw new Error("GitHub repository identity did not match the reviewed public source.");

  const ageSeconds = ageFromDate(repository.pushed_at ?? "", nowSeconds);
  const sourceUrl = safeSourceUrl(`https://github.com/${configured.owner}/${configured.name}`);
  if (!sourceUrl) throw new Error("The reviewed GitHub repository URL was invalid.");
  if (ageSeconds === null) return null;
  const observedMetrics = publicMetricSnapshot({
    stars: repository.stargazers_count,
    forks: repository.forks_count,
    watchers: repository.subscribers_count,
    open_issues: repository.open_issues_count,
  });
  return {
    id: `github-repository-${repository.id}`,
    title: `Repository activity: ${fullName}`,
    topic: configured.topic,
    niche: configured.niche,
    source: "github",
    source_url: sourceUrl,
    age_seconds: ageSeconds,
    scores: { heat: null },
    creator: { username: configured.label },
    ...(observedMetrics ? { observed_metrics: observedMetrics, metric_evidence: "single_provider_snapshot" as const } : {}),
  };
}

function normalizeYoutubeEntry(
  fragment: string,
  channel: (typeof YOUTUBE_CHANNELS)[number],
  nowSeconds: number,
): PublicSignal | null {
  const videoId = xmlValue(fragment, "yt:videoId");
  const channelId = xmlValue(fragment, "yt:channelId");
  const title = xmlValue(fragment, "title").slice(0, 280);
  const published = xmlValue(fragment, "published") || xmlValue(fragment, "updated");
  const ageSeconds = ageFromDate(published, nowSeconds);
  if (
    channelId !== channel.channelId || !/^[A-Za-z0-9_-]{11}$/.test(videoId) ||
    !title || ageSeconds === null
  ) return null;
  const sourceUrl = safeSourceUrl(`https://www.youtube.com/watch?v=${videoId}`);
  if (!sourceUrl) return null;
  const classification = classifySignal(`${channel.name} ${title}`);
  return {
    id: `youtube-${videoId}`,
    title,
    ...classification,
    source: "youtube",
    source_url: sourceUrl,
    age_seconds: ageSeconds,
    scores: { heat: null },
    creator: { username: channel.name },
  };
}

function parseYoutubeFeed(
  text: string,
  channel: (typeof YOUTUBE_CHANNELS)[number],
  nowSeconds: number,
) {
  const items: PublicSignal[] = [];
  for (const match of text.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)) {
    const item = normalizeYoutubeEntry(match[0], channel, nowSeconds);
    if (item) items.push(item);
    if (items.length >= MAX_ITEMS_PER_SOURCE) break;
  }
  return items.sort((left, right) => left.age_seconds - right.age_seconds);
}

async function readBoundedBody(response: Response, maxBytes: number) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("Provider response exceeded the configured size bound.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > maxBytes) {
      await reader.cancel();
      throw new Error("Provider response exceeded the configured size bound.");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function fetchXGuestJson(url: string, init: RequestInit = {}) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    !["api.x.com", "x.com"].includes(parsed.hostname.toLowerCase()) ||
    !(parsed.pathname === "/1.1/guest/activate.json" || parsed.pathname.startsWith("/i/api/graphql/"))
  ) throw new Error("Refused an unexpected X guest endpoint.");
  const response = await fetch(parsed.toString(), { ...init, signal: AbortSignal.timeout(6_000) });
  if (!response.ok) throw new Error(`X guest endpoint returned ${response.status}.`);
  const text = await readBoundedBody(response, MAX_X_JSON_BYTES);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("X guest endpoint returned invalid JSON.");
  }
}

async function fetchFxTwitterJson(url: string) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== "api.fxtwitter.com" ||
    !/^\/2\/profile\/[A-Za-z0-9_]{1,15}\/statuses$/.test(parsed.pathname) ||
    Array.from(parsed.searchParams.keys()).some((key) => key !== "count")
  ) throw new Error("Refused an unexpected FxTwitter endpoint.");
  const response = await fetch(parsed.toString(), {
    headers: { accept: "application/json", "user-agent": "ai-virality-radar/1.0" },
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 204) return { results: [] };
  if (!response.ok && response.status !== 404) throw new Error(`FxTwitter returned ${response.status}.`);
  const text = await readBoundedBody(response, MAX_X_JSON_BYTES);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("FxTwitter returned invalid JSON.");
  }
}

async function fetchJson(url: string, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    headers: { accept: "application/json", ...headers },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Provider returned ${response.status}.`);
  const text = await readBoundedBody(response, MAX_JSON_BYTES);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("Provider returned invalid JSON.");
  }
}

async function fetchFeedText(url: string) {
  const response = await fetch(url, {
    headers: { accept: "application/atom+xml, application/rss+xml, text/xml;q=0.9" },
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new Error(`Provider returned ${response.status}.`);
  return readBoundedBody(response, MAX_FEED_BYTES);
}

async function fetchHackerNews(): Promise<SourceResult> {
  const ids = await fetchJson(`${HACKER_NEWS_API}/newstories.json`);
  if (!Array.isArray(ids)) throw new Error("Hacker News returned an invalid story list.");
  const candidateIds = ids
    .filter((id): id is number => Number.isSafeInteger(id) && id > 0)
    .slice(0, MAX_HN_CANDIDATES);
  const settled = await Promise.allSettled(
    candidateIds.map((id) => fetchJson(`${HACKER_NEWS_API}/item/${id}.json`)),
  );
  const failedHydrations = settled.filter((result) => result.status === "rejected").length;
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const items = settled
    .filter((result): result is PromiseFulfilledResult<unknown> => result.status === "fulfilled")
    .map((result) => normalizeHackerNewsItem(result.value as HackerNewsItem, nowSeconds))
    .filter((item): item is PublicSignal => item !== null)
    .sort((left, right) => left.age_seconds - right.age_seconds)
    .slice(0, MAX_ITEMS_PER_SOURCE);
  return {
    status: {
      id: "hacker_news",
      label: "Hacker News",
      status: failedHydrations ? "degraded" : "live",
      coverage: "recent AI-related submissions",
      scoring: "unavailable",
      item_count: items.length,
      ...(failedHydrations ? { reason: `${failedHydrations} recent submission${failedHydrations === 1 ? "" : "s"} could not be hydrated.` } : {}),
    },
    items,
  };
}

function xGuestHeaders(guestToken?: string) {
  return {
    authorization: `Bearer ${X_GUEST_BEARER}`,
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
    "x-twitter-active-user": "yes",
    "x-twitter-client-language": "en",
    ...(guestToken ? { "x-guest-token": guestToken, origin: "https://x.com", referer: "https://x.com/" } : {}),
  };
}

async function activateXGuestToken() {
  const payload = recordValue(await fetchXGuestJson(X_GUEST_ACTIVATE_API, {
    method: "POST",
    headers: xGuestHeaders(),
  }));
  const token = payload?.guest_token;
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(token)) {
    throw new Error("X did not return a valid guest token.");
  }
  return token;
}

async function fetchXCreatorTimeline(
  watchedCreator: (typeof X_WATCHED_CREATORS)[number],
  guestToken: string,
  maximumItems = 1,
) {
  const userUrl = new URL(`${X_GRAPHQL_API}/${X_USER_QUERY_ID}/UserByScreenName`);
  userUrl.searchParams.set("variables", JSON.stringify({
    screen_name: watchedCreator.handle,
    withSafetyModeUserFields: true,
  }));
  userUrl.searchParams.set("features", X_USER_FEATURES);
  const userPayload = recordValue(await fetchXGuestJson(userUrl.toString(), { headers: xGuestHeaders(guestToken) }));
  const userData = recordValue(userPayload?.data);
  const user = recordValue(userData?.user);
  const userResult = recordValue(user?.result);
  const userLegacy = recordValue(userResult?.legacy);
  const userId = userResult?.rest_id;
  if (
    typeof userId !== "string" || !/^\d{5,25}$/.test(userId) ||
    typeof userLegacy?.screen_name !== "string" ||
    userLegacy.screen_name.toLowerCase() !== watchedCreator.handle.toLowerCase()
  ) throw new Error(`X could not verify @${watchedCreator.handle}.`);

  const timelineUrl = new URL(`${X_GRAPHQL_API}/${X_TIMELINE_QUERY_ID}/UserTweets`);
  timelineUrl.searchParams.set("variables", JSON.stringify({
    userId,
    count: 20,
    includePromotedContent: false,
    withQuickPromoteEligibilityTweetFields: false,
    withVoice: true,
    withV2Timeline: true,
  }));
  timelineUrl.searchParams.set("features", X_TWEET_FEATURES);
  timelineUrl.searchParams.set("fieldToggles", X_FIELD_TOGGLES);
  const timelinePayload = await fetchXGuestJson(timelineUrl.toString(), { headers: xGuestHeaders(guestToken) });
  const nowSeconds = Math.floor(Date.now() / 1_000);
  return xTimelineResults(timelinePayload)
    .map((result) => normalizeXGuestTweet(result, watchedCreator, nowSeconds))
    .filter((item): item is PublicSignal => item !== null)
    .sort((left, right) => left.age_seconds - right.age_seconds || xMomentum(right) - xMomentum(left))
    .slice(0, Math.max(1, Math.min(8, Math.floor(maximumItems))));
}

async function fetchXGuestTimelines(
  limits: { per_creator: number; total: number } = { per_creator: 1, total: MAX_ITEMS_PER_SOURCE },
): Promise<SourceResult> {
  const guestToken = await activateXGuestToken();
  const settled = await Promise.allSettled(
    X_WATCHED_CREATORS.map((creator) => fetchXCreatorTimeline(creator, guestToken, limits.per_creator)),
  );
  const failedCreators = settled.filter((result) => result.status === "rejected").length;
  const candidates = settled
    .flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .sort((left, right) => xMomentum(right) - xMomentum(left) || left.age_seconds - right.age_seconds);
  const items = selectRollingXSignals(candidates, limits);
  return {
    status: {
      id: "x_guest_timelines",
      label: "X watched AI accounts",
      status: failedCreators ? "degraded" : "live",
      coverage: "recent posts from watched AI labs, startup accounts, founders, CEOs, and builders",
      scoring: "unavailable",
      item_count: items.length,
      ...(failedCreators ? { reason: `${failedCreators} of ${X_WATCHED_CREATORS.length} watched X timelines could not be read.` } : {}),
    },
    items,
  };
}

async function fetchXOfficialTimelines(
  bearerToken: string,
  limits: { per_creator: number; total: number },
): Promise<SourceResult> {
  const result = await fetchOfficialXRecentPosts({ bearerToken, watchedCreators: X_WATCHED_CREATORS });
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const candidates = result.posts
    .map((post) => normalizeOfficialXPost(post, nowSeconds))
    .filter((item): item is PublicSignal => item !== null)
    .sort((left, right) => xMomentum(right) - xMomentum(left) || left.age_seconds - right.age_seconds);
  const items = selectRollingXSignals(candidates, limits);
  const degraded = result.failed_requests > 0 || items.length === 0;
  return {
    status: {
      id: "x_guest_timelines",
      label: "X watched accounts via official API",
      status: degraded ? "degraded" : "live",
      coverage: "recent original posts from watched AI labs, startup accounts, founders, CEOs, and builders",
      scoring: "unavailable",
      item_count: items.length,
      provider: "x_official_api",
      official: true,
      ...(degraded ? {
        reason: items.length
          ? `${result.failed_requests} of ${result.request_count} official X search requests failed; available posts remain live.`
          : "The official X API returned no watched-account posts.",
      } : {}),
    },
    items,
  };
}

async function fetchXCompatibilityTimelines(
  limits: { per_creator: number; total: number } = { per_creator: 1, total: MAX_ITEMS_PER_SOURCE },
): Promise<SourceResult> {
  const settled = await Promise.allSettled(
    X_WATCHED_CREATORS.map((creator) => fetchFxTwitterCreatorTimeline(creator, limits.per_creator)),
  );
  const failedCreators = settled.filter((result) => result.status === "rejected").length;
  const fxItems = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  let fallbackItems: PublicSignal[] = [];
  let fallbackFailed = false;

  if (fxItems.length < Math.min(8, limits.total)) {
    try {
      fallbackItems = (await fetchXGuestTimelines(limits)).items;
    } catch {
      fallbackFailed = true;
    }
  }

  const uniqueItems = [...fxItems, ...fallbackItems].filter((item, index, all) =>
    all.findIndex((candidate) => candidate.source_url === item.source_url) === index,
  );
  const items = selectRollingXSignals(
    uniqueItems.sort((left, right) => xMomentum(right) - xMomentum(left) || left.age_seconds - right.age_seconds),
    limits,
  );
  const degraded = failedCreators > 0 || items.length === 0;
  return {
    status: {
      id: "x_guest_timelines",
      label: "X watched accounts via compatibility bridge",
      status: degraded ? "degraded" : "live",
      coverage: "recent original posts from watched AI labs, startup accounts, founders, CEOs, and builders",
      scoring: "unavailable",
      item_count: items.length,
      provider: "x_compatibility_bridge",
      official: false,
      ...(degraded ? {
        reason: items.length
          ? `${failedCreators} of ${X_WATCHED_CREATORS.length} FxTwitter timelines could not be read; available posts remain live.`
          : `Public X timelines returned no posts${fallbackFailed ? "; the X guest fallback also failed" : ""}.`,
      } : {}),
    },
    items,
  };
}

async function fetchXPublicTimelines(
  limits: { per_creator: number; total: number } = { per_creator: 1, total: MAX_ITEMS_PER_SOURCE },
): Promise<SourceResult> {
  const policy = resolveXCollectionPolicy(process.env);
  if (policy.mode === "unavailable") {
    return {
      status: {
        id: "x_guest_timelines",
        label: "X watched accounts",
        status: "degraded",
        coverage: "recent original posts from watched AI labs, startup accounts, founders, CEOs, and builders",
        scoring: "unavailable",
        item_count: 0,
        official: false,
        reason: "Set X_API_BEARER_TOKEN for official collection or explicitly enable the compatibility fallback.",
      },
      items: [],
    };
  }
  if (policy.mode === "compatibility") return fetchXCompatibilityTimelines(limits);

  try {
    const official = await fetchXOfficialTimelines(policy.bearer_token, limits);
    if (official.items.length || !policy.allow_compatibility_fallback) return official;
    const compatibility = await fetchXCompatibilityTimelines(limits);
    return {
      ...compatibility,
      status: {
        ...compatibility.status,
        status: "degraded",
        reason: `${official.status.reason ?? "The official X API returned no posts."} Compatibility data is temporarily shown.`,
      },
    };
  } catch (error) {
    if (!policy.allow_compatibility_fallback) throw error;
    const compatibility = await fetchXCompatibilityTimelines(limits);
    const reason = error instanceof Error ? error.message : "The official X API request failed.";
    return {
      ...compatibility,
      status: {
        ...compatibility.status,
        status: "degraded",
        reason: `${reason} Compatibility data is temporarily shown.`,
      },
    };
  }
}

export async function observedXGuestSignals(): Promise<XGuestSignalsPayload> {
  const now = Date.now();
  if (cachedXRadarPayload && cachedXRadarPayload.expiresAt > now) return cachedXRadarPayload.value;
  if (pendingXRadarPayload) return pendingXRadarPayload;
  const previous = cachedXRadarPayload?.value ?? null;
  pendingXRadarPayload = (async () => {
    try {
      const result = await fetchXPublicTimelines({ per_creator: 4, total: 240 });
      const retained = retainLastKnownXSignals(result.items, previous?.items ?? []);
      if (retained.retained && previous) {
        const value = {
          ...previous,
          refresh_after_seconds: Math.ceil(X_RADAR_CACHE_TTL_MS / 1_000),
          source: {
            ...result.status,
            status: "degraded",
            item_count: retained.items.length,
            reason: `${result.status.reason ?? "X returned no posts."} Showing the last successful snapshot from ${previous.generated_at}.`,
          },
          items: retained.items,
        } satisfies XGuestSignalsPayload;
        cachedXRadarPayload = { expiresAt: Date.now() + X_RADAR_CACHE_TTL_MS, value };
        return value;
      }
      const generatedAt = new Date().toISOString();
      const history = await observePublicEvidenceHistory(result.items, generatedAt);
      const value = {
        generated_at: generatedAt,
        refresh_after_seconds: Math.ceil(X_RADAR_CACHE_TTL_MS / 1_000),
        source: result.status,
        items: retained.items,
        history,
      } satisfies XGuestSignalsPayload;
      cachedXRadarPayload = { expiresAt: Date.now() + X_RADAR_CACHE_TTL_MS, value };
      return value;
    } catch (error) {
      if (!previous?.items.length) throw error;
      const reason = error instanceof Error ? error.message : "X refresh failed.";
      const value = {
        ...previous,
        refresh_after_seconds: Math.ceil(X_RADAR_CACHE_TTL_MS / 1_000),
        source: {
          ...previous.source,
          status: "degraded",
          item_count: previous.items.length,
          reason: `${reason} Showing the last successful snapshot from ${previous.generated_at}.`,
        },
      } satisfies XGuestSignalsPayload;
      cachedXRadarPayload = { expiresAt: Date.now() + X_RADAR_CACHE_TTL_MS, value };
      return value;
    }
  })().finally(() => { pendingXRadarPayload = null; });
  return pendingXRadarPayload;
}

async function fetchPublicFeed(feed: (typeof PUBLIC_FEEDS)[number]): Promise<SourceResult> {
  const text = await fetchFeedText(feed.url);
  const items = parseFeed(text, feed, Math.floor(Date.now() / 1_000));
  return {
    status: {
      id: feed.id,
      label: feed.label,
      status: "live",
      coverage: feed.coverage,
      scoring: "unavailable",
      item_count: items.length,
    },
    items,
  };
}

async function fetchBluesky(): Promise<SourceResult> {
  const settled = await Promise.allSettled(BLUESKY_CREATORS.map(async (creator) => {
    const url = new URL(`${BLUESKY_PUBLIC_API}/app.bsky.feed.getAuthorFeed`);
    url.searchParams.set("actor", creator.did);
    url.searchParams.set("filter", "posts_no_replies");
    url.searchParams.set("limit", String(MAX_BLUESKY_POSTS_PER_CREATOR));
    const payload = await fetchJson(url.toString());
    if (!payload || typeof payload !== "object" || !Array.isArray((payload as { feed?: unknown }).feed)) {
      throw new Error("Bluesky returned an invalid author feed.");
    }
    return (payload as { feed: BlueskyFeedEntry[] }).feed;
  }));
  const failedFeeds = settled.filter((result) => result.status === "rejected").length;
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const items = settled
    .flatMap((result, index) => result.status === "fulfilled"
      ? result.value.map((entry) => normalizeBlueskyItem(entry, BLUESKY_CREATORS[index], nowSeconds))
      : [])
    .filter((item): item is PublicSignal => item !== null)
    .sort((left, right) => left.age_seconds - right.age_seconds)
    .slice(0, MAX_ITEMS_PER_SOURCE);
  return {
    status: {
      id: "bluesky_creators",
      label: "Bluesky AI creators",
      status: failedFeeds ? "degraded" : "live",
      coverage: "watched public AI creator feeds",
      scoring: "unavailable",
      item_count: items.length,
      ...(failedFeeds ? { reason: `${failedFeeds} of ${BLUESKY_CREATORS.length} watched creator feeds could not be read.` } : {}),
    },
    items,
  };
}

async function fetchChineseAiModels(): Promise<SourceResult> {
  const settled = await Promise.allSettled(CHINESE_AI_MODEL_OWNERS.map(async (owner) => {
    const url = new URL(HUGGING_FACE_API);
    url.searchParams.set("author", owner.owner);
    url.searchParams.set("sort", "lastModified");
    url.searchParams.set("direction", "-1");
    url.searchParams.set("limit", String(MAX_HUGGING_FACE_MODELS_PER_OWNER));
    const payload = await fetchJson(url.toString());
    if (!Array.isArray(payload)) throw new Error("Hugging Face returned an invalid model list.");
    return payload as HuggingFaceModel[];
  }));
  const failedOwners = settled.filter((result) => result.status === "rejected").length;
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const items = settled
    .flatMap((result, index) => result.status === "fulfilled"
      ? result.value
        .map((model) => normalizeHuggingFaceModel(model, CHINESE_AI_MODEL_OWNERS[index], nowSeconds))
        .filter((item): item is PublicSignal => item !== null)
        .sort((left, right) => left.age_seconds - right.age_seconds)
        .slice(0, 1)
      : [])
    .sort((left, right) => left.age_seconds - right.age_seconds)
    .slice(0, MAX_ITEMS_PER_SOURCE);
  return {
    status: {
      id: "chinese_ai_models",
      label: "Chinese AI model hubs",
      status: failedOwners ? "degraded" : "live",
      coverage: "watched public Hugging Face model owners",
      scoring: "unavailable",
      item_count: items.length,
      ...(failedOwners ? { reason: `${failedOwners} of ${CHINESE_AI_MODEL_OWNERS.length} watched model owners could not be read.` } : {}),
    },
    items,
  };
}

async function fetchGiteeChineseAi(): Promise<SourceResult> {
  const settled = await Promise.allSettled(GITEE_CHINESE_AI_REPOSITORIES.map(async (repository) => {
    const owner = encodeURIComponent(repository.owner);
    const name = encodeURIComponent(repository.name);
    const payload = await fetchJson(`${GITEE_API}/repos/${owner}/${name}`);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Gitee returned invalid repository metadata.");
    }
    return normalizeGiteeRepository(payload as GiteeRepository, repository, Math.floor(Date.now() / 1_000));
  }));
  const failedRepositories = settled.filter((result) => result.status === "rejected").length;
  const items = settled
    .flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : [])
    .sort((left, right) => left.age_seconds - right.age_seconds)
    .slice(0, MAX_ITEMS_PER_SOURCE);
  return {
    status: {
      id: "gitee_chinese_ai",
      label: "Gitee Chinese AI",
      status: failedRepositories ? "degraded" : "live",
      coverage: "official updates from a reviewed public Chinese AI repository",
      scoring: "unavailable",
      item_count: items.length,
      ...(failedRepositories ? { reason: `${failedRepositories} of ${GITEE_CHINESE_AI_REPOSITORIES.length} reviewed repositories could not be verified.` } : {}),
    },
    items,
  };
}

async function fetchGitHubAiRepositories(): Promise<SourceResult> {
  const settled = await Promise.allSettled(GITHUB_AI_REPOSITORIES.map(async (repository) => {
    const owner = encodeURIComponent(repository.owner);
    const name = encodeURIComponent(repository.name);
    const payload = await fetchJson(`${GITHUB_API}/repos/${owner}/${name}`, {
      accept: "application/vnd.github+json",
      "user-agent": "ai-virality-radar-public-sampler/1",
      "x-github-api-version": "2022-11-28",
    });
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("GitHub returned invalid repository metadata.");
    }
    return normalizeGitHubRepository(payload as GitHubRepository, repository, Math.floor(Date.now() / 1_000));
  }));
  const failedRepositories = settled.filter((result) => result.status === "rejected").length;
  const items = settled
    .flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : [])
    .sort((left, right) => left.age_seconds - right.age_seconds)
    .slice(0, MAX_ITEMS_PER_SOURCE);
  return {
    status: {
      id: "github_ai_repositories",
      label: "GitHub AI repositories",
      status: failedRepositories ? "degraded" : "live",
      coverage: "official activity from a reviewed public AI repository",
      scoring: "unavailable",
      item_count: items.length,
      ...(failedRepositories ? { reason: `${failedRepositories} of ${GITHUB_AI_REPOSITORIES.length} reviewed repositories could not be verified.` } : {}),
    },
    items,
  };
}

async function fetchYoutubeWatchedChannels(): Promise<SourceResult> {
  const settled = await Promise.allSettled(YOUTUBE_CHANNELS.map(async (channel) => {
    const url = new URL(YOUTUBE_FEED_API);
    url.searchParams.set("channel_id", channel.channelId);
    const text = await fetchFeedText(url.toString());
    return parseYoutubeFeed(text, channel, Math.floor(Date.now() / 1_000));
  }));
  const failedChannels = settled.filter((result) => result.status === "rejected").length;
  const items = settled
    .flatMap((result) => result.status === "fulfilled" ? result.value.slice(0, 1) : [])
    .sort((left, right) => left.age_seconds - right.age_seconds)
    .slice(0, MAX_ITEMS_PER_SOURCE);
  return {
    status: {
      id: "youtube_watched_channels",
      label: "YouTube watched channels",
      status: failedChannels ? "degraded" : "live",
      coverage: "latest public uploads from reviewed official AI channels",
      scoring: "unavailable",
      item_count: items.length,
      ...(failedChannels ? { reason: `${failedChannels} of ${YOUTUBE_CHANNELS.length} watched channel feeds could not be read.` } : {}),
    },
    items,
  };
}

function degradedSource(id: string, label: string, coverage: string): SourceResult {
  return {
    status: {
      id,
      label,
      status: "degraded",
      coverage,
      scoring: "unavailable",
      item_count: 0,
      reason: "The public source is temporarily unavailable.",
    },
    items: [],
  };
}

function selectDiverseSignals(results: SourceResult[]) {
  const selected: PublicSignal[] = [];
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const add = (item: PublicSignal) => {
    const titleKey = item.title.toLocaleLowerCase().replace(/\s+/g, " ").trim();
    const sourceUrlKey = canonicalPublicSourceUrl(item.source_url) ?? item.source_url;
    if (seenUrls.has(sourceUrlKey) || seenTitles.has(titleKey) || selected.length >= MAX_SIGNALS) return;
    seenUrls.add(sourceUrlKey);
    seenTitles.add(titleKey);
    selected.push(item);
  };

  for (const result of results) {
    if (result.items[0]) add(result.items[0]);
  }
  results
    .find((result) => result.status.id === "x_guest_timelines")
    ?.items.slice(1)
    .forEach(add);
  results
    .find((result) => result.status.id === "chinese_ai_models")
    ?.items.slice(1)
    .forEach(add);
  const hackerNewsItems = results.find((result) => result.status.id === "hacker_news")?.items ?? [];
  hackerNewsItems
    .slice(1)
    .filter((item) => item.niche !== hackerNewsItems[0]?.niche)
    .slice(0, 1)
    .forEach(add);
  results
    .find((result) => result.status.id === "youtube_watched_channels")
    ?.items.slice(1)
    .forEach(add);
  results
    .flatMap((result) => result.items.slice(1))
    .sort((left, right) => left.age_seconds - right.age_seconds)
    .forEach(add);
  return selected.sort((left, right) => left.age_seconds - right.age_seconds);
}

function buildExactLinkGroups(results: SourceResult[]) {
  const grouped = new Map<string, PublicExactLinkMember[]>();
  for (const result of results) {
    for (const item of result.items) {
      const anchors = [
        { url: item.source_url, kind: "source_url" as const },
        ...(item.related_urls ?? []).map((url) => ({ url, kind: "related_url" as const })),
      ];
      for (const anchor of anchors) {
        const canonicalUrl = canonicalPublicSourceUrl(anchor.url);
        if (!canonicalUrl) continue;
        const members = grouped.get(canonicalUrl) ?? [];
        const memberKey = `${result.status.id}:${item.id}`;
        if (members.some((member) => `${member.lane_id}:${member.item_id}` === memberKey)) continue;
        members.push({
          item_id: item.id,
          title: item.title,
          lane_id: result.status.id,
          lane_label: result.status.label,
          source: item.source,
          source_url: item.source_url,
          matched_url: anchor.url,
          match_kind: anchor.kind,
          topic: item.topic,
          niche: item.niche,
          age_seconds: item.age_seconds,
          ...(item.creator ? { creator: item.creator } : {}),
        });
        grouped.set(canonicalUrl, members);
      }
    }
  }

  return Array.from(grouped, ([canonicalUrl, rawMembers]) => {
    const members = [...rawMembers].sort((left, right) => left.age_seconds - right.age_seconds);
    const lanes = Array.from(new Map(members.map((member) => [member.lane_id, { id: member.lane_id, label: member.lane_label }])).values());
    const newestAge = members[0]?.age_seconds ?? 0;
    const oldestAge = members.at(-1)?.age_seconds ?? newestAge;
    return {
      id: `public-exact-link-${stableHash(canonicalUrl)}`,
      canonical_url: canonicalUrl,
      lane_count: lanes.length,
      item_count: members.length,
      lanes,
      newest_age_seconds: newestAge,
      oldest_age_seconds: oldestAge,
      observed_span_seconds: Math.max(0, oldestAge - newestAge),
      members: members.slice(0, MAX_EXACT_LINK_MEMBERS),
    } satisfies PublicExactLinkGroup;
  })
    .filter((group) => group.lane_count >= 2 && group.item_count >= 2)
    .sort((left, right) => left.newest_age_seconds - right.newest_age_seconds || right.lane_count - left.lane_count)
    .slice(0, MAX_EXACT_LINK_GROUPS);
}

let announcementEvidence: PublicSignal[] = [];
export async function observedOfficialAnnouncements() {
  await publicSignals();
  return announcementEvidence;
}

async function buildPayload(): Promise<PublicSignalsPayload> {
  const settled = await Promise.allSettled([
    fetchXPublicTimelines(),
    fetchHackerNews(),
    fetchBluesky(),
    fetchChineseAiModels(),
    fetchGiteeChineseAi(),
    fetchGitHubAiRepositories(),
    fetchYoutubeWatchedChannels(),
    ...PUBLIC_FEEDS.map((feed) => fetchPublicFeed(feed)),
  ]);
  const descriptors = [
    { id: "x_guest_timelines", label: "X watched accounts (official API preferred)", coverage: "recent original posts from watched X creators and AI labs" },
    { id: "hacker_news", label: "Hacker News", coverage: "recent AI-related submissions" },
    { id: "bluesky_creators", label: "Bluesky AI creators", coverage: "watched public AI creator feeds" },
    { id: "chinese_ai_models", label: "Chinese AI model hubs", coverage: "watched public Hugging Face model owners" },
    { id: "gitee_chinese_ai", label: "Gitee Chinese AI", coverage: "official updates from a reviewed public Chinese AI repository" },
    { id: "github_ai_repositories", label: "GitHub AI repositories", coverage: "official activity from a reviewed public AI repository" },
    { id: "youtube_watched_channels", label: "YouTube watched channels", coverage: "latest public uploads from reviewed official AI channels" },
    ...PUBLIC_FEEDS.map((feed) => ({ id: feed.id, label: feed.label, coverage: feed.coverage })),
  ];
  const results = settled.map((result, index) => result.status === "fulfilled"
    ? result.value
    : degradedSource(descriptors[index].id, descriptors[index].label, descriptors[index].coverage));
  if (!results.some((result) => result.status.status === "live")) {
    throw new Error("Every public source is unavailable.");
  }

  // The diverse homepage sample is deliberately small. News monitoring needs
  // every item from the already-fetched official feeds, not that presentation cap.
  announcementEvidence = results.flatMap(result=>result.items.filter(item=>/^(feed_|status_|github)/.test(item.source))).slice(0,200);

  return {
    mode: "public_multi_source",
    generated_at: new Date().toISOString(),
    refresh_after_seconds: Math.ceil(CACHE_TTL_MS / 1_000),
    sources: results.map((result) => result.status),
    items: selectDiverseSignals(results),
    exact_link_groups: buildExactLinkGroups(results),
  };
}

async function publicSignals() {
  const now = Date.now();
  if (cachedPayload && cachedPayload.expiresAt > now) return cachedPayload.value;
  if (pendingPayload) return pendingPayload;

  pendingPayload = buildPayload()
    .then((value) => {
      cachedPayload = { expiresAt: Date.now() + CACHE_TTL_MS, value };
      return value;
    })
    .finally(() => { pendingPayload = null; });
  return pendingPayload;
}

export async function observedPublicSignals() {
  const payload = await publicSignals();
  const history = await observePublicEvidenceHistory(payload.items, payload.generated_at);
  return { ...payload, history };
}

export async function GET() {
  try {
    const payload = await observedPublicSignals();
    return Response.json(payload, {
      headers: {
        "cache-control": "public, max-age=60, s-maxage=120, stale-while-revalidate=300",
        "x-radar-mode": "public-multi-source",
      },
    });
  } catch {
    return Response.json(
      {
        detail: "The public AI signal pulse is temporarily unavailable.",
        mode: "preview",
      },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
