"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { relatedPostsForTrend } from "../../lib/x-trend-history";
import { enrichXSignals, type EmergingCreator, type LaunchKind } from "../../lib/x-radar-intelligence";
import type { BriefingPhase, MorningBriefingStory } from "../../lib/x-radar-briefing";
import {
  DEFAULT_AUTOMATION_POLICY,
  buildActionDecision,
  buildDraftPackage,
  buildGrowthOpportunities,
  buildLaunchEvents,
  parseCompanionEnvelope,
  type DraftPackage,
  type AutomationPolicy,
  type GrowthOpportunity,
  type LaunchEvent,
} from "../../lib/x-growth-copilot";
import { DEFAULT_BRAND_PROFILE, type BrandProfile, type ContentFormat, type GeneratedArtifact } from "../../lib/x-content-engine";
import type { AutomationQueueItem } from "../../lib/x-automation-store";
import { createManualTweetDraft, parseManualTweetDrafts, updateManualTweetDraft, type ManualTweetDraft } from "../../lib/x-draft-workspace";
import { filterMemeLibrary, X_MEMES, type XMeme } from "../../lib/x-meme-library";
import { parseXKeywords, rankXSignals } from "../../lib/x-radar";
import { addAlertEvent, dismissSignal, EMPTY_SAVED_RADAR, isSignalHidden, parseSavedRadar, snoozeSignal, toggleSavedPost, type SavedRadar } from "../../lib/x-radar-saved";
import { parseRadarView, type PostFilter, type RadarView } from "../../lib/x-radar-view";
import { LeadSignalBorder } from "./lead-signal-border";
import { RadarCommand, type RadarCommandItem } from "./radar-command";
import { RadarSettingsSheet } from "./radar-settings-sheet";
import { XAlgorithmBasics } from "./x-algorithm-basics";
import { XMasterAnalytics, XMasterCreate, XMasterDraftVault, XMasterExtensionPairing, XMasterLibrary, XMasterMedia } from "./x-master-workspace";
import styles from "./x-radar.module.css";
import apple from "./apple-workspace.module.css";
import type { WorkspaceNavItem } from "./workspace-navigation";
import { MediaHeader } from "@/components/tracker/media-header";
import { type AwarenessSnapshot } from './radar-awareness';
import { notificationKey } from '../../lib/x-radar-awareness';
import { observedMetricChanges, type MetricChange } from '../../lib/x-live-metrics';
import { TrendingTopics } from "./trending-topics";
import { buildTrendingTopics, type TrendingTopic } from "../../lib/x-trending";
import { SourceAvatar, LivePostMetrics } from './live-post-details';
import { ReferenceLibrary } from './reference-library';
import type {AttachmentInput} from '../../lib/x-references';

type RadarItem = {
  id: string;
  rank: number;
  title: string;
  body?: string;
  topic?: string;
  niche?: string;
  source: string;
  published_at?: string;
  source_url: string;
  age_seconds: number;
  creator?: { username?: string; display_name?: string; avatar_url?: string; category?: "lab" | "company" | "executive" | "creator"; organization?: string };
  media?: Array<{ type: "photo" | "video" | "animated_gif"; preview_url: string; alt_text?: string; width?: number; height?: number }>;
  observed_metrics?: { likes?: number; replies?: number; reposts?: number; quotes?: number; bookmarks?: number; views?: number };
  score: {
    model_version?: string;
    potential: number;
    velocity: number;
    acceleration: number;
    engagement: number;
    conversation_quality?: number;
    attention_quality?: number;
    evidence_depth?: number;
    creator_lift: number;
    recency: number;
    relevance: number;
    label: "breakout" | "rising_fast" | "watching" | "early";
    basis: "single_snapshot_estimate" | "multi_snapshot_observed";
    confidence: "estimated" | "observed";
  };
  is_big_launch?: boolean;
  is_growing_fast?: boolean;
  launch_kind?: LaunchKind | null;
  score_reasons?: string[];
  triage: { priority_score: number; tier: "act_now" | "watch" | "background" };
  growth?: {
    rate_per_hour: number;
    baseline_rate_per_hour: number;
    baseline_multiplier: number;
    creator_baseline_rate_per_hour?: number;
    creator_baseline_multiplier?: number;
    basis: "single_snapshot_estimate" | "multi_snapshot_observed";
    state?: "watch" | "observed";
  };
  personalized?: boolean;
  personalization_reason?: "from_your_home_timeline";
};

type SourceState = { status: "live" | "degraded"; label: string; item_count: number; reason?: string };
type PersonalizationSource = { status: "live" | "degraded" | "disconnected"; label: string; item_count: number; reason?: string };
type LaunchSource = { status: "live" | "quiet" | "degraded"; label: string; item_count: number; reason?: string };

type RadarPayload = {
  schema_version?: number;
  mode: "x_only_radar" | "x_growth_copilot";
  generated_at: string;
  refresh_after_seconds: number;
  query: { keywords: string[]; country: string };
  watched_handles: string[];
  sources: { posts: SourceState; trends: SourceState; discovery?: SourceState; personalization?: PersonalizationSource; launches?: LaunchSource };
  score_method: {
    name: string;
    weights: { velocity: number; acceleration?: number; engagement: number; creator_lift?: number; recency: number; niche_relevance: number };
    limitation: string;
  };
  items: RadarItem[];
  trends: Array<{ rank: number; name: string; query: string; url: string; is_hashtag: boolean }>;
  creators?: EmergingCreator[];
  briefing?: MorningBriefingStory[];
  launches?: LaunchEvent[];
  awareness?: AwarenessSnapshot;
  opportunities?: GrowthOpportunity[];
  personalization?: { configured: boolean; authenticated: boolean; user?: { id: string; username: string; name: string; profileImageUrl?: string }; basis: "reverse_chronological_home_timeline" | "niche_and_curated_creators" };
};

type AlertSettings = { enabled: boolean; threshold: number; seen: string[] };
type SortMode = "priority" | "potential" | "newest" | "velocity";
type SignalFilter = "all" | "observed" | "media" | "labs" | "executives" | "creators";
type LaunchFilter = "all" | LaunchKind;
type UndoState = { message: string; previous: SavedRadar };
type SuggestedTweetDraft = {
  id: string;
  text: string;
  format: "x_reply" | "x_quote" | "x_post" | "meme";
  source_url: string;
  author: string;
  state: string;
};
type AutomationPayload = {
  authenticated: true;
  profile: BrandProfile;
  policy: AutomationPolicy;
  queue: AutomationQueueItem[];
  capabilities: { ai_generation: boolean; direct_publishing: boolean; autopilot: boolean; automated_replies: boolean; quote_mode: "manual_composer" };
};

const SETTINGS_KEY = "x-virality-radar/settings-v1";
const SAVED_RADAR_KEY = "x-virality-radar/saved-v1";
const TWEET_DRAFTS_KEY = "x-virality-radar/tweet-drafts-v1";
const DEFAULT_KEYWORDS = "ai, agents, coding, developer tools, typescript, react, python, startups";
const DEFAULT_ALERTS: AlertSettings = { enabled: false, threshold: 70, seen: [] };
const COUNTRIES = [
  ["CA", "Canada"], ["US", "United States"], ["GB", "United Kingdom"], ["AU", "Australia"],
  ["IN", "India"], ["JP", "Japan"], ["DE", "Germany"], ["BR", "Brazil"],
] as const;
const LAB_HANDLES = new Set(["@openai", "@anthropicai", "@googledeepmind", "@alibaba_qwen"]);
const BRIEF_PHASES: BriefingPhase[] = ["breaking", "overnight", "anticipated", "still_moving"];

function compactNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)
    : "—";
}

function ageLabel(seconds: number) {
  if (seconds < 60) return "now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

function multiplierLabel(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function readAlertSettings(): AlertSettings {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<AlertSettings> | null;
    return {
      enabled: value?.enabled === true,
      threshold: typeof value?.threshold === "number" && value.threshold >= 50 && value.threshold <= 95 ? value.threshold : DEFAULT_ALERTS.threshold,
      seen: Array.isArray(value?.seen) ? value.seen.filter((id): id is string => typeof id === "string").slice(-400) : [],
    };
  } catch {
    return DEFAULT_ALERTS;
  }
}

function readSavedRadar(): SavedRadar {
  try { return parseSavedRadar(JSON.parse(localStorage.getItem(SAVED_RADAR_KEY) ?? "null")); }
  catch { return EMPTY_SAVED_RADAR; }
}

function readManualTweetDrafts(): ManualTweetDraft[] {
  try { return parseManualTweetDrafts(JSON.parse(localStorage.getItem(TWEET_DRAFTS_KEY) ?? "null")); }
  catch { return []; }
}

function itemMatchesAlertScope(item: RadarItem, saved: SavedRadar) {
  if (saved.alert_scope === "growing") return item.is_growing_fast === true;
  if (saved.alert_scope === "launches") return item.is_big_launch === true;
  if (saved.alert_scope === "saved") {
    const creator = item.creator?.username?.toLocaleLowerCase("en-US");
    return saved.posts.some((post) => post.id === item.id)
      || saved.creators.some((handle) => handle.toLocaleLowerCase("en-US") === creator)
      || saved.topics.some((topic) => `${item.title} ${item.body ?? ""}`.toLocaleLowerCase("en-US").includes(topic.toLocaleLowerCase("en-US")));
  }
  return true;
}

function elapsedLabel(iso: string) {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "Recently";
  const seconds = Math.max(0, Math.floor((Date.now() - parsed) / 1_000));
  if (seconds < 60) return "Just now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3_600)}h ago`;
}

function briefingPhaseLabel(phase: BriefingPhase) {
  if (phase === "breaking") return "Right now";
  if (phase === "overnight") return "Missed overnight";
  if (phase === "anticipated") return "Coming next";
  return "Still moving";
}

function briefingPhaseDescription(phase: BriefingPhase) {
  if (phase === "breaking") return "Moving fastest across your niche";
  if (phase === "overnight") return "What mattered while you were away";
  if (phase === "anticipated") return "Launches and announcements gaining anticipation";
  return "Important conversations from the last few days";
}

function engagementIntents(sourceUrl: string) {
  const postId = sourceUrl.match(/\/status\/(\d+)/)?.[1];
  return {
    quote: `https://x.com/intent/post?url=${encodeURIComponent(sourceUrl)}`,
    reply: postId ? `https://x.com/intent/post?in_reply_to=${postId}` : sourceUrl,
    repost: postId ? `https://x.com/intent/retweet?tweet_id=${postId}` : sourceUrl,
  };
}

function replyIntent(sourceUrl: string, text: string) {
  const postId = sourceUrl.match(/\/status\/(\d+)/)?.[1];
  const url = new URL("https://x.com/intent/post");
  if (postId) url.searchParams.set("in_reply_to", postId);
  url.searchParams.set("text", text.slice(0, 280));
  return url.toString();
}

function contentIntent(sourceUrl: string, text: string, format: ContentFormat) {
  if (format === "x_reply") return replyIntent(sourceUrl, text);
  const url = new URL("https://x.com/intent/post");
  const copy = format === "x_quote" ? `${text}\n\n${sourceUrl}` : text;
  url.searchParams.set("text", copy.slice(0, 280));
  return url.toString();
}

function dueLabel(iso: string | null) {
  if (!iso) return "No timer";
  const minutes = Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 60_000));
  return minutes ? `in ${minutes}m` : "due now";
}

export default function XRadarPage() {
  const [payload, setPayload] = useState<RadarPayload | null>(null);
  const [keywords, setKeywords] = useState(DEFAULT_KEYWORDS);
  const [country, setCountry] = useState("CA");
  const [activeKeywords, setActiveKeywords] = useState(DEFAULT_KEYWORDS);
  const [activeCountry, setActiveCountry] = useState("CA");
  const [alerts, setAlerts] = useState<AlertSettings>(DEFAULT_ALERTS);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [lastAlert, setLastAlert] = useState("");
  const [activeView, setActiveView] = useState<RadarView>("posts");
  const [localWorkspace, setLocalWorkspace] = useState(false);
  useEffect(() => { const controller = new AbortController(); void fetch("/api/x-master/auth", { signal: controller.signal }).then(r => r.json()).then(auth => setLocalWorkspace(auth.local === true)).catch(() => {}); return () => controller.abort(); }, []);
  const [visitedViews, setVisitedViews] = useState<RadarView[]>(["brief"]);
  const [failedMedia, setFailedMedia] = useState<Set<string>>(() => new Set());
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [savedVideoView, setSavedVideoView] = useState(false);
  const [postSearch, setPostSearch] = useState("");
  const [newDraftOpen, setNewDraftOpen] = useState(false);
  const [postFilter, setPostFilter] = useState<PostFilter>("latest");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [signalFilter, setSignalFilter] = useState<SignalFilter>("all");
  const [launchFilter, setLaunchFilter] = useState<LaunchFilter>("all");
  const [savedRadar, setSavedRadar] = useState<SavedRadar>(EMPTY_SAVED_RADAR);
  const [savedReady, setSavedReady] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [expandedStoryId, setExpandedStoryId] = useState<string | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [companionItems, setCompanionItems] = useState<RadarItem[]>([]);
  const [companionSeen, setCompanionSeen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, DraftPackage>>({});
  const [manualDrafts, setManualDrafts] = useState<ManualTweetDraft[]>([]);
  const [manualDraftsReady, setManualDraftsReady] = useState(false);
  const [newDraftText, setNewDraftText] = useState("");
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});
  const [memeSearch, setMemeSearch] = useState("");
  const [selectedMemeId, setSelectedMemeId] = useState<string | null>(null);
  const [automation, setAutomation] = useState<AutomationPayload | null>(null);
  const [automationProfile, setAutomationProfile] = useState<BrandProfile>(DEFAULT_BRAND_PROFILE);
  const [automationPolicy, setAutomationPolicy] = useState<AutomationPolicy>(DEFAULT_AUTOMATION_POLICY);
  const [contentFormats, setContentFormats] = useState<Record<string, ContentFormat>>({});
  const [automationBusy, setAutomationBusy] = useState<string | null>(null);
  const [discordConfigured, setDiscordConfigured] = useState(false);
  const [, setMonitorMode] = useState('inactive');
  const firstLoad = useRef(true);
  const newDraftRef = useRef<HTMLTextAreaElement>(null);
  const previousItemIds = useRef<Set<string>>(new Set());
  const previousMetricPayload = useRef<RadarPayload | undefined>(undefined);
  const radarRequest = useRef(0);
  const [, setMetricChanges] = useState<Record<string, MetricChange[]>>({});
  const alertsRef = useRef(DEFAULT_ALERTS);
  const [alertsReady, setAlertsReady] = useState(false);
  const savedRadarRef = useRef(EMPTY_SAVED_RADAR);
  const discordConfiguredRef = useRef(false);

  useEffect(() => {
    const restoreView = () => {
      const params = new URLSearchParams(window.location.search);
      setSavedVideoView(params.get("view") === "saved" && params.get("media") === "video");
      const parsed = parseRadarView(params.get("view"));
      const filter = params.get("filter");
      setActiveView(parsed.view);
      setVisitedViews((current) => current.includes(parsed.view) ? current : [...current, parsed.view]);
      setPostFilter(filter === "latest" || filter === "for_you" || filter === "launches" || filter === "growing" ? filter : parsed.filter);
      setExpandedStoryId(null);
      setExpandedPostId(null);
      document.getElementById("workspace-content")?.focus({ preventScroll: true });
    };
    window.addEventListener("popstate", restoreView);
    return () => window.removeEventListener("popstate", restoreView);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const restored = readAlertSettings();
      alertsRef.current = restored;
      setAlerts(restored);
      setAlertsReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setManualDrafts(readManualTweetDrafts());
      setManualDraftsReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      setSavedVideoView(params.get("view") === "saved" && params.get("media") === "video");
      const sharedKeywords = params.get("keywords")?.trim().slice(0, 512);
      const sharedCountry = params.get("country")?.toUpperCase();
      const parsedView = parseRadarView(params.get("view"));
      const explicitFilter = params.get("filter") ?? params.get("facet");
      const authResult = params.get("x_auth");
      if (sharedKeywords) {
        setKeywords(sharedKeywords);
        setActiveKeywords(sharedKeywords);
      }
      if (sharedCountry && COUNTRIES.some(([code]) => code === sharedCountry)) {
        setCountry(sharedCountry);
        setActiveCountry(sharedCountry);
      }
      setActiveView(parsedView.view);
      setVisitedViews((current) => current.includes(parsedView.view) ? current : [...current, parsedView.view]);
      setPostFilter(explicitFilter === "latest" || explicitFilter === "for_you" || explicitFilter === "launches" || explicitFilter === "growing" ? explicitFilter : parsedView.filter);
      if (authResult === "connected") setLastAlert("X connected. Your brief now includes your home timeline.");
      if (authResult === "denied") setLastAlert("X connection was cancelled.");
      if (authResult === "failed") setLastAlert("X connection failed. Please retry.");
      if (authResult === "setup_required") setLastAlert("X OAuth setup is required before account connection can start.");
      if (authResult) {
        params.delete("x_auth");
        const cleanQuery = params.toString();
        window.history.replaceState({}, "", `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}`);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = readSavedRadar();
      savedRadarRef.current = stored;
      setSavedRadar(stored);
      setSavedReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!alertsReady) return;
    alertsRef.current = alerts;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(alerts)); } catch { /* Device-local preferences are optional. */ }
  }, [alerts, alertsReady]);

  useEffect(() => {
    savedRadarRef.current = savedRadar;
    if (!savedReady) return;
    try { localStorage.setItem(SAVED_RADAR_KEY, JSON.stringify(savedRadar)); } catch { /* Device-local preferences are optional. */ }
  }, [savedRadar, savedReady]);

  useEffect(() => {
    if (!manualDraftsReady) return;
    try { localStorage.setItem(TWEET_DRAFTS_KEY, JSON.stringify(manualDrafts)); } catch { /* Device-local drafts are optional. */ }
  }, [manualDrafts, manualDraftsReady]);

  useEffect(() => {
    void fetch("/api/x-radar/discord", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ configured?: boolean }> : null)
      .then((status) => {
        const configured = status?.configured === true;
        discordConfiguredRef.current = configured;
        setDiscordConfigured(configured);
      })
      .catch(() => { /* Web alerts remain available if Discord status cannot load. */ });
  }, []);

  useEffect(() => {
    function receiveCompanion(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data as { source?: unknown; type?: unknown; payload?: unknown } | null;
      if (!message || message.source !== "x-radar-companion" || message.type !== "snapshot") return;
      try {
        const envelope = parseCompanionEnvelope(message.payload);
        const normalized = envelope.posts.map((post) => ({
          id: post.id,
          title: post.title || post.body || "X post",
          body: post.body,
          topic: post.topic || "Your X timeline",
          niche: post.niche || "Personal X",
          source: "x",
          source_url: post.source_url || post.url || "",
          age_seconds: Math.max(0, post.age_seconds || (post.age_minutes || 0) * 60),
          published_at: post.published_at,
          creator: post.creator ? { username: post.creator.username, display_name: post.creator.name, category: "creator" as const } : undefined,
          observed_metrics: post.observed_metrics,
          personalized: true,
          personalization_reason: "from_your_home_timeline" as const,
        }));
        setCompanionItems(enrichXSignals(rankXSignals(normalized, parseXKeywords(activeKeywords), new Map())) as RadarItem[]);
        setCompanionSeen(true);
      } catch {
        setLastAlert("Companion data rejected: refresh X and retry.");
      }
    }
    window.addEventListener("message", receiveCompanion);
    window.postMessage({ source: "x-radar-web", type: "request-snapshot", version: 1 }, window.location.origin);
    return () => window.removeEventListener("message", receiveCompanion);
  }, [activeKeywords]);

  const loadRadar = useCallback(async (quiet = false) => {
    const request = ++radarRequest.current;
    if (quiet) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ keywords: activeKeywords, country: activeCountry });
      const response = await fetch(`/api/x-radar?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Live X sources did not respond.");
      const nextPayload = await response.json() as RadarPayload;
      if (request !== radarRequest.current) return;
      if (!(["x_only_radar", "x_growth_copilot"] as string[]).includes(nextPayload.mode) || !Array.isArray(nextPayload.items)) throw new Error("The X source returned an unexpected response.");

      const previous = previousMetricPayload.current;
      const observedAt = Date.parse(nextPayload.generated_at);
      if (previous && observedAt < Date.parse(previous.generated_at)) return;
      // A cached timestamp is not a second observation, even if a source changes
      // its cached response body. Keep the last established count baseline.
      if (previous && observedAt === Date.parse(previous.generated_at)) {
        const established = new Map(previous.items.map(item => [item.id, item.observed_metrics]));
        nextPayload.items = nextPayload.items.map(item => established.has(item.id) ? { ...item, observed_metrics: established.get(item.id) } : item);
      }
      const fresh = Date.now() - observedAt <= 300_000 && observedAt <= Date.now() + 5_000;
      const previousPosts = new Map(previous?.items.map(item => [item.id, item]));
      const changes = Object.fromEntries(nextPayload.items.map(item => {
        const before = previousPosts.get(item.id);
        return [item.id, fresh ? observedMetricChanges(before && previous ? { at: previous.generated_at, metrics: before.observed_metrics ?? {} } : undefined,
          { at: nextPayload.generated_at, metrics: item.observed_metrics ?? {} }) : []];
      }));
      setMetricChanges(changes);
      const nextTopics = buildTrendingTopics(nextPayload, previous);
      setTrendingTopics(current => nextTopics.map(topic => {
        // Keep measured activity through a repeated cache response, only while fresh.
        const established = previous && observedAt === Date.parse(previous.generated_at) && fresh ? current.find(item => item.id === topic.id) : undefined;
        return established ? { ...topic, activity: established.activity } : topic;
      }));
      previousMetricPayload.current = nextPayload;

      const currentIds = new Set(nextPayload.items.map((item) => item.id));
      const arrivedIds = firstLoad.current
        ? new Set<string>()
        : new Set(nextPayload.items.filter((item) => !previousItemIds.current.has(item.id)).map((item) => item.id));
      setNewItemIds(arrivedIds);
      previousItemIds.current = currentIds;
      setPayload(nextPayload);
      setLastCheckedAt(new Date());
      setCountdown(nextPayload.refresh_after_seconds);
      void fetch('/api/x-radar/discord',{cache:'no-store'}).then(r=>r.json() as Promise<{monitor?:string;configured?:boolean}>).then(status=>{setMonitorMode(status.monitor??'inactive');setDiscordConfigured(Boolean(status.configured));}).catch(()=>setMonitorMode('inactive'));
      if (arrivedIds.size > 0 && parseRadarView(new URLSearchParams(window.location.search).get("view")).view !== "trending") setLastAlert(`${arrivedIds.size} new ${arrivedIds.size === 1 ? "post" : "posts"} added to Latest.`);

      const alertSettings = alertsRef.current;
      const alertable = nextPayload.items.filter((item) => item.triage.priority_score >= alertSettings.threshold && itemMatchesAlertScope(item, savedRadarRef.current));
      const storyAlerts = (nextPayload.awareness?.events ?? []).filter(event=>{
        const saved=savedRadarRef.current;
        const inScope=saved.alert_scope==='all'
          || (saved.alert_scope==='launches' && event.kind==='launch')
          || (saved.alert_scope==='growing' && event.kind==='breakout')
          || (saved.alert_scope==='saved' && event.posts.some(post=>saved.posts.some(p=>p.id===post.id)
            || saved.creators.some(handle=>handle.toLowerCase()===post.author.toLowerCase())
            || saved.topics.some(topic=>`${event.title} ${post.title}`.toLowerCase().includes(topic.toLowerCase()))));
        return event.alert && inScope && !alertSettings.seen.includes(notificationKey(event)) && Date.parse(event.published_at)>Date.now()-48*3600000;
      });
      const delivered: string[] = [];
      if(alertSettings.enabled && typeof Notification!=='undefined' && Notification.permission==='granted') {
        for(const event of storyAlerts.slice(0,3)) {
          try {new Notification(`${event.kind==='launch'?'Major launch':event.kind==='topic'?'Trending topic':'Breakout post'} · ${event.title}`,{body:event.why,tag:notificationKey(event)});delivered.push(notificationKey(event));}catch{/* Retry unsent notifications on a later scan. */}
        }
      }
      const unseen = alertable.filter((item) => !alertSettings.seen.includes(item.id));
      if (!nextPayload.awareness && !firstLoad.current && unseen.length) {
        const strongest = unseen[0];
        delivered.push(strongest.id);
        setSavedRadar((current) => addAlertEvent(current, { id: `${strongest.id}-${Date.now()}`, item_id: strongest.id, title: strongest.title, source_url: strongest.source_url, score: strongest.triage.priority_score, created_at: new Date().toISOString() }));
        if (alertSettings.enabled) setLastAlert(`${strongest.creator?.username ?? "X post"} reached ${strongest.triage.priority_score} priority`);
        if (alertSettings.enabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("X Master", {
            body: `${strongest.creator?.username ?? "Post"}: ${strongest.triage.priority_score} priority — ${strongest.title.slice(0, 110)}`,
            tag: strongest.id,
          });
        }
      }
      setAlerts((current) => {
        const nextSeen = Array.from(new Set([...current.seen, ...delivered])).slice(-400);
        return nextSeen.length === current.seen.length && nextSeen.every((id, index) => id === current.seen[index]) ? current : { ...current, seen: nextSeen };
      });
      firstLoad.current = false;
    } catch (reason) {
      if (request !== radarRequest.current) return;
      setMetricChanges({});
      setError(reason instanceof Error ? reason.message : "Could not load X data.");
    } finally {
      if (request === radarRequest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [activeCountry, activeKeywords]);

  useEffect(() => {
    const kickoff = window.setTimeout(() => void loadRadar(), 0);
    const refresh = window.setInterval(() => void loadRadar(true), 60_000);
    const clock = window.setInterval(() => setCountdown((seconds) => Math.max(0, seconds - 1)), 1_000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(refresh);
      window.clearInterval(clock);
    };
  }, [loadRadar]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadRadar(true);
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadRadar]);

  function applySettings(event: FormEvent) {
    event.preventDefault();
    firstLoad.current = true;
    previousItemIds.current = new Set();
    setActiveKeywords(keywords);
    setActiveCountry(country);
    setSettingsOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set("keywords", keywords);
    url.searchParams.set("country", country);
    url.searchParams.set("view", activeView);
    if (activeView === "posts") url.searchParams.set("filter", postFilter); else url.searchParams.delete("filter");
    url.searchParams.delete("facet");
    url.searchParams.delete("discovery");
    window.history.replaceState({}, "", url);
  }

  function chooseView(view: RadarView) {
    setSavedVideoView(false);
    setActiveView(view);
    setVisitedViews((current) => current.includes(view) ? current : [...current, view]);
    setExpandedStoryId(null);
    setExpandedPostId(null);
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    url.searchParams.delete("media");
    if (view === "posts") url.searchParams.set("filter", postFilter); else url.searchParams.delete("filter");
    url.searchParams.delete("facet");
    url.searchParams.delete("discovery");
    if (url.href !== window.location.href) window.history.pushState({}, "", url);
    document.getElementById("workspace-content")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function choosePostFilter(filter: PostFilter) {
    setPostFilter(filter);
    setActiveView("posts");
    const url = new URL(window.location.href);
    url.searchParams.set("view", "posts");
    url.searchParams.set("filter", filter);
    url.searchParams.delete("facet");
    window.history.replaceState({}, "", url);
  }

  async function savePost(item: RadarItem) {
    const wasSaved=savedRadar.posts.some(post=>post.id===item.id);
    setSavedRadar((current) => toggleSavedPost(current, { id: item.id, title: item.body ?? item.title, source_url: item.source_url, creator: item.creator, score: item.score.potential }));
    if(wasSaved){setLastAlert('Removed from this device. Account saves are kept.');return;}
    try{
      const auth=await fetch('/api/x-master/auth',{cache:'no-store',signal:AbortSignal.timeout(10000)}).then(response=>response.json() as Promise<{user?:unknown}>);
      if(!auth.user){setLastAlert('Saved on this device.');return;}
      const attachments=(item.media??[]).slice(0,8).flatMap<AttachmentInput>((media,position)=>{try{const url=new URL(media.preview_url);if(url.protocol!=='https:'||url.hostname!=='pbs.twimg.com')return [];return media.type==='photo'?(url.pathname.startsWith('/media/')?[{kind:'image',source_url:media.preview_url,position}]:[]):[{kind:'video',preview_url:media.preview_url,position}];}catch{return [];}});
      const response=await fetch('/api/x-master/references',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({source_url:item.source_url,source_text:item.body??item.title,author_name:item.creator?.display_name??item.creator?.username,author_avatar_url:item.creator?.avatar_url?.startsWith('https://pbs.twimg.com/')?item.creator.avatar_url:undefined,published_at:item.published_at,complete:false,attachments})});
      const data=await response.json() as {error?:string;media_configured?:boolean};if(!response.ok)throw new Error(data.error||'Cloud save failed.');setLastAlert(attachments.length?(data.media_configured?'Post saved to your library. Media queued for archiving.':'Post saved to your library. Media archiving needs setup.'):'Post saved to your cloud reference library.');
    }catch{setLastAlert('Saved on this device; cloud save was not confirmed. Import device bookmarks under Saved to retry safely.');}
  }

  function prepareDraft(opportunity: GrowthOpportunity) {
    const item = allItems.find((candidate) => candidate.id === opportunity.signal_id);
    if (!item) return;
    setDrafts((current) => ({ ...current, [opportunity.id]: buildDraftPackage(item, opportunity) }));
  }

  async function copyDraft(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setLastAlert("Draft copied. Review it, then post on X.");
    } catch {
      setLastAlert("Copy failed. Select the draft text manually.");
    }
  }

  async function saveManualDraft() {
    try {
      const id = typeof crypto.randomUUID === "function" ? `draft:${crypto.randomUUID()}` : `draft:${Date.now()}`;
      const draft = createManualTweetDraft(newDraftText, id, new Date(), selectedMemeId ?? undefined);
      setManualDrafts((current) => [draft, ...current].slice(0, 50));
      if (connectedUser) {
        const response = await fetch("/api/x-master/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: id.replace(/:/g, "-"), text: draft.text, myDraft: draft.text, media_id: draft.meme_id, createdAt: draft.created_at, updatedAt: draft.updated_at }) });
        if (!response.ok) throw new Error("Draft saved locally; cloud sync will retry.");
        window.dispatchEvent(new Event("x-master:drafts-changed"));
      }
      setNewDraftText("");
      setNewDraftOpen(false);
      setSelectedMemeId(null);
      setLastAlert(connectedUser ? "Draft saved to your account." : "Draft saved on this device.");
    } catch (error) {
      setLastAlert(error instanceof Error ? error.message : "Draft must be 1–280 characters.");
    }
  }

  function commitManualDraft(draft: ManualTweetDraft) {
    const edit = draftEdits[draft.id];
    if (edit === undefined) return;
    try {
      const updated = updateManualTweetDraft(draft, edit);
      setManualDrafts((current) => current.map((candidate) => candidate.id === draft.id ? updated : candidate));
      setDraftEdits((current) => {
        const next = { ...current };
        delete next[draft.id];
        return next;
      });
    } catch {
      setDraftEdits((current) => {
        const next = { ...current };
        delete next[draft.id];
        return next;
      });
      setLastAlert("Draft kept unchanged; tweet text cannot be empty.");
    }
  }

  function selectMeme(meme: XMeme) {
    setSelectedMemeId(meme.id);
    setLastAlert(`${meme.title} added to your next draft.`);
    window.setTimeout(() => {
      newDraftRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      newDraftRef.current?.focus({ preventScroll: true });
    }, 0);
  }

  function downloadMeme(meme: XMeme) {
    const anchor = document.createElement("a");
    anchor.href = meme.src;
    anchor.download = `${meme.id}.mp4`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function openMemeComposer(meme: XMeme, text: string) {
    window.open(contentIntent("", text, "x_post"), "_blank", "noopener,noreferrer");
    downloadMeme(meme);
    if (text.trim()) void navigator.clipboard.writeText(text).catch(() => { /* The X composer is already prefilled. */ });
    setLastAlert(`${meme.title} downloaded. Attach it in the X composer.`);
  }

  async function automationAction(action: "generate" | "approve" | "reject" | "review" | "publish", id: string, format?: ContentFormat) {
    setAutomationBusy(`${action}:${id}`);
    try {
      const response = await fetch("/api/x-radar/automation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, id, ...(format ? { format } : {}) }),
      });
      const result = await response.json() as { item?: AutomationQueueItem; detail?: string };
      if (!response.ok || !result.item) throw new Error(result.detail || "Automation action failed.");
      setAutomation((current) => current ? { ...current, queue: current.queue.map((item) => item.id === result.item?.id ? result.item : item) } : current);
      setLastAlert(action === "generate" ? "AI package generated. Review every claim before approval." : action === "publish" ? "Published through your connected X account." : `Queue item ${action}d.`);
    } catch (caught) {
      setLastAlert(caught instanceof Error ? caught.message : "Automation action failed.");
    } finally {
      setAutomationBusy(null);
    }
  }

  async function generateForOpportunity(opportunity: GrowthOpportunity, format: ContentFormat) {
    const queued = automation?.queue.find((entry) => entry.signal_id === opportunity.signal_id);
    if (!queued || !automation?.capabilities.ai_generation) {
      prepareDraft(opportunity);
      setLastAlert(queued ? "OpenAI is not configured; created a local fallback draft." : "Connect X to save AI packages; created a local fallback draft.");
      return;
    }
    await automationAction("generate", queued.id, format);
  }

  async function saveGrowthSettings() {
    setAutomationBusy("settings");
    try {
      const response = await fetch("/api/x-radar/automation", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: automationProfile, policy: automationPolicy }),
      });
      const result = await response.json() as { profile?: BrandProfile; policy?: AutomationPolicy; detail?: string };
      if (!response.ok || !result.profile || !result.policy) throw new Error(result.detail || "Could not save growth settings.");
      setAutomationProfile(result.profile);
      setAutomationPolicy(result.policy);
      setAutomation((current) => current ? { ...current, profile: result.profile!, policy: result.policy! } : current);
      setLastAlert("Growth engine settings saved.");
    } catch (caught) {
      setLastAlert(caught instanceof Error ? caught.message : "Could not save growth settings.");
    } finally {
      setAutomationBusy(null);
    }
  }

  function dismissPost(item: RadarItem) {
    setUndoState({ message: `${item.creator?.username ?? "Post"} dismissed`, previous: savedRadar });
    setSavedRadar(dismissSignal(savedRadar, item.id));
  }

  function snoozePost(item: RadarItem) {
    setUndoState({ message: `${item.creator?.username ?? "Post"} snoozed for 24 hours`, previous: savedRadar });
    setSavedRadar(snoozeSignal(savedRadar, item.id));
  }

  function toggleSavedCreator(username: string) {
    if (!/^@[A-Za-z0-9_]{1,15}$/.test(username)) return;
    setSavedRadar((current) => ({
      ...current,
      creators: current.creators.some((item) => item.toLocaleLowerCase("en-US") === username.toLocaleLowerCase("en-US"))
        ? current.creators.filter((item) => item.toLocaleLowerCase("en-US") !== username.toLocaleLowerCase("en-US"))
        : [...current.creators, username].slice(-50),
    }));
  }

  function toggleSavedTopic(topic: string) {
    if (!topic.trim() || topic.length > 120) return;
    setSavedRadar((current) => ({ ...current, topics: current.topics.includes(topic) ? current.topics.filter((item) => item !== topic) : [...current.topics, topic].slice(-50) }));
  }

  function saveNichePreset() {
    const preset = activeKeywords.trim().slice(0, 256);
    if (!preset) return;
    setSavedRadar((current) => ({ ...current, presets: current.presets.includes(preset) ? current.presets : [...current.presets, preset].slice(-12) }));
    setLastAlert("Current niche saved.");
  }

  function applyPreset(preset: string) {
    setKeywords(preset);
    setActiveKeywords(preset);
    firstLoad.current = true;
    previousItemIds.current = new Set();
  }

  function exportSavedRadar() {
    const blob = new Blob([JSON.stringify(savedRadar, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "x-radar-saved.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importSavedRadar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || file.size > 100_000) {
      if (file) setLastAlert("Import rejected: choose a JSON file under 100 KB.");
      return;
    }
    try {
      setSavedRadar(parseSavedRadar(JSON.parse(await file.text())));
      setLastAlert("Saved Radar imported.");
    } catch {
      setLastAlert("Import rejected: invalid Radar JSON.");
    }
  }

  async function toggleAlerts() {
    if (alerts.enabled) {
      setAlerts((current) => ({ ...current, enabled: false }));
      setLastAlert("Browser alerts paused.");
      return;
    }
    if (typeof Notification === "undefined") {
      setLastAlert("Browser notifications are unavailable here.");
      return;
    }
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission === "granted") {
      setAlerts((current) => ({ ...current, enabled: true }));
      setLastAlert("Alerts enabled while this page is open.");
    } else setLastAlert("Notification permission was not granted.");
  }

  async function disconnectX() {
    try {
      const response = await fetch("/api/x-auth/disconnect", { method: "POST", headers: { "content-type": "application/json" } });
      if (!response.ok) throw new Error();
      setLastAlert("X account disconnected.");
      setAutomation(null);
      firstLoad.current = true;
      await loadRadar(true);
    } catch {
      setLastAlert("Could not disconnect X. Retry shortly.");
    }
  }

  const keywordList = payload?.query.keywords ?? activeKeywords.split(",").map((word) => word.trim().toLowerCase()).filter(Boolean);
  const allItems = [...companionItems, ...(payload?.items ?? [])]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.source_url === item.source_url) === index);
  const matchingItems = allItems.filter((item) => item.score.relevance > 0);
  const matchingTrendNames = new Set(
    (payload?.trends ?? []).filter((trend) => keywordList.some((keyword) => trend.name.toLowerCase().includes(keyword))).map((trend) => trend.name),
  );
  const relevantTrends = (payload?.trends ?? [])
    .filter((trend) => matchingTrendNames.has(trend.name) || relatedPostsForTrend(trend.name, matchingItems, 1).length > 0)
    .slice(0, 6);
  const latestItems = allItems.filter((item) => !isSignalHidden(savedRadar, item.id));
  const activeItems = matchingItems.filter((item) => !isSignalHidden(savedRadar, item.id));
  const alertQueue = activeItems.filter((item) => item.triage.priority_score >= alerts.threshold && itemMatchesAlertScope(item, savedRadar));
  const launchItems = activeItems.filter((item) => item.is_big_launch);
  const fastItems = activeItems.filter((item) => item.is_growing_fast);
  const opportunities = buildGrowthOpportunities(allItems, keywordList);
  const doNext = opportunities.filter((opportunity) => opportunity.visible && opportunity.action !== "skip").slice(0, 6);
  const hiddenByCopilot = opportunities.filter((opportunity) => !opportunity.visible);
  const launchEvents = (() => {
    const merged = new Map<string, LaunchEvent>((payload?.launches ?? []).map((event) => [event.id, event]));
    for (const event of buildLaunchEvents(companionItems)) if (!merged.has(event.id)) merged.set(event.id, event);
    return [...merged.values()].sort((left, right) => Number(right.should_alert) - Number(left.should_alert) || right.importance - left.importance);
  })();
  const filteredPosts = (postFilter === "latest" ? latestItems : postFilter === "launches"
    ? launchItems.filter((item) => launchFilter === "all" || item.launch_kind === launchFilter)
    : postFilter === "growing" ? fastItems : activeItems)
    .filter((item) => {
      if (signalFilter === "observed") return item.score.confidence === "observed" || item.score.basis === "multi_snapshot_observed";
      if (signalFilter === "media") return Boolean(item.media?.length);
      const handle = item.creator?.username?.toLocaleLowerCase("en-US") ?? "";
      if (signalFilter === "labs") return item.creator?.category === "lab" || item.creator?.category === "company" || LAB_HANDLES.has(handle);
      if (signalFilter === "executives") return item.creator?.category === "executive";
      if (signalFilter === "creators") return item.creator?.category === "creator" || (!item.creator?.category && !LAB_HANDLES.has(handle));
      return true;
    })
    .filter(item => !postSearch.trim() || `${item.body ?? item.title} ${item.creator?.display_name ?? ""} ${item.creator?.username ?? ""}`.toLocaleLowerCase().includes(postSearch.trim().toLocaleLowerCase()))
    .sort((left, right) => sortMode === "newest"
      ? left.age_seconds - right.age_seconds
      : sortMode === "velocity"
        ? right.score.velocity - left.score.velocity
        : sortMode === "potential"
          ? right.score.potential - left.score.potential
          : right.triage.priority_score - left.triage.priority_score || left.age_seconds - right.age_seconds);
  const morningBriefing = payload?.briefing ?? [];
  const emergingCreators = payload?.creators ?? [];
  const savedCount = savedRadar.posts.length + savedRadar.creators.length + savedRadar.topics.length;
  const queuedSignalIds = new Set((automation?.queue ?? []).filter((item) => item.artifact).map((item) => item.signal_id));
  const suggestedDrafts: SuggestedTweetDraft[] = [
    ...(automation?.queue ?? []).flatMap((item) => {
      const artifact = item.artifact;
      if (!artifact || artifact.primary.length > 280 || !(["x_reply", "x_quote", "x_post", "meme"] as string[]).includes(artifact.format)) return [];
      return [{ id: `queue:${item.id}`, text: artifact.primary, format: artifact.format as SuggestedTweetDraft["format"], source_url: item.source_url, author: item.author_handle || "Radar signal", state: item.state }];
    }),
    ...Object.entries(drafts).flatMap(([opportunityId, draft]) => {
      const opportunity = opportunities.find((candidate) => candidate.id === opportunityId);
      if (!opportunity || queuedSignalIds.has(opportunity.signal_id) || draft.primary.length > 280) return [];
      const signal = allItems.find((item) => item.id === opportunity.signal_id);
      return [{ id: `local:${opportunityId}`, text: draft.primary, format: draft.format, source_url: signal?.source_url ?? "", author: signal?.creator?.username ?? "Radar signal", state: "Local draft" }];
    }),
  ];
  const draftCount = manualDrafts.length + suggestedDrafts.length;
  const selectedMeme = selectedMemeId ? X_MEMES.find((meme) => meme.id === selectedMemeId) : undefined;
  const filteredMemes = filterMemeLibrary(X_MEMES, memeSearch);
  const navItems: WorkspaceNavItem[] = [
    { id: "brief", label: "Suggested actions", count: doNext.length + launchEvents.filter((event) => event.should_alert).length },
    { id: "trending", label: "Trending" },
    { id: "posts", label: "Posts", count: latestItems.length },
    { id: "create", label: "Write a post" },
    { id: "drafts", label: "Drafts", count: draftCount },
    { id: "library", label: "Writing style" },
    { id: "media", label: "Media" },
    { id: "analytics", label: "Analytics" },
    { id: "basics", label: "Help" },
    { id: "saved", label: "Saved", count: savedCount },
  ];
  const postFilterOptions: Array<{ id: PostFilter; label: string; count: number }> = [
    { id: "latest", label: "Latest", count: latestItems.length },
    { id: "for_you", label: "For you", count: activeItems.length },
    { id: "launches", label: "Big launches", count: launchItems.length },
    { id: "growing", label: "Growing fast", count: fastItems.length },
  ];
  const strongestStory = morningBriefing[0];
  const strongestStoryEvidence = strongestStory?.post_ids
    .map((id) => matchingItems.find((item) => item.id === id))
    .filter((item): item is RadarItem => Boolean(item))
    .slice(0, 3) ?? [];
  const connectedUser = payload?.personalization?.authenticated ? payload.personalization.user : undefined;
  const strongestStoryIntents = strongestStory ? engagementIntents(strongestStory.top_post_url) : undefined;
  const automationCandidates = doNext.map((opportunity) => ({
    opportunity,
    signal: allItems.find((item) => item.id === opportunity.signal_id),
  })).filter((candidate): candidate is { opportunity: GrowthOpportunity; signal: RadarItem } => Boolean(candidate.signal));
  const automationSignature = automationCandidates.map(({ opportunity }) => `${opportunity.signal_id}:${opportunity.opportunity_score}`).join("|");

  useEffect(() => {
    if (!connectedUser || !automationSignature) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const statusResponse = await fetch("/api/x-radar/automation", { cache: "no-store" });
        if (!statusResponse.ok) return;
        const status = await statusResponse.json() as AutomationPayload;
        const syncResponse = await fetch("/api/x-radar/automation", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "sync", candidates: automationCandidates }),
        });
        const synced = syncResponse.ok ? await syncResponse.json() as { queue?: AutomationQueueItem[] } : null;
        if (cancelled) return;
        const next = { ...status, queue: synced?.queue ?? status.queue };
        setAutomation(next);
        setAutomationProfile(next.profile);
        setAutomationPolicy(next.policy);
      } catch { /* The local queue remains usable if durable automation is unavailable. */ }
    })();
    return () => { cancelled = true; };
    // Candidate content is represented by the stable signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedUser?.id, automationSignature]);

  useEffect(() => {
    if (!pendingTarget) return;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(pendingTarget);
      if (!target) return;
      target.scrollIntoView({ block: "center", behavior: "auto" });
      target.focus({ preventScroll: true });
      setPendingTarget(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeView, pendingTarget]);

  const commandItems: RadarCommandItem[] = [
    ...navItems.map((item) => ({
      id: `view-${item.id}`,
      group: "Navigate" as const,
      label: item.label,
      detail: item.count ? `${item.count}` : undefined,
      keywords: ["view", item.id],
      onSelect: () => chooseView(item.id),
    })),
    ...matchingItems.slice(0, 16).map((item) => ({
      id: `post-${item.id}`,
      group: "Signals" as const,
      label: item.title,
      detail: `${item.creator?.username ?? "X"} · ${item.triage.priority_score} priority`,
      keywords: [item.body ?? "", item.topic ?? "", item.niche ?? "", item.creator?.username ?? ""],
      onSelect: () => {
        chooseView("posts");
        setPendingTarget(`signal-${item.id}`);
      },
    })),
    ...morningBriefing.filter((story) => !matchingItems.some((item) => item.title === story.title)).slice(0, 12).map((story) => ({
      id: `story-${story.id}`,
      group: "Signals" as const,
      label: story.title,
      detail: `${story.momentum} momentum`,
      keywords: story.reasons,
      onSelect: () => {
        chooseView("brief");
        setExpandedStoryId(story.id);
        setPendingTarget(`story-${story.id}`);
      },
    })),
    ...emergingCreators.slice(0, 8).map((creator) => ({
      id: `creator-${creator.username}`,
      group: "Creators" as const,
      label: creator.display_name,
      detail: creator.username,
      keywords: [creator.top_post_title],
      onSelect: () => {
        chooseView("brief");
        setPendingTarget(`creator-${creator.username.replace(/^@/, "")}`);
      },
    })),
    {
      id: "action-refresh",
      group: "Actions" as const,
      label: "Refresh signals",
      detail: "Fetch current X data",
      keywords: ["reload", "scan"],
      onSelect: () => void loadRadar(true),
    },
    {
      id: "action-settings",
      group: "Actions" as const,
      label: "Open settings",
      detail: "Sources, alerts, and filters",
      keywords: ["configure", "preferences"],
      onSelect: () => setSettingsOpen(true),
    },
  ];

  function renderEvidencePost(item: RadarItem) {
    const metrics = item.observed_metrics ?? {};
    return <article className={styles.evidencePost} key={item.id}>
      <div><strong>{item.creator?.display_name ?? item.creator?.username ?? "X creator"}</strong><span>{item.creator?.username} · {ageLabel(item.age_seconds)} ago</span></div>
      <p>{item.body ?? item.title}</p>
      <footer><span>{compactNumber(metrics.views)} views · {compactNumber(metrics.likes)} likes</span><a href={item.source_url} target="_blank" rel="noreferrer">Open on X ↗</a></footer>
    </article>;
  }

  return (
    <main className={`x-master-theme ${styles.shell} ${apple.workspace} ${styles.simpleWorkspace}`}>
      <a className={apple.skipLink} href="#workspace-content">Skip to content</a>
      <MediaHeader source="master" masterView={activeView} onMasterNavigate={chooseView} actions={<>
          <RadarSettingsSheet
            onOpenChange={setSettingsOpen}
            open={settingsOpen}
            trigger={<button type="button" className={styles.accountButton} aria-label="Open settings">Settings</button>}
          >
            <form className={styles.settingsForm} onSubmit={applySettings}>
              <section><h3>Your interests</h3><label><span>Topics</span><textarea value={keywords} onChange={(event) => setKeywords(event.target.value)} maxLength={512} rows={3} placeholder="ai agents, codex, automation" /><small>Separate interests with commas.</small></label><label><span>Market</span><select value={country} onChange={(event) => setCountry(event.target.value)}>{COUNTRIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label><button className={styles.primaryButton} type="submit">Apply changes</button></section>
              <section><h3>Your X account</h3>{connectedUser ? <div className={styles.connectedAccount}>{connectedUser.profileImageUrl ? <Image unoptimized src={connectedUser.profileImageUrl} alt="" width={40} height={40} referrerPolicy="no-referrer" /> : <span>{connectedUser.username.slice(1, 2).toUpperCase()}</span>}<div><strong>{connectedUser.name}</strong><small>{connectedUser.username} · read + approved publishing</small></div><button type="button" onClick={() => void disconnectX()}>Disconnect</button></div> : payload?.personalization?.configured ? <><p>Personalize ranking and enable guarded publishing. Radar never posts without your approval by default.</p><a className={styles.primaryLink} href="/api/x-auth/start">Connect X account</a></> : <p>X connection needs an OAuth Client ID. Your keywords and curated creators currently drive ranking.</p>}</section>
              <details><summary>Chrome extension</summary><XMasterExtensionPairing connected={Boolean(connectedUser) || localWorkspace} /></details>
              <details><summary>Extra tools</summary><div className={styles.extraTools}>{navItems.filter(item => !["posts", "trending", "saved", "drafts"].includes(item.id)).map(item => <button type="button" key={item.id} onClick={() => { setSettingsOpen(false); chooseView(item.id); }}>{item.label}</button>)}<Link href="/tools">News overview</Link><Link href="/tools?view=radar&source=hacker_news">Hacker News</Link><Link href="/tools?view=radar&source=github">GitHub</Link></div></details>
              <details><summary>Writing and publishing settings</summary>
              <section className={styles.growthSettings}>
                <h3>Writing profile</h3>
                <p>Ground AI output in your identity. Replies and quotes always open for human review.</p>
                <label><span>Display name</span><input type="text" maxLength={80} value={automationProfile.display_name} onChange={(event) => setAutomationProfile((current) => ({ ...current, display_name: event.target.value }))} /></label>
                <label><span>Positioning</span><textarea rows={3} maxLength={500} value={automationProfile.positioning} onChange={(event) => setAutomationProfile((current) => ({ ...current, positioning: event.target.value }))} /></label>
                <label><span>Content pillars</span><input type="text" maxLength={500} value={automationProfile.pillars.join(", ")} onChange={(event) => setAutomationProfile((current) => ({ ...current, pillars: event.target.value.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 12) }))} /></label>
                <div className={styles.policyGrid}>
                  <label><span>Daily cap</span><input type="number" min="1" max="20" value={automationPolicy.daily_cap} onChange={(event) => setAutomationPolicy((current) => ({ ...current, daily_cap: Math.max(current.hourly_cap, Number(event.target.value)) }))} /></label>
                  <label><span>Hourly cap</span><input type="number" min="1" max="4" value={automationPolicy.hourly_cap} onChange={(event) => setAutomationPolicy((current) => ({ ...current, hourly_cap: Math.min(current.daily_cap, Number(event.target.value)) }))} /></label>
                  <label><span>Minimum score</span><input type="number" min="40" max="95" value={automationPolicy.minimum_opportunity_score} onChange={(event) => setAutomationPolicy((current) => ({ ...current, minimum_opportunity_score: Number(event.target.value) }))} /></label>
                </div>
                <small>Mix: {automationPolicy.action_weights.quote}% quote · {automationPolicy.action_weights.reply}% reply · {automationPolicy.action_weights.original}% original · {automationPolicy.action_weights.repost}% repost. Active {automationPolicy.active_hours.start}:00–{automationPolicy.active_hours.end}:00 {automationPolicy.timezone}.</small>
                <label className={styles.toggleSetting}><input type="checkbox" checked={automationProfile.auto_publish_ready} onChange={(event) => setAutomationProfile((current) => ({ ...current, auto_publish_ready: event.target.checked }))} /><span>My brand profile is ready for approved originals</span></label>
                <label className={styles.toggleSetting}><input type="checkbox" disabled={!automation?.capabilities.autopilot} checked={automationPolicy.autopilot_enabled} onChange={(event) => setAutomationPolicy((current) => ({ ...current, autopilot_enabled: event.target.checked }))} /><span>Guarded autopilot for reposts and grounded originals</span></label>
                <small>{automation?.capabilities.autopilot ? "Background runner available. Replies and quotes still require you." : "Autopilot needs its server gate, encrypted token vault, and scheduled trigger. It stays off."}</small>
                <button type="button" className={styles.primaryButton} disabled={!connectedUser || automationBusy === "settings"} onClick={() => void saveGrowthSettings()}>{automationBusy === "settings" ? "Saving…" : "Save settings"}</button>
              </section>
              </details>
              <details><summary>Notifications</summary><section><h3>Alerts</h3><label><span>Priority threshold <b>{alerts.threshold}</b></span><input type="range" min="50" max="95" step="5" value={alerts.threshold} onChange={(event) => setAlerts((current) => ({ ...current, threshold: Number(event.target.value) }))} /></label><label><span>Alert for</span><select value={savedRadar.alert_scope} onChange={(event) => setSavedRadar((current) => ({ ...current, alert_scope: event.target.value as SavedRadar["alert_scope"] }))}><option value="all">All matching posts</option><option value="growing">Growing fast only</option><option value="launches">Launches only</option><option value="saved">Saved radar only</option></select></label><button type="button" onClick={() => void toggleAlerts()}>{alerts.enabled ? "Pause browser alerts" : "Enable browser alerts"}</button><small>{alertQueue.length} posts currently meet this threshold.</small></section>
              <section><h3>Background story alerts</h3><p>{discordConfigured ? "Discord delivery enabled. The background monitor delivers major launches, topics, and measured breakouts." : "External alerts are off. Set a server-side Discord webhook and explicitly enable X_RADAR_ALERTS_ENABLED to activate delivery."}</p><small>Requires an active background monitor. Queued with retries; mentions disabled. Browser scope applies only to browser alerts. Story alerts use news importance, not the post-priority threshold above.</small></section>
              </details>
              <details><summary>Post filters</summary><label><span>Posts to show</span><select value={postFilter} onChange={event => choosePostFilter(event.target.value as PostFilter)}>{postFilterOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><div className={styles.advancedFields}><label><span>Sort posts</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}><option value="priority">Best first</option><option value="potential">Virality potential</option><option value="newest">Newest</option><option value="velocity">Fastest</option></select></label><label><span>Show</span><select value={signalFilter} onChange={(event) => setSignalFilter(event.target.value as SignalFilter)}><option value="all">All relevant posts</option><option value="observed">Observed growth only</option><option value="media">Posts with media</option><option value="labs">Labs & startups</option><option value="executives">CEOs & founders</option><option value="creators">Builders & creators</option></select></label><label><span>Launch type</span><select value={launchFilter} onChange={(event) => setLaunchFilter(event.target.value as LaunchFilter)}><option value="all">All launches</option><option value="model">Models</option><option value="feature">Features</option><option value="product">Products</option><option value="company">Companies</option><option value="open_source">Open source</option><option value="other">Other</option></select></label></div></details>
              <details><summary>Saved data</summary><div className={styles.dataActions}><button type="button" onClick={saveNichePreset}>Save current niche</button><button type="button" onClick={exportSavedRadar}>Export JSON</button><label>Import JSON<input type="file" accept="application/json,.json" onChange={(event) => void importSavedRadar(event)} /></label>{savedRadar.presets.map((preset) => <button type="button" key={preset} onClick={() => applyPreset(preset)}>{preset}</button>)}</div></details>
              <details><summary>Source status</summary><div className={styles.sourceStatus}><p><span className={payload?.sources.posts.status === "live" ? styles.statusDotLive : styles.statusDotBad} />Posts: {payload?.sources.posts.status ?? "checking"}</p><p><span className={payload?.sources.trends.status === "live" ? styles.statusDotLive : styles.statusDotBad} />Trends: {payload?.sources.trends.status ?? "checking"}</p><small>Tracking {payload?.watched_handles.length ?? 60} curated accounts across labs, startups, founders, CEOs, and builders.</small><small>{payload?.score_method.limitation ?? "Virality potential is a ranking, not a guarantee."}</small></div></details>
            </form>
          </RadarSettingsSheet>
      </>} />


      <RadarCommand items={commandItems} onOpenChange={setCommandOpen} open={commandOpen} />

      {error && payload && <div className={styles.staleNotice} role="status">Refresh failed. Showing the last good snapshot. <button type="button" onClick={() => void loadRadar(true)}>Retry</button></div>}
      {lastAlert && <div className={styles.toast} role="status"><span>{lastAlert}</span><button type="button" aria-label="Dismiss message" onClick={() => setLastAlert("")}>×</button></div>}
      {undoState && <div className={styles.toast} role="status"><span>{undoState.message}</span><button type="button" onClick={() => { setSavedRadar(undoState.previous); setUndoState(null); }}>Undo</button><button type="button" aria-label="Dismiss undo message" onClick={() => setUndoState(null)}>×</button></div>}

      <div id="workspace-content" tabIndex={-1} className={`${styles.content} ${activeView === "posts" ? styles.postsContent : ""}`}>
        {activeView === "brief" && <>
          <section className={styles.viewIntro} aria-labelledby="brief-heading">
            <div><p className={styles.eyebrow}>YOUR X GROWTH COPILOT</p><h1 id="brief-heading">Do next</h1><p>{connectedUser ? `Personalized from ${connectedUser.username}, your niche, and live launch evidence.` : "The strongest actions now—ranked for timing, relevance, headroom, and risk."}</p></div>
            <div className={styles.updated}><span>{lastCheckedAt ? `Checked ${lastCheckedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}` : "Connecting…"}</span><small>{newItemIds.size ? `${newItemIds.size} new in latest scan` : `Next scan in ${countdown}s`}</small></div>
          </section>

          {payload && <div className={styles.growthConsole}>
            <section className={styles.actionQueue} aria-labelledby="action-queue-heading">
              <header><div><p className={styles.eyebrow}>ACTION ENGINE</p><h2 id="action-queue-heading">Best moves before the window closes</h2></div><span>{doNext.length} ready</span></header>
              <div className={styles.automationSummary}>
                <span><i className={automation ? styles.statusDotLive : styles.statusDotBad} />{automation ? "Durable queue" : "Local queue"}</span>
                <span>{automation?.capabilities.ai_generation ? "OpenAI live" : "Local drafts"}</span>
                <span>{automationPolicy.daily_cap}/day · {automationPolicy.hourly_cap}/hour</span>
                <span>{automationPolicy.action_weights.quote}% quote bias</span>
              </div>
              {doNext.length ? <ol>{doNext.map((opportunity) => {
                const item = allItems.find((candidate) => candidate.id === opportunity.signal_id);
                if (!item) return null;
                const queued = automation?.queue.find((entry) => entry.signal_id === opportunity.signal_id);
                const decision = queued?.decision ?? buildActionDecision(item, opportunity, automationPolicy, new Date(payload.generated_at));
                const draft: GeneratedArtifact | DraftPackage | undefined = queued?.artifact ?? drafts[opportunity.id];
                const selectedFormat = contentFormats[opportunity.id] ?? (decision.format && decision.format !== "repost" ? decision.format : "x_quote");
                const busy = Boolean(queued && automationBusy?.endsWith(queued.id));
                const actionLabel = decision.action === "original" ? "Original post" : decision.action === "repost" ? "Repost" : decision.action === "reply" ? "Reply" : decision.action === "quote" ? "Quote" : "Skip";
                return <li key={opportunity.id}>
                  <article>
                    <div className={styles.actionScore}><strong>{decision.follower_value}</strong><span>follower value</span></div>
                    <div className={styles.actionBody}>
                      <div className={styles.actionMeta}><span>{actionLabel}</span><span>{queued?.state ?? decision.state}</span><span>{dueLabel(queued?.due_at ?? decision.due_at)}</span><span>{item.creator?.username ?? "X"}</span></div>
                      <h3><a href={item.source_url} target="_blank" rel="noreferrer">{item.body ?? item.title}</a></h3>
                      <p><strong>Why now:</strong> {opportunity.why_now}</p><p><strong>Why you:</strong> {opportunity.why_you}</p>
                      <div className={styles.contentBuilder}>
                        <label><span>Make</span><select aria-label={`Content format for ${item.creator?.username ?? "this post"}`} value={selectedFormat} onChange={(event) => setContentFormats((current) => ({ ...current, [opportunity.id]: event.target.value as ContentFormat }))}><option value="x_reply">Reply</option><option value="x_quote">Quote post</option><option value="x_post">Original post</option><option value="thread">Thread package</option><option value="article">Article + X post</option><option value="meme">Meme + caption</option></select></label>
                        <button type="button" disabled={busy || decision.action === "repost"} onClick={() => void generateForOpportunity(opportunity, selectedFormat)}>{busy ? "Working…" : draft ? "Regenerate" : automation?.capabilities.ai_generation ? "Generate with AI" : "Draft locally"}</button>
                      </div>
                      <div className={styles.actionButtons}>
                        {queued && ["review", "scheduled", "failed"].includes(queued.state) && <button type="button" disabled={busy} onClick={() => void automationAction("approve", queued.id)}>Approve</button>}
                        {queued?.state === "approved" && ["original", "repost"].includes(decision.action) && <button type="button" disabled={busy || !automation?.capabilities.direct_publishing} title={automation?.capabilities.direct_publishing ? undefined : "Enable X_PUBLISHING_ENABLED and reconnect X with tweet.write"} onClick={() => void automationAction("publish", queued.id)}>Publish now</button>}
                        {draft && <a href={contentIntent(item.source_url, draft.primary, draft.format)} target="_blank" rel="noreferrer">Review on X ↗</a>}
                        {!draft && decision.action === "reply" && <a href={engagementIntents(item.source_url).reply} target="_blank" rel="noreferrer">Open reply</a>}
                        {!draft && decision.action === "quote" && <a href={engagementIntents(item.source_url).quote} target="_blank" rel="noreferrer">Open quote</a>}
                        {queued && !["published", "rejected"].includes(queued.state) ? <button type="button" disabled={busy} onClick={() => void automationAction("reject", queued.id)}>Reject</button> : <button type="button" onClick={() => dismissPost(item)}>Hide</button>}
                      </div>
                      {decision.policy_reasons.length > 0 && <details className={styles.policyReasons}><summary>Why this action</summary><ul>{decision.policy_reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>}
                      {draft && <div className={styles.draftPackage}>
                        <header><strong>{draft.format === "article" ? "Article package" : draft.format === "meme" ? "Meme package" : "Your draft"}</strong><span>Evidence: {draft.evidence_ids.length} · review required</span></header>
                        {"image_url" in draft && draft.image_url && <Image unoptimized className={styles.generatedMeme} src={draft.image_url} alt="AI-generated meme draft for review" width={1536} height={1024} />}
                        {"headline" in draft && draft.headline && <h4>{draft.headline}</h4>}
                        <p>{draft.primary}</p>
                        {"article_markdown" in draft && draft.article_markdown && <details open><summary>Article Markdown</summary><pre>{draft.article_markdown}</pre></details>}
                        <div><button type="button" onClick={() => void copyDraft("article_markdown" in draft && draft.article_markdown ? draft.article_markdown : draft.primary)}>Copy</button><a href={contentIntent(item.source_url, draft.primary, draft.format)} target="_blank" rel="noreferrer">Review on X ↗</a></div>
                        {draft.alternatives.length > 0 && <details><summary>{draft.alternatives.length} alternate angles</summary>{draft.alternatives.map((alternative) => <article key={alternative.angle}><span>{alternative.angle}</span><p>{alternative.text}</p><button type="button" onClick={() => void copyDraft(alternative.text)}>Copy</button></article>)}</details>}
                      </div>}
                    </div>
                  </article>
                </li>;
              })}</ol> : <div className={styles.consoleEmpty}><strong>No clean reply window now</strong><p>{hiddenByCopilot.length} low-fit or risky posts filtered out. Radar keeps watching.</p></div>}
            </section>

            <section className={styles.launchConsole} aria-labelledby="launch-console-heading">
              <header><div><p className={styles.eyebrow}>LAUNCH WATCH</p><h2 id="launch-console-heading">New products and model drops</h2></div><span>{launchEvents.length}</span></header>
              {launchEvents.length ? <ol>{launchEvents.slice(0, 6).map((event) => <li key={event.id}>
                <div><strong>{event.entity}</strong><span className={event.confirmation === "official" ? styles.officialBadge : styles.unverifiedBadge}>{event.confirmation === "official" ? "Official" : event.confirmation === "corroborated" ? "Corroborated" : "Unverified"}</span></div>
                <p>{event.lifecycle === "launching" ? "Launching now" : event.lifecycle === "anticipated_unverified" ? "Time-bound chatter—verify before posting" : "Confirmed"} · {event.importance} importance · {event.confidence} confidence</p>
                <footer><span>{event.evidence.length} {event.evidence.length === 1 ? "source" : "sources"}</span>{event.evidence.slice(0, 2).map((evidence) => <a key={evidence.signal_id} href={evidence.url} target="_blank" rel="noreferrer">{evidence.official ? "Official evidence" : evidence.creator || "Source"} ↗</a>)}</footer>
              </li>)}</ol> : <div className={styles.consoleEmpty}><strong>No launch crossed the evidence gate</strong><p>Official feeds and high-attention X chatter are still scanning.</p></div>}
            </section>

            <aside className={styles.companionCard}><span className={companionSeen ? styles.statusDotLive : styles.statusDotBad} /><div><strong>{companionSeen ? `Companion live · ${companionItems.length} visible posts` : "Chrome companion not detected"}</strong><p>{companionSeen ? "Your signed-in X timeline is ranking locally." : "Install the included companion to add posts visible in your own X feed without paid API reads."}</p></div><span>{hiddenByCopilot.length} filtered</span></aside>
          </div>}

          {loading && !payload ? <div className={styles.loadingState} role="status"><i /><strong>Building your brief</strong><span>Finding the stories that matter in your niche…</span></div>
            : error && !payload ? <div className={styles.emptyState} role="alert"><strong>Couldn’t reach X</strong><p>{error}</p><button type="button" onClick={() => void loadRadar()}>Try again</button></div>
              : !morningBriefing.length ? <div className={styles.emptyState}><strong>No relevant stories yet</strong><p>Broaden your interests in Settings or wait for the next scan.</p><button type="button" onClick={() => setSettingsOpen(true)}>Open settings</button></div>
                : <div className={styles.briefStack}>
                  {strongestStory && <section className={styles.leadStory} aria-label="Top story" id={`story-${strongestStory.id}`} tabIndex={-1}>
                    <LeadSignalBorder />
                    <div className={styles.leadMeta}><span>{briefingPhaseLabel(strongestStory.phase)}</span><span>{ageLabel(strongestStory.latest_age_seconds)} ago</span>{strongestStory.personalized && <span>From your X</span>}</div>
                    <h2><a href={strongestStory.top_post_url} target="_blank" rel="noreferrer">{strongestStory.title}</a></h2>
                    <p>{strongestStory.reasons[0] ?? "Strong, relevant activity across tracked X posts."}</p>
                    <div className={styles.leadActions}>{strongestStoryIntents && <><a href={strongestStoryIntents.reply} target="_blank" rel="noreferrer">Reply</a><a href={strongestStoryIntents.quote} target="_blank" rel="noreferrer">Quote</a><a href={strongestStoryIntents.repost} target="_blank" rel="noreferrer">Repost</a></>}<button type="button" aria-expanded={expandedStoryId === strongestStory.id} onClick={() => setExpandedStoryId(expandedStoryId === strongestStory.id ? null : strongestStory.id)}>{expandedStoryId === strongestStory.id ? "Hide post" : `See ${strongestStoryEvidence.length || strongestStory.post_count} ${strongestStory.post_count === 1 ? "post" : "posts"}`}</button><button type="button" aria-pressed={savedRadar.topics.includes(strongestStory.title)} onClick={() => toggleSavedTopic(strongestStory.title)}>{savedRadar.topics.includes(strongestStory.title) ? "Saved" : "Save"}</button></div>
                    {expandedStoryId === strongestStory.id && <div className={styles.evidenceList}>{strongestStoryEvidence.length ? strongestStoryEvidence.map(renderEvidencePost) : <p>No supporting post is available in this scan.</p>}</div>}
                  </section>}

                  {BRIEF_PHASES.map((phase) => {
                    const stories = morningBriefing.filter((story) => story.phase === phase && story.id !== strongestStory?.id);
                    if (!stories.length) return null;
                    return <section className={styles.briefSection} key={phase} aria-labelledby={`brief-${phase}`}>
                      <header><div><h2 id={`brief-${phase}`}>{briefingPhaseLabel(phase)}</h2><p>{briefingPhaseDescription(phase)}</p></div><span>{stories.length}</span></header>
                      <ol>{stories.map((story) => {
                        const evidence = story.post_ids.map((id) => matchingItems.find((item) => item.id === id)).filter((item): item is RadarItem => Boolean(item)).slice(0, 3);
                        const expanded = expandedStoryId === story.id;
                        const storySaved = savedRadar.topics.includes(story.title);
                        const storyIntents = engagementIntents(story.top_post_url);
                        return <li className={styles.storyRow} id={`story-${story.id}`} key={story.id} tabIndex={-1}>
                          <article>
                            <div className={styles.storyMeta}><span>{ageLabel(story.latest_age_seconds)} ago</span><span>{story.post_count} {story.post_count === 1 ? "post" : "posts"}</span>{story.trend_rank && <span>X trend #{story.trend_rank}</span>}{story.personalized && <span>From your X</span>}</div>
                            <h3><a href={story.top_post_url} target="_blank" rel="noreferrer">{story.title}</a></h3>
                            <p>{story.reasons[0] ?? "Relevant momentum across tracked posts."}</p>
                            <div className={styles.storyActions}><a href={storyIntents.reply} target="_blank" rel="noreferrer">Reply</a><a href={storyIntents.quote} target="_blank" rel="noreferrer">Quote</a><a href={storyIntents.repost} target="_blank" rel="noreferrer">Repost</a><button type="button" aria-expanded={expanded} onClick={() => setExpandedStoryId(expanded ? null : story.id)}>{expanded ? "Hide posts" : `See ${evidence.length || story.post_count} ${story.post_count === 1 ? "post" : "posts"}`}</button><button type="button" aria-pressed={storySaved} onClick={() => toggleSavedTopic(story.title)}>{storySaved ? "Saved" : "Save"}</button></div>
                            {expanded && <div className={styles.evidenceList}>{evidence.length ? evidence.map(renderEvidencePost) : <p>No supporting post is available in this scan.</p>}</div>}
                          </article>
                          <strong className={styles.momentum} aria-label={`${story.momentum} momentum`}>{story.momentum}<small>momentum</small></strong>
                        </li>;
                      })}</ol>
                    </section>;
                  })}

                  {(relevantTrends.length > 0 || emergingCreators.length > 0) && <aside className={styles.aroundNiche} aria-labelledby="around-niche-heading">
                    <header><h2 id="around-niche-heading">Intelligence rail</h2><p>Live context for this scan.</p></header>
                    <div>
                      <section className={styles.liveReadout}><h3>Live readout</h3><dl><div><dt>Posts</dt><dd>{payload?.sources.posts.item_count ?? 0}</dd></div><div><dt>Watched</dt><dd>{payload?.watched_handles.length ?? 0}</dd></div><div><dt>Next scan</dt><dd>{countdown}s</dd></div></dl><button type="button" onClick={() => void loadRadar(true)} disabled={refreshing}>{refreshing ? "Scanning…" : "Scan now"}</button></section>
                      {relevantTrends.length > 0 && <section><h3>Topics heating up</h3><ol>{relevantTrends.map((trend) => <li key={`${trend.rank}-${trend.name}`}><span>{trend.rank}</span><a href={trend.url} target="_blank" rel="noreferrer">{trend.name}</a></li>)}</ol></section>}
                      {emergingCreators.length > 0 && <section><h3>New creators to watch</h3><ul>{emergingCreators.slice(0, 4).map((creator) => {
                        const creatorSaved = savedRadar.creators.some((item) => item.toLocaleLowerCase("en-US") === creator.username.toLocaleLowerCase("en-US"));
                        return <li id={`creator-${creator.username.replace(/^@/, "")}`} key={creator.username} tabIndex={-1}><a href={creator.profile_url} target="_blank" rel="noreferrer"><strong>{creator.display_name}</strong><span>{creator.username} · mentioned in {creator.source_post_count} {creator.source_post_count === 1 ? "post" : "posts"}</span></a><button type="button" aria-pressed={creatorSaved} onClick={() => toggleSavedCreator(creator.username)}>{creatorSaved ? "Following" : "Follow"}</button></li>;
                      })}</ul></section>}
                    </div>
                  </aside>}
                </div>}
        </>}

        {activeView === "trending" && <TrendingTopics topics={trendingTopics} loading={loading} refreshing={refreshing} error={error} updatedAt={payload?.generated_at} onRefresh={() => void loadRadar(true)} />}

        {activeView === "posts" && <>
          <section className={styles.feedHeading}><h1 id="posts-heading">Posts</h1><div className={styles.feedStatus}><span>{refreshing ? "Updating…" : error ? "Update failed" : lastCheckedAt ? `Updated ${lastCheckedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Loading…"}</span><button type="button" onClick={() => void loadRadar(true)} disabled={refreshing}>Refresh</button></div></section>
          <div className={styles.feedControls}><label><span className={styles.srOnly}>Search posts</span><input type="search" value={postSearch} onChange={event => setPostSearch(event.target.value)} placeholder="Search posts" /></label><label><span className={styles.srOnly}>Sort posts</span><select aria-label="Sort posts" value={sortMode} onChange={event => setSortMode(event.target.value as SortMode)}><option value="newest">Newest</option><option value="priority">Recommended</option>{!["newest", "priority"].includes(sortMode) && <option value={sortMode}>{sortMode === "velocity" ? "Fastest" : "Virality potential"}</option>}</select></label></div>
          {(postFilter !== "latest" || signalFilter !== "all" || postSearch) && <div className={styles.activeFilters}><span>{postSearch ? `Search: ${postSearch}` : postFilterOptions.find(option => option.id === postFilter)?.label}{signalFilter !== "all" ? ` · ${signalFilter}` : ""}</span><button type="button" onClick={() => { setPostSearch(""); setSignalFilter("all"); setLaunchFilter("all"); choosePostFilter("latest"); }}>Clear filters</button></div>}
          {loading && !payload ? <div className={styles.loadingState} role="status"><i /><strong>Loading posts…</strong></div>
            : error && !payload ? <div className={styles.emptyState} role="alert"><strong>Couldn’t reach X</strong><p>{error}</p><button type="button" onClick={() => void loadRadar()}>Try again</button></div>
              : filteredPosts.length === 0 ? <div className={styles.emptyState}><strong>No posts match this view</strong><p>Try a different search or clear your filters.</p><button type="button" onClick={() => { setPostSearch(""); setSignalFilter("all"); setLaunchFilter("all"); choosePostFilter("latest"); }}>Show all posts</button></div>
                : <ol className={styles.postList}>{filteredPosts.map((item) => {
                  const metrics = item.observed_metrics ?? {};
                  const creatorName = item.creator?.display_name ?? item.creator?.username ?? "X creator";
                  const creatorHandle = item.creator?.username ?? "X account";
                  const media = item.media ?? [];
                  const postSaved = savedRadar.posts.some((post) => post.id === item.id);
                  const expanded = expandedPostId === item.id;
                  const intents = engagementIntents(item.source_url);
                  return <li className={styles.postCard} key={item.id} id={`signal-${item.id}`} tabIndex={-1}>
                    <article>
                      <header>
                        <SourceAvatar name={creatorName} src={item.creator?.avatar_url} />
                        <div className={styles.author}><strong>{creatorName}</strong><a href={item.source_url} target="_blank" rel="noreferrer">{creatorHandle}</a><time dateTime={item.published_at}>{ageLabel(item.age_seconds)} ago</time></div>

                      </header>
                      <a className={styles.postText} href={item.source_url} target="_blank" rel="noreferrer">{item.body ?? item.title}</a>
                      {media.length > 0 && <div className={styles.postMedia}>{media.slice(0, 2).map((attachment, index) => <a href={item.source_url} target="_blank" rel="noreferrer" key={`${attachment.preview_url}-${index}`} aria-label={`Open ${attachment.type} on X`}>{failedMedia.has(attachment.preview_url) ? <span className={styles.mediaUnavailable}>Image unavailable. Open on X</span> : <Image unoptimized onError={() => setFailedMedia(current => new Set(current).add(attachment.preview_url))} src={attachment.preview_url} alt={attachment.alt_text || `Media from ${creatorName}`} width={attachment.width ?? 1200} height={attachment.height ?? 675} loading="lazy" decoding="async" referrerPolicy="no-referrer" />}</a>)}</div>}
                      <div className={styles.postFooter}>
                        <LivePostMetrics metrics={metrics} />
                        <div className={styles.postActions}><a href={intents.reply} target="_blank" rel="noreferrer">Reply</a><button type="button" aria-pressed={postSaved} onClick={() => void savePost(item)}>{postSaved ? "Saved" : "Save"}</button><details className={styles.postMore}><summary>More</summary><div><a href={intents.quote} target="_blank" rel="noreferrer">Quote</a><a href={intents.repost} target="_blank" rel="noreferrer">Repost</a><button type="button" aria-expanded={expanded} onClick={event => { setExpandedPostId(expanded ? null : item.id); event.currentTarget.closest("details")?.removeAttribute("open"); }}>{expanded ? "Close details" : "Details"}</button><button type="button" onClick={() => dismissPost(item)}>Hide</button><a href={item.source_url} target="_blank" rel="noreferrer">Open on X</a></div></details></div>
                      </div>
                      {expanded && <div className={styles.postDetails}>
                        <dl><div><dt>Virality potential</dt><dd>{item.score.potential}</dd></div><div><dt>Velocity</dt><dd>{item.score.velocity}</dd></div>{typeof item.score.conversation_quality === "number" && <div><dt>Conversation quality</dt><dd>{item.score.conversation_quality}</dd></div>}{typeof item.score.attention_quality === "number" && <div><dt>Attention quality</dt><dd>{item.score.attention_quality}</dd></div>}<div><dt>Relevance</dt><dd>{item.score.relevance}</dd></div><div><dt>Compared with baseline</dt><dd>{multiplierLabel(item.growth?.baseline_multiplier)}×</dd></div>{typeof item.score.evidence_depth === "number" && <div><dt>Evidence depth</dt><dd>{item.score.evidence_depth}</dd></div>}<div><dt>Evidence basis</dt><dd>{item.score.confidence}</dd></div></dl>
                        {item.score_reasons && item.score_reasons.length > 1 && <ul>{item.score_reasons.slice(1).map((reason) => <li key={reason}>{reason}</li>)}</ul>}
                        <div><button type="button" onClick={() => snoozePost(item)}>Snooze 24h</button><button type="button" onClick={() => dismissPost(item)}>Dismiss</button></div>
                      </div>}
                    </article>
                  </li>;
                })}</ol>}
        </>}

        {activeView === "drafts" && <>
          <section className={styles.viewIntro} aria-labelledby="drafts-heading">
            <div><h1 id="drafts-heading">Drafts</h1></div>
            <button type="button" className={styles.primaryButton} onClick={() => { setNewDraftOpen(true); window.setTimeout(() => newDraftRef.current?.focus(), 0); }}>New draft</button>
          </section>
          <div className={styles.draftWorkspace}>
            <section hidden={!newDraftOpen && !newDraftText && !selectedMeme} className={styles.draftComposer} aria-labelledby="new-draft-heading">
              <header><div><h2 id="new-draft-heading">New draft</h2></div><span>Device-only</span></header>
              <label>
                <span>Post text</span>
                <textarea
                  aria-label="New tweet draft"
                  ref={newDraftRef}
                  maxLength={280}
                  placeholder="Write your post…"
                  rows={5}
                  value={newDraftText}
                  onChange={(event) => setNewDraftText(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && newDraftText.trim()) {
                      event.preventDefault();
                        void saveManualDraft();
                    }
                  }}
                />
              </label>
              {selectedMeme && <div className={styles.selectedMeme}>
                <Image unoptimized src={selectedMeme.poster} alt="" width={96} height={64} />
                <div><strong>{selectedMeme.title}</strong><span>Saved with this draft · {selectedMeme.duration_seconds}s MP4</span></div>
                <button type="button" aria-label={`Remove ${selectedMeme.title}`} onClick={() => setSelectedMemeId(null)}>Remove</button>
              </div>}
              <footer>
                <span className={newDraftText.length > 260 ? styles.characterWarning : undefined}>{newDraftText.length} / 280</span>
                <div>{selectedMeme && <button className={styles.secondaryDraftAction} type="button" onClick={() => openMemeComposer(selectedMeme, newDraftText)}>Download + open X ↗</button>}<a className={styles.secondaryDraftAction} href={contentIntent("", newDraftText, "x_post")} target="_blank" rel="noreferrer" aria-disabled={!newDraftText.trim()} onClick={(event) => { if (!newDraftText.trim()) event.preventDefault(); }}>Preview on X ↗</a><button type="button" onClick={() => void saveManualDraft()} disabled={!newDraftText.trim()}>Save draft</button></div>
              </footer>
            <details className={styles.memeLibrary}><summary>Add a meme</summary>
              <header>
                <div><p className={styles.eyebrow}>MEDIA SHELF</p><h2 id="meme-library-heading">Meme library</h2><p>Pick one, write the caption, then download and open X in one move.</p></div>
                <label><span>Search memes</span><input type="search" placeholder="Search reactions…" value={memeSearch} onChange={(event) => setMemeSearch(event.target.value)} /></label>
              </header>
              {filteredMemes.length ? <div className={styles.memeGrid}>{filteredMemes.map((meme) => <article className={selectedMemeId === meme.id ? styles.memeCardSelected : styles.memeCard} key={meme.id}>
                <video controls preload="none" poster={meme.poster} aria-label={`Preview ${meme.title}`}><source src={meme.src} type="video/mp4" /><track kind="captions" src="/memes/preview-captions.vtt" srcLang="en" label="Preview description" /></video>
                <div><div><h3>{meme.title}</h3><span>{meme.duration_seconds}s · MP4</span></div><p>{meme.tags.slice(0, 4).join(" · ")}</p><footer><button type="button" aria-pressed={selectedMemeId === meme.id} onClick={() => selectMeme(meme)}>{selectedMemeId === meme.id ? "Selected" : "Use in draft"}</button><a href={meme.src} download={`${meme.id}.mp4`}>Download</a></footer></div>
              </article>)}</div> : <div className={styles.draftWorkspaceEmpty}><strong>No memes found</strong><p>Try a mood like “cry,” “focused,” “cat,” or “reaction.”</p><button type="button" onClick={() => setMemeSearch("")}>Clear search</button></div>}
            </details>

            </section>

            <section className={styles.draftLibrary} aria-labelledby="manual-drafts-heading">
              <header><div><h2 id="manual-drafts-heading">Saved drafts</h2></div><span>{manualDrafts.length}</span></header>
              {manualDrafts.length ? <ol>{manualDrafts.map((draft) => {
                const text = draftEdits[draft.id] ?? draft.text;
                const meme = draft.meme_id ? X_MEMES.find((candidate) => candidate.id === draft.meme_id) : undefined;
                return <li className={styles.workspaceDraftCard} key={draft.id}><details><summary className={styles.draftPreview}>{text || "Empty draft"}</summary>
                  <div className={styles.workspaceDraftMeta}><span>post</span><strong>Edited {elapsedLabel(draft.updated_at)}</strong><small>Device-only</small></div>
                  {meme && <div className={styles.savedDraftMeme}><Image unoptimized src={meme.poster} alt="" width={72} height={48} /><div><strong>{meme.title}</strong><span>{meme.duration_seconds}s MP4</span></div></div>}
                  <textarea aria-label={`Edit draft: ${draft.text}`} maxLength={280} rows={5} value={text} onChange={(event) => setDraftEdits((current) => ({ ...current, [draft.id]: event.target.value }))} onBlur={() => commitManualDraft(draft)} />
                  <footer><span className={text.length > 260 ? styles.characterWarning : undefined}>{text.length} / 280</span><div><button type="button" onClick={() => void copyDraft(text)} disabled={!text.trim()}>Copy</button>{meme ? <button type="button" onClick={() => openMemeComposer(meme, text)}>Download + open X ↗</button> : <a href={contentIntent("", text, "x_post")} target="_blank" rel="noreferrer" aria-disabled={!text.trim()} onClick={(event) => { if (!text.trim()) event.preventDefault(); }}>Open on X ↗</a>}<button className={styles.deleteDraftButton} type="button" onClick={() => { setManualDrafts((current) => current.filter((candidate) => candidate.id !== draft.id)); setDraftEdits((current) => { const next = { ...current }; delete next[draft.id]; return next; }); setLastAlert("Draft deleted."); }}>Delete</button></div></footer>
                </details></li>;
              })}</ol> : <div className={styles.draftWorkspaceEmpty}><strong>No saved drafts</strong><p>Choose New draft to start writing. These drafts stay on this device.</p></div>}
            </section>

                        <details className={styles.draftLibrary}><summary>Suggested drafts ({suggestedDrafts.length})</summary>
              <header><div><p className={styles.eyebrow}>FROM RADAR</p><h2 id="radar-drafts-heading">Suggested drafts</h2></div><span>{suggestedDrafts.length}</span></header>
              {suggestedDrafts.length ? <ol>{suggestedDrafts.map((draft) => {
                const text = draftEdits[draft.id] ?? draft.text;
                return <li className={styles.workspaceDraftCard} key={draft.id}>
                  <div className={styles.workspaceDraftMeta}><span>{draft.format.replace("x_", "").replace("_", " ")}</span><strong>{draft.author}</strong><small>{draft.state}</small></div>
                  <textarea aria-label={`Edit suggested draft from ${draft.author}`} maxLength={280} rows={5} value={text} onChange={(event) => setDraftEdits((current) => ({ ...current, [draft.id]: event.target.value }))} />
                  <footer><span className={text.length > 260 ? styles.characterWarning : undefined}>{text.length} / 280</span><div><button type="button" onClick={() => void copyDraft(text)} disabled={!text.trim()}>Copy</button><a href={contentIntent(draft.source_url, text, draft.format)} target="_blank" rel="noreferrer" aria-disabled={!text.trim()} onClick={(event) => { if (!text.trim()) event.preventDefault(); }}>Review on X ↗</a>{draft.source_url && <a href={draft.source_url} target="_blank" rel="noreferrer">Source ↗</a>}</div></footer>
                </li>;
              })}</ol> : <div className={styles.draftWorkspaceEmpty}><strong>No Radar suggestions yet</strong><p>Generate a reply or post from Do next. It will appear here for editing.</p><button type="button" onClick={() => chooseView("brief")}>Find an opportunity</button></div>}
            </details>

<details className={styles.draftLibrary}><summary>Account drafts</summary><XMasterDraftVault connected={Boolean(connectedUser) || localWorkspace} legacyDrafts={manualDrafts} /></details>
          </div>
        </>}

        <div hidden={activeView !== "create"}>{visitedViews.includes("create") && <XMasterCreate connected={Boolean(connectedUser) || localWorkspace} />}</div>
        <div hidden={activeView !== "library"}>{visitedViews.includes("library") && <XMasterLibrary connected={Boolean(connectedUser) || localWorkspace} />}</div>
        <div hidden={activeView !== "media"}>{visitedViews.includes("media") && <XMasterMedia connected={Boolean(connectedUser) || localWorkspace} />}</div>
        {activeView === "analytics" && <XMasterAnalytics queue={automation?.queue ?? []} />}
        {activeView === "basics" && <XAlgorithmBasics />}

        {activeView === "saved" && <>
          <section className={styles.viewIntro} aria-labelledby="saved-heading"><div><h1 id="saved-heading">{savedVideoView ? "Saved videos" : "Saved"}</h1></div></section>
          <ReferenceLibrary key={savedVideoView ? "video" : "all"} initialFilter={savedVideoView ? "video" : "all"} legacyPosts={savedRadar.posts} />
          {!savedVideoView && <>
          <p className={styles.storageNote}>Browser bookmarks and history</p>
          <div className={styles.savedGrid}>
            <section className={styles.savedSection}><header><h2>Saved posts</h2><span>{savedRadar.posts.length}</span></header>{savedRadar.posts.length ? <ul>{savedRadar.posts.map((post) => <li key={post.id}><a href={post.source_url} target="_blank" rel="noreferrer"><strong>{post.creator?.username ?? "X post"}</strong><span>{post.title}</span></a><button type="button" aria-label={`Remove ${post.title}`} onClick={() => setSavedRadar((current) => toggleSavedPost(current, post))}>Remove</button></li>)}</ul> : <p className={styles.savedEmpty}>No saved posts yet.</p>}</section>
            <details className={styles.savedSection}><summary>Following and history</summary>            <section className={styles.savedSection}><header><h2>Following</h2><span>{savedRadar.creators.length + savedRadar.topics.length}</span></header>{savedRadar.creators.length > 0 && <div className={styles.savedChips}>{savedRadar.creators.map((creator) => <button type="button" key={creator} onClick={() => toggleSavedCreator(creator)}>{creator} ×</button>)}</div>}{savedRadar.topics.length > 0 && <div className={styles.savedChips}>{savedRadar.topics.map((topic) => <button type="button" key={topic} onClick={() => toggleSavedTopic(topic)}>{topic} ×</button>)}</div>}{!savedRadar.creators.length && !savedRadar.topics.length && <p className={styles.savedEmpty}>Follow a creator or save a story from your Brief.</p>}</section>
            <section className={styles.savedSection}><header><h2>Alert history</h2><span>{savedRadar.alerts.length}</span></header>{savedRadar.alerts.length ? <><button className={styles.textButton} type="button" onClick={() => setSavedRadar((current) => ({ ...current, alerts: [] }))}>Clear history</button><ul>{savedRadar.alerts.slice().reverse().map((alert) => <li key={alert.id}><a href={alert.source_url} target="_blank" rel="noreferrer"><strong>{alert.score} priority</strong><span>{alert.title}</span><small>{elapsedLabel(alert.created_at)}</small></a></li>)}</ul></> : <p className={styles.savedEmpty}>New high-priority posts will appear here.</p>}</section>
            <details className={styles.savedSection}><summary>More</summary><p>{savedRadar.dismissed.length} dismissed · {savedRadar.snoozed.length} snoozed</p>{savedRadar.dismissed.length + savedRadar.snoozed.length > 0 && <button className={styles.textButton} type="button" onClick={() => setSavedRadar((current) => ({ ...current, dismissed: [], snoozed: [] }))}>Restore cleared posts</button>}</details>
</details>
          </div>
          </>}

        </>}
      </div>

    </main>
  );
}
