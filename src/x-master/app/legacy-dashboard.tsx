"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { TrackerNavigation } from "./tracker-navigation";
import { trackerSources, parseTrackerSource, filterTrackerSource, type TrackerSource } from "../lib/tracker-navigation";
import { canvasPngBlob, parseThumbnailArtifact, renderThumbnailCanvas, type ThumbnailArtifact } from "@/x-master/lib/thumbnail-artifact";
import { useDialogFocus } from "@/x-master/lib/use-dialog-focus";

type PublicMetricName = "points" | "comments" | "likes" | "replies" | "reposts" | "quotes" | "downloads" | "stars" | "forks" | "watchers" | "open_issues";
type PublicArchiveMovementState = "moved" | "stable" | "baseline" | "unavailable";
type PublicArchiveMovementFilter = "all" | PublicArchiveMovementState;

type FeedItem = {
  id: string;
  title: string;
  topic: string;
  niche: string;
  source: string;
  source_url?: string;
  related_urls?: string[];
  age_seconds: number;
  scores: { heat: string | null };
  creator?: { username?: string | null };
  observed_metrics?: Partial<Record<PublicMetricName, number>>;
  metric_evidence?: "single_provider_snapshot";
};

type SavedEvidence = {
  id: string;
  title: string;
  source: string;
  source_url: string;
  related_urls?: string[];
  attribution: string;
  topic: string;
  niche: string;
  age_seconds_when_saved: number;
  saved_at: string;
};

type EvidenceCase = {
  id: string;
  title: string;
  evidence: SavedEvidence[];
  created_at: string;
  updated_at: string;
};

type PortableEvidenceCase = {
  format: "ai-virality-radar/evidence-case";
  version: 1;
  exported_at: string;
  case: EvidenceCase;
  boundaries: string[];
};

type LocalWatch = {
  key: string;
  source: string;
  username: string;
  added_at: string;
};

type LocalAlertPermission = NotificationPermission | "unsupported";

type LocalAlertSettings = {
  enabled: boolean;
  initialized: boolean;
  seen_item_keys: string[];
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PublicObservedIdentity = {
  key: string;
  source: string;
  username: string;
  items: FeedItem[];
  latest: FeedItem;
};

type PublicSourceStatus = {
  id: string;
  label: string;
  status: "live" | "degraded";
  coverage: string;
  scoring: "unavailable";
  item_count: number;
  reason?: string;
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
  creator?: { username?: string | null };
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

type PublicEvidenceHistoryItem = {
  item_key: string;
  external_id: string;
  title: string;
  topic: string;
  niche: string;
  source: string;
  source_url: string;
  related_urls: string[];
  creator_username: string | null;
  published_at: string;
  first_observed_at: string;
  last_observed_at: string;
  observation_windows: number;
  current: boolean;
  metric_history?: {
    evidence: "request_observed_provider_snapshots";
    metrics: Partial<Record<PublicMetricName, {
      first_value: number;
      latest_value: number;
      delta: number;
      observation_windows: number;
      first_observed_at: string;
      last_observed_at: string;
    }>>;
  };
};

type PublicEvidenceHistoryExactLinkMember = {
  item_key: string;
  title: string;
  topic: string;
  niche: string;
  source: string;
  source_url: string;
  matched_url: string;
  match_kind: "source_url" | "related_url";
  creator_username: string | null;
  published_at: string;
  first_observed_at: string;
  last_observed_at: string;
  current: boolean;
};

type PublicEvidenceHistoryExactLinkGroup = {
  id: string;
  canonical_url: string;
  source_count: number;
  item_count: number;
  sources: string[];
  earliest_published_at: string;
  latest_published_at: string;
  publication_span_seconds: number;
  first_observed_at: string;
  last_observed_at: string;
  members: PublicEvidenceHistoryExactLinkMember[];
};

type PublicEvidenceHistory = {
  status: "available" | "unavailable";
  mode: "request_observed";
  retention_days: number;
  observation_window_seconds: number;
  stored_item_count: number;
  current_item_count: number;
  coverage_started_at: string | null;
  last_captured_at: string | null;
  items: PublicEvidenceHistoryItem[];
  exact_link_groups: PublicEvidenceHistoryExactLinkGroup[];
  reason?: string;
};

type PublicReturnBriefItem = {
  item_key: string;
  title: string;
  topic: string;
  niche: string;
  source: string;
  source_url: string;
  creator_username: string | null;
  published_at: string;
  first_observed_at: string;
  last_observed_at: string;
  observation_windows: number;
  scores: { heat: null; confidence: null; relevance: null; opportunity: null };
};

type PublicReturnBrief = {
  mode: "request_observed_return_brief";
  brief_version: "public-request-observed-return-brief-v1";
  since: string;
  generated_at: string;
  retention_days: number;
  result_count: number;
  source_count: number;
  truncated: boolean;
  items: PublicReturnBriefItem[];
  boundaries: {
    request_observed: true;
    continuous_monitoring: false;
    story_membership: false;
    ranking: false;
  };
};

type SourceHealth = {
  generated_at?: string;
  sources?: Array<{
    id: string;
    name?: string;
    enabled?: boolean;
    configured_enabled?: boolean;
    operator_enabled?: boolean;
    control_version?: string;
    control_updated_at?: string | null;
    health: string;
    operational_status?: "live" | "degraded" | "fixture-only" | "disabled" | "blocked";
    status_reason?: string;
    feature_flag?: string;
    kill_switch?: string;
    latency_class?: string;
    policy_class?: string;
    content_items: number;
    raw_objects?: number;
    cursor?: { cursor_name?: string; state?: string; updated_at?: string | null; age_seconds?: number | null; stale?: boolean; last_error?: string | null } | null;
    quota?: { requests?: number; objects?: number; estimated_cost?: string };
    efficiency?: {
      window_days: number;
      delivered_alerts: number;
      useful_alerts: number;
      judged_alerts: number;
      conflicted_alerts: number;
      requests: number;
      objects: number;
      estimated_cost: string;
      estimated_cost_known: boolean | null;
      cost_unit: string;
      requests_per_useful_alert: string | null;
      objects_per_useful_alert: string | null;
      estimated_cost_per_useful_alert: string | null;
      status: "measured" | "cost_unknown" | "awaiting_useful_feedback" | "unobserved";
    };
  }>;
  x: { stream_connected: boolean; degraded_reason?: string | null };
  youtube?: { enabled: boolean; hydration_configured: boolean; watched_channels: number; active_subscriptions: number; pending_subscriptions: number; failed_subscriptions: number; pending_snapshots: number; due_snapshots: number; discovery_enabled?: boolean; discovery_kill_switch?: boolean; discovery_terms?: number; discovery_poll_interval_seconds?: number; discovery_daily_search_limit?: number; discovery_search_calls_used?: number; discovery_search_calls_remaining?: number; queued_discovery_jobs?: number };
  snapshots: { pending?: number; due: number; queued_batch_jobs: number; oldest_due_seconds?: number | null };
  stories?: { total: number; unassigned_content_items: number; queued_jobs: number; review_decisions: number; scored?: number; unscored?: number; queued_score_jobs?: number; last_job_state?: string };
  retention: { retention_days?: number; expired_raw_payloads: number; expired_raw_objects?: number; pending_tombstones: number; last_job_state: string };
  multilingual?: {
    entity_extraction_version: string;
    unenriched_content_items: number;
    entity_mentions: number;
    translations: number;
    translations_enabled?: boolean;
    translation_model?: string | null;
    translation_version?: string;
    proposed_aliases_for_review: number;
    embeddings_enabled?: boolean;
    embedding_model?: string;
    embedding_version?: string;
    embedding_dimensions?: number;
    embeddings?: number;
    embedded_active_items?: number;
  };
};

type SourceHealthItem = NonNullable<SourceHealth["sources"]>[number];

type OperatorSessionState = {
  loading: boolean;
  configured: boolean;
  authenticated: boolean;
  backend_configured: boolean;
  csrf_token?: string;
  expires_at?: string;
  reason?: string;
  development_bypass?: boolean;
  login_rate_limit?: {
    scope: "distributed" | "isolate" | "unavailable";
    fail_closed: boolean;
  };
};

type RuntimeState = "resolving" | "ready" | "unavailable";

type StorySummary = {
  id: string;
  label: string;
  summary?: string | null;
  topic: string;
  niche: string;
  state: string;
  factual_status: string;
  member_count: number;
  source_count: number;
  sources: string[];
  scores: { heat: string | null; confidence: string | null; relevance: string | null; opportunity: string | null };
  score_id?: string | null;
  score_version?: string | null;
  score_as_of?: string | null;
  why_now?: string | null;
  score_drivers?: string[];
  crossover?: { status?: string; has_chinese_evidence?: boolean; has_english_evidence?: boolean; chinese_led?: boolean; first_chinese_at?: string | null; first_english_at?: string | null; pickup_delay_seconds?: number | null };
};

type StoryTimelineItem = {
  content_item_id: string;
  published_at?: string | null;
  first_seen_at: string;
  text?: string | null;
  source: string;
  relation: string;
  assignment_kind: string;
  assignment_confidence: string;
  creator?: { username?: string | null; name?: string | null };
};

type StoryOperation = { id: string; operation: string; source_story_ids: string[]; target_story_id?: string | null; actor_id: string; reason: string; state: string; created_at: string; reverted_at?: string | null; reversible: boolean };

type StoryDetail = StorySummary & { timeline: StoryTimelineItem[]; operations?: StoryOperation[]; score_components?: { drivers?: string[] } };

type StoryReviewItem = {
  id: string;
  content_item: { id: string; source: string; title: string; text?: string | null; source_url?: string | null; first_seen_at: string };
  current_story: { id: string; title: string; state: string; member_count: number };
  candidate_story?: { id: string; title: string; state: string; member_count: number } | null;
  features: Record<string, unknown>;
  decided_at: string;
};

type AlertItem = {
  id: string;
  kind: string;
  entity_type: string;
  entity_id: string;
  score: string;
  state: string;
  created_at: string;
  evidence: Record<string, unknown>;
  outcomes: Record<string, number>;
};

type CreatorItem = {
  id: string;
  kind: string;
  name: string;
  description?: string | null;
  username?: string | null;
  priority?: string | null;
  accounts: Array<{ provider: string; account_id?: string | null; username?: string | null; verification_state: string }>;
  watchlists: Array<{ id: string; name: string; priority_tier: string; enabled: boolean }>;
  activity: {
    items_7d: number;
    items_30d: number;
    last_activity_at?: string | null;
    median_interval_hours?: number | null;
    cadence_sample_size: number;
    sources: Array<{ source: string; items_7d: number; items_30d: number; last_activity_at?: string | null; median_interval_hours?: number | null; cadence_sample_size: number }>;
  };
  performance_baselines: Array<{ source: string; target_age_seconds: number; metric: string; median?: number | null; sample_size: number; status: string }>;
  current_signal?: { post_id: string; title: string; source: string; source_url: string; posted_at: string; age_seconds: number; score: string; confidence?: string | null; is_unusual: boolean; explanation: string } | null;
  last_alert?: { id: string; kind: string; state: string; created_at: string; title?: string | null; source_url?: string | null; outcomes: string[]; acted: boolean } | null;
  recent_items: Array<{ id: string; source: string; title: string; source_url?: string | null; published_at?: string | null; first_seen_at: string }>;
  relationships?: Array<{
    creator: { id: string; name: string; kind: string; priority?: string | null; provider?: string | null; username?: string | null };
    connection_kind: "direct_interaction" | "story_coappearance";
    direct_interactions: number;
    outbound: Record<string, number>;
    inbound: Record<string, number>;
    relationship_types: string[];
    shared_stories: number;
    last_observed_at?: string | null;
    latest_evidence?: { relationship: string; direction: "outbound" | "inbound"; title: string; source: string; source_url?: string | null; observed_at: string; confidence: string } | null;
    latest_shared_story?: { story_id: string; title: string; state: string; last_activity_at: string } | null;
    evidence_basis: string[];
    collaboration_status: "not_inferred";
  }>;
};

type SearchMatch = { score: number; matched_on: string };

type SearchStoryResult = StorySummary & { match?: SearchMatch };

type SearchCreatorResult = {
  id: string;
  kind: string;
  name: string;
  description?: string | null;
  priority?: string | null;
  accounts: Array<{ provider: string; account_id?: string | null; username?: string | null; verification_state: string; is_primary?: boolean }>;
  match?: SearchMatch;
};

type SearchSignalResult = {
  id: string;
  evidence_key?: string;
  title: string;
  source: string;
  source_url?: string | null;
  object_type?: string;
  age_seconds: number;
  language?: string | null;
  creator?: { username?: string | null; name?: string | null } | null;
  story?: { id: string; label: string; niche: string; state: string } | null;
  scores: { heat: string | null; opportunity?: string | null };
  match?: SearchMatch;
};

type SearchPayload = {
  query: string;
  search_version: string;
  generated_at: string;
  stories: SearchStoryResult[];
  creators: SearchCreatorResult[];
  signals: SearchSignalResult[];
  truncated: { stories: boolean; creators: boolean; signals: boolean };
  archive?: {
    mode: "request_observed_search";
    retention_days: number;
    matched_items: number;
    returned_items: number;
  };
};

type RankedStory = StorySummary & {
  first_seen_at: string;
  last_activity_at: string;
  content_gap?: number | string | null;
};

type RankingsPayload = {
  window: string;
  fastest_rising_stories: RankedStory[];
  best_opportunities: RankedStory[];
  youtube_momentum: RankedStory[];
  youtube_gaps: RankedStory[];
  chinese_to_english_crossovers: RankedStory[];
  best_reply_opportunities: ReplyOpportunityItem[];
  influential_creators: Array<{
    creator_id: string;
    name: string;
    kind: string;
    priority?: string | null;
    observed_items: number;
    adopted_stories: number;
    earliest_observed_sources: number;
    provider_count: number;
    influence_score: number;
  }>;
  fastest_gaining_creators: Array<{
    creator_id: string;
    name: string;
    kind: string;
    current_window: { stories: number; earliest_observed_sources: number; items: number; influence_units: number };
    previous_window: { stories: number; earliest_observed_sources: number; items: number; influence_units: number };
    influence_gain: number;
    growth_rate?: number | null;
    newly_active: boolean;
    latest_activity_at?: string | null;
  }>;
  earliest_observed_sources: Array<{
    source: string;
    earliest_observed_stories: number;
    observed_stories: number;
    confirmed_earliest_stories: number;
    earliest_share: number;
    confirmation_share: number;
  }>;
  fastest_moving_entities: Array<{
    entity_id: string;
    name: string;
    entity_type: string;
    mentioning_items: number;
    story_count: number;
    movement_score: number;
  }>;
  source_alert_precision: SourcePrecisionItem[];
  source_precision_readiness: SourcePrecisionItem[];
  source_activity: Array<{ source: string; observed_items: number; latest_first_seen_at?: string | null }>;
};

type SourcePrecisionItem = {
  source: string;
  delivered: number;
  positive: number;
  negative: number;
  too_late: number;
  unjudged: number;
  conflicted: number;
  judged: number;
  precision?: number | null;
  confidence_floor?: number | null;
  eligible: boolean;
  minimum_judged_alerts: number;
};

type OpportunityItem = RankedStory & {
  suggested_action: string;
  action_window: string;
  action_basis: string;
  age_seconds: number;
};

type ReplyOpportunityItem = {
  id: string;
  content_item_id?: string | null;
  story_id?: string | null;
  title: string;
  source_url: string;
  age_seconds: number;
  score: string;
  creator: { id: string; name: string; username?: string | null; priority: string };
  story?: { id: string; label: string; niche: string; factual_status: string } | null;
  observed_metrics: { replies?: number | null; likes?: number | null; quotes?: number | null; quality: string };
  suggested_action: string;
  action_basis: string;
  action_window_seconds: number;
  drivers: string[];
  factual_status: string;
  risk_note: string;
};

type EvaluationSummary = {
  method: string;
  evaluator_version: string;
  total_cases: number;
  counts: Record<string, number>;
  eligible_positive_cases: number;
  on_time_recall: number | null;
  eventual_recall: number | null;
  weighted_on_time_recall: number | null;
  curated_alert_precision: number | null;
  curated_alert_true_positives: number;
  curated_alert_false_positives: number;
  unobservable_cases: number;
  latency_seconds: {
    detection_median: number | null;
    detection_p95: number | null;
    alert_median: number | null;
    alert_p95: number | null;
  };
  by_lane: Record<string, Record<string, number>>;
  missed_reasons: Record<string, number>;
  precision_scope: string;
};

type EvaluationRunSummary = {
  run_id: string;
  evaluator_version: string;
  score_version: string;
  observation_cutoff: string;
  window_start: string;
  window_end: string;
  summary: EvaluationSummary;
  created_at: string;
};

type ContentFormat = "x_reply" | "quote_post" | "x_post" | "thread" | "youtube_video";
type ContentTone = "useful" | "funny" | "supportive" | "skeptical" | "technical" | "neutral";

const publicFormatBlueprints: Record<ContentFormat, { label: string; steps: string[] }> = {
  x_post: { label: "X post", steps: ["Lead with the verified change, not a virality claim.", "Add one detail confirmed inside the original source.", "Label your interpretation and link the evidence."] },
  x_reply: { label: "reply", steps: ["Read the full source and the parent conversation first.", "Contribute one useful clarification or question.", "Avoid repeating the headline or implying endorsement."] },
  quote_post: { label: "quote post", steps: ["State what the linked source actually shows.", "Add the context the original post leaves out.", "Keep opinion visibly separate from source-backed fact."] },
  thread: { label: "thread", steps: ["Open with the verified event in one sentence.", "Walk through source evidence before interpretation.", "Add context, uncertainty, and a sourced takeaway."] },
  youtube_video: { label: "YouTube video", steps: ["Use a source-first hook that does not overpromise.", "Show the original evidence before analysis.", "Separate what changed, why it may matter, and what remains unknown."] },
};

const publicToneBoundaries: Record<ContentTone, string> = {
  useful: "Prioritize practical context and a clear reader takeaway.",
  funny: "Make the observation playful without turning an unverified claim into a punchline presented as fact.",
  supportive: "Be constructive without implying a relationship, endorsement, or result the source does not establish.",
  skeptical: "Challenge the claim or implication, not the person, and name the evidence needed to resolve it.",
  technical: "Use precise language and verify every version, number, benchmark, and capability in the source.",
  neutral: "Describe the source and uncertainty without persuasive framing.",
};

type ContentIdeaItem = {
  id: string;
  story_id: string;
  format: ContentFormat;
  tone: ContentTone;
  title?: string | null;
  body: string;
  alternatives: { title_variants?: string[]; thumbnail_artifact?: ThumbnailArtifact | unknown };
  grounding: {
    factual_status?: string;
    sources?: Array<{ content_item_id: string; source: string; url?: string | null }>;
    claims?: Array<{ text: string; status: string; type: string }>;
    human_approval_required?: boolean;
  };
  evidence_hash: string;
  is_stale: boolean;
  status: string;
  requires_review: boolean;
  created_at: string;
  performance?: ContentPerformance;
};

type ContentPerformancePublication = {
  status: "awaiting_observation" | "insufficient_data" | "measured";
  action_id: string;
  platform: "x" | "youtube" | "other";
  external_url?: string | null;
  published_at: string;
  latest_snapshot?: {
    metrics: Record<string, number>;
    metric_availability: Record<string, boolean>;
    primary_metric: string;
    observed_at: string;
    actual_age_seconds: number;
    age_bucket_seconds: number;
    provenance: "manual" | "official_api";
  } | null;
  baseline: {
    status: "insufficient_data" | "measured";
    metric?: string | null;
    median?: string | number | null;
    sample_size: number;
    minimum_sample_size: number;
    ratio?: string | number | null;
    percentile?: string | number | null;
    outperformed?: boolean | null;
    comparison_version: string;
    cohort?: { platform: string; format: string; age_bucket_seconds: number; prior_publications_only: boolean };
  };
};

type ContentPerformance = {
  idea_id: string;
  format: ContentFormat;
  status: "not_published" | "awaiting_observation" | "insufficient_data" | "measured";
  publications: ContentPerformancePublication[];
  latest?: ContentPerformancePublication | null;
  human_reported_metrics_are_not_provider_verified: boolean;
};

type ViewKey = "command" | "radar" | "stories" | "creators" | "youtube" | "china" | "rankings" | "quality" | "health" | "studio";
type FilterName = "For you" | "Following" | "My focus" | "Codex" | "Claude Code" | "Chinese AI" | "Vibe coding" | "Models & launches" | "Memes & culture" | "Agents & IDEs" | "Open source" | "Benchmarks & papers" | "Pricing & outages" | "Tutorials & workflows" | "Business & policy";
type FocusFilterName = Exclude<FilterName, "For you" | "Following" | "My focus">;

const viewKeys = new Set<ViewKey>(["command", "radar", "stories", "creators", "youtube", "china", "rankings", "quality", "health", "studio"]);

function isViewKey(value: string | null): value is ViewKey {
  return value !== null && viewKeys.has(value as ViewKey);
}

function viewUrl(view: ViewKey) {
  const url = new URL(window.location.href);
  if (view !== "radar") url.searchParams.delete("source");
  url.searchParams.delete("evidence");
  url.searchParams.delete("pickup");
  if (view === "command") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  url.hash = "";
  return `${url.pathname}${url.search}`;
}

function canonicalShareUrl(view: ViewKey) {
  const url = new URL(window.location.pathname, window.location.origin);
  if (view !== "command") url.searchParams.set("view", view);
  const source = parseTrackerSource(new URL(window.location.href).searchParams.get("source"));
  if (view === "radar" && source !== "all") url.searchParams.set("source", source);
  return url.href;
}

function safePublicEvidenceKey(value: string | null) {
  if (!value || value.length > 600 || /[\p{Cc}\s]/u.test(value)) return null;
  const separator = value.indexOf(":");
  if (separator < 1 || separator === value.length - 1) return null;
  return value;
}

function safePublicPickupKey(value: string | null) {
  if (!value || value.length > 600 || /[\p{Cc}\s]/u.test(value)) return null;
  return value;
}

function publicEvidenceUrl(key: string) {
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set("view", "stories");
  url.searchParams.set("evidence", key);
  return url.href;
}

function publicEvidencePath(key: string) {
  const url = new URL(publicEvidenceUrl(key));
  return `${url.pathname}${url.search}`;
}

function publicPickupUrl(key: string) {
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set("view", "stories");
  url.searchParams.set("pickup", key);
  return url.href;
}

function publicPickupPath(key: string) {
  const url = new URL(publicPickupUrl(key));
  return `${url.pathname}${url.search}`;
}

const fallbackStory: StorySummary = {
  id: "preview-story",
  label: "Claude turns cold email into a claimed $30K/month machine",
  summary: "A creator published a detailed automation workflow combining Claude, Instantly, Clay, Gmail, and AI-assisted reply handling. The revenue figure is a creator claim, not independently verified.",
  topic: "AI creator workflow",
  niche: "Vibe coding",
  state: "breaking",
  factual_status: "unverified",
  member_count: 18,
  source_count: 3,
  sources: ["youtube", "x", "reddit"],
  scores: { heat: "92", confidence: "84", relevance: "97", opportunity: "94" },
};

const fallbackChineseStory: RankedStory = {
  id: "preview-chinese-story",
  label: "Qwen launch begins moving from Chinese sources into English discussion",
  summary: "Representative preview showing how a verified Chinese-first launch would appear before wider Western coverage.",
  topic: "Chinese AI launch",
  niche: "Chinese AI",
  state: "emerging",
  factual_status: "confirmed",
  member_count: 7,
  source_count: 2,
  sources: ["feed_cn_lab", "github"],
  scores: { heat: "74", confidence: "88", relevance: "93", opportunity: "91" },
  first_seen_at: "2026-08-26T15:20:00Z",
  last_activity_at: "2026-08-26T16:02:00Z",
  crossover: { has_chinese_evidence: true, has_english_evidence: true, chinese_led: true, pickup_delay_seconds: 2520 },
};

const apiBase = "/api/radar";
const DEFAULT_PUBLIC_REFRESH_MS = 120_000;
const MIN_PUBLIC_REFRESH_MS = 30_000;
const MAX_PUBLIC_REFRESH_MS = 15 * 60_000;

function ageLabel(seconds: number) {
  if (seconds < 60) return `${Math.max(1, seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function cadenceLabel(hours: number | null | undefined, sampleSize: number) {
  if (hours == null || sampleSize < 2) return "Learning";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 24) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function primaryCreatorBaseline(creator: CreatorItem) {
  return creator.performance_baselines.find((baseline) => baseline.status === "established")
    ?? creator.performance_baselines[0];
}

function horizonLabel(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function observedDateLabel(value: string | null | undefined) {
  if (!value) return "Not observed";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function interactionLabel(kind: string, count: number, direction: "sent" | "received") {
  const plural: Record<string, string> = {
    reply: "replies",
    quote: "quotes",
    repost: "reposts",
    mention: "mentions",
    reaction: "reactions",
    confirmation: "confirmations",
    contradiction: "contradictions",
  };
  const noun = count === 1 ? kind : plural[kind] ?? `${kind}s`;
  return `${count} ${noun} ${direction}`;
}

function percentageLabel(value: number | null | undefined) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "—";
}

function durationLabel(seconds: number | null | undefined) {
  if (typeof seconds !== "number") return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function operationalStatus(source: SourceHealthItem) {
  if (source.operational_status) return source.operational_status;
  if (source.enabled === false || source.health === "disabled") return "disabled";
  return source.health === "healthy" ? "live" : "degraded";
}

function sourceFreshness(source: SourceHealthItem) {
  const age = source.cursor?.age_seconds;
  if (typeof age !== "number") return "No cursor yet";
  return source.cursor?.stale ? `Stale · ${durationLabel(age)}` : `Updated ${durationLabel(age)} ago`;
}

function compactMetric(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return numeric.toLocaleString([], { maximumFractionDigits: numeric < 10 ? 2 : 1 });
}

function efficiencyHeadline(source: SourceHealthItem) {
  const efficiency = source.efficiency;
  if (!efficiency || efficiency.status === "unobserved") return "No 30-day usage yet";
  if (!efficiency.useful_alerts) return "Awaiting useful feedback";
  return `${compactMetric(efficiency.requests_per_useful_alert)} requests / useful alert`;
}

function readableKey(value: string) {
  const labels: Record<string, string> = {
    priority_creator: "Priority creator",
    official_launch: "Official launch",
    post_breakout: "Post breakout",
    emerging_story: "Emerging story",
    meme_drama: "Meme & culture",
    chinese_lead: "Chinese lead",
    reply_opportunity: "Reply opportunity",
    youtube_gap: "YouTube gap",
    no_alert_emitted: "No qualifying alert fired",
    no_story_assignment: "No historical story assignment",
    insufficient_independent_sources: "Not enough independent sources",
    detected_after_deadline: "Detection arrived after the deadline",
    alerted_after_deadline: "Alert arrived after the deadline",
    alerted_negative_case: "Noise case generated an alert",
    no_exact_anchor_observed: "Exact source evidence was unavailable",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function sourceMark(source: string) {
  if (source === "x") return "𝕏";
  if (source === "youtube") return "▶";
  if (source === "github") return "⌘";
  if (source === "gitee") return "G";
  if (source === "status_openai") return "O";
  if (source === "status_anthropic") return "A";
  if (source === "feed_google_ai") return "G";
  if (source === "hacker_news") return "Y";
  if (source === "bluesky") return "B";
  if (source === "hugging_face") return "HF";
  if (source === "mastodon") return "M";
  if (source === "reddit") return "R";
  if (source === "modelscope") return "魔";
  if (source.startsWith("feed_")) return "◎";
  return "•";
}

function sourceLabel(source: string) {
  if (source === "hacker_news") return "Hacker News";
  if (source === "feed_openai") return "OpenAI News";
  if (source === "feed_deepmind") return "Google DeepMind";
  if (source === "feed_huggingface_blog") return "Hugging Face Blog";
  if (source === "feed_mistral") return "Mistral AI News";
  if (source === "feed_microsoft") return "Microsoft";
  if (source === "feed_google_ai") return "Google AI Blog";
  if (source === "feed_google_research") return "Google Research";
  if (source === "feed_arxiv") return "arXiv · cs.AI";
  if (source === "bluesky") return "Bluesky";
  if (source === "hugging_face") return "Hugging Face";
  if (source === "github") return "GitHub";
  if (source === "gitee") return "Gitee";
  if (source === "status_openai") return "OpenAI Status";
  if (source === "status_anthropic") return "Claude Status";
  return source.replaceAll("_", " ").replace(/^\w/, (character) => character.toUpperCase());
}

function publicSourceVisual(sourceId: string) {
  const sourceVisuals: Record<string, string> = {
    hacker_news: "hacker_news",
    bluesky_creators: "bluesky",
    chinese_ai_models: "hugging_face",
    gitee_chinese_ai: "gitee",
    github_ai_repositories: "github",
    youtube_watched_channels: "youtube",
    openai_news: "feed_openai",
    google_deepmind_news: "feed_deepmind",
    hugging_face_blog: "feed_huggingface_blog",
    mistral_news: "feed_mistral",
    microsoft_official_blog: "feed_microsoft",
    google_ai_blog: "feed_google_ai",
    google_research_blog: "feed_google_research",
    openai_status: "status_openai",
    anthropic_status: "status_anthropic",
    arxiv_ai_papers: "feed_arxiv",
    openai_codex_releases: "github",
    anthropic_claude_code_releases: "github",
    google_gemini_cli_releases: "github",
  };
  return sourceVisuals[sourceId] ?? "feed_unknown";
}

function signalAttribution(item: Pick<FeedItem, "creator" | "source">) {
  if (!item.creator?.username) return sourceLabel(item.source);
  return item.source === "x" || item.source === "hacker_news" || item.source === "bluesky"
    ? `@${item.creator.username}`
    : item.creator.username;
}

const EVIDENCE_DESK_STORAGE_KEY = "ai-virality-radar:evidence-desk:v1";
const MAX_SAVED_EVIDENCE = 100;
const EVIDENCE_CASES_STORAGE_KEY = "ai-virality-radar:evidence-cases:v1";
const MAX_EVIDENCE_CASES = 25;
const MAX_EVIDENCE_PER_CASE = 20;
const MAX_EVIDENCE_AGE_SECONDS = 20 * 365 * 24 * 60 * 60;
const PORTABLE_EVIDENCE_CASE_FORMAT = "ai-virality-radar/evidence-case";
const PORTABLE_EVIDENCE_CASE_VERSION = 1;
const MAX_PORTABLE_EVIDENCE_CASE_BYTES = 256 * 1024;
const PORTABLE_EVIDENCE_CASE_BOUNDARIES = [
  "User-curated research set; selection does not establish story membership.",
  "Source titles remain untrusted until each original is reviewed.",
  "No Heat, Confidence, Relevance, Opportunity, origin, chronology, or corroboration is inferred.",
] as const;
const LOCAL_WATCHLIST_STORAGE_KEY = "ai-virality-radar:local-watchlist:v1";
const MAX_LOCAL_WATCHES = 100;
const MUTED_SOURCES_STORAGE_KEY = "ai-virality-radar:muted-sources:v1";
const MAX_MUTED_SOURCES = 64;
const FOCUS_FILTERS_STORAGE_KEY = "ai-virality-radar:focus-filters:v1";
const MAX_FOCUS_FILTERS = 12;
const FOCUS_PROFILE_STORAGE_KEY = "ai-virality-radar:focus-profile:v2";
const MAX_FOCUS_TERMS = 12;
const MAX_FOCUS_TERM_LENGTH = 48;
const LOCAL_ALERTS_STORAGE_KEY = "ai-virality-radar:local-alerts:v1";
const MAX_LOCAL_ALERT_SEEN_ITEMS = 512;
const ONBOARDING_STORAGE_KEY = "ai-virality-radar:onboarding:v1";
const RETURN_VISIT_STORAGE_KEY = "ai-virality-radar:return-visit:v1";
const MIN_RETURN_VISIT_GAP_MS = 5 * 60 * 1_000;

function validReturnCheckpoint(value: unknown, now = Date.now()) {
  if (typeof value !== "string" || value.length > 64) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= now
    ? new Date(parsed).toISOString()
    : null;
}

function boundedText(value: unknown, maximum: number) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\p{Cc}]/gu, " ").replace(/\s+/g, " ").trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function safeEvidenceUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function safeRelatedEvidenceUrls(value: unknown, sourceUrl?: string | null) {
  if (!Array.isArray(value)) return [] as string[];
  const accepted = new Map<string, string>();
  for (const candidate of value.slice(0, 8)) {
    const safeUrl = safeEvidenceUrl(candidate);
    if (!safeUrl || safeUrl === sourceUrl || accepted.has(safeUrl)) continue;
    accepted.set(safeUrl, safeUrl);
    if (accepted.size >= 4) break;
  }
  return [...accepted.values()];
}

function firstRelatedEvidenceUrl(item: Pick<FeedItem, "related_urls" | "source_url">) {
  return safeRelatedEvidenceUrls(item.related_urls, safeEvidenceUrl(item.source_url))[0] ?? null;
}

function publicEvidenceLinkLabel(item: Pick<FeedItem, "source">) {
  if (item.source === "hacker_news") return "HN discussion";
  if (item.source === "bluesky") return "Bluesky post";
  return "Open evidence";
}

function evidenceDeskKey(item: Pick<SavedEvidence, "id" | "source">) {
  return `${item.source}:${item.id}`;
}

const publicMetricOrder = ["points", "comments", "downloads", "stars", "forks", "watchers", "open_issues", "likes", "replies", "reposts", "quotes"] as const;
const publicMetricFormatter = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

function publicMetricSummary(item: Pick<FeedItem, "observed_metrics" | "metric_evidence">, limit = 2) {
  if (item.metric_evidence !== "single_provider_snapshot" || !item.observed_metrics) return "";
  return publicMetricOrder
    .flatMap((name) => {
      const value = item.observed_metrics?.[name];
      return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
        ? [`${publicMetricFormatter.format(value)} ${name.replaceAll("_", " ")}`]
        : [];
    })
    .slice(0, limit)
    .join(" · ");
}

function publicMetricHistoryEntries(item?: PublicEvidenceHistoryItem | null) {
  if (item?.metric_history?.evidence !== "request_observed_provider_snapshots") return [];
  return publicMetricOrder.flatMap((name) => {
    const movement = item.metric_history?.metrics[name];
    if (!movement) return [];
    const firstObserved = Date.parse(movement.first_observed_at);
    const lastObserved = Date.parse(movement.last_observed_at);
    const valid = Number.isSafeInteger(movement.first_value)
      && Number.isSafeInteger(movement.latest_value)
      && Number.isSafeInteger(movement.delta)
      && movement.first_value >= 0
      && movement.latest_value >= 0
      && movement.first_value <= 1_000_000_000_000
      && movement.latest_value <= 1_000_000_000_000
      && movement.delta === movement.latest_value - movement.first_value
      && Number.isSafeInteger(movement.observation_windows)
      && movement.observation_windows >= 1
      && Number.isFinite(firstObserved)
      && Number.isFinite(lastObserved)
      && firstObserved <= lastObserved;
    return valid ? [{ name, ...movement }] : [];
  });
}

function signedPublicMetricDelta(value: number) {
  if (value === 0) return "no change";
  return `${value > 0 ? "+" : "−"}${publicMetricFormatter.format(Math.abs(value))}`;
}

function publicMetricMovementSummary(item?: PublicEvidenceHistoryItem | null, limit = 2) {
  const movements = publicMetricHistoryEntries(item)
    .filter((movement) => movement.observation_windows >= 2)
    .slice(0, limit);
  if (!movements.length) return "";
  return `Since earliest sample ${movements.map((movement) => (
    `${signedPublicMetricDelta(movement.delta)} ${movement.name.replaceAll("_", " ")}`
  )).join(" · ")}`;
}

function publicArchiveMovementState(item?: PublicEvidenceHistoryItem | null): PublicArchiveMovementState {
  const movements = publicMetricHistoryEntries(item);
  if (!movements.length) return "unavailable";
  const comparable = movements.filter((movement) => movement.observation_windows >= 2);
  if (!comparable.length) return "baseline";
  return comparable.some((movement) => movement.delta !== 0) ? "moved" : "stable";
}

function publicArchiveMovementNote(item?: PublicEvidenceHistoryItem | null) {
  const state = publicArchiveMovementState(item);
  if (state === "baseline") return "Provider counts captured · baseline only";
  return publicMetricMovementSummary(item);
}

const publicArchiveMovementFilterLabels: Record<PublicArchiveMovementFilter, string> = {
  all: "All retained",
  moved: "Changed",
  stable: "No change",
  baseline: "Baseline",
  unavailable: "No counts",
};

function localWatchKey(source: string, username: string) {
  return `${source}:${username.toLocaleLowerCase()}`;
}

function localWatchFromIdentity(identity: PublicObservedIdentity): LocalWatch | null {
  const source = boundedText(identity.source, 80);
  const username = boundedText(identity.username, 240);
  if (!source || !username) return null;
  return {
    key: localWatchKey(source, username),
    source,
    username,
    added_at: new Date().toISOString(),
  };
}

function parseLocalWatchlist(raw: string | null) {
  if (!raw) return [] as LocalWatch[];
  try {
    const decoded: unknown = JSON.parse(raw);
    if (!Array.isArray(decoded)) return [] as LocalWatch[];
    const accepted = new Map<string, LocalWatch>();
    for (const candidate of decoded.slice(0, MAX_LOCAL_WATCHES * 2)) {
      if (!candidate || typeof candidate !== "object") continue;
      const row = candidate as Record<string, unknown>;
      const source = boundedText(row.source, 80);
      const username = boundedText(row.username, 240);
      const addedAt = typeof row.added_at === "string" && Number.isFinite(Date.parse(row.added_at))
        ? new Date(row.added_at).toISOString()
        : null;
      if (!source || !username || !addedAt) continue;
      const key = localWatchKey(source, username);
      accepted.set(key, { key, source, username, added_at: addedAt });
      if (accepted.size >= MAX_LOCAL_WATCHES) break;
    }
    return [...accepted.values()].sort((left, right) => Date.parse(right.added_at) - Date.parse(left.added_at));
  } catch {
    return [] as LocalWatch[];
  }
}

function parseMutedSources(raw: string | null) {
  if (!raw) return [] as string[];
  try {
    const decoded: unknown = JSON.parse(raw);
    if (!Array.isArray(decoded)) return [] as string[];
    const accepted = new Set<string>();
    for (const candidate of decoded.slice(0, MAX_MUTED_SOURCES * 2)) {
      const source = boundedText(candidate, 80);
      if (!source || !/^[a-z0-9][a-z0-9_:-]{0,79}$/.test(source)) continue;
      accepted.add(source);
      if (accepted.size >= MAX_MUTED_SOURCES) break;
    }
    return [...accepted].sort((left, right) => left.localeCompare(right));
  } catch {
    return [] as string[];
  }
}

function parseFocusFilters(raw: string | null) {
  if (!raw) return [] as FocusFilterName[];
  try {
    const decoded: unknown = JSON.parse(raw);
    if (!Array.isArray(decoded)) return [] as FocusFilterName[];
    const allowed = new Set<string>(focusFilterOptions);
    const accepted = new Set<FocusFilterName>();
    for (const candidate of decoded.slice(0, MAX_FOCUS_FILTERS * 2)) {
      if (typeof candidate !== "string" || !allowed.has(candidate)) continue;
      accepted.add(candidate as FocusFilterName);
      if (accepted.size >= MAX_FOCUS_FILTERS) break;
    }
    return focusFilterOptions.filter((filter) => accepted.has(filter));
  } catch {
    return [] as FocusFilterName[];
  }
}

function normalizeFocusTerm(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").replace(/[\p{Cc}]/gu, " ").replace(/\s+/g, " ").trim();
  return normalized.length >= 2 && normalized.length <= MAX_FOCUS_TERM_LENGTH ? normalized : null;
}

function parseFocusTerms(raw: string | null) {
  if (!raw) return [] as string[];
  try {
    const decoded: unknown = JSON.parse(raw);
    if (!Array.isArray(decoded)) return [] as string[];
    const accepted = new Map<string, string>();
    for (const candidate of decoded.slice(0, MAX_FOCUS_TERMS * 3)) {
      const normalized = normalizeFocusTerm(candidate);
      if (!normalized) continue;
      const identity = normalized.toLocaleLowerCase();
      if (!accepted.has(identity)) accepted.set(identity, normalized);
      if (accepted.size >= MAX_FOCUS_TERMS) break;
    }
    return [...accepted.values()];
  } catch {
    return [] as string[];
  }
}

function parseFocusProfile(raw: string | null, legacyFilters: string | null = null) {
  if (!raw) {
    return {
      filters: parseFocusFilters(legacyFilters),
      includeTerms: [] as string[],
      excludeTerms: [] as string[],
    };
  }
  try {
    const decoded: unknown = JSON.parse(raw);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error("Invalid focus profile");
    const candidate = decoded as Record<string, unknown>;
    if (candidate.version !== 2) throw new Error("Unsupported focus profile");
    return {
      filters: parseFocusFilters(JSON.stringify(candidate.filters) ?? null),
      includeTerms: parseFocusTerms(JSON.stringify(candidate.include_terms) ?? null),
      excludeTerms: parseFocusTerms(JSON.stringify(candidate.exclude_terms) ?? null),
    };
  } catch {
    return { filters: [] as FocusFilterName[], includeTerms: [] as string[], excludeTerms: [] as string[] };
  }
}

function publicSignalKey(item: Pick<FeedItem, "id" | "source">) {
  const id = boundedText(item.id, 512);
  const source = boundedText(item.source, 80);
  return id && source ? `${source}:${id}` : null;
}

function parseLocalAlertSettings(raw: string | null): LocalAlertSettings {
  if (!raw) return { enabled: false, initialized: false, seen_item_keys: [] };
  try {
    const decoded: unknown = JSON.parse(raw);
    if (!decoded || typeof decoded !== "object") return { enabled: false, initialized: false, seen_item_keys: [] };
    const row = decoded as Record<string, unknown>;
    const accepted = new Set<string>();
    if (Array.isArray(row.seen_item_keys)) {
      for (const candidate of row.seen_item_keys.slice(0, MAX_LOCAL_ALERT_SEEN_ITEMS * 2)) {
        const key = boundedText(candidate, 600);
        if (!key || !key.includes(":")) continue;
        accepted.add(key);
        if (accepted.size >= MAX_LOCAL_ALERT_SEEN_ITEMS) break;
      }
    }
    return {
      enabled: row.enabled === true,
      initialized: row.initialized === true,
      seen_item_keys: [...accepted],
    };
  } catch {
    return { enabled: false, initialized: false, seen_item_keys: [] };
  }
}

function mergeLocalAlertSeenKeys(currentKeys: Array<string | null>, existingKeys: string[]) {
  const accepted = new Set<string>();
  for (const candidate of [...currentKeys, ...existingKeys]) {
    const key = boundedText(candidate, 600);
    if (!key || !key.includes(":")) continue;
    accepted.add(key);
    if (accepted.size >= MAX_LOCAL_ALERT_SEEN_ITEMS) break;
  }
  return [...accepted];
}

function savedEvidenceFromFeed(item: FeedItem): SavedEvidence | null {
  const id = boundedText(item.id, 512);
  const title = boundedText(item.title, 500);
  const source = boundedText(item.source, 80);
  const sourceUrl = safeEvidenceUrl(item.source_url);
  const relatedUrls = safeRelatedEvidenceUrls(item.related_urls, sourceUrl);
  if (!id || !title || !source || !sourceUrl) return null;
  return {
    id,
    title,
    source,
    source_url: sourceUrl,
    ...(relatedUrls.length ? { related_urls: relatedUrls } : {}),
    attribution: boundedText(signalAttribution(item), 240) ?? sourceLabel(source),
    topic: boundedText(item.topic, 160) ?? "Unclassified",
    niche: boundedText(item.niche, 160) ?? "Unclassified",
    age_seconds_when_saved: Number.isFinite(item.age_seconds) ? Math.min(MAX_EVIDENCE_AGE_SECONDS, Math.max(0, Math.floor(item.age_seconds))) : 0,
    saved_at: new Date().toISOString(),
  };
}

function savedEvidenceFromHistory(item: PublicEvidenceHistoryItem): SavedEvidence | null {
  const id = boundedText(item.external_id, 512);
  const title = boundedText(item.title, 500);
  const source = boundedText(item.source, 80);
  const sourceUrl = safeEvidenceUrl(item.source_url);
  const relatedUrls = safeRelatedEvidenceUrls(item.related_urls, sourceUrl);
  if (!id || !title || !source || !sourceUrl) return null;
  const publishedAt = Date.parse(item.published_at);
  const ageSeconds = Number.isFinite(publishedAt) ? Math.max(0, Math.floor((Date.now() - publishedAt) / 1000)) : 0;
  return {
    id,
    title,
    source,
    source_url: sourceUrl,
    ...(relatedUrls.length ? { related_urls: relatedUrls } : {}),
    attribution: boundedText(item.creator_username, 240) ?? sourceLabel(source),
    topic: boundedText(item.topic, 160) ?? "Unclassified",
    niche: boundedText(item.niche, 160) ?? "Unclassified",
    age_seconds_when_saved: Math.min(MAX_EVIDENCE_AGE_SECONDS, ageSeconds),
    saved_at: new Date().toISOString(),
  };
}

function parseSavedEvidence(raw: string | null) {
  if (!raw) return [] as SavedEvidence[];
  try {
    const decoded: unknown = JSON.parse(raw);
    if (!Array.isArray(decoded)) return [] as SavedEvidence[];
    const accepted = new Map<string, SavedEvidence>();
    for (const candidate of decoded.slice(0, MAX_SAVED_EVIDENCE * 2)) {
      if (!candidate || typeof candidate !== "object") continue;
      const row = candidate as Record<string, unknown>;
      const id = boundedText(row.id, 512);
      const title = boundedText(row.title, 500);
      const source = boundedText(row.source, 80);
      const sourceUrl = safeEvidenceUrl(row.source_url);
      const relatedUrls = safeRelatedEvidenceUrls(row.related_urls, sourceUrl);
      const attribution = boundedText(row.attribution, 240);
      const topic = boundedText(row.topic, 160);
      const niche = boundedText(row.niche, 160);
      const savedAt = typeof row.saved_at === "string" && Number.isFinite(Date.parse(row.saved_at)) ? new Date(row.saved_at).toISOString() : null;
      const savedAge = typeof row.age_seconds_when_saved === "number"
        && Number.isFinite(row.age_seconds_when_saved)
        && row.age_seconds_when_saved >= 0
        && row.age_seconds_when_saved <= MAX_EVIDENCE_AGE_SECONDS
        ? Math.floor(row.age_seconds_when_saved)
        : null;
      if (!id || !title || !source || !sourceUrl || !attribution || !topic || !niche || !savedAt || savedAge === null) continue;
      const item: SavedEvidence = { id, title, source, source_url: sourceUrl, ...(relatedUrls.length ? { related_urls: relatedUrls } : {}), attribution, topic, niche, age_seconds_when_saved: savedAge, saved_at: savedAt };
      accepted.set(evidenceDeskKey(item), item);
      if (accepted.size >= MAX_SAVED_EVIDENCE) break;
    }
    return [...accepted.values()].sort((left, right) => Date.parse(right.saved_at) - Date.parse(left.saved_at));
  } catch {
    return [] as SavedEvidence[];
  }
}

function parseEvidenceCases(raw: string | null) {
  if (!raw) return [] as EvidenceCase[];
  try {
    const decoded: unknown = JSON.parse(raw);
    if (!Array.isArray(decoded)) return [] as EvidenceCase[];
    const accepted = new Map<string, EvidenceCase>();
    for (const candidate of decoded.slice(0, MAX_EVIDENCE_CASES * 2)) {
      if (!candidate || typeof candidate !== "object") continue;
      const row = candidate as Record<string, unknown>;
      const id = boundedText(row.id, 120);
      const title = boundedText(row.title, 140);
      const createdAt = typeof row.created_at === "string" && Number.isFinite(Date.parse(row.created_at))
        ? new Date(row.created_at).toISOString()
        : null;
      const updatedAt = typeof row.updated_at === "string" && Number.isFinite(Date.parse(row.updated_at))
        ? new Date(row.updated_at).toISOString()
        : null;
      if (!id || !title || !createdAt || !updatedAt || !Array.isArray(row.evidence)) continue;
      const evidence = parseSavedEvidence(JSON.stringify(row.evidence)).slice(0, MAX_EVIDENCE_PER_CASE);
      if (!evidence.length) continue;
      accepted.set(id, { id, title, evidence, created_at: createdAt, updated_at: updatedAt });
      if (accepted.size >= MAX_EVIDENCE_CASES) break;
    }
    return [...accepted.values()].sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at));
  } catch {
    return [] as EvidenceCase[];
  }
}

function observedEvidenceTimestamp(item: SavedEvidence) {
  return Date.parse(item.saved_at) - item.age_seconds_when_saved * 1000;
}

function evidenceCaseChronology(evidenceCase: EvidenceCase) {
  return [...evidenceCase.evidence].sort((left, right) => {
    const observedDifference = observedEvidenceTimestamp(left) - observedEvidenceTimestamp(right);
    return observedDifference || evidenceDeskKey(left).localeCompare(evidenceDeskKey(right));
  });
}

function evidenceCaseObservedSpanSeconds(evidenceCase: EvidenceCase) {
  if (evidenceCase.evidence.length < 2) return 0;
  const timestamps = evidenceCase.evidence.map(observedEvidenceTimestamp);
  return Math.max(0, Math.floor((Math.max(...timestamps) - Math.min(...timestamps)) / 1000));
}

function portableEvidenceCasePayload(evidenceCase: EvidenceCase): PortableEvidenceCase {
  return {
    format: PORTABLE_EVIDENCE_CASE_FORMAT,
    version: PORTABLE_EVIDENCE_CASE_VERSION,
    exported_at: new Date().toISOString(),
    case: evidenceCase,
    boundaries: [...PORTABLE_EVIDENCE_CASE_BOUNDARIES],
  };
}

function parsePortableEvidenceCase(raw: string): { evidenceCase: EvidenceCase | null; error: string | null } {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return { evidenceCase: null, error: "That file is not valid JSON. Choose an exported Radar evidence case." };
  }
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    return { evidenceCase: null, error: "That file is not a Radar evidence case." };
  }
  const payload = decoded as Record<string, unknown>;
  if (payload.format !== PORTABLE_EVIDENCE_CASE_FORMAT) {
    return { evidenceCase: null, error: "That file uses an unknown evidence-case format." };
  }
  if (payload.version !== PORTABLE_EVIDENCE_CASE_VERSION) {
    return { evidenceCase: null, error: "That evidence-case version is not supported by this Radar release." };
  }
  if (typeof payload.exported_at !== "string" || !Number.isFinite(Date.parse(payload.exported_at))) {
    return { evidenceCase: null, error: "That evidence case is missing a valid export timestamp." };
  }
  const boundaries = payload.boundaries;
  if (!Array.isArray(boundaries)
    || PORTABLE_EVIDENCE_CASE_BOUNDARIES.some((boundary) => !boundaries.includes(boundary))) {
    return { evidenceCase: null, error: "That evidence case is missing Radar's research boundaries." };
  }
  if (!payload.case || typeof payload.case !== "object" || Array.isArray(payload.case)) {
    return { evidenceCase: null, error: "That evidence case does not contain a valid case record." };
  }
  const rawCase = payload.case as Record<string, unknown>;
  if (!Array.isArray(rawCase.evidence) || rawCase.evidence.length < 1 || rawCase.evidence.length > MAX_EVIDENCE_PER_CASE) {
    return { evidenceCase: null, error: `A portable case must contain between 1 and ${MAX_EVIDENCE_PER_CASE} evidence snapshots.` };
  }
  const parsed = parseEvidenceCases(JSON.stringify([rawCase]));
  if (parsed.length !== 1 || parsed[0].evidence.length !== rawCase.evidence.length) {
    return { evidenceCase: null, error: "That case contains malformed evidence or a source link that is not safe HTTPS." };
  }
  for (const rawEvidence of rawCase.evidence) {
    if (!rawEvidence || typeof rawEvidence !== "object" || Array.isArray(rawEvidence)) continue;
    const row = rawEvidence as Record<string, unknown>;
    if (row.related_urls === undefined) continue;
    const sourceUrl = safeEvidenceUrl(row.source_url);
    if (!Array.isArray(row.related_urls)
      || row.related_urls.length > 4
      || safeRelatedEvidenceUrls(row.related_urls, sourceUrl).length !== row.related_urls.length) {
      return { evidenceCase: null, error: "That case contains a malformed linked source or a URL that is not safe HTTPS." };
    }
  }
  if (Date.parse(parsed[0].updated_at) < Date.parse(parsed[0].created_at)) {
    return { evidenceCase: null, error: "That evidence case has an invalid update history." };
  }
  return { evidenceCase: parsed[0], error: null };
}

function portableEvidenceCaseFilename(title: string) {
  const stem = title.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 64);
  return `${stem || "evidence-case"}.radar-case.json`;
}

function evidenceDeskMarkdown(items: SavedEvidence[]) {
  const escapeMarkdown = (value: string) => value.replace(/([\\[\]])/g, "\\$1");
  const lines = [
    "# X Master evidence desk",
    "",
    `Exported ${new Date().toISOString()}`,
    "",
    "> Browser-local source evidence. Items are unscored and do not imply story membership, factual confirmation, or opportunity.",
    "",
  ];
  for (const item of items) {
    lines.push(`- [${escapeMarkdown(item.title)}](${item.source_url})`);
    lines.push(`  - Source: ${sourceLabel(item.source)} · ${item.attribution}`);
    lines.push(`  - Focus: ${item.niche || item.topic}`);
    for (const [index, relatedUrl] of (item.related_urls ?? []).entries()) {
      lines.push(`  - [Linked source${item.related_urls?.length === 1 ? "" : ` ${index + 1}`}](${relatedUrl})`);
    }
    lines.push(`  - Saved: ${item.saved_at}`);
  }
  return lines.join("\n");
}

function evidenceCaseMarkdown(evidenceCase: EvidenceCase) {
  const escapeMarkdown = (value: string) => value.replace(/([\\[\]])/g, "\\$1");
  const sourceCount = new Set(evidenceCase.evidence.map((item) => item.source)).size;
  const lines = [
    `# ${evidenceCase.title}`,
    "",
    `Updated ${evidenceCase.updated_at}`,
    "",
    `> User-curated evidence case with ${evidenceCase.evidence.length} source ${evidenceCase.evidence.length === 1 ? "item" : "items"} across ${sourceCount} ${sourceCount === 1 ? "provider" : "providers"}. Selection does not establish story membership, factual confirmation, or virality.`,
    "",
    "## Source evidence",
    "",
  ];
  for (const item of evidenceCaseChronology(evidenceCase)) {
    lines.push(`- [${escapeMarkdown(item.title)}](${item.source_url})`);
    lines.push(`  - Source: ${sourceLabel(item.source)} · ${item.attribution}`);
    lines.push(`  - Focus: ${item.niche || item.topic}`);
    for (const [index, relatedUrl] of (item.related_urls ?? []).entries()) {
      lines.push(`  - [Linked source${item.related_urls?.length === 1 ? "" : ` ${index + 1}`}](${relatedUrl})`);
    }
    lines.push(`  - Approximate source time: ${new Date(observedEvidenceTimestamp(item)).toISOString()} (saved snapshot age)`);
    lines.push(`  - Saved: ${item.saved_at}`);
  }
  lines.push(
    "",
    "## Verification checklist",
    "",
    "- Open every source and verify the title against the original context.",
    "- Identify which claims are independently corroborated and which are reactions, opinions, or jokes.",
    "- Find the earliest attributable source before describing an origin.",
    "- Record contradictions, missing dates, version numbers, and translation uncertainty.",
    "- Do not present Heat, Confidence, Relevance, or Opportunity as measured without durable Radar evidence.",
    "",
    `Observed source span: ${durationLabel(evidenceCaseObservedSpanSeconds(evidenceCase))}. This ordering is calculated only from each snapshot's saved time minus its recorded age; verify original timestamps before describing chronology or origin.`,
  );
  return lines.join("\n");
}

function FeedSignalRow({ item, index, variant }: { item: FeedItem; index: number; variant: "command" | "library" }) {
  const command = variant === "command";
  const className = command ? "feed-row" : "library-feed-row";
  const metricSummary = publicMetricSummary(item);
  const body = command ? <>
    <span className={`feed-source ${item.source === "x" ? "x-source" : item.source}`}>{sourceMark(item.source)}</span>
    <div className="feed-copy"><strong>{item.title}</strong><p><b>{signalAttribution(item)}</b> · {ageLabel(item.age_seconds)} · {item.niche || item.topic}{metricSummary && <> · <span title="One source-native snapshot; not a Radar score or cross-platform comparison">{metricSummary}</span></>}</p></div>
    <span className={`movement ${item.scores.heat === null ? "fresh" : index < 2 ? "up" : "steady"}`}>{item.scores.heat === null ? "● new" : `${index < 2 ? "↗" : "→"} live`}</span>
    <strong className={`feed-score ${item.scores.heat === null ? "pending" : ""}`}>{item.scores.heat === null ? "NEW" : Math.round(Number(item.scores.heat))}</strong>
  </> : <>
    <span className={`feed-source ${item.source === "x" ? "x-source" : item.source}`}>{sourceMark(item.source)}</span>
    <div><strong>{item.title}</strong><p>{signalAttribution(item)} · {ageLabel(item.age_seconds)} · {item.niche || item.topic}{metricSummary && <> · <span title="One source-native snapshot; not a Radar score or cross-platform comparison">{metricSummary}</span></>}</p></div>
    <span className={`movement ${item.scores.heat === null ? "fresh" : index < 3 ? "up" : "steady"}`}>{item.scores.heat === null ? "● unscored" : index < 3 ? "↗ moving" : "→ observed"}</span>
    <b className={item.scores.heat === null ? "pending" : ""}>{item.scores.heat === null ? "NEW" : Math.round(Number(item.scores.heat))}</b>
  </>;
  return item.source_url ? <a className={className} href={item.source_url} target="_blank" rel="noreferrer">{body}</a> : <div className={`${className} observed-signal`} aria-label={`${item.title}. Representative preview signal.`}>{body}</div>;
}

function alertLabel(alert: AlertItem) {
  const evidence = alert.evidence;
  if (alert.kind === "digest") {
    const digestDate = boundedText(evidence.digest_date, 32);
    if (digestDate && /^\d{4}-\d{2}-\d{2}$/.test(digestDate)) {
      const parsed = new Date(`${digestDate}T12:00:00Z`);
      if (!Number.isNaN(parsed.getTime())) {
        return `Daily AI Radar — ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(parsed)}`;
      }
    }
    return "Daily AI Radar";
  }
  const label = evidence.story_label ?? evidence.creator_name ?? evidence.title ?? evidence.post_text;
  return typeof label === "string" && label.trim() ? label : alert.kind.replaceAll("_", " ");
}

type AlertFeedbackOutcome = "useful" | "irrelevant" | "too_late" | "acted";
type DigestStoryEvidence = {
  id: string;
  title: string;
  section: "opportunity" | "rising" | "closing";
  lifecycle: string | null;
  sourceUrl: string | null;
  heat: number | null;
  opportunity: number | null;
};

function boundedScore(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function digestStoryEvidence(evidence: Record<string, unknown>) {
  if (!Array.isArray(evidence.stories)) return [] as DigestStoryEvidence[];
  const accepted: DigestStoryEvidence[] = [];
  const seen = new Set<string>();
  for (const value of evidence.stories.slice(0, 10)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    const id = boundedText(row.story_id, 64);
    const title = boundedText(row.title, 280);
    const section = row.section;
    if (!id || !title || seen.has(id) || !["opportunity", "rising", "closing"].includes(String(section))) continue;
    const scores = row.scores && typeof row.scores === "object" && !Array.isArray(row.scores) ? row.scores as Record<string, unknown> : {};
    seen.add(id);
    accepted.push({
      id,
      title,
      section: section as DigestStoryEvidence["section"],
      lifecycle: boundedText(row.lifecycle_state, 24),
      sourceUrl: safeEvidenceUrl(row.source_url),
      heat: boundedScore(scores.heat),
      opportunity: boundedScore(scores.opportunity),
    });
  }
  return accepted;
}

function ConnectedAlertCard({ alert, now, feedbackStatus, onFeedback }: {
  alert: AlertItem;
  now: number | null;
  feedbackStatus?: string;
  onFeedback: (alertId: string, outcome: AlertFeedbackOutcome) => void;
}) {
  const evidence = alert.evidence;
  const scores = typeof evidence.scores === "object" && evidence.scores ? evidence.scores as Record<string, string> : {};
  const digestStories = alert.kind === "digest" ? digestStoryEvidence(evidence) : [];
  const leadDigestStory = digestStories.find((story) => story.section === "opportunity") ?? digestStories[0];
  const createdAt = new Date(alert.created_at).getTime();
  const ageSeconds = now === null || !Number.isFinite(createdAt) ? null : Math.max(0, Math.floor((now - createdAt) / 1000));
  const saving = feedbackStatus === "saving";
  const kindLabel = alert.kind === "priority_creator" ? "P0" : alert.kind === "official_launch" ? "OFFICIAL" : alert.kind === "digest" ? "DAILY" : alert.kind === "story_update" ? String(evidence.milestone ?? "story").replace("_", " ") : alert.kind.replaceAll("_", " ");
  const description = alert.kind === "digest"
    ? `${digestStories.length} canonical ${digestStories.length === 1 ? "story" : "stories"} ranked from stored evidence, with duplicate narratives removed.`
    : typeof evidence.explanation === "string"
      ? evidence.explanation
      : typeof evidence.reason === "string"
        ? evidence.reason
        : alert.kind === "priority_creator"
          ? "A must-see creator published. This alert did not wait for virality scoring."
          : "A verified alert gate was crossed.";
  const primaryScore = leadDigestStory?.opportunity ?? boundedScore(scores.opportunity) ?? boundedScore(alert.score);
  const heatScore = leadDigestStory?.heat ?? boundedScore(scores.heat);
  const statusLabel = alert.kind === "digest"
    ? `${boundedText(evidence.timezone, 64) ?? "UTC"} schedule`
    : typeof evidence.action_window === "string"
      ? evidence.action_window
      : alert.state;
  const sectionLabels = { opportunity: "Opportunity", rising: "Rising", closing: "Closing" } as const;

  return <article className={`alert-card ${alert.kind === "digest" ? "digest-alert" : ""}`}>
    <div className="alert-card-head">
      <span className={`alert-kind ${alert.kind}`}>{kindLabel}</span>
      <time dateTime={alert.created_at}>{ageSeconds === null ? "Now" : ageLabel(ageSeconds)}</time>
    </div>
    <h3>{alertLabel(alert)}</h3>
    <p>{description}</p>
    {digestStories.length > 0 && <ol className="digest-story-list" aria-label="Stories in this briefing">
      {digestStories.map((story) => <li key={story.id}>
        <span className={`digest-section ${story.section}`}>{sectionLabels[story.section]}</span>
        <div>
          {story.sourceUrl ? <a href={story.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open source evidence for ${story.title}`}>{story.title}</a> : <strong>{story.title}</strong>}
          <small>{story.lifecycle ?? "Observed"} · latest stored score</small>
        </div>
        <span className="digest-story-score" aria-label={story.opportunity === null ? "Opportunity unavailable" : `Opportunity ${Math.round(story.opportunity)} out of 100`}>
          <b>{story.opportunity === null ? "—" : Math.round(story.opportunity)}</b><small>Opp</small>
        </span>
      </li>)}
    </ol>}
    <div className="alert-metrics">
      <span><b>{primaryScore === null ? "—" : Math.round(primaryScore)}</b> {alert.kind === "official_launch" ? "Priority" : alert.kind === "digest" ? "Lead opportunity" : "Opportunity"}</span>
      {heatScore !== null && <span><b>{Math.round(heatScore)}</b> Heat</span>}
      <small>{statusLabel}</small>
    </div>
    <div className="alert-feedback" aria-label="Record alert outcome">
      <button aria-pressed={feedbackStatus === "useful"} className={feedbackStatus === "useful" ? "selected" : ""} disabled={saving} type="button" onClick={() => onFeedback(alert.id, "useful")}>Useful</button>
      <button aria-pressed={feedbackStatus === "acted"} className={feedbackStatus === "acted" ? "selected" : ""} disabled={saving} type="button" onClick={() => onFeedback(alert.id, "acted")}>Acted</button>
      <button disabled={saving} type="button" onClick={() => onFeedback(alert.id, "too_late")}>Too late</button>
      <button disabled={saving} type="button" onClick={() => onFeedback(alert.id, "irrelevant")}>Irrelevant</button>
      <span role="status">{saving ? "Saving…" : feedbackStatus === "error" ? "Could not save. Try again." : ""}</span>
    </div>
  </article>;
}

const filterTerms: Record<FocusFilterName, string[]> = {
  Codex: ["codex", "openai"],
  "Claude Code": ["claude", "anthropic"],
  "Chinese AI": ["chinese", "china", "deepseek", "qwen", "kimi", "glm"],
  "Vibe coding": ["vibe", "workflow", "no-code", "builder"],
  "Models & launches": ["model", "launch", "release", "benchmark"],
  "Memes & culture": ["meme", "joke", "drama", "culture"],
  "Agents & IDEs": ["agent", "ide", "cursor", "windsurf", "copilot", "vscode", "mcp"],
  "Open source": ["open source", "open-source", "github", "repository", "repo", "hugging face", "weights"],
  "Benchmarks & papers": ["benchmark", "paper", "arxiv", "research", "evaluation", "leaderboard"],
  "Pricing & outages": ["price", "pricing", "limit", "quota", "free", "outage", "incident", "downtime", "rate limit"],
  "Tutorials & workflows": ["tutorial", "guide", "prompt", "workflow", "demo", "how to"],
  "Business & policy": ["funding", "acquisition", "regulation", "policy", "lawsuit", "government", "investment"],
};

const focusFilterOptions = Object.keys(filterTerms) as FocusFilterName[];

type FocusMatchable = {
  title?: string;
  label?: string;
  topic: string;
  niche: string;
  source?: string;
  creator?: { username?: string | null } | null;
  creator_username?: string | null;
};

function focusMatchText(item: FocusMatchable) {
  return [
    item.title,
    item.label,
    item.topic,
    item.niche,
    item.creator?.username,
    item.creator_username,
    item.source ? sourceLabel(item.source) : null,
  ].filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase();
}

function matchesFilter(
  item: FocusMatchable,
  filter: FilterName,
  focusFilters: FocusFilterName[] = [],
  focusIncludeTerms: string[] = [],
  focusExcludeTerms: string[] = [],
): boolean {
  if (filter === "For you" || filter === "Following") return true;
  const haystack = focusMatchText(item);
  if (filter === "My focus") {
    const included = focusFilters.some((focusFilter) => matchesFilter(item, focusFilter))
      || focusIncludeTerms.some((term) => haystack.includes(term.toLocaleLowerCase()));
    return included && !focusExcludeTerms.some((term) => haystack.includes(term.toLocaleLowerCase()));
  }
  return filterTerms[filter].some((term) => haystack.includes(term));
}

function matchesSearchQuery(values: Array<string | null | undefined>, query: string) {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = values.filter(Boolean).join(" ").toLocaleLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

const scoreTones = [["Heat", "heat", "coral"], ["Confidence", "confidence", "blue"], ["Relevance", "relevance", "violet"], ["Opportunity", "opportunity", "green"]] as const;

const filters: readonly FilterName[] = ["For you", "Codex", "Claude Code", "Chinese AI", "Vibe coding", "Models & launches", "Memes & culture"];
const secondaryFilters: readonly FilterName[] = ["Agents & IDEs", "Open source", "Benchmarks & papers", "Pricing & outages", "Tutorials & workflows", "Business & policy"];

const navItems: ReadonlyArray<readonly [string, string, ViewKey]> = [
  ["⌁", "Command Center", "command"], ["◉", "Live Radar", "radar"],
  ["◇", "Stories", "stories"], ["◎", "Creators", "creators"],
  ["▤", "YouTube Radar", "youtube"], ["中", "Chinese Intel", "china"], ["↗", "Rankings", "rankings"],
  ["Q", "Radar Quality", "quality"],
  ["⊙", "System Health", "health"],
  ["✦", "Content Studio", "studio"],
] as const;

const viewTitles: Record<ViewKey, { eyebrow: string; title: string; description: string }> = {
  command: { eyebrow: "TODAY", title: "Command Center", description: "What deserves your attention right now." },
  radar: { eyebrow: "LIVE INTELLIGENCE", title: "Live Radar", description: "Every observed signal, newest first." },
  stories: { eyebrow: "NARRATIVE GRAPH", title: "Stories", description: "Evidence joined into developing narratives." },
  creators: { eyebrow: "WATCHLIST", title: "Creators", description: "People, labs, channels, and projects you track." },
  youtube: { eyebrow: "VIDEO INTELLIGENCE", title: "YouTube Radar", description: "Channel momentum, coverage gaps, and early uploads." },
  china: { eyebrow: "CHINESE → ENGLISH", title: "Chinese Intelligence", description: "Verified Chinese-first stories before Western saturation." },
  rankings: { eyebrow: "24-HOUR WINDOW", title: "Rankings", description: "Movement and opportunity ranked separately." },
  quality: { eyebrow: "HISTORICAL REPLAY", title: "Radar Quality", description: "Proof of what was caught, missed, and alerted incorrectly." },
  health: { eyebrow: "OPERATIONS", title: "System Health", description: "Truthful connector, queue, evidence, and retention status." },
  studio: { eyebrow: "EVIDENCE-GROUNDED", title: "Content Studio", description: "Turn a verified story into an original angle." },
};

function RuntimeGate({ state, onRetry }: { state: Exclude<RuntimeState, "ready">; onRetry: () => void }) {
  const unavailable = state === "unavailable";
  return (
    <main className={`runtime-gate tracker-public ${unavailable ? "unavailable" : "resolving"}`} aria-live="polite" aria-busy={!unavailable}>
      <header className="runtime-gate-header">
        <div className="brand-lockup"><span className="brand-mark" aria-hidden="true"><i /></span><span>X Master</span></div>
        <span>Public intelligence</span>
      </header>
      <section className="runtime-gate-content">
        <div className="runtime-gate-visual" aria-hidden="true">
          <span className="runtime-orbit orbit-a" />
          <span className="runtime-orbit orbit-b" />
          <span className="runtime-orbit orbit-c" />
          <span className="runtime-core"><i /></span>
          <span className="runtime-signal signal-a" />
          <span className="runtime-signal signal-b" />
          <span className="runtime-signal signal-c" />
        </div>
        <div className="runtime-gate-copy">
          <div className="runtime-state-label"><i />{unavailable ? "Source check incomplete" : "Verifying live sources"}</div>
          <h1>{unavailable ? "Live intelligence is temporarily unavailable." : "Connecting the evidence lanes."}</h1>
          <p>{unavailable
            ? "Radar could not verify a live evidence source. No representative stories or scores are shown in its place."
            : "Radar is checking provider health and the durable story engine. Nothing appears as live, ranked, or scored until that check finishes."}</p>
          <div className="runtime-checks" aria-label="Runtime verification stages">
            <span className={unavailable ? "failed" : "active"}><i />Source health</span>
            <span><i />Evidence provenance</span>
            <span><i />Scoring capability</span>
          </div>
          {unavailable && <button type="button" onClick={onRetry}>Try source check again</button>}
        </div>
      </section>
      <footer><span>Public · read only</span><span>Exact evidence before intelligence</span></footer>
    </main>
  );
}

export default function LegacyDashboard() {
  const [activeView, setActiveView] = useState<ViewKey>("command");
  const [trackerSource, setTrackerSource] = useState<TrackerSource>("all");
  const [selectedFilter, setSelectedFilter] = useState<FilterName>("For you");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [panel, setPanel] = useState<"search" | "watch" | "story" | "studio" | "alerts" | "creator" | "desk" | "evidence" | "pickup" | "sources" | "focus" | null>(null);
  const [selectedPublicEvidenceKey, setSelectedPublicEvidenceKey] = useState<string | null>(null);
  const [evidenceShareState, setEvidenceShareState] = useState<"idle" | "sharing" | "copied" | "shared" | "error">("idle");
  const [selectedPublicPickupKey, setSelectedPublicPickupKey] = useState<string | null>(null);
  const [pickupShareState, setPickupShareState] = useState<"idle" | "sharing" | "copied" | "shared" | "error">("idle");
  const [selectedCreatorId, setSelectedCreatorId] = useState<string | null>(null);
  const [guideReady, setGuideReady] = useState(false);
  const [guideVisible, setGuideVisible] = useState(false);
  const [guidePersistence, setGuidePersistence] = useState<"local" | "session">("local");
  const [saved, setSaved] = useState(false);
  const [savedEvidence, setSavedEvidence] = useState<SavedEvidence[]>([]);
  const [evidenceDeskReady, setEvidenceDeskReady] = useState(false);
  const [evidenceDeskPersistence, setEvidenceDeskPersistence] = useState<"local" | "session">("local");
  const [evidenceDeskMessage, setEvidenceDeskMessage] = useState("");
  const [evidenceCases, setEvidenceCases] = useState<EvidenceCase[]>([]);
  const [evidenceCasesReady, setEvidenceCasesReady] = useState(false);
  const [evidenceCasesPersistence, setEvidenceCasesPersistence] = useState<"local" | "session">("local");
  const [evidenceCaseTitle, setEvidenceCaseTitle] = useState("");
  const [selectedEvidenceKeys, setSelectedEvidenceKeys] = useState<string[]>([]);
  const [activeEvidenceCaseId, setActiveEvidenceCaseId] = useState<string | null>(null);
  const [evidenceCaseDeleteId, setEvidenceCaseDeleteId] = useState<string | null>(null);
  const [evidenceCaseImporting, setEvidenceCaseImporting] = useState(false);
  const [localWatchlist, setLocalWatchlist] = useState<LocalWatch[]>([]);
  const [localWatchlistReady, setLocalWatchlistReady] = useState(false);
  const [localWatchlistPersistence, setLocalWatchlistPersistence] = useState<"local" | "session">("local");
  const [localWatchlistMessage, setLocalWatchlistMessage] = useState("");
  const [mutedSources, setMutedSources] = useState<string[]>([]);
  const [mutedSourcesReady, setMutedSourcesReady] = useState(false);
  const [mutedSourcesPersistence, setMutedSourcesPersistence] = useState<"local" | "session">("local");
  const [mutedSourcesMessage, setMutedSourcesMessage] = useState("");
  const [focusFilters, setFocusFilters] = useState<FocusFilterName[]>([]);
  const [focusIncludeTerms, setFocusIncludeTerms] = useState<string[]>([]);
  const [focusExcludeTerms, setFocusExcludeTerms] = useState<string[]>([]);
  const [focusIncludeInput, setFocusIncludeInput] = useState("");
  const [focusExcludeInput, setFocusExcludeInput] = useState("");
  const [focusFiltersReady, setFocusFiltersReady] = useState(false);
  const [focusFiltersPersistence, setFocusFiltersPersistence] = useState<"local" | "session">("local");
  const [focusFiltersMessage, setFocusFiltersMessage] = useState("");
  const [localAlertsReady, setLocalAlertsReady] = useState(false);
  const [localAlertsEnabled, setLocalAlertsEnabled] = useState(false);
  const [localAlertPermission, setLocalAlertPermission] = useState<LocalAlertPermission>("unsupported");
  const [localAlertPersistence, setLocalAlertPersistence] = useState<"local" | "session">("local");
  const [localAlertMessage, setLocalAlertMessage] = useState("");
  const [networkOnline, setNetworkOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installState, setInstallState] = useState<"hidden" | "ready" | "installing" | "installed">("hidden");
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [leadStory, setLeadStory] = useState<StorySummary>(fallbackStory);
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [creators, setCreators] = useState<CreatorItem[]>([]);
  const [rankings, setRankings] = useState<RankingsPayload | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([]);
  const [replyOpportunities, setReplyOpportunities] = useState<ReplyOpportunityItem[]>([]);
  const [storyDetail, setStoryDetail] = useState<StoryDetail | null>(null);
  const [connected, setConnected] = useState(false);
  const [publicLive, setPublicLive] = useState(false);
  const [publicBootstrapping, setPublicBootstrapping] = useState(true);
  const [publicSources, setPublicSources] = useState<PublicSourceStatus[]>([]);
  const [publicExactLinkGroups, setPublicExactLinkGroups] = useState<PublicExactLinkGroup[]>([]);
  const [publicHistory, setPublicHistory] = useState<PublicEvidenceHistory | null>(null);
  const [publicArchiveMovementFilter, setPublicArchiveMovementFilter] = useState<PublicArchiveMovementFilter>("all");
  const [returnBrief, setReturnBrief] = useState<PublicReturnBrief | null>(null);
  const [returnBriefState, setReturnBriefState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [returnBriefDismissed, setReturnBriefDismissed] = useState(false);
  const [returnVisitReady, setReturnVisitReady] = useState(false);
  const [returnVisitCheckpoint, setReturnVisitCheckpoint] = useState<string | null>(null);
  const [returnVisitPersistence, setReturnVisitPersistence] = useState<"local" | "session">("local");
  const [publicRefreshMs, setPublicRefreshMs] = useState(DEFAULT_PUBLIC_REFRESH_MS);
  const [publicRefreshDelayed, setPublicRefreshDelayed] = useState(false);
  const [runtimeState, setRuntimeState] = useState<RuntimeState>("ready");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPayload, setSearchPayload] = useState<SearchPayload | null>(null);
  const [searchState, setSearchState] = useState<"idle" | "loading" | "ready" | "fallback">("idle");
  const normalizedSearchQuery = searchQuery.trim();
  const [sourceHealth, setSourceHealth] = useState<SourceHealth | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [feedbackState, setFeedbackState] = useState<Record<string, string>>({});
  const [alertClock, setAlertClock] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "sharing" | "copied" | "shared" | "error">("idle");
  const [watchTier, setWatchTier] = useState("P0");
  const [watchProvider, setWatchProvider] = useState<"x" | "youtube">("x");
  const [watchValue, setWatchValue] = useState("");
  const [watchState, setWatchState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [watchMessage, setWatchMessage] = useState("");
  const [contentIdeas, setContentIdeas] = useState<ContentIdeaItem[]>([]);
  const [evaluationRun, setEvaluationRun] = useState<EvaluationRunSummary | null>(null);
  const [qualityState, setQualityState] = useState<"loading" | "ready" | "empty" | "unavailable">("loading");
  const [studioFormat, setStudioFormat] = useState<ContentFormat>("x_post");
  const [studioTone, setStudioTone] = useState<ContentTone>("useful");
  const [publicStudioItemId, setPublicStudioItemId] = useState<string | null>(null);
  const [studioState, setStudioState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [studioMessage, setStudioMessage] = useState("");
  const thumbnailCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [thumbnailHeadlineIndex, setThumbnailHeadlineIndex] = useState(0);
  const [thumbnailState, setThumbnailState] = useState<"idle" | "exporting" | "ready" | "error">("idle");
  const [thumbnailMessage, setThumbnailMessage] = useState("");
  const [performanceState, setPerformanceState] = useState<"idle" | "loading" | "saving" | "ready" | "error">("idle");
  const [performanceMessage, setPerformanceMessage] = useState("");
  const [publishedResult, setPublishedResult] = useState({ url: "", publishedAt: "", metric: "impressions", value: "" });
  const [operatorSession, setOperatorSession] = useState<OperatorSessionState>({ loading: true, configured: false, authenticated: false, backend_configured: false });
  const [operatorPassword, setOperatorPassword] = useState("");
  const [operatorMessage, setOperatorMessage] = useState("");
  const [operatorBusy, setOperatorBusy] = useState(false);
  const [storyReviews, setStoryReviews] = useState<StoryReviewItem[]>([]);
  const [storyReviewState, setStoryReviewState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [storyReviewReasons, setStoryReviewReasons] = useState<Record<string, string>>({});
  const [storyReviewBusy, setStoryReviewBusy] = useState<Record<string, boolean>>({});
  const [storyReviewMessage, setStoryReviewMessage] = useState("");
  const [storyMutationReason, setStoryMutationReason] = useState("");
  const [storySplitTitle, setStorySplitTitle] = useState("");
  const [storySplitItems, setStorySplitItems] = useState<string[]>([]);
  const [storyMergeSource, setStoryMergeSource] = useState("");
  const [storyMutationState, setStoryMutationState] = useState<"idle" | "saving" | "error">("idle");
  const [storyMutationMessage, setStoryMutationMessage] = useState("");
  const [sourceControlReasons, setSourceControlReasons] = useState<Record<string, string>>({});
  const [sourceControlBusy, setSourceControlBusy] = useState<Record<string, boolean>>({});
  const [sourceControlMessage, setSourceControlMessage] = useState("");
  const [rednoteImport, setRednoteImport] = useState({ url: "", externalId: "", text: "", publishedAt: "", authorizationReference: "", likes: "", comments: "", reason: "" });
  const [rednoteImportState, setRednoteImportState] = useState<"idle" | "saving" | "error" | "saved">("idle");
  const [rednoteImportMessage, setRednoteImportMessage] = useState("");
  const modalSheetRef = useRef<HTMLElement>(null);
  const modalCloseRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const evidenceCaseImportRef = useRef<HTMLInputElement>(null);
  const publicRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const publicLastRefreshAtRef = useRef(0);
  const hasPublicEvidenceRef = useRef(false);
  const localAlertSeenKeysRef = useRef<string[]>([]);
  const localAlertInitializedRef = useRef(false);
  const shareResetTimerRef = useRef<number | null>(null);
  const evidenceShareResetTimerRef = useRef<number | null>(null);
  const pickupShareResetTimerRef = useRef<number | null>(null);
  const returnBriefStartedRef = useRef(false);

  const refreshOperatorSession = useCallback(async () => {
    try {
      const response = await fetch("/api/operator-session", { cache: "no-store" });
      if (!response.ok) throw new Error("Operator status is unavailable.");
      const payload = await response.json() as Omit<OperatorSessionState, "loading">;
      setOperatorSession({ ...payload, loading: false });
    } catch {
      setOperatorSession({ loading: false, configured: false, authenticated: false, backend_configured: false, reason: "Operator status is unavailable." });
    }
  }, []);

  const refreshPublicFeed = useCallback(async () => {
    if (publicRefreshInFlightRef.current) {
      await publicRefreshInFlightRef.current;
      return;
    }
    const refresh = (async () => {
      publicLastRefreshAtRef.current = Date.now();
      if (!hasPublicEvidenceRef.current) setPublicBootstrapping(true);
      setConnected(false);
      setQualityState("unavailable");
      try {
        const publicResponse = await fetch("/api/public-signals", {
          cache: "no-store",
          signal: AbortSignal.timeout(12_000),
        });
        if (!publicResponse.ok) throw new Error("public pulse unavailable");
        const publicPayload = await publicResponse.json() as { mode?: string; generated_at?: string; refresh_after_seconds?: number; items?: FeedItem[]; sources?: PublicSourceStatus[]; exact_link_groups?: PublicExactLinkGroup[]; history?: PublicEvidenceHistory };
        if (publicPayload.mode !== "public_multi_source") throw new Error("unexpected public pulse mode");
        const requestedRefreshMs = Number(publicPayload.refresh_after_seconds) * 1_000;
        setPublicRefreshMs(Number.isFinite(requestedRefreshMs)
          ? Math.min(MAX_PUBLIC_REFRESH_MS, Math.max(MIN_PUBLIC_REFRESH_MS, requestedRefreshMs))
          : DEFAULT_PUBLIC_REFRESH_MS);
        setFeedItems(publicPayload.items ?? []);
        setPublicSources(publicPayload.sources ?? []);
        setPublicExactLinkGroups(publicPayload.exact_link_groups ?? []);
        setPublicHistory(publicPayload.history ?? null);
        setStories([]);
        setRankings(null);
        setOpportunities([]);
        setReplyOpportunities([]);
        setAlerts([]);
        setCreators([]);
        hasPublicEvidenceRef.current = true;
        setPublicRefreshDelayed(false);
        setPublicLive(true);
        setPublicBootstrapping(false);
        setRuntimeState("ready");
      } catch {
        setPublicBootstrapping(false);
        if (hasPublicEvidenceRef.current) {
          setPublicRefreshDelayed(true);
          return;
        }
        setFeedItems([]);
        setPublicSources([]);
        setPublicExactLinkGroups([]);
        setPublicHistory(null);
        setPublicLive(false);
        setRuntimeState("unavailable");
      }
    })();
    publicRefreshInFlightRef.current = refresh;
    try {
      await refresh;
    } finally {
      if (publicRefreshInFlightRef.current === refresh) publicRefreshInFlightRef.current = null;
    }
  }, []);

  const refreshFeed = useCallback(async () => {
    try {
      const [response, healthResponse, storiesResponse, alertsResponse, creatorsResponse, rankingsResponse, opportunitiesResponse, evaluationResponse] = await Promise.all([
        fetch(`${apiBase}/v1/feed?limit=30`, { cache: "no-store" }),
        fetch(`${apiBase}/v1/sources/health`, { cache: "no-store" }),
        fetch(`${apiBase}/v1/stories?limit=30`, { cache: "no-store" }),
        fetch(`${apiBase}/v1/alerts?limit=8`, { cache: "no-store" }),
        fetch(`${apiBase}/v1/creators?limit=50`, { cache: "no-store" }),
        fetch(`${apiBase}/v1/rankings?limit=10`, { cache: "no-store" }),
        fetch(`${apiBase}/v1/opportunities?limit=20`, { cache: "no-store" }),
        fetch(`${apiBase}/v1/evaluation/summary`, { cache: "no-store" }),
      ]);
      if (!response.ok) throw new Error("feed unavailable");
      const payload = await response.json() as { items?: FeedItem[] };
      setFeedItems(payload.items ?? []);
      setPublicLive(false);
      setPublicBootstrapping(false);
      setPublicSources([]);
      setPublicExactLinkGroups([]);
      if (healthResponse.ok) setSourceHealth(await healthResponse.json() as SourceHealth);
      if (storiesResponse.ok) {
        const storyPayload = await storiesResponse.json() as { items?: StorySummary[] };
        setStories(storyPayload.items ?? []);
        if (storyPayload.items?.length) {
          setLeadStory(storyPayload.items[0]);
        }
      }
      if (alertsResponse.ok) {
        const alertPayload = await alertsResponse.json() as { items?: AlertItem[] };
        setAlerts(alertPayload.items ?? []);
      }
      if (creatorsResponse.ok) {
        const creatorPayload = await creatorsResponse.json() as { items?: CreatorItem[] };
        setCreators(creatorPayload.items ?? []);
      }
      if (rankingsResponse.ok) setRankings(await rankingsResponse.json() as RankingsPayload);
      if (opportunitiesResponse.ok) {
        const opportunityPayload = await opportunitiesResponse.json() as { items?: OpportunityItem[]; reply_opportunities?: ReplyOpportunityItem[] };
        setOpportunities(opportunityPayload.items ?? []);
        setReplyOpportunities(opportunityPayload.reply_opportunities ?? []);
      }
      if (evaluationResponse.ok) {
        const evaluationPayload = await evaluationResponse.json() as { item?: EvaluationRunSummary | null };
        setEvaluationRun(evaluationPayload.item ?? null);
        setQualityState(evaluationPayload.item ? "ready" : "empty");
      } else {
        setQualityState("unavailable");
      }
      setConnected(true);
      setRuntimeState("ready");
    } catch {
      await refreshPublicFeed();
    }
  }, [refreshPublicFeed]);

  const refreshStoryReviews = useCallback(async () => {
    setStoryReviewState("loading");
    try {
      const response = await fetch("/api/story-review?limit=25", { cache: "no-store" });
      const payload = await response.json() as { detail?: string; items?: StoryReviewItem[] };
      if (!response.ok) throw new Error(payload.detail ?? "Story review queue is unavailable.");
      setStoryReviews(payload.items ?? []);
      setStoryReviewState("ready");
      setStoryReviewMessage("");
    } catch (error) {
      setStoryReviewState("error");
      setStoryReviewMessage(error instanceof Error ? error.message : "Story review queue is unavailable.");
    }
  }, []);

  useEffect(() => {
    const applyLocationView = (scrollToTop: boolean) => {
      const locationUrl = new URL(window.location.href);
      const requestedView = locationUrl.searchParams.get("view");
      const requestedSource = parseTrackerSource(locationUrl.searchParams.get("source"));
      setTrackerSource(requestedView === "radar" ? requestedSource : "all");
      if (requestedSource === "all" || requestedView !== "radar") locationUrl.searchParams.delete("source");
      const requestedEvidence = locationUrl.searchParams.get("evidence");
      const requestedPickup = locationUrl.searchParams.get("pickup");
      const evidenceKey = safePublicEvidenceKey(requestedEvidence);
      const pickupKey = evidenceKey ? null : safePublicPickupKey(requestedPickup);
      const nextView = evidenceKey || pickupKey ? "stories" : isViewKey(requestedView) ? requestedView : "command";
      if (shareResetTimerRef.current !== null) window.clearTimeout(shareResetTimerRef.current);
      shareResetTimerRef.current = null;
      setShareState("idle");
      if (evidenceShareResetTimerRef.current !== null) window.clearTimeout(evidenceShareResetTimerRef.current);
      evidenceShareResetTimerRef.current = null;
      setEvidenceShareState("idle");
      if (pickupShareResetTimerRef.current !== null) window.clearTimeout(pickupShareResetTimerRef.current);
      pickupShareResetTimerRef.current = null;
      setPickupShareState("idle");
      setActiveView(nextView);
      setSelectedPublicEvidenceKey(evidenceKey);
      setSelectedPublicPickupKey(pickupKey);
      setPanel(evidenceKey ? "evidence" : pickupKey ? "pickup" : null);

      if (requestedEvidence && !evidenceKey) locationUrl.searchParams.delete("evidence");
      if (requestedPickup && !safePublicPickupKey(requestedPickup)) locationUrl.searchParams.delete("pickup");
      if (evidenceKey) {
        locationUrl.searchParams.delete("pickup");
        locationUrl.searchParams.set("view", "stories");
      } else if (pickupKey) {
        locationUrl.searchParams.delete("evidence");
        locationUrl.searchParams.set("view", "stories");
      }
      else if (requestedView !== null && (!isViewKey(requestedView) || requestedView === "command")) locationUrl.searchParams.delete("view");
      locationUrl.hash = "";
      const canonicalPath = `${locationUrl.pathname}${locationUrl.search}`;
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (canonicalPath !== currentPath) {
        window.history.replaceState({ ...window.history.state, radarView: nextView }, "", canonicalPath);
      }
      if (scrollToTop) window.scrollTo({ top: 0, behavior: "auto" });
    };

    applyLocationView(false);
    const handlePopState = () => applyLocationView(true);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => () => {
    if (shareResetTimerRef.current !== null) window.clearTimeout(shareResetTimerRef.current);
    if (evidenceShareResetTimerRef.current !== null) window.clearTimeout(evidenceShareResetTimerRef.current);
    if (pickupShareResetTimerRef.current !== null) window.clearTimeout(pickupShareResetTimerRef.current);
  }, []);

  useEffect(() => {
    const syncNetworkState = () => setNetworkOnline(window.navigator.onLine);
    const offerInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setInstallState("ready");
    };
    const markInstalled = () => {
      setInstallPrompt(null);
      setInstallState("installed");
    };
    const initialState = window.setTimeout(() => {
      syncNetworkState();
      if (window.matchMedia("(display-mode: standalone)").matches) markInstalled();
    }, 0);

    window.addEventListener("online", syncNetworkState);
    window.addEventListener("offline", syncNetworkState);
    window.addEventListener("beforeinstallprompt", offerInstall);
    window.addEventListener("appinstalled", markInstalled);

    if (process.env.NODE_ENV === "production"
      && process.env.NEXT_PUBLIC_DISABLE_SERVICE_WORKER !== "true"
      && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }

    return () => {
      window.clearTimeout(initialState);
      window.removeEventListener("online", syncNetworkState);
      window.removeEventListener("offline", syncNetworkState);
      window.removeEventListener("beforeinstallprompt", offerInstall);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refreshOperatorSession(), 0);
    return () => window.clearTimeout(initialRefresh);
  }, [refreshOperatorSession]);

  useEffect(() => {
    const load = window.setTimeout(() => {
      try {
        setSavedEvidence(parseSavedEvidence(window.localStorage.getItem(EVIDENCE_DESK_STORAGE_KEY)));
        setEvidenceDeskPersistence("local");
      } catch {
        setEvidenceDeskPersistence("session");
      } finally {
        setEvidenceDeskReady(true);
      }
    }, 0);
    return () => window.clearTimeout(load);
  }, []);

  useEffect(() => {
    const load = window.setTimeout(() => {
      try {
        setEvidenceCases(parseEvidenceCases(window.localStorage.getItem(EVIDENCE_CASES_STORAGE_KEY)));
        setEvidenceCasesPersistence("local");
      } catch {
        setEvidenceCasesPersistence("session");
      } finally {
        setEvidenceCasesReady(true);
      }
    }, 0);
    return () => window.clearTimeout(load);
  }, []);

  useEffect(() => {
    const load = window.setTimeout(() => {
      try {
        setLocalWatchlist(parseLocalWatchlist(window.localStorage.getItem(LOCAL_WATCHLIST_STORAGE_KEY)));
        setLocalWatchlistPersistence("local");
      } catch {
        setLocalWatchlistPersistence("session");
      } finally {
        setLocalWatchlistReady(true);
      }
    }, 0);
    return () => window.clearTimeout(load);
  }, []);

  useEffect(() => {
    const load = window.setTimeout(() => {
      try {
        setMutedSources(parseMutedSources(window.localStorage.getItem(MUTED_SOURCES_STORAGE_KEY)));
        setMutedSourcesPersistence("local");
      } catch {
        setMutedSourcesPersistence("session");
      } finally {
        setMutedSourcesReady(true);
      }
    }, 0);
    return () => window.clearTimeout(load);
  }, []);

  useEffect(() => {
    const load = window.setTimeout(() => {
      try {
        const profile = parseFocusProfile(
          window.localStorage.getItem(FOCUS_PROFILE_STORAGE_KEY),
          window.localStorage.getItem(FOCUS_FILTERS_STORAGE_KEY),
        );
        setFocusFilters(profile.filters);
        setFocusIncludeTerms(profile.includeTerms);
        setFocusExcludeTerms(profile.excludeTerms);
        setFocusFiltersPersistence("local");
      } catch {
        setFocusFiltersPersistence("session");
      } finally {
        setFocusFiltersReady(true);
      }
    }, 0);
    return () => window.clearTimeout(load);
  }, []);

  useEffect(() => {
    const load = window.setTimeout(() => {
      try {
        setReturnVisitCheckpoint(validReturnCheckpoint(window.localStorage.getItem(RETURN_VISIT_STORAGE_KEY)));
        setReturnVisitPersistence("local");
      } catch {
        setReturnVisitPersistence("session");
      } finally {
        setReturnVisitReady(true);
      }
    }, 0);
    return () => window.clearTimeout(load);
  }, []);

  useEffect(() => {
    const load = window.setTimeout(() => {
      const permission: LocalAlertPermission = typeof window.Notification === "undefined"
        ? "unsupported"
        : window.Notification.permission;
      setLocalAlertPermission(permission);
      try {
        const settings = parseLocalAlertSettings(window.localStorage.getItem(LOCAL_ALERTS_STORAGE_KEY));
        localAlertSeenKeysRef.current = settings.seen_item_keys;
        localAlertInitializedRef.current = settings.initialized;
        setLocalAlertsEnabled(settings.enabled && permission === "granted");
        setLocalAlertPersistence("local");
      } catch {
        setLocalAlertPersistence("session");
      } finally {
        setLocalAlertsReady(true);
      }
    }, 0);
    return () => window.clearTimeout(load);
  }, []);

  useEffect(() => {
    if (!localAlertsReady || typeof window.Notification === "undefined") return;
    const syncPermission = () => {
      if (document.visibilityState !== "visible") return;
      const permission = window.Notification.permission;
      setLocalAlertPermission(permission);
      if (permission !== "granted") {
        setLocalAlertsEnabled((enabled) => {
          if (enabled) setLocalAlertMessage(permission === "denied"
            ? "Browser alerts are blocked. Allow notifications for this site in your browser settings to turn them back on."
            : "Browser alert permission was reset. Turn alerts on again when you are ready.");
          return false;
        });
      }
    };
    document.addEventListener("visibilitychange", syncPermission);
    return () => document.removeEventListener("visibilitychange", syncPermission);
  }, [localAlertsReady]);

  useEffect(() => {
    if (!returnVisitReady
      || returnBriefStartedRef.current
      || operatorSession.loading
      || operatorSession.backend_configured
      || !publicLive
      || publicHistory?.status !== "available") return;
    returnBriefStartedRef.current = true;
    const now = Date.now();
    const checkpoint = validReturnCheckpoint(returnVisitCheckpoint, now);
    const persistCheckpoint = (value: string) => {
      try {
        window.localStorage.setItem(RETURN_VISIT_STORAGE_KEY, value);
        setReturnVisitPersistence("local");
      } catch {
        setReturnVisitPersistence("session");
      }
    };
    if (!checkpoint || now - Date.parse(checkpoint) < MIN_RETURN_VISIT_GAP_MS) {
      persistCheckpoint(new Date(now).toISOString());
      return;
    }

    const controller = new AbortController();
    const load = window.setTimeout(() => {
      setReturnBriefState("loading");
      void fetch(`/api/public-return-brief?since=${encodeURIComponent(checkpoint)}&limit=8`, {
        cache: "no-store",
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) throw new Error("Return briefing is unavailable.");
        const payload = await response.json() as PublicReturnBrief;
        if (payload.mode !== "request_observed_return_brief"
          || payload.brief_version !== "public-request-observed-return-brief-v1"
          || !Array.isArray(payload.items)
          || !payload.boundaries?.request_observed
          || payload.boundaries.continuous_monitoring
          || payload.boundaries.story_membership
          || payload.boundaries.ranking) throw new Error("Unexpected return briefing contract.");
        const generatedAt = validReturnCheckpoint(payload.generated_at) ?? new Date().toISOString();
        setReturnBrief({ ...payload, generated_at: generatedAt });
        setReturnBriefState("ready");
        persistCheckpoint(generatedAt);
      }).catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setReturnBriefState("unavailable");
      });
    }, 0);
    return () => {
      window.clearTimeout(load);
      controller.abort();
    };
  }, [operatorSession.backend_configured, operatorSession.loading, publicHistory?.status, publicLive, returnVisitCheckpoint, returnVisitReady]);

  useEffect(() => {
    const load = window.setTimeout(() => {
      try {
        setGuideVisible(window.localStorage.getItem(ONBOARDING_STORAGE_KEY) !== "complete");
        setGuidePersistence("local");
      } catch {
        setGuideVisible(true);
        setGuidePersistence("session");
      } finally {
        setGuideReady(true);
      }
    }, 0);
    return () => window.clearTimeout(load);
  }, []);

  useEffect(() => {
    if (!operatorSession.authenticated || activeView !== "health") return;
    const request = window.setTimeout(() => void refreshStoryReviews(), 0);
    return () => window.clearTimeout(request);
  }, [activeView, operatorSession.authenticated, refreshStoryReviews]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPanel("search");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const closePanel = useCallback(() => {
    if (panel === "evidence" || panel === "pickup") {
      const url = new URL(window.location.href);
      url.searchParams.delete("evidence");
      url.searchParams.delete("pickup");
      url.searchParams.set("view", "stories");
      url.hash = "";
      window.history.replaceState({ ...window.history.state, radarView: "stories" }, "", `${url.pathname}${url.search}`);
      setSelectedPublicEvidenceKey(null);
      setSelectedPublicPickupKey(null);
      if (evidenceShareResetTimerRef.current !== null) window.clearTimeout(evidenceShareResetTimerRef.current);
      evidenceShareResetTimerRef.current = null;
      setEvidenceShareState("idle");
      if (pickupShareResetTimerRef.current !== null) window.clearTimeout(pickupShareResetTimerRef.current);
      pickupShareResetTimerRef.current = null;
      setPickupShareState("idle");
    }
    setPanel(null);
  }, [panel]);

  useDialogFocus({
    open: panel !== null,
    dialogRef: modalSheetRef,
    initialFocusRef: panel === "search" ? searchInputRef : modalCloseRef,
    onClose: closePanel,
  });

  useEffect(() => {
    document.body.style.overflow = panel ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [panel]);

  useEffect(() => {
    if (panel !== "search" || normalizedSearchQuery.length < 2) {
      return;
    }
    const publicArchiveSearchAvailable = !operatorSession.backend_configured
      && publicLive
      && publicHistory?.status === "available";
    if (!operatorSession.backend_configured && !publicArchiveSearchAvailable) return;
    const controller = new AbortController();
    const request = window.setTimeout(async () => {
      setSearchPayload(null);
      setSearchState("loading");
      try {
        const endpoint = operatorSession.backend_configured
          ? `${apiBase}/v1/search?q=${encodeURIComponent(normalizedSearchQuery)}&limit=6`
          : `/api/public-archive-search?q=${encodeURIComponent(normalizedSearchQuery)}&limit=12`;
        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("archive search unavailable");
        const payload = await response.json() as SearchPayload;
        if (payload.query.toLocaleLowerCase() !== normalizedSearchQuery.toLocaleLowerCase()) {
          throw new Error("stale archive search response");
        }
        setSearchPayload(payload);
        setSearchState("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSearchPayload(null);
        setSearchState("fallback");
      }
    }, 220);

    return () => {
      window.clearTimeout(request);
      controller.abort();
    };
  }, [normalizedSearchQuery, operatorSession.backend_configured, panel, publicHistory?.status, publicLive]);

  useEffect(() => {
    if (panel !== "alerts") return;
    const refreshClock = () => setAlertClock(Date.now());
    refreshClock();
    const interval = window.setInterval(refreshClock, 30_000);
    return () => window.clearInterval(interval);
  }, [panel]);

  useEffect(() => {
    if (operatorSession.loading) return;
    const initialRefresh = window.setTimeout(
      () => void (operatorSession.backend_configured ? refreshFeed() : refreshPublicFeed()),
      0,
    );
    if (!operatorSession.backend_configured) {
      return () => window.clearTimeout(initialRefresh);
    }
    const stream = new EventSource(`${apiBase}/v1/stream`);
    stream.addEventListener("invalidate", () => void refreshFeed());
    stream.addEventListener("ready", () => setConnected(true));
    stream.onerror = () => setConnected(false);
    return () => {
      window.clearTimeout(initialRefresh);
      stream.close();
    };
  }, [operatorSession.backend_configured, operatorSession.loading, refreshFeed, refreshPublicFeed]);

  useEffect(() => {
    if (operatorSession.loading || operatorSession.backend_configured) return;
    const refreshWhenStale = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - publicLastRefreshAtRef.current < publicRefreshMs) return;
      void refreshPublicFeed();
    };
    const interval = window.setInterval(refreshWhenStale, publicRefreshMs);
    document.addEventListener("visibilitychange", refreshWhenStale);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenStale);
    };
  }, [operatorSession.backend_configured, operatorSession.loading, publicRefreshMs, refreshPublicFeed]);

  useEffect(() => {
    if (!localAlertsReady || !localWatchlistReady || !mutedSourcesReady || !localAlertsEnabled || localAlertPermission !== "granted") return;
    if (operatorSession.backend_configured || !publicLive || typeof window.Notification === "undefined") return;
    const watchKeys = new Set(localWatchlist.map((watch) => watch.key));
    const mutedSourceKeys = new Set(mutedSources);
    const watchedItems = feedItems.filter((item) => {
      const username = item.creator?.username?.trim();
      return Boolean(!mutedSourceKeys.has(item.source) && username && watchKeys.has(localWatchKey(item.source, username)) && publicSignalKey(item));
    });
    const currentKeys = watchedItems.map(publicSignalKey);
    if (!localAlertInitializedRef.current) {
      const baseline = mergeLocalAlertSeenKeys(currentKeys, localAlertSeenKeysRef.current);
      localAlertSeenKeysRef.current = baseline;
      localAlertInitializedRef.current = true;
      try {
        window.localStorage.setItem(LOCAL_ALERTS_STORAGE_KEY, JSON.stringify({ enabled: true, initialized: true, seen_item_keys: baseline } satisfies LocalAlertSettings));
      } catch {
        window.queueMicrotask(() => setLocalAlertPersistence("session"));
      }
      return;
    }
    const seen = new Set(localAlertSeenKeysRef.current);
    const unseen = watchedItems.filter((item) => {
      const key = publicSignalKey(item);
      return Boolean(key && !seen.has(key));
    });
    if (!unseen.length) return;

    const lead = unseen[0];
    const sourceUrl = safeEvidenceUrl(lead.source_url);
    const title = unseen.length === 1 ? `New from ${signalAttribution(lead)}` : `${unseen.length} new watched signals`;
    const body = unseen.length === 1
      ? lead.title.slice(0, 220)
      : `${signalAttribution(lead)}: ${lead.title.slice(0, 180)}${unseen.length > 1 ? ` (+${unseen.length - 1} more)` : ""}`;
    try {
      const notification = new window.Notification(title, {
        body,
        tag: unseen.length === 1 ? `radar:${publicSignalKey(lead)}` : "radar:watched-signals",
      });
      notification.onclick = () => {
        notification.close();
        window.focus();
        if (sourceUrl) window.open(sourceUrl, "_blank", "noopener,noreferrer");
      };
      const nextSeen = mergeLocalAlertSeenKeys(unseen.map(publicSignalKey), localAlertSeenKeysRef.current);
      localAlertSeenKeysRef.current = nextSeen;
      try {
        window.localStorage.setItem(LOCAL_ALERTS_STORAGE_KEY, JSON.stringify({ enabled: true, initialized: true, seen_item_keys: nextSeen } satisfies LocalAlertSettings));
        window.queueMicrotask(() => {
          setLocalAlertPersistence("local");
          setLocalAlertMessage(unseen.length === 1 ? `Browser alert sent for ${signalAttribution(lead)}.` : `Browser alert sent for ${unseen.length} new watched signals.`);
        });
      } catch {
        window.queueMicrotask(() => {
          setLocalAlertPersistence("session");
          setLocalAlertMessage("Browser alert sent. Alert history is available only for this visit because browser storage is unavailable.");
        });
      }
    } catch {
      window.queueMicrotask(() => {
        setLocalAlertsEnabled(false);
        setLocalAlertMessage("This browser granted permission but could not display an alert. Alerts are off for this visit.");
      });
    }
  }, [feedItems, localAlertPermission, localAlertsEnabled, localAlertsReady, localWatchlist, localWatchlistReady, mutedSources, mutedSourcesReady, operatorSession.backend_configured, publicLive]);

  useEffect(() => {
    if (!operatorSession.backend_configured || leadStory.id === "preview-story") return;
    const controller = new AbortController();
    void fetch(`${apiBase}/v1/content-ideas?story_id=${leadStory.id}&limit=30`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("ideas unavailable");
        const payload = await response.json() as { items?: ContentIdeaItem[] };
        setContentIdeas(payload.items ?? []);
        if (payload.items?.length) setStudioState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStudioMessage("Grounded drafts will appear when the backend connection returns.");
      });
    return () => controller.abort();
  }, [leadStory.id, leadStory.score_as_of, operatorSession.backend_configured]);

  const protectedHeaders = () => ({
    "content-type": "application/json",
    ...(operatorSession.csrf_token ? { "x-radar-csrf": operatorSession.csrf_token } : {}),
  });

  const signInOperator = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOperatorBusy(true);
    setOperatorMessage("");
    try {
      const response = await fetch("/api/operator-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: operatorPassword }),
      });
      const payload = await response.json() as { detail?: string; authenticated?: boolean; csrf_token?: string; expires_at?: string };
      if (!response.ok || !payload.authenticated) throw new Error(payload.detail ?? "Operator sign-in failed.");
      setOperatorPassword("");
      setOperatorSession((current) => ({ ...current, loading: false, authenticated: true, csrf_token: payload.csrf_token, expires_at: payload.expires_at }));
      setOperatorMessage("Operator controls unlocked for this browser session.");
    } catch (error) {
      setOperatorMessage(error instanceof Error ? error.message : "Operator sign-in failed.");
    } finally {
      setOperatorBusy(false);
    }
  };

  const signOutOperator = async () => {
    setOperatorBusy(true);
    setOperatorMessage("");
    try {
      const response = await fetch("/api/operator-session", {
        method: "DELETE",
        headers: operatorSession.csrf_token ? { "x-radar-csrf": operatorSession.csrf_token } : {},
      });
      if (!response.ok) throw new Error("Could not end the operator session.");
      setOperatorSession((current) => ({ ...current, authenticated: false, csrf_token: undefined, expires_at: undefined }));
      setOperatorMessage("Operator session ended. Public read-only access remains available.");
    } catch (error) {
      setOperatorMessage(error instanceof Error ? error.message : "Could not end the operator session.");
    } finally {
      setOperatorBusy(false);
    }
  };

  const copyDraft = async (draft: string, ideaId?: string) => {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
    if (!ideaId) return;
    try {
      await fetch("/api/content-actions", {
        method: "POST",
        headers: protectedHeaders(),
        body: JSON.stringify({
          idea_id: ideaId,
          action_type: "copy",
          platform: studioFormat === "youtube_video" ? "youtube" : "x",
          event_id: crypto.randomUUID(),
          details: { surface: "content_studio", format: studioFormat },
        }),
      });
      setContentIdeas((current) => current.map((idea) => idea.id === ideaId ? { ...idea, status: "copied" } : idea));
    } catch {
      // The draft is already on the clipboard; outcome telemetry may retry later.
    }
  };

  const generateStudioDraft = async () => {
    if (leadStory.id === "preview-story") {
      setStudioMessage("Connect the Radar backend to generate and save evidence-grounded drafts.");
      return;
    }
    setStudioState("loading");
    setStudioMessage("");
    setThumbnailHeadlineIndex(0);
    setThumbnailState("idle");
    setThumbnailMessage("");
    try {
      const response = await fetch("/api/content-ideas", {
        method: "POST",
        headers: protectedHeaders(),
        body: JSON.stringify({ story_id: leadStory.id, formats: [studioFormat], tone: studioTone }),
      });
      const payload = await response.json() as { detail?: string; item?: { ideas?: ContentIdeaItem[] } };
      if (!response.ok) throw new Error(payload.detail ?? "Could not generate this grounded draft.");
      const returned = payload.item?.ideas ?? [];
      setContentIdeas((current) => {
        const returnedIds = new Set(returned.map((idea) => idea.id));
        return [...returned, ...current.filter((idea) => !returnedIds.has(idea.id))];
      });
      setStudioState("ready");
      setStudioMessage(returned.some((idea) => idea.is_stale) ? "The story changed; review the new evidence before publishing." : "Draft saved against the current evidence snapshot.");
    } catch (error) {
      setStudioState("error");
      setStudioMessage(error instanceof Error ? error.message : "Could not generate this grounded draft.");
    }
  };

  const exportThumbnail = async () => {
    if (!currentIdea || currentIdea.is_stale || !currentThumbnailArtifact || !thumbnailCanvasRef.current) {
      setThumbnailState("error");
      setThumbnailMessage(currentIdea?.is_stale ? "Regenerate from current evidence before exporting." : "Generate a grounded YouTube concept before exporting.");
      return;
    }
    setThumbnailState("exporting");
    setThumbnailMessage("");
    try {
      renderThumbnailCanvas(thumbnailCanvasRef.current, currentThumbnailArtifact, thumbnailHeadlineIndex);
      const blob = await canvasPngBlob(thumbnailCanvasRef.current);
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `ai-radar-thumbnail-${currentIdea.id.slice(0, 8)}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1_000);

      const headline = currentThumbnailArtifact.title_variants[thumbnailHeadlineIndex];
      const response = await fetch("/api/content-actions", {
        method: "POST",
        headers: protectedHeaders(),
        body: JSON.stringify({
          idea_id: currentIdea.id,
          action_type: "export",
          platform: "youtube",
          event_id: crypto.randomUUID(),
          details: {
            surface: "content_studio",
            artifact_renderer: currentThumbnailArtifact.renderer,
            artifact_schema_version: currentThumbnailArtifact.schema_version,
            headline_index: thumbnailHeadlineIndex,
            headline,
            width: currentThumbnailArtifact.width,
            height: currentThumbnailArtifact.height,
            evidence_hash: currentThumbnailArtifact.evidence_hash,
          },
        }),
      });
      if (!response.ok) {
        setThumbnailState("error");
        setThumbnailMessage("PNG downloaded, but the private export record could not be saved.");
        return;
      }
      setThumbnailState("ready");
      setThumbnailMessage("PNG downloaded and recorded against this evidence version.");
    } catch (error) {
      setThumbnailState("error");
      setThumbnailMessage(error instanceof Error ? error.message : "Could not export this thumbnail.");
    }
  };

  const selectStudioFormat = (format: ContentFormat) => {
    setStudioFormat(format);
    setThumbnailHeadlineIndex(0);
    setThumbnailState("idle");
    setThumbnailMessage("");
    setPublishedResult((current) => ({
      ...current,
      metric: format === "youtube_video" ? "views" : "impressions",
    }));
    setPerformanceMessage("");
  };

  const recordPublishedResult = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentIdea) {
      setPerformanceState("error");
      setPerformanceMessage("Generate and save this draft before recording a result.");
      return;
    }
    const publishedAt = new Date(publishedResult.publishedAt);
    const metricValue = Number(publishedResult.value);
    if (!publishedResult.url || Number.isNaN(publishedAt.getTime())) {
      setPerformanceState("error");
      setPerformanceMessage("Add the published link and exact publication time.");
      return;
    }
    if (!Number.isSafeInteger(metricValue) || metricValue < 0) {
      setPerformanceState("error");
      setPerformanceMessage("The observed metric must be a non-negative whole number.");
      return;
    }
    setPerformanceState("saving");
    setPerformanceMessage("");
    try {
      const platform = studioFormat === "youtube_video" ? "youtube" : "x";
      const actionResponse = await fetch("/api/content-actions", {
        method: "POST",
        headers: protectedHeaders(),
        body: JSON.stringify({
          idea_id: currentIdea.id,
          action_type: "publish",
          platform,
          event_id: crypto.randomUUID(),
          external_url: publishedResult.url.trim(),
          occurred_at: publishedAt.toISOString(),
          details: { surface: "content_studio", format: currentIdea.format },
        }),
      });
      const actionPayload = await actionResponse.json() as { detail?: string; item?: { id: string } };
      if (!actionResponse.ok || !actionPayload.item) {
        throw new Error(actionPayload.detail ?? "Could not save the published link.");
      }
      const outcomeResponse = await fetch("/api/content-outcomes", {
        method: "POST",
        headers: protectedHeaders(),
        body: JSON.stringify({
          action_id: actionPayload.item.id,
          event_id: crypto.randomUUID(),
          metrics: { [publishedResult.metric]: metricValue },
          observed_at: new Date().toISOString(),
          provenance: "manual",
        }),
      });
      const outcomePayload = await outcomeResponse.json() as { detail?: string; item?: { performance?: ContentPerformance } };
      if (!outcomeResponse.ok || !outcomePayload.item?.performance) {
        throw new Error(outcomePayload.detail ?? "Could not save this result snapshot.");
      }
      setContentIdeas((current) => current.map((idea) => idea.id === currentIdea.id ? { ...idea, status: "published", performance: outcomePayload.item?.performance } : idea));
      setPerformanceState("ready");
      const baseline = outcomePayload.item.performance.latest?.baseline;
      setPerformanceMessage(baseline?.status === "measured" ? "Result saved and compared with prior posts at the same age." : `Result saved. Radar needs ${Math.max(0, (baseline?.minimum_sample_size ?? 5) - (baseline?.sample_size ?? 0))} more comparable prior result${Math.max(0, (baseline?.minimum_sample_size ?? 5) - (baseline?.sample_size ?? 0)) === 1 ? "" : "s"} before showing lift.`);
    } catch (error) {
      setPerformanceState("error");
      setPerformanceMessage(error instanceof Error ? error.message : "Could not save this result.");
    }
  };

  const openStory = async (selectedStory: StorySummary = leadStory) => {
    setLeadStory(selectedStory);
    setStoryDetail(null);
    setStorySplitItems([]);
    setStorySplitTitle("");
    setStoryMergeSource("");
    setStoryMutationReason("");
    setStoryMutationMessage("");
    setPanel("story");
    if (selectedStory.id === "preview-story") return;
    try {
      const response = await fetch(`${apiBase}/v1/stories/${selectedStory.id}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { item?: StoryDetail | null };
      if (payload.item) {
        let operations: StoryOperation[] = [];
        if (operatorSession.authenticated) {
          const operationsResponse = await fetch(`/api/story-review?view=operations&story_id=${selectedStory.id}&limit=100`, { cache: "no-store" });
          if (operationsResponse.ok) {
            const operationPayload = await operationsResponse.json() as { items?: StoryOperation[] };
            operations = operationPayload.items ?? [];
          }
        }
        setStoryDetail({ ...payload.item, operations });
      }
    } catch {
      // Keep the summary-first panel usable while the evidence timeline reconnects.
    }
  };

  const addWatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = watchValue.trim();
    if (watchProvider === "youtube") {
      if (!/^UC[A-Za-z0-9_-]{22}$/.test(value)) {
        setWatchState("error");
        setWatchMessage("Enter the 24-character YouTube channel ID beginning with UC.");
        return;
      }
      setWatchState("saving");
      setWatchMessage("");
      try {
        const response = await fetch("/api/watch", {
          method: "POST",
          headers: protectedHeaders(),
          body: JSON.stringify({ provider: "youtube", channel_id: value, display_name: value, priority_tier: watchTier }),
        });
        const payload = await response.json() as { detail?: string };
        if (!response.ok) throw new Error(payload.detail ?? "Could not add this channel.");
        setWatchState("saved");
        setWatchMessage(`YouTube channel is now watched as ${watchTier}.`);
        window.setTimeout(() => { setPanel(null); setWatchState("idle"); setWatchValue(""); }, 900);
      } catch (error) {
        setWatchState("error");
        setWatchMessage(error instanceof Error ? error.message : "Could not add this channel.");
      }
      return;
    }
    const username = value.replace(/^@/, "");
    if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) {
      setWatchState("error");
      setWatchMessage("Enter an X handle such as @sama or @levelsio.");
      return;
    }
    setWatchState("saving");
    setWatchMessage("");
    try {
      const response = await fetch("/api/watch", {
        method: "POST",
        headers: protectedHeaders(),
        body: JSON.stringify({
          provider: "x",
          display_name: username,
          username,
          priority_tier: watchTier,
        }),
      });
      const payload = await response.json() as { detail?: string };
      if (!response.ok) throw new Error(payload.detail ?? "Could not add this watch.");
      setWatchState("saved");
      setWatchMessage(`@${username} is now watched as ${watchTier}.`);
      window.setTimeout(() => {
        setPanel(null);
        setWatchState("idle");
        setWatchValue("");
      }, 900);
    } catch (error) {
      setWatchState("error");
      setWatchMessage(error instanceof Error ? error.message : "Could not add this watch.");
    }
  };

  const commitEvidenceDesk = (next: SavedEvidence[], successMessage: string) => {
    setSavedEvidence(next);
    if (!evidenceDeskReady) return;
    try {
      window.localStorage.setItem(EVIDENCE_DESK_STORAGE_KEY, JSON.stringify(next));
      setEvidenceDeskPersistence("local");
      setEvidenceDeskMessage(successMessage);
    } catch {
      setEvidenceDeskPersistence("session");
      setEvidenceDeskMessage("Saved for this visit. Browser storage is unavailable, so this desk will reset when the tab closes.");
    }
  };

  const toggleEvidenceDesk = (item: FeedItem) => {
    const snapshot = savedEvidenceFromFeed(item);
    if (!snapshot) {
      setEvidenceDeskMessage("This item cannot be saved because it does not have a valid HTTPS evidence link.");
      return;
    }
    const key = evidenceDeskKey(snapshot);
    const alreadySaved = savedEvidence.some((savedItem) => evidenceDeskKey(savedItem) === key);
    const next = alreadySaved
      ? savedEvidence.filter((savedItem) => evidenceDeskKey(savedItem) !== key)
      : [snapshot, ...savedEvidence].slice(0, MAX_SAVED_EVIDENCE);
    commitEvidenceDesk(next, alreadySaved ? "Removed from your evidence desk." : "Saved to your evidence desk in this browser.");
  };

  const toggleHistoricalEvidenceDesk = (item: PublicEvidenceHistoryItem) => {
    const snapshot = savedEvidenceFromHistory(item);
    if (!snapshot) {
      setEvidenceDeskMessage("This archived item cannot be saved because it does not have a valid HTTPS evidence link.");
      return;
    }
    const key = evidenceDeskKey(snapshot);
    const alreadySaved = savedEvidence.some((savedItem) => evidenceDeskKey(savedItem) === key);
    const next = alreadySaved
      ? savedEvidence.filter((savedItem) => evidenceDeskKey(savedItem) !== key)
      : [snapshot, ...savedEvidence].slice(0, MAX_SAVED_EVIDENCE);
    commitEvidenceDesk(next, alreadySaved ? "Removed from your evidence desk." : "Saved to your evidence desk in this browser.");
  };

  const removeSavedEvidence = (item: SavedEvidence) => {
    const key = evidenceDeskKey(item);
    commitEvidenceDesk(savedEvidence.filter((savedItem) => evidenceDeskKey(savedItem) !== key), "Removed from your evidence desk.");
  };

  const copyEvidenceDesk = async () => {
    if (!savedEvidence.length) return;
    try {
      await navigator.clipboard.writeText(evidenceDeskMarkdown(savedEvidence));
      setEvidenceDeskMessage(`Copied ${savedEvidence.length} source ${savedEvidence.length === 1 ? "item" : "items"} with provenance notes.`);
    } catch {
      setEvidenceDeskMessage("The browser blocked clipboard access. Keep this panel open and copy each source link directly.");
    }
  };

  const commitEvidenceCases = (next: EvidenceCase[], successMessage: string) => {
    setEvidenceCases(next);
    if (!evidenceCasesReady) return;
    try {
      window.localStorage.setItem(EVIDENCE_CASES_STORAGE_KEY, JSON.stringify(next));
      setEvidenceCasesPersistence("local");
      setEvidenceDeskMessage(successMessage);
    } catch {
      setEvidenceCasesPersistence("session");
      setEvidenceDeskMessage("Case saved for this visit. Browser storage is unavailable, so it will reset when the tab closes.");
    }
  };

  const toggleEvidenceSelection = (item: SavedEvidence) => {
    const key = evidenceDeskKey(item);
    setSelectedEvidenceKeys((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key].slice(0, MAX_EVIDENCE_PER_CASE));
  };

  const createEvidenceCase = () => {
    const title = boundedText(evidenceCaseTitle, 140);
    const selected = savedEvidence.filter((item) => selectedEvidenceKeys.includes(evidenceDeskKey(item))).slice(0, MAX_EVIDENCE_PER_CASE);
    if (!title || !selected.length) {
      setEvidenceDeskMessage("Name the case and select at least one saved source.");
      return;
    }
    if (evidenceCases.length >= MAX_EVIDENCE_CASES) {
      setEvidenceDeskMessage(`This browser already has ${MAX_EVIDENCE_CASES} cases. Delete one before creating another.`);
      return;
    }
    const timestamp = new Date().toISOString();
    const evidenceCase: EvidenceCase = {
      id: window.crypto.randomUUID(),
      title,
      evidence: selected,
      created_at: timestamp,
      updated_at: timestamp,
    };
    const next = [evidenceCase, ...evidenceCases];
    commitEvidenceCases(next, `Created “${title}” with ${selected.length} source ${selected.length === 1 ? "item" : "items"}.`);
    setEvidenceCaseTitle("");
    setSelectedEvidenceKeys([]);
    setActiveEvidenceCaseId(evidenceCase.id);
  };

  const deleteEvidenceCase = (evidenceCase: EvidenceCase) => {
    commitEvidenceCases(evidenceCases.filter((item) => item.id !== evidenceCase.id), `Deleted “${evidenceCase.title}” from this browser.`);
    if (activeEvidenceCaseId === evidenceCase.id) setActiveEvidenceCaseId(null);
    setEvidenceCaseDeleteId(null);
  };

  const copyEvidenceCase = async (evidenceCase: EvidenceCase) => {
    try {
      await navigator.clipboard.writeText(evidenceCaseMarkdown(evidenceCase));
      setEvidenceDeskMessage(`Copied “${evidenceCase.title}” with its verification checklist.`);
    } catch {
      setEvidenceDeskMessage("The browser blocked clipboard access. Open each source in this case and copy its link directly.");
    }
  };

  const exportEvidenceCase = (evidenceCase: EvidenceCase) => {
    try {
      const body = JSON.stringify(portableEvidenceCasePayload(evidenceCase), null, 2);
      const blob = new Blob([body], { type: "application/json;charset=utf-8" });
      if (blob.size > MAX_PORTABLE_EVIDENCE_CASE_BYTES) {
        setEvidenceDeskMessage("This case is too large to export. Keep it at 20 evidence snapshots or fewer.");
        return;
      }
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = portableEvidenceCaseFilename(evidenceCase.title);
      anchor.hidden = true;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
      setEvidenceDeskMessage(`Exported “${evidenceCase.title}” as a portable, evidence-only case file.`);
    } catch {
      setEvidenceDeskMessage("This browser could not create the case file. Copy the verification brief instead.");
    }
  };

  const importEvidenceCase = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file || evidenceCaseImporting) return;
    if (file.size > MAX_PORTABLE_EVIDENCE_CASE_BYTES) {
      setEvidenceDeskMessage("That file is too large. Radar case files must be 256 KB or smaller.");
      return;
    }
    setEvidenceCaseImporting(true);
    try {
      const result = parsePortableEvidenceCase(await file.text());
      if (!result.evidenceCase || result.error) {
        setEvidenceDeskMessage(result.error ?? "That file is not a valid Radar evidence case.");
        return;
      }
      const existing = evidenceCases.find((item) => item.id === result.evidenceCase?.id);
      if (existing && JSON.stringify(existing) === JSON.stringify(result.evidenceCase)) {
        setActiveEvidenceCaseId(existing.id);
        setEvidenceCaseDeleteId(null);
        setEvidenceDeskMessage(`“${existing.title}” is already in this browser. No duplicate was created.`);
        return;
      }
      if (evidenceCases.length >= MAX_EVIDENCE_CASES) {
        setEvidenceDeskMessage(`This browser already has ${MAX_EVIDENCE_CASES} cases. Delete one before importing another.`);
        return;
      }
      const imported = existing
        ? { ...result.evidenceCase, id: window.crypto.randomUUID() }
        : result.evidenceCase;
      commitEvidenceCases([imported, ...evidenceCases], existing
        ? `Imported “${imported.title}” as a separate copy because its case ID already exists.`
        : `Imported “${imported.title}” with ${imported.evidence.length} preserved source ${imported.evidence.length === 1 ? "snapshot" : "snapshots"}.`);
      setActiveEvidenceCaseId(imported.id);
      setEvidenceCaseDeleteId(null);
    } catch {
      setEvidenceDeskMessage("The browser could not read that case file. Choose the original JSON export and try again.");
    } finally {
      setEvidenceCaseImporting(false);
    }
  };

  const commitLocalWatchlist = (next: LocalWatch[], successMessage: string) => {
    setLocalWatchlist(next);
    if (!localWatchlistReady) return;
    try {
      window.localStorage.setItem(LOCAL_WATCHLIST_STORAGE_KEY, JSON.stringify(next));
      setLocalWatchlistPersistence("local");
      setLocalWatchlistMessage(successMessage);
    } catch {
      setLocalWatchlistPersistence("session");
      setLocalWatchlistMessage("Watching for this visit. Browser storage is unavailable, so this list will reset when the tab closes.");
    }
  };

  const baselineLocalAlertsForSources = (sources: string[]) => {
    if (!localAlertsEnabled || !sources.length) return;
    const sourceKeys = new Set(sources);
    const nextSeen = mergeLocalAlertSeenKeys(
      feedItems.filter((item) => sourceKeys.has(item.source)).map(publicSignalKey),
      localAlertSeenKeysRef.current,
    );
    localAlertSeenKeysRef.current = nextSeen;
    localAlertInitializedRef.current = true;
    try {
      window.localStorage.setItem(LOCAL_ALERTS_STORAGE_KEY, JSON.stringify({ enabled: true, initialized: true, seen_item_keys: nextSeen } satisfies LocalAlertSettings));
      setLocalAlertPersistence("local");
    } catch {
      setLocalAlertPersistence("session");
    }
  };

  const commitMutedSources = (next: string[], successMessage: string) => {
    const normalized = parseMutedSources(JSON.stringify(next));
    setMutedSources(normalized);
    if (!mutedSourcesReady) return;
    try {
      window.localStorage.setItem(MUTED_SOURCES_STORAGE_KEY, JSON.stringify(normalized));
      setMutedSourcesPersistence("local");
      setMutedSourcesMessage(successMessage);
    } catch {
      setMutedSourcesPersistence("session");
      setMutedSourcesMessage("Source tuning works for this visit. Browser storage is unavailable, so it will reset when the tab closes.");
    }
  };

  const toggleMutedSource = (candidate: string) => {
    const source = boundedText(candidate, 80);
    if (!source || !/^[a-z0-9][a-z0-9_:-]{0,79}$/.test(source)) {
      setMutedSourcesMessage("That source cannot be tuned because its provider identity is invalid.");
      return;
    }
    const alreadyMuted = mutedSources.includes(source);
    if (alreadyMuted) baselineLocalAlertsForSources([source]);
    const next = alreadyMuted
      ? mutedSources.filter((item) => item !== source)
      : [...mutedSources, source].slice(0, MAX_MUTED_SOURCES);
    commitMutedSources(next, alreadyMuted
      ? `${sourceLabel(source)} is visible again. Existing items were baselined for page-level alerts.`
      : `${sourceLabel(source)} is muted from dashboard streams and page-level alerts.`);
  };

  const resetMutedSources = () => {
    baselineLocalAlertsForSources(mutedSources);
    commitMutedSources([], "Every source is visible again. Existing items were baselined for page-level alerts.");
  };

  const commitFocusProfile = (
    nextFilters: FocusFilterName[],
    nextIncludeTerms: string[],
    nextExcludeTerms: string[],
    successMessage: string,
  ) => {
    const normalizedFilters = parseFocusFilters(JSON.stringify(nextFilters));
    const normalizedIncludeTerms = parseFocusTerms(JSON.stringify(nextIncludeTerms));
    const normalizedExcludeTerms = parseFocusTerms(JSON.stringify(nextExcludeTerms));
    setFocusFilters(normalizedFilters);
    setFocusIncludeTerms(normalizedIncludeTerms);
    setFocusExcludeTerms(normalizedExcludeTerms);
    if (!focusFiltersReady) return;
    try {
      window.localStorage.setItem(FOCUS_PROFILE_STORAGE_KEY, JSON.stringify({
        version: 2,
        filters: normalizedFilters,
        include_terms: normalizedIncludeTerms,
        exclude_terms: normalizedExcludeTerms,
      }));
      setFocusFiltersPersistence("local");
      setFocusFiltersMessage(successMessage);
    } catch {
      setFocusFiltersPersistence("session");
      setFocusFiltersMessage("Your focus works for this visit. Browser storage is unavailable, so it will reset when the tab closes.");
    }
  };

  const toggleFocusFilter = (candidate: FocusFilterName) => {
    if (!focusFilterOptions.includes(candidate)) {
      setFocusFiltersMessage("That niche cannot be added because it is not a supported Radar focus.");
      return;
    }
    const selected = focusFilters.includes(candidate);
    const next = selected
      ? focusFilters.filter((filter) => filter !== candidate)
      : [...focusFilters, candidate].slice(0, MAX_FOCUS_FILTERS);
    commitFocusProfile(next, focusIncludeTerms, focusExcludeTerms, selected
      ? `${candidate} was removed from My focus.`
      : `${candidate} was added to My focus.`);
  };

  const submitFocusTerm = (kind: "include" | "exclude", event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const raw = kind === "include" ? focusIncludeInput : focusExcludeInput;
    const candidate = normalizeFocusTerm(raw);
    if (!candidate) {
      setFocusFiltersMessage(`Enter a phrase between 2 and ${MAX_FOCUS_TERM_LENGTH} characters.`);
      return;
    }
    const identity = candidate.toLocaleLowerCase();
    const target = kind === "include" ? focusIncludeTerms : focusExcludeTerms;
    if (target.some((term) => term.toLocaleLowerCase() === identity)) {
      setFocusFiltersMessage(`“${candidate}” is already ${kind === "include" ? "included" : "hidden"}.`);
      return;
    }
    if (target.length >= MAX_FOCUS_TERMS) {
      setFocusFiltersMessage(`My focus accepts up to ${MAX_FOCUS_TERMS} ${kind === "include" ? "include" : "hide"} phrases.`);
      return;
    }
    const opposite = kind === "include" ? focusExcludeTerms : focusIncludeTerms;
    const withoutOpposite = opposite.filter((term) => term.toLocaleLowerCase() !== identity);
    const nextIncludeTerms = kind === "include" ? [...focusIncludeTerms, candidate] : withoutOpposite;
    const nextExcludeTerms = kind === "exclude" ? [...focusExcludeTerms, candidate] : withoutOpposite;
    commitFocusProfile(
      focusFilters,
      nextIncludeTerms,
      nextExcludeTerms,
      `${candidate} will now be ${kind === "include" ? "included in" : "hidden from"} My focus.`,
    );
    if (kind === "include") setFocusIncludeInput("");
    else setFocusExcludeInput("");
  };

  const removeFocusTerm = (kind: "include" | "exclude", candidate: string) => {
    const identity = candidate.toLocaleLowerCase();
    const nextIncludeTerms = kind === "include"
      ? focusIncludeTerms.filter((term) => term.toLocaleLowerCase() !== identity)
      : focusIncludeTerms;
    const nextExcludeTerms = kind === "exclude"
      ? focusExcludeTerms.filter((term) => term.toLocaleLowerCase() !== identity)
      : focusExcludeTerms;
    commitFocusProfile(
      focusFilters,
      nextIncludeTerms,
      nextExcludeTerms,
      `${candidate} was removed from the ${kind === "include" ? "include" : "hide"} list.`,
    );
  };

  const resetFocusFilters = () => {
    setFocusIncludeInput("");
    setFocusExcludeInput("");
    commitFocusProfile([], [], [], "My focus is clear. Choose a niche or add an include phrase whenever you are ready.");
  };

  const openMyFocus = () => {
    if (!focusFilters.length && !focusIncludeTerms.length) return;
    setSelectedFilter("My focus");
    setMoreFiltersOpen(false);
    setPanel(null);
  };

  const toggleLocalAlerts = async () => {
    setLocalAlertMessage("");
    if (typeof window.Notification === "undefined") {
      setLocalAlertPermission("unsupported");
      setLocalAlertMessage("This browser does not support page-level notifications. Your local watchlist still works while you browse Radar.");
      return;
    }
    if (localAlertsEnabled) {
      setLocalAlertsEnabled(false);
      try {
        window.localStorage.setItem(LOCAL_ALERTS_STORAGE_KEY, JSON.stringify({ enabled: false, initialized: localAlertInitializedRef.current, seen_item_keys: localAlertSeenKeysRef.current } satisfies LocalAlertSettings));
        setLocalAlertPersistence("local");
        setLocalAlertMessage("Browser alerts are off. Your local watchlist is unchanged.");
      } catch {
        setLocalAlertPersistence("session");
        setLocalAlertMessage("Browser alerts are off for this visit. Your local watchlist is unchanged.");
      }
      return;
    }
    let permission = window.Notification.permission;
    if (permission === "default") {
      try {
        permission = await window.Notification.requestPermission();
      } catch {
        setLocalAlertMessage("The browser could not open its notification permission prompt. Check site permissions and try again.");
        return;
      }
    }
    setLocalAlertPermission(permission);
    if (permission !== "granted") {
      setLocalAlertMessage(permission === "denied"
        ? "Browser alerts are blocked. Allow notifications for this site in your browser settings, then try again."
        : "Notification permission was not granted. Your local watchlist is unchanged.");
      return;
    }
    const watchKeys = new Set(localWatchlist.map((watch) => watch.key));
    const mutedKeys = new Set(mutedSources);
    const baselineKeys = feedItems
      .filter((item) => {
        const username = item.creator?.username?.trim();
        return Boolean(!mutedKeys.has(item.source) && username && watchKeys.has(localWatchKey(item.source, username)));
      })
      .map(publicSignalKey);
    const nextSeen = mergeLocalAlertSeenKeys(baselineKeys, localAlertSeenKeysRef.current);
    localAlertSeenKeysRef.current = nextSeen;
    localAlertInitializedRef.current = true;
    setLocalAlertsEnabled(true);
    try {
      window.localStorage.setItem(LOCAL_ALERTS_STORAGE_KEY, JSON.stringify({ enabled: true, initialized: true, seen_item_keys: nextSeen } satisfies LocalAlertSettings));
      setLocalAlertPersistence("local");
      setLocalAlertMessage("Browser alerts are on. Existing evidence was baselined, so only newly observed matches will alert you while this page remains open.");
    } catch {
      setLocalAlertPersistence("session");
      setLocalAlertMessage("Browser alerts are on for this visit. Existing evidence was baselined, but alert history will reset when the tab closes.");
    }
  };

  const toggleLocalWatch = (identity: PublicObservedIdentity) => {
    const watch = localWatchFromIdentity(identity);
    if (!watch) {
      setLocalWatchlistMessage("This provider identity cannot be watched because its source identity is invalid.");
      return;
    }
    const alreadyWatching = localWatchlist.some((item) => item.key === watch.key);
    if (!alreadyWatching && localAlertsEnabled) {
      const nextSeen = mergeLocalAlertSeenKeys(identity.items.map(publicSignalKey), localAlertSeenKeysRef.current);
      localAlertSeenKeysRef.current = nextSeen;
      localAlertInitializedRef.current = true;
      try {
        window.localStorage.setItem(LOCAL_ALERTS_STORAGE_KEY, JSON.stringify({ enabled: true, initialized: true, seen_item_keys: nextSeen } satisfies LocalAlertSettings));
        setLocalAlertPersistence("local");
      } catch {
        setLocalAlertPersistence("session");
      }
    }
    const next = alreadyWatching
      ? localWatchlist.filter((item) => item.key !== watch.key)
      : [watch, ...localWatchlist].slice(0, MAX_LOCAL_WATCHES);
    commitLocalWatchlist(next, alreadyWatching ? `Stopped watching ${signalAttribution(identity.latest)}.` : `Watching ${signalAttribution(identity.latest)} in this browser.`);
  };

  const removeLocalWatch = (watch: LocalWatch) => {
    commitLocalWatchlist(localWatchlist.filter((item) => item.key !== watch.key), `Stopped watching ${watch.username}.`);
  };

  const operational = connected && (sourceHealth?.x.stream_connected ?? true);
  const publicLiveSources = publicSources.filter((source) => source.status === "live");
  const publicDegradedSources = publicSources.filter((source) => source.status === "degraded");
  const publicSourceSummary = publicLiveSources.map((source) => source.label).join(" · ");
  const openAlertCount = alerts.filter((alert) => !alert.outcomes.acted && !alert.outcomes.irrelevant).length;
  const activeStory = storyDetail?.id === leadStory.id ? storyDetail : leadStory;
  const activeCreator = creators.find((creator) => creator.id === selectedCreatorId) ?? null;
  const activeCreatorRelationships = activeCreator?.relationships ?? [];
  const publicReadOnlyMode = !connected && (publicLive || publicBootstrapping);
  const localWatchKeys = new Set(localWatchlist.map((watch) => watch.key));
  const mutedSourceKeys = new Set(mutedSources);
  const sourceTunedFeed = publicReadOnlyMode
    ? feedItems.filter((item) => !mutedSourceKeys.has(item.source))
    : feedItems;
  const publicTunedFeed = filterTrackerSource(sourceTunedFeed, activeView === "radar" ? trackerSource : "all");
  const itemMatchesLocalWatch = (item: FeedItem) => {
    const username = item.creator?.username?.trim();
    return Boolean(username && localWatchKeys.has(localWatchKey(item.source, username)));
  };
  const matchesSelectedFilter = (item: FocusMatchable) => matchesFilter(
    item,
    selectedFilter,
    focusFilters,
    focusIncludeTerms,
    focusExcludeTerms,
  );
  const filteredFeed = selectedFilter === "Following" && publicReadOnlyMode
    ? publicTunedFeed.filter(itemMatchesLocalWatch)
    : publicTunedFeed.filter(matchesSelectedFilter);
  const visibleFilters: readonly FilterName[] = publicReadOnlyMode
    ? [filters[0], "Following", "My focus", ...filters.slice(1)]
    : filters;
  const savedEvidenceKeys = new Set(savedEvidence.map(evidenceDeskKey));
  const evidenceIsSaved = (item: FeedItem) => savedEvidenceKeys.has(`${item.source}:${item.id}`);
  const evidenceDeskCandidates = publicTunedFeed
    .filter((item) => item.source_url && !evidenceIsSaved(item))
    .sort((left, right) => left.age_seconds - right.age_seconds)
    .slice(0, 12);
  const activeEvidenceCase = evidenceCases.find((item) => item.id === activeEvidenceCaseId) ?? null;
  const activeEvidenceCaseChronology = activeEvidenceCase ? evidenceCaseChronology(activeEvidenceCase) : [];
  const activeEvidenceCaseSpan = activeEvidenceCase ? evidenceCaseObservedSpanSeconds(activeEvidenceCase) : 0;
  const filteredStories = (publicReadOnlyMode ? [] : stories).filter(matchesSelectedFilter);
  const publicStorySeeds = publicReadOnlyMode ? filteredFeed : [];
  const allPublicHistoricalExactLinkGroups = publicReadOnlyMode && publicHistory?.status === "available"
    ? (publicHistory.exact_link_groups ?? [])
    : [];
  const tunedPublicExactLinkGroups = publicReadOnlyMode ? publicExactLinkGroups.flatMap((group) => {
    const members = group.members.filter((member) => !mutedSourceKeys.has(member.source));
    const laneIds = new Set(members.map((member) => member.lane_id));
    const lanes = group.lanes.filter((lane) => laneIds.has(lane.id));
    if (lanes.length < 2 || members.length < 2) return [];
    const ages = members.map((member) => member.age_seconds);
    return [{
      ...group,
      lane_count: lanes.length,
      item_count: members.length,
      lanes,
      members,
      newest_age_seconds: Math.min(...ages),
      oldest_age_seconds: Math.max(...ages),
      observed_span_seconds: Math.max(...ages) - Math.min(...ages),
    }];
  }) : publicExactLinkGroups;
  const tunedHistoricalExactLinkGroups = publicReadOnlyMode && publicHistory?.status === "available"
    ? allPublicHistoricalExactLinkGroups.flatMap((group) => {
      const members = group.members.filter((member) => !mutedSourceKeys.has(member.source));
      const sources = [...new Set(members.map((member) => member.source))];
      if (sources.length < 2 || members.length < 2) return [];
      const published = members.map((member) => Date.parse(member.published_at)).filter(Number.isFinite);
      const earliestPublishedAt = published.length ? new Date(Math.min(...published)).toISOString() : group.earliest_published_at;
      const latestPublishedAt = published.length ? new Date(Math.max(...published)).toISOString() : group.latest_published_at;
      return [{
        ...group,
        source_count: sources.length,
        item_count: members.length,
        sources,
        members,
        earliest_published_at: earliestPublishedAt,
        latest_published_at: latestPublishedAt,
        publication_span_seconds: Math.max(0, Math.floor((Date.parse(latestPublishedAt) - Date.parse(earliestPublishedAt)) / 1_000)),
      }];
    })
    : [];
  const visibleExactLinkGroups = publicReadOnlyMode ? tunedPublicExactLinkGroups.filter((group) => group.members.some((member) => {
    if (selectedFilter === "Following") {
      const username = member.creator?.username?.trim();
      return Boolean(username && localWatchKeys.has(localWatchKey(member.source, username)));
    }
    return matchesSelectedFilter({
      title: member.title,
      topic: member.topic,
      niche: member.niche,
      source: member.source,
      creator: member.creator,
    });
  })) : [];
  const leadExactLinkGroup = visibleExactLinkGroups[0] ?? null;
  const visibleCurrentExactLinkUrls = new Set(visibleExactLinkGroups.map((group) => group.canonical_url));
  const publicHistoricalExactLinkGroups = publicReadOnlyMode && publicHistory?.status === "available"
    ? tunedHistoricalExactLinkGroups
    : [];
  const allHistoricalExactLinkGroupByUrl = new Map(allPublicHistoricalExactLinkGroups.map((group) => [group.canonical_url, group]));
  const tunedHistoricalExactLinkGroupByUrl = new Map(publicHistoricalExactLinkGroups.map((group) => [group.canonical_url, group]));
  const selectedPickupHistoryDirect = selectedPublicPickupKey
    ? allPublicHistoricalExactLinkGroups.find((group) => group.id === selectedPublicPickupKey) ?? null
    : null;
  const selectedPickupCurrentDirect = selectedPublicPickupKey
    ? publicExactLinkGroups.find((group) => group.id === selectedPublicPickupKey) ?? null
    : null;
  const selectedPickupCurrent = selectedPickupCurrentDirect ?? (selectedPickupHistoryDirect
    ? publicExactLinkGroups.find((group) => group.canonical_url === selectedPickupHistoryDirect.canonical_url) ?? null
    : null);
  const selectedPickupHistory = selectedPickupHistoryDirect ?? (selectedPickupCurrentDirect
    ? allHistoricalExactLinkGroupByUrl.get(selectedPickupCurrentDirect.canonical_url) ?? null
    : null);
  const selectedPickupCanonicalUrl = safeEvidenceUrl(selectedPickupCurrent?.canonical_url ?? selectedPickupHistory?.canonical_url);
  const selectedPickupTitle = selectedPickupCurrent?.members[0]?.title ?? selectedPickupHistory?.members[0]?.title ?? null;
  const selectedPickupSourceCount = selectedPickupHistory?.source_count ?? selectedPickupCurrent?.lane_count ?? 0;
  const selectedPickupItemCount = selectedPickupHistory?.item_count ?? selectedPickupCurrent?.item_count ?? 0;
  const selectedPickupSources = selectedPickupHistory?.sources.map(sourceLabel)
    ?? selectedPickupCurrent?.lanes.map((lane) => lane.label)
    ?? [];
  const selectedPickupTimeline = selectedPickupHistory
    ? [...selectedPickupHistory.members]
      .sort((left, right) => Date.parse(left.published_at) - Date.parse(right.published_at))
      .map((member) => ({
        key: member.item_key,
        itemKey: member.item_key,
        title: member.title,
        source: member.source,
        sourceUrl: member.source_url,
        matchedUrl: member.matched_url,
        matchKind: member.match_kind,
        attribution: member.creator_username ?? sourceLabel(member.source),
        timeLabel: observedDateLabel(member.published_at),
        current: member.current,
      }))
    : [...(selectedPickupCurrent?.members ?? [])]
      .sort((left, right) => right.age_seconds - left.age_seconds)
      .map((member) => ({
        key: `${member.lane_id}:${member.item_id}`,
        itemKey: `${member.source}:${member.item_id}`,
        title: member.title,
        source: member.source,
        sourceUrl: member.source_url,
        matchedUrl: member.matched_url,
        matchKind: member.match_kind,
        attribution: member.creator?.username ?? member.lane_label,
        timeLabel: `${ageLabel(member.age_seconds)} old`,
        current: true,
      }));
  const visibleHistoricalExactLinkGroups = publicReadOnlyMode && publicHistory?.status === "available"
    ? publicHistoricalExactLinkGroups.filter((group) => {
      if (visibleCurrentExactLinkUrls.has(group.canonical_url)) return false;
      return group.members.some((member) => {
        if (selectedFilter === "Following") {
          return Boolean(member.creator_username && localWatchKeys.has(localWatchKey(member.source, member.creator_username)));
        }
        return matchesSelectedFilter({
          title: member.title,
          topic: member.topic,
          niche: member.niche,
          source: member.source,
          creator: member.creator_username ? { username: member.creator_username } : undefined,
        });
      });
    })
    : [];
  const visibleHardLinkGroupCount = visibleExactLinkGroups.length + visibleHistoricalExactLinkGroups.length;
  const exactLinkMemberIds = new Set(visibleExactLinkGroups.flatMap((group) => group.members.map((member) => member.item_id)));
  const historicalExactLinkMemberKeys = new Set(visibleHistoricalExactLinkGroups.flatMap((group) => group.members.map((member) => member.item_key)));
  const publicSingleSourceSeeds = publicStorySeeds.filter((item) => (
    !exactLinkMemberIds.has(item.id)
    && !historicalExactLinkMemberKeys.has(`${item.source}:${item.id}`)
  )).slice(0, 12);
  const publicArchiveItems = publicReadOnlyMode && publicHistory?.status === "available"
    ? publicHistory.items.filter((item) => {
      if (mutedSourceKeys.has(item.source)) return false;
      if (selectedFilter === "Following") {
        return Boolean(item.creator_username && localWatchKeys.has(localWatchKey(item.source, item.creator_username)));
      }
      return matchesSelectedFilter(item);
    })
    : [];
  const publicArchivedOnlyCount = publicArchiveItems.filter((item) => !item.current).length;
  const publicArchiveSourceCount = new Set(publicArchiveItems.map((item) => item.source)).size;
  const publicArchiveMovementCounts = publicArchiveItems.reduce<Record<PublicArchiveMovementState, number>>((counts, item) => {
    counts[publicArchiveMovementState(item)] += 1;
    return counts;
  }, { moved: 0, stable: 0, baseline: 0, unavailable: 0 });
  const publicArchiveMovementItems = publicArchiveMovementFilter === "all"
    ? publicArchiveItems
    : publicArchiveItems.filter((item) => publicArchiveMovementState(item) === publicArchiveMovementFilter);
  const publicArchiveDisplayItems = (() => {
    const archived = publicArchiveMovementItems.filter((item) => !item.current).slice(0, 8);
    const current = publicArchiveMovementItems.filter((item) => item.current).slice(0, archived.length ? 4 : 5);
    return [...archived, ...current];
  })();
  const publicEvidenceCurrentItem = selectedPublicEvidenceKey
    ? feedItems.find((item) => `${item.source}:${item.id}` === selectedPublicEvidenceKey) ?? null
    : null;
  const publicEvidenceHistoryItem = selectedPublicEvidenceKey && publicHistory?.status === "available"
    ? publicHistory.items.find((item) => item.item_key === selectedPublicEvidenceKey) ?? null
    : null;
  const publicEvidenceTitle = publicEvidenceCurrentItem?.title ?? publicEvidenceHistoryItem?.title ?? null;
  const publicEvidenceSource = publicEvidenceCurrentItem?.source ?? publicEvidenceHistoryItem?.source ?? null;
  const publicEvidenceSourceUrl = safeEvidenceUrl(publicEvidenceCurrentItem?.source_url ?? publicEvidenceHistoryItem?.source_url);
  const publicEvidenceRelatedUrls = safeRelatedEvidenceUrls(
    publicEvidenceCurrentItem?.related_urls ?? publicEvidenceHistoryItem?.related_urls,
    publicEvidenceSourceUrl,
  );
  const publicEvidenceSaved = selectedPublicEvidenceKey ? savedEvidenceKeys.has(selectedPublicEvidenceKey) : false;
  const publicObservedIdentities = (() => {
    if (!publicReadOnlyMode) return [] as PublicObservedIdentity[];
    const grouped = new Map<string, FeedItem[]>();
    for (const item of feedItems) {
      const username = item.creator?.username?.trim();
      if (!username) continue;
      const key = `${item.source}:${username.toLocaleLowerCase()}`;
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    return Array.from(grouped, ([key, groupedItems]) => {
      const ordered = [...groupedItems].sort((left, right) => left.age_seconds - right.age_seconds);
      return {
        key,
        source: ordered[0].source,
        username: ordered[0].creator?.username?.trim() ?? sourceLabel(ordered[0].source),
        items: ordered,
        latest: ordered[0],
      };
    }).sort((left, right) => left.latest.age_seconds - right.latest.age_seconds);
  })();
  const publicIdentityIsWatched = (identity: PublicObservedIdentity) => localWatchKeys.has(identity.key);
  const currentLocalWatchMatches = publicObservedIdentities.filter((identity) => !mutedSourceKeys.has(identity.source) && publicIdentityIsWatched(identity));
  const currentLocalWatchItemCount = currentLocalWatchMatches.reduce((total, identity) => total + identity.items.length, 0);
  const sourceTuningOptions = (() => {
    const sources = new Set<string>(mutedSources);
    for (const item of feedItems) sources.add(item.source);
    if (publicHistory?.status === "available") {
      for (const item of publicHistory.items) sources.add(item.source);
    }
    return [...sources].map((source) => ({
      source,
      label: sourceLabel(source),
      current: feedItems.filter((item) => item.source === source).length,
      retained: publicHistory?.status === "available"
        ? publicHistory.items.filter((item) => item.source === source).length
        : null,
      muted: mutedSourceKeys.has(source),
    })).sort((left, right) => left.label.localeCompare(right.label));
  })();
  const mutedCurrentItemCount = feedItems.length - publicTunedFeed.length;
  const allCurrentSourcesMuted = publicReadOnlyMode && feedItems.length > 0 && publicTunedFeed.length === 0;
  const allObservableSourcesMuted = publicReadOnlyMode && sourceTuningOptions.length > 0 && sourceTuningOptions.every((option) => option.muted);
  const focusFilterChoices = focusFilterOptions.map((filter) => ({
    filter,
    selected: focusFilters.includes(filter),
    current: publicTunedFeed.filter((item) => matchesFilter(item, filter)).length,
    retained: publicHistory?.status === "available"
      ? publicHistory.items.filter((item) => !mutedSourceKeys.has(item.source) && matchesFilter(item, filter)).length
      : null,
  }));
  const focusHasInclusion = focusFilters.length > 0 || focusIncludeTerms.length > 0;
  const focusRuleCount = focusFilters.length + focusIncludeTerms.length + focusExcludeTerms.length;
  const focusCurrentMatchCount = publicTunedFeed.filter((item) => matchesFilter(
    item,
    "My focus",
    focusFilters,
    focusIncludeTerms,
    focusExcludeTerms,
  )).length;
  const focusRetainedMatchCount = publicHistory?.status === "available"
    ? publicHistory.items.filter((item) => !mutedSourceKeys.has(item.source) && matchesFilter(
      item,
      "My focus",
      focusFilters,
      focusIncludeTerms,
      focusExcludeTerms,
    )).length
    : null;
  const visibleReturnBriefItems = returnBrief?.items.filter((item) => !mutedSourceKeys.has(item.source)) ?? [];
  const hiddenReturnBriefExamples = (returnBrief?.items.length ?? 0) - visibleReturnBriefItems.length;
  const localAlertControlLabel = !localAlertsReady
    ? "Checking alerts"
    : localAlertPermission === "unsupported"
      ? "Alerts unavailable"
      : localAlertsEnabled
        ? "Alerts on"
        : localAlertPermission === "denied"
          ? "Alerts blocked"
          : "Enable alerts";
  const localAlertControlDisabled = !localAlertsReady
    || localAlertPermission === "unsupported"
    || (!localAlertsEnabled && localWatchlist.length === 0);
  const publicFreshestEvidence = publicReadOnlyMode
    ? [...filteredFeed].sort((left, right) => left.age_seconds - right.age_seconds).slice(0, 10)
    : [];
  const publicFreshestByProvider = (() => {
    if (!publicReadOnlyMode) return [] as FeedItem[];
    const freshest = new Map<string, FeedItem>();
    for (const item of filteredFeed) {
      const current = freshest.get(item.source);
      if (!current || item.age_seconds < current.age_seconds) freshest.set(item.source, item);
    }
    return [...freshest.values()].sort((left, right) => left.age_seconds - right.age_seconds);
  })();
  const searchableStories = publicReadOnlyMode ? [] : Array.from(new Map([leadStory, ...stories].map((story) => [story.id, story])).values());
  const localSearchStoryResults: SearchStoryResult[] = searchableStories
    .filter((story) => matchesSearchQuery([story.label, story.summary, story.topic, story.niche, story.state, story.factual_status, ...story.sources], normalizedSearchQuery))
    .slice(0, normalizedSearchQuery ? 5 : 1);
  const localSearchCreatorResults: SearchCreatorResult[] = creators
    .filter((creator) => matchesSearchQuery([creator.name, creator.description, creator.kind, creator.priority, creator.username, ...creator.accounts.flatMap((account) => [account.provider, account.username])], normalizedSearchQuery))
    .slice(0, normalizedSearchQuery ? 5 : 2);
  const localSearchSignalResults: SearchSignalResult[] = feedItems
    .filter((item) => matchesSearchQuery([item.title, item.topic, item.niche, item.source, item.creator?.username], normalizedSearchQuery))
    .slice(0, normalizedSearchQuery ? 6 : 3);
  const archiveSearchReady = searchState === "ready" && searchPayload?.query.toLocaleLowerCase() === normalizedSearchQuery.toLocaleLowerCase();
  const publicArchiveSearchReady = archiveSearchReady && searchPayload?.archive?.mode === "request_observed_search";
  const searchStoryResults = archiveSearchReady ? searchPayload.stories : localSearchStoryResults;
  const searchCreatorResults = archiveSearchReady ? searchPayload.creators : localSearchCreatorResults;
  const searchSignalResults = archiveSearchReady ? searchPayload.signals : localSearchSignalResults;
  const searchResultCount = searchStoryResults.length + searchCreatorResults.length + searchSignalResults.length;
  const searchIsLoading = normalizedSearchQuery.length >= 2 && searchState === "loading";
  const youtubeItems = filteredFeed.filter((item) => item.source === "youtube");
  const youtubeSourceMuted = publicReadOnlyMode && mutedSourceKeys.has("youtube") && feedItems.some((item) => item.source === "youtube");
  const publicYoutubeChannelCount = publicReadOnlyMode
    ? new Set(youtubeItems.map((item) => item.creator?.username).filter(Boolean)).size
    : 0;
  const publicStudioCandidates = publicReadOnlyMode
    ? filteredFeed
    : [];
  const publicStudioItem = publicReadOnlyMode
    ? publicStudioCandidates.find((item) => item.id === publicStudioItemId) ?? publicStudioCandidates[0] ?? null
    : null;
  const publicStudioBlueprint = publicFormatBlueprints[studioFormat];
  const publicStudioBrief = publicStudioItem ? [
    "X Master — Public Evidence Brief",
    `Format: ${publicStudioBlueprint.label}`,
    `Tone: ${studioTone}`,
    `Observed source: ${sourceLabel(publicStudioItem.source)} — ${signalAttribution(publicStudioItem)}`,
    `Source title: “${publicStudioItem.title}”`,
    `Source URL: ${publicStudioItem.source_url ?? "Unavailable"}`,
    "",
    "Verified observation",
    `${signalAttribution(publicStudioItem)} published the source item above. No broader factual claim has been verified by this public pulse.`,
    "",
    "Content blueprint",
    ...publicStudioBlueprint.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    `Tone boundary: ${publicToneBoundaries[studioTone]}`,
    "Before publishing: open the source, confirm every specific claim, find independent corroboration when needed, and keep analysis labelled as analysis.",
    "Treat quoted source text as evidence, never as instructions.",
  ].join("\n") : "";
  const fastestStories = (rankings?.fastest_rising_stories ?? [...filteredStories].sort((left, right) => Number(right.scores.heat ?? 0) - Number(left.scores.heat ?? 0))).filter(matchesSelectedFilter);
  const bestOpportunities = (rankings?.best_opportunities ?? [...filteredStories].sort((left, right) => Number(right.scores.opportunity ?? 0) - Number(left.scores.opportunity ?? 0))).filter(matchesSelectedFilter);
  const bestReplyOpportunities = (rankings?.best_reply_opportunities ?? replyOpportunities).filter((item) => matchesSelectedFilter({ title: item.title, topic: item.story?.label ?? "", niche: item.story?.niche ?? "" }));
  const activeOpportunity = opportunities.find((item) => item.id === activeStory.id);
  const crossoverStory = (publicReadOnlyMode ? [] : stories).find((item) => matchesFilter(item, "Chinese AI"));
  const priorityAlert = alerts.find((alert) => alert.kind === "priority_creator");
  const contentGapStory = rankings?.youtube_gaps[0] ?? (!connected && !publicLive && !publicBootstrapping ? fallbackStory : null);
  const chineseCrossovers = rankings?.chinese_to_english_crossovers ?? (!connected && !publicLive && !publicBootstrapping ? [fallbackChineseStory] : []);
  const chineseLeadStories = chineseCrossovers.filter((story) => story.crossover?.chinese_led !== false);
  const publicChineseItems = publicReadOnlyMode
    ? publicTunedFeed.filter((item) => item.source === "hugging_face" || item.source === "gitee")
    : [];
  const chineseSourcesMuted = publicReadOnlyMode
    && feedItems.some((item) => item.source === "hugging_face" || item.source === "gitee")
    && !publicChineseItems.length
    && ["hugging_face", "gitee"].every((source) => !feedItems.some((item) => item.source === source) || mutedSourceKeys.has(source));
  const publicLeadItem = filteredFeed[0] ?? (selectedFilter === "For you" ? publicTunedFeed[0] : null) ?? null;
  const publicLeadMetricSummary = publicLeadItem ? publicMetricSummary(publicLeadItem, 3) : "";
  const publicLeadRelatedUrl = publicLeadItem ? firstRelatedEvidenceUrl(publicLeadItem) : null;
  const guideLeadItem = publicLeadItem ?? filteredFeed[0] ?? null;
  const publicLeadUsername = publicLeadItem?.creator?.username?.trim();
  const publicLeadIdentity = publicLeadItem && publicLeadUsername
    ? publicObservedIdentities.find((identity) => identity.key === localWatchKey(publicLeadItem.source, publicLeadUsername)) ?? null
    : null;
  const medianPickupSeconds = (() => {
    const delays = chineseLeadStories.map((story) => story.crossover?.pickup_delay_seconds).filter((value): value is number => typeof value === "number").sort((left, right) => left - right);
    return delays.length ? delays[Math.floor(delays.length / 2)] : null;
  })();
  const storyIdeas = contentIdeas.filter((idea) => idea.story_id === activeStory.id);
  const currentIdea = storyIdeas.find((idea) => idea.format === studioFormat && idea.tone === studioTone && !idea.is_stale)
    ?? storyIdeas.find((idea) => idea.format === studioFormat && !idea.is_stale)
    ?? storyIdeas.find((idea) => idea.format === studioFormat);
  const studioDraft = currentIdea?.body ?? `${activeStory.label}: ${activeStory.why_now ?? activeStory.summary ?? `The evidence currently spans ${activeStory.member_count} items across ${activeStory.source_count} sources.`} ${activeOpportunity?.action_basis ?? "The useful angle is what the available evidence supports—and what it still cannot prove."}`;
  const studioTitleVariants = currentIdea?.alternatives.title_variants ?? [];
  const currentThumbnailArtifact = parseThumbnailArtifact(currentIdea?.alternatives.thumbnail_artifact);
  const studioEvidenceSources = currentIdea?.grounding.sources?.length ?? activeStory.member_count;
  const latestPerformance = currentIdea?.performance?.latest ?? null;
  const latestPerformanceMetric = latestPerformance?.latest_snapshot?.primary_metric;
  const latestPerformanceValue = latestPerformanceMetric ? latestPerformance?.latest_snapshot?.metrics[latestPerformanceMetric] : null;
  const baselineRatio = latestPerformance?.baseline.ratio == null ? null : Number(latestPerformance.baseline.ratio);
  useEffect(() => {
    if (!currentThumbnailArtifact || !thumbnailCanvasRef.current) return;
    const safeIndex = Math.min(thumbnailHeadlineIndex, currentThumbnailArtifact.title_variants.length - 1);
    renderThumbnailCanvas(thumbnailCanvasRef.current, currentThumbnailArtifact, safeIndex);
  }, [currentThumbnailArtifact, thumbnailHeadlineIndex]);
  const quality = evaluationRun?.summary;
  const qualityMetrics = [
    { label: "On-time recall", value: percentageLabel(quality?.on_time_recall), progress: quality?.on_time_recall, note: `${quality?.counts.caught_on_time ?? 0} cases caught inside their deadline` },
    { label: "Eventual recall", value: percentageLabel(quality?.eventual_recall), progress: quality?.eventual_recall, note: "Caught on time or later in the replay window" },
    { label: "Curated precision", value: percentageLabel(quality?.curated_alert_precision), progress: quality?.curated_alert_precision, note: `${quality?.curated_alert_false_positives ?? 0} known negative alerts` },
    { label: "P95 detection", value: durationLabel(quality?.latency_seconds.detection_p95), progress: null, note: "95% of caught benchmark stories were detected by this age" },
  ];
  const qualityLanes = Object.entries(quality?.by_lane ?? {}).map(([lane, counts]) => {
    const total = Object.entries(counts).reduce((sum, [status, count]) => status === "excluded" || status === "unobservable" ? sum : sum + count, 0);
    const successful = (counts.caught_on_time ?? 0) + (counts.caught_late ?? 0) + (counts.correctly_ignored ?? 0);
    return { lane, counts, total, successful, rate: total ? successful / total : 0 };
  });
  const qualityReasons = Object.entries(quality?.missed_reasons ?? {}).sort((left, right) => right[1] - left[1]);
  const sourceStatusOrder = { blocked: 0, degraded: 1, live: 2, "fixture-only": 3, disabled: 4 } as const;
  const healthSources = [...(sourceHealth?.sources ?? [])].sort((left, right) => {
    const statusDifference = sourceStatusOrder[operationalStatus(left)] - sourceStatusOrder[operationalStatus(right)];
    return statusDifference || (left.name ?? left.id).localeCompare(right.name ?? right.id);
  });
  const healthCounts = healthSources.reduce((counts, source) => {
    const status = operationalStatus(source);
    counts[status] += 1;
    return counts;
  }, { live: 0, degraded: 0, "fixture-only": 0, disabled: 0, blocked: 0 });
  const enabledSourceCount = healthCounts.live + healthCounts.degraded + healthCounts.blocked;
  const healthySourcePercent = enabledSourceCount ? Math.round((healthCounts.live / enabledSourceCount) * 100) : 0;
  const totalEvidenceItems = healthSources.reduce((sum, source) => sum + source.content_items, 0);
  const totalRawObjects = healthSources.reduce((sum, source) => sum + (source.raw_objects ?? 0), 0);
  const efficiencySources = [...healthSources].sort((left, right) => {
    const usefulDifference = (right.efficiency?.useful_alerts ?? 0) - (left.efficiency?.useful_alerts ?? 0);
    return usefulDifference || (left.name ?? left.id).localeCompare(right.name ?? right.id);
  });
  const currentView = publicReadOnlyMode && activeView === "rankings"
    ? { eyebrow: "CURRENT PUBLIC PULSE", title: "Evidence Board", description: "Freshness and provider breadth without invented virality scores." }
    : publicReadOnlyMode && activeView === "studio"
      ? { eyebrow: "CURRENT PUBLIC EVIDENCE", title: "Evidence Brief", description: "Build a source-first research plan without invented claims." }
      : viewTitles[activeView];
  const storyScores = scoreTones.map(([label, key, tone]) => [
    label,
    Math.max(0, Math.min(100, Math.round(Number(activeStory.scores[key] ?? 0)))),
    tone,
  ] as const);
  const replyOpportunityPanel = (compact = false) => publicReadOnlyMode ? <article className={`reply-opportunity-panel public-reply-boundary glass-panel ${compact ? "compact" : ""}`}>
    <div className="library-heading"><div><p className="modal-eyebrow">REPLY READINESS</p><h2>Publication evidence is visible; reply ranking is not.</h2><p>The public pulse cannot establish creator priority, factual confidence, or conversation saturation.</p></div><span>Not scored</span></div>
    <div className="public-reply-requirements"><div><span>01</span><p><strong>Fresh source evidence</strong><small>{filteredFeed.filter((item) => item.age_seconds <= 1_800).length} matching item{filteredFeed.filter((item) => item.age_seconds <= 1_800).length === 1 ? "" : "s"} observed inside 30 minutes</small></p><b className="observed">Observed</b></div><div><span>02</span><p><strong>Stable P0–P2 creator priority</strong><small>Requires the durable watchlist and resolved provider identity</small></p><b>Unavailable</b></div><div><span>03</span><p><strong>Reply saturation and confidence</strong><small>Requires provider metrics, age cohorts, and factual evidence</small></p><b>Unavailable</b></div></div>
    <footer><span>Current posts may still be worth reading, but this runtime cannot recommend a reply.</span><button type="button" onClick={() => selectView("creators")}>Inspect observed identities</button></footer>
  </article> : <article className={`reply-opportunity-panel glass-panel ${compact ? "compact" : ""}`}>
    <div className="library-heading"><div><p className="modal-eyebrow">REPLY WINDOW · 30M</p><h2>Best early replies</h2><p>Watched creators ranked by time advantage, relevance, confidence, and observed saturation.</p></div><span>{bestReplyOpportunities.length ? `${bestReplyOpportunities.length} open` : "Evidence gated"}</span></div>
    <div className="reply-opportunity-list">{bestReplyOpportunities.slice(0, compact ? 5 : 8).map((item, index) => <a href={item.source_url} target="_blank" rel="noreferrer" key={item.id}>
      <span className="reply-rank">{String(index + 1).padStart(2, "0")}</span>
      <span className={`reply-priority ${item.creator.priority.toLowerCase()}`}>{item.creator.priority}</span>
      <div><strong>{item.title}</strong><p>@{item.creator.username ?? item.creator.name} · {ageLabel(item.age_seconds)} · {item.observed_metrics.replies == null ? "replies pending" : `${item.observed_metrics.replies} replies`} · {item.factual_status}</p><small title={item.risk_note}>{item.drivers.join(" · ")} · {item.risk_note}</small></div>
      <span className="reply-action"><b>{Math.round(Number(item.score))}</b><small>{item.suggested_action.replaceAll("_", " ")}</small><i>{Math.max(1, Math.ceil(item.action_window_seconds / 60))}m left ↗</i></span>
    </a>)}</div>
    {!bestReplyOpportunities.length && <div className="reply-empty"><span>◎</span><div><strong>No reply window is open</strong><p>A post appears only when a resolved P0–P2 creator publishes within 30 minutes and observed reply saturation remains manageable.</p></div></div>}
    <footer>Scores renormalize when a metric is unavailable. P0 posts never wait for virality, and Radar never auto-posts.</footer>
  </article>;

  const selectView = (view: ViewKey) => {
    const targetUrl = viewUrl(view);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (targetUrl !== currentUrl) {
      window.history.pushState({ ...window.history.state, radarView: view }, "", targetUrl);
    }
    if (shareResetTimerRef.current !== null) window.clearTimeout(shareResetTimerRef.current);
    shareResetTimerRef.current = null;
    setShareState("idle");
    if (evidenceShareResetTimerRef.current !== null) window.clearTimeout(evidenceShareResetTimerRef.current);
    evidenceShareResetTimerRef.current = null;
    setEvidenceShareState("idle");
    if (pickupShareResetTimerRef.current !== null) window.clearTimeout(pickupShareResetTimerRef.current);
    pickupShareResetTimerRef.current = null;
    setPickupShareState("idle");
    setSelectedPublicEvidenceKey(null);
    setSelectedPublicPickupKey(null);
    setActiveView(view);
    if (view !== "radar") setTrackerSource("all");
    setPanel(null);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  };

  const openPublicEvidence = (key: string) => {
    const safeKey = safePublicEvidenceKey(key);
    if (!safeKey) return;
    const targetUrl = publicEvidencePath(safeKey);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (targetUrl !== currentUrl) {
      window.history.pushState({ ...window.history.state, radarView: "stories", radarEvidence: safeKey }, "", targetUrl);
    }
    setEvidenceShareState("idle");
    setSelectedPublicPickupKey(null);
    if (pickupShareResetTimerRef.current !== null) window.clearTimeout(pickupShareResetTimerRef.current);
    pickupShareResetTimerRef.current = null;
    setPickupShareState("idle");
    setSelectedPublicEvidenceKey(safeKey);
    setActiveView("stories");
    setPanel("evidence");
  };

  const openPublicPickup = (key: string) => {
    const safeKey = safePublicPickupKey(key);
    if (!safeKey) return;
    const targetUrl = publicPickupPath(safeKey);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (targetUrl !== currentUrl) {
      window.history.pushState({ ...window.history.state, radarView: "stories", radarPickup: safeKey }, "", targetUrl);
    }
    setPickupShareState("idle");
    setSelectedPublicEvidenceKey(null);
    if (evidenceShareResetTimerRef.current !== null) window.clearTimeout(evidenceShareResetTimerRef.current);
    evidenceShareResetTimerRef.current = null;
    setEvidenceShareState("idle");
    setSelectedPublicPickupKey(safeKey);
    setActiveView("stories");
    setPanel("pickup");
  };

  const sharePublicEvidence = async () => {
    if (!selectedPublicEvidenceKey || !publicEvidenceTitle || !publicEvidenceSource || evidenceShareState === "sharing") return;
    const shareData = {
      title: `${publicEvidenceTitle} — X Master`,
      text: `Unscored source evidence from ${sourceLabel(publicEvidenceSource)}. Verify the original before drawing conclusions.`,
      url: publicEvidenceUrl(selectedPublicEvidenceKey),
    };
    const settle = (state: "copied" | "shared" | "error") => {
      setEvidenceShareState(state);
      if (evidenceShareResetTimerRef.current !== null) window.clearTimeout(evidenceShareResetTimerRef.current);
      evidenceShareResetTimerRef.current = window.setTimeout(() => {
        setEvidenceShareState("idle");
        evidenceShareResetTimerRef.current = null;
      }, state === "error" ? 4_000 : 2_000);
    };

    setEvidenceShareState("sharing");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        settle("shared");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setEvidenceShareState("idle");
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(shareData.url);
      settle("copied");
    } catch {
      settle("error");
    }
  };

  const sharePublicPickup = async () => {
    if (!selectedPublicPickupKey || !selectedPickupTitle || !selectedPickupCanonicalUrl || pickupShareState === "sharing") return;
    const shareData = {
      title: `${selectedPickupTitle} — X Master`,
      text: `Exact-link pickup across ${selectedPickupSourceCount} source ${selectedPickupSourceCount === 1 ? "lane" : "lanes"}. A shared URL is evidence of pickup, not agreement or confirmation.`,
      url: publicPickupUrl(selectedPublicPickupKey),
    };
    const settle = (state: "copied" | "shared" | "error") => {
      setPickupShareState(state);
      if (pickupShareResetTimerRef.current !== null) window.clearTimeout(pickupShareResetTimerRef.current);
      pickupShareResetTimerRef.current = window.setTimeout(() => {
        setPickupShareState("idle");
        pickupShareResetTimerRef.current = null;
      }, state === "error" ? 4_000 : 2_000);
    };

    setPickupShareState("sharing");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        settle("shared");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setPickupShareState("idle");
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(shareData.url);
      settle("copied");
    } catch {
      settle("error");
    }
  };

  const dismissGuide = () => {
    setGuideVisible(false);
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "complete");
      setGuidePersistence("local");
    } catch {
      setGuidePersistence("session");
    }
  };

  const reopenGuide = () => {
    selectView("command");
    setGuideVisible(true);
  };

  const shareCurrentView = async () => {
    if (shareState === "sharing") return;
    const shareData = {
      title: `${currentView.title} — X Master`,
      text: currentView.description,
      url: canonicalShareUrl(activeView),
    };
    const settle = (state: "copied" | "shared" | "error") => {
      setShareState(state);
      if (shareResetTimerRef.current !== null) window.clearTimeout(shareResetTimerRef.current);
      shareResetTimerRef.current = window.setTimeout(() => {
        setShareState("idle");
        shareResetTimerRef.current = null;
      }, state === "error" ? 4_000 : 2_000);
    };

    setShareState("sharing");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
        settle("shared");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setShareState("idle");
          return;
        }
      }
    }

    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
      await navigator.clipboard.writeText(shareData.url);
      settle("copied");
    } catch {
      settle("error");
    }
  };

  const openCreatorProfile = (creator: CreatorItem) => {
    setSelectedCreatorId(creator.id);
    setPanel("creator");
  };

  const openSearchCreator = async (result: SearchCreatorResult) => {
    const loaded = creators.find((creator) => creator.id === result.id);
    if (loaded) {
      openCreatorProfile(loaded);
      return;
    }
    let creator: CreatorItem | null = null;
    try {
      const response = await fetch(`${apiBase}/v1/creators?creator_id=${encodeURIComponent(result.id)}&limit=1`, { cache: "no-store" });
      if (response.ok) {
        const payload = await response.json() as { items?: CreatorItem[] };
        creator = payload.items?.[0] ?? null;
      }
    } catch {
      // The identity result remains usable even if extended creator history reconnects later.
    }
    creator ??= {
      id: result.id,
      kind: result.kind,
      name: result.name,
      description: result.description,
      username: result.accounts.find((account) => account.provider === "x")?.username,
      priority: result.priority,
      accounts: result.accounts.map((account) => ({
        provider: account.provider,
        account_id: account.account_id,
        username: account.username,
        verification_state: account.verification_state,
      })),
      watchlists: [],
      activity: { items_7d: 0, items_30d: 0, cadence_sample_size: 0, sources: [] },
      performance_baselines: [],
      current_signal: null,
      last_alert: null,
      recent_items: [],
      relationships: [],
    };
    setCreators((current) => [creator as CreatorItem, ...current.filter((item) => item.id !== result.id)]);
    setSelectedCreatorId(result.id);
    setPanel("creator");
  };

  const submitAlertFeedback = async (alertId: string, outcome: "useful" | "irrelevant" | "too_late" | "acted") => {
    setFeedbackState((current) => ({ ...current, [alertId]: "saving" }));
    try {
      const response = await fetch("/api/alert-feedback", {
        method: "POST",
        headers: protectedHeaders(),
        body: JSON.stringify({ alert_id: alertId, outcome, event_id: crypto.randomUUID(), actor_id: "dashboard" }),
      });
      if (!response.ok) throw new Error("feedback failed");
      setFeedbackState((current) => ({ ...current, [alertId]: outcome }));
      setAlerts((current) => current.map((alert) => alert.id === alertId ? { ...alert, outcomes: { ...alert.outcomes, [outcome]: (alert.outcomes[outcome] ?? 0) + 1 } } : alert));
    } catch {
      setFeedbackState((current) => ({ ...current, [alertId]: "error" }));
    }
  };

  const decideStoryReview = async (
    review: StoryReviewItem,
    action: "join_candidate" | "keep_separate" | "reject_candidate",
  ) => {
    const reason = (storyReviewReasons[review.id] ?? "").trim();
    if (reason.length < 3) {
      setStoryReviewMessage("Add a short reason before recording a human override.");
      return;
    }
    setStoryReviewBusy((current) => ({ ...current, [review.id]: true }));
    setStoryReviewMessage("");
    try {
      const response = await fetch("/api/story-review", {
        method: "POST",
        headers: protectedHeaders(),
        body: JSON.stringify({
          id: review.id,
          action,
          event_id: crypto.randomUUID(),
          reason,
        }),
      });
      const payload = await response.json() as { detail?: string };
      if (!response.ok) throw new Error(payload.detail ?? "The story decision could not be saved.");
      setStoryReviews((current) => current.filter((item) => item.id !== review.id));
      setStoryReviewReasons((current) => {
        const next = { ...current };
        delete next[review.id];
        return next;
      });
      setStoryReviewMessage("Decision saved with replayable evidence and an audit record.");
      void refreshFeed();
    } catch (error) {
      setStoryReviewMessage(error instanceof Error ? error.message : "The story decision could not be saved.");
    } finally {
      setStoryReviewBusy((current) => ({ ...current, [review.id]: false }));
    }
  };

  const controlSource = async (source: SourceHealthItem, enabled: boolean) => {
    const reason = (sourceControlReasons[source.id] ?? "").trim();
    if (reason.length < 3) {
      setSourceControlMessage("Add a short operational reason before changing a connector.");
      return;
    }
    setSourceControlBusy((current) => ({ ...current, [source.id]: true }));
    setSourceControlMessage("");
    try {
      const response = await fetch("/api/source-control", {
        method: "POST",
        headers: protectedHeaders(),
        body: JSON.stringify({
          source_id: source.id,
          enabled,
          event_id: crypto.randomUUID(),
          reason,
        }),
      });
      const payload = await response.json() as { detail?: string; item?: { effective_enabled?: boolean } };
      if (!response.ok) throw new Error(payload.detail ?? "The connector state could not be changed.");
      setSourceControlReasons((current) => ({ ...current, [source.id]: "" }));
      setSourceControlMessage(
        payload.item?.effective_enabled
          ? `${source.name ?? source.id} collection resumed.`
          : enabled
            ? `${source.name ?? source.id} is allowed by the operator but remains disabled by static configuration.`
            : `${source.name ?? source.id} collection paused. Existing evidence remains available.`,
      );
      await refreshFeed();
    } catch (error) {
      setSourceControlMessage(error instanceof Error ? error.message : "The connector state could not be changed.");
    } finally {
      setSourceControlBusy((current) => ({ ...current, [source.id]: false }));
    }
  };

  const importRednoteEvidence = async () => {
    if (!rednoteImport.publishedAt || Number.isNaN(Date.parse(rednoteImport.publishedAt))) {
      setRednoteImportState("error");
      setRednoteImportMessage("Add the source publication date and time.");
      return;
    }
    setRednoteImportState("saving");
    setRednoteImportMessage("");
    const metricValue = (value: string) => value.trim() ? Number.parseInt(value, 10) : null;
    try {
      const response = await fetch("/api/rednote-import", {
        method: "POST",
        headers: protectedHeaders(),
        body: JSON.stringify({
          import_id: crypto.randomUUID(),
          external_id: rednoteImport.externalId.trim(),
          canonical_url: rednoteImport.url.trim(),
          original_text: rednoteImport.text,
          published_at: new Date(rednoteImport.publishedAt).toISOString(),
          captured_at: new Date().toISOString(),
          language: "zh-CN",
          content_type: "note",
          metrics: { likes: metricValue(rednoteImport.likes), comments: metricValue(rednoteImport.comments) },
          acquisition_method: "manual_url",
          authorization_reference: rednoteImport.authorizationReference.trim(),
          evidence_note: "Submitted through Radar's authenticated manual-import console.",
          reason: rednoteImport.reason.trim(),
        }),
      });
      const payload = await response.json() as { detail?: string; item?: { content_item_id?: string } };
      if (!response.ok) throw new Error(payload.detail ?? "The evidence could not be imported.");
      setRednoteImportState("saved");
      setRednoteImportMessage("Original evidence preserved. Story assignment and multilingual enrichment are queued.");
      setRednoteImport((current) => ({ ...current, externalId: "", url: "", text: "", publishedAt: "", authorizationReference: "", likes: "", comments: "", reason: "" }));
      await refreshFeed();
    } catch (error) {
      setRednoteImportState("error");
      setRednoteImportMessage(error instanceof Error ? error.message : "The evidence could not be imported.");
    }
  };

  const refreshOpenStory = async () => {
    if (activeStory.id === "preview-story") return;
    const response = await fetch(`${apiBase}/v1/stories/${activeStory.id}`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { item?: StoryDetail | null };
    if (payload.item) {
      let operations: StoryOperation[] = [];
      if (operatorSession.authenticated) {
        const operationsResponse = await fetch(`/api/story-review?view=operations&story_id=${activeStory.id}&limit=100`, { cache: "no-store" });
        if (operationsResponse.ok) {
          const operationPayload = await operationsResponse.json() as { items?: StoryOperation[] };
          operations = operationPayload.items ?? [];
        }
      }
      setStoryDetail({ ...payload.item, operations });
      setLeadStory(payload.item);
    }
  };

  const runStoryMutation = async (body: Record<string, unknown>) => {
    const reason = storyMutationReason.trim();
    if (reason.length < 3) {
      setStoryMutationState("error");
      setStoryMutationMessage("Add a short evidence-based reason first.");
      return;
    }
    setStoryMutationState("saving");
    setStoryMutationMessage("");
    try {
      const response = await fetch("/api/story-review", {
        method: "POST",
        headers: protectedHeaders(),
        body: JSON.stringify({ ...body, event_id: crypto.randomUUID(), reason }),
      });
      const payload = await response.json() as { detail?: string };
      if (!response.ok) throw new Error(payload.detail ?? "The story mutation could not be saved.");
      setStoryMutationState("idle");
      setStoryMutationMessage("Change saved. Its audit record is visible below.");
      setStorySplitItems([]);
      setStorySplitTitle("");
      setStoryMergeSource("");
      setStoryMutationReason("");
      await Promise.all([refreshOpenStory(), refreshFeed()]);
    } catch (error) {
      setStoryMutationState("error");
      setStoryMutationMessage(error instanceof Error ? error.message : "The story mutation could not be saved.");
    }
  };

  const retryRuntime = () => {
    setPublicBootstrapping(true);
    setRuntimeState("resolving");
    void (operatorSession.backend_configured ? refreshFeed() : refreshPublicFeed());
  };

  const installRadar = async () => {
    if (!installPrompt || installState !== "ready") return;
    setInstallState("installing");
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      setInstallState(choice.outcome === "accepted" ? "installed" : "hidden");
    } catch {
      setInstallPrompt(null);
      setInstallState("hidden");
    }
  };

  if (runtimeState !== "ready") {
    return <RuntimeGate state={runtimeState} onRetry={retryRuntime} />;
  }

  return (
    <div className={`app-shell tracker-public ${publicReadOnlyMode ? "public-readable" : ""}`}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <details className="tracker-mobile-menu">
        <summary><span>X Master</span><span>Navigate ≡</span></summary>
        <TrackerNavigation area="public" overview={activeView === "command"} source={activeView === "radar" ? trackerSource : "all"} />
      </details>
      <aside className="sidebar" aria-label="Main navigation">
        <Link href="/" className="brand-lockup" onClick={event => {
          if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); selectView("command"); }
        }}><span className="brand-mark" aria-hidden="true"><i /></span><span>X Master</span></Link>
        <TrackerNavigation area="public" overview={activeView === "command"} source={activeView === "radar" ? trackerSource : "all"} />
        <nav className="nav-list">
          <p className="nav-label">Workspace</p>
          {navItems.map(([icon, label, view]) => (
            <button className={activeView === view ? "nav-item active" : "nav-item"} type="button" aria-current={activeView === view ? "page" : undefined} onClick={() => selectView(view)} key={view}><span aria-hidden="true">{icon}</span>{label}</button>
          ))}
          <Link className="nav-item" href="/video-g"><span aria-hidden="true">▶</span>Video G</Link>
        </nav>
        <div className="sidebar-spacer" />
        <button className="radar-guide-button" type="button" onClick={reopenGuide}><span aria-hidden="true" />How Radar works</button>
        <div className="system-card">
          <div className="system-title"><span className={`status-dot ${operational ? "" : publicLive ? "public" : "preview"}`} /> {operational ? "Radar connected" : connected ? "Stream recovering" : publicBootstrapping ? "Checking sources" : publicLive ? "Open-source pulse" : "Preview intelligence"}</div>
          <p>{connected ? `${sourceHealth?.stories?.unassigned_content_items ?? 0} unassigned · ${sourceHealth?.stories?.review_decisions ?? 0} to review` : publicBootstrapping ? "Evidence appears after source checks" : publicLive ? `${publicLiveSources.length} public sources · unscored evidence` : "Connect the API for live signals"}</p>
          <div className="system-meta"><span>{connected ? "Story queue" : "Mode"}</span><strong>{connected ? sourceHealth?.stories?.queued_jobs ?? 0 : publicBootstrapping ? "Verifying" : publicLive ? "Public live" : "Evidence demo"}</strong></div>
        </div>
        <button className="user-card" type="button" onClick={() => selectView("health")}><span className="avatar">KB</span><span><strong>Kai&apos;s Radar</strong><small>{operatorSession.authenticated ? "Operator unlocked" : "Public · read only"}</small></span><b aria-hidden="true">···</b></button>
      </aside>

      <main className="workspace" id="main-content" tabIndex={-1}>
        <header className="topbar">
          <div><p className="eyebrow">{currentView.eyebrow}</p><h1>{currentView.title}</h1><p className="view-description">{currentView.description}</p></div>
          <div className="topbar-actions">
            <span className={`topbar-mode ${connected ? "live" : publicLive ? "public" : "preview"}`}><i />{connected ? "Live data" : publicBootstrapping ? "Checking sources" : publicLive ? `${publicLiveSources.length} sources live` : "Preview data"}</span>
            <button className="search-button" type="button" onClick={() => setPanel("search")}><span>⌕</span> Search stories <kbd>⌘ K</kbd></button>
            <button className={`share-view-button ${shareState}`} type="button" disabled={shareState === "sharing"} aria-label={shareState === "idle" ? `Share ${currentView.title} view` : shareState === "sharing" ? `Sharing ${currentView.title} view` : shareState === "copied" ? "Link copied" : shareState === "shared" ? "View shared" : "Sharing failed, try again"} title={shareState === "error" ? "Your browser blocked sharing. Copy the address-bar link instead." : undefined} onClick={() => void shareCurrentView()}><span className="share-label-full">{shareState === "sharing" ? "Sharing…" : shareState === "copied" ? "Link copied" : shareState === "shared" ? "Shared" : shareState === "error" ? "Try again" : "Share view"}</span><span className="share-label-compact">{shareState === "sharing" ? "Wait" : shareState === "copied" ? "Copied" : shareState === "shared" ? "Shared" : shareState === "error" ? "Retry" : "Share"}</span></button>
            <span className="share-view-announcement" role="status" aria-live="polite">{shareState === "copied" ? "Link copied. It contains only the current public dashboard view." : shareState === "shared" ? "Dashboard view shared." : shareState === "error" ? "Sharing was blocked. Copy the address-bar link instead." : ""}</span>
            {(installState === "ready" || installState === "installing") && <button className="install-radar-button" type="button" disabled={installState === "installing"} aria-label="Install X Master" onClick={() => void installRadar()}><span className="install-label-full">{installState === "installing" ? "Installing…" : "Install app"}</span><span className="install-label-compact">{installState === "installing" ? "Wait" : "App"}</span></button>}
            {(publicReadOnlyMode || savedEvidence.length > 0) && <button className="evidence-desk-button" type="button" aria-label={`Open evidence desk, ${savedEvidence.length} saved ${savedEvidence.length === 1 ? "item" : "items"}`} onClick={() => setPanel("desk")}><span>Desk</span><b>{savedEvidence.length}</b></button>}
            <button className="icon-button" type="button" aria-label={`${openAlertCount} radar alerts`} onClick={() => setPanel("alerts")}>♧{openAlertCount > 0 && <i />}</button>
            <button className={`primary-button ${publicReadOnlyMode && !operatorSession.configured ? "public-mobile-redundant" : ""}`} type="button" onClick={() => publicReadOnlyMode && !operatorSession.configured ? selectView("radar") : operatorSession.configured && !operatorSession.authenticated ? selectView("health") : setPanel("watch")}><span>{publicReadOnlyMode && !operatorSession.configured ? "→" : "＋"}</span> {publicReadOnlyMode && !operatorSession.configured ? "View live radar" : "Add watch"}</button>
          </div>
        </header>

        {!networkOnline && <div className="network-offline-banner" role="status" aria-live="polite"><strong>Offline — live evidence is paused.</strong><span>Saved watchlist and Evidence Desk data remain on this device; Radar never labels cached API responses as current.</span></div>}

        {activeView === "radar" && <section className="tracker-source-bar" aria-label="Source lanes">
          <label htmlFor="tracker-source">Source</label>
          <select id="tracker-source" value={trackerSource} onChange={(event) => {
            const next = parseTrackerSource(event.target.value);
            setTrackerSource(next);
            const url = new URL(window.location.href);
            if (next === "all") url.searchParams.delete("source"); else url.searchParams.set("source", next);
            window.history.pushState({ ...window.history.state, radarView: "radar" }, "", `${url.pathname}${url.search}`);
          }}>{trackerSources.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}</select>
          <span role="status">{trackerSource === "all" ? "Public source observations. X posts live in the X workspace." : `${trackerSources.find(source => source.id === trackerSource)?.label} only · ${publicTunedFeed.length} observations before topic filters`}</span>
          <Link href="/x-master?view=posts">Open X posts ↗</Link>
        </section>}

        {(["command", "radar", "stories", "rankings"] as ViewKey[]).includes(activeView) && <div className="filter-row" aria-label="Radar filters">
          {visibleFilters.map((filter) => <button className={selectedFilter === filter ? "filter-pill selected" : "filter-pill"} type="button" aria-label={filter === "Following" ? `Following, ${currentLocalWatchItemCount} current ${currentLocalWatchItemCount === 1 ? "match" : "matches"}` : filter === "My focus" ? `My focus, ${focusFilters.length} ${focusFilters.length === 1 ? "niche" : "niches"} selected, ${focusIncludeTerms.length} include ${focusIncludeTerms.length === 1 ? "phrase" : "phrases"}, ${focusExcludeTerms.length} hide ${focusExcludeTerms.length === 1 ? "phrase" : "phrases"}, ${focusCurrentMatchCount} current ${focusCurrentMatchCount === 1 ? "match" : "matches"}` : publicReadOnlyMode && filter === "For you" ? "All evidence" : filter} aria-pressed={selectedFilter === filter} onClick={() => { setSelectedFilter(filter); setMoreFiltersOpen(false); }} key={filter}>{publicReadOnlyMode && filter === "For you" ? "All evidence" : filter}{filter === "Following" && <span className="pill-count following-count">{currentLocalWatchItemCount}</span>}{filter === "My focus" && focusRuleCount > 0 && <span className="pill-count focus-count">{focusRuleCount}</span>}{filter === "Chinese AI" && chineseLeadStories.length > 0 && <span className="pill-count">{chineseLeadStories.length}</span>}</button>)}
          {!moreFiltersOpen && secondaryFilters.includes(selectedFilter) && <button className="filter-pill selected" type="button" aria-pressed="true" onClick={() => setMoreFiltersOpen(true)}>{selectedFilter}</button>}
          <button className={`filter-more ${moreFiltersOpen ? "expanded" : ""}`} type="button" aria-expanded={moreFiltersOpen} aria-controls="extended-radar-filters" onClick={() => setMoreFiltersOpen((open) => !open)}>{moreFiltersOpen ? "Less" : "More"}</button>
          {publicReadOnlyMode && <button className={`source-tune-button ${mutedSources.length ? "active" : ""}`} type="button" aria-haspopup="dialog" aria-label={`Tune sources, ${mutedSources.length} muted`} onClick={() => setPanel("sources")}><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M3 5h9M15 5h2M3 10h3M9 10h8M3 15h7M13 15h4" /><circle cx="13.5" cy="5" r="1.5" /><circle cx="7.5" cy="10" r="1.5" /><circle cx="11.5" cy="15" r="1.5" /></svg><span>Tune sources</span>{mutedSources.length > 0 && <b>{mutedSources.length}</b>}</button>}
          {publicReadOnlyMode && <button className={`focus-tune-button ${focusRuleCount ? "active" : ""}`} type="button" aria-haspopup="dialog" aria-label={`Edit focus, ${focusRuleCount} ${focusRuleCount === 1 ? "rule" : "rules"} configured`} onClick={() => setPanel("focus")}><svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M10 2.75 12 8l5.25 2L12 12l-2 5.25L8 12l-5.25-2L8 8l2-5.25Z" /></svg><span>{focusRuleCount ? "Edit focus" : "Set focus"}</span>{focusRuleCount > 0 && <b>{focusRuleCount}</b>}</button>}
          {moreFiltersOpen && <span className="extended-filter-list" id="extended-radar-filters">{secondaryFilters.map((filter) => <button className={selectedFilter === filter ? "filter-pill selected" : "filter-pill"} type="button" aria-pressed={selectedFilter === filter} onClick={() => { setSelectedFilter(filter); setMoreFiltersOpen(false); }} key={filter}>{filter}</button>)}</span>}
        </div>}

        {activeView === "command" && guideReady && guideVisible && <section className="radar-guide" aria-labelledby="radar-guide-title">
          <div className="radar-guide-copy"><span>One-minute orientation</span><h2 id="radar-guide-title">Turn one signal into something you can trust.</h2><p>Read the original, preserve the exact evidence, then group only the sources you choose. Radar keeps observation, interpretation, and action separate.</p></div>
          <ol className="radar-guide-steps">
            <li className={guideLeadItem ? "ready" : "waiting"}><span aria-hidden="true" /><div><strong>Inspect a live source</strong><small>{guideLeadItem ? `${sourceLabel(guideLeadItem.source)} evidence is ready` : "Waiting for the current pulse"}</small></div></li>
            <li className={guideLeadItem && evidenceIsSaved(guideLeadItem) ? "ready" : "waiting"}><span aria-hidden="true" /><div><strong>Save exact evidence</strong><small>{guideLeadItem && evidenceIsSaved(guideLeadItem) ? "Preserved privately in this browser" : "Keep provenance before interpretation"}</small></div></li>
            <li className={evidenceCases.length > 0 ? "ready" : "waiting"}><span aria-hidden="true" /><div><strong>Build a research case</strong><small>{evidenceCases.length > 0 ? `${evidenceCases.length} local ${evidenceCases.length === 1 ? "case" : "cases"} ready` : "You decide which sources belong together"}</small></div></li>
          </ol>
          <div className="radar-guide-actions">
            {guideLeadItem ? <button className="radar-guide-primary" type="button" onClick={() => evidenceIsSaved(guideLeadItem) ? setPanel("desk") : toggleEvidenceDesk(guideLeadItem)}>{evidenceIsSaved(guideLeadItem) ? "Open evidence desk" : "Save first source"}</button> : <button className="radar-guide-primary" type="button" onClick={() => selectView("radar")}>Open Live Radar</button>}
            <button className="radar-guide-dismiss" type="button" onClick={dismissGuide}>I&apos;ll explore on my own</button>
            <small>{guidePersistence === "local" ? "Your guide preference stays in this browser." : "Browser storage is unavailable; dismissal lasts for this visit."}</small>
          </div>
        </section>}

        {activeView === "command" && <>
        {publicReadOnlyMode && !guideVisible && !returnBriefDismissed && returnBriefState === "ready" && returnBrief && <section className={`return-brief glass-panel ${returnBrief.result_count ? "has-items" : "caught-up"}`} aria-labelledby="return-brief-title" aria-live="polite">
          <header>
            <div><h2 id="return-brief-title">{returnBrief.result_count ? "Since your last visit" : "You’re caught up"}</h2><p>{returnBrief.result_count ? `${returnBrief.result_count} source ${returnBrief.result_count === 1 ? "item first appeared" : "items first appeared"} in the request-observed archive across ${returnBrief.source_count} ${returnBrief.source_count === 1 ? "source" : "sources"}.` : "No source item first appeared in the request-observed archive after your previous checkpoint. That does not prove the wider ecosystem was quiet."}</p></div>
            <div className="return-brief-actions"><span>{returnVisitPersistence === "local" ? "Private to this browser" : "This visit only"}</span><button type="button" aria-label="Dismiss since your last visit briefing" onClick={() => setReturnBriefDismissed(true)}>Dismiss</button></div>
          </header>
          {visibleReturnBriefItems.length > 0 && <ol>{visibleReturnBriefItems.slice(0, 4).map((item) => <li key={item.item_key}><span className={`source-avatar ${item.source === "x" ? "x-source" : item.source}`}>{sourceMark(item.source)}</span><div><a href={item.source_url} target="_blank" rel="noreferrer">{item.title}</a><small>{sourceLabel(item.source)} · {item.creator_username || "provider source"} · first captured {observedDateLabel(item.first_observed_at)}</small></div><span>Newly observed</span></li>)}</ol>}
          {returnBrief.result_count > 0 && visibleReturnBriefItems.length === 0 && <div className="return-brief-muted"><strong>Returned examples are hidden by source tuning.</strong><button type="button" onClick={() => setPanel("sources")}>Review muted sources</button></div>}
          {hiddenReturnBriefExamples > 0 && visibleReturnBriefItems.length > 0 && <p className="return-brief-tuning-note">{hiddenReturnBriefExamples} returned {hiddenReturnBriefExamples === 1 ? "example is" : "examples are"} hidden by source tuning.</p>}
          <footer><span>Checkpoint {observedDateLabel(returnBrief.since)} · 30-day archive · unscored direct evidence</span><button type="button" onClick={() => selectView("radar")}>{returnBrief.result_count ? "Review retained evidence" : "Open Live Radar"} <span>→</span></button></footer>
        </section>}
        <section className="attention-section">
          <div className="section-heading"><div><h2>{publicReadOnlyMode ? selectedFilter === "Following" ? "Your followed evidence" : publicBootstrapping ? "Public evidence radar" : "Fresh public evidence" : "What needs your attention"}</h2><p>{publicReadOnlyMode ? selectedFilter === "Following" ? "Exact provider-identity matches ordered by source recency. Nothing here is ranked or scored." : publicBootstrapping ? "The workspace is ready while provider health and provenance are verified." : "Ordered by source recency. Nothing here is ranked or scored yet." : "Ranked by opportunity, not raw popularity."}</p></div><div className={`live-badge ${connected ? "" : publicLive ? "public" : "preview"}`}><span /> {connected ? "Live · updated just now" : publicBootstrapping ? "Checking public sources" : publicLive ? publicRefreshDelayed ? "Refresh delayed · last evidence retained" : "Public sources live · auto-refresh" : "Preview · API ready"}</div></div>
          <div className="attention-grid">
            {publicReadOnlyMode ? publicLeadItem ? <article className="lead-story glass-panel public-evidence-lead">
              <div className="story-accent" />
              <div className="story-topline">
                <div className="source-line"><span className={`source-avatar ${publicLeadItem.source === "x" ? "x-source" : publicLeadItem.source}`}>{sourceMark(publicLeadItem.source)}</span><div><strong>{sourceLabel(publicLeadItem.source)}</strong><small>{signalAttribution(publicLeadItem)} · observed {ageLabel(publicLeadItem.age_seconds)} ago{publicLeadMetricSummary && ` · ${publicLeadMetricSummary}`}</small></div></div>
                <span className="public-evidence-state"><i /> Unscored evidence</span>
              </div>
              <div className="story-copy">
                <p className="story-kicker">{publicLeadItem.niche || publicLeadItem.topic} · newest matching evidence</p>
                <h3>{publicLeadItem.title}</h3>
                <p>This is a current source item, not a reconstructed story. Radar preserves the provider permalink and any structured linked source separately, but durable clustering, cohort comparison, and opportunity scoring are not connected on this public runtime.</p>
              </div>
              <div className="why-now public-why-now"><div><strong>Why it is here</strong><p>It is the newest observable item matching {selectedFilter === "For you" ? "the full current public pulse" : selectedFilter === "Following" ? "your exact local watchlist" : selectedFilter === "My focus" ? "your browser-local niche union" : `the ${selectedFilter} filter`}. Recency is shown; importance is not inferred.</p></div><span className="window-chip">{ageLabel(publicLeadItem.age_seconds)} old</span></div>
              <div className="score-grid public-score-grid" aria-label="Story scores are unavailable">
                {scoreTones.map(([label, , tone]) => <div className="score-cell" key={label}><div><span>{label}</span><strong>—</strong></div><div className={`score-track ${tone}`}><i style={{ width: "0%" }} /></div><small>Awaiting durable evidence</small></div>)}
              </div>
              <div className="story-footer">
                <div className="propagation"><span className={`mini-source ${publicLeadItem.source === "x" ? "x-source" : publicLeadItem.source}`}>{sourceMark(publicLeadItem.source)}</span><small>1 source item · no story assignment yet</small></div>
                <div className="public-evidence-actions">{publicLeadIdentity && <button className={publicIdentityIsWatched(publicLeadIdentity) ? "identity-follow following" : "identity-follow"} type="button" aria-pressed={publicIdentityIsWatched(publicLeadIdentity)} aria-label={`${publicIdentityIsWatched(publicLeadIdentity) ? "Stop watching" : "Watch"} ${signalAttribution(publicLeadIdentity.latest)} locally`} title="Exact provider identity · saved only in this browser" onClick={() => toggleLocalWatch(publicLeadIdentity)}>{publicIdentityIsWatched(publicLeadIdentity) ? "Following" : "Follow"} {signalAttribution(publicLeadIdentity.latest)}</button>}<button className="review-evidence" type="button" onClick={() => openPublicEvidence(`${publicLeadItem.source}:${publicLeadItem.id}`)}>Review evidence</button><button className={evidenceIsSaved(publicLeadItem) ? "saved" : ""} type="button" aria-pressed={evidenceIsSaved(publicLeadItem)} onClick={() => toggleEvidenceDesk(publicLeadItem)}>{evidenceIsSaved(publicLeadItem) ? "Saved to desk" : "Save to desk"}</button>{(publicLeadRelatedUrl || publicLeadItem.source_url) && <span className="public-evidence-links">{publicLeadRelatedUrl && <a className="public-related-cta" href={publicLeadRelatedUrl} target="_blank" rel="noreferrer">Linked source</a>}{publicLeadItem.source_url && <a className={`public-source-cta ${publicLeadRelatedUrl ? "provenance" : ""}`} href={publicLeadItem.source_url} target="_blank" rel="noreferrer">{publicEvidenceLinkLabel(publicLeadItem)}</a>}</span>}</div>
              </div>
            </article> : <article className="lead-story glass-panel lead-story-empty"><div className="view-empty"><span>◇</span><h3>{publicBootstrapping ? "Checking the evidence lanes" : allCurrentSourcesMuted ? "All current sources are muted." : selectedFilter === "Following" ? localWatchlist.length ? "No followed identity is publishing in this pulse." : "Your Following lane is ready." : selectedFilter === "My focus" ? focusHasInclusion ? "No current evidence matches My focus." : "My focus is ready." : "No matching live evidence"}</h3><p>{publicBootstrapping ? "Source items appear here only after provider health and exact provenance checks finish. The rest of the workspace remains available while Radar verifies them." : allCurrentSourcesMuted ? "Collection is still running, but your browser has hidden every current source from dashboard streams and page-level alerts. Search and exact shared links remain available." : selectedFilter === "Following" ? localWatchlist.length ? `Your ${localWatchlist.length} saved ${localWatchlist.length === 1 ? "identity remains" : "identities remain"} in this browser. This page will show only exact current matches when one appears.` : "Choose an observed identity once; exact current matches will appear here without changing their order or scores." : selectedFilter === "My focus" ? focusHasInclusion ? `Your ${focusRuleCount} configured ${focusRuleCount === 1 ? "rule has" : "rules have"} no matching item in the current bounded pulse. The profile remains saved in this browser.` : "Choose a niche or add an include phrase. Radar will apply exact deterministic matching without changing recency order or inventing a Relevance score." : `No current public item matches ${selectedFilter}. Choose another filter or keep this view open for the next source update.`}</p>{!publicBootstrapping && allCurrentSourcesMuted ? <button className="primary-button" type="button" onClick={() => setPanel("sources")}>Tune sources</button> : !publicBootstrapping && selectedFilter === "Following" ? <button className="primary-button" type="button" onClick={() => selectView("creators")}>{localWatchlist.length ? "Manage watchlist" : "Choose identities"}</button> : !publicBootstrapping && selectedFilter === "My focus" && <button className="primary-button" type="button" onClick={() => setPanel("focus")}>{focusRuleCount ? "Edit My focus" : "Build My focus"}</button>}</div></article> : connected && stories.length === 0 ? <article className="lead-story glass-panel lead-story-empty"><div className="view-empty"><span>◇</span><h3>No scored story yet</h3><p>The Command Center will populate after observable evidence forms a story and receives its first versioned score.</p></div></article> : <article className="lead-story glass-panel">
              <div className="story-accent" />
              <div className="story-topline">
                <div className="source-line"><span className={`source-avatar ${leadStory.sources[0] === "x" ? "x-source" : leadStory.sources[0] ?? "youtube"}`}>{sourceMark(leadStory.sources[0] ?? "youtube")}</span><div><strong>{leadStory.topic}</strong><small>{leadStory.sources.slice(0, 2).map(sourceLabel).join(" · ") || "Source pending"} · {connected ? "live evidence" : "preview evidence"}</small></div></div>
                <span className="story-state"><i /> {leadStory.state}</span>
              </div>
              <div className="story-copy">
                <p className="story-kicker">{leadStory.niche} · {leadStory.topic}</p>
                <h3>{leadStory.label}</h3>
                <p>{leadStory.summary ?? `A ${leadStory.state} story reconstructed from ${leadStory.source_count} independent source${leadStory.source_count === 1 ? "" : "s"}.`}</p>
              </div>
              <div className="why-now"><span className="spark-icon">✦</span><div><strong>Why now</strong><p>{leadStory.why_now ?? (leadStory.state === "seed" ? "The first evidence is in and the story is still early enough to shape." : `${leadStory.member_count} items across ${leadStory.source_count} sources now point to the same developing narrative.`)}</p></div><span className="window-chip">{leadStory.scores.opportunity ? `${Math.round(Number(leadStory.scores.opportunity))} opportunity` : leadStory.state === "seed" ? "early signal" : "moving now"}</span></div>
              <div className="score-grid">
                {storyScores.map(([label, value, tone]) => <div className="score-cell" key={label}><div><span>{label}</span><strong>{value || "—"}</strong></div><div className={`score-track ${tone}`}><i style={{ width: `${value}%` }} /></div></div>)}
              </div>
              <div className="story-footer">
                <div className="propagation">{leadStory.sources.slice(0, 3).map((source) => <span className={`mini-source ${source === "x" ? "x-source" : source}`} key={source}>{sourceMark(source)}</span>)}<small>{leadStory.source_count} sources · {leadStory.member_count} evidence items</small></div>
                <div className="story-actions"><button type="button" aria-pressed={saved} onClick={() => setSaved((value) => !value)}>{saved ? "Saved" : "Save"}</button><button type="button" onClick={() => setPanel("studio")}>Draft angle</button><button className="open-story" type="button" onClick={() => void openStory()}>Open story <span>→</span></button></div>
              </div>
            </article>}

            <aside className={`signal-stack ${publicReadOnlyMode && !leadExactLinkGroup ? "single" : ""}`}>
              {publicReadOnlyMode ? <>
              <article className="compact-story glass-panel public-coverage-card">
                <div className="compact-head"><span>Source coverage</span><span>{publicBootstrapping ? "Verifying" : `${publicLiveSources.length} of ${publicSources.length} live`}</span></div>
                <h3>{publicBootstrapping ? "Checking provider health" : "Current evidence lanes"}</h3><p>{publicBootstrapping ? "Radar is validating each public lane independently. No item is presented as current until its source responds." : "Each source fails independently. Counts show accepted items in this bounded public pulse, not total platform coverage."}</p>
                {publicBootstrapping ? <div className="public-source-checking" role="status"><span>Provider response</span><span>Evidence provenance</span><span>Current publication window</span></div> : <ul className="public-source-mini-list">{publicSources.map((source) => <li key={source.id}><span><i className={source.status} />{source.label}</span><b>{source.status === "live" ? source.item_count : "—"}</b></li>)}</ul>}
              </article>
              {leadExactLinkGroup ? <article className="compact-story glass-panel exact-link-pickup-card" aria-labelledby="exact-link-pickup-title">
                <div className="compact-head"><span className="exact-link-mark">⌁</span><span>Exact-link pickup</span><time>{ageLabel(leadExactLinkGroup.newest_age_seconds)}</time></div>
                <h3 id="exact-link-pickup-title">{leadExactLinkGroup.members[0]?.title ?? "The same source link appeared twice"}</h3>
                <p>{leadExactLinkGroup.lane_count} distinct collection lanes point to the same canonical URL. This is hard-link evidence, not factual confirmation or a semantic story merge.</p>
                <div className="exact-link-lanes" aria-label={`${leadExactLinkGroup.lane_count} matching source lanes`}>{leadExactLinkGroup.lanes.slice(0, 3).map((lane) => <span key={lane.id}>{lane.label}</span>)}</div>
                <button className="exact-link-open" type="button" onClick={() => openPublicPickup(allHistoricalExactLinkGroupByUrl.get(leadExactLinkGroup.canonical_url)?.id ?? leadExactLinkGroup.id)}>Review pickup <span>→</span></button>
              </article> : null}
              </> : <>
              <article className="compact-story glass-panel chinese-signal">
                <div className="compact-head"><span className="flag-chip">中 → EN</span><span>{crossoverStory ? `${crossoverStory.source_count} observed sources` : "No verified crossover"}</span></div>
                <h3>{crossoverStory?.label ?? "Chinese-to-English crossover is quiet"}</h3><p>{crossoverStory?.why_now ?? "Radar will surface the first evidence-backed crossover without inventing a pickup advantage."}</p>
                <div className="compact-score"><strong>{crossoverStory?.scores.opportunity ? Math.round(Number(crossoverStory.scores.opportunity)) : "—"}</strong><span>Opportunity</span><div><i style={{ width: `${Math.round(Number(crossoverStory?.scores.opportunity ?? 0))}%` }} /></div></div>{crossoverStory && <button type="button" onClick={() => void openStory(crossoverStory)}>View crossover <span>→</span></button>}
              </article>
              <article className="compact-story glass-panel creator-signal">
                <div className="compact-head"><span className="creator-avatar">P0</span><span className="p0-chip">Priority creator</span><time>{priorityAlert ? "New" : "Quiet"}</time></div>
                <h3>{priorityAlert ? alertLabel(priorityAlert) : "No unread P0 publication"}</h3><p>{priorityAlert ? "Delivered immediately without waiting for a virality score." : "The next must-see creator publication will appear here immediately."}</p>
                <div className="opportunity-row"><span>Alert lane</span><strong>{priorityAlert ? "P0" : "—"}</strong></div>{typeof priorityAlert?.evidence.source_url === "string" && <a className="compact-link" href={priorityAlert.evidence.source_url} target="_blank" rel="noreferrer">Open source <span>↗</span></a>}
              </article>
              </>}
            </aside>
          </div>
        </section>

        <section className="command-opportunity-queue" aria-labelledby="command-opportunity-title">
          <div className="panel-heading"><div><h2 id="command-opportunity-title">{publicReadOnlyMode ? "Opportunity scoring" : "Top opportunity queue"}</h2><p>{publicReadOnlyMode ? "Opens only after durable story evidence supports a comparison" : "Five developing stories worth evaluating now"}</p></div><button type="button" onClick={() => selectView(publicReadOnlyMode ? "health" : "rankings")}>{publicReadOnlyMode ? "Why unavailable" : "Full rankings"} <span>→</span></button></div>
          <div className="command-opportunity-grid">{bestOpportunities.slice(0, 5).map((story, index) => <button className="command-opportunity-card glass-panel" type="button" onClick={() => void openStory(story)} key={story.id}><header><span>{String(index + 1).padStart(2, "0")}</span><b>{story.scores.opportunity ? Math.round(Number(story.scores.opportunity)) : "—"}</b></header><strong>{story.label}</strong><p>{story.why_now ?? story.summary ?? `${story.member_count} evidence items across ${story.source_count} sources.`}</p><footer><span>{story.niche}</span><b>{story.state} · {story.factual_status} →</b></footer></button>)}</div>
          {!bestOpportunities.length && <div className="command-opportunity-empty glass-panel"><span>◇</span><div><strong>{publicReadOnlyMode ? "Durable scoring is not connected" : "No scored opportunity yet"}</strong><p>{publicReadOnlyMode ? "Live source items remain visible above and in Live Radar. The queue stays empty rather than turning recency into a false recommendation." : "The queue opens only after a story receives a versioned opportunity score; raw popularity cannot fill it."}</p></div></div>}
        </section>

        <section className="lower-grid">
          <article className="feed-panel glass-panel">
            <div className="panel-heading"><div><h2>Live radar</h2><p>{publicLive && !connected ? "Newest AI evidence from Hacker News, official news, and release feeds" : "Signals moving in the last 30 minutes"}</p></div><button type="button" onClick={() => selectView("radar")}>View all <span>→</span></button></div>
            {filteredFeed.slice(0, 3).map((item, index) => <FeedSignalRow item={item} index={index} variant="command" key={item.id} />)}
          </article>
          <article className="gap-panel glass-panel">
            <div className="panel-heading"><div><h2>Content gap</h2><p>{publicReadOnlyMode ? "Requires story heat and observed saturation" : "High heat, low saturation"}</p></div><span className="insight-chip">{publicReadOnlyMode ? "Pending" : "Best bet"}</span></div>
            <div className="gap-visual"><span className="orbit one" /><span className="orbit two" /><span className="gap-core">{contentGapStory?.scores.opportunity ? Math.round(Number(contentGapStory.scores.opportunity)) : "—"}<small>Opportunity</small></span></div>
            <h3>{contentGapStory?.label ?? "No verified content gap right now"}</h3><p>{contentGapStory?.why_now ?? "Radar waits for high story heat, low saturation, and an actual absence of observed YouTube coverage."}</p>
            {contentGapStory && <button className="studio-button" type="button" onClick={() => { setLeadStory(contentGapStory); selectView("studio"); }}>Build a grounded angle <span>✦</span></button>}
          </article>
        </section>
        </>}

        {activeView === "radar" && <section className="product-view radar-library">
          <div className="view-stat-grid">
            <div><span>Observed signals</span><strong>{filteredFeed.length}</strong><small>Current evidence window</small></div>
            <div><span>Active sources</span><strong>{new Set(filteredFeed.map((item) => item.source)).size}</strong><small>Provider-normalized</small></div>
            <div><span>Collection state</span><strong className={connected || publicLive ? "good" : "muted"}>{connected ? "LIVE" : publicLive ? "OPEN LIVE" : "PREVIEW"}</strong><small>{connected ? "SSE connected" : publicLive ? `${publicLiveSources.length} public sources · unscored` : "Backend not connected"}</small></div>
          </div>
          {replyOpportunityPanel()}
          <article className="library-panel glass-panel">
            <div className="library-heading"><div><p className="modal-eyebrow">PUBLICATION ORDER</p><h2>Newest observable signals</h2></div><span>{selectedFilter}</span></div>
            <div className="library-feed">{filteredFeed.length ? filteredFeed.map((item, index) => <FeedSignalRow item={item} index={index} variant="library" key={item.id} />) : <div className="view-empty"><span>◎</span><h3>{allCurrentSourcesMuted ? "Every current source is muted" : selectedFilter === "My focus" && !focusHasInclusion ? "Choose what belongs in My focus" : "No matching signals yet"}</h3><p>{allCurrentSourcesMuted ? "Your browser is hiding current dashboard evidence while collection continues. Search and exact shared links remain available." : selectedFilter === "My focus" && !focusHasInclusion ? "Select a niche or add an include phrase to build a private union view. Hide phrases subtract matches; publication order remains unchanged." : "Keep the filter active; new evidence will appear here as it arrives."}</p>{allCurrentSourcesMuted ? <button className="primary-button" type="button" onClick={() => setPanel("sources")}>Tune sources</button> : selectedFilter === "My focus" && <button className="primary-button" type="button" onClick={() => setPanel("focus")}>{focusRuleCount ? "Edit My focus" : "Build My focus"}</button>}</div>}</div>
          </article>
          {publicReadOnlyMode && <article className="public-history-panel glass-panel" aria-labelledby="public-history-title">
            <header>
              <div><h2 id="public-history-title">Evidence history that survives the pulse</h2><p>Validated source items are retained when a visitor or the best-effort five-minute observer requests the public Radar. This remains request-observed history, not an always-on monitor.</p></div>
              <div className="public-history-header-actions"><span className={publicHistory?.status === "available" ? "available" : "unavailable"}>{publicHistory?.status === "available" ? `${publicHistory.retention_days}-day archive` : "Archive unavailable"}</span><a className="public-feed-link" href="/api/public-feed" target="_blank" rel="alternate noreferrer" title="Open this address in any RSS or Atom reader">Open Atom feed</a></div>
            </header>
            {publicHistory?.status === "available" ? <>
              <div className="public-history-summary" aria-label="Public evidence archive summary">
                <span><strong>{publicHistory.stored_item_count}</strong><small>source items retained</small></span>
                <span><strong>{publicArchiveSourceCount}</strong><small>matching source lanes</small></span>
                <span><strong>{publicArchivedOnlyCount}</strong><small>outside the current pulse</small></span>
                <span><strong>{publicHistory.coverage_started_at ? observedDateLabel(publicHistory.coverage_started_at) : "Starting now"}</strong><small>request-observed coverage began</small></span>
              </div>
              <div className="public-history-movement-filter">
                <div><strong>Observed count state</strong><span>Same-provider samples only. Magnitude never determines order.</span></div>
                <div className="public-history-movement-options" role="group" aria-label="Filter archive by observed provider count state">
                  {(Object.keys(publicArchiveMovementFilterLabels) as PublicArchiveMovementFilter[]).map((filter) => {
                    const count = filter === "all" ? publicArchiveItems.length : publicArchiveMovementCounts[filter];
                    return <button type="button" aria-pressed={publicArchiveMovementFilter === filter} onClick={() => setPublicArchiveMovementFilter(filter)} key={filter}>
                      <span>{publicArchiveMovementFilterLabels[filter]}</span><b>{count}</b>
                    </button>;
                  })}
                </div>
                <p aria-live="polite">Showing {publicArchiveMovementItems.length} {publicArchiveMovementItems.length === 1 ? "item" : "items"} before the bounded display cap.</p>
              </div>
              {publicArchiveDisplayItems.length ? <ol className="public-history-list">{publicArchiveDisplayItems.map((item) => <li className={item.current ? "current" : "archived"} key={item.item_key}>
                <span className={`source-avatar ${item.source === "x" ? "x-source" : item.source}`}>{sourceMark(item.source)}</span>
                <div><button className="public-history-open" type="button" onClick={() => openPublicEvidence(item.item_key)}>{item.title}</button><p>{sourceLabel(item.source)}{item.creator_username ? ` · ${item.creator_username}` : ""}</p><small>Published <time dateTime={item.published_at}>{observedDateLabel(item.published_at)}</time> · first captured <time dateTime={item.first_observed_at}>{observedDateLabel(item.first_observed_at)}</time> · {item.observation_windows} distinct {horizonLabel(publicHistory.observation_window_seconds)} sampling {item.observation_windows === 1 ? "window" : "windows"}</small>{publicArchiveMovementNote(item) && <span className="public-history-momentum">{publicArchiveMovementNote(item)}</span>}</div>
                <div className="public-history-row-status"><b>{item.current ? "Current" : "Archived"}</b><span className={publicArchiveMovementState(item)}>{publicArchiveMovementFilterLabels[publicArchiveMovementState(item)]}</span></div>
              </li>)}</ol> : <div className="public-history-empty"><h3>{allObservableSourcesMuted ? "Muted sources are hidden from this archive view." : publicArchiveMovementFilter === "all" ? "No archived evidence matches this niche." : `No ${publicArchiveMovementFilterLabels[publicArchiveMovementFilter].toLocaleLowerCase()} evidence matches.`}</h3><p>{allObservableSourcesMuted ? "Source tuning changes this dashboard view only. Search remains able to find retained evidence from muted providers." : publicArchiveMovementFilter === "all" ? "Change the niche filter or wait for a matching source item to enter a future public sampling window." : "Choose another count state or return to All retained. Missing results are not evidence that a source was quiet."}</p>{allObservableSourcesMuted && <button className="primary-button" type="button" onClick={() => setPanel("sources")}>Tune sources</button>}</div>}
            </> : <div className="public-history-empty unavailable"><h3>The live pulse still works.</h3><p>{publicHistory?.reason ?? "Persistent history is not available in this runtime, so no archive claim is shown."}</p></div>}
            <footer><strong>Archive is not virality.</strong><span>Sampling windows record only when this bounded pulse was requested and still contained an item. Available provider-native counts may be compared between retained windows. The observer schedule is best effort; gaps remain unknown, and no change becomes continuous velocity, factual agreement, Heat, Confidence, Relevance, or Opportunity.</span></footer>
          </article>}
        </section>}

        {activeView === "stories" && <section className="product-view story-library">
          <div className="library-heading"><div><h2>{publicReadOnlyMode ? visibleHardLinkGroupCount ? `${visibleHardLinkGroupCount} hard-link ${visibleHardLinkGroupCount === 1 ? "pickup" : "pickups"}` : `${publicSingleSourceSeeds.length} observable story ${publicSingleSourceSeeds.length === 1 ? "seed" : "seeds"}` : `${filteredStories.length} developing ${filteredStories.length === 1 ? "story" : "stories"}`}</h2><p>{publicReadOnlyMode ? visibleHardLinkGroupCount ? "Exact URLs connect evidence without semantic guessing. Current-pulse and request-observed archive matches remain separately labelled." : "Each seed is one live source item. It becomes a canonical story only after durable evidence matching." : "Each card joins source evidence without flattening reactions into the original event."}</p></div><span>{publicReadOnlyMode ? visibleHistoricalExactLinkGroups.length && visibleExactLinkGroups.length ? "Current + archive hard links" : visibleHistoricalExactLinkGroups.length ? "Archive hard links" : visibleExactLinkGroups.length ? "Current hard links" : "Unclustered" : connected ? "Live graph" : "Preview graph"}</span></div>
          {publicReadOnlyMode && visibleExactLinkGroups.length > 0 && <div className="exact-link-library" aria-label="Exact-link pickups">{visibleExactLinkGroups.map((group) => {
            const continuity = tunedHistoricalExactLinkGroupByUrl.get(group.canonical_url);
            const archivedContinuity = continuity?.members.filter((member) => !member.current).slice(0, 3) ?? [];
            return <article className="exact-link-group glass-panel" key={group.id}><header><span className="exact-link-mark">⌁</span><div><p>EXACT-LINK PICKUP</p><h3>{group.members[0]?.title ?? "Shared source link"}</h3></div><strong>{group.lane_count} lanes</strong></header><p>The same canonical URL appeared across {group.lanes.map((lane) => lane.label).join(" · ")}. That establishes a link match only—not agreement, origin, or factual confirmation.</p><ol>{group.members.slice(0, 4).map((member) => <li key={`${member.lane_id}:${member.item_id}`}><span className={`mini-source ${member.source === "x" ? "x-source" : member.source}`}>{sourceMark(member.source)}</span><div><a href={member.source_url} target="_blank" rel="noreferrer">{member.title}</a><small>{member.lane_label} · {member.match_kind === "related_url" ? "linked-source match" : "direct-source match"} · {signalAttribution({ creator: member.creator, source: member.source } as FeedItem)} · {ageLabel(member.age_seconds)}</small></div></li>)}</ol>{archivedContinuity.length > 0 && <div className="exact-link-continuity"><strong>Archive continuity</strong><span>{continuity?.item_count} retained items across {continuity?.source_count} sources · first captured {continuity ? observedDateLabel(continuity.first_observed_at) : "—"}</span><ul>{archivedContinuity.map((member) => <li key={member.item_key}><a href={member.source_url} target="_blank" rel="noreferrer">{member.title}</a><small>{sourceLabel(member.source)} · archive only · published {observedDateLabel(member.published_at)}</small></li>)}</ul></div>}<footer><span>{group.observed_span_seconds ? `${durationLabel(group.observed_span_seconds)} observed publication span` : "Same observed publication age"}</span><div><button type="button" onClick={() => openPublicPickup(continuity?.id ?? group.id)}>Review pickup</button><a href={group.canonical_url} target="_blank" rel="noreferrer">Canonical source ↗</a></div></footer></article>;
          })}</div>}
          {publicReadOnlyMode && visibleHistoricalExactLinkGroups.length > 0 && <div className="exact-link-library historical" aria-label="Historical exact-link pickups">{visibleHistoricalExactLinkGroups.map((group) => <article className="exact-link-group historical glass-panel" key={group.id}><header><span className="exact-link-mark">⌁</span><div><p>REQUEST-OBSERVED ARCHIVE PICKUP</p><h3>{group.members[0]?.title ?? "Shared source link"}</h3></div><strong>{group.source_count} sources</strong></header><p>The same canonical URL appeared across {group.sources.map(sourceLabel).join(" · ")} during separate public archive observations. This preserves a hard link across time—not agreement, origin, factual confirmation, or a semantic merge.</p><ol>{group.members.slice(0, 4).map((member) => <li key={member.item_key}><span className={`mini-source ${member.source === "x" ? "x-source" : member.source}`}>{sourceMark(member.source)}</span><div><a href={member.source_url} target="_blank" rel="noreferrer">{member.title}</a><small>{sourceLabel(member.source)} · {member.match_kind === "related_url" ? "linked-source match" : "direct-source match"} · published {observedDateLabel(member.published_at)} · {member.current ? "current pulse" : "archive only"}</small></div></li>)}</ol><footer><span>{group.publication_span_seconds ? `${durationLabel(group.publication_span_seconds)} publication span` : "Same recorded publication time"} · first captured {observedDateLabel(group.first_observed_at)}</span><div><button type="button" onClick={() => openPublicPickup(group.id)}>Review pickup</button><a href={group.canonical_url} target="_blank" rel="noreferrer">Canonical source ↗</a></div></footer></article>)}</div>}
          <div className="story-library-grid">{publicReadOnlyMode ? publicSingleSourceSeeds.length ? publicSingleSourceSeeds.map((item) => <button className="story-library-card public-story-seed glass-panel" type="button" onClick={() => openPublicEvidence(`${item.source}:${item.id}`)} key={item.id}><div className="story-card-top"><span className="public-story-source"><i>{sourceMark(item.source)}</i>{sourceLabel(item.source)}</span><span>single source</span></div><h3>{item.title}</h3><p>Observed from {signalAttribution(item)} {ageLabel(item.age_seconds)} ago. No cross-source membership is inferred.</p><div className="story-card-scores"><span><b>—</b>Heat</span><span><b>1</b>Evidence item</span><span><b>—</b>Confidence</span></div><footer><span>{sourceLabel(item.source)} · direct evidence</span><b>Review evidence →</b></footer></button>) : visibleHardLinkGroupCount ? null : <div className="view-empty wide"><span>◇</span><h3>{allCurrentSourcesMuted ? "Every current source is muted" : selectedFilter === "My focus" && !focusHasInclusion ? "My focus needs an include rule" : "No matching story seed"}</h3><p>{allCurrentSourcesMuted ? "Collection continues, but source tuning has removed every current seed from dashboard views." : selectedFilter === "My focus" && !focusHasInclusion ? "Choose a topic family or add an include phrase. This changes the local view only and does not create a story or Relevance score." : "No current source item matches this filter. Keep it active or return to “All evidence.”"}</p>{allCurrentSourcesMuted ? <button className="primary-button" type="button" onClick={() => setPanel("sources")}>Tune sources</button> : selectedFilter === "My focus" && <button className="primary-button" type="button" onClick={() => setPanel("focus")}>{focusRuleCount ? "Edit My focus" : "Build My focus"}</button>}</div> : filteredStories.length ? filteredStories.map((story) => <button className="story-library-card glass-panel" type="button" onClick={() => void openStory(story)} key={story.id}><div className="story-card-top"><span className={`story-state state-${story.state}`}><i />{story.state}</span><span>{story.factual_status}</span></div><h3>{story.label}</h3><p>{story.summary ?? story.why_now ?? `${story.member_count} evidence items currently belong to this story.`}</p><div className="story-card-scores"><span><b>{story.scores.heat ? Math.round(Number(story.scores.heat)) : "—"}</b>Heat</span><span><b>{story.scores.confidence ? Math.round(Number(story.scores.confidence)) : "—"}</b>Confidence</span><span><b>{story.scores.opportunity ? Math.round(Number(story.scores.opportunity)) : "—"}</b>Opportunity</span></div><footer><span>{story.sources.slice(0, 3).map((source) => source.replace("hacker_news", "HN")).join(" · ") || "Source pending"}</span><b>{story.member_count} items →</b></footer></button>) : <div className="view-empty wide"><span>◇</span><h3>No stories match this niche</h3><p>Try “For you” or wait for independent evidence to form a story.</p></div>}</div>
        </section>}

        {activeView === "creators" && <section className="product-view creator-library">
          <div className={`view-stat-grid creator-stats ${publicReadOnlyMode ? "public" : ""}`}>{publicReadOnlyMode && <div><span>Watching locally</span><strong>{localWatchlist.length}</strong><small>Saved only in this browser</small></div>}<div><span>{publicReadOnlyMode ? "Observed identities" : "Watched identities"}</span><strong>{publicReadOnlyMode ? publicObservedIdentities.length : creators.length}</strong><small>{publicReadOnlyMode ? "Exact provider identities" : "Across every provider"}</small></div><div><span>{publicReadOnlyMode ? "Current matches" : "P0 creators"}</span><strong>{publicReadOnlyMode ? currentLocalWatchItemCount : creators.filter((creator) => creator.priority === "P0").length}</strong><small>{publicReadOnlyMode ? "Observable watchlist items now" : "Immediate publication alerts"}</small></div><div><span>{publicReadOnlyMode ? "Performance baseline" : "Resolved accounts"}</span><strong className={publicReadOnlyMode ? "muted" : undefined}>{publicReadOnlyMode ? "—" : creators.reduce((total, creator) => total + creator.accounts.filter((account) => account.verification_state !== "pending").length, 0)}</strong><small>{publicReadOnlyMode ? "Not learned from transient evidence" : "Stable provider identities"}</small></div></div>
          <div className="library-heading"><div><h2>{publicReadOnlyMode ? "Who is publishing in the current pulse" : "People and projects you cannot miss"}</h2><p>{publicReadOnlyMode ? "Follow exact provider identities in this browser. Similar names are never merged across platforms." : "Stable identities, normal performance, and unusual activity across watched providers."}</p></div>{publicReadOnlyMode ? <span>Read-only evidence</span> : <button className="secondary-action" type="button" onClick={() => setPanel("watch")}>＋ Add creator</button>}</div>
          {publicReadOnlyMode && <article className="local-watchlist-panel glass-panel" aria-labelledby="local-watchlist-title">
            <header><div><h2 id="local-watchlist-title">Your watchlist pulse</h2><p>Exact identities you chose, matched only against the evidence currently observable on this page.</p></div><div className="local-watchlist-controls"><span className={`local-watchlist-privacy ${localWatchlistPersistence === "session" ? "session" : ""}`}>{localWatchlistPersistence === "session" ? "This visit only" : "Private to this browser"}</span><button className={`local-alert-toggle ${localAlertsEnabled ? "on" : localAlertPermission === "denied" ? "blocked" : ""}`} type="button" aria-pressed={localAlertsEnabled} aria-describedby="local-alert-boundary" disabled={localAlertControlDisabled} title={!localAlertsEnabled && localWatchlist.length === 0 ? "Watch at least one identity before enabling browser alerts." : undefined} onClick={() => void toggleLocalAlerts()}><i aria-hidden="true" />{localAlertControlLabel}</button></div></header>
            {localWatchlist.length ? <div className="local-watchlist-rows">{localWatchlist.map((watch) => { const identity = publicObservedIdentities.find((item) => item.key === watch.key); return <article key={watch.key} className={identity ? "current" : "waiting"}><span className="creator-monogram">{watch.username.replace(/^@/, "").split(/[\s._/-]+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase().slice(0, 2) || "ID"}</span><div><strong>{identity ? signalAttribution(identity.latest) : watch.username}</strong>{identity ? <a href={identity.latest.source_url} target="_blank" rel="noreferrer">{identity.latest.title}</a> : <p>No current evidence from this identity in the bounded public pulse.</p>}<small>{sourceLabel(watch.source)} · {identity ? `${identity.items.length} current ${identity.items.length === 1 ? "item" : "items"} · freshest ${ageLabel(identity.latest.age_seconds)}` : `saved ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(watch.added_at))}`}</small></div><button type="button" aria-label={`Stop watching ${watch.username}`} onClick={() => removeLocalWatch(watch)}>Remove</button></article>; })}</div> : <div className="local-watchlist-empty"><div className="local-watchlist-orbit" aria-hidden="true"><i /><i /><i /></div><div><h3>Make the public pulse yours.</h3><p>Choose “Watch locally” on an observed identity below. Matching source evidence will collect here while it remains visible.</p></div></div>}
            {localWatchlistMessage && <p className={`local-watchlist-message ${localWatchlistPersistence === "session" ? "session" : ""}`} role="status">{localWatchlistMessage}</p>}
            {localAlertMessage && <p className={`local-watchlist-message alert ${localAlertPersistence === "session" ? "session" : ""}`} role="status">{localAlertMessage}</p>}
            <footer id="local-alert-boundary"><strong>On-device alerts, not background monitoring.</strong><span>This list never leaves your browser. When enabled, alerts compare newly observed matches only while this page remains open and the browser permits refreshes; they do not activate push delivery, background collection, priority tiers, identity merging, or performance scoring.</span></footer>
          </article>}
          <div className="creator-grid">{publicReadOnlyMode ? publicObservedIdentities.length ? publicObservedIdentities.map((identity) => <article className={`creator-card public-observed-creator glass-panel ${publicIdentityIsWatched(identity) ? "watched" : ""}`} key={identity.key}><div className="creator-card-head"><span className="creator-monogram">{identity.username.replace(/^@/, "").split(/[\s._/-]+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase().slice(0, 2) || "ID"}</span><span className="priority-tag">{publicIdentityIsWatched(identity) ? "Watching" : "Observed"}</span></div><h3>{signalAttribution(identity.latest)}</h3><p>{identity.items.length} current public evidence {identity.items.length === 1 ? "item" : "items"} from {sourceLabel(identity.source)}. This is a source identity, not a verified cross-platform creator merge.</p><div className="account-badges"><span><i className="observed" />{sourceLabel(identity.source)}</span></div><div className="creator-intelligence"><span><b>{identity.items.length}</b>items now</span><span><b>{ageLabel(identity.latest.age_seconds)}</b>freshest</span><span><b>—</b>baseline unavailable</span></div><a className="creator-current-signal" href={identity.latest.source_url} target="_blank" rel="noreferrer"><span>Latest observed</span><strong>{identity.latest.title}</strong><small>{sourceLabel(identity.source)} · {ageLabel(identity.latest.age_seconds)} · unscored ↗</small></a><div className="public-identity-boundary"><span>No cross-platform merge</span><span>No priority tier</span></div><footer><span>Current pulse only</span><button className={publicIdentityIsWatched(identity) ? "local-watch-button watching" : "local-watch-button"} type="button" aria-pressed={publicIdentityIsWatched(identity)} aria-label={`${publicIdentityIsWatched(identity) ? "Stop watching" : "Watch"} ${signalAttribution(identity.latest)} locally`} onClick={() => toggleLocalWatch(identity)}>{publicIdentityIsWatched(identity) ? "Watching" : "Watch locally"}</button><a href={identity.latest.source_url} target="_blank" rel="noreferrer">Open evidence ↗</a></footer></article>) : <div className="view-empty wide"><span>◎</span><h3>No observed identity in this pulse</h3><p>A provider identity appears here only when a current source item includes one.</p></div> : creators.length ? creators.map((creator) => { const baseline = primaryCreatorBaseline(creator); return <article className="creator-card glass-panel" key={creator.id}><div className="creator-card-head"><span className="creator-monogram">{creator.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}</span><span className={`priority-tag ${creator.priority?.toLowerCase() ?? "none"}`}>{creator.priority ?? "Observed"}</span></div><h3>{creator.name}</h3><p>{creator.description ?? `${creator.kind[0].toUpperCase()}${creator.kind.slice(1)} identity tracked across ${creator.accounts.length || "pending"} provider account${creator.accounts.length === 1 ? "" : "s"}.`}</p><div className="account-badges">{creator.accounts.length ? creator.accounts.map((account) => <span key={`${account.provider}:${account.account_id ?? account.username}`}><i className={account.verification_state} />{account.provider === "x" && account.username ? `@${account.username}` : account.provider.replace("_", " ")}</span>) : <span><i className="pending" />Awaiting identity resolution</span>}</div><div className="creator-intelligence"><span><b>{creator.activity.items_7d}</b>items · 7d</span><span><b>{cadenceLabel(creator.activity.median_interval_hours, creator.activity.cadence_sample_size)}</b>median cadence</span><span><b>{baseline?.median ?? "—"}</b>{baseline ? `${baseline.source} ${readableKey(baseline.metric)} · ${baseline.sample_size} samples` : "baseline learning"}</span></div>{creator.current_signal && <a className={`creator-current-signal ${creator.current_signal.is_unusual ? "unusual" : ""}`} href={creator.current_signal.source_url} target="_blank" rel="noreferrer"><span>{creator.current_signal.is_unusual ? "Unusual now" : "Current signal"}</span><strong>{creator.current_signal.title}</strong><small>{Math.round(Number(creator.current_signal.score))} breakout · {ageLabel(creator.current_signal.age_seconds)} ↗</small></a>}<div className="creator-action-state"><span>Last alert</span><b>{creator.last_alert ? creator.last_alert.acted ? "Acted" : creator.last_alert.outcomes.length ? creator.last_alert.outcomes.join(" · ") : creator.last_alert.state : "None yet"}</b>{creator.recent_items[0]?.source_url ? <a href={creator.recent_items[0].source_url} target="_blank" rel="noreferrer">Latest evidence ↗</a> : <small>{creator.activity.items_30d ? `${creator.activity.items_30d} observed in 30d` : "Awaiting activity"}</small>}</div><footer><span>{creator.watchlists.filter((watch) => watch.enabled).map((watch) => watch.name).join(" · ") || "Not in an active watchlist"}</span><button className="creator-profile-button" type="button" aria-label={`Open ${creator.name} creator profile`} onClick={() => openCreatorProfile(creator)}>Open profile →</button></footer></article>; }) : <div className="view-empty wide"><span>◎</span><h3>Your creator graph starts here</h3><p>Add an X creator or YouTube channel. Stable identities will appear after provider resolution.</p><button className="primary-button" type="button" onClick={() => setPanel("watch")}>Add first watch</button></div>}</div>
        </section>}

        {activeView === "youtube" && <section className="product-view youtube-library">
          <div className="youtube-status glass-panel"><div><span className="youtube-glyph">▶</span><div><h2>{publicReadOnlyMode ? `${publicYoutubeChannelCount} watched public ${publicYoutubeChannelCount === 1 ? "channel" : "channels"}` : `${sourceHealth?.youtube?.watched_channels ?? 0} watched channels · ${sourceHealth?.youtube?.discovery_terms ?? 0} discovery topics`}</h2><p>{publicReadOnlyMode ? "Official upload feeds provide publication evidence only. Push latency, discovery search, views, comments, and first-hour outperformance require the durable backend." : sourceHealth?.youtube?.enabled ? sourceHealth.youtube.discovery_enabled ? `${sourceHealth.youtube.active_subscriptions} active push subscriptions · ${sourceHealth.youtube.discovery_search_calls_remaining ?? 0} of ${sourceHealth.youtube.discovery_daily_search_limit ?? 0} search calls remain today · one recent page per topic` : `${sourceHealth.youtube.active_subscriptions} active push subscriptions · selective topic discovery is disabled` : "Connect the private backend to activate watched-channel push and quota-capped topic discovery."}</p></div></div><span className={sourceHealth?.youtube?.enabled || publicReadOnlyMode ? "connected-chip" : "preview-chip"}>{publicReadOnlyMode ? "Public feeds" : sourceHealth?.youtube?.enabled ? sourceHealth.youtube.discovery_enabled ? "Push + search" : "Push only" : "Preview"}</span></div>
          <div className="youtube-columns"><article className="library-panel glass-panel"><div className="library-heading"><div><h2>{publicReadOnlyMode ? "Latest watched uploads" : "Watched-channel momentum"}</h2><p>{publicReadOnlyMode ? "One freshest current upload per successfully read channel." : "Recent uploads compared with each channel's normal curve."}</p></div><span>{youtubeItems.length} observed</span></div><div className="youtube-list">{youtubeItems.length ? youtubeItems.map((item) => <a href={item.source_url ?? "#"} target={item.source_url ? "_blank" : undefined} rel={item.source_url ? "noreferrer" : undefined} key={item.id}><span className="video-thumb"><i>▶</i></span><div><strong>{item.title}</strong><p>{publicReadOnlyMode ? `${signalAttribution(item)} · ${ageLabel(item.age_seconds)} · publication evidence` : `${ageLabel(item.age_seconds)} · ${item.niche || item.topic}`}</p></div><b className={publicReadOnlyMode ? "pending" : undefined}>{publicReadOnlyMode ? "UNSCORED" : item.scores.heat === null ? "NEW" : Math.round(Number(item.scores.heat))}</b></a>) : <div className="view-empty compact"><span>▶</span><h3>{youtubeSourceMuted ? "YouTube is muted in this browser" : "No matching upload yet"}</h3><p>{youtubeSourceMuted ? "Current uploads remain collected and searchable, but source tuning hides them from dashboard views and page-level alerts." : publicReadOnlyMode ? "No current watched upload matches this niche, or the public channel feeds are temporarily unavailable." : "WebSub uploads will land here immediately after validation."}</p>{youtubeSourceMuted && <button className="primary-button" type="button" onClick={() => setPanel("sources")}>Tune sources</button>}</div>}</div></article><article className="library-panel glass-panel"><div className="library-heading"><div><h2>{publicReadOnlyMode ? "Content-gap scoring" : "Hot elsewhere, absent on YouTube"}</h2><p>{publicReadOnlyMode ? "Requires cross-platform stories and measured YouTube saturation." : "Evidence-backed opportunities with low observed coverage."}</p></div><span>{publicReadOnlyMode ? "Unavailable" : "Evidence-based"}</span></div><div className="gap-list">{rankings?.youtube_gaps.length ? rankings.youtube_gaps.map((story) => <button type="button" onClick={() => void openStory(story)} key={story.id}><span>{story.niche}</span><strong>{story.label}</strong><p>{story.why_now ?? "High movement with no observed YouTube source."}</p><footer><b>{Math.round(Number(story.scores.opportunity ?? 0))} opportunity</b><span>Open story →</span></footer></button>) : <div className="view-empty compact"><span>✓</span><h3>{publicReadOnlyMode ? "No gap claim without comparison" : "No verified gap right now"}</h3><p>{publicReadOnlyMode ? "Watched uploads are visible, but this pulse cannot prove a topic is absent across YouTube or still unsaturated." : "Radar will only call a gap when scored evidence supports it."}</p></div>}</div></article></div>
        </section>}

        {activeView === "china" && <section className="product-view china-library">
          <div className="china-hero glass-panel">
            <div><p className="modal-eyebrow">CROSSOVER MONITOR</p><h2>{publicReadOnlyMode ? "See Chinese AI model activity before it becomes a story." : "Find the English content window while it is still open."}</h2><p>{publicReadOnlyMode ? "This public lane shows exact source evidence from reviewed model owners and repositories. Translation, pickup, and opportunity remain unavailable until durable cross-platform matching is connected." : "Original Chinese evidence stays attached to every story. Pickup status is inferred from observed sources and never presented as complete market coverage."}</p></div>
            <span className={connected ? "connected-chip" : publicReadOnlyMode ? "connected-chip" : "preview-chip"}>{connected ? "Live evidence" : publicReadOnlyMode ? "Live source evidence" : "Representative preview"}</span>
          </div>
          <div className="view-stat-grid china-stats">
            <div><span>{publicReadOnlyMode ? "Chinese model updates" : "Chinese-led stories"}</span><strong>{publicReadOnlyMode ? publicChineseItems.length : chineseLeadStories.length}</strong><small>{publicReadOnlyMode ? "reviewed owners and repositories" : "verified bilingual evidence"}</small></div>
            <div><span>{publicReadOnlyMode ? "Crossover window" : "Median time advantage"}</span><strong>{publicReadOnlyMode || medianPickupSeconds === null ? "—" : medianPickupSeconds < 3600 ? `${Math.max(1, Math.round(medianPickupSeconds / 60))}m` : `${(medianPickupSeconds / 3600).toFixed(1)}h`}</strong><small>{publicReadOnlyMode ? "requires matched English evidence" : "Chinese source → English pickup"}</small></div>
            <div><span>Faithful translations</span><strong className={sourceHealth?.multilingual?.translations_enabled ? "good" : "muted"}>{publicReadOnlyMode ? "—" : sourceHealth?.multilingual?.translations ?? 0}</strong><small>{publicReadOnlyMode ? "not generated in the public pulse" : sourceHealth?.multilingual?.translations_enabled ? `${sourceHealth?.multilingual?.translation_model ?? "Configured model"} · evidence versioned` : "Optional translator not connected"}</small></div>
            <div><span>{publicReadOnlyMode ? "Story scoring" : "Semantic coverage"}</span><strong className="muted">{publicReadOnlyMode ? "—" : sourceHealth?.multilingual?.embedded_active_items ?? 0}</strong><small>{publicReadOnlyMode ? "requires the durable evidence graph" : sourceHealth?.multilingual?.embeddings_enabled ? `${sourceHealth?.multilingual?.embedding_model ?? "BGE-M3"} · ${sourceHealth?.multilingual?.embedding_dimensions ?? 1024} dimensions` : `${sourceHealth?.multilingual?.entity_mentions ?? 0} verified entity mentions`}</small></div>
          </div>
          <article className="rednote-import-panel glass-panel">
            <div className="rednote-import-copy"><p className="modal-eyebrow">LAWFUL MANUAL EVIDENCE</p><h2>Add a reviewed RedNote source without cookies or scraping.</h2><p>Radar stores the original text and exact URL before normalization. Missing metrics stay unavailable, every import is audited, and no live RedNote connector is implied.</p><div><span>✓ Original preserved</span><span>✓ Human approval</span><span>— No auto-posting</span></div></div>
            {operatorSession.authenticated ? <form className="rednote-import-form" onSubmit={(event) => { event.preventDefault(); void importRednoteEvidence(); }}>
              <div className="rednote-form-grid"><label>Public RedNote URL<input type="url" required value={rednoteImport.url} onChange={(event) => setRednoteImport((current) => ({ ...current, url: event.target.value }))} placeholder="https://www.xiaohongshu.com/explore/…" /></label><label>Source note ID<input required maxLength={255} value={rednoteImport.externalId} onChange={(event) => setRednoteImport((current) => ({ ...current, externalId: event.target.value }))} placeholder="Stable note identifier" /></label><label>Published at<input type="datetime-local" required value={rednoteImport.publishedAt} onChange={(event) => setRednoteImport((current) => ({ ...current, publishedAt: event.target.value }))} /></label><label>Authorization reference<input required maxLength={255} value={rednoteImport.authorizationReference} onChange={(event) => setRednoteImport((current) => ({ ...current, authorizationReference: event.target.value }))} placeholder="Review ticket or permission record" /></label><label>Likes <small>optional</small><input type="number" min="0" value={rednoteImport.likes} onChange={(event) => setRednoteImport((current) => ({ ...current, likes: event.target.value }))} placeholder="Unavailable" /></label><label>Comments <small>optional</small><input type="number" min="0" value={rednoteImport.comments} onChange={(event) => setRednoteImport((current) => ({ ...current, comments: event.target.value }))} placeholder="Unavailable" /></label></div>
              <label>Original Chinese text<textarea required maxLength={100000} value={rednoteImport.text} onChange={(event) => setRednoteImport((current) => ({ ...current, text: event.target.value }))} placeholder="Paste the source text faithfully. Do not translate or summarize it here." /></label><label>Why this evidence is authorized and useful<textarea required maxLength={2000} value={rednoteImport.reason} onChange={(event) => setRednoteImport((current) => ({ ...current, reason: event.target.value }))} placeholder="Record the operational reason for this import." /></label><div className="rednote-form-footer"><small>Secrets, cookies, session data, HTML dumps, and unsupported fields are rejected.</small><button type="submit" disabled={rednoteImportState === "saving"}>{rednoteImportState === "saving" ? "Preserving…" : "Preserve evidence"}</button></div>{rednoteImportMessage && <p className={`rednote-import-message ${rednoteImportState}`} role="status">{rednoteImportMessage}</p>}
            </form> : <div className="rednote-import-locked"><span>◎</span><h3>Operator approval required</h3><p>Public visitors can inspect imported evidence, but only the authenticated operator can add a source.</p><button type="button" onClick={() => selectView("health")}>Open operator access →</button></div>}
          </article>
          <div className="china-grid">
            {publicReadOnlyMode && publicChineseItems.length ? publicChineseItems.map((item) => <a className="china-story-card china-public-signal glass-panel" href={item.source_url ?? undefined} target="_blank" rel="noreferrer" key={item.id}>
              <header><span className="china-origin">{item.source === "gitee" ? "Repository activity" : "Model owner feed"}</span><span className="pickup-state unscored">Unscored</span></header>
              <h3>{item.title}</h3><p>Observed from {signalAttribution(item)} on {sourceLabel(item.source)} {ageLabel(item.age_seconds)} ago. {item.source === "gitee" ? "Open the official repository and verify the change history." : "Open the source repository for the model card and files."}{publicMetricSummary(item, 3) ? ` Provider snapshot: ${publicMetricSummary(item, 3)}.` : ""}</p>
              <div className="china-story-metrics"><span><b>—</b>heat</span><span><b>—</b>translation</span><span><b>—</b>English pickup</span></div>
              <footer><span>{sourceLabel(item.source)} · direct evidence</span><b>Open source ↗</b></footer>
            </a>) : chineseLeadStories.length ? chineseLeadStories.map((story) => {
              const delay = story.crossover?.pickup_delay_seconds;
              const pickup = story.crossover?.has_english_evidence ? story.state === "saturated" ? "Saturated" : story.state === "breaking" ? "Accelerating" : "Early pickup" : "No Western pickup";
              return <button className="china-story-card glass-panel" type="button" onClick={() => void openStory(story)} key={story.id}>
                <header><span className="china-origin">中文 first</span><span className={`pickup-state ${pickup.toLowerCase().replaceAll(" ", "-")}`}>{pickup}</span></header>
                <h3>{story.label}</h3><p>{story.summary ?? story.why_now ?? "Open the evidence timeline for original text, translation status, and exact entity matches."}</p>
                <div className="china-story-metrics"><span><b>{delay == null ? "—" : delay < 3600 ? `${Math.max(1, Math.round(delay / 60))}m` : `${(delay / 3600).toFixed(1)}h`}</b>time advantage</span><span><b>{Math.round(Number(story.scores.opportunity ?? 0))}</b>opportunity</span><span><b>{story.source_count}</b>sources</span></div>
                <footer><span>{story.sources.join(" · ").replaceAll("_", " ")}</span><b>Open bilingual evidence →</b></footer>
              </button>;
            }) : <div className="library-panel glass-panel view-empty wide"><span>中</span><h3>{chineseSourcesMuted ? "Chinese AI sources are muted in this browser" : publicReadOnlyMode ? "No recent reviewed update" : "No verified Chinese lead right now"}</h3><p>{chineseSourcesMuted ? "Current model and repository evidence remains collected and searchable, but source tuning hides it from dashboard views and page-level alerts." : publicReadOnlyMode ? "The watched Chinese AI owners and repositories have no public update inside the current 21-day evidence window." : "A story appears here only after Chinese evidence is observed before matching English-language coverage."}</p>{chineseSourcesMuted && <button className="primary-button" type="button" onClick={() => setPanel("sources")}>Tune sources</button>}</div>}
          </div>
        </section>}

        {activeView === "rankings" && <section className="product-view rankings-library">
          {publicReadOnlyMode ? <>
            <article className="public-ranking-context glass-panel">
              <div><h2>Evidence first. Rankings when the measurements exist.</h2><p>This board orders current public items by publication age only. It does not treat recency as Heat, importance, influence, confidence, or an opportunity recommendation.</p></div>
              <div className="public-ranking-boundaries"><span><b>{filteredFeed.length}</b> matching evidence {filteredFeed.length === 1 ? "item" : "items"}</span><span><b>{publicFreshestByProvider.length}</b> observed providers</span><span><b>{publicLiveSources.length}/{publicSources.length}</b> source lanes live</span><span><b>—</b> virality scores withheld</span></div>
            </article>
            <div className="ranking-columns public-ranking-columns">
              <article className="ranking-panel public-evidence-ranking glass-panel">
                <div className="library-heading"><div><h2>Freshest public evidence</h2><p>Newest matching source items; this order is not a breakout ranking.</p></div><span>Publication age</span></div>
                {publicFreshestEvidence.length ? <ol>{publicFreshestEvidence.map((item, index) => <li key={item.id}><a href={item.source_url} target="_blank" rel="noreferrer"><span className="rank-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{item.title}</strong><p>{sourceLabel(item.source)} · {signalAttribution(item)} · publication evidence</p></div><b className="public-ranking-age">{ageLabel(item.age_seconds)}</b></a></li>)}</ol> : <div className="view-empty compact"><span>◇</span><h3>{allCurrentSourcesMuted ? "Every current source is muted" : "No matching current evidence"}</h3><p>{allCurrentSourcesMuted ? "Source tuning hides dashboard evidence while collection and Search continue." : "Choose another niche or wait for the next public source refresh."}</p>{allCurrentSourcesMuted && <button className="primary-button" type="button" onClick={() => setPanel("sources")}>Tune sources</button>}</div>}
              </article>
              <article className="ranking-panel public-evidence-ranking glass-panel">
                <div className="library-heading"><div><h2>Freshest by provider</h2><p>One newest matching item per exact provider family.</p></div><span>Coverage, not quality</span></div>
                {publicFreshestByProvider.length ? <ol>{publicFreshestByProvider.map((item) => <li key={item.source}><a href={item.source_url} target="_blank" rel="noreferrer"><span className={`feed-source ${item.source === "x" ? "x-source" : item.source}`}>{sourceMark(item.source)}</span><div><strong>{sourceLabel(item.source)}</strong><p>{item.title} · {signalAttribution(item)}</p></div><b className="public-ranking-age">{ageLabel(item.age_seconds)}</b></a></li>)}</ol> : <div className="view-empty compact"><span>◎</span><h3>{allCurrentSourcesMuted ? "Every provider is muted" : "No provider has matching evidence"}</h3><p>{allCurrentSourcesMuted ? "Restore a source to repopulate this evidence board." : "The active filter currently excludes every public source item."}</p>{allCurrentSourcesMuted && <button className="primary-button" type="button" onClick={() => setPanel("sources")}>Tune sources</button>}</div>}
              </article>
            </div>
            <p className="public-ranking-note">Scored movement, creator influence, source precision, reply windows, and opportunity rankings remain unavailable until durable metric snapshots, comparable cohorts, reconstructed stories, and judged outcomes are connected.</p>
          </> : <>
            <div className="ranking-columns"><article className="ranking-panel glass-panel"><div className="library-heading"><div><p className="modal-eyebrow">MOVEMENT</p><h2>Fastest-rising stories</h2></div><span>Heat</span></div><ol>{fastestStories.slice(0, 10).map((story, index) => <li key={story.id}><button type="button" onClick={() => void openStory(story)}><span className="rank-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{story.label}</strong><p>{story.state} · {story.source_count} sources · {story.niche}</p></div><b>{story.scores.heat ? Math.round(Number(story.scores.heat)) : "—"}</b></button></li>)}</ol>{!fastestStories.length && <div className="view-empty compact"><span>↗</span><h3>No scored movement yet</h3><p>Rankings begin after a versioned story score exists.</p></div>}</article><article className="ranking-panel glass-panel"><div className="library-heading"><div><p className="modal-eyebrow">ACTION VALUE</p><h2>Best current opportunities</h2></div><span>Opportunity</span></div><ol>{bestOpportunities.slice(0, 10).map((story, index) => <li key={story.id}><button type="button" onClick={() => void openStory(story)}><span className="rank-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{story.label}</strong><p>{story.factual_status} · {story.source_count} sources · {story.niche}</p></div><b className="opportunity-score">{story.scores.opportunity ? Math.round(Number(story.scores.opportunity)) : "—"}</b></button></li>)}</ol>{!bestOpportunities.length && <div className="view-empty compact"><span>✦</span><h3>No opportunity crossed the gate</h3><p>Popularity alone is not enough to appear here.</p></div>}</article></div>
            {replyOpportunityPanel(true)}
            <article className="creator-growth-panel glass-panel"><div className="library-heading"><div><p className="modal-eyebrow">CREATOR MOMENTUM · 7D VS PRIOR 7D</p><h2>Influence gaining fastest</h2><p>Observed story adoption, earliest-source participation, and evidence volume compared across equal windows.</p></div><span>Window delta</span></div>{rankings?.fastest_gaining_creators.length ? <div className="creator-growth-list">{rankings.fastest_gaining_creators.slice(0, 5).map((creator, index) => <div key={creator.creator_id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{creator.name}</strong><p>{creator.current_window.stories} stories · {creator.current_window.earliest_observed_sources} earliest · {creator.current_window.items} items</p><small>{creator.newly_active ? "Newly active this window" : `${creator.growth_rate == null ? "—" : `+${Math.round(creator.growth_rate * 100)}%`} versus prior window`}</small></div><b>+{creator.influence_gain}</b></div>)}</div> : <div className="creator-growth-empty"><span>↗</span><div><strong>No verified acceleration yet</strong><p>This ranking appears only when a creator&apos;s observed influence units exceed the previous equal seven-day window.</p></div></div>}<footer>Influence units are transparent ranking features, not a claim that the creator caused a story.</footer></article>
            <div className="signal-leader-grid">
              <article className="signal-leader-panel glass-panel"><div className="library-heading"><div><p className="modal-eyebrow">ALERT PRECISION · 30D</p><h2>Sources earning trust</h2></div><span>Judged only</span></div>{rankings?.source_alert_precision.length ? <ol>{rankings.source_alert_precision.slice(0, 5).map((source, index) => <li key={source.source}><span className="rank-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{source.source.replaceAll("_", " ")}</strong><p>{source.positive}/{source.judged} positive · {source.unjudged} unjudged</p></div><b>{Math.round((source.confidence_floor ?? 0) * 100)}%</b></li>)}</ol> : rankings?.source_precision_readiness.length ? <div className="precision-readiness"><strong>Minimum sample not reached</strong>{rankings.source_precision_readiness.slice(0, 4).map((source) => <span key={source.source}><b>{source.source.replaceAll("_", " ")}</b><i><em style={{ width: `${Math.min(100, source.judged / source.minimum_judged_alerts * 100)}%` }} /></i><small>{source.judged}/{source.minimum_judged_alerts}</small></span>)}</div> : <div className="leader-empty">Source precision stays blank until sent alerts receive usefulness feedback. No source is called reliable from activity alone.</div>}</article>
              <article className="signal-leader-panel glass-panel"><div className="library-heading"><div><p className="modal-eyebrow">INFLUENCE · 7D</p><h2>Creators shaping stories</h2></div><span>Observed</span></div>{rankings?.influential_creators.length ? <ol>{rankings.influential_creators.slice(0, 5).map((creator, index) => <li key={creator.creator_id}><span className="rank-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{creator.name}</strong><p>{creator.adopted_stories} stories · {creator.earliest_observed_sources} earliest · {creator.provider_count} sources</p></div><b>{creator.influence_score}</b></li>)}</ol> : <div className="leader-empty">Creator influence appears after resolved watched accounts join stories. No values are estimated in preview mode.</div>}</article>
              <article className="signal-leader-panel glass-panel"><div className="library-heading"><div><p className="modal-eyebrow">ORIGINS · 7D</p><h2>Earliest observed sources</h2></div><span>Share</span></div>{rankings?.earliest_observed_sources.length ? <ol>{rankings.earliest_observed_sources.slice(0, 5).map((source, index) => <li key={source.source}><span className="rank-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{source.source.replaceAll("_", " ")}</strong><p>{source.earliest_observed_stories} earliest · {source.confirmed_earliest_stories} confirmed</p></div><b>{Math.round(source.earliest_share * 100)}%</b></li>)}</ol> : <div className="leader-empty">Origin rankings need observed multi-source stories. “Earliest” never implies reliability by itself.</div>}</article>
              <article className="signal-leader-panel glass-panel"><div className="library-heading"><div><p className="modal-eyebrow">ENTITIES · 24H</p><h2>Names moving fastest</h2></div><span>Signal</span></div>{rankings?.fastest_moving_entities.length ? <ol>{rankings.fastest_moving_entities.slice(0, 5).map((entity, index) => <li key={entity.entity_id}><span className="rank-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{entity.name}</strong><p>{entity.entity_type} · {entity.mentioning_items} items · {entity.story_count} stories</p></div><b>{entity.movement_score}</b></li>)}</ol> : <div className="leader-empty">Entity movement appears after verified names enter recent evidence. Preview mode stays blank.</div>}</article>
            </div>
            {rankings?.source_activity.length ? <div className="source-activity glass-panel"><div><p className="modal-eyebrow">SOURCE ACTIVITY · 24H</p><h2>Observed evidence volume</h2></div><div>{rankings.source_activity.map((source) => <span key={source.source}><i className={`mini-source ${source.source === "x" ? "x-source" : source.source}`}>{sourceMark(source.source)}</i><b>{source.observed_items}</b>{source.source.replace("_", " ")}</span>)}</div></div> : null}
          </>}
        </section>}

        {activeView === "quality" && <section className="product-view quality-library">
          <div className="quality-hero glass-panel">
            <div className="quality-hero-copy"><p className="modal-eyebrow">TRUST, MEASURED</p><h2>Know what Radar catches before you trust what it recommends.</h2><p>Every result is reconstructed from exact source evidence and the timestamps available at the historical cutoff. Today&apos;s merged story state cannot improve yesterday&apos;s score.</p><div className="quality-proof-row"><span><i>1</i> Exact anchors</span><span><i>2</i> Historical cutoff</span><span><i>3</i> Curated negatives</span></div></div>
            <div className={`quality-run-chip ${qualityState}`}><span>{qualityState === "ready" ? "Latest verified run" : qualityState === "loading" ? "Checking evaluation" : "Framework ready"}</span><strong>{evaluationRun ? new Date(evaluationRun.created_at).toLocaleDateString([], { month: "short", day: "numeric" }) : "No run yet"}</strong><small>{evaluationRun ? `${quality?.total_cases ?? 0} curated cases · ${evaluationRun.evaluator_version}` : "Metrics stay blank until evidence exists"}</small></div>
          </div>

          <div className="quality-metric-grid">
            {qualityMetrics.map((metric) => <article className="quality-metric glass-panel" key={metric.label}><div><span>{metric.label}</span><b>{metric.value}</b></div><p>{metric.note}</p><div className={metric.progress == null ? "quality-progress pending" : "quality-progress"}><i style={{ width: metric.progress == null ? "0%" : `${Math.max(0, Math.min(100, metric.progress * 100))}%` }} /></div></article>)}
          </div>

          {qualityState === "ready" && quality ? <>
            <div className="quality-detail-grid">
              <article className="quality-panel glass-panel"><div className="library-heading"><div><p className="modal-eyebrow">DETECTION LANES</p><h2>Performance by opportunity type</h2><p>Success includes caught positive cases and correctly ignored negative cases.</p></div><span>{quality.eligible_positive_cases} positive cases</span></div><div className="quality-lane-list">{qualityLanes.map((lane) => <div className="quality-lane" key={lane.lane}><div><strong>{readableKey(lane.lane)}</strong><span>{lane.successful}/{lane.total || 0} successful</span></div><div className="quality-lane-bar"><i style={{ width: `${Math.round(lane.rate * 100)}%` }} /></div><b>{lane.total ? `${Math.round(lane.rate * 100)}%` : "—"}</b></div>)}</div></article>
              <article className="quality-panel glass-panel"><div className="library-heading"><div><p className="modal-eyebrow">LEARNING QUEUE</p><h2>Why cases were not on time</h2><p>Aggregate reasons only; private benchmark evidence stays protected.</p></div><span>{(quality.counts.missed ?? 0) + (quality.counts.caught_late ?? 0)} review</span></div><div className="quality-reason-list">{qualityReasons.length ? qualityReasons.map(([reason, count], index) => <div key={reason}><span>{String(index + 1).padStart(2, "0")}</span><p><strong>{readableKey(reason)}</strong><small>{count === 1 ? "1 affected case" : `${count} affected cases`}</small></p><b>{count}</b></div>) : <div className="quality-clean-state"><span>✓</span><p><strong>No missed reason in this run</strong><small>Keep adding difficult and negative benchmark cases.</small></p></div>}</div></article>
            </div>

            <div className="quality-latency glass-panel"><div><p className="modal-eyebrow">RESPONSE WINDOW</p><h2>Detection and alert latency</h2><p>Measured from each benchmark event&apos;s known start time.</p></div><div className="quality-latency-values"><span><small>Detection median</small><b>{durationLabel(quality.latency_seconds.detection_median)}</b></span><span><small>Detection P95</small><b>{durationLabel(quality.latency_seconds.detection_p95)}</b></span><span><small>Alert median</small><b>{durationLabel(quality.latency_seconds.alert_median)}</b></span><span><small>Alert P95</small><b>{durationLabel(quality.latency_seconds.alert_p95)}</b></span></div><aside><b>Scoped precision</b><p>{quality.precision_scope}</p></aside></div>
            <p className="quality-footnote">Replay window {new Date(evaluationRun!.window_start).toLocaleDateString()}–{new Date(evaluationRun!.window_end).toLocaleDateString()} · observation cutoff {new Date(evaluationRun!.observation_cutoff).toLocaleString()} · score version {evaluationRun!.score_version}</p>
          </> : <div className="quality-awaiting glass-panel"><span className="quality-awaiting-mark">Q</span><div><p className="modal-eyebrow">{qualityState === "unavailable" ? "BACKEND NOT CONNECTED" : qualityState === "loading" ? "LOADING" : "FIRST RUN PENDING"}</p><h2>{qualityState === "unavailable" ? "Quality evidence will appear when the Radar backend is connected." : "Create the first curated replay to establish a trustworthy baseline."}</h2><p>No percentages are estimated or filled with demo values. Add exact source anchors for stories that should be caught and noise that should be ignored, then run the historical evaluator.</p></div><div className="quality-awaiting-steps"><span><b>01</b>Curate exact evidence</span><span><b>02</b>Replay at a cutoff</span><span><b>03</b>Review misses</span></div></div>}
        </section>}

        {activeView === "health" && <section className="product-view health-library">
          <div className={`health-hero glass-panel ${connected ? healthCounts.blocked || healthCounts.degraded ? "attention" : "connected" : publicLive ? "public" : "preview"}`}>
            <div><p className="modal-eyebrow">OPERATIONAL TRUTH</p><h2>{connected ? healthCounts.blocked ? "A connector needs intervention." : healthCounts.degraded ? "Radar is running with reduced coverage." : "Every enabled connector reports healthy." : publicLive ? "The public source pulse is live; durable Radar intelligence is still in preview." : "This public dashboard is preview-only right now."}</h2><p>{connected ? "Statuses come directly from provider health signals, durable cursors, queue state, and configured kill switches. A source is never called live merely because its adapter exists." : publicLive ? "Recent AI evidence is fetched from official public endpoints and shown with exact source links. It remains unscored, unclustered, and non-durable until the private PostgreSQL backend is connected." : "No backend environment is connected to this Sites deployment, so live sources, queues, spend, and ingestion freshness are intentionally left blank."}</p></div>
            <aside><span className={`health-orbit ${connected ? healthCounts.blocked ? "blocked" : healthCounts.degraded ? "degraded" : "live" : publicLive ? "public" : "preview"}`}><i /><b /></span><strong>{connected ? healthCounts.blocked ? "Blocked" : healthCounts.degraded ? "Degraded" : "Operational" : publicLive ? "Public live" : "Preview"}</strong><small>{connected && sourceHealth?.generated_at ? `Checked ${new Date(sourceHealth.generated_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : publicLive ? `${publicLiveSources.length} live · ${publicDegradedSources.length} degraded` : "Backend not connected"}</small><button type="button" onClick={() => void (operatorSession.backend_configured ? refreshFeed() : refreshPublicFeed())}>Refresh status</button></aside>
          </div>

          {!connected && publicLive && <article className="public-source-panel glass-panel">
            <div className="library-heading"><div><p className="modal-eyebrow">PUBLIC SOURCE MATRIX</p><h2>What is actually live right now</h2><p>Each lane is fetched independently. A failing feed degrades only itself and never turns preview data into a live claim.</p></div><span>{publicLiveSources.length} of {publicSources.length} live</span></div>
            <div className="public-source-grid">{publicSources.map((source) => { const visual = publicSourceVisual(source.id); return <section className={source.status} key={source.id}><header><i className={`mini-source ${visual}`}>{sourceMark(visual)}</i><div><strong>{source.label}</strong><small>{source.coverage}</small></div><span>{source.status}</span></header><footer><b>{source.item_count}</b> recent item{source.item_count === 1 ? "" : "s"}<small>{source.reason ?? "Official endpoint responded successfully."}</small></footer></section>; })}</div>
            <p className="public-source-note">{publicSourceSummary || "No public source is currently healthy."} · Heat and Opportunity remain unavailable until comparable, durable observations exist.</p>
          </article>}

          {connected && sourceHealth ? <>
            <div className="health-summary-grid">
              <article className="glass-panel"><span>Enabled health</span><strong>{healthySourcePercent}%</strong><p>{healthCounts.live} live · {healthCounts.degraded} degraded · {healthCounts.blocked} blocked</p><i><b style={{ width: `${healthySourcePercent}%` }} /></i></article>
              <article className="glass-panel"><span>Normalized evidence</span><strong>{totalEvidenceItems.toLocaleString()}</strong><p>{totalRawObjects.toLocaleString()} immutable raw objects retained</p></article>
              <article className="glass-panel"><span>Due observations</span><strong>{sourceHealth.snapshots.due}</strong><p>{sourceHealth.snapshots.queued_batch_jobs} batch jobs · {sourceHealth.snapshots.oldest_due_seconds ? `${durationLabel(sourceHealth.snapshots.oldest_due_seconds)} oldest` : "on schedule"}</p></article>
              <article className="glass-panel"><span>Story review</span><strong>{sourceHealth.stories?.review_decisions ?? 0}</strong><p>{sourceHealth.stories?.unassigned_content_items ?? 0} unassigned · {sourceHealth.stories?.queued_jobs ?? 0} queued</p></article>
            </div>

            <article className="health-source-panel glass-panel">
              <div className="library-heading"><div><p className="modal-eyebrow">CONNECTOR MATRIX</p><h2>Source-by-source coverage</h2><p>Live means a current successful provider signal. Disabled and blocked sources never count toward healthy coverage.</p></div><span>{healthSources.length} configured</span></div>
              {sourceControlMessage && <p className="source-control-message" role="status">{sourceControlMessage}</p>}
              <div className="health-source-grid">{healthSources.map((source) => {
                const status = operationalStatus(source);
                return <section className={`health-source-card ${status}`} key={source.id}>
                  <header><i className={`mini-source ${source.id === "x" ? "x-source" : source.id}`}>{sourceMark(source.id)}</i><div><strong>{source.name ?? source.id.replaceAll("_", " ")}</strong><small>{source.id} · {source.latency_class?.replaceAll("_", " ") ?? "latency unknown"}</small></div><span>{status}</span></header>
                  <p>{source.status_reason ?? (status === "live" ? "A successful provider health signal is current." : "No current healthy provider signal is available.")}</p>
                  <div><span><b>{source.content_items.toLocaleString()}</b>items</span><span><b>{(source.raw_objects ?? 0).toLocaleString()}</b>raw</span><span><b>{source.quota?.requests ?? 0}</b>requests</span></div>
                  <footer><span className={source.cursor?.stale ? "stale" : ""}>{sourceFreshness(source)}</span><small>{source.policy_class?.replaceAll("_", " ") ?? "policy not declared"}</small></footer>
                  <details><summary>Controls and efficiency</summary><dl><div><dt>Feature flag</dt><dd>{source.feature_flag ?? "Source configuration"}</dd></div><div><dt>Static config</dt><dd>{source.configured_enabled === false ? "disabled" : "enabled"}</dd></div><div><dt>Operator gate</dt><dd>{source.operator_enabled === false ? "paused" : "allowed"}</dd></div><div><dt>Kill switch</dt><dd>{source.kill_switch ?? "source.enabled"}</dd></div><div><dt>30d useful alerts</dt><dd>{source.efficiency?.useful_alerts ?? 0} / {source.efficiency?.delivered_alerts ?? 0}</dd></div><div><dt>Requests / useful</dt><dd>{compactMetric(source.efficiency?.requests_per_useful_alert)}</dd></div><div><dt>Estimated units / useful</dt><dd>{source.efficiency?.estimated_cost_known === false ? "provider cost unknown" : compactMetric(source.efficiency?.estimated_cost_per_useful_alert)}</dd></div></dl>{operatorSession.authenticated && <div className="source-control-form"><label htmlFor={`source-reason-${source.id}`}>Operational reason</label><textarea id={`source-reason-${source.id}`} value={sourceControlReasons[source.id] ?? ""} onChange={(event) => setSourceControlReasons((current) => ({ ...current, [source.id]: event.target.value }))} maxLength={2000} placeholder={source.operator_enabled === false ? "Why is it safe to resume?" : "Why should collection pause?"} /><button type="button" disabled={sourceControlBusy[source.id]} onClick={() => void controlSource(source, source.operator_enabled === false)}>{sourceControlBusy[source.id] ? "Applying…" : source.operator_enabled === false ? "Allow collection" : "Pause connector"}</button><small>Static configuration remains the hard ceiling. Changes are idempotent and audited.</small></div>}</details>
                </section>;
              })}</div>
            </article>

            <article className="health-efficiency-panel glass-panel">
              <div className="library-heading"><div><p className="modal-eyebrow">VALUE EFFICIENCY · 30D</p><h2>Cost per useful alert</h2><p>Provider-native usage is divided only by delivered alerts marked useful, acted on, or later viral. Unknown provider pricing stays unknown.</p></div><span>Evidence based</span></div>
              <div className="health-efficiency-grid">{efficiencySources.map((source) => {
                const efficiency = source.efficiency;
                return <section key={source.id}><header><i className={`mini-source ${source.id === "x" ? "x-source" : source.id}`}>{sourceMark(source.id)}</i><div><strong>{source.name ?? source.id.replaceAll("_", " ")}</strong><small>{efficiency?.window_days ?? 30}-day attribution window</small></div></header><b>{efficiencyHeadline(source)}</b><p>{efficiency?.delivered_alerts ?? 0} delivered · {efficiency?.judged_alerts ?? 0} judged · {efficiency?.useful_alerts ?? 0} useful</p><footer><span>{(efficiency?.requests ?? 0).toLocaleString()} requests</span><span>{(efficiency?.objects ?? 0).toLocaleString()} objects</span><span>{efficiency?.estimated_cost_known === false ? "cost unknown" : `${compactMetric(efficiency?.estimated_cost)} ${efficiency?.cost_unit?.replaceAll("_", " ") ?? "units"}`}</span></footer></section>;
              })}</div>
              <p className="health-efficiency-note">Requests, provider quota units, and monetary costs are not cross-platform equivalents. Radar reports each source in its declared native unit and never adds incomparable costs into a fake total.</p>
            </article>

            <div className="health-operations-grid">
              <article className="glass-panel"><div className="health-operation-icon snapshots">↗</div><div><p className="modal-eyebrow">METRIC OBSERVATIONS</p><h3>Snapshot queue</h3></div><dl><div><dt>Pending</dt><dd>{sourceHealth.snapshots.pending ?? 0}</dd></div><div><dt>Due now</dt><dd>{sourceHealth.snapshots.due}</dd></div><div><dt>Batch jobs</dt><dd>{sourceHealth.snapshots.queued_batch_jobs}</dd></div></dl></article>
              <article className="glass-panel"><div className="health-operation-icon stories">◇</div><div><p className="modal-eyebrow">STORY GRAPH</p><h3>Assignment and scoring</h3></div><dl><div><dt>Total stories</dt><dd>{sourceHealth.stories?.total ?? 0}</dd></div><div><dt>Scored</dt><dd>{sourceHealth.stories?.scored ?? 0}</dd></div><div><dt>Score jobs</dt><dd>{sourceHealth.stories?.queued_score_jobs ?? 0}</dd></div></dl></article>
              <article className="glass-panel"><div className="health-operation-icon enrichment">中</div><div><p className="modal-eyebrow">ENRICHMENT</p><h3>Language and entities</h3></div><dl><div><dt>Entity mentions</dt><dd>{sourceHealth.multilingual?.entity_mentions ?? 0}</dd></div><div><dt>Translations</dt><dd>{sourceHealth.multilingual?.translations ?? 0}</dd></div><div><dt>Embeddings</dt><dd>{sourceHealth.multilingual?.embeddings ?? 0}</dd></div></dl></article>
              <article className="glass-panel"><div className="health-operation-icon retention">⌫</div><div><p className="modal-eyebrow">DATA LIFECYCLE</p><h3>Retention and deletion</h3></div><dl><div><dt>Retention</dt><dd>{sourceHealth.retention.retention_days ?? "—"}d</dd></div><div><dt>Expired raw</dt><dd>{sourceHealth.retention.expired_raw_payloads + (sourceHealth.retention.expired_raw_objects ?? 0)}</dd></div><div><dt>Tombstones</dt><dd>{sourceHealth.retention.pending_tombstones}</dd></div></dl></article>
            </div>
            <p className="health-footnote">Public visitors see a read-only operational view. Authenticated operators can pause or resume configured collectors with an audited reason; static feature flags remain the hard ceiling. Fixture-only evidence and disabled sources never masquerade as live coverage.</p>
          </> : <div className="health-preview-empty glass-panel">
            <span className="health-preview-mark">⊙</span><div><p className="modal-eyebrow">NO DURABLE RUNTIME BINDING</p><h2>Connect the deployed backend to activate story reconstruction, scoring, and alerts.</h2><p>{publicLive ? "The public source pulse above is real and current, while provider credentials, durable evidence, administrative controls, and private payloads remain server-side." : "The interface is public, but provider credentials, administrative controls, and private payloads remain server-side. Until that binding exists, Radar shows representative product data everywhere else and no invented operational metrics here."}</p></div><div className="health-preview-checks"><span><i>✓</i>Public UI available</span><span><i>✓</i>Private writes fail closed</span><span><i>{publicLive ? "✓" : "—"}</i>{publicLive ? "Official public feeds live" : "Live ingestion not connected"}</span><span><i>—</i>Durable story engine not connected</span></div>
          </div>}
          <article className={`operator-access glass-panel ${operatorSession.authenticated ? "unlocked" : "locked"}`}>
            <div className="operator-access-icon"><span>{operatorSession.authenticated ? "✓" : "◇"}</span><i /></div>
            <div className="operator-access-copy"><p className="modal-eyebrow">OWNER CONTROLS</p><h2>{operatorSession.loading ? "Checking operator access…" : operatorSession.authenticated ? "Operator session is unlocked." : operatorSession.configured ? "Sign in to make protected changes." : "Owner access is not configured yet."}</h2><p>{operatorSession.authenticated ? `Watchlist, feedback, and Content Studio writes are authorized until ${operatorSession.expires_at ? new Date(operatorSession.expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "this session expires"}. Public visitors remain read-only.` : operatorSession.configured ? "Your passphrase is exchanged only for an encrypted, HttpOnly, same-site session. The backend administrative token never reaches the browser." : operatorSession.reason ?? "Add the server-only operator and session secrets during backend deployment. Public browsing remains available without them."}</p>{operatorSession.login_rate_limit && <small className={`operator-rate-limit ${operatorSession.login_rate_limit.scope}`}>{operatorSession.login_rate_limit.scope === "distributed" ? "Shared edge protection · 5 attempts per 15 minutes" : operatorSession.login_rate_limit.scope === "isolate" ? "Local development protection · shared edge storage unavailable" : "Sign-in protection unavailable · requests fail closed"}</small>}{operatorSession.development_bypass && <small>Development bypass is active. Production rejects this configuration.</small>}{operatorMessage && <small role="status">{operatorMessage}</small>}</div>
            {operatorSession.authenticated ? <button className="operator-signout" type="button" disabled={operatorBusy} onClick={() => void signOutOperator()}>{operatorBusy ? "Ending session…" : "Lock controls"}</button> : operatorSession.configured ? <form className="operator-login" onSubmit={signInOperator}><label htmlFor="operator-password">Operator passphrase</label><div><input id="operator-password" type="password" autoComplete="current-password" value={operatorPassword} minLength={16} maxLength={1024} required onChange={(event) => setOperatorPassword(event.target.value)} placeholder="Enter your private passphrase" /><button type="submit" disabled={operatorBusy}>{operatorBusy ? "Checking…" : "Unlock"}</button></div></form> : <div className="operator-config-state"><span>READ ONLY</span><small>Server secrets missing</small></div>}
          </article>
          {operatorSession.authenticated && <article className="story-review-console glass-panel">
            <div className="library-heading"><div><p className="modal-eyebrow">HUMAN REVIEW · REVERSIBLE</p><h2>Uncertain story assignments</h2><p>Exact links and identifiers still win automatically. Only semantic matches inside the review band appear here.</p></div><button type="button" onClick={() => void refreshStoryReviews()} disabled={storyReviewState === "loading"}>{storyReviewState === "loading" ? "Checking…" : `${storyReviews.length} pending`}</button></div>
            {storyReviewMessage && <p className={`story-review-message ${storyReviewState}`} role="status">{storyReviewMessage}</p>}
            {storyReviewState === "ready" && storyReviews.length === 0 ? <div className="story-review-empty"><span>✓</span><div><strong>Review queue is clear</strong><p>No unresolved semantic story assignment currently requires a human decision.</p></div></div> : <div className="story-review-list">{storyReviews.map((review) => <section key={review.id}>
              <header><span>{review.content_item.source.replaceAll("_", " ")}</span><time>{new Date(review.decided_at).toLocaleString()}</time></header>
              <h3>{review.content_item.title || "Untitled evidence item"}</h3>
              <div className="story-review-comparison"><article><small>Current seed</small><strong>{review.current_story.title}</strong><span>{review.current_story.member_count} evidence item{review.current_story.member_count === 1 ? "" : "s"} · {review.current_story.state}</span></article><i>→</i><article><small>Candidate story</small><strong>{review.candidate_story?.title ?? "Candidate unavailable"}</strong><span>{review.candidate_story ? `${review.candidate_story.member_count} evidence items · ${review.candidate_story.state}` : "Keep this evidence separate"}</span></article></div>
              <label>Decision reason<textarea value={storyReviewReasons[review.id] ?? ""} onChange={(event) => setStoryReviewReasons((current) => ({ ...current, [review.id]: event.target.value }))} maxLength={2000} placeholder="What evidence supports this decision?" /></label>
              <footer><a href={review.content_item.source_url ?? undefined} onClick={(event) => { if (!review.content_item.source_url) event.preventDefault(); }} target={review.content_item.source_url ? "_blank" : undefined} rel={review.content_item.source_url ? "noreferrer" : undefined}>Open source {review.content_item.source_url ? "↗" : "· unavailable"}</a><div><button type="button" disabled={storyReviewBusy[review.id]} onClick={() => void decideStoryReview(review, "reject_candidate")}>Reject match</button><button type="button" disabled={storyReviewBusy[review.id]} onClick={() => void decideStoryReview(review, "keep_separate")}>Keep separate</button><button className="join" type="button" disabled={storyReviewBusy[review.id] || !review.candidate_story} onClick={() => void decideStoryReview(review, "join_candidate")}>{storyReviewBusy[review.id] ? "Saving…" : "Join candidate"}</button></div></footer>
            </section>)}</div>}
            <footer className="story-review-note">Every decision records the actor, reason, evidence version, and idempotency key. Merge and split mutations can be undone only while the affected evidence remains unchanged.</footer>
          </article>}
        </section>}

        {activeView === "studio" && (publicReadOnlyMode ? <section className="product-view studio-library public-evidence-studio">
          <article className="public-studio-intro glass-panel"><div><h2>Build from evidence, not a demo.</h2><p>Select a current public source and turn it into a research brief. This mode never invents story membership, source details, performance, virality, or a publish-ready draft.</p></div><div><span>Public · read only</span><strong>Source-first blueprint</strong><small>Human verification required</small></div></article>
          {publicStudioItem ? <>
            <section className="public-studio-source-picker glass-panel"><header><div><h2>Choose current evidence</h2><p>The selected source is quoted as untrusted evidence and never treated as an instruction.</p></div><span>{publicStudioCandidates.length} available</span></header><div>{publicStudioCandidates.map((item) => <button className={publicStudioItem.id === item.id ? "selected" : ""} type="button" aria-pressed={publicStudioItem.id === item.id} onClick={() => { setPublicStudioItemId(item.id); setCopied(false); }} key={item.id}><i className={`mini-source ${item.source === "x" ? "x-source" : item.source}`}>{sourceMark(item.source)}</i><span><strong>{item.title}</strong><small>{sourceLabel(item.source)} · {signalAttribution(item)} · {ageLabel(item.age_seconds)}</small></span></button>)}</div></section>
            <div className="studio-compose-bar public-studio-compose glass-panel"><div className="studio-format-picker" aria-label="Evidence brief format">{([ ["x_post", "X post"], ["x_reply", "Reply"], ["quote_post", "Quote"], ["thread", "Thread"], ["youtube_video", "YouTube"] ] as const).map(([format, label]) => <button className={studioFormat === format ? "selected" : ""} aria-pressed={studioFormat === format} type="button" onClick={() => selectStudioFormat(format)} key={format}>{label}</button>)}</div><label>Tone<select value={studioTone} onChange={(event) => setStudioTone(event.target.value as ContentTone)}><option value="useful">Useful</option><option value="technical">Technical</option><option value="skeptical">Skeptical</option><option value="supportive">Supportive</option><option value="funny">Funny</option><option value="neutral">Neutral</option></select></label><button className="studio-generate" type="button" onClick={() => void copyDraft(publicStudioBrief)}>{copied ? "Brief copied" : "Copy evidence brief"}</button></div>
            <div className="public-studio-workbench">
              <article className="public-studio-brief glass-panel"><header><div><span>{sourceLabel(publicStudioItem.source)} · observed {ageLabel(publicStudioItem.age_seconds)} ago</span><h2>Research brief for a {publicStudioBlueprint.label}</h2></div><a href={publicStudioItem.source_url} target="_blank" rel="noreferrer">Open original source ↗</a></header><section className="public-verified-observation"><span>Verified observation</span><p><b>{signalAttribution(publicStudioItem)}</b> published “{publicStudioItem.title}”.</p><small>No broader claim is verified by this public pulse.</small></section><section className="public-blueprint"><h3>Build the content in this order</h3><ol>{publicStudioBlueprint.steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol><div><b>{studioTone} tone boundary</b><p>{publicToneBoundaries[studioTone]}</p></div></section><footer><p>Before publishing, confirm every specific claim inside the original source and find independent corroboration when the topic requires it.</p><button className="primary-button" type="button" onClick={() => void copyDraft(publicStudioBrief)}>{copied ? "Copied to clipboard" : "Copy research brief"}</button></footer></article>
              <aside className="public-studio-guardrails glass-panel"><h2>What is not known yet</h2><dl><div><dt>Heat</dt><dd>Not scored</dd></div><div><dt>Cross-source confirmation</dt><dd>Not established</dd></div><div><dt>Provider snapshot</dt><dd>{publicStudioItem ? publicMetricSummary(publicStudioItem, 3) || "Unavailable" : "Unavailable"}</dd></div><div><dt>Source details</dt><dd>Review required</dd></div></dl><section><strong>Safe publication rule</strong><p>Source-native counts are one observation, not velocity or a cross-platform comparison. Source titles can also be incomplete, promotional, satirical, or wrong.</p></section><small>Public mode creates a research plan only. It does not call a model, save a draft, record an outcome, or auto-post.</small></aside>
            </div>
          </> : <div className="library-panel glass-panel view-empty"><span>◇</span><h3>No current public evidence</h3><p>The brief builder will appear after at least one public source returns a valid current item.</p></div>}
        </section> : connected && stories.length === 0 ? <section className="product-view studio-library"><div className="library-panel glass-panel view-empty"><span>✦</span><h3>Content Studio needs a source story</h3><p>Once the story graph has verified evidence, open that story here to create a grounded angle.</p></div></section> : <section className="product-view studio-library">
          <div className="studio-context glass-panel"><div><p className="modal-eyebrow">SOURCE STORY</p><h2>{activeStory.label}</h2><p>{activeStory.summary ?? activeStory.why_now ?? "Open a story to ground the studio in its evidence."}</p></div><button type="button" onClick={() => void openStory(activeStory)}>Review evidence →</button></div>
          <div className="studio-compose-bar glass-panel">
            <div className="studio-format-picker" aria-label="Content format">
              {([ ["x_post", "X post"], ["x_reply", "Reply"], ["quote_post", "Quote"], ["thread", "Thread"], ["youtube_video", "YouTube"] ] as const).map(([format, label]) => <button className={studioFormat === format ? "selected" : ""} aria-pressed={studioFormat === format} type="button" onClick={() => selectStudioFormat(format)} key={format}>{label}</button>)}
            </div>
            <label>Tone<select value={studioTone} onChange={(event) => setStudioTone(event.target.value as ContentTone)}><option value="useful">Useful</option><option value="technical">Technical</option><option value="skeptical">Skeptical</option><option value="supportive">Supportive</option><option value="funny">Funny</option><option value="neutral">Neutral</option></select></label>
            <button className="studio-generate" type="button" onClick={() => void generateStudioDraft()} disabled={studioState === "loading"}>{studioState === "loading" ? "Grounding…" : currentIdea?.is_stale ? "Regenerate" : currentIdea ? "Refresh draft" : "Generate draft"}</button>
          </div>
          {studioMessage && <p className={`studio-message ${studioState}`} role="status">{studioMessage}</p>}
          <div className="studio-workbench"><article className={`studio-editor glass-panel ${currentIdea?.is_stale ? "stale" : ""}`}><div className="library-heading"><div><p className="modal-eyebrow">{currentIdea ? "SAVED · EVIDENCE VERSIONED" : "REPRESENTATIVE ANGLE"}</p><h2>{studioFormat === "youtube_video" ? currentIdea?.title ?? "YouTube concept" : studioFormat.replaceAll("_", " ")}</h2></div><span>{currentIdea?.is_stale ? "Evidence changed" : `${activeOpportunity?.action_window ?? "Developing"} window`}</span></div>{currentIdea?.is_stale && <div className="stale-warning"><b>Story evidence changed.</b> Regenerate before publishing so claims and sources match the current timeline.</div>}<div className="draft-surface"><p>{studioDraft}</p>{studioTitleVariants.length > 0 && <ol className="title-variants">{studioTitleVariants.map((title, index) => <li key={title}><span>{index + 1}</span>{title}</li>)}</ol>}</div><div className="studio-grounding"><span>✓ Grounded in {studioEvidenceSources} evidence items</span><span>{activeStory.factual_status} factual status</span><span>Human approval required</span></div><footer><p>{activeOpportunity?.action_basis ?? "Claims remain bounded by the evidence currently attached to this story."}</p><button className="primary-button" type="button" onClick={() => void copyDraft(studioDraft, currentIdea?.id)}>{copied ? "Copied + recorded" : "Copy draft"}</button></footer></article><aside className="studio-sidebar glass-panel"><p className="modal-eyebrow">INTELLIGENCE CHECK</p><h3>Before you publish</h3><div><span>Heat<b>{activeStory.scores.heat ? Math.round(Number(activeStory.scores.heat)) : "—"}</b></span><span>Confidence<b>{activeStory.scores.confidence ? Math.round(Number(activeStory.scores.confidence)) : "—"}</b></span><span>Opportunity<b>{activeStory.scores.opportunity ? Math.round(Number(activeStory.scores.opportunity)) : "—"}</b></span></div><hr /><p><b>Recommended format</b>{activeOpportunity?.suggested_action?.replaceAll("_", " ") ?? "Original post with source context"}</p><p><b>Saturation check</b>{activeStory.scores.opportunity ? "Included in the opportunity score" : "Awaiting a versioned opportunity score"}</p><p><b>Grounding state</b>{currentIdea ? currentIdea.is_stale ? "Outdated — regenerate" : `Saved to ${currentIdea.evidence_hash.slice(0, 8)}…` : "Generate to save an evidence version"}</p><small>Radar never guarantees virality, never presents an unverified claim as fact, and never auto-posts.</small></aside></div>
          {studioFormat === "youtube_video" && currentThumbnailArtifact && <section className={`thumbnail-studio glass-panel ${currentIdea?.is_stale ? "stale" : ""}`}>
            <div className="thumbnail-preview"><canvas ref={thumbnailCanvasRef} aria-label="Preview of the grounded YouTube thumbnail" /></div>
            <div className="thumbnail-controls">
              <div><h2>Export a grounded thumbnail</h2><p>Select one evidence-bound headline. The PNG is rendered privately in this browser at 1280 × 720 and never auto-published.</p></div>
              <fieldset><legend>Thumbnail headline</legend>{currentThumbnailArtifact.title_variants.map((headline, index) => <label className={thumbnailHeadlineIndex === index ? "selected" : ""} key={`${index}:${headline}`}><input type="radio" name={`thumbnail-headline-${currentIdea?.id ?? "draft"}`} value={index} checked={thumbnailHeadlineIndex === index} onChange={() => setThumbnailHeadlineIndex(index)} /><span><b>{index + 1}</b>{headline}</span></label>)}</fieldset>
              <div className="thumbnail-export-row"><span>{currentThumbnailArtifact.factual_status.replaceAll("_", " ")} · {currentThumbnailArtifact.evidence_item_count} evidence item{currentThumbnailArtifact.evidence_item_count === 1 ? "" : "s"} · human review</span><button type="button" disabled={Boolean(currentIdea?.is_stale) || thumbnailState === "exporting"} onClick={() => void exportThumbnail()}>{thumbnailState === "exporting" ? "Rendering PNG…" : currentIdea?.is_stale ? "Regenerate before export" : "Export 1280 × 720 PNG"}</button></div>
              {thumbnailMessage && <p className={`thumbnail-message ${thumbnailState}`} role="status">{thumbnailMessage}</p>}
            </div>
          </section>}
          <section className="studio-performance glass-panel">
            <div className="studio-performance-heading"><div><p className="modal-eyebrow">PUBLISHED PERFORMANCE</p><h2>Did this angle beat your normal result?</h2><p>Record an observed metric after publishing. Radar compares only prior posts on the same platform, in the same format, at the same age horizon.</p></div><span className={latestPerformance?.baseline.status === "measured" ? "measured" : "learning"}>{latestPerformance?.baseline.status === "measured" ? "Measured" : "Learning"}</span></div>
            {latestPerformance?.latest_snapshot ? <div className="performance-result-grid"><div><small>Latest observed</small><strong>{latestPerformanceValue?.toLocaleString() ?? "—"}</strong><span>{readableKey(latestPerformanceMetric ?? "metric")} · {horizonLabel(latestPerformance.latest_snapshot.age_bucket_seconds)}</span></div><div><small>Versus your median</small><strong>{baselineRatio == null ? "—" : `${baselineRatio.toFixed(2)}×`}</strong><span>{latestPerformance.baseline.status === "measured" ? `${latestPerformance.baseline.sample_size} prior comparable posts` : `${latestPerformance.baseline.sample_size} of ${latestPerformance.baseline.minimum_sample_size} prior posts`}</span></div><div><small>Evidence source</small><strong>{latestPerformance.latest_snapshot.provenance === "official_api" ? "Provider" : "Manual"}</strong><span>{latestPerformance.latest_snapshot.provenance === "official_api" ? "Official connector snapshot" : "Operator-reported snapshot"}</span></div></div> : <div className="performance-empty"><span>↗</span><div><strong>{currentIdea ? "No published result recorded yet" : "Save a grounded draft first"}</strong><p>No lift is estimated. A comparison appears only after five earlier results exist in the same cohort.</p></div></div>}
            {operatorSession.authenticated && currentIdea ? <form className="performance-form" onSubmit={(event) => void recordPublishedResult(event)}><label>Published link<input type="url" required value={publishedResult.url} onChange={(event) => setPublishedResult((current) => ({ ...current, url: event.target.value }))} placeholder={studioFormat === "youtube_video" ? "https://youtube.com/watch?v=…" : "https://x.com/you/status/…"} /></label><label>Published at<input type="datetime-local" required value={publishedResult.publishedAt} onChange={(event) => setPublishedResult((current) => ({ ...current, publishedAt: event.target.value }))} /></label><label>Observed metric<select value={publishedResult.metric} onChange={(event) => setPublishedResult((current) => ({ ...current, metric: event.target.value }))}>{studioFormat === "youtube_video" ? <><option value="views">Views</option><option value="likes">Likes</option><option value="comments">Comments</option></> : <><option value="impressions">Impressions</option><option value="likes">Likes</option><option value="replies">Replies</option><option value="reposts">Reposts</option><option value="quotes">Quotes</option></>}</select></label><label>Current value<input type="number" min="0" step="1" required value={publishedResult.value} onChange={(event) => setPublishedResult((current) => ({ ...current, value: event.target.value }))} placeholder="0" /></label><button type="submit" disabled={performanceState === "saving"}>{performanceState === "saving" ? "Saving…" : latestPerformance ? "Add snapshot" : "Record result"}</button></form> : <p className="performance-readonly">{currentIdea ? "Public visitors can inspect measured results. Sign in as the operator to add a publication or metric snapshot." : "Generate this representative angle against live evidence before outcome tracking begins."}</p>}
            {performanceMessage && <p className={`performance-message ${performanceState}`} role="status">{performanceMessage}</p>}
            <footer>Manual metrics are labelled operator-reported and are never presented as provider-verified. Radar measures lift, not causality or guaranteed virality.</footer>
          </section>
        </section>)}

        {panel && <div className="modal-backdrop">
          <button className="modal-backdrop-dismiss" type="button" aria-label="Close panel" onClick={closePanel} />
          <section ref={modalSheetRef} tabIndex={-1} className={`modal-sheet ${panel === "story" ? "story-sheet" : panel === "creator" ? "creator-sheet" : panel === "desk" ? "evidence-desk-sheet" : panel === "evidence" ? "public-evidence-sheet" : panel === "pickup" ? "public-pickup-sheet" : panel === "sources" ? "source-tune-sheet" : panel === "focus" ? "focus-tune-sheet" : ""}`} role="dialog" aria-modal="true" aria-label={panel === "creator" && activeCreator ? `${activeCreator.name} creator profile` : panel === "evidence" && publicEvidenceTitle ? `${publicEvidenceTitle} source evidence` : panel === "pickup" && selectedPickupTitle ? `${selectedPickupTitle} exact-link pickup` : panel === "sources" ? "Tune public evidence sources" : panel === "focus" ? "Choose private Radar focus" : `${panel} panel`}>
            <div className="modal-handle" />
            <button ref={modalCloseRef} className="modal-close" type="button" aria-label="Close" onClick={closePanel}>×</button>
            {panel === "sources" && <div className="source-tune-panel">
              <header><h2>Tune your evidence stream</h2><p>Mute provider families that are not useful to you. This preference stays in your browser and changes only dashboard streams and page-level alerts—not collection, retained evidence, search, or exact shared links.</p></header>
              <div className="source-tune-summary" aria-label="Source tuning summary"><div><strong>{sourceTuningOptions.length}</strong><span>observable providers</span></div><div><strong>{mutedSources.length}</strong><span>muted locally</span></div><div><strong>{mutedCurrentItemCount}</strong><span>current items hidden</span></div></div>
              {sourceTuningOptions.length ? <section className="source-tune-list" aria-label="Observable provider families">{sourceTuningOptions.map((option) => <button className={option.muted ? "muted" : ""} type="button" aria-pressed={option.muted} aria-label={`${option.muted ? "Show" : "Mute"} ${option.label}`} onClick={() => toggleMutedSource(option.source)} key={option.source}><span className={`mini-source ${option.source === "x" ? "x-source" : option.source}`}>{sourceMark(option.source)}</span><span><strong>{option.label}</strong><small>{option.current} current{option.retained === null ? "" : ` · ${option.retained} retained`}</small></span><span className="source-tune-state"><i /><b>{option.muted ? "Muted" : "Showing"}</b></span></button>)}</section> : <div className="source-tune-empty"><h3>No source identities are observable yet.</h3><p>Keep the panel open while the public pulse finishes its source checks.</p></div>}
              {mutedSourcesMessage && <p className={`source-tune-message ${mutedSourcesPersistence === "session" ? "session" : ""}`} role="status">{mutedSourcesMessage}</p>}
              <footer><div><strong>{mutedSourcesPersistence === "local" ? "Private to this browser" : "This visit only"}</strong><span>Muted sources can still appear when you deliberately search the archive or open an exact shared evidence link.</span></div><button type="button" disabled={!mutedSources.length} onClick={resetMutedSources}>Show every source</button></footer>
            </div>}
            {panel === "focus" && <div className="focus-tune-panel">
              <header><span className="focus-tune-mark" aria-hidden="true">✦</span><div><h2>Shape your private focus</h2><p>Combine trusted topic families with your own phrases, then hide the noise you do not want. Matching stays deterministic, private, unscored, and ordered by publication age.</p></div></header>
              <div className="focus-tune-summary" aria-label="My focus summary"><div><strong>{focusRuleCount}</strong><span>rules configured</span></div><div><strong>{focusCurrentMatchCount}</strong><span>current matches</span></div><div><strong>{focusRetainedMatchCount ?? "—"}</strong><span>retained matches</span></div></div>
              <div className="focus-tune-scroll">
                <section className="focus-rule-editor" aria-labelledby="focus-rule-title">
                  <header><div><h3 id="focus-rule-title">Fine-tune with phrases</h3><p>Case-insensitive phrases match titles, topics, niches, creators, and providers. Hide phrases always win.</p></div><span>{focusIncludeTerms.length + focusExcludeTerms.length}/{MAX_FOCUS_TERMS * 2}</span></header>
                  <div className="focus-rule-forms">
                    <form onSubmit={(event) => submitFocusTerm("include", event)}>
                      <label htmlFor="focus-include-term"><span>Include phrase</span><small>Broaden My focus</small></label>
                      <div><input id="focus-include-term" type="text" value={focusIncludeInput} maxLength={MAX_FOCUS_TERM_LENGTH} autoComplete="off" spellCheck="false" placeholder="e.g. MCP server" onChange={(event) => setFocusIncludeInput(event.target.value)} /><button type="submit" disabled={!normalizeFocusTerm(focusIncludeInput)}>Add</button></div>
                      {focusIncludeTerms.length > 0 && <ul aria-label="Included focus phrases">{focusIncludeTerms.map((term) => <li key={term.toLocaleLowerCase()}><span>{term}</span><button type="button" aria-label={`Remove included phrase ${term}`} onClick={() => removeFocusTerm("include", term)}><svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4.5 4.5 7 7m0-7-7 7" /></svg></button></li>)}</ul>}
                    </form>
                    <form onSubmit={(event) => submitFocusTerm("exclude", event)}>
                      <label htmlFor="focus-exclude-term"><span>Hide phrase</span><small>Remove distracting matches</small></label>
                      <div><input id="focus-exclude-term" type="text" value={focusExcludeInput} maxLength={MAX_FOCUS_TERM_LENGTH} autoComplete="off" spellCheck="false" placeholder="e.g. nightly build" onChange={(event) => setFocusExcludeInput(event.target.value)} /><button type="submit" disabled={!normalizeFocusTerm(focusExcludeInput)}>Add</button></div>
                      {focusExcludeTerms.length > 0 && <ul aria-label="Hidden focus phrases">{focusExcludeTerms.map((term) => <li key={term.toLocaleLowerCase()}><span>{term}</span><button type="button" aria-label={`Remove hidden phrase ${term}`} onClick={() => removeFocusTerm("exclude", term)}><svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4.5 4.5 7 7m0-7-7 7" /></svg></button></li>)}</ul>}
                    </form>
                  </div>
                </section>
                <section className="focus-tune-list" aria-label="Available Radar niches">{focusFilterChoices.map((option) => <button className={option.selected ? "selected" : ""} type="button" aria-pressed={option.selected} aria-label={`${option.selected ? "Remove" : "Add"} ${option.filter} ${option.selected ? "from" : "to"} My focus`} onClick={() => toggleFocusFilter(option.filter)} key={option.filter}><span className="focus-option-check" aria-hidden="true"><i /></span><span><strong>{option.filter}</strong><small>{option.current} current{option.retained === null ? "" : ` · ${option.retained} retained`}</small></span><b>{option.selected ? "Included" : "Add"}</b></button>)}</section>
              </div>
              {focusFiltersMessage && <p className={`focus-tune-message ${focusFiltersPersistence === "session" ? "session" : ""}`} role="status">{focusFiltersMessage}</p>}
              <div className="focus-tune-boundary"><span>{focusFiltersPersistence === "local" ? "Private to this browser" : "This visit only"}</span><p>These rules change My focus only. Search, shared evidence links, source collection, and saved evidence remain complete.</p></div>
              <footer><button type="button" disabled={!focusRuleCount} onClick={resetFocusFilters}>Clear focus</button><button className="focus-tune-primary" type="button" disabled={!focusHasInclusion} onClick={openMyFocus}>Open My focus <span>→</span></button></footer>
            </div>}
            {panel === "pickup" && <div className="public-pickup-detail">
              {selectedPickupTitle && selectedPickupCanonicalUrl ? <>
                <header>
                  <div className="public-pickup-status"><span className={selectedPickupCurrent ? "current" : "archived"}>{selectedPickupCurrent ? "Current + retained evidence" : "Request-observed archive"}</span><small>Exact URL match · unscored</small></div>
                  <h2>{selectedPickupTitle}</h2>
                  <p>The same canonical URL appeared across {selectedPickupSources.join(" · ")}. The timeline below preserves each original provider item separately.</p>
                </header>
                <div className="public-pickup-facts" aria-label="Exact-link pickup facts">
                  <div><span>Distinct sources</span><strong>{selectedPickupSourceCount}</strong><small>Separate source families</small></div>
                  <div><span>Evidence items</span><strong>{selectedPickupItemCount}</strong><small>Original provider records</small></div>
                  <div><span>Publication span</span><strong>{selectedPickupHistory?.publication_span_seconds ? durationLabel(selectedPickupHistory.publication_span_seconds) : selectedPickupCurrent?.observed_span_seconds ? durationLabel(selectedPickupCurrent.observed_span_seconds) : "Same window"}</strong><small>{selectedPickupHistory ? "Recorded provider timestamps" : "Current publication ages"}</small></div>
                  <div><span>Radar scores</span><strong>Unavailable</strong><small>No Heat, Confidence, Relevance, or Opportunity</small></div>
                </div>
                <a className="public-pickup-canonical" href={selectedPickupCanonicalUrl} target="_blank" rel="noreferrer"><span><small>Matched canonical URL</small><strong>{new URL(selectedPickupCanonicalUrl).hostname.replace(/^www\./, "")}{new URL(selectedPickupCanonicalUrl).pathname === "/" ? "" : new URL(selectedPickupCanonicalUrl).pathname}</strong></span><em>Open shared source ↗</em></a>
                <section className="public-pickup-timeline" aria-labelledby="public-pickup-timeline-title">
                  <header><div><h3 id="public-pickup-timeline-title">Evidence timeline</h3><p>{selectedPickupHistory ? `First captured ${observedDateLabel(selectedPickupHistory.first_observed_at)} · last captured ${observedDateLabel(selectedPickupHistory.last_observed_at)}` : "Current provider items ordered by observed publication age."}</p></div><span>{selectedPickupTimeline.length} shown</span></header>
                  <ol>{selectedPickupTimeline.map((member, index) => <li key={member.key}>
                    <time>{member.timeLabel}</time>
                    <span className="public-pickup-line" aria-hidden="true"><i />{index < selectedPickupTimeline.length - 1 && <b />}</span>
                    <article>
                      <div className="public-pickup-member-head"><span className={`mini-source ${member.source === "x" ? "x-source" : member.source}`}>{sourceMark(member.source)}</span><p><strong>{sourceLabel(member.source)}</strong><small>{member.attribution} · {member.current ? "current or retained" : "archive only"}</small></p><em>{member.matchKind === "related_url" ? "Linked-source match" : "Direct-source match"}</em></div>
                      <h4>{member.title}</h4>
                      <p>{member.matchKind === "related_url" ? "This provider item linked to the canonical URL; its own permalink remains the evidence source." : "The provider permalink itself matches the canonical URL."}</p>
                      <footer><button type="button" onClick={() => openPublicEvidence(member.itemKey)}>Review item</button><a href={member.sourceUrl} target="_blank" rel="noreferrer">Open original ↗</a></footer>
                    </article>
                  </li>)}</ol>
                </section>
                <aside className="public-pickup-boundary"><strong>Link match, not story confirmation</strong><p>A shared URL proves only that distinct source items referenced the same address. It does not establish origin, agreement, factual accuracy, causality, virality, or a semantic story merge.</p></aside>
                <footer className="public-pickup-actions"><button type="button" disabled={pickupShareState === "sharing"} onClick={() => void sharePublicPickup()}>{pickupShareState === "sharing" ? "Sharing…" : pickupShareState === "copied" ? "Link copied" : pickupShareState === "shared" ? "Shared" : pickupShareState === "error" ? "Copy blocked" : "Share pickup"}</button><a href={selectedPickupCanonicalUrl} target="_blank" rel="noreferrer">Open canonical source ↗</a></footer>
              </> : publicBootstrapping ? <div className="public-evidence-locating" aria-live="polite"><span /><h2>Reconstructing exact-link evidence…</h2><p>Radar is checking the current pulse and retained archive for this pickup identity.</p></div> : <div className="public-evidence-missing"><span>◇</span><h2>This pickup is outside the public window.</h2><p>The exact match no longer exists in the bounded current pulse or request-observed archive. No different story or source is substituted.</p><button type="button" onClick={closePanel}>Return to observable stories</button></div>}
            </div>}
            {panel === "evidence" && <div className="public-evidence-detail">
              {publicEvidenceTitle && publicEvidenceSource && publicEvidenceSourceUrl ? <>
                <header>
                  <div className="public-evidence-detail-status"><span className={publicEvidenceCurrentItem ? "current" : "archived"}>{publicEvidenceCurrentItem ? "Current pulse" : "Request-observed archive"}</span><small>Unscored source evidence</small></div>
                  <h2>{publicEvidenceTitle}</h2>
                  <p>{sourceLabel(publicEvidenceSource)}{publicEvidenceCurrentItem ? ` · ${signalAttribution(publicEvidenceCurrentItem)}` : publicEvidenceHistoryItem?.creator_username ? ` · ${publicEvidenceHistoryItem.creator_username}` : ""}</p>
                </header>
                <div className="public-evidence-facts" aria-label="Evidence facts">
                  <div><span>Provider</span><strong>{sourceLabel(publicEvidenceSource)}</strong><small>Exact source identity</small></div>
                  <div><span>{publicEvidenceCurrentItem ? "Freshness" : "Published"}</span><strong>{publicEvidenceCurrentItem ? `${ageLabel(publicEvidenceCurrentItem.age_seconds)} old` : observedDateLabel(publicEvidenceHistoryItem?.published_at ?? "")}</strong><small>{publicEvidenceCurrentItem ? "Current bounded pulse" : "Provider publication time"}</small></div>
                  <div><span>Observation</span><strong>{publicEvidenceCurrentItem ? "Current" : `${publicEvidenceHistoryItem?.observation_windows ?? 0} windows`}</strong><small>{publicEvidenceCurrentItem ? "Visible in the latest fetch" : `Last captured ${observedDateLabel(publicEvidenceHistoryItem?.last_observed_at ?? "")}`}</small></div>
                  <div><span>Radar scores</span><strong>Unavailable</strong><small>No Heat, Confidence, Relevance, or Opportunity</small></div>
                </div>
                <section className="public-evidence-provenance" aria-labelledby="public-evidence-provenance-title">
                  <div><h3 id="public-evidence-provenance-title">Exact provenance</h3><p>The provider permalink is preserved separately from any structured links found in the source item.</p></div>
                  <div className="public-evidence-link-list"><a href={publicEvidenceSourceUrl} target="_blank" rel="noreferrer"><span><b>{sourceMark(publicEvidenceSource)}</b><small>Original source</small><strong>{sourceLabel(publicEvidenceSource)}</strong></span><em>Open ↗</em></a>{publicEvidenceRelatedUrls.map((url, index) => <a href={url} target="_blank" rel="noreferrer" key={url}><span><b>↗</b><small>Linked source {index + 1}</small><strong>{new URL(url).hostname.replace(/^www\./, "")}</strong></span><em>Open ↗</em></a>)}</div>
                </section>
                {publicEvidenceHistoryItem && <section className="public-evidence-observation" aria-labelledby="public-evidence-observation-title"><div><h3 id="public-evidence-observation-title">Observation record</h3><p>Captured by public requests and the best-effort observer, not by an always-on monitor.</p></div><dl><div><dt>First captured</dt><dd>{observedDateLabel(publicEvidenceHistoryItem.first_observed_at)}</dd></div><div><dt>Last captured</dt><dd>{observedDateLabel(publicEvidenceHistoryItem.last_observed_at)}</dd></div><div><dt>Sampling windows</dt><dd>{publicEvidenceHistoryItem.observation_windows}</dd></div></dl></section>}
                {publicEvidenceCurrentItem && publicMetricSummary(publicEvidenceCurrentItem, 4) && <p className="public-evidence-metrics"><strong>One provider snapshot</strong><span>{publicMetricSummary(publicEvidenceCurrentItem, 4)}</span><small>Source-native metrics only. They are not compared across platforms or converted into a Radar score.</small></p>}
                {publicEvidenceHistoryItem && publicMetricHistoryEntries(publicEvidenceHistoryItem).length > 0 && <section className="public-metric-history" aria-labelledby="public-metric-history-title">
                  <header><div><h3 id="public-metric-history-title">Provider-native movement</h3><p>Exact-item counts from separate retained sampling windows on the same provider.</p></div><span>{Math.max(...publicMetricHistoryEntries(publicEvidenceHistoryItem).map((movement) => movement.observation_windows))} windows</span></header>
                  <dl>{publicMetricHistoryEntries(publicEvidenceHistoryItem).slice(0, 4).map((movement) => <div key={movement.name}><dt>{movement.name.replaceAll("_", " ")}</dt><dd>{publicMetricFormatter.format(movement.latest_value)}</dd><small className={movement.delta > 0 ? "up" : movement.delta < 0 ? "down" : "flat"}>{movement.observation_windows > 1 ? `${signedPublicMetricDelta(movement.delta)} since earliest sample` : "Baseline only · one sampled window"}</small></div>)}</dl>
                  <footer>Simple first-to-latest change—not velocity, continuous monitoring, cross-platform comparison, or a Radar score. Sampling gaps may hide intermediate movement.</footer>
                </section>}
                <aside className="public-evidence-boundary"><strong>What this does not establish</strong><p>This is one source item—not a reconstructed story, independent confirmation, factual verdict, virality ranking, or recommendation. Review the original before drawing conclusions.</p></aside>
                <footer className="public-evidence-detail-actions">
                  <button className="share" type="button" disabled={evidenceShareState === "sharing"} onClick={() => void sharePublicEvidence()}>{evidenceShareState === "sharing" ? "Sharing…" : evidenceShareState === "copied" ? "Link copied" : evidenceShareState === "shared" ? "Shared" : evidenceShareState === "error" ? "Copy blocked" : "Share evidence"}</button>
                  <button className={publicEvidenceSaved ? "saved" : ""} type="button" aria-pressed={publicEvidenceSaved} onClick={() => publicEvidenceCurrentItem ? toggleEvidenceDesk(publicEvidenceCurrentItem) : publicEvidenceHistoryItem && toggleHistoricalEvidenceDesk(publicEvidenceHistoryItem)}>{publicEvidenceSaved ? "Saved to desk" : "Save to desk"}</button>
                  <a href={publicEvidenceSourceUrl} target="_blank" rel="noreferrer">Open original source ↗</a>
                </footer>
              </> : publicBootstrapping ? <div className="public-evidence-locating" aria-live="polite"><span /><h2>Locating exact evidence…</h2><p>Radar is checking the current pulse and retained public history for this provider identity.</p></div> : <div className="public-evidence-missing"><span>◇</span><h2>This evidence is outside the public window.</h2><p>The exact item is no longer present in the bounded current pulse or request-observed archive. Nothing else is substituted for it.</p><button type="button" onClick={closePanel}>Return to observable stories</button></div>}
            </div>}
            {panel === "search" && <div className="search-panel" aria-busy={searchIsLoading}><p className="modal-eyebrow">SEARCH THE RADAR</p><h2>{publicReadOnlyMode ? "Find current and retained evidence" : "Find any story, creator, or signal"}</h2><label><span>⌕</span><input ref={searchInputRef} type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} maxLength={80} aria-label={publicReadOnlyMode ? "Search current and retained evidence" : "Search stories, creators, and signals"} aria-describedby="search-result-summary" autoComplete="off" placeholder="Try “Claude”, “Codex”, or “Chinese AI”" /></label><div className={`search-result-summary ${searchIsLoading ? "loading" : ""}`} id="search-result-summary" role="status">{searchIsLoading ? publicReadOnlyMode ? "Searching the 30-day request-observed archive…" : "Searching the full Radar archive…" : publicArchiveSearchReady ? `${searchPayload.archive?.matched_items ?? searchResultCount} retained evidence ${(searchPayload.archive?.matched_items ?? searchResultCount) === 1 ? "match" : "matches"} across source titles, identities, niches, and topics` : archiveSearchReady ? `${searchResultCount} historical ${searchResultCount === 1 ? "match" : "matches"} across stories, identities, and evidence` : normalizedSearchQuery ? `${searchResultCount} ${searchResultCount === 1 ? "match" : "matches"} on this page` : `Showing ${searchResultCount} current and suggested items`}</div>{searchResultCount ? <div className="search-results">
              {searchStoryResults.length > 0 && <section className="search-result-group" aria-labelledby="search-stories-heading"><header><span id="search-stories-heading">Stories</span><small>{searchStoryResults.length}</small></header><div>{searchStoryResults.map((story) => <button className="search-result-row" type="button" onClick={() => void openStory(story)} key={story.id}><i className={`source-avatar ${story.sources[0] === "x" ? "x-source" : story.sources[0] ?? "youtube"}`}>{sourceMark(story.sources[0] ?? "youtube")}</i><span><b>{story.label}</b><small>{story.state} · {story.niche} · {story.source_count} sources{story.match ? ` · matched in ${story.match.matched_on}` : ""}</small></span><em>Story →</em></button>)}</div></section>}
              {searchCreatorResults.length > 0 && <section className="search-result-group" aria-labelledby="search-creators-heading"><header><span id="search-creators-heading">Creators</span><small>{searchCreatorResults.length}</small></header><div>{searchCreatorResults.map((creator) => <button className="search-result-row" type="button" onClick={() => void openSearchCreator(creator)} key={creator.id}><i className="search-creator-mark">{creator.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}</i><span><b>{creator.name}</b><small>{creator.priority ?? "Observed"} · {creator.accounts.length} provider account{creator.accounts.length === 1 ? "" : "s"}{creator.match ? ` · matched in ${creator.match.matched_on}` : ""}</small></span><em>Profile →</em></button>)}</div></section>}
              {searchSignalResults.length > 0 && <section className="search-result-group" aria-labelledby="search-signals-heading"><header><span id="search-signals-heading">Evidence</span><small>{searchSignalResults.length}</small></header><div>{searchSignalResults.map((item) => item.source_url ? <a className="search-result-row" href={item.source_url} target="_blank" rel="noreferrer" onClick={() => setPanel(null)} key={item.id}><i className={`source-avatar ${item.source === "x" ? "x-source" : item.source}`}>{sourceMark(item.source)}</i><span><b>{item.title}</b><small>{sourceLabel(item.source)} · {ageLabel(item.age_seconds)} · {item.story?.niche ?? item.object_type ?? "observed evidence"}{item.match ? ` · matched in ${item.match.matched_on}` : ""}</small></span><em>{item.evidence_key ? "Retained source ↗" : "Source ↗"}</em></a> : <div className="search-result-row observed" key={item.id}><i className={`source-avatar ${item.source === "x" ? "x-source" : item.source}`}>{sourceMark(item.source)}</i><span><b>{item.title}</b><small>{sourceLabel(item.source)} · {ageLabel(item.age_seconds)} · {item.match ? `matched in ${item.match.matched_on}` : "observed evidence"}</small></span><em>Observed</em></div>)}</div></section>}
            </div> : <div className="search-empty"><span>⌕</span><h3>{publicArchiveSearchReady ? "No retained evidence matched" : "No matching intelligence"}</h3><p>{publicArchiveSearchReady ? "No retained source title, provider identity, niche, or topic matched. Try a shorter phrase or alternate spelling." : archiveSearchReady ? "No active story, identity, translation, entity alias, or source evidence matched. Try a shorter phrase or alternate spelling." : publicReadOnlyMode ? "Try a source, creator, model, company, niche, or a shorter phrase. Current evidence remains searchable when the retained archive is unavailable." : "Try a creator, model, company, niche, or a shorter phrase. The full archive becomes available when the Radar backend is connected."}</p><button type="button" onClick={() => setSearchQuery("")}>Clear search</button></div>}<footer className="search-footnote"><span>↵ Open</span><span>Tab Move</span><span>Esc Close</span><small>{publicArchiveSearchReady ? `30-day request-observed archive · ${searchPayload.search_version}` : archiveSearchReady ? `Full archive · ${searchPayload.search_version}` : searchIsLoading ? "Checking retained evidence" : publicLive && !connected ? "Live public sources + current page index" : connected ? "Current page index" : "Preview index"}</small></footer></div>}
          {panel === "desk" && <div className="evidence-desk-panel">
            <header className="evidence-desk-hero"><div><h2>Keep the evidence worth investigating.</h2><p>Save exact source snapshots, then group the ones you choose into a private evidence case. Nothing here is scored or uploaded.</p></div><span className={evidenceDeskPersistence === "local" && evidenceCasesPersistence === "local" ? "local" : "session"}>{evidenceDeskPersistence === "local" && evidenceCasesPersistence === "local" ? "This browser" : "This visit only"}</span></header>
            <div className="evidence-desk-summary"><div><span>Saved evidence</span><strong>{savedEvidence.length}</strong><small>Up to {MAX_SAVED_EVIDENCE} source snapshots</small></div><div><span>Evidence cases</span><strong>{evidenceCases.length}</strong><small>Up to {MAX_EVIDENCE_CASES} user-curated cases</small></div><div><span>Storage boundary</span><strong>{evidenceDeskPersistence === "local" && evidenceCasesPersistence === "local" ? "Local" : "Session"}</strong><small>{evidenceDeskPersistence === "local" && evidenceCasesPersistence === "local" ? "Never sent to the Radar server" : "Browser persistence unavailable"}</small></div><button type="button" onClick={() => void copyEvidenceDesk()} disabled={!savedEvidence.length}>Copy all evidence</button></div>
            {evidenceDeskMessage && <p className={`evidence-desk-message ${evidenceDeskPersistence === "local" && evidenceCasesPersistence === "local" ? "local" : "session"}`} role="status">{evidenceDeskMessage}</p>}
            <section className="evidence-case-workspace" aria-labelledby="evidence-case-title">
              <header><div><h3 id="evidence-case-title">Build an evidence case</h3><p>You choose the sources. Radar preserves the bundle without claiming they describe the same story.</p></div><div className="evidence-case-workspace-tools"><span>{selectedEvidenceKeys.length}/{MAX_EVIDENCE_PER_CASE} selected</span><button type="button" disabled={evidenceCaseImporting} onClick={() => evidenceCaseImportRef.current?.click()}>{evidenceCaseImporting ? "Reading case…" : "Import case"}</button><input ref={evidenceCaseImportRef} type="file" accept="application/json,.json" tabIndex={-1} aria-label="Import portable evidence case" onChange={(event) => void importEvidenceCase(event)} /></div></header>
              <div className="evidence-case-composer"><label>Case name<input value={evidenceCaseTitle} onChange={(event) => setEvidenceCaseTitle(event.target.value)} maxLength={140} placeholder="Example: Claude Code launch follow-up" /></label><button type="button" onClick={createEvidenceCase} disabled={!evidenceCaseTitle.trim() || selectedEvidenceKeys.length === 0}>Create case</button></div>
              {evidenceCases.length ? <div className="evidence-case-list" aria-label="Saved evidence cases">{evidenceCases.map((evidenceCase) => { const sourceCount = new Set(evidenceCase.evidence.map((item) => item.source)).size; return <button className={activeEvidenceCaseId === evidenceCase.id ? "active" : ""} type="button" aria-pressed={activeEvidenceCaseId === evidenceCase.id} onClick={() => { setActiveEvidenceCaseId(activeEvidenceCaseId === evidenceCase.id ? null : evidenceCase.id); setEvidenceCaseDeleteId(null); }} key={evidenceCase.id}><span><strong>{evidenceCase.title}</strong><small>{evidenceCase.evidence.length} source {evidenceCase.evidence.length === 1 ? "item" : "items"} · {sourceCount} {sourceCount === 1 ? "provider" : "providers"}</small></span><em>{activeEvidenceCaseId === evidenceCase.id ? "Close" : "Review"}</em></button>; })}</div> : <div className="evidence-case-empty"><strong>No evidence cases yet.</strong><span>Select saved sources below, name the investigation, and create the first case.</span></div>}
              {activeEvidenceCase && <article className="evidence-case-detail"><header><div><h3>{activeEvidenceCase.title}</h3><p>User-curated case · {activeEvidenceCase.evidence.length} preserved source {activeEvidenceCase.evidence.length === 1 ? "snapshot" : "snapshots"}. Review each original before drawing a conclusion.</p></div><div className="evidence-case-detail-actions"><button type="button" onClick={() => void copyEvidenceCase(activeEvidenceCase)}>Copy verification brief</button><button type="button" onClick={() => exportEvidenceCase(activeEvidenceCase)}>Export case</button>{evidenceCaseDeleteId === activeEvidenceCase.id ? <><button type="button" onClick={() => setEvidenceCaseDeleteId(null)}>Cancel</button><button className="destructive" type="button" onClick={() => deleteEvidenceCase(activeEvidenceCase)}>Confirm delete</button></> : <button className="secondary-delete" type="button" onClick={() => setEvidenceCaseDeleteId(activeEvidenceCase.id)}>Delete case</button>}</div></header><div className="evidence-case-observed-order"><div><strong>Observed source order</strong><span>{activeEvidenceCaseChronology.length === 1 ? "Single snapshot" : `${durationLabel(activeEvidenceCaseSpan)} approximate span`}</span></div><p>Calculated from each snapshot&apos;s saved time minus its recorded source age. Verify the originals before describing chronology or origin.</p></div><ol>{activeEvidenceCaseChronology.map((item) => { const observedAt = new Date(observedEvidenceTimestamp(item)).toISOString(); return <li key={evidenceDeskKey(item)}><span className={`mini-source ${item.source === "x" ? "x-source" : item.source}`}>{sourceMark(item.source)}</span><div><a href={item.source_url} target="_blank" rel="noreferrer">{item.title}</a><small>{sourceLabel(item.source)} · {item.attribution} · approximately <time dateTime={observedAt}>{observedDateLabel(observedAt)}</time> · captured <time dateTime={item.saved_at}>{observedDateLabel(item.saved_at)}</time></small></div></li>; })}</ol><footer><strong>Selection is not confirmation.</strong><span>This case records your research set; it does not infer origin, agreement, corroboration, Heat, Confidence, Relevance, or Opportunity. Portable files stay evidence-only when imported.</span></footer></article>}
            </section>
            <section className="evidence-desk-saved" aria-labelledby="evidence-desk-saved-title"><header><div><h3 id="evidence-desk-saved-title">Saved for review</h3><p>Select source snapshots to build a case. Titles remain untrusted evidence until you verify the originals.</p></div><span>{savedEvidence.length}</span></header>{savedEvidence.length ? <div>{savedEvidence.map((item) => { const selectedForCase = selectedEvidenceKeys.includes(evidenceDeskKey(item)); return <article className={selectedForCase ? "selected-for-case" : ""} key={evidenceDeskKey(item)}><button className="evidence-case-select" type="button" aria-pressed={selectedForCase} aria-label={`${selectedForCase ? "Remove" : "Add"} ${item.title} ${selectedForCase ? "from" : "to"} the new evidence case`} onClick={() => toggleEvidenceSelection(item)}>{selectedForCase ? "Selected" : "Add to case"}</button><span className={`source-avatar ${item.source === "x" ? "x-source" : item.source}`}>{sourceMark(item.source)}</span><div><a href={item.source_url} target="_blank" rel="noreferrer">{item.title}</a><p>{sourceLabel(item.source)} · {item.attribution}</p><small>Saved {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.saved_at))} · unscored source evidence</small></div><button className="evidence-remove" type="button" aria-label={`Remove ${item.title} from evidence desk`} onClick={() => removeSavedEvidence(item)}>Remove</button></article>; })}</div> : <div className="evidence-desk-empty"><h3>Your desk is ready.</h3><p>Save a current source below or use “Save to desk” on the Command Center. The source snapshot stays available after it leaves the live pulse.</p></div>}</section>
            <section className="evidence-desk-current" aria-labelledby="evidence-desk-current-title"><header><div><h3 id="evidence-desk-current-title">Current evidence</h3><p>Freshest unsaved source items. Their order reflects publication age, not importance.</p></div><span>{evidenceDeskCandidates.length}</span></header>{evidenceDeskCandidates.length ? <div>{evidenceDeskCandidates.map((item) => <article key={item.id}><span className={`mini-source ${item.source === "x" ? "x-source" : item.source}`}>{sourceMark(item.source)}</span><div><a href={item.source_url} target="_blank" rel="noreferrer">{item.title}</a><small>{sourceLabel(item.source)} · {signalAttribution(item)} · {ageLabel(item.age_seconds)}</small></div><button type="button" onClick={() => toggleEvidenceDesk(item)}>Save</button></article>)}</div> : <div className="evidence-desk-current-empty"><p>{allCurrentSourcesMuted ? "Source tuning hides every current item. Saved evidence remains available above." : publicTunedFeed.length ? "Every visible current source item is already on your desk." : "No current source evidence is available to save."}</p>{allCurrentSourcesMuted && <button type="button" onClick={() => setPanel("sources")}>Tune sources</button>}</div>}</section>
            <footer className="evidence-desk-boundary"><strong>Evidence only</strong><span>Local selection never becomes story membership, factual confirmation, an alert, or a score.</span></footer>
          </div>}
          {panel === "alerts" && (publicReadOnlyMode ? <div className="alerts-panel public-alert-boundary">
            <header className="public-alert-hero">
              <div>
                <span className={`public-alert-state ${localAlertsEnabled ? "active" : localAlertPermission === "denied" ? "blocked" : "ready"}`}><i aria-hidden="true" />{localAlertsEnabled ? "On-device alerts active" : localAlertPermission === "denied" ? "Permission blocked" : localWatchlist.length ? "Ready on this device" : "Set up your watchlist"}</span>
                <h2>{localAlertsEnabled ? `Watching ${localWatchlist.length} ${localWatchlist.length === 1 ? "identity" : "identities"} for new evidence.` : localWatchlist.length ? "Turn on alerts for the people and sources you follow." : "Choose who matters. Radar will keep the signal focused."}</h2>
                <p>Radar can notify this browser when a newly observed public item exactly matches your local watchlist. Existing evidence is baselined first, so enabling alerts does not create a backlog burst.</p>
              </div>
              {localWatchlist.length ? <button className={`public-alert-primary ${localAlertsEnabled ? "active" : ""}`} type="button" aria-pressed={localAlertsEnabled} aria-describedby="public-alert-limit" disabled={localAlertControlDisabled} onClick={() => void toggleLocalAlerts()}><i aria-hidden="true" />{localAlertControlLabel}</button> : <button className="public-alert-primary" type="button" onClick={() => { setPanel(null); selectView("creators"); }}>Choose identities</button>}
            </header>
            <div className="public-alert-status-grid" aria-label="On-device alert status">
              <div><span>Watching locally</span><strong>{localWatchlist.length}</strong><small>Exact provider identities</small></div>
              <div><span>Current matches</span><strong>{currentLocalWatchItemCount}</strong><small>Visible in this public pulse</small></div>
              <div><span>Browser permission</span><strong className={localAlertPermission === "denied" || localAlertPermission === "unsupported" ? "warning" : undefined}>{localAlertsEnabled ? "On" : localAlertPermission === "granted" ? "Ready" : localAlertPermission === "denied" ? "Blocked" : localAlertPermission === "unsupported" ? "Unavailable" : "Needed"}</strong><small>{localAlertsEnabled ? "New matches only" : "No notification sent"}</small></div>
            </div>
            {localAlertMessage && <p className={`public-alert-message ${localAlertPersistence === "session" ? "session" : ""}`} role="status">{localAlertMessage}</p>}
            <section className="public-alert-watch-summary" aria-labelledby="public-alert-watch-title">
              <header><div><h3 id="public-alert-watch-title">Watched on this device</h3><p>{localWatchlist.length ? "Saved only in this browser. Radar never uploads this list in public mode." : "No identities selected yet."}</p></div><button type="button" onClick={() => { setPanel(null); selectView("creators"); }}>{localWatchlist.length ? "Manage" : "Choose identities"}</button></header>
              {localWatchlist.length ? <ul>{localWatchlist.slice(0, 5).map((watch) => { const identity = publicObservedIdentities.find((item) => item.key === watch.key); return <li key={watch.key}><span>{watch.username.replace(/^@/, "").slice(0, 1).toUpperCase() || "I"}</span><div><strong>{watch.username}</strong><small>{sourceLabel(watch.source)} · {identity ? `${identity.items.length} current ${identity.items.length === 1 ? "match" : "matches"}` : "waiting for current evidence"}</small></div><b className={identity ? "current" : "waiting"}>{identity ? "Observed" : "Quiet"}</b></li>; })}</ul> : <p className="public-alert-watch-empty">Open Creator Watchlist and choose an observed identity. You can change the list at any time.</p>}
              {localWatchlist.length > 5 && <footer>+{localWatchlist.length - 5} more saved {localWatchlist.length - 5 === 1 ? "identity" : "identities"}</footer>}
            </section>
            <section className="public-alert-capability" id="public-alert-limit">
              <div><strong>Works while Radar is open</strong><p>Page refreshes compare stable item identities, notify once, and retain a bounded seen-item history on this device.</p></div>
              <div><strong>Durable delivery is not connected</strong><p>Closed-page monitoring, push delivery, Discord, story cooldowns, and breakout alerts still require the external worker.</p></div>
            </section>
            <footer><a className="public-alert-feed-link" href="/api/public-feed" target="_blank" rel="alternate noreferrer">Follow the Atom feed</a><button type="button" onClick={() => { setPanel(null); selectView("radar"); }}>Open live evidence</button><button type="button" onClick={() => { setPanel(null); selectView("health"); }}>See source health</button></footer>
          </div> : <div className="alerts-panel"><p className="modal-eyebrow">ALERT INBOX · STORY-AWARE</p><h2>Only meaningful changes</h2><p className="alerts-intro">P0 publications and official launches arrive immediately. Story alerts wait for evidence gates; the daily briefing collects the strongest remaining opportunities without repeating a story.</p><div className="alert-list">{alerts.length ? alerts.map((alert) => <ConnectedAlertCard alert={alert} now={alertClock} feedbackStatus={feedbackState[alert.id]} onFeedback={(alertId, outcome) => void submitAlertFeedback(alertId, outcome)} key={alert.id} />) : <div className="alert-empty"><span>✓</span><h3>You&apos;re caught up</h3><p>The next alert will appear only after a real publication, story milestone, or scheduled briefing.</p></div>}</div></div>)}
            {panel === "watch" && <form className="watch-panel" onSubmit={(event) => void addWatch(event)}><p className="modal-eyebrow">NEW WATCH</p><h2>Never miss what matters</h2><p>Add a priority creator on X or a watched YouTube channel. Radar keeps one durable identity per source and routes every new publication into the story graph.</p><div className="provider-picker" aria-label="Watch source">{(["x", "youtube"] as const).map((provider) => <button className={watchProvider === provider ? "chosen" : ""} aria-pressed={watchProvider === provider} type="button" onClick={() => { setWatchProvider(provider); setWatchValue(""); setWatchState("idle"); }} key={provider}>{provider === "x" ? "X creator" : "YouTube channel"}</button>)}</div><label>{watchProvider === "x" ? "X creator handle" : "YouTube channel ID"}<input value={watchValue} onChange={(event) => { setWatchValue(event.target.value); setWatchState("idle"); }} placeholder={watchProvider === "x" ? "@creator" : "UCxxxxxxxxxxxxxxxxxxxxxx"} aria-describedby="watch-help" /></label><small id="watch-help">{watchProvider === "x" ? "P0 alerts immediately; P1–P3 wait for relevance or unusual performance." : "Find the channel ID in the channel URL or YouTube account settings. WebSub activates after the backend confirms the subscription."}</small><div className="tier-picker">{[["P0", "Immediate"], ["P1", "High signal"], ["P2", "Scored"]].map(([tier, label]) => <button className={watchTier === tier ? "chosen" : ""} aria-pressed={watchTier === tier} type="button" onClick={() => setWatchTier(tier)} key={tier}><b>{tier}</b><span>{label}</span></button>)}</div>{watchMessage && <p className={`watch-message ${watchState}`} role="status">{watchMessage}</p>}<button className="modal-primary" type="submit" disabled={watchState === "saving" || watchState === "saved"}>{watchState === "saving" ? "Adding…" : watchState === "saved" ? "Watch added" : `Add ${watchTier} watch`}</button></form>}
            {panel === "creator" && activeCreator && <div className="creator-profile-panel">
              <header className="creator-profile-hero">
                <span className="creator-profile-monogram">{activeCreator.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}</span>
                <div><p className="modal-eyebrow">CREATOR INTELLIGENCE · {activeCreator.kind.toUpperCase()}</p><h2>{activeCreator.name}</h2><p>{activeCreator.description ?? `One resolved creator identity observed across ${activeCreator.accounts.length} provider account${activeCreator.accounts.length === 1 ? "" : "s"}.`}</p><div className="creator-profile-badges"><span className={`priority-tag ${activeCreator.priority?.toLowerCase() ?? "none"}`}>{activeCreator.priority ?? "Observed"}</span>{activeCreator.accounts.map((account) => <span key={`${account.provider}:${account.account_id ?? account.username}`}><i className={account.verification_state} />{account.provider === "x" && account.username ? `@${account.username}` : account.provider.replace("_", " ")}</span>)}</div></div>
              </header>
              <div className="creator-profile-stats"><span><small>Observed · 7d</small><b>{activeCreator.activity.items_7d}</b></span><span><small>Observed · 30d</small><b>{activeCreator.activity.items_30d}</b></span><span><small>Median cadence</small><b>{cadenceLabel(activeCreator.activity.median_interval_hours, activeCreator.activity.cadence_sample_size)}</b></span><span><small>Baselines</small><b>{activeCreator.performance_baselines.length}</b></span></div>
              <div className="creator-profile-layout">
                <div className="creator-profile-main">
                  <section className={`creator-profile-signal ${activeCreator.current_signal?.is_unusual ? "unusual" : ""}`}><div className="creator-profile-section-heading"><div><p className="modal-eyebrow">CURRENT SIGNAL</p><h3>{activeCreator.current_signal ? activeCreator.current_signal.is_unusual ? "Performing unusually now" : "Latest scored publication" : "No current scored publication"}</h3></div>{activeCreator.current_signal && <span>{Math.round(Number(activeCreator.current_signal.score))} breakout</span>}</div>{activeCreator.current_signal ? <><a href={activeCreator.current_signal.source_url} target="_blank" rel="noreferrer">{activeCreator.current_signal.title}<span>Open source ↗</span></a><p>{activeCreator.current_signal.explanation}</p><footer><span>{ageLabel(activeCreator.current_signal.age_seconds)} old</span><span>{activeCreator.current_signal.confidence ? `${Math.round(Number(activeCreator.current_signal.confidence))} confidence` : "Confidence pending"}</span><span>{activeCreator.current_signal.source.toUpperCase()}</span></footer></> : <p className="creator-profile-empty">The next signal appears only after a publication has enough age-matched evidence to score.</p>}</section>
                  <section className="creator-profile-block creator-network-block"><div className="creator-profile-section-heading"><div><p className="modal-eyebrow">OBSERVED NETWORK</p><h3>Who this creator interacts with</h3></div><span>{activeCreatorRelationships.length} resolved</span></div>{activeCreatorRelationships.length ? <div className="creator-network-list">{activeCreatorRelationships.map((relationship) => <article key={relationship.creator.id}><span className="creator-network-monogram">{relationship.creator.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}</span><div className="creator-network-copy"><div><strong>{relationship.creator.name}</strong><small>{relationship.creator.username ? `@${relationship.creator.username}` : relationship.creator.kind} · {relationship.creator.priority ?? "observed"}</small></div><p>{relationship.evidence_basis.join(" · ")}</p><div className="creator-network-chips">{Object.entries(relationship.outbound).map(([kind, count]) => <span className="outbound" key={`out:${kind}`}>{interactionLabel(kind, count, "sent")}</span>)}{Object.entries(relationship.inbound).map(([kind, count]) => <span className="inbound" key={`in:${kind}`}>{interactionLabel(kind, count, "received")}</span>)}{relationship.shared_stories > 0 && <span>{relationship.shared_stories} shared {relationship.shared_stories === 1 ? "story" : "stories"}</span>}</div>{relationship.latest_evidence ? <a href={relationship.latest_evidence.source_url ?? undefined} onClick={(event) => { if (!relationship.latest_evidence?.source_url) event.preventDefault(); }} target={relationship.latest_evidence.source_url ? "_blank" : undefined} rel={relationship.latest_evidence.source_url ? "noreferrer" : undefined}><span>{relationship.latest_evidence.direction === "outbound" ? "Latest sent" : "Latest received"} · {readableKey(relationship.latest_evidence.relationship)}</span><strong>{relationship.latest_evidence.title}</strong><small>{observedDateLabel(relationship.latest_evidence.observed_at)} {relationship.latest_evidence.source_url ? "↗" : "· observed"}</small></a> : relationship.latest_shared_story && <div className="creator-network-story"><span>Shared narrative · {relationship.latest_shared_story.state}</span><strong>{relationship.latest_shared_story.title}</strong></div>}</div></article>)}</div> : <p className="creator-profile-empty">No resolved reply, quote, repost, mention, or shared-story relationship is observable in the current 30-day window.</p>}<footer className="creator-network-note">Direct links require a resolved target and at least 80% reference confidence. Shared-story co-appearance is context—not proof of collaboration or endorsement.</footer></section>
                  <section className="creator-profile-block"><div className="creator-profile-section-heading"><div><p className="modal-eyebrow">SOURCE CADENCE</p><h3>Posting rhythm by provider</h3></div><span>{activeCreator.activity.sources.length} sources</span></div>{activeCreator.activity.sources.length ? <div className="creator-cadence-list">{activeCreator.activity.sources.map((source) => <div key={source.source}><i className={`mini-source ${source.source === "x" ? "x-source" : source.source}`}>{sourceMark(source.source)}</i><p><strong>{source.source.replace("_", " ")}</strong><small>Last {observedDateLabel(source.last_activity_at)}</small></p><span><b>{source.items_7d}</b>7d</span><span><b>{source.items_30d}</b>30d</span><span><b>{cadenceLabel(source.median_interval_hours, source.cadence_sample_size)}</b>{source.cadence_sample_size} intervals</span></div>)}</div> : <p className="creator-profile-empty">Source cadence is still learning from resolved publications.</p>}</section>
                  <section className="creator-profile-block"><div className="creator-profile-section-heading"><div><p className="modal-eyebrow">AGE-HORIZON BASELINES</p><h3>Normal performance at comparable ages</h3></div><span>{activeCreator.performance_baselines.length} cohorts</span></div>{activeCreator.performance_baselines.length ? <div className="creator-baseline-list"><div className="creator-baseline-head"><span>Source</span><span>Age</span><span>Metric</span><span>Median</span><span>Evidence</span></div>{activeCreator.performance_baselines.map((baseline) => <div key={`${baseline.source}:${baseline.target_age_seconds}:${baseline.metric}`}><strong>{baseline.source.replace("_", " ")}</strong><span>{horizonLabel(baseline.target_age_seconds)}</span><span>{readableKey(baseline.metric)}</span><b>{baseline.median ?? "—"}</b><small className={baseline.status}>{baseline.status} · {baseline.sample_size} samples</small></div>)}</div> : <p className="creator-profile-empty">Baselines remain blank until exact-horizon snapshots produce a defensible cohort.</p>}</section>
                  <section className="creator-profile-block"><div className="creator-profile-section-heading"><div><p className="modal-eyebrow">RECENT EVIDENCE</p><h3>Observed publications</h3></div><span>{activeCreator.recent_items.length} shown</span></div>{activeCreator.recent_items.length ? <div className="creator-evidence-list">{activeCreator.recent_items.map((item) => <a href={item.source_url ?? undefined} onClick={(event) => { if (!item.source_url) event.preventDefault(); }} target={item.source_url ? "_blank" : undefined} rel={item.source_url ? "noreferrer" : undefined} key={item.id}><i className={`mini-source ${item.source === "x" ? "x-source" : item.source}`}>{sourceMark(item.source)}</i><p><strong>{item.title}</strong><small>{item.source.replace("_", " ")} · {observedDateLabel(item.published_at ?? item.first_seen_at)}</small></p><span>{item.source_url ? "Open ↗" : "Observed"}</span></a>)}</div> : <p className="creator-profile-empty">No recent source evidence is attached to this identity yet.</p>}</section>
                </div>
                <aside className="creator-profile-aside">
                  <section><p className="modal-eyebrow">LAST CREATOR ALERT</p>{activeCreator.last_alert ? <><span className={`creator-alert-state ${activeCreator.last_alert.acted ? "acted" : ""}`}>{activeCreator.last_alert.acted ? "Acted" : activeCreator.last_alert.state}</span><h3>{activeCreator.last_alert.title ?? readableKey(activeCreator.last_alert.kind)}</h3><p>{observedDateLabel(activeCreator.last_alert.created_at)}</p><div>{activeCreator.last_alert.outcomes.length ? activeCreator.last_alert.outcomes.map((outcome) => <span key={outcome}>{readableKey(outcome)}</span>) : <span>No outcome recorded</span>}</div>{activeCreator.last_alert.source_url && <a href={activeCreator.last_alert.source_url} target="_blank" rel="noreferrer">Open alert source ↗</a>}</> : <div className="creator-aside-empty"><span>✓</span><h3>No creator alert yet</h3><p>Alerts appear only after a real publication or evidence-backed milestone.</p></div>}</section>
                  <section><p className="modal-eyebrow">HOW TO READ THIS</p><h3>Comparable evidence only</h3><p>Cadence is separated by provider. Performance baselines compare the same metric at the same post age, and remain marked limited until enough observations exist.</p><small>Raw views, likes, replies, and other metrics are never compared across platforms.</small></section>
                  <section><p className="modal-eyebrow">ACTIVE WATCHLISTS</p><div className="creator-watchlist-list">{activeCreator.watchlists.filter((watch) => watch.enabled).length ? activeCreator.watchlists.filter((watch) => watch.enabled).map((watch) => <span key={watch.id}><b>{watch.priority_tier}</b>{watch.name}</span>) : <p>No active watchlist membership.</p>}</div></section>
                </aside>
              </div>
            </div>}
            {panel === "creator" && !activeCreator && <div className="creator-profile-missing"><span>◎</span><h2>Creator profile unavailable</h2><p>The identity may have been removed during a live refresh. Close this panel and choose another creator.</p></div>}
            {panel === "story" && <div className="story-panel"><p className="modal-eyebrow">STORY · {activeStory.state.toUpperCase()} · {activeStory.factual_status.toUpperCase()}</p><h2>{activeStory.label}</h2><p className="verified-summary">{activeStory.summary ?? `This narrative currently contains ${activeStory.member_count} evidence items from ${activeStory.source_count} sources. Facts remain labelled ${activeStory.factual_status} until stronger confirmation arrives.`}</p><div className="story-score-strip">{storyScores.map(([label, value, tone]) => <div key={label}><span>{label}</span><strong className={tone}>{value || "—"}</strong></div>)}</div>{(activeStory.score_drivers?.length || storyDetail?.score_components?.drivers?.length) && <div className="score-evidence"><span>WHY THE SCORE MOVED</span><div>{(storyDetail?.score_components?.drivers ?? activeStory.score_drivers ?? []).slice(0, 3).map((driver) => <p key={driver}><i>✦</i>{driver}</p>)}</div><small>{activeStory.score_as_of ? `Scored ${new Date(activeStory.score_as_of).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Versioned evidence · replayable"}</small></div>}<div className="evidence-grid"><div><h3>Propagation timeline</h3><ol>{storyDetail?.timeline?.length ? storyDetail.timeline.slice(0, 6).map((item) => <li key={item.content_item_id}><time>{item.published_at ? new Date(item.published_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Observed"}</time><span><b>{item.text?.split("\n")[0]?.slice(0, 92) || `${item.source} evidence detected`}</b><small>{item.source === "hacker_news" ? "Hacker News" : item.source.toUpperCase()} · {item.relation} · {Math.round(Number(item.assignment_confidence) * 100)}% assignment confidence</small></span></li>) : <><li><time>First</time><span><b>Earliest evidence detected</b><small>{activeStory.sources[0] ?? "Source pending"} · origin</small></span></li><li><time>Now</time><span><b>{activeStory.member_count} evidence items reconstructed</b><small>{activeStory.source_count} independent sources · {activeStory.state}</small></span></li></>}</ol></div><aside><h3>Evidence status</h3><p>{activeStory.factual_status === "confirmed" ? "Independent evidence confirms the central claim." : `The central claim is ${activeStory.factual_status}. Treat it as developing context, not settled fact.`}</p><button type="button" onClick={() => setPanel("studio")}>Draft a grounded angle <span>✦</span></button></aside></div>
              {operatorSession.authenticated && storyDetail && <section className="story-graph-controls"><div><p className="modal-eyebrow">OWNER · STORY GRAPH</p><h3>Correct this narrative safely</h3><p>Select evidence to split, or merge another story into this canonical story. Every mutation requires a reason and remains reversible until affected evidence changes.</p></div><label>Reason for the change<textarea value={storyMutationReason} onChange={(event) => setStoryMutationReason(event.target.value)} maxLength={2000} placeholder="What evidence justifies this correction?" /></label><div className="story-split-picker"><strong>Split selected evidence</strong>{storyDetail.timeline.map((item) => <label key={item.content_item_id}><input type="checkbox" checked={storySplitItems.includes(item.content_item_id)} onChange={(event) => setStorySplitItems((current) => event.target.checked ? [...current, item.content_item_id] : current.filter((id) => id !== item.content_item_id))} /><span>{item.text?.split("\n")[0]?.slice(0, 76) || `${item.source} evidence`}</span><small>{item.source}</small></label>)}<div><input value={storySplitTitle} onChange={(event) => setStorySplitTitle(event.target.value)} maxLength={280} placeholder="Title for the new story" /><button type="button" disabled={storyMutationState === "saving" || !storySplitTitle.trim() || storySplitItems.length === 0 || storySplitItems.length >= storyDetail.timeline.length} onClick={() => void runStoryMutation({ id: activeStory.id, action: "split", content_item_ids: storySplitItems, new_title: storySplitTitle.trim() })}>Split evidence</button></div></div><div className="story-merge-control"><strong>Merge a duplicate into this story</strong><div><input value={storyMergeSource} onChange={(event) => setStoryMergeSource(event.target.value)} placeholder="Source story UUID" /><button type="button" disabled={storyMutationState === "saving" || !storyMergeSource.trim()} onClick={() => void runStoryMutation({ id: activeStory.id, action: "merge", source_story_ids: [storyMergeSource.trim()], confidence: 1 })}>Merge story</button></div></div>{storyMutationMessage && <p className={`story-mutation-message ${storyMutationState}`}>{storyMutationMessage}</p>}<div className="story-operation-history"><strong>Operation history</strong>{storyDetail.operations?.length ? storyDetail.operations.map((operation) => <article key={operation.id}><span>{operation.operation}</span><p><b>{operation.reason}</b><small>{operation.actor_id} · {new Date(operation.created_at).toLocaleString()} · {operation.state}</small></p>{operation.reversible && <button type="button" disabled={storyMutationState === "saving"} onClick={() => void runStoryMutation({ id: operation.id, action: "revert" })}>Undo</button>}</article>) : <p>No human story-graph mutation has been recorded.</p>}</div></section>}
            </div>}
            {panel === "studio" && <div className="studio-panel"><p className="modal-eyebrow">CONTENT STUDIO · GROUNDED</p><h2>Turn the signal into an original angle</h2><div className="studio-tabs">{([ ["x_post", "X post"], ["thread", "Thread"], ["youtube_video", "YouTube"] ] as const).map(([format, label]) => <button className={studioFormat === format ? "active" : ""} type="button" onClick={() => selectStudioFormat(format)} key={format}>{label}</button>)}</div><div className={`draft-card ${currentIdea?.is_stale ? "stale" : ""}`}><span>{currentIdea?.is_stale ? "EVIDENCE CHANGED · REGENERATE" : currentIdea ? "SAVED AGAINST CURRENT EVIDENCE" : "REPRESENTATIVE ANGLE"}</span><p>{studioDraft}</p><footer><span>Grounded in {studioEvidenceSources} evidence items</span><button type="button" onClick={() => void copyDraft(studioDraft, currentIdea?.id)}>{copied ? "Copied" : "Copy draft"}</button></footer></div><button className="modal-primary" type="button" onClick={() => void generateStudioDraft()} disabled={studioState === "loading"}>{studioState === "loading" ? "Grounding…" : currentIdea?.is_stale ? "Regenerate from current evidence" : "Generate and save draft"}</button>{studioMessage && <p className={`studio-message ${studioState}`} role="status">{studioMessage}</p>}<div className="claim-check"><span>✓</span><p><b>Claims separated</b><small>The central claim remains labelled {activeStory.factual_status}; every generated draft requires review and is never auto-posted.</small></p></div></div>}
          </section>
        </div>}
      </main>
    </div>
  );
}
