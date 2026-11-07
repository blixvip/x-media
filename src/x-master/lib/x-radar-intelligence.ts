import type { RankedXSignal, XTrend } from "./x-radar";

export type LaunchKind = "model" | "feature" | "product" | "company" | "open_source" | "other";

export type EnrichedXSignal = RankedXSignal & {
  launch_kind: LaunchKind | null;
  score_reasons: string[];
  triage: TriageSignal;
};

export type TriageSignal = {
  priority_score: number;
  tier: "act_now" | "watch" | "background";
};

export type EmergingCreator = {
  username: string;
  display_name: string;
  profile_url: string;
  discovery_score: number;
  source_post_count: number;
  mention_count: number;
  top_post_url: string;
  top_post_title: string;
  status: "breakout" | "rising" | "watch";
  discovery_basis: "mentioned_by_tracked_creators";
};

export type XStoryline = {
  id: string;
  title: string;
  lifecycle: "breaking" | "rising" | "stable";
  momentum: number;
  post_count: number;
  unique_creators: number;
  post_ids: string[];
  top_post_url: string;
  trend_rank?: number;
  evidence_basis: "clustered_tracked_posts";
};

const PRODUCT_PATTERNS: Array<[RegExp, string]> = [
  [/\bgemini(?:\s+[0-9]+(?:\.[0-9]+)?(?:\s+(?:pro|flash|ultra|cyber))?)?/i, "Gemini"],
  [/\bclaude(?:\s+[0-9]+(?:\.[0-9]+)?(?:\s+(?:opus|sonnet|haiku))?)?/i, "Claude"],
  [/\b(?:chatgpt|gpt)(?:[- ]?[0-9]+(?:\.[0-9]+)?)?/i, "GPT / ChatGPT"],
  [/\bqwen(?:[0-9]+(?:\.[0-9]+)?(?:-[a-z0-9]+)*)?/i, "Qwen"],
  [/\bcodex\b/i, "Codex"],
  [/\bfable(?:\s+[0-9]+(?:\.[0-9]+)?)?/i, "Fable"],
];

export function classifyLaunchKind(signal: Pick<RankedXSignal, "is_big_launch" | "title" | "body">): LaunchKind | null {
  if (!signal.is_big_launch) return null;
  const text = `${signal.title} ${signal.body ?? ""}`;
  if (/\b(?:open[ -]source|oss|github repository)\b/i.test(text)) return "open_source";
  if (/\b(?:model|gpt|gemini|claude|qwen|llm)\b/i.test(text)) return "model";
  if (/\b(?:feature|api|sdk|integration|mode)\b/i.test(text)) return "feature";
  if (/\b(?:company|startup|founded)\b/i.test(text)) return "company";
  if (/\b(?:app|tool|product|platform)\b/i.test(text)) return "product";
  return "other";
}

export function scoreReasons(signal: RankedXSignal): string[] {
  const reasons: string[] = [];
  if (signal.growth.basis === "multi_snapshot_observed" && signal.growth.baseline_multiplier >= 2) reasons.push(`${signal.growth.baseline_multiplier.toFixed(1)}× feed velocity`);
  if (signal.score.acceleration >= 70) reasons.push("Acceleration increasing");
  if (signal.score.engagement >= 70) reasons.push("High engagement efficiency");
  if (signal.score.relevance >= 80) reasons.push("Strong niche match");
  if (signal.score.recency >= 85) reasons.push("Fresh post");
  return reasons.slice(0, 3);
}

export function triageSignal(signal: RankedXSignal): TriageSignal {
  const observed = signal.score.confidence === "observed";
  const modifier = (observed ? 5 : -10) + (signal.is_growing_fast ? 5 : 0) + (signal.is_big_launch ? 3 : 0);
  const priority_score = Math.max(0, Math.min(100, Math.round(signal.score.potential + modifier)));
  const tier = observed && priority_score >= 75
    ? "act_now" as const
    : priority_score >= 50 || (!observed && signal.score.potential >= 70)
      ? "watch" as const
      : "background" as const;
  return { priority_score, tier };
}

export function enrichXSignals(signals: RankedXSignal[]): EnrichedXSignal[] {
  return signals.map((signal) => ({ ...signal, launch_kind: classifyLaunchKind(signal), score_reasons: scoreReasons(signal), triage: triageSignal(signal) }));
}

export function buildEmergingCreators(signals: RankedXSignal[], knownHandles: readonly string[]): EmergingCreator[] {
  const known = new Set(knownHandles.map((handle) => handle.toLocaleLowerCase("en-US")));
  const groups = new Map<string, { username: string; mentions: number; posts: Map<string, RankedXSignal> }>();
  for (const signal of signals) {
    const text = signal.body ?? signal.title;
    const mentions = text.matchAll(/(?:^|[\s([])@([A-Za-z0-9_]{1,15})\b/g);
    for (const match of mentions) {
      const username = `@${match[1]}`;
      const key = username.toLocaleLowerCase("en-US");
      if (known.has(key) || key === signal.creator?.username?.toLocaleLowerCase("en-US")) continue;
      const group = groups.get(key) ?? { username, mentions: 0, posts: new Map() };
      group.mentions += 1;
      group.posts.set(signal.id, signal);
      groups.set(key, group);
    }
  }
  return Array.from(groups.values()).map((group) => {
    const posts = Array.from(group.posts.values()).sort((left, right) => right.score.potential - left.score.potential);
    const maximum = posts[0]?.score.potential ?? 0;
    const average = posts.reduce((total, post) => total + post.score.potential, 0) / Math.max(1, posts.length);
    const discoveryScore = Math.round(Math.min(100, maximum * 0.6 + average * 0.25 + Math.min(100, group.mentions / 3 * 100) * 0.15));
    return {
      username: group.username,
      display_name: group.username,
      profile_url: `https://x.com/${group.username.slice(1)}`,
      discovery_score: discoveryScore,
      source_post_count: posts.length,
      mention_count: group.mentions,
      top_post_url: posts[0]?.source_url ?? `https://x.com/${group.username.slice(1)}`,
      top_post_title: posts[0]?.title ?? "Mentioned by a tracked creator",
      status: discoveryScore >= 75 ? "breakout" as const : discoveryScore >= 60 ? "rising" as const : "watch" as const,
      discovery_basis: "mentioned_by_tracked_creators" as const,
    };
  }).sort((left, right) => right.discovery_score - left.discovery_score || right.source_post_count - left.source_post_count).slice(0, 20);
}

function storylineTitle(signal: RankedXSignal) {
  const text = `${signal.title} ${signal.body ?? ""}`;
  for (const [pattern, fallback] of PRODUCT_PATTERNS) {
    if (pattern.test(text)) return fallback;
  }
  if (/\b(?:agent|agents|agentic|subagents?)\b/i.test(text)) return "AI Agents";
  if (/\b(?:typescript|react|python|coding|developer|software)\b/i.test(text)) return "Developer Tools";
  if (/\b(?:video|creator|content|prompting)\b/i.test(text)) return "AI & Creator Work";
  return signal.topic && signal.topic !== "Creator watch" ? signal.topic : signal.niche || "Creator Conversation";
}

function storylineId(title: string) {
  return title.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "conversation";
}

export function buildStorylines(signals: RankedXSignal[], trends: readonly XTrend[] = []): XStoryline[] {
  const groups = new Map<string, { title: string; posts: RankedXSignal[] }>();
  for (const signal of signals) {
    const title = storylineTitle(signal);
    const id = storylineId(title);
    const group = groups.get(id) ?? { title, posts: [] };
    group.posts.push(signal);
    groups.set(id, group);
  }
  return Array.from(groups.entries()).map(([id, group]) => {
    const posts = group.posts.sort((left, right) => right.score.potential - left.score.potential);
    const maximum = posts[0]?.score.potential ?? 0;
    const average = posts.reduce((total, post) => total + post.score.potential, 0) / Math.max(1, posts.length);
    const momentum = Math.round(maximum * 0.6 + average * 0.4);
    const normalizedTitle = group.title.toLocaleLowerCase("en-US");
    const trend = trends.find((candidate) => {
      const name = candidate.name.replace(/^#/, "").toLocaleLowerCase("en-US");
      return name.includes(normalizedTitle) || normalizedTitle.includes(name);
    });
    return {
      id,
      title: group.title,
      lifecycle: posts.some((post) => post.is_big_launch) || momentum >= 80 ? "breaking" as const : posts.some((post) => post.is_growing_fast) || momentum >= 60 ? "rising" as const : "stable" as const,
      momentum,
      post_count: posts.length,
      unique_creators: new Set(posts.map((post) => post.creator?.username).filter(Boolean)).size,
      post_ids: posts.map((post) => post.id).slice(0, 12),
      top_post_url: posts[0]?.source_url ?? "https://x.com",
      ...(trend ? { trend_rank: trend.rank } : {}),
      evidence_basis: "clustered_tracked_posts" as const,
    };
  }).sort((left, right) => right.momentum - left.momentum || right.post_count - left.post_count).slice(0, 12);
}
