import {
  observedPublicSignals,
  observedOfficialAnnouncements,
  observedXGuestSignals,
  X_WATCHED_HANDLES,
  type XGuestSignalsPayload,
} from "@/x-master/app/api/public-signals/route";
import { buildGrowthOpportunities, buildLaunchEvents } from "@/x-master/lib/x-growth-copilot";
import {
  X_OBSERVABLE_SCORE_LIMITATION,
  X_OBSERVABLE_SCORE_VERSION,
  normalizeXTapTrends,
  parseXCountry,
  parseXKeywords,
  rankXSignals,
  weightedXEngagement,
  type XVelocityHistory,
} from "@/x-master/lib/x-radar";
import { buildEmergingCreators, buildStorylines, enrichXSignals } from "@/x-master/lib/x-radar-intelligence";
import { buildMorningBriefing } from "@/x-master/lib/x-radar-briefing";
import { normalizeXHomeTimeline } from "@/x-master/lib/x-personalization";
import { fetchXHomeTimeline, resolveXUserSession, xAuthConfiguration } from "@/x-master/lib/x-user-auth";
import { buildRadarEvents, type RadarEvent } from "@/x-master/lib/x-radar-awareness";
import { radarDatabase, updateRadarAwareness } from "@/x-master/lib/x-radar-monitor";

const XTAPDOWN_TRENDS_API = "https://xtapdown.com/api/trends";
const MAX_TRENDS_BYTES = 500_000;
const TRENDS_CACHE_MS = 10 * 60 * 1_000;

type MetricDelta = {
  delta?: number;
  observation_windows?: number;
  first_observed_at?: string;
  last_observed_at?: string;
};

type HistoryItem = {
  source?: string;
  source_url?: string;
  observation_windows?: number;
  metric_history?: { metrics?: Record<string, MetricDelta> };
};

type TrendCache = { expires_at: number; trends: ReturnType<typeof normalizeXTapTrends> };
const trendCache = new Map<string, TrendCache>();
const pendingTrends = new Map<string, Promise<ReturnType<typeof normalizeXTapTrends>>>();

async function readBoundedJson(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_TRENDS_BYTES) {
    throw new Error("Trend response exceeded the size limit.");
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_TRENDS_BYTES) {
      await reader.cancel();
      throw new Error("Trend response exceeded the size limit.");
    }
    text += decoder.decode(value, { stream: true });
  }
  try {
    return JSON.parse(text + decoder.decode()) as unknown;
  } catch {
    throw new Error("Trend source returned invalid JSON.");
  }
}

async function loadXTrends(country: string) {
  const cached = trendCache.get(country);
  if (cached && cached.expires_at > Date.now()) return cached.trends;
  const activeRequest = pendingTrends.get(country);
  if (activeRequest) return activeRequest;

  const request = (async () => {
    const url = new URL(XTAPDOWN_TRENDS_API);
    url.searchParams.set("country", country);
    const response = await fetch(url.toString(), {
      headers: { accept: "application/json", "user-agent": "ai-virality-radar/1.0" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Trend source returned ${response.status}.`);
    const trends = normalizeXTapTrends(await readBoundedJson(response));
    if (!trends.length) throw new Error("Trend source returned no valid topics.");
    trendCache.set(country, { expires_at: Date.now() + TRENDS_CACHE_MS, trends });
    return trends;
  })().finally(() => pendingTrends.delete(country));
  pendingTrends.set(country, request);
  return request;
}

function xHistory(payload: XGuestSignalsPayload) {
  const historyByUrl = new Map<string, XVelocityHistory>();
  const historyItems = payload.history?.status === "available" && Array.isArray(payload.history.items)
    ? payload.history.items as HistoryItem[]
    : [];
  for (const item of historyItems) {
    if (item.source !== "x" || typeof item.source_url !== "string") continue;
    const metrics = item.metric_history?.metrics;
    if (!metrics) continue;
    const deltas = {
      likes: metrics.likes?.delta,
      replies: metrics.replies?.delta,
      reposts: metrics.reposts?.delta,
      quotes: metrics.quotes?.delta,
      bookmarks: metrics.bookmarks?.delta,
    };
    const records = Object.values(metrics).filter((metric): metric is MetricDelta => Boolean(metric));
    const first = Math.min(...records.map((metric) => Date.parse(metric.first_observed_at ?? "")).filter(Number.isFinite));
    const last = Math.max(...records.map((metric) => Date.parse(metric.last_observed_at ?? "")).filter(Number.isFinite));
    const observedSeconds = (last - first) / 1_000;
    const windows = Math.max(item.observation_windows ?? 0, ...records.map((metric) => metric.observation_windows ?? 0));
    if (!Number.isFinite(observedSeconds) || observedSeconds < 60 || windows < 2) continue;
    historyByUrl.set(item.source_url, {
      observed_seconds: observedSeconds,
      engagement_delta: weightedXEngagement(deltas),
      observation_windows: windows,
    });
  }
  return historyByUrl;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const keywords = parseXKeywords(url.searchParams.get("keywords"));
  const country = parseXCountry(url.searchParams.get("country"));
  const [signalResult, trendResult, publicResult] = await Promise.allSettled([
    observedXGuestSignals(),
    loadXTrends(country),
    observedPublicSignals(),
  ]);

  const signalPayload = signalResult.status === "fulfilled" ? signalResult.value : null;
  const xStatus = signalPayload?.source;
  const rawXItems = signalPayload?.items ?? [];
  const trends = trendResult.status === "fulfilled" ? trendResult.value : [];
  const publicPayload = publicResult.status === "fulfilled" ? publicResult.value : null;
  const authConfiguration = xAuthConfiguration(request);
  const resolvedSession = authConfiguration.configured ? await resolveXUserSession(request, authConfiguration) : { session: null, cookie: undefined };
  let personalXItems: ReturnType<typeof normalizeXHomeTimeline> = [];
  let personalizationReason: string | undefined;
  if (resolvedSession.session) {
    try {
      personalXItems = normalizeXHomeTimeline(await fetchXHomeTimeline(resolvedSession.session.accessToken, resolvedSession.session.user.id));
    } catch {
      personalizationReason = "Your X session is connected, but the home timeline is temporarily unavailable.";
    }
  }
  const combinedSignals = [...personalXItems.slice(0, 60), ...rawXItems].filter((signal, index, signals) => signals.findIndex((candidate) => candidate.source_url === signal.source_url) === index);
  const items = enrichXSignals(rankXSignals(combinedSignals, keywords, signalPayload ? xHistory(signalPayload) : new Map()));
  const relevantItems = items.filter((item) => item.personalized || item.score.relevance >= 20);
  const creators = buildEmergingCreators(relevantItems, X_WATCHED_HANDLES);
  const storylines = buildStorylines(relevantItems, trends);
  const briefing = buildMorningBriefing(relevantItems, trends, keywords);
  const officialLaunchEvidence = publicPayload ? await observedOfficialAnnouncements().catch(()=>[]) : [];
  const launches = buildLaunchEvents(items, officialLaunchEvidence);
  const opportunities = buildGrowthOpportunities(relevantItems, keywords);
  const publicSignals = [...enrichXSignals(rankXSignals(rawXItems, keywords)), ...officialLaunchEvidence];
  let awareness: {events:RadarEvent[];storage:string;checked_at:string;reason?:string};
  try {
    awareness = await updateRadarAwareness({signals:publicSignals,trends,keywords,observedAt:signalPayload?.generated_at},await radarDatabase());
  } catch {
    awareness = {events:buildRadarEvents(publicSignals,trends,keywords),storage:'unavailable',checked_at:new Date().toISOString(),reason:'History storage is unavailable. Showing this scan only.'};
  }

  if (!items.length && !trends.length && !awareness.events.length) {
    return Response.json(
      { detail: "X sources are temporarily unavailable. Retry shortly." },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }

  return Response.json({
    schema_version: 6,
    mode: "x_only_radar",
    generated_at: signalPayload?.generated_at ?? new Date().toISOString(),
    refresh_after_seconds: signalPayload?.refresh_after_seconds ?? 60,
    query: { keywords, country },
    watched_handles: X_WATCHED_HANDLES,
    sources: {
      posts: {
        status: items.length ? (xStatus?.status ?? "live") : "degraded",
        label: xStatus?.label ?? "X public watched timelines",
        item_count: items.length,
        reason: items.length ? xStatus?.reason : "No matching watched-account posts were returned.",
      },
      trends: {
        status: trends.length ? "live" : "degraded",
        label: "XTapDown topic board",
        item_count: trends.length,
        reason: trends.length ? undefined : "The secondary trend board is temporarily unavailable.",
      },
      discovery: {
        status: creators.length ? "live" : "degraded",
        label: "Creator mentions in tracked X posts",
        item_count: creators.length,
        reason: creators.length ? undefined : "No new creator mentions appeared in this scan.",
      },
      personalization: {
        status: resolvedSession.session ? (personalXItems.length ? "live" : "degraded") : "disconnected",
        label: "Your X home timeline",
        item_count: personalXItems.length,
        reason: personalizationReason ?? (authConfiguration.configured ? undefined : authConfiguration.reason),
      },
      launches: {
        status: launches.length ? "live" : publicResult.status === "fulfilled" ? "quiet" : "degraded",
        label: "Cross-source launch evidence",
        item_count: launches.length,
        reason: launches.length
          ? undefined
          : publicResult.status === "fulfilled"
            ? "No time-bound launch evidence matched this scan."
            : "Official launch sources are temporarily unavailable.",
      },
    },
    score_method: {
      name: "Observable X virality potential v4",
      version: X_OBSERVABLE_SCORE_VERSION,
      weights: { velocity: 24, acceleration: 14, engagement: 12, conversation_quality: 10, attention_quality: 8, creator_lift: 10, recency: 8, niche_relevance: 10, evidence_depth: 4 },
      methodology: "Uses X's public action taxonomy as a guide, while scoring only aggregate signals this app can directly observe.",
      reference_url: "https://github.com/xai-org/x-algorithm",
      unavailable_signals: ["personalized action probabilities", "dwell time", "not interested", "mute", "block", "report"],
      limitation: `${X_OBSERVABLE_SCORE_LIMITATION} Potential is not a guarantee. Growing Fast requires at least two snapshots and 2× either the feed or creator baseline.`,
    },
    items,
    trends,
    creators,
    storylines,
    briefing,
    launches,
    awareness,
    opportunities,
    personalization: {
      configured: authConfiguration.configured,
      authenticated: Boolean(resolvedSession.session),
      user: resolvedSession.session?.user,
      basis: resolvedSession.session ? "reverse_chronological_home_timeline" : "niche_and_curated_creators",
    },
  }, {
    headers: {
      "cache-control": resolvedSession.session ? "private, no-store" : "private, max-age=30, stale-while-revalidate=90",
      "x-radar-mode": "x-only",
      ...(resolvedSession.cookie ? { "set-cookie": resolvedSession.cookie } : {}),
    },
  });
}
