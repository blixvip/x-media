import { nodeRuntime } from "@/x-master/lib/node-runtime";
import type { D1DatabaseLike as D1Database } from './x-automation-store';
import {
  canonicalPublicEvidenceUrl,
  stablePublicEvidenceHash,
} from "./public-evidence-links.ts";

const RETENTION_DAYS = 30;
const OBSERVATION_WINDOW_SECONDS = 15 * 60;
const MAX_ARCHIVE_ITEMS = 48;
const MAX_EXACT_LINK_GROUPS = 12;
const MAX_EXACT_LINK_MEMBERS = 8;
const MAX_LINK_BACKFILL_ITEMS = 96;
const MAX_TITLE_LENGTH = 500;
const MAX_LABEL_LENGTH = 160;
const MAX_EXTERNAL_ID_LENGTH = 512;
const MAX_URL_LENGTH = 2_048;
const MAX_RELATED_URLS = 4;
const MAX_PUBLIC_METRIC = 1_000_000_000_000;
const MIN_SEARCH_QUERY_CHARACTERS = 2;
const MAX_SEARCH_QUERY_CHARACTERS = 80;
const MAX_SEARCH_RESULTS = 12;
const MAX_RETURN_BRIEF_RESULTS = 8;
const MAX_RETURN_BRIEF_RESULTS_PER_SOURCE = 3;
const PUBLIC_METRIC_NAMES = [
  "points",
  "comments",
  "downloads",
  "stars",
  "forks",
  "watchers",
  "open_issues",
  "likes",
  "replies",
  "reposts",
  "quotes",
] as const;

export type PublicMetricName = typeof PUBLIC_METRIC_NAMES[number];
export type PublicMetricSnapshot = Partial<Record<PublicMetricName, number>>;

export type PublicEvidenceMetricMovement = {
  first_value: number;
  latest_value: number;
  delta: number;
  observation_windows: number;
  first_observed_at: string;
  last_observed_at: string;
};

export type PublicEvidenceMetricHistory = {
  evidence: "request_observed_provider_snapshots";
  metrics: Partial<Record<PublicMetricName, PublicEvidenceMetricMovement>>;
};

export type PublicEvidenceHistoryInput = {
  id: string;
  title: string;
  topic: string;
  niche: string;
  source: string;
  source_url: string;
  related_urls?: string[];
  age_seconds: number;
  creator?: { username?: string | null };
  observed_metrics?: PublicMetricSnapshot;
  metric_evidence?: "single_provider_snapshot";
};

export type PublicEvidenceHistoryItem = {
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
  metric_history?: PublicEvidenceMetricHistory;
};

export type PublicEvidenceHistoryExactLinkMember = {
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

export type PublicEvidenceHistoryExactLinkGroup = {
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

export type PublicEvidenceHistory = {
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

export type PublicEvidenceHistorySearchItem = Omit<PublicEvidenceHistoryItem, "current" | "metric_history"> & {
  matched_on: "title" | "creator identity" | "source" | "niche" | "topic";
  match_score: number;
};

export type PublicEvidenceHistorySearch = {
  status: "available" | "unavailable";
  mode: "request_observed_search";
  query: string;
  search_version: "public-request-observed-archive-v1";
  retention_days: number;
  generated_at: string;
  result_count: number;
  truncated: boolean;
  items: PublicEvidenceHistorySearchItem[];
  reason?: string;
};

export type PublicEvidenceReturnBriefItem = Omit<PublicEvidenceHistoryItem, "current" | "metric_history">;

export type PublicEvidenceReturnBrief = {
  status: "available" | "unavailable";
  mode: "request_observed_return_brief";
  brief_version: "public-request-observed-return-brief-v1";
  since: string;
  generated_at: string;
  retention_days: number;
  result_count: number;
  source_count: number;
  truncated: boolean;
  items: PublicEvidenceReturnBriefItem[];
  reason?: string;
};

type HistoryRow = {
  item_key: string;
  external_id: string;
  title: string;
  topic: string;
  niche: string;
  source: string;
  source_url: string;
  related_urls: string;
  creator_username: string | null;
  published_at: number;
  first_observed_at: number;
  last_observed_at: number;
  observation_windows: number;
};

type MetricHistoryRow = {
  item_key: string;
  metric_name: string;
  first_value: number;
  latest_value: number;
  observation_windows: number;
  first_observed_at: number;
  last_observed_at: number;
};

type HistorySummaryRow = {
  stored_item_count: number;
  coverage_started_at: number | null;
  last_captured_at: number | null;
};

type ExactLinkGroupRow = {
  canonical_url: string;
  source_count: number;
  item_count: number;
  earliest_published_at: number;
  latest_published_at: number;
  first_observed_at: number;
  last_observed_at: number;
};

type ExactLinkMemberRow = {
  item_key: string;
  title: string;
  topic: string;
  niche: string;
  source: string;
  source_url: string;
  matched_url: string;
  match_kind: "source_url" | "related_url";
  creator_username: string | null;
  published_at: number;
  first_observed_at: number;
  last_observed_at: number;
};

type LinkBackfillRow = {
  item_key: string;
  source_url: string;
  related_urls: string;
};

type SearchRow = HistoryRow & {
  match_score: number;
  matched_count: number;
};

type ReturnBriefRow = HistoryRow & {
  source_rank: number;
  matched_count: number;
  source_count: number;
};

let databasePromise: Promise<D1Database | null> | undefined;
let schemaPromise: Promise<void> | undefined;

const createItemsTableSql = `
  CREATE TABLE IF NOT EXISTS public_evidence_items (
    item_key TEXT PRIMARY KEY NOT NULL,
    external_id TEXT NOT NULL,
    title TEXT NOT NULL,
    topic TEXT NOT NULL,
    niche TEXT NOT NULL,
    source TEXT NOT NULL,
    source_url TEXT NOT NULL,
    related_urls TEXT NOT NULL DEFAULT '[]',
    creator_username TEXT,
    published_at INTEGER NOT NULL,
    first_observed_at INTEGER NOT NULL,
    last_observed_at INTEGER NOT NULL
  )
`;

const createObservationsTableSql = `
  CREATE TABLE IF NOT EXISTS public_evidence_observations (
    item_key TEXT NOT NULL,
    observed_bucket INTEGER NOT NULL,
    observed_at INTEGER NOT NULL,
    observed_metrics TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (item_key, observed_bucket),
    FOREIGN KEY (item_key) REFERENCES public_evidence_items(item_key) ON DELETE CASCADE
  )
`;

const createLinksTableSql = `
  CREATE TABLE IF NOT EXISTS public_evidence_links (
    canonical_url TEXT NOT NULL,
    item_key TEXT NOT NULL,
    matched_url TEXT NOT NULL,
    match_kind TEXT NOT NULL CHECK (match_kind IN ('source_url', 'related_url')),
    PRIMARY KEY (canonical_url, item_key),
    FOREIGN KEY (item_key) REFERENCES public_evidence_items(item_key) ON DELETE CASCADE
  )
`;

const createLastObservedIndexSql = `
  CREATE INDEX IF NOT EXISTS idx_public_evidence_items_last_observed
  ON public_evidence_items (last_observed_at)
`;

const createObservationTimeIndexSql = `
  CREATE INDEX IF NOT EXISTS idx_public_evidence_observations_time
  ON public_evidence_observations (observed_at)
`;

const createObservationItemTimeIndexSql = `
  CREATE INDEX IF NOT EXISTS idx_public_evidence_observations_item_time
  ON public_evidence_observations (item_key, observed_at)
`;

const createLinkItemIndexSql = `
  CREATE INDEX IF NOT EXISTS idx_public_evidence_links_item
  ON public_evidence_links (item_key)
`;

function isD1Database(value: unknown): value is D1Database {
  return Boolean(
    value
    && typeof value === "object"
    && typeof (value as { prepare?: unknown }).prepare === "function"
    && typeof (value as { batch?: unknown }).batch === "function",
  );
}

function boundedText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function safeHttpsUrl(value: unknown) {
  const text = boundedText(value, MAX_URL_LENGTH);
  if (!text) return null;
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function safeMetricSnapshot(item: PublicEvidenceHistoryInput): PublicMetricSnapshot {
  if (item.metric_evidence !== "single_provider_snapshot" || !item.observed_metrics) return {};
  return Object.fromEntries(PUBLIC_METRIC_NAMES.flatMap((name) => {
    const value = item.observed_metrics?.[name];
    return typeof value === "number"
      && Number.isSafeInteger(value)
      && value >= 0
      && value <= MAX_PUBLIC_METRIC
      ? [[name, value]]
      : [];
  })) as PublicMetricSnapshot;
}

function evidenceLinkAnchors(sourceUrl: string, relatedUrls: string[]) {
  return Array.from(new Map([
    { matchedUrl: sourceUrl, matchKind: "source_url" as const },
    ...relatedUrls.map((matchedUrl) => ({ matchedUrl, matchKind: "related_url" as const })),
  ].flatMap((anchor) => {
    const canonicalUrl = canonicalPublicEvidenceUrl(anchor.matchedUrl);
    return canonicalUrl ? [[canonicalUrl, { ...anchor, canonicalUrl }] as const] : [];
  })).values());
}

function normalizedInput(item: PublicEvidenceHistoryInput, observedAtSeconds: number) {
  const externalId = boundedText(item.id, MAX_EXTERNAL_ID_LENGTH);
  const source = boundedText(item.source, MAX_LABEL_LENGTH).toLocaleLowerCase();
  const title = boundedText(item.title, MAX_TITLE_LENGTH);
  const sourceUrl = safeHttpsUrl(item.source_url);
  const ageSeconds = Number(item.age_seconds);
  if (!externalId || !source || !title || !sourceUrl || !Number.isFinite(ageSeconds) || ageSeconds < 0) {
    return null;
  }
  const relatedUrls = Array.from(new Set((item.related_urls ?? [])
    .map(safeHttpsUrl)
    .filter((url): url is string => Boolean(url && url !== sourceUrl))))
    .slice(0, MAX_RELATED_URLS);
  const anchors = evidenceLinkAnchors(sourceUrl, relatedUrls);
  return {
    itemKey: `${source}:${externalId}`.slice(0, MAX_EXTERNAL_ID_LENGTH + MAX_LABEL_LENGTH + 1),
    externalId,
    title,
    topic: boundedText(item.topic, MAX_LABEL_LENGTH),
    niche: boundedText(item.niche, MAX_LABEL_LENGTH),
    source,
    sourceUrl,
    relatedUrls,
    anchors,
    creatorUsername: boundedText(item.creator?.username, MAX_LABEL_LENGTH) || null,
    publishedAt: Math.max(0, observedAtSeconds - Math.floor(ageSeconds)),
    observedMetrics: safeMetricSnapshot(item),
  };
}

function isoTime(seconds: number | null) {
  return typeof seconds === "number" && Number.isFinite(seconds)
    ? new Date(seconds * 1_000).toISOString()
    : null;
}

export function normalizePublicEvidenceSearchQuery(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/gu, " ");
  const length = Array.from(normalized).length;
  return length >= MIN_SEARCH_QUERY_CHARACTERS && length <= MAX_SEARCH_QUERY_CHARACTERS
    ? normalized
    : null;
}

function escapedLikeQuery(value: string) {
  return value.replace(/[\\%_]/gu, "\\$&");
}

function searchMatchedOn(row: HistoryRow, query: string): PublicEvidenceHistorySearchItem["matched_on"] {
  const includes = (value: string | null) => value?.toLocaleLowerCase().includes(query) ?? false;
  if (includes(row.title)) return "title";
  if (includes(row.creator_username)) return "creator identity";
  if (includes(row.source)) return "source";
  if (includes(row.niche)) return "niche";
  return "topic";
}

function unavailableSearch(query: string, reason: string): PublicEvidenceHistorySearch {
  return {
    status: "unavailable",
    mode: "request_observed_search",
    query,
    search_version: "public-request-observed-archive-v1",
    retention_days: RETENTION_DAYS,
    generated_at: new Date().toISOString(),
    result_count: 0,
    truncated: false,
    items: [],
    reason,
  };
}

function unavailableReturnBrief(since: string, reason: string): PublicEvidenceReturnBrief {
  return {
    status: "unavailable",
    mode: "request_observed_return_brief",
    brief_version: "public-request-observed-return-brief-v1",
    since,
    generated_at: new Date().toISOString(),
    retention_days: RETENTION_DAYS,
    result_count: 0,
    source_count: 0,
    truncated: false,
    items: [],
    reason,
  };
}

function unavailableHistory(reason = "Persistent evidence history is unavailable in this runtime."): PublicEvidenceHistory {
  return {
    status: "unavailable",
    mode: "request_observed",
    retention_days: RETENTION_DAYS,
    observation_window_seconds: OBSERVATION_WINDOW_SECONDS,
    stored_item_count: 0,
    current_item_count: 0,
    coverage_started_at: null,
    last_captured_at: null,
    items: [],
    exact_link_groups: [],
    reason,
  };
}

async function loadDatabase() {
  try {
    const runtime = (await nodeRuntime());
    const database = (runtime.env as Record<string, unknown>).DB;
    return isD1Database(database) ? database : null;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
    if (code === "ERR_UNSUPPORTED_ESM_URL_SCHEME" || code === "ERR_MODULE_NOT_FOUND") return null;
    throw error;
  }
}

async function database() {
  databasePromise ??= loadDatabase();
  const value = await databasePromise;
  if (!value) return null;
  schemaPromise ??= initializePublicEvidenceHistory(value).catch((error) => {
    schemaPromise = undefined;
    throw error;
  });
  await schemaPromise;
  return value;
}

export async function initializePublicEvidenceHistory(distributed: D1Database) {
  await distributed.batch([
    distributed.prepare(createItemsTableSql),
    distributed.prepare(createObservationsTableSql),
    distributed.prepare(createLinksTableSql),
    distributed.prepare(createLastObservedIndexSql),
    distributed.prepare(createObservationTimeIndexSql),
    distributed.prepare(createObservationItemTimeIndexSql),
    distributed.prepare(createLinkItemIndexSql),
  ]);
}

export async function persistPublicEvidenceHistory(
  distributed: D1Database,
  items: PublicEvidenceHistoryInput[],
  observedAtSeconds = Math.floor(Date.now() / 1_000),
): Promise<PublicEvidenceHistory> {
  await initializePublicEvidenceHistory(distributed);
  const normalized = items
    .slice(0, MAX_ARCHIVE_ITEMS)
    .map((item) => normalizedInput(item, observedAtSeconds))
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const observationBucket = Math.floor(observedAtSeconds / OBSERVATION_WINDOW_SECONDS);
  const cutoff = observedAtSeconds - RETENTION_DAYS * 24 * 60 * 60;
  const writes = normalized.flatMap((item) => [
    distributed.prepare(`
      INSERT INTO public_evidence_items (
        item_key, external_id, title, topic, niche, source, source_url,
        related_urls, creator_username, published_at, first_observed_at, last_observed_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
      ON CONFLICT(item_key) DO UPDATE SET
        external_id = excluded.external_id,
        title = excluded.title,
        topic = excluded.topic,
        niche = excluded.niche,
        source = excluded.source,
        source_url = excluded.source_url,
        related_urls = excluded.related_urls,
        creator_username = excluded.creator_username,
        published_at = MIN(public_evidence_items.published_at, excluded.published_at),
        first_observed_at = MIN(public_evidence_items.first_observed_at, excluded.first_observed_at),
        last_observed_at = MAX(public_evidence_items.last_observed_at, excluded.last_observed_at)
    `).bind(
      item.itemKey,
      item.externalId,
      item.title,
      item.topic,
      item.niche,
      item.source,
      item.sourceUrl,
      JSON.stringify(item.relatedUrls),
      item.creatorUsername,
      item.publishedAt,
      observedAtSeconds,
    ),
    distributed.prepare(`
      INSERT INTO public_evidence_observations (
        item_key, observed_bucket, observed_at, observed_metrics
      ) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(item_key, observed_bucket) DO UPDATE SET
        observed_metrics = CASE
          WHEN excluded.observed_at >= public_evidence_observations.observed_at
            THEN excluded.observed_metrics
          ELSE public_evidence_observations.observed_metrics
        END,
        observed_at = MAX(public_evidence_observations.observed_at, excluded.observed_at)
    `).bind(item.itemKey, observationBucket, observedAtSeconds, JSON.stringify(item.observedMetrics)),
    distributed.prepare("DELETE FROM public_evidence_links WHERE item_key = ?1").bind(item.itemKey),
    ...item.anchors.map((anchor) => distributed.prepare(`
      INSERT INTO public_evidence_links (
        canonical_url, item_key, matched_url, match_kind
      ) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(canonical_url, item_key) DO UPDATE SET
        matched_url = excluded.matched_url,
        match_kind = excluded.match_kind
    `).bind(anchor.canonicalUrl, item.itemKey, anchor.matchedUrl, anchor.matchKind)),
  ]);
  if (writes.length) await distributed.batch(writes);
  await distributed.batch([
    distributed.prepare("DELETE FROM public_evidence_observations WHERE observed_at < ?1").bind(cutoff),
    distributed.prepare("DELETE FROM public_evidence_items WHERE last_observed_at < ?1").bind(cutoff),
  ]);

  const missingLinkResult = await distributed.prepare(`
    SELECT items.item_key, items.source_url, items.related_urls
    FROM public_evidence_items AS items
    WHERE items.last_observed_at >= ?1
      AND NOT EXISTS (
        SELECT 1 FROM public_evidence_links AS links WHERE links.item_key = items.item_key
      )
    ORDER BY items.last_observed_at DESC, items.item_key ASC
    LIMIT ?2
  `).bind(cutoff, MAX_LINK_BACKFILL_ITEMS).all<LinkBackfillRow>();
  const linkBackfillWrites = (missingLinkResult.results ?? []).flatMap((row) => {
    let relatedUrls: string[] = [];
    try {
      const parsed = JSON.parse(row.related_urls);
      if (Array.isArray(parsed)) {
        relatedUrls = parsed.map(safeHttpsUrl).filter((url): url is string => Boolean(url));
      }
    } catch {
      relatedUrls = [];
    }
    const sourceUrl = safeHttpsUrl(row.source_url);
    if (!sourceUrl) return [];
    return evidenceLinkAnchors(sourceUrl, relatedUrls).map((anchor) => distributed.prepare(`
      INSERT INTO public_evidence_links (
        canonical_url, item_key, matched_url, match_kind
      ) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(canonical_url, item_key) DO UPDATE SET
        matched_url = excluded.matched_url,
        match_kind = excluded.match_kind
    `).bind(anchor.canonicalUrl, row.item_key, anchor.matchedUrl, anchor.matchKind));
  });
  if (linkBackfillWrites.length) await distributed.batch(linkBackfillWrites);

  const [summary, result, exactLinkResult] = await Promise.all([
    distributed.prepare(`
      SELECT
        COUNT(*) AS stored_item_count,
        MIN(first_observed_at) AS coverage_started_at,
        MAX(last_observed_at) AS last_captured_at
      FROM public_evidence_items
      WHERE last_observed_at >= ?1
    `).bind(cutoff).first<HistorySummaryRow>(),
    distributed.prepare(`
      SELECT
        items.item_key,
        items.external_id,
        items.title,
        items.topic,
        items.niche,
        items.source,
        items.source_url,
        items.related_urls,
        items.creator_username,
        items.published_at,
        items.first_observed_at,
        items.last_observed_at,
        COUNT(observations.observed_bucket) AS observation_windows
      FROM public_evidence_items AS items
      LEFT JOIN public_evidence_observations AS observations
        ON observations.item_key = items.item_key
      WHERE items.last_observed_at >= ?1
      GROUP BY items.item_key
      ORDER BY items.last_observed_at DESC, items.published_at DESC, items.item_key ASC
      LIMIT ?2
    `).bind(cutoff, MAX_ARCHIVE_ITEMS).all<HistoryRow>(),
    distributed.prepare(`
      SELECT
        links.canonical_url,
        COUNT(DISTINCT items.source) AS source_count,
        COUNT(DISTINCT items.item_key) AS item_count,
        MIN(items.published_at) AS earliest_published_at,
        MAX(items.published_at) AS latest_published_at,
        MIN(items.first_observed_at) AS first_observed_at,
        MAX(items.last_observed_at) AS last_observed_at
      FROM public_evidence_links AS links
      INNER JOIN public_evidence_items AS items ON items.item_key = links.item_key
      WHERE items.last_observed_at >= ?1
      GROUP BY links.canonical_url
      HAVING COUNT(DISTINCT items.source) >= 2 AND COUNT(DISTINCT items.item_key) >= 2
      ORDER BY last_observed_at DESC, source_count DESC, item_count DESC, links.canonical_url ASC
      LIMIT ?2
    `).bind(cutoff, MAX_EXACT_LINK_GROUPS).all<ExactLinkGroupRow>(),
  ]);
  const currentKeys = new Set(normalized.map((item) => item.itemKey));
  const retainedItemKeys = (result.results ?? []).map((row) => row.item_key);
  const metricHistoryResult = retainedItemKeys.length
    ? await distributed.prepare(`
      WITH metric_values AS (
        SELECT
          observations.item_key,
          observations.observed_at,
          metrics.key AS metric_name,
          CAST(metrics.value AS INTEGER) AS metric_value,
          ROW_NUMBER() OVER (
            PARTITION BY observations.item_key, metrics.key
            ORDER BY observations.observed_at ASC, observations.observed_bucket ASC
          ) AS first_rank,
          ROW_NUMBER() OVER (
            PARTITION BY observations.item_key, metrics.key
            ORDER BY observations.observed_at DESC, observations.observed_bucket DESC
          ) AS latest_rank,
          COUNT(*) OVER (
            PARTITION BY observations.item_key, metrics.key
          ) AS observation_windows,
          MIN(observations.observed_at) OVER (
            PARTITION BY observations.item_key, metrics.key
          ) AS first_observed_at,
          MAX(observations.observed_at) OVER (
            PARTITION BY observations.item_key, metrics.key
          ) AS last_observed_at
        FROM public_evidence_observations AS observations,
          json_each(observations.observed_metrics) AS metrics
        WHERE observations.item_key IN (${retainedItemKeys.map((_, index) => `?${index + 1}`).join(", ")})
          AND metrics.key IN (${PUBLIC_METRIC_NAMES.map((_, index) => `?${retainedItemKeys.length + index + 1}`).join(", ")})
          AND metrics.type = 'integer'
          AND CAST(metrics.value AS INTEGER) BETWEEN 0 AND ?${retainedItemKeys.length + PUBLIC_METRIC_NAMES.length + 1}
      )
      SELECT
        item_key,
        metric_name,
        MAX(CASE WHEN first_rank = 1 THEN metric_value END) AS first_value,
        MAX(CASE WHEN latest_rank = 1 THEN metric_value END) AS latest_value,
        MAX(observation_windows) AS observation_windows,
        MIN(first_observed_at) AS first_observed_at,
        MAX(last_observed_at) AS last_observed_at
      FROM metric_values
      GROUP BY item_key, metric_name
      ORDER BY item_key ASC, metric_name ASC
    `).bind(...retainedItemKeys, ...PUBLIC_METRIC_NAMES, MAX_PUBLIC_METRIC).all<MetricHistoryRow>()
    : { results: [] as MetricHistoryRow[] };
  const metricHistoryByItem = new Map<string, PublicEvidenceMetricHistory>();
  for (const row of metricHistoryResult.results ?? []) {
    if (!PUBLIC_METRIC_NAMES.includes(row.metric_name as PublicMetricName)) continue;
    const firstValue = Number(row.first_value);
    const latestValue = Number(row.latest_value);
    const observationWindows = Number(row.observation_windows);
    const firstObservedAt = isoTime(Number(row.first_observed_at));
    const lastObservedAt = isoTime(Number(row.last_observed_at));
    if (
      !Number.isSafeInteger(firstValue)
      || !Number.isSafeInteger(latestValue)
      || firstValue < 0
      || latestValue < 0
      || firstValue > MAX_PUBLIC_METRIC
      || latestValue > MAX_PUBLIC_METRIC
      || !Number.isSafeInteger(observationWindows)
      || observationWindows < 1
      || !firstObservedAt
      || !lastObservedAt
    ) continue;
    const history = metricHistoryByItem.get(row.item_key) ?? {
      evidence: "request_observed_provider_snapshots" as const,
      metrics: {},
    };
    history.metrics[row.metric_name as PublicMetricName] = {
      first_value: firstValue,
      latest_value: latestValue,
      delta: latestValue - firstValue,
      observation_windows: observationWindows,
      first_observed_at: firstObservedAt,
      last_observed_at: lastObservedAt,
    };
    metricHistoryByItem.set(row.item_key, history);
  }
  const archiveItems = (result.results ?? []).map((row) => {
    let relatedUrls: string[] = [];
    try {
      const parsed = JSON.parse(row.related_urls);
      if (Array.isArray(parsed)) relatedUrls = parsed.filter((url): url is string => Boolean(safeHttpsUrl(url)));
    } catch {
      relatedUrls = [];
    }
    return {
      item_key: row.item_key,
      external_id: row.external_id,
      title: row.title,
      topic: row.topic,
      niche: row.niche,
      source: row.source,
      source_url: row.source_url,
      related_urls: relatedUrls,
      creator_username: row.creator_username,
      published_at: isoTime(Number(row.published_at))!,
      first_observed_at: isoTime(Number(row.first_observed_at))!,
      last_observed_at: isoTime(Number(row.last_observed_at))!,
      observation_windows: Number(row.observation_windows),
      current: currentKeys.has(row.item_key),
      ...(metricHistoryByItem.has(row.item_key)
        ? { metric_history: metricHistoryByItem.get(row.item_key) }
        : {}),
    } satisfies PublicEvidenceHistoryItem;
  });
  const exactLinkRows = exactLinkResult.results ?? [];
  const exactLinkMemberResults = exactLinkRows.length
    ? await distributed.batch(exactLinkRows.map((group) => distributed.prepare(`
      WITH ranked_members AS (
        SELECT
          items.item_key,
          items.title,
          items.topic,
          items.niche,
          items.source,
          items.source_url,
          links.matched_url,
          links.match_kind,
          items.creator_username,
          items.published_at,
          items.first_observed_at,
          items.last_observed_at,
          ROW_NUMBER() OVER (
            PARTITION BY items.source
            ORDER BY items.published_at ASC, items.first_observed_at ASC, items.item_key ASC
          ) AS source_rank
        FROM public_evidence_links AS links
        INNER JOIN public_evidence_items AS items ON items.item_key = links.item_key
        WHERE links.canonical_url = ?1 AND items.last_observed_at >= ?2
      )
      SELECT
        item_key,
        title,
        topic,
        niche,
        source,
        source_url,
        matched_url,
        match_kind,
        creator_username,
        published_at,
        first_observed_at,
        last_observed_at
      FROM ranked_members
      ORDER BY source_rank ASC, published_at ASC, first_observed_at ASC, item_key ASC
      LIMIT ?3
    `).bind(group.canonical_url, cutoff, MAX_EXACT_LINK_MEMBERS)))
    : [];
  const exactLinkGroups = exactLinkRows.map((group, index) => {
    const members = ((exactLinkMemberResults[index]?.results ?? []) as unknown as ExactLinkMemberRow[])
      .map((row) => ({
        item_key: row.item_key,
        title: row.title,
        topic: row.topic,
        niche: row.niche,
        source: row.source,
        source_url: row.source_url,
        matched_url: row.matched_url,
        match_kind: row.match_kind,
        creator_username: row.creator_username,
        published_at: isoTime(Number(row.published_at))!,
        first_observed_at: isoTime(Number(row.first_observed_at))!,
        last_observed_at: isoTime(Number(row.last_observed_at))!,
        current: currentKeys.has(row.item_key),
      } satisfies PublicEvidenceHistoryExactLinkMember));
    return {
      id: `public-history-exact-link-${stablePublicEvidenceHash(group.canonical_url)}`,
      canonical_url: group.canonical_url,
      source_count: Number(group.source_count),
      item_count: Number(group.item_count),
      sources: Array.from(new Set(members.map((member) => member.source))),
      earliest_published_at: isoTime(Number(group.earliest_published_at))!,
      latest_published_at: isoTime(Number(group.latest_published_at))!,
      publication_span_seconds: Math.max(
        0,
        Number(group.latest_published_at) - Number(group.earliest_published_at),
      ),
      first_observed_at: isoTime(Number(group.first_observed_at))!,
      last_observed_at: isoTime(Number(group.last_observed_at))!,
      members,
    } satisfies PublicEvidenceHistoryExactLinkGroup;
  });
  return {
    status: "available",
    mode: "request_observed",
    retention_days: RETENTION_DAYS,
    observation_window_seconds: OBSERVATION_WINDOW_SECONDS,
    stored_item_count: Number(summary?.stored_item_count ?? 0),
    current_item_count: normalized.length,
    coverage_started_at: isoTime(summary?.coverage_started_at === null || summary?.coverage_started_at === undefined
      ? null
      : Number(summary.coverage_started_at)),
    last_captured_at: isoTime(summary?.last_captured_at === null || summary?.last_captured_at === undefined
      ? null
      : Number(summary.last_captured_at)),
    items: archiveItems,
    exact_link_groups: exactLinkGroups,
  };
}

export async function searchPersistedPublicEvidenceHistory(
  distributed: D1Database,
  query: string,
  requestedLimit = MAX_SEARCH_RESULTS,
  observedAtSeconds = Math.floor(Date.now() / 1_000),
): Promise<PublicEvidenceHistorySearch> {
  const normalizedQuery = normalizePublicEvidenceSearchQuery(query);
  if (!normalizedQuery) throw new TypeError("Search query must contain 2 to 80 characters.");
  const limit = Number.isSafeInteger(requestedLimit)
    ? Math.min(MAX_SEARCH_RESULTS, Math.max(1, requestedLimit))
    : MAX_SEARCH_RESULTS;
  const cutoff = observedAtSeconds - RETENTION_DAYS * 24 * 60 * 60;
  const loweredQuery = normalizedQuery.toLocaleLowerCase();
  const escapedQuery = escapedLikeQuery(loweredQuery);
  const prefixPattern = `${escapedQuery}%`;
  const containsPattern = `%${escapedQuery}%`;
  const result = await distributed.prepare(`
    SELECT
      items.item_key,
      items.external_id,
      items.title,
      items.topic,
      items.niche,
      items.source,
      items.source_url,
      items.related_urls,
      items.creator_username,
      items.published_at,
      items.first_observed_at,
      items.last_observed_at,
      (
        SELECT COUNT(*) FROM public_evidence_observations AS observations
        WHERE observations.item_key = items.item_key
      ) AS observation_windows,
      CASE
        WHEN LOWER(items.title) = ?2 THEN 100
        WHEN LOWER(items.title) LIKE ?3 ESCAPE '\\' THEN 94
        WHEN LOWER(items.title) LIKE ?4 ESCAPE '\\' THEN 88
        WHEN LOWER(COALESCE(items.creator_username, '')) = ?2 THEN 84
        WHEN LOWER(COALESCE(items.creator_username, '')) LIKE ?4 ESCAPE '\\' THEN 80
        WHEN LOWER(items.source) = ?2 THEN 76
        WHEN LOWER(items.niche) LIKE ?4 ESCAPE '\\' THEN 72
        ELSE 68
      END AS match_score,
      COUNT(*) OVER () AS matched_count
    FROM public_evidence_items AS items
    WHERE items.last_observed_at >= ?1
      AND (
        LOWER(items.title) LIKE ?4 ESCAPE '\\'
        OR LOWER(COALESCE(items.creator_username, '')) LIKE ?4 ESCAPE '\\'
        OR LOWER(items.source) LIKE ?4 ESCAPE '\\'
        OR LOWER(items.niche) LIKE ?4 ESCAPE '\\'
        OR LOWER(items.topic) LIKE ?4 ESCAPE '\\'
      )
    ORDER BY match_score DESC, items.last_observed_at DESC, items.published_at DESC, items.item_key ASC
    LIMIT ?5
  `).bind(cutoff, loweredQuery, prefixPattern, containsPattern, limit).all<SearchRow>();
  const rows = result.results ?? [];
  const matchedCount = Number(rows[0]?.matched_count ?? 0);
  const items = rows.map((row) => {
    let relatedUrls: string[] = [];
    try {
      const parsed = JSON.parse(row.related_urls);
      if (Array.isArray(parsed)) {
        relatedUrls = parsed.map(safeHttpsUrl).filter((url): url is string => Boolean(url));
      }
    } catch {
      relatedUrls = [];
    }
    return {
      item_key: row.item_key,
      external_id: row.external_id,
      title: row.title,
      topic: row.topic,
      niche: row.niche,
      source: row.source,
      source_url: row.source_url,
      related_urls: relatedUrls,
      creator_username: row.creator_username,
      published_at: isoTime(Number(row.published_at))!,
      first_observed_at: isoTime(Number(row.first_observed_at))!,
      last_observed_at: isoTime(Number(row.last_observed_at))!,
      observation_windows: Number(row.observation_windows),
      matched_on: searchMatchedOn(row, loweredQuery),
      match_score: Number(row.match_score),
    } satisfies PublicEvidenceHistorySearchItem;
  });
  return {
    status: "available",
    mode: "request_observed_search",
    query: normalizedQuery,
    search_version: "public-request-observed-archive-v1",
    retention_days: RETENTION_DAYS,
    generated_at: new Date(observedAtSeconds * 1_000).toISOString(),
    result_count: matchedCount,
    truncated: matchedCount > items.length,
    items,
  };
}

export async function searchPublicEvidenceHistory(
  query: string,
  requestedLimit = MAX_SEARCH_RESULTS,
): Promise<PublicEvidenceHistorySearch> {
  const normalizedQuery = normalizePublicEvidenceSearchQuery(query);
  if (!normalizedQuery) throw new TypeError("Search query must contain 2 to 80 characters.");
  try {
    const distributed = await database();
    if (!distributed) return unavailableSearch(normalizedQuery, "Persistent evidence search is unavailable in this runtime.");
    return await searchPersistedPublicEvidenceHistory(distributed, normalizedQuery, requestedLimit);
  } catch {
    return unavailableSearch(normalizedQuery, "The retained public archive is temporarily unavailable. Current evidence remains accessible.");
  }
}

export function normalizePublicEvidenceBriefSince(
  value: unknown,
  observedAtSeconds = Math.floor(Date.now() / 1_000),
) {
  if (typeof value !== "string" || value.length > 64) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const sinceSeconds = Math.floor(parsed / 1_000);
  if (sinceSeconds < 0 || sinceSeconds > observedAtSeconds) return null;
  const retentionCutoff = observedAtSeconds - RETENTION_DAYS * 24 * 60 * 60;
  return Math.max(retentionCutoff, sinceSeconds);
}

export async function queryPersistedPublicEvidenceReturnBrief(
  distributed: D1Database,
  since: string,
  requestedLimit = MAX_RETURN_BRIEF_RESULTS,
  observedAtSeconds = Math.floor(Date.now() / 1_000),
): Promise<PublicEvidenceReturnBrief> {
  await initializePublicEvidenceHistory(distributed);
  const sinceSeconds = normalizePublicEvidenceBriefSince(since, observedAtSeconds);
  if (sinceSeconds === null) throw new TypeError("Return briefing checkpoint must be a valid past timestamp.");
  const limit = Number.isSafeInteger(requestedLimit)
    ? Math.min(MAX_RETURN_BRIEF_RESULTS, Math.max(1, requestedLimit))
    : MAX_RETURN_BRIEF_RESULTS;
  const retentionCutoff = observedAtSeconds - RETENTION_DAYS * 24 * 60 * 60;
  const result = await distributed.prepare(`
    WITH ranked AS (
      SELECT
        items.item_key,
        items.external_id,
        items.title,
        items.topic,
        items.niche,
        items.source,
        items.source_url,
        items.related_urls,
        items.creator_username,
        items.published_at,
        items.first_observed_at,
        items.last_observed_at,
        (
          SELECT COUNT(*) FROM public_evidence_observations AS observations
          WHERE observations.item_key = items.item_key
        ) AS observation_windows,
        ROW_NUMBER() OVER (
          PARTITION BY items.source
          ORDER BY items.first_observed_at DESC, items.published_at DESC, items.item_key ASC
        ) AS source_rank,
        COUNT(*) OVER () AS matched_count,
        (
          SELECT COUNT(DISTINCT source)
          FROM public_evidence_items
          WHERE first_observed_at > ?1 AND last_observed_at >= ?2
        ) AS source_count
      FROM public_evidence_items AS items
      WHERE items.first_observed_at > ?1 AND items.last_observed_at >= ?2
    )
    SELECT * FROM ranked
    WHERE source_rank <= ?3
    ORDER BY first_observed_at DESC, published_at DESC, item_key ASC
    LIMIT ?4
  `).bind(
    sinceSeconds,
    retentionCutoff,
    MAX_RETURN_BRIEF_RESULTS_PER_SOURCE,
    limit,
  ).all<ReturnBriefRow>();
  const rows = result.results ?? [];
  const resultCount = Number(rows[0]?.matched_count ?? 0);
  const items = rows.map((row) => {
    let relatedUrls: string[] = [];
    try {
      const parsed = JSON.parse(row.related_urls);
      if (Array.isArray(parsed)) {
        relatedUrls = parsed.map(safeHttpsUrl).filter((url): url is string => Boolean(url));
      }
    } catch {
      relatedUrls = [];
    }
    return {
      item_key: row.item_key,
      external_id: row.external_id,
      title: row.title,
      topic: row.topic,
      niche: row.niche,
      source: row.source,
      source_url: row.source_url,
      related_urls: relatedUrls,
      creator_username: row.creator_username,
      published_at: isoTime(Number(row.published_at))!,
      first_observed_at: isoTime(Number(row.first_observed_at))!,
      last_observed_at: isoTime(Number(row.last_observed_at))!,
      observation_windows: Number(row.observation_windows),
    } satisfies PublicEvidenceReturnBriefItem;
  });
  return {
    status: "available",
    mode: "request_observed_return_brief",
    brief_version: "public-request-observed-return-brief-v1",
    since: new Date(sinceSeconds * 1_000).toISOString(),
    generated_at: new Date(observedAtSeconds * 1_000).toISOString(),
    retention_days: RETENTION_DAYS,
    result_count: resultCount,
    source_count: Number(rows[0]?.source_count ?? 0),
    truncated: resultCount > items.length,
    items,
  };
}

export async function loadPublicEvidenceReturnBrief(
  since: string,
  requestedLimit = MAX_RETURN_BRIEF_RESULTS,
): Promise<PublicEvidenceReturnBrief> {
  const now = Math.floor(Date.now() / 1_000);
  const normalizedSince = normalizePublicEvidenceBriefSince(since, now);
  if (normalizedSince === null) throw new TypeError("Return briefing checkpoint must be a valid past timestamp.");
  const normalizedSinceIso = new Date(normalizedSince * 1_000).toISOString();
  try {
    const distributed = await database();
    if (!distributed) return unavailableReturnBrief(normalizedSinceIso, "Persistent evidence history is unavailable in this runtime.");
    return await queryPersistedPublicEvidenceReturnBrief(distributed, normalizedSinceIso, requestedLimit, now);
  } catch {
    return unavailableReturnBrief(normalizedSinceIso, "The retained public archive is temporarily unavailable. Current evidence remains accessible.");
  }
}

export async function observePublicEvidenceHistory(
  items: PublicEvidenceHistoryInput[],
  generatedAt: string,
): Promise<PublicEvidenceHistory> {
  try {
    const distributed = await database();
    if (!distributed) return unavailableHistory();
    const parsed = Date.parse(generatedAt);
    const observedAtSeconds = Number.isFinite(parsed)
      ? Math.floor(parsed / 1_000)
      : Math.floor(Date.now() / 1_000);
    return await persistPublicEvidenceHistory(distributed, items, observedAtSeconds);
  } catch {
    return unavailableHistory("The latest public evidence is live, but its request-observed archive is temporarily unavailable.");
  }
}

export const publicEvidenceHistoryContract = {
  binding: "DB",
  retentionDays: RETENTION_DAYS,
  observationWindowSeconds: OBSERVATION_WINDOW_SECONDS,
  maximumArchiveItems: MAX_ARCHIVE_ITEMS,
  maximumExactLinkGroups: MAX_EXACT_LINK_GROUPS,
  maximumExactLinkMembers: MAX_EXACT_LINK_MEMBERS,
  maximumLinkBackfillItemsPerRequest: MAX_LINK_BACKFILL_ITEMS,
  minimumSearchQueryCharacters: MIN_SEARCH_QUERY_CHARACTERS,
  maximumSearchQueryCharacters: MAX_SEARCH_QUERY_CHARACTERS,
  maximumSearchResults: MAX_SEARCH_RESULTS,
  maximumReturnBriefResults: MAX_RETURN_BRIEF_RESULTS,
  maximumReturnBriefResultsPerSource: MAX_RETURN_BRIEF_RESULTS_PER_SOURCE,
} as const;
