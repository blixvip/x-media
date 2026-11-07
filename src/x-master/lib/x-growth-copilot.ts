import { OFFICIAL_X_PRODUCT_HANDLES } from './x-watchlist.ts';

type NumericMetrics = {
  likes?: number;
  reposts?: number;
  replies?: number;
  views?: number;
};

export type GrowthSignal = {
  id: string;
  title?: string;
  body?: string;
  topic?: string;
  niche?: string;
  url?: string;
  source_url?: string;
  source: string;
  published_at?: string;
  age_minutes?: number;
  age_seconds?: number;
  creator?: { username?: string; name?: string; followers?: number };
  observed_metrics?: NumericMetrics;
  score?: number | {
    potential?: number;
    velocity?: number;
    acceleration?: number;
    engagement?: number;
    creator_lift?: number;
    recency?: number;
    relevance?: number;
    label?: string;
  };
  potential_score?: number;
  relevance_score?: number;
  confidence?: number;
  growth_state?: string;
  velocity?: number;
  is_big_launch?: boolean;
  category?: string;
  personalized?: boolean;
  personalization_reason?: string;
  capture_method?: string;
};

export type LaunchEvidence = {
  signal_id: string;
  source: string;
  url: string;
  published_at: string;
  creator: string | null;
  official: boolean;
  summary: string;
};

export type LaunchEvent = {
  id: string;
  entity: string;
  aliases: string[];
  lifecycle: "anticipated_unverified" | "confirmed" | "launching" | "post_launch" | "cooling";
  importance: number;
  confidence: number;
  confirmation: "official" | "corroborated" | "unverified";
  should_alert: boolean;
  time_bound: boolean;
  evidence: LaunchEvidence[];
};

export type GrowthOpportunity = {
  id: string;
  signal_id: string;
  source_url: string;
  action: "reply_now" | "quote" | "repost" | "watch" | "skip";
  recommended_action: "reply_now" | "quote" | "repost" | "watch" | "skip";
  visible: boolean;
  opportunity_score: number;
  reply_score: number;
  risk_score: number;
  relevance_score: number;
  expires_at: string;
  why_now: string;
  why_you: string;
  filter_reasons: string[];
};

export type VoiceProfile = {
  name?: string;
  tone?: string[];
  forbidden_phrases?: string[];
  max_length?: number;
};

export type DraftPackage = {
  format: "x_reply" | "x_quote" | "x_post";
  primary: string;
  alternatives: Array<{ angle: string; text: string }>;
  evidence_ids: string[];
  unsupported_claims: string[];
};

export type AutomationAction = "reply" | "quote" | "repost" | "original" | "ignore";
export type AutomationPolicy = {
  autopilot_enabled: boolean;
  daily_cap: number;
  hourly_cap: number;
  per_author_daily_cap: number;
  per_story_cooldown_hours: number;
  timezone: string;
  active_hours: { start: number; end: number };
  action_weights: { quote: number; reply: number; original: number; repost: number };
  minimum_opportunity_score: number;
  x_ai_reply_approved: boolean;
};

export type ActionDecision = {
  id: string;
  signal_id: string;
  source_url: string;
  action: AutomationAction;
  format: "x_reply" | "x_quote" | "x_post" | "repost" | null;
  state: "review" | "scheduled" | "skipped";
  opportunity_score: number;
  follower_value: number;
  risk_score: number;
  delay_minutes: number | null;
  due_at: string | null;
  expires_at: string;
  why_now: string;
  why_you: string;
  policy_reasons: string[];
  policy_version: "x-growth-policy-v1";
};

export const DEFAULT_AUTOMATION_POLICY: AutomationPolicy = Object.freeze({
  autopilot_enabled: false,
  daily_cap: 8,
  hourly_cap: 2,
  per_author_daily_cap: 1,
  per_story_cooldown_hours: 6,
  timezone: "America/Edmonton",
  active_hours: { start: 8, end: 23 },
  action_weights: { quote: 45, reply: 30, original: 15, repost: 10 },
  minimum_opportunity_score: 62,
  x_ai_reply_approved: false,
});

function exactInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum;
}

export function parseAutomationPolicy(value: unknown): AutomationPolicy | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<AutomationPolicy>;
  const hours = candidate.active_hours;
  const weights = candidate.action_weights;
  if (
    typeof candidate.autopilot_enabled !== "boolean"
    || !exactInteger(candidate.daily_cap, 1, 20)
    || !exactInteger(candidate.hourly_cap, 1, 4)
    || candidate.hourly_cap > candidate.daily_cap
    || !exactInteger(candidate.per_author_daily_cap, 1, 2)
    || !exactInteger(candidate.per_story_cooldown_hours, 1, 24)
    || typeof candidate.timezone !== "string"
    || candidate.timezone.length < 1
    || candidate.timezone.length > 64
    || !hours
    || !exactInteger(hours.start, 0, 23)
    || !exactInteger(hours.end, 1, 24)
    || hours.start >= hours.end
    || !weights
    || !exactInteger(weights.quote, 0, 100)
    || !exactInteger(weights.reply, 0, 100)
    || !exactInteger(weights.original, 0, 100)
    || !exactInteger(weights.repost, 0, 100)
    || weights.quote + weights.reply + weights.original + weights.repost !== 100
    || !exactInteger(candidate.minimum_opportunity_score, 40, 95)
    || typeof candidate.x_ai_reply_approved !== "boolean"
  ) return null;
  try { new Intl.DateTimeFormat("en-US", { timeZone: candidate.timezone }).format(new Date()); }
  catch { return null; }
  return {
    autopilot_enabled: candidate.autopilot_enabled,
    daily_cap: candidate.daily_cap,
    hourly_cap: candidate.hourly_cap,
    per_author_daily_cap: candidate.per_author_daily_cap,
    per_story_cooldown_hours: candidate.per_story_cooldown_hours,
    timezone: candidate.timezone,
    active_hours: { start: hours.start, end: hours.end },
    action_weights: { ...weights },
    minimum_opportunity_score: candidate.minimum_opportunity_score,
    x_ai_reply_approved: candidate.x_ai_reply_approved,
  };
}

function localHour(date: Date, timezone: string): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return {
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? 0),
    minute: Number(parts.find((part) => part.type === "minute")?.value ?? 0),
  };
}

export function nextEligiblePublishAt(dueAt: Date, policy: AutomationPolicy): Date {
  const candidate = new Date(dueAt);
  if (!Number.isFinite(candidate.getTime())) throw new Error("Invalid due time");
  for (let index = 0; index <= 24 * 60; index += 1) {
    const current = localHour(candidate, policy.timezone);
    if (current.hour >= policy.active_hours.start && current.hour < policy.active_hours.end) return candidate;
    candidate.setUTCSeconds(0, 0);
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  throw new Error("No eligible publishing window found");
}

function stablePercent(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

function selectAction(signalId: string, weights: AutomationPolicy["action_weights"]): Exclude<AutomationAction, "ignore"> {
  const draw = stablePercent(signalId);
  if (draw < weights.quote) return "quote";
  if (draw < weights.quote + weights.reply) return "reply";
  if (draw < weights.quote + weights.reply + weights.original) return "original";
  return "repost";
}

export function buildActionDecision(
  signal: GrowthSignal,
  opportunity: GrowthOpportunity,
  policy: AutomationPolicy = DEFAULT_AUTOMATION_POLICY,
  now = new Date(),
): ActionDecision {
  const invalid = !opportunity.visible || opportunity.opportunity_score < policy.minimum_opportunity_score;
  const action = invalid ? "ignore" : selectAction(signal.id, policy.action_weights);
  const policyReasons = [...opportunity.filter_reasons];
  if (action === "reply") policyReasons.push("Unsolicited and AI-generated replies require human review.");
  if (action === "quote") policyReasons.push("Self-serve X access uses the human-reviewed quote composer.");
  if (signal.is_big_launch) policyReasons.push("Trend-driven content requires human review before publishing.");
  const eligibleAutopilot = policy.autopilot_enabled
    && (action === "repost" || (action === "original" && !signal.is_big_launch));
  const delayMinutes = invalid ? null : 1 + (stablePercent(`${signal.id}:${now.toISOString().slice(0, 13)}`) % 30);
  const rawDue = delayMinutes === null ? null : new Date(now.getTime() + delayMinutes * 60_000);
  const due = rawDue ? nextEligiblePublishAt(rawDue, policy) : null;
  const format = action === "reply" ? "x_reply" : action === "quote" ? "x_quote" : action === "original" ? "x_post" : action === "repost" ? "repost" : null;
  const followerValue = clamp(opportunity.opportunity_score * 0.7 + opportunity.relevance_score * 0.3 - opportunity.risk_score * 0.25);

  return {
    id: `decision:${signal.id}:x-growth-policy-v1`,
    signal_id: signal.id,
    source_url: opportunity.source_url,
    action,
    format,
    state: invalid ? "skipped" : eligibleAutopilot ? "scheduled" : "review",
    opportunity_score: opportunity.opportunity_score,
    follower_value: followerValue,
    risk_score: opportunity.risk_score,
    delay_minutes: delayMinutes,
    due_at: due?.toISOString() ?? null,
    expires_at: opportunity.expires_at,
    why_now: opportunity.why_now,
    why_you: opportunity.why_you,
    policy_reasons: policyReasons,
    policy_version: "x-growth-policy-v1",
  };
}

type CompanionPost = {
  id: string;
  url: string;
  author?: { username?: string; display_name?: string };
  text: string;
  published_at: string;
  metrics?: NumericMetrics;
};

// Aggregators, repositories, and community uploads are not first-party evidence.
const OFFICIAL_SOURCES = new Set(['feed_openai','feed_deepmind','feed_huggingface_blog','feed_mistral','feed_microsoft','feed_google_ai','feed_google_research','status_openai','status_anthropic']);
const OFFICIAL_HANDLES = new Set([
  "openai",
  "sama",
  "anthropicai",
  "googledeepmind",
  "googleai",
  "github",
  "vercel",
  "cursor_ai",
  "xai",
  "metaai",
  "huggingface",
]);
const TIME_BOUND_RE = /\b(today|tonight|tomorrow|this (?:morning|afternoon|week)|now|live|just (?:launched|released|shipped)|releas(?:e|es|ing|ed)|launch(?:es|ing|ed)?|ships?|available now)\b/i;
const ANNOUNCEMENT_RE = /\b(introducing|announcing|unveiling|is here|now available)\b|\bthis is\s+(?:GPT|ChatGPT|Claude|Gemini|Qwen|Grok|Codex)\b/i;
const SPAM_RE = /\b(giveaway|airdrop|dm me|guaranteed followers?|follow for follow|f4f|100x|free money|crypto pump|engagement group)\b/i;
const USEFUL_RE = /\b(how|why|what|build|ship|launch|release|test|benchmark|workflow|code|agent|model|api|startup|founder|developer)\b/i;

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function textOf(signal: GrowthSignal): string {
  return [signal.title, signal.body, signal.topic].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function signalUrl(signal: GrowthSignal): string {
  return signal.source_url || signal.url || "";
}

function signalPublishedAt(signal: GrowthSignal, now = new Date()): string {
  if (signal.published_at && Number.isFinite(Date.parse(signal.published_at))) return new Date(signal.published_at).toISOString();
  const seconds = Number.isFinite(signal.age_seconds) ? Math.max(0, signal.age_seconds as number) : 0;
  return new Date(now.getTime() - seconds * 1_000).toISOString();
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function creatorHandle(signal: GrowthSignal): string {
  return (signal.creator?.username || "").replace(/^@/, "").toLowerCase();
}

export function isOfficial(signal: GrowthSignal): boolean {
  const handle = creatorHandle(signal);
  return OFFICIAL_SOURCES.has(signal.source) || (signal.source === 'x' && (OFFICIAL_HANDLES.has(handle) || OFFICIAL_X_PRODUCT_HANDLES.has(`@${handle}`)));
}

export function extractLaunchEntities(value: string): string[] {
  const entities = new Set<string>();
  const versioned = /\b(?:chatgpt|gpt)[\s-]?(\d+(?:\.\d+)?)\s*(astra|atlas)?\b/gi;
  for (const match of value.matchAll(versioned)) {
    entities.add(`ChatGPT-${match[1]}${match[2] ? ` ${titleCase(match[2])}` : ""}`);
  }
  if (/\bchatgpt\s+atlas\b/i.test(value) && !/\bchatgpt[\s-]?\d+(?:\.\d+)?\s+atlas\b/i.test(value)) {
    entities.add("ChatGPT Atlas");
  }

  const namedModels = [
    /\bClaude\s+(?:Opus|Sonnet|Haiku)?\s*\d+(?:\.\d+)?\b/gi,
    /\bGemini\s+\d+(?:\.\d+)?(?:\s+(?:Pro|Flash|Ultra))?\b/gi,
    /\bLlama\s+\d+(?:\.\d+)?\b/gi,
    /\bQwen\s*\d+(?:\.\d+)?\b/gi,
    /\bGrok\s+\d+(?:\.\d+)?\b/gi,
    /\bCodex\s+(?:CLI|Cloud|Desktop|\d+(?:\.\d+)?)\b/gi,
  ];
  for (const pattern of namedModels) {
    for (const match of value.matchAll(pattern)) entities.add(titleCaseWords(match[0]));
  }

  return [...entities];
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function titleCaseWords(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => (/^(CLI|GPT)$/i.test(word) ? word.toUpperCase() : titleCase(word)))
    .join(" ");
}

function sourceAttention(signal: GrowthSignal): number {
  const score = typeof signal.score === "number" ? signal.score : signal.score?.potential ?? signal.potential_score ?? 50;
  const metrics = signal.observed_metrics || {};
  const raw = (metrics.likes || 0) + (metrics.reposts || 0) * 2 + (metrics.replies || 0) * 1.5;
  const metricLift = raw > 0 ? Math.min(20, Math.log10(raw + 1) * 5) : 0;
  return clamp(Math.max(score * 0.18, metricLift), 0, 20);
}

function sortEvidence(a: LaunchEvidence, b: LaunchEvidence): number {
  if (a.official !== b.official) return a.official ? -1 : 1;
  return Date.parse(b.published_at) - Date.parse(a.published_at);
}

export function buildLaunchEvents(signals: GrowthSignal[], supportingSignals: GrowthSignal[] = [], now = new Date()): LaunchEvent[] {
  const grouped = new Map<string, { entity: string; signals: GrowthSignal[] }>();

  for (const signal of [...signals, ...supportingSignals]) {
    const text = textOf(signal);
    const announcement = isOfficial(signal) && ANNOUNCEMENT_RE.test(text);
    if (!TIME_BOUND_RE.test(text) && !signal.is_big_launch && !announcement) continue;
    const entities = extractLaunchEntities(text);
    if (!entities.length && isOfficial(signal)) {
      const introduced = text.match(/\b(?:Introducing|Announcing|Unveiling)\s+([A-Z][A-Za-z0-9.-]*(?:\s+[A-Z][A-Za-z0-9.-]*){0,3})/);
      if (introduced) entities.push(introduced[1]);
    }
    for (const entity of entities) {
      const key = slug(entity);
      const existing = grouped.get(key) || { entity, signals: [] };
      if (!existing.signals.some((candidate) => candidate.id === signal.id)) existing.signals.push(signal);
      grouped.set(key, existing);
    }
  }

  return [...grouped.entries()]
    .map(([key, group]): LaunchEvent => {
      const official = group.signals.some(isOfficial);
      const distinctSources = new Set(group.signals.map((signal) => `${signal.source}:${creatorHandle(signal) || "unknown"}`));
      const corroborated = distinctSources.size >= 2;
      const timeBound = group.signals.some((signal) => TIME_BOUND_RE.test(textOf(signal)));
      const newestAgeMinutes = Math.min(
        ...group.signals.map((signal) => {
          const supplied = signal.age_minutes ?? (Number.isFinite(signal.age_seconds) ? (signal.age_seconds as number) / 60 : undefined);
          if (Number.isFinite(supplied)) return Math.max(0, supplied as number);
          return Math.max(0, (now.getTime() - Date.parse(signalPublishedAt(signal, now))) / 60_000);
        }),
      );
      const attention = Math.max(...group.signals.map(sourceAttention));
      const importance = clamp(32 + (official ? 28 : 17) + (timeBound ? 15 : 0) + (corroborated ? 12 : 0) + attention);
      const confidence = clamp((official ? 92 : corroborated ? 72 : 48) + Math.min(6, group.signals.length * 2));
      const lifecycle: LaunchEvent["lifecycle"] = official
        ? newestAgeMinutes <= 360 && timeBound
          ? "launching"
          : "confirmed"
        : "anticipated_unverified";
      const evidence = group.signals
        .map((signal): LaunchEvidence => ({
          signal_id: signal.id,
          source: signal.source,
          url: signalUrl(signal),
          published_at: signalPublishedAt(signal, now),
          creator: signal.creator?.username || null,
          official: isOfficial(signal),
          summary: textOf(signal).slice(0, 240),
        }))
        .sort(sortEvidence);

      return {
        id: `launch:${key}`,
        entity: group.entity,
        aliases: [group.entity],
        lifecycle,
        importance,
        confidence,
        confirmation: official ? "official" : corroborated ? "corroborated" : "unverified",
        should_alert: official || (timeBound && importance >= 75),
        time_bound: timeBound,
        evidence,
      };
    })
    .sort((a, b) => Number(b.should_alert) - Number(a.should_alert) || b.importance - a.importance);
}

function keywordRelevance(signal: GrowthSignal, keywords: string[]): { score: number; matches: string[] } {
  const haystack = textOf(signal).toLowerCase();
  const normalized = keywords.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean);
  const matches = normalized.filter((keyword) => haystack.includes(keyword));
  const supplied = signal.relevance_score ?? (typeof signal.score === "object" ? signal.score.relevance : undefined);
  const score = Number.isFinite(supplied)
    ? clamp(supplied as number)
    : matches.length
      ? clamp(55 + matches.length * 12)
      : USEFUL_RE.test(haystack)
        ? 45
        : 20;
  return { score, matches };
}

export function buildGrowthOpportunities(
  signals: GrowthSignal[],
  keywords: string[] = ["ai", "coding", "developer", "startup", "agent", "model"],
  now = new Date(),
): GrowthOpportunity[] {
  return signals
    .map((signal): GrowthOpportunity => {
      const text = textOf(signal);
      const lower = text.toLowerCase();
      const metrics = signal.observed_metrics || {};
      const suppliedAge = signal.age_minutes ?? (Number.isFinite(signal.age_seconds) ? (signal.age_seconds as number) / 60 : undefined);
      const ageMinutes = Number.isFinite(suppliedAge)
        ? Math.max(0, suppliedAge as number)
        : Math.max(0, (now.getTime() - Date.parse(signalPublishedAt(signal, now))) / 60_000);
      const relevance = keywordRelevance(signal, keywords);
      const spam = SPAM_RE.test(lower);
      const stale = ageMinutes > 360 && !/growing|surging|breaking/i.test(signal.growth_state || "");
      const saturated = (metrics.replies || 0) >= 1_500;
      const offNiche = relevance.score < 40;
      const filterReasons: string[] = [];
      if (spam) filterReasons.push("Likely engagement bait or spam");
      if (offNiche) filterReasons.push("Outside your growth territory");
      if (stale) filterReasons.push("Reply window likely closed");
      if (saturated) filterReasons.push("Conversation already saturated");

      const risk = clamp((spam ? 70 : 0) + (stale ? 20 : 0) + (saturated ? 22 : 0) + (offNiche ? 28 : 0));
      const potential = clamp(
        signal.potential_score ?? (typeof signal.score === "number" ? signal.score : signal.score?.potential) ?? 50,
      );
      const headroom = saturated ? 10 : (metrics.replies || 0) < 250 ? 90 : 58;
      const freshness = clamp(100 - ageMinutes * 1.25);
      const usefulness = USEFUL_RE.test(lower) ? 88 : 52;
      const opportunityScore = clamp(
        potential * 0.3 + relevance.score * 0.25 + headroom * 0.15 + freshness * 0.15 + usefulness * 0.15 - risk * 0.25,
      );
      const visible = !spam && !offNiche && !stale && !saturated && risk < 60;
      const action: GrowthOpportunity["action"] = !visible
        ? "skip"
        : opportunityScore >= 75 && ageMinutes <= 45
          ? "reply_now"
          : opportunityScore >= 68 && ageMinutes <= 120
            ? "quote"
            : opportunityScore >= 52
              ? "watch"
              : "skip";
      const publishedAt = new Date(signalPublishedAt(signal, now));
      const expiresAt = new Date(publishedAt.getTime() + 45 * 60_000);
      const matchedTerritory = relevance.matches.length ? relevance.matches.slice(0, 3).join(", ") : "AI/coding/startups";

      return {
        id: `opportunity:${signal.id}`,
        signal_id: signal.id,
        source_url: signalUrl(signal),
        action,
        recommended_action: action,
        visible,
        opportunity_score: opportunityScore,
        reply_score: opportunityScore,
        risk_score: risk,
        relevance_score: relevance.score,
        expires_at: expiresAt.toISOString(),
        why_now:
          action === "reply_now"
            ? `Fresh conversation with ${headroom >= 80 ? "strong reply headroom" : "room for a useful angle"}.`
            : action === "quote"
              ? "Strong fit; a distinct point of view can carry farther than a short reply."
              : visible
                ? "Relevant signal, but the timing or attention curve is not decisive yet."
                : filterReasons.join(" · "),
        why_you: `Matches your ${matchedTerritory} territory and favors a useful builder perspective.`,
        filter_reasons: filterReasons,
      };
    })
    .sort((a, b) => Number(b.visible) - Number(a.visible) || b.opportunity_score - a.opportunity_score);
}

function sanitizeDraft(text: string, profile: VoiceProfile): string {
  let result = text.replace(/\s+/g, " ").trim();
  for (const phrase of profile.forbidden_phrases || []) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "gi"), "").replace(/\s+/g, " ").trim();
  }
  const max = Math.min(280, Math.max(40, profile.max_length || 280));
  if (result.length > max) result = `${result.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
  return result;
}

export function buildDraftPackage(
  signal: GrowthSignal,
  opportunityOrProfile: Pick<GrowthOpportunity, "action"> | VoiceProfile = {},
  suppliedProfile?: VoiceProfile,
): DraftPackage {
  const isOpportunity = "action" in opportunityOrProfile;
  const opportunity = isOpportunity ? opportunityOrProfile as Pick<GrowthOpportunity, "action"> : { action: "reply_now" as const };
  const profile = suppliedProfile || (isOpportunity ? {} : opportunityOrProfile as VoiceProfile);
  const topic = extractLaunchEntities(textOf(signal))[0] || signal.topic || "this";
  const primary = sanitizeDraft(
    opportunity.action === "quote"
      ? `${topic} matters less as a headline than as a workflow. The useful test: what can a builder do today that was awkward yesterday?`
      : `Worth watching the gap between the ${topic} promise and the first real workflows. What will you test first?`,
    profile,
  );
  const alternatives = [
    { angle: "practical", text: sanitizeDraft(`The launch is the easy part. Show the first repeatable ${topic} workflow that saves real time.`, profile) },
    { angle: "contrarian", text: sanitizeDraft(`My test for ${topic}: does it remove a step, or just make the same step look more impressive?`, profile) },
  ].filter((draft, index, all) => draft.text && draft.text !== primary && all.findIndex((item) => item.text === draft.text) === index);

  return {
    format: opportunity.action === "quote" ? "x_quote" : "x_reply",
    primary,
    alternatives: alternatives.slice(0, 2),
    evidence_ids: [signal.id],
    unsupported_claims: [],
  };
}

function invalidCompanion(): never {
  throw new Error("Invalid companion observation");
}

function finiteMetric(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000_000) invalidCompanion();
  return value;
}

function parseCompanionPost(value: unknown, capturedAt: Date): GrowthSignal {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidCompanion();
  const post = value as Partial<CompanionPost>;
  if (typeof post.id !== "string" || !/^\d{5,25}$/.test(post.id)) invalidCompanion();
  const username = post.author?.username;
  if (typeof username !== "string" || !/^[A-Za-z0-9_]{1,15}$/.test(username)) invalidCompanion();
  if (typeof post.text !== "string" || post.text.trim().length < 1 || post.text.length > 2_000) invalidCompanion();
  if (typeof post.url !== "string") invalidCompanion();
  let url: URL;
  try {
    url = new URL(post.url);
  } catch {
    invalidCompanion();
  }
  if (url.protocol !== "https:" || !/^(?:www\.)?(?:x\.com|twitter\.com)$/i.test(url.hostname)) invalidCompanion();
  const pathMatch = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})\/?$/);
  if (!pathMatch || pathMatch[2] !== post.id || pathMatch[1].toLowerCase() !== username.toLowerCase()) invalidCompanion();
  if (url.username || url.password || url.hash) invalidCompanion();
  const publishedAt = new Date(post.published_at || "");
  if (!Number.isFinite(publishedAt.getTime()) || publishedAt.getTime() > capturedAt.getTime() + 5 * 60_000) invalidCompanion();
  const metrics = post.metrics || {};
  const observedMetrics: NumericMetrics = {
    likes: finiteMetric(metrics.likes),
    reposts: finiteMetric(metrics.reposts),
    replies: finiteMetric(metrics.replies),
    views: finiteMetric(metrics.views),
  };

  return {
    id: `companion:${post.id}`,
    title: post.text.trim(),
    body: post.text.trim(),
    topic: "Companion observation",
    niche: "Personal X",
    url: `https://x.com/${username}/status/${post.id}`,
    source_url: `https://x.com/${username}/status/${post.id}`,
    source: "x",
    published_at: publishedAt.toISOString(),
    age_minutes: Math.max(0, Math.round((capturedAt.getTime() - publishedAt.getTime()) / 60_000)),
    creator: {
      username: `@${username}`,
      name: typeof post.author?.display_name === "string" ? post.author.display_name.slice(0, 100) : undefined,
    },
    observed_metrics: observedMetrics,
    personalized: true,
    personalization_reason: "Visible in your signed-in X timeline",
    capture_method: "visible_x_dom",
  };
}

export function parseCompanionEnvelope(value: unknown): { version: 1; captured_at: string; posts: GrowthSignal[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidCompanion();
  const envelope = value as { version?: unknown; captured_at?: unknown; posts?: unknown };
  if (envelope.version !== 1 || typeof envelope.captured_at !== "string" || !Array.isArray(envelope.posts)) invalidCompanion();
  if (envelope.posts.length > 100) invalidCompanion();
  const capturedAt = new Date(envelope.captured_at);
  if (!Number.isFinite(capturedAt.getTime())) invalidCompanion();
  return {
    version: 1,
    captured_at: capturedAt.toISOString(),
    posts: envelope.posts.map((post) => parseCompanionPost(post, capturedAt)),
  };
}
