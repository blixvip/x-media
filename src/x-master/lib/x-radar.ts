import { OFFICIAL_X_PRODUCT_HANDLES, type XWatchCategory } from "./x-watchlist.ts";

export const DEFAULT_X_KEYWORDS = ["ai", "agents", "coding", "developer tools", "typescript", "react", "python", "startups"] as const;
export const X_OBSERVABLE_SCORE_VERSION = "x-virality-observable-v4" as const;
export const X_OBSERVABLE_SCORE_LIMITATION = "Uses public aggregate actions only. X personalized probabilities, dwell time, and negative feedback such as not-interested, mute, block, and report events are unavailable.";

const MAX_KEYWORDS = 8;
const MAX_KEYWORD_LENGTH = 32;
const MAX_TRENDS = 50;
const ALLOWED_COUNTRIES = new Set([
  "AU", "BR", "CA", "DE", "ES", "FR", "GB", "ID", "IN", "IT", "JP", "KR", "MX", "PH", "TR", "US", "ZA",
]);

export type XObservedMetrics = {
  likes?: number;
  replies?: number;
  reposts?: number;
  quotes?: number;
  bookmarks?: number;
  views?: number;
};

export type XSignalInput = {
  id: string;
  title: string;
  topic: string;
  niche: string;
  source: string;
  source_url: string;
  age_seconds: number;
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
  observed_metrics?: XObservedMetrics;
  personalized?: boolean;
  personalization_reason?: "from_your_home_timeline";
};

export type XVelocityHistory = {
  observed_seconds: number;
  engagement_delta: number;
  observation_windows: number;
};

export type XViralityScore = {
  model_version: typeof X_OBSERVABLE_SCORE_VERSION;
  potential: number;
  velocity: number;
  acceleration: number;
  engagement: number;
  conversation_quality: number;
  attention_quality: number;
  evidence_depth: number;
  creator_lift: number;
  recency: number;
  relevance: number;
  label: "breakout" | "rising_fast" | "watching" | "early";
  basis: "single_snapshot_estimate" | "multi_snapshot_observed";
  confidence: "estimated" | "observed";
};

export type RankedXSignal = XSignalInput & {
  rank: number;
  score: XViralityScore;
  is_big_launch: boolean;
  is_growing_fast: boolean;
  growth: {
    rate_per_hour: number;
    baseline_rate_per_hour: number;
    baseline_multiplier: number;
    creator_baseline_rate_per_hour: number;
    creator_baseline_multiplier: number;
    basis: XViralityScore["basis"];
    state: "watch" | "observed";
  };
};

export type XTrend = {
  rank: number;
  name: string;
  query: string;
  url: string;
  is_hashtag: boolean;
};

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteMetric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(value, 1_000_000_000_000)
    : 0;
}

function roundedScore(value: number) {
  return Math.round(clamp(value));
}

function viralityLabel(potential: number): XViralityScore["label"] {
  return potential >= 85 ? "breakout" : potential >= 70 ? "rising_fast" : potential >= 50 ? "watching" : "early";
}

function combinedPotential(parts: Pick<XViralityScore, "velocity" | "acceleration" | "engagement" | "conversation_quality" | "attention_quality" | "evidence_depth" | "creator_lift" | "recency" | "relevance">) {
  return roundedScore(
    parts.velocity * 0.24 + parts.acceleration * 0.14 + parts.engagement * 0.12 +
    parts.conversation_quality * 0.1 + parts.attention_quality * 0.08 +
    parts.creator_lift * 0.1 + parts.recency * 0.08 + parts.relevance * 0.1 +
    parts.evidence_depth * 0.04,
  );
}

function activityRateEvidence(signal: XSignalInput, history?: XVelocityHistory) {
  const hasObservedHistory = Boolean(
    history && history.observation_windows >= 2 &&
    Number.isFinite(history.observed_seconds) && history.observed_seconds >= 60 &&
    Number.isFinite(history.engagement_delta) && history.engagement_delta >= 0,
  );
  const ageHours = Math.max(finiteMetric(signal.age_seconds) / 3_600, 0.25);
  return {
    rate: hasObservedHistory
      ? finiteMetric(history?.engagement_delta) / Math.max(finiteMetric(history?.observed_seconds) / 3_600, 1 / 60)
      : weightedXEngagement(signal.observed_metrics) / ageHours,
    basis: hasObservedHistory ? "multi_snapshot_observed" as const : "single_snapshot_estimate" as const,
  };
}

function median(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function isBigLaunchSignal(signal: XSignalInput) {
  if (signal.age_seconds > 45 * 24 * 60 * 60) return false;
  const text = [signal.title, signal.body].filter(Boolean).join(" ");
  const explicitLaunch = /\b(?:introduc(?:e|es|ed|ing)|announc(?:e|es|ed|ing|ement)|launch(?:es|ed|ing)?|(?<!pre-)release(?:s|d|ing)?|ship(?:s|ped|ping)?|roll(?:s|ed|ing)? out|unveil(?:s|ed|ing)?|debut(?:s|ed|ing)?|now available|generally available)\b/i.test(text);
  if (explicitLaunch) return true;
  const officialHandle = signal.creator?.username?.toLocaleLowerCase("en-US") ?? "";
  const officialProductAccount = OFFICIAL_X_PRODUCT_HANDLES.has(officialHandle) || officialHandle === "@sama";
  if (!officialProductAccount) return false;
  if (/\bthis is\s+(?:gpt|chatgpt|gemini|claude|qwen|grok|codex)[\s\d.-]/i.test(text)) return true;
  return /\bnew\b.{0,48}\b(?:models?|features?|products?|tools?|apis?|sdks?|apps?|companies|startups|versions?|gpt|gemini|claude|qwen|codex)\b/i.test(text) ||
    /\b(?:upgrad(?:e|es|ed|ing)|meet)\b.{0,48}\b(?:models?|(?:gpt|gemini|claude|qwen|codex)[a-z0-9._-]*)\b/i.test(text) ||
    /\b(?:gpt|gemini|claude|qwen|codex)[a-z0-9._-]*\b.{0,40}\b(?:is here|arrives|available)\b/i.test(text);
}

export function parseXKeywords(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return [...DEFAULT_X_KEYWORDS];
  const seen = new Set<string>();
  for (const rawKeyword of value.slice(0, 512).split(",")) {
    const keyword = rawKeyword
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .replace(/[^a-z0-9#+._ -]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_KEYWORD_LENGTH);
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    if (seen.size >= MAX_KEYWORDS) break;
  }
  return seen.size ? Array.from(seen) : [...DEFAULT_X_KEYWORDS];
}

export function parseXCountry(value: unknown) {
  const country = typeof value === "string" ? value.trim().toUpperCase() : "";
  return ALLOWED_COUNTRIES.has(country) ? country : "CA";
}

export function weightedXEngagement(metrics: XObservedMetrics = {}) {
  return (
    finiteMetric(metrics.likes) +
    finiteMetric(metrics.replies) * 1.4 +
    finiteMetric(metrics.reposts) * 2.2 +
    finiteMetric(metrics.quotes) * 2 +
    finiteMetric(metrics.bookmarks) * 0.8
  );
}

function scoreConversationQuality(metrics: XObservedMetrics = {}) {
  const conversation = finiteMetric(metrics.replies) * 1.5 + finiteMetric(metrics.quotes) * 2.5;
  const passive = finiteMetric(metrics.likes) + finiteMetric(metrics.reposts) * 1.2;
  if (conversation <= 0) return 0;
  const share = conversation / Math.max(1, conversation + passive);
  return roundedScore(Math.sqrt(Math.min(1, share / 0.35)) * 100);
}

function scoreAttentionQuality(metrics: XObservedMetrics = {}) {
  const depthActions = finiteMetric(metrics.replies) * 1.2 + finiteMetric(metrics.quotes) * 2 + finiteMetric(metrics.bookmarks);
  if (depthActions <= 0) return 0;
  const views = finiteMetric(metrics.views);
  return views > 0
    ? roundedScore((depthActions / views / 0.025) * 100)
    : roundedScore((Math.log10(1 + depthActions) / 4) * 100);
}

function scoreEvidenceDepth(metrics: XObservedMetrics = {}, observedHistory: boolean) {
  const metricValues = [metrics.likes, metrics.replies, metrics.reposts, metrics.quotes, metrics.bookmarks, metrics.views];
  const availableMetrics = metricValues.filter((value) => typeof value === "number" && Number.isFinite(value) && value >= 0).length;
  const viewEvidence = typeof metrics.views === "number" && Number.isFinite(metrics.views) && metrics.views >= 0 ? 10 : 0;
  return roundedScore(20 + (availableMetrics / metricValues.length) * 40 + viewEvidence + (observedHistory ? 30 : 0));
}

function scoreRelevance(signal: XSignalInput, keywords: string[]) {
  const haystack = [signal.title, signal.body]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US");
  const handle = signal.creator?.username?.replace(/^@/, "").toLocaleLowerCase("en-US") ?? "";
  const matches = keywords.filter((keyword) => {
    const normalized = keyword.replace(/^@/, "");
    if (normalized === handle) return true;
    const candidates = keyword.length > 4 && keyword.endsWith("s") ? [keyword, keyword.slice(0, -1)] : [keyword];
    return candidates.some((candidate) => {
      const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(haystack);
    });
  }).length;
  if (!matches) return 0;
  return roundedScore(35 + 65 * (matches / Math.min(keywords.length, 3)));
}

export function scoreXSignal(
  signal: XSignalInput,
  rawKeywords: string[] = [...DEFAULT_X_KEYWORDS],
  history?: XVelocityHistory,
): XViralityScore {
  const keywords = parseXKeywords(rawKeywords.join(","));
  const ageHours = Math.max(finiteMetric(signal.age_seconds) / 3_600, 0.25);
  const weightedEngagement = weightedXEngagement(signal.observed_metrics);
  const activity = activityRateEvidence(signal, history);
  const velocityScale = activity.basis === "multi_snapshot_observed" ? 4 : 6;
  const velocity = roundedScore((Math.log10(1 + activity.rate) / velocityScale) * 100);
  const views = finiteMetric(signal.observed_metrics?.views);
  const engagement = views > 0
    ? roundedScore((weightedEngagement / views / 0.04) * 100)
    : roundedScore((Math.log10(1 + weightedEngagement) / 5) * 100);
  const conversation_quality = scoreConversationQuality(signal.observed_metrics);
  const attention_quality = scoreAttentionQuality(signal.observed_metrics);
  const evidence_depth = scoreEvidenceDepth(signal.observed_metrics, activity.basis === "multi_snapshot_observed");
  const recency = roundedScore(Math.exp(-ageHours / 36) * 100);
  const relevance = signal.personalized ? Math.max(70, scoreRelevance(signal, keywords)) : scoreRelevance(signal, keywords);
  const lifetimeRate = weightedEngagement / ageHours;
  const acceleration = activity.basis === "multi_snapshot_observed"
    ? roundedScore(50 + Math.log2(Math.max(0.125, activity.rate / Math.max(1, lifetimeRate))) * 20)
    : 40;
  const creator_lift = 50;
  const potential = combinedPotential({ velocity, acceleration, engagement, conversation_quality, attention_quality, evidence_depth, creator_lift, recency, relevance });
  return {
    model_version: X_OBSERVABLE_SCORE_VERSION,
    potential,
    velocity,
    acceleration,
    engagement,
    conversation_quality,
    attention_quality,
    evidence_depth,
    creator_lift,
    recency,
    relevance,
    label: viralityLabel(potential),
    basis: activity.basis,
    confidence: activity.basis === "multi_snapshot_observed" ? "observed" : "estimated",
  };
}

export function rankXSignals(
  signals: XSignalInput[],
  keywords: string[],
  historyByUrl: ReadonlyMap<string, XVelocityHistory> = new Map(),
) {
  const candidates = signals
    .filter((signal) => signal.source === "x" && /^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}\/status\/\d{5,25}$/.test(signal.source_url))
    .slice(0, 500)
    .map((signal) => {
      const history = historyByUrl.get(signal.source_url);
      return { signal, score: scoreXSignal(signal, keywords, history), activity: activityRateEvidence(signal, history) };
    });
  const baselineRate = median(candidates.map((candidate) => candidate.activity.rate));
  const creatorRates = new Map<string, number[]>();
  for (const candidate of candidates) {
    const creator = candidate.signal.creator?.username?.toLocaleLowerCase("en-US") ?? "unknown";
    creatorRates.set(creator, [...(creatorRates.get(creator) ?? []), candidate.activity.rate]);
  }
  return candidates
    .map(({ signal, score, activity }) => {
      const baselineMultiplier = baselineRate > 0 ? Math.min(99, activity.rate / baselineRate) : 0;
      const creator = signal.creator?.username?.toLocaleLowerCase("en-US") ?? "unknown";
      const creatorBaselineRate = median(creatorRates.get(creator) ?? []);
      const creatorBaselineMultiplier = creatorBaselineRate > 0 ? Math.min(99, activity.rate / creatorBaselineRate) : 0;
      const creatorLift = roundedScore(50 + Math.log2(Math.max(0.125, creatorBaselineMultiplier || 1)) * 20);
      const potential = combinedPotential({ ...score, creator_lift: creatorLift });
      const observed = activity.basis === "multi_snapshot_observed";
      return {
        ...signal,
        score: { ...score, creator_lift: creatorLift, potential, label: viralityLabel(potential) },
        is_big_launch: isBigLaunchSignal(signal),
        is_growing_fast: observed && signal.age_seconds <= 7 * 24 * 60 * 60 && Math.max(baselineMultiplier, creatorBaselineMultiplier) >= 2 && score.velocity >= 35,
        growth: {
          rate_per_hour: Math.round(activity.rate * 10) / 10,
          baseline_rate_per_hour: Math.round(baselineRate * 10) / 10,
          baseline_multiplier: Math.round(baselineMultiplier * 10) / 10,
          creator_baseline_rate_per_hour: Math.round(creatorBaselineRate * 10) / 10,
          creator_baseline_multiplier: Math.round(creatorBaselineMultiplier * 10) / 10,
          basis: activity.basis,
          state: observed ? "observed" as const : "watch" as const,
        },
      };
    })
    .sort((left, right) => right.score.potential - left.score.potential || left.age_seconds - right.age_seconds)
    .slice(0, 240)
    .map((signal, index) => ({ ...signal, rank: index + 1 } satisfies RankedXSignal));
}

export function selectRollingXSignals<T extends XSignalInput>(
  signals: T[],
  limits: { per_creator: number; total: number } = { per_creator: 6, total: 24 },
) {
  const perCreator = Math.max(1, Math.min(10, Math.floor(limits.per_creator)));
  const total = Math.max(1, Math.min(240, Math.floor(limits.total)));
  const byCreator = new Map<string, T[]>();
  const age = (signal: XSignalInput) => Number.isFinite(signal.age_seconds) && signal.age_seconds >= 0 ? signal.age_seconds : Infinity;
  // Upstream may rank by momentum or put an old pinned post first.
  for (const signal of signals.slice(0, 1200).sort((a, b) => age(a) - age(b))) {
    const creator = signal.creator?.username?.toLocaleLowerCase("en-US") ?? "unknown";
    const group = byCreator.get(creator) ?? [];
    if (group.length >= perCreator) continue;
    group.push(signal);
    byCreator.set(creator, group);
  }
  const selected: T[] = [];
  for (let depth = 0; depth < perCreator && selected.length < total; depth += 1) {
    for (const group of byCreator.values()) {
      const signal = group[depth];
      if (!signal) continue;
      selected.push(signal);
      if (selected.length >= total) break;
    }
  }
  return selected;
}

export function retainLastKnownXSignals<T>(freshItems: readonly T[], previousItems: readonly T[]) {
  if (freshItems.length) return { items: [...freshItems], retained: false };
  if (previousItems.length) return { items: [...previousItems], retained: true };
  return { items: [] as T[], retained: false };
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function normalizeXTapTrends(payload: unknown): XTrend[] {
  const root = recordValue(payload);
  const rawTrends = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.trends)
      ? root.trends
      : Array.isArray(root?.data)
        ? root.data
        : [];
  return rawTrends
    .slice(0, MAX_TRENDS * 2)
    .flatMap((rawTrend) => {
      const trend = recordValue(rawTrend);
      const rank = trend?.rank;
      const name = typeof trend?.name === "string" ? trend.name.replace(/\s+/g, " ").trim() : "";
      if (!Number.isSafeInteger(rank) || Number(rank) < 1 || Number(rank) > 500 || !name || name.length > 120) return [];
      const query = encodeURIComponent(name);
      return [{
        rank: Number(rank),
        name,
        query,
        url: `https://x.com/search?q=${query}&src=trend_click&vertical=trends`,
        is_hashtag: name.startsWith("#") || trend?.isHashtag === true,
      }];
    })
    .sort((left, right) => left.rank - right.rank)
    .slice(0, MAX_TRENDS);
}
