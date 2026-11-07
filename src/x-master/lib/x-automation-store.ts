import {
  DEFAULT_AUTOMATION_POLICY,
  buildActionDecision,
  parseAutomationPolicy,
  type ActionDecision,
  type AutomationPolicy,
  type GrowthOpportunity,
  type GrowthSignal,
} from "./x-growth-copilot.ts";
import { DEFAULT_BRAND_PROFILE, parseBrandProfile, type BrandProfile, type GeneratedArtifact } from "./x-content-engine.ts";

export type QueueState = "review" | "scheduled" | "skipped" | "approved" | "publishing" | "published" | "rejected" | "failed";
export type QueueCandidate = { signal: GrowthSignal; opportunity: GrowthOpportunity; author_handle: string | null };
export type AutomationQueueItem = {
  id: string;
  signal_id: string;
  source_url: string;
  source_text: string;
  author_handle: string | null;
  decision: ActionDecision;
  artifact: GeneratedArtifact | null;
  state: QueueState;
  due_at: string | null;
  expires_at: string;
  published_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type D1StatementLike = {
  bind(...values: unknown[]): D1StatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};
export type D1DatabaseLike = { prepare(query: string): D1StatementLike; batch(statements: D1StatementLike[]): Promise<Array<{ results?: unknown[]; meta?: { changes?: number } }>> };

const CREATE_SETTINGS = `CREATE TABLE IF NOT EXISTS x_growth_settings (
  owner_id TEXT PRIMARY KEY NOT NULL,
  profile_json TEXT NOT NULL,
  policy_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;
const CREATE_QUEUE = `CREATE TABLE IF NOT EXISTS x_growth_queue (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_text TEXT NOT NULL,
  author_handle TEXT,
  decision_json TEXT NOT NULL,
  artifact_json TEXT,
  state TEXT NOT NULL,
  due_at INTEGER,
  expires_at INTEGER NOT NULL,
  published_url TEXT,
  error TEXT,
  claim_token TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, id)
)`;
const CREATE_STATE_INDEX = "CREATE INDEX IF NOT EXISTS idx_x_growth_queue_owner_state_due ON x_growth_queue (owner_id, state, due_at)";
const CREATE_PUBLISHED_INDEX = "CREATE INDEX IF NOT EXISTS idx_x_growth_queue_owner_published ON x_growth_queue (owner_id, updated_at) WHERE state = 'published'";

function finiteNumber(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
}

function cleanText(value: unknown, maximum: number, minimum = 1) {
  if (typeof value !== "string") return null;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length >= minimum && clean.length <= maximum ? clean : null;
}

function xPostUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname) || url.username || url.password || url.hash) return null;
    return /^\/[A-Za-z0-9_]{1,15}\/status\/\d{1,19}\/?$/.test(url.pathname) ? url.toString() : null;
  } catch { return null; }
}

export function parseQueueCandidate(value: unknown): QueueCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as { signal?: unknown; opportunity?: unknown };
  if (!raw.signal || typeof raw.signal !== "object" || Array.isArray(raw.signal) || !raw.opportunity || typeof raw.opportunity !== "object" || Array.isArray(raw.opportunity)) return null;
  const source = raw.signal as Record<string, unknown>;
  const offered = raw.opportunity as Record<string, unknown>;
  const id = cleanText(source.id, 200);
  const sourceUrl = xPostUrl(source.source_url ?? source.url);
  const body = cleanText(source.body ?? source.title, 2_000);
  const opportunityId = cleanText(offered.id, 260);
  const expiresAt = typeof offered.expires_at === "string" && Number.isFinite(Date.parse(offered.expires_at)) ? new Date(offered.expires_at).toISOString() : null;
  const action = offered.action;
  const opportunityScore = finiteNumber(offered.opportunity_score, 0, 100);
  const replyScore = finiteNumber(offered.reply_score, 0, 100);
  const riskScore = finiteNumber(offered.risk_score, 0, 100);
  const relevanceScore = finiteNumber(offered.relevance_score, 0, 100);
  const whyNow = cleanText(offered.why_now, 500);
  const whyYou = cleanText(offered.why_you, 500);
  if (!id || source.source !== "x" || !sourceUrl || !body || !opportunityId || offered.signal_id !== id || offered.source_url !== sourceUrl || !["reply_now", "quote", "repost", "watch", "skip"].includes(String(action)) || typeof offered.visible !== "boolean" || opportunityScore === null || replyScore === null || riskScore === null || relevanceScore === null || !expiresAt || !whyNow || !whyYou) return null;
  const creator = source.creator && typeof source.creator === "object" && !Array.isArray(source.creator) ? source.creator as Record<string, unknown> : {};
  const pathHandle = new URL(sourceUrl).pathname.split("/")[1];
  const suppliedHandle = typeof creator.username === "string" ? creator.username.replace(/^@/, "") : pathHandle;
  const authorHandle = /^[A-Za-z0-9_]{1,15}$/.test(suppliedHandle) && suppliedHandle.toLowerCase() === pathHandle.toLowerCase() ? `@${suppliedHandle}` : `@${pathHandle}`;
  const filterReasons = Array.isArray(offered.filter_reasons) ? offered.filter_reasons.map((item) => cleanText(item, 300)).filter((item): item is string => Boolean(item)).slice(0, 12) : [];
  const publishedAt = typeof source.published_at === "string" && Number.isFinite(Date.parse(source.published_at)) ? new Date(source.published_at).toISOString() : undefined;
  const signal: GrowthSignal = {
    id,
    title: body,
    body,
    source: "x",
    source_url: sourceUrl,
    ...(publishedAt ? { published_at: publishedAt } : {}),
    creator: { username: authorHandle, ...(typeof creator.name === "string" ? { name: creator.name.slice(0, 100) } : {}) },
    is_big_launch: source.is_big_launch === true,
    personalized: source.personalized === true,
  };
  const opportunity: GrowthOpportunity = {
    id: opportunityId,
    signal_id: id,
    source_url: sourceUrl,
    action: action as GrowthOpportunity["action"],
    recommended_action: action as GrowthOpportunity["action"],
    visible: offered.visible,
    opportunity_score: opportunityScore,
    reply_score: replyScore,
    risk_score: riskScore,
    relevance_score: relevanceScore,
    expires_at: expiresAt,
    why_now: whyNow,
    why_you: whyYou,
    filter_reasons: filterReasons,
  };
  return { signal, opportunity, author_handle: authorHandle };
}

export function directPublishGuard(input: {
  decision: ActionDecision;
  state: QueueState;
  has_artifact: boolean;
  daily_count: number;
  hourly_count: number;
  author_daily_count: number;
}, policy: AutomationPolicy, now = new Date()): { allowed: boolean; reason: string } {
  if (input.state === "scheduled" && !policy.autopilot_enabled) return { allowed: false, reason: "Autopilot is not enabled for this scheduled action." };
  if (input.state !== "approved" && input.state !== "scheduled") return { allowed: false, reason: "The action must be explicitly approved first." };
  if (input.decision.action === "reply" || input.decision.action === "quote") return { allowed: false, reason: "Replies and quotes use the manual review composer." };
  if (input.decision.action !== "original" && input.decision.action !== "repost") return { allowed: false, reason: "This action cannot be published." };
  if (Date.parse(input.decision.expires_at) <= now.getTime()) return { allowed: false, reason: "The opportunity window expired." };
  if (input.decision.action === "original" && !input.has_artifact) return { allowed: false, reason: "Generate and review grounded content first." };
  if (input.daily_count >= policy.daily_cap) return { allowed: false, reason: "Daily cap reached." };
  if (input.hourly_count >= policy.hourly_cap) return { allowed: false, reason: "Hourly cap reached." };
  if (input.author_daily_count >= policy.per_author_daily_cap) return { allowed: false, reason: "Per-author daily cap reached." };
  return { allowed: true, reason: "Approved and within publishing limits." };
}

export async function initializeAutomationStore(database: D1DatabaseLike) {
  await database.batch([
    database.prepare(CREATE_SETTINGS),
    database.prepare(CREATE_QUEUE),
    database.prepare(CREATE_STATE_INDEX),
    database.prepare(CREATE_PUBLISHED_INDEX),
  ]);
}

type SettingsRow = { profile_json: string; policy_json: string };
type QueueRow = {
  id: string; signal_id: string; source_url: string; source_text: string; author_handle: string | null;
  decision_json: string; artifact_json: string | null; state: QueueState; due_at: number | null; expires_at: number;
  published_url: string | null; error: string | null; created_at: number; updated_at: number;
};

function safeJson(value: string | null): unknown {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function rowToQueueItem(row: QueueRow): AutomationQueueItem | null {
  const decision = safeJson(row.decision_json) as ActionDecision | null;
  if (!decision || typeof decision !== "object" || decision.id !== row.id || !["reply", "quote", "repost", "original", "ignore"].includes(decision.action)) return null;
  return {
    id: row.id,
    signal_id: row.signal_id,
    source_url: row.source_url,
    source_text: row.source_text,
    author_handle: row.author_handle,
    decision,
    artifact: safeJson(row.artifact_json) as GeneratedArtifact | null,
    state: row.state,
    due_at: row.due_at ? new Date(row.due_at * 1_000).toISOString() : null,
    expires_at: new Date(row.expires_at * 1_000).toISOString(),
    published_url: row.published_url,
    error: row.error,
    created_at: new Date(row.created_at * 1_000).toISOString(),
    updated_at: new Date(row.updated_at * 1_000).toISOString(),
  };
}

export async function getAutomationSettings(database: D1DatabaseLike, ownerId: string): Promise<{ profile: BrandProfile; policy: AutomationPolicy }> {
  const row = await database.prepare("SELECT profile_json, policy_json FROM x_growth_settings WHERE owner_id = ?1").bind(ownerId).first<SettingsRow>();
  return {
    profile: parseBrandProfile(safeJson(row?.profile_json ?? null)) ?? DEFAULT_BRAND_PROFILE,
    policy: parseAutomationPolicy(safeJson(row?.policy_json ?? null)) ?? DEFAULT_AUTOMATION_POLICY,
  };
}

export async function saveAutomationSettings(database: D1DatabaseLike, ownerId: string, profile: BrandProfile, policy: AutomationPolicy) {
  const now = Math.floor(Date.now() / 1_000);
  await database.prepare(`INSERT INTO x_growth_settings (owner_id, profile_json, policy_json, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?4)
    ON CONFLICT(owner_id) DO UPDATE SET profile_json = excluded.profile_json, policy_json = excluded.policy_json, updated_at = excluded.updated_at`)
    .bind(ownerId, JSON.stringify(profile), JSON.stringify(policy), now).run();
}

export async function listAutomationQueue(database: D1DatabaseLike, ownerId: string, limit = 30): Promise<AutomationQueueItem[]> {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const rows = await database.prepare(`SELECT id, signal_id, source_url, source_text, author_handle, decision_json, artifact_json, state, due_at, expires_at, published_url, error, created_at, updated_at
    FROM x_growth_queue WHERE owner_id = ?1 ORDER BY CASE state WHEN 'approved' THEN 0 WHEN 'review' THEN 1 WHEN 'scheduled' THEN 2 ELSE 3 END, due_at ASC, created_at DESC LIMIT ?2`)
    .bind(ownerId, boundedLimit).all<QueueRow>();
  return (rows.results ?? []).map(rowToQueueItem).filter((item): item is AutomationQueueItem => Boolean(item));
}

export async function getAutomationQueueItem(database: D1DatabaseLike, ownerId: string, id: string) {
  const row = await database.prepare(`SELECT id, signal_id, source_url, source_text, author_handle, decision_json, artifact_json, state, due_at, expires_at, published_url, error, created_at, updated_at
    FROM x_growth_queue WHERE owner_id = ?1 AND id = ?2`).bind(ownerId, id).first<QueueRow>();
  return row ? rowToQueueItem(row) : null;
}

export async function syncAutomationQueue(database: D1DatabaseLike, ownerId: string, values: unknown[], policy: AutomationPolicy, now = new Date()) {
  const candidates = values.slice(0, 25).map(parseQueueCandidate).filter((item): item is QueueCandidate => Boolean(item));
  const timestamp = Math.floor(now.getTime() / 1_000);
  const statements = candidates.map((candidate) => {
    const decision = buildActionDecision(candidate.signal, candidate.opportunity, policy, now);
    return database.prepare(`INSERT INTO x_growth_queue (owner_id, id, signal_id, source_url, source_text, author_handle, decision_json, state, due_at, expires_at, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
      ON CONFLICT(owner_id, id) DO UPDATE SET source_text = excluded.source_text, author_handle = excluded.author_handle, decision_json = excluded.decision_json, due_at = excluded.due_at, expires_at = excluded.expires_at, updated_at = excluded.updated_at
      WHERE x_growth_queue.state IN ('review', 'scheduled', 'skipped')`)
      .bind(ownerId, decision.id, candidate.signal.id, decision.source_url, candidate.signal.body ?? candidate.signal.title ?? "", candidate.author_handle, JSON.stringify(decision), decision.state, decision.due_at ? Math.floor(Date.parse(decision.due_at) / 1_000) : null, Math.floor(Date.parse(decision.expires_at) / 1_000), timestamp);
  });
  if (statements.length) await database.batch(statements);
  return listAutomationQueue(database, ownerId);
}

export async function setAutomationArtifact(database: D1DatabaseLike, ownerId: string, id: string, artifact: GeneratedArtifact) {
  const now = Math.floor(Date.now() / 1_000);
  await database.prepare("UPDATE x_growth_queue SET artifact_json = ?3, error = NULL, updated_at = ?4 WHERE owner_id = ?1 AND id = ?2 AND state IN ('review', 'scheduled', 'approved', 'failed')")
    .bind(ownerId, id, JSON.stringify(artifact), now).run();
  return getAutomationQueueItem(database, ownerId, id);
}

export async function setAutomationQueueState(database: D1DatabaseLike, ownerId: string, id: string, state: "approved" | "rejected" | "review") {
  const allowedFrom = state === "approved" ? "('review', 'scheduled', 'failed')" : state === "rejected" ? "('review', 'scheduled', 'approved', 'failed')" : "('rejected', 'failed')";
  await database.prepare(`UPDATE x_growth_queue SET state = ?3, error = NULL, updated_at = ?4 WHERE owner_id = ?1 AND id = ?2 AND state IN ${allowedFrom}`)
    .bind(ownerId, id, state, Math.floor(Date.now() / 1_000)).run();
  return getAutomationQueueItem(database, ownerId, id);
}

export async function publishCounts(database: D1DatabaseLike, ownerId: string, authorHandle: string | null, now = new Date()) {
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  const dayStart = nowSeconds - 24 * 60 * 60;
  const hourStart = nowSeconds - 60 * 60;
  const rows = await database.prepare(`SELECT
    SUM(CASE WHEN updated_at >= ?2 THEN 1 ELSE 0 END) AS daily_count,
    SUM(CASE WHEN updated_at >= ?3 THEN 1 ELSE 0 END) AS hourly_count,
    SUM(CASE WHEN updated_at >= ?2 AND author_handle = ?4 THEN 1 ELSE 0 END) AS author_daily_count
    FROM x_growth_queue WHERE owner_id = ?1 AND state = 'published'`).bind(ownerId, dayStart, hourStart, authorHandle).first<{ daily_count: number | null; hourly_count: number | null; author_daily_count: number | null }>();
  return { daily_count: rows?.daily_count ?? 0, hourly_count: rows?.hourly_count ?? 0, author_daily_count: rows?.author_daily_count ?? 0 };
}

export async function claimAutomationPublish(database: D1DatabaseLike, ownerId: string, id: string, claimToken: string, fromState: "approved" | "scheduled" = "approved") {
  const result = await database.prepare("UPDATE x_growth_queue SET state = 'publishing', claim_token = ?3, error = NULL, updated_at = ?4 WHERE owner_id = ?1 AND id = ?2 AND state = ?5")
    .bind(ownerId, id, claimToken, Math.floor(Date.now() / 1_000), fromState).run();
  return (result.meta?.changes ?? 0) === 1;
}

export async function listDueAutomationQueue(database: D1DatabaseLike, now = new Date(), limit = 10) {
  const rows = await database.prepare(`SELECT owner_id, id FROM x_growth_queue
    WHERE state = 'scheduled' AND due_at IS NOT NULL AND due_at <= ?1 AND expires_at > ?1
    ORDER BY due_at ASC LIMIT ?2`).bind(Math.floor(now.getTime() / 1_000), Math.max(1, Math.min(25, Math.floor(limit)))).all<{ owner_id: string; id: string }>();
  return rows.results ?? [];
}

export async function finishAutomationPublish(database: D1DatabaseLike, ownerId: string, id: string, claimToken: string, publishedUrl: string | null, error: string | null) {
  await database.prepare("UPDATE x_growth_queue SET state = ?4, published_url = ?5, error = ?6, claim_token = NULL, updated_at = ?7 WHERE owner_id = ?1 AND id = ?2 AND claim_token = ?3 AND state = 'publishing'")
    .bind(ownerId, id, claimToken, error ? "failed" : "published", publishedUrl, error?.slice(0, 300) ?? null, Math.floor(Date.now() / 1_000)).run();
}
