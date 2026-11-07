"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useDialogFocus } from "@/x-master/lib/use-dialog-focus";
import styles from "./video-g.module.css";

type SourceStatus = {
  source: string;
  name: string;
  state: "available" | "queued" | "searched" | "searching" | "unavailable" | "rate_limited" | "credentials_required" | "disabled" | "failed";
  reason: string;
  methods?: string[];
  result_count?: number;
};

type Occurrence = {
  id: string;
  source: string;
  external_id: string;
  url: string;
  embed_url?: string | null;
  author_name?: string | null;
  author_handle?: string | null;
  author_url?: string | null;
  official?: boolean | null;
  published_at?: string | null;
  post_text?: string | null;
  content_type?: string | null;
  thumbnail_url?: string | null;
  engagement: Record<string, number | null>;
  playable_in_app: boolean;
  validation_status: string;
  state: string;
  discovery_method?: string | null;
};

type VideoResult = {
  id: string;
  asset_id: string;
  media_type: string;
  title?: string | null;
  description?: string | null;
  duration_seconds?: number | null;
  width?: number | null;
  height?: number | null;
  orientation?: string | null;
  language?: string | null;
  thumbnail_url?: string | null;
  transcript?: string | null;
  has_captions: boolean;
  content_type?: string | null;
  preferred_occurrence: Occurrence;
  occurrences: Occurrence[];
  also_posted_count: number;
  saved: boolean;
  saved_collection_ids: string[];
  scores: { heat?: number | null; confidence: number; relevance: number; opportunity: number };
  entity_certainty: number;
  media_certainty: number;
  ranking_reasons: string[];
  rank?: number | null;
};

type SearchPayload = {
  search: {
    id: string;
    input: string;
    input_kind: string;
    state: string;
    deep_search: boolean;
    old_gems: boolean;
    entity: {
      name?: string;
      certainty?: number;
      detected_source?: string;
      urls?: string[];
      keywords?: string[];
    };
    suggestions: Array<{ key: string; name: string; description: string; refinement: string }>;
    source_status: Record<string, SourceStatus>;
    progress_version: number;
    started_at?: string | null;
    completed_at?: string | null;
    error?: string | null;
    partial: boolean;
  };
  queries: Array<{ id: string; source: string; pass: number; query: string; state: string; result_count: number; error?: string }>;
  items: VideoResult[];
  count: number;
  next_cursor?: string | null;
  cached?: boolean;
};

type OperatorSession = {
  loading: boolean;
  configured: boolean;
  authenticated: boolean;
  csrf_token?: string;
  reason?: string;
};

type Collection = { id: string; name: string; slug: string; description?: string; color?: string; count: number };
type RecentSearch = { id: string; input: string; state: string; entity?: string; created_at: string };

const EXAMPLES = ["DeepSeek", "Kimi K3", "Hermes Agent", "OpenClaw", "Claude Code"];
const CONTENT_TYPES = ["Product Demo", "Launch", "Feature Reveal", "Mini Tutorial", "Workflow", "Agent Demo", "Campaign or Ad", "Benchmark", "Community Example", "Reaction or Commentary"];
const SOURCE_LABELS: Record<string, string> = {
  x: "X", youtube: "YouTube", reddit: "Reddit", official_web: "Official sites", github: "GitHub",
  vimeo: "Vimeo", linkedin: "LinkedIn", product_hunt: "Product Hunt", rednote: "RedNote", bilibili: "Bilibili",
};
const SOURCE_MARKS: Record<string, string> = {
  x: "𝕏", youtube: "▶", reddit: "r", official_web: "◎", github: "⌘", vimeo: "v",
  linkedin: "in", product_hunt: "P", rednote: "红", bilibili: "B",
};

function sourceMark(source: string) {
  return SOURCE_MARKS[source] ?? source.slice(0, 1).toUpperCase();
}

function durationLabel(seconds?: number | null) {
  if (seconds == null) return "Duration unavailable";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function dateLabel(value?: string | null, exact = false) {
  if (!value) return "Date unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Date unavailable";
  if (exact) return parsed.toLocaleString([], { dateStyle: "long", timeStyle: "short" });
  return parsed.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function engagementLabel(engagement: Record<string, number | null>) {
  const order = ["views", "likes", "score", "reposts", "comments", "replies"];
  const entry = order.map((key) => [key, engagement[key]] as const).find(([, value]) => typeof value === "number");
  if (!entry) return null;
  const [key, value] = entry;
  return `${Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value as number)} ${key}`;
}

function detectedSource(value: string) {
  try {
    const match = value.match(/https:\/\/[^\s]+/i);
    if (!match) return null;
    const host = new URL(match[0]).hostname.replace(/^www\./, "").toLowerCase();
    return Object.entries({ x: ["x.com", "twitter.com"], youtube: ["youtube.com", "youtu.be"], reddit: ["reddit.com"], github: ["github.com"], vimeo: ["vimeo.com"], linkedin: ["linkedin.com"], product_hunt: ["producthunt.com"], rednote: ["xiaohongshu.com", "xhslink.com"], bilibili: ["bilibili.com", "b23.tv"] }).find(([, domains]) => domains.some((domain) => host === domain || host.endsWith(`.${domain}`)))?.[0] ?? "official_web";
  } catch {
    return null;
  }
}

function scoreValue(value?: number | null) {
  return value == null ? "—" : Math.round(value);
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className={styles.filterSelect}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

function MediaSurface({ item, large = false }: { item: VideoResult; large?: boolean }) {
  const occurrence = item.preferred_occurrence;
  const directVideo = occurrence.embed_url && /\.(?:mp4|m3u8)(?:\?|$)/i.test(occurrence.embed_url);
  if (large && occurrence.playable_in_app && occurrence.embed_url) {
    if (directVideo) {
      // A provider caption track is never fabricated; transcript availability is shown separately.
      // eslint-disable-next-line jsx-a11y/media-has-caption
      return <video className={styles.player} src={occurrence.embed_url} poster={item.thumbnail_url ?? undefined} controls playsInline preload="metadata" />;
    }
    return <iframe className={styles.player} src={occurrence.embed_url} title={item.title ?? "Video result"} allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen />;
  }
  if (item.thumbnail_url) {
    // Remote provider thumbnails cannot use a fixed Next image loader safely.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.thumbnail_url} alt="" loading="lazy" />;
  }
  return <div className={styles.mediaUnavailable}><span>{sourceMark(occurrence.source)}</span><p>{occurrence.validation_status === "verified" ? "Verified media" : "Indexed media"} · preview unavailable</p></div>;
}

export default function VideoGPage() {
  const [operator, setOperator] = useState<OperatorSession>({ loading: true, configured: false, authenticated: false });
  const [query, setQuery] = useState("");
  const [deepSearch, setDeepSearch] = useState(true);
  const [oldGems, setOldGems] = useState(false);
  const [payload, setPayload] = useState<SearchPayload | null>(null);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [sources, setSources] = useState<Record<string, SourceStatus>>({});
  const [capabilityState, setCapabilityState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [selected, setSelected] = useState<VideoResult | null>(null);
  const [collectionId, setCollectionId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [filters, setFilters] = useState({ platform: "", official: "", mediaType: "", contentType: "", dateRange: "all", duration: "any", language: "", orientation: "", captions: "", playable: "", savedOnly: false, sort: "best_match" });
  const streamRef = useRef<EventSource | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/operator-session", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as OperatorSession;
        if (active) setOperator({ ...body, loading: false });
      })
      .catch(() => active && setOperator({ loading: false, configured: false, authenticated: false, reason: "Operator status is unavailable." }));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!operator.authenticated) return;
    Promise.all([
      fetch("/api/video-g/sources", { cache: "no-store" }),
      fetch("/api/video-g/searches/recent", { cache: "no-store" }),
      fetch("/api/video-g/collections", { cache: "no-store" }),
    ]).then(async ([sourceResponse, recentResponse, collectionResponse]) => {
      if (sourceResponse.ok) {
        setSources(((await sourceResponse.json()) as { sources: Record<string, SourceStatus> }).sources);
        setCapabilityState("ready");
      } else {
        setCapabilityState("unavailable");
      }
      if (recentResponse.ok) setRecent(((await recentResponse.json()) as { items: RecentSearch[] }).items);
      if (collectionResponse.ok) {
        const items = ((await collectionResponse.json()) as { items: Collection[] }).items;
        setCollections(items);
        if (items[0]) setCollectionId(items[0].id);
      }
    }).catch(() => {
      setCapabilityState("unavailable");
      setMessage("Video G setup details are temporarily unavailable.");
    });
  }, [operator.authenticated]);

  useEffect(() => () => streamRef.current?.close(), []);
  const closeDrawer = useCallback(() => setSelected(null), []);
  useDialogFocus({ open: selected !== null, dialogRef: drawerRef, initialFocusRef: drawerCloseRef, onClose: closeDrawer });
  useEffect(() => {
    document.body.style.overflow = selected ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [selected]);

  const activeSources = payload?.search.source_status ?? sources;
  const sourceRows = Object.values(activeSources);
  const searching = payload?.search.state === "queued" || payload?.search.state === "running" || payload?.search.state === "partial";
  const searchedCount = sourceRows.filter((source) => source.state === "searched").length;
  const availableCount = sourceRows.filter((source) => ["available", "searched"].includes(source.state)).length;
  const unavailableCount = sourceRows.filter((source) => ["credentials_required", "rate_limited", "unavailable", "failed"].includes(source.state)).length;
  const backendReady = operator.authenticated && capabilityState === "ready";
  const inputSource = detectedSource(query);

  const filterQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.platform) params.set("platform", filters.platform);
    if (filters.official) params.set("official", filters.official);
    if (filters.mediaType) params.set("media_type", filters.mediaType);
    if (filters.contentType && filters.contentType !== "All content") params.set("content_type", filters.contentType);
    if (filters.dateRange) params.set("date_range", filters.dateRange);
    if (filters.duration) params.set("duration", filters.duration);
    if (filters.language) params.set("language", filters.language);
    if (filters.orientation) params.set("orientation", filters.orientation);
    if (filters.captions) params.set("captions", filters.captions);
    if (filters.playable) params.set("playable", filters.playable);
    if (filters.savedOnly) params.set("saved_only", "true");
    params.set("sort", filters.sort);
    return params.toString();
  }, [filters]);

  useEffect(() => {
    if (!payload?.search.id || searching) return;
    const controller = new AbortController();
    fetch(`/api/video-g/searches/${payload.search.id}?${filterQuery}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (response.ok) setPayload(await response.json() as SearchPayload); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [filterQuery, payload?.search.id, searching]);

  const openStream = (searchId: string) => {
    streamRef.current?.close();
    const stream = new EventSource(`/api/video-g/searches/${searchId}/stream`);
    streamRef.current = stream;
    const update = (event: MessageEvent<string>) => {
      const next = JSON.parse(event.data) as SearchPayload;
      setPayload(next);
      setSources(next.search.source_status);
    };
    stream.addEventListener("progress", update as EventListener);
    stream.addEventListener("complete", ((event: MessageEvent<string>) => {
      update(event);
      setBusy(false);
      stream.close();
      fetch("/api/video-g/searches/recent", { cache: "no-store" }).then(async (response) => response.ok && setRecent(((await response.json()) as { items: RecentSearch[] }).items)).catch(() => undefined);
    }) as EventListener);
    stream.onerror = () => {
      if (stream.readyState === EventSource.CLOSED) {
        setBusy(false);
        setMessage("The live progress stream closed. Stored results are still safe; reopen the search to continue.");
      }
    };
  };

  const runSearch = async (event?: FormEvent, override?: { value?: string; refresh?: boolean; entityKey?: string }) => {
    event?.preventDefault();
    const searchText = (override?.value ?? query).trim();
    if (!searchText || !backendReady) return;
    setQuery(searchText);
    setBusy(true);
    setMessage("");
    setSelected(null);
    streamRef.current?.close();
    try {
      const response = await fetch("/api/video-g/searches", {
        method: "POST",
        headers: { "content-type": "application/json", ...(operator.csrf_token ? { "x-radar-csrf": operator.csrf_token } : {}) },
        body: JSON.stringify({ query: searchText, deep_search: deepSearch, old_gems: oldGems, refresh: override?.refresh ?? false, entity_key: override?.entityKey }),
      });
      const body = await response.json() as SearchPayload & { detail?: string };
      if (!response.ok) throw new Error(body.detail ?? "Video G could not start the search.");
      setPayload(body);
      setSources(body.search.source_status);
      if (body.search.state === "needs_resolution" || body.search.state === "completed") {
        setBusy(false);
      } else {
        openStream(body.search.id);
      }
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Video G could not start the search.");
    }
  };

  const loadSearch = async (id: string) => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/video-g/searches/${id}`, { cache: "no-store" });
      if (!response.ok) throw new Error("The saved search is unavailable.");
      const body = await response.json() as SearchPayload;
      setPayload(body);
      setQuery(body.search.input);
      setDeepSearch(body.search.deep_search);
      setOldGems(body.search.old_gems);
      if (["queued", "running", "partial"].includes(body.search.state)) openStream(id);
      else setBusy(false);
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "The saved search is unavailable.");
    }
  };

  const loadMore = async () => {
    if (!payload?.search.id || !payload.next_cursor || loadingMore) return;
    setLoadingMore(true);
    setMessage("");
    try {
      const separator = filterQuery ? "&" : "";
      const response = await fetch(
        `/api/video-g/searches/${payload.search.id}?${filterQuery}${separator}cursor=${encodeURIComponent(payload.next_cursor)}`,
        { cache: "no-store" },
      );
      const body = await response.json() as SearchPayload & { detail?: string };
      if (!response.ok) throw new Error(body.detail ?? "More media results are unavailable.");
      setPayload((current) => {
        if (!current || current.search.id !== body.search.id) return body;
        const merged = new Map(current.items.map((item) => [item.id, item]));
        body.items.forEach((item) => merged.set(item.id, item));
        return { ...body, items: Array.from(merged.values()) };
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "More media results are unavailable.");
    } finally {
      setLoadingMore(false);
    }
  };

  const copy = async (value: string, success: string) => {
    await navigator.clipboard.writeText(value);
    setMessage(success);
    window.setTimeout(() => setMessage(""), 2400);
  };

  const toggleSave = async (item: VideoResult) => {
    if (!collectionId) {
      setMessage("Choose a collection before saving this clip.");
      return;
    }
    const savedHere = item.saved_collection_ids.includes(collectionId);
    const endpoint = savedHere
      ? `/api/video-g/saved/${item.asset_id}?collection_id=${encodeURIComponent(collectionId)}`
      : "/api/video-g/saved";
    const response = await fetch(endpoint, {
      method: savedHere ? "DELETE" : "POST",
      headers: { "content-type": "application/json", ...(operator.csrf_token ? { "x-radar-csrf": operator.csrf_token } : {}) },
      body: savedHere ? undefined : JSON.stringify({ asset_id: item.asset_id, collection_id: collectionId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ detail: "The collection could not be updated." })) as { detail?: string };
      setMessage(body.detail ?? "The collection could not be updated.");
      return;
    }
    const nextCollectionIds = savedHere
      ? item.saved_collection_ids.filter((id) => id !== collectionId)
      : [...new Set([...item.saved_collection_ids, collectionId])];
    const updateItem = (entry: VideoResult): VideoResult => entry.asset_id === item.asset_id
      ? { ...entry, saved: nextCollectionIds.length > 0, saved_collection_ids: nextCollectionIds }
      : entry;
    setPayload((current) => current ? { ...current, items: current.items.map(updateItem) } : current);
    setSelected((current) => current ? updateItem(current) : current);
    setCollections((current) => current.map((collection) => collection.id === collectionId
      ? { ...collection, count: Math.max(0, collection.count + (savedHere ? -1 : 1)) }
      : collection));
    const collectionName = collections.find((collection) => collection.id === collectionId)?.name ?? "collection";
    setMessage(savedHere ? `Removed from ${collectionName}.` : `Saved to ${collectionName}.`);
  };

  const clearSearch = () => {
    streamRef.current?.close();
    setPayload(null);
    setQuery("");
    setBusy(false);
    setSelected(null);
    setMessage("");
  };

  return <main className="app-shell">
    <aside className="sidebar" aria-label="Main navigation">
      <Link className="brand-lockup" href="/"><span className="brand-mark" aria-hidden="true"><i /></span><span>Virality Radar</span></Link>
      <nav className="nav-list">
        <p className="nav-label">Workspace</p>
        <Link className="nav-item" href="/"><span>⌁</span>Command Center</Link>
        <Link className="nav-item" href="/"><span>◉</span>Live Radar</Link>
        <Link className="nav-item" href="/"><span>◇</span>Stories</Link>
        <Link className="nav-item" href="/"><span>▷</span>YouTube Radar</Link>
        <Link className="nav-item active" href="/video-g" aria-current="page"><span>▶</span>Video G</Link>
        <Link className="nav-item" href="/"><span>中</span>Chinese Intel</Link>
        <Link className="nav-item" href="/"><span>↗</span>Rankings</Link>
        <Link className="nav-item" href="/"><span>⊙</span>System Health</Link>
        <Link className="nav-item" href="/"><span>✦</span>Content Studio</Link>
      </nav>
      <div className="sidebar-spacer" />
      <div className="system-card">
        <div className="system-title"><span className={`status-dot ${backendReady ? "" : "preview"}`} /> {backendReady ? "Video G connected" : operator.authenticated ? "Backend unavailable" : "Operator locked"}</div>
        <p>{backendReady ? `${searchedCount} sources searched · ${unavailableCount} limited` : operator.authenticated ? "Provider matrix unavailable" : "Unlock the operator session to search"}</p>
        <div className="system-meter"><i style={{ width: `${Math.max(12, sourceRows.length ? searchedCount / sourceRows.length * 100 : 12)}%` }} /></div>
        <div className="system-meta"><span>Results</span><strong>{payload?.count ?? 0}</strong></div>
      </div>
      <Link className="user-card" href="/"><span className="avatar">KB</span><span><strong>Kai&apos;s Radar</strong><small>{operator.authenticated ? "Operator unlocked" : "Open System Health"}</small></span><b>···</b></Link>
    </aside>

    <section className={`workspace ${styles.workspace}`}>
      <header className={styles.header}>
        <div><p className="eyebrow">MEDIA DISCOVERY</p><h1>Video G</h1><p>Find short demos, launch clips, tutorials, campaigns, and video posts from across the web.</p></div>
        <div className={styles.coverageBadge}><i className={backendReady ? styles.live : ""} /><span>{backendReady ? searching ? "Searching live" : "Ready" : operator.authenticated ? capabilityState === "loading" ? "Checking backend" : "Backend unavailable" : "Operator locked"}</span><small>{sourceRows.length ? `${availableCount}/${sourceRows.length} sources available` : capabilityState === "loading" ? "Checking coverage" : "No provider status"}</small></div>
      </header>

      <section className={`${styles.searchPanel} glass-panel`}>
        <form onSubmit={runSearch}>
          <label className={styles.searchField}>
            <span className={styles.searchGlyph}>⌕</span>
            <textarea value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search DeepSeek, Kimi K3, Claude Code, paste a post, or describe what you need…" rows={3} aria-label="Video G search" disabled={!backendReady || busy} />
            {query && <button className={styles.clearInput} type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
          </label>
          {inputSource && <div className={styles.detected}><span className={styles.sourceIcon}>{sourceMark(inputSource)}</span><p><strong>{SOURCE_LABELS[inputSource] ?? "Website"} URL detected</strong><small>Video G will inspect this source, resolve the subject, then expand across related accounts and platforms.</small></p></div>}
          <div className={styles.searchControls}>
            <div className={styles.toggles}>
              <label><input aria-label="Deep Search" type="checkbox" checked={deepSearch} onChange={(event) => setDeepSearch(event.target.checked)} /><i /><span><b>Deep Search</b><small>Aliases, older posts & cross-posts</small></span></label>
              <label><input aria-label="Old Gems" type="checkbox" checked={oldGems} onChange={(event) => setOldGems(event.target.checked)} /><i /><span><b>Old Gems</b><small>Prioritize useful older clips</small></span></label>
            </div>
            <div className={styles.searchActions}>{payload && <button type="button" onClick={clearSearch}>Clear</button>}<button className={styles.searchSubmit} type="submit" disabled={!query.trim() || !backendReady || busy}>{busy ? <><i className={styles.spinner} />Searching</> : <>Search <span>→</span></>}</button></div>
          </div>
        </form>
        {!payload && <div className={styles.discoveryRow}>
          <div><span>Try an example</span><div>{EXAMPLES.map((example) => <button type="button" onClick={() => { setQuery(example); void runSearch(undefined, { value: example }); }} disabled={!backendReady} key={example}>{example}</button>)}</div></div>
          {recent.length > 0 && <div><span>Recent searches</span><div>{recent.slice(0, 4).map((item) => <button type="button" onClick={() => void loadSearch(item.id)} key={item.id}><i className={item.state === "completed" ? styles.doneDot : ""} />{item.entity ?? item.input}</button>)}</div></div>}
        </div>}
      </section>

      {!operator.loading && !operator.authenticated && <section className={`${styles.accessState} glass-panel`}><span>◇</span><div><p className="modal-eyebrow">OPERATOR ACCESS</p><h2>Unlock Radar to run provider searches.</h2><p>{operator.reason ?? "Video G writes durable search jobs and saved collections, so it uses the same protected operator session as the rest of Radar."}</p></div><Link href="/">Open System Health <b>→</b></Link></section>}
      {operator.authenticated && capabilityState === "unavailable" && <section className={`${styles.accessState} glass-panel`}><span>!</span><div><p className="modal-eyebrow">DATA CONNECTION</p><h2>Video G&apos;s backend is unavailable.</h2><p>The interface remains accessible, but provider search is disabled until the private API bridge and worker are healthy.</p></div><Link href="/">Open System Health <b>→</b></Link></section>}

      {message && <div className={styles.toast} role="status">{message}<button type="button" onClick={() => setMessage("")}>×</button></div>}

      {payload?.search.suggestions.length ? <section className={`${styles.ambiguity} glass-panel`}><div><span>?</span><p><strong>Which {payload.search.input} did you mean?</strong><small>Video G paused instead of searching the wrong entity.</small></p></div><div>{payload.search.suggestions.map((suggestion) => <button type="button" onClick={() => void runSearch(undefined, { entityKey: suggestion.key })} key={suggestion.key}><strong>{suggestion.name}</strong><span>{suggestion.description}</span><b>Search this →</b></button>)}</div></section> : null}

      {payload && !payload.search.suggestions.length ? <>
        <section className={`${styles.progress} glass-panel`} aria-live="polite">
          <header><div><p className="modal-eyebrow">{searching ? "SEARCH IN PROGRESS" : payload.search.partial ? "SEARCH COMPLETE · LIMITED COVERAGE" : "SEARCH COMPLETE"}</p><h2>{payload.search.entity.name ?? payload.search.input}</h2><span>{Math.round((payload.search.entity.certainty ?? 0) * 100)}% entity certainty · {payload.count} grouped media result{payload.count === 1 ? "" : "s"}{payload.cached ? " · cached" : ""}</span></div><div className={styles.progressActions}>{!searching && <button type="button" onClick={() => void runSearch(undefined, { refresh: true })}>Search again</button>}<b>{searching ? `${sourceRows.filter((source) => source.state === "searched").length}/${sourceRows.length || 1}` : payload.count}</b><small>{searching ? "sources complete" : "results"}</small></div></header>
          <div className={styles.progressTrack}><i style={{ width: `${searching ? Math.max(8, sourceRows.filter((source) => source.state === "searched").length / Math.max(1, sourceRows.length) * 100) : 100}%` }} /></div>
          <div className={styles.sourceProgress}>{sourceRows.map((source) => <button type="button" title={source.reason} className={styles[source.state] ?? ""} key={source.source}><i>{source.state === "searched" ? "✓" : source.state === "searching" ? "··" : source.state === "queued" ? "…" : source.state === "credentials_required" ? "!" : source.state === "rate_limited" ? "↻" : "–"}</i><span>{source.state === "searching" ? "Searching" : source.state === "searched" ? "Searched" : source.state.replaceAll("_", " ")} {source.name}</span><small>{source.result_count ? `${source.result_count} found` : source.methods?.join(" + ") ?? source.reason}</small></button>)}</div>
          {payload.search.partial && !searching && <footer><span>!</span><p><strong>Partial search completed</strong><small>Valid results from completed sources are shown. Open a source status above to see missing credentials, quotas, or restrictions.</small></p></footer>}
        </section>

        <div className={styles.resultToolbar}>
          <div><h2>{filters.savedOnly ? "Saved clips" : oldGems ? "Old Gems" : "Media results"}</h2><p>{payload.count} media result{payload.count === 1 ? "" : "s"} · grouped by underlying media · validation shown per source</p></div>
          <div><button className={styles.mobileFilterButton} type="button" aria-expanded={mobileFilters} aria-controls="video-g-filters" onClick={() => setMobileFilters((value) => !value)}>Filters <span>{Object.values(filters).filter((value) => value && value !== "all" && value !== "any" && value !== "best_match").length}</span></button><FilterSelect label="Sort" value={filters.sort} onChange={(value) => setFilters((current) => ({ ...current, sort: value }))}><option value="best_match">Best Match</option><option value="oldest_first">Oldest First</option><option value="newest_first">Newest First</option><option value="most_engaged">Normalized Heat</option><option value="official_first">Official First</option><option value="shortest">Shortest</option><option value="hidden_gems">Hidden Gems</option></FilterSelect></div>
        </div>

        <div className={styles.resultsLayout}>
          <aside id="video-g-filters" className={`${styles.filters} ${mobileFilters ? styles.filtersOpen : ""} glass-panel`}>
            <header><div><p className="modal-eyebrow">REFINE</p><h3>Filters</h3></div><button type="button" onClick={() => setFilters({ platform: "", official: "", mediaType: "", contentType: "", dateRange: "all", duration: "any", language: "", orientation: "", captions: "", playable: "", savedOnly: false, sort: "best_match" })}>Reset</button></header>
            <FilterSelect label="Platform" value={filters.platform} onChange={(value) => setFilters((current) => ({ ...current, platform: value }))}><option value="">All platforms</option>{Object.entries(SOURCE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</FilterSelect>
            <FilterSelect label="Source type" value={filters.official} onChange={(value) => setFilters((current) => ({ ...current, official: value }))}><option value="">Official + community</option><option value="true">Official only</option><option value="false">Community only</option></FilterSelect>
            <FilterSelect label="Media type" value={filters.mediaType} onChange={(value) => setFilters((current) => ({ ...current, mediaType: value }))}><option value="">Video, GIF & Short</option><option value="video">Video</option><option value="gif">GIF</option><option value="short">Short</option><option value="screen_recording">Screen recording</option></FilterSelect>
            <FilterSelect label="Content type" value={filters.contentType} onChange={(value) => setFilters((current) => ({ ...current, contentType: value }))}><option value="">All content</option>{CONTENT_TYPES.map((value) => <option value={value} key={value}>{value}</option>)}</FilterSelect>
            <FilterSelect label="Date range" value={filters.dateRange} onChange={(value) => setFilters((current) => ({ ...current, dateRange: value }))}><option value="all">Any date</option><option value="week">Past week</option><option value="month">Past month</option><option value="year">Past year</option></FilterSelect>
            <FilterSelect label="Duration" value={filters.duration} onChange={(value) => setFilters((current) => ({ ...current, duration: value }))}><option value="any">Any duration</option><option value="under_60">Under 60 sec</option><option value="1_4_min">1–4 minutes</option><option value="over_4_min">Over 4 minutes</option></FilterSelect>
            <FilterSelect label="Language" value={filters.language} onChange={(value) => setFilters((current) => ({ ...current, language: value }))}><option value="">Any language</option><option value="en">English</option><option value="zh">Chinese</option><option value="ja">Japanese</option><option value="ko">Korean</option></FilterSelect>
            <FilterSelect label="Format" value={filters.orientation} onChange={(value) => setFilters((current) => ({ ...current, orientation: value }))}><option value="">Any format</option><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option><option value="square">Square</option></FilterSelect>
            <div className={styles.checkFilters}><label><input type="checkbox" checked={filters.captions === "true"} onChange={(event) => setFilters((current) => ({ ...current, captions: event.target.checked ? "true" : "" }))} /> Has captions or transcript</label><label><input type="checkbox" checked={filters.playable === "true"} onChange={(event) => setFilters((current) => ({ ...current, playable: event.target.checked ? "true" : "" }))} /> Playable inside Radar</label><label><input type="checkbox" checked={filters.savedOnly} onChange={(event) => setFilters((current) => ({ ...current, savedOnly: event.target.checked }))} /> Saved only</label></div>
            <div className={styles.oldGemsCallout}><span>◇</span><p><strong>Old Gems</strong><small>Older clips are not penalized unless you choose Newest First.</small></p><button type="button" className={oldGems ? styles.selectedMode : ""} onClick={() => setOldGems((value) => !value)}>{oldGems ? "On" : "Off"}</button></div>
          </aside>

          <section className={styles.mediaGrid}>
            {payload.items.map((item) => <article className={`${styles.mediaCard} glass-panel`} key={item.id}>
              <button className={styles.thumbnail} type="button" onClick={() => setSelected(item)} aria-label={`Open ${item.title ?? "video result"}`}><MediaSurface item={item} /><span className={styles.play}>▶</span><span className={styles.platform}><i>{sourceMark(item.preferred_occurrence.source)}</i>{SOURCE_LABELS[item.preferred_occurrence.source] ?? item.preferred_occurrence.source}</span><span className={styles.duration}>{durationLabel(item.duration_seconds)}</span>{item.also_posted_count > 0 && <span className={styles.crosspost}>＋{item.also_posted_count} sources</span>}</button>
              <div className={styles.cardBody}>
                <div className={styles.cardMeta}><span className={item.preferred_occurrence.official ? styles.official : styles.community}>{item.preferred_occurrence.official ? "Official" : "Community"}</span><span>{item.content_type ?? "Media result"}</span><span>{item.preferred_occurrence.validation_status === "verified" ? "Verified" : "Indexed"}</span><time>{dateLabel(item.preferred_occurrence.published_at)}</time></div>
                <button className={styles.cardTitle} type="button" onClick={() => setSelected(item)}>{item.title ?? item.preferred_occurrence.post_text ?? "Untitled media result"}</button>
                <p className={styles.author}>{item.preferred_occurrence.author_handle ? `@${item.preferred_occurrence.author_handle}` : item.preferred_occurrence.author_name ?? SOURCE_LABELS[item.preferred_occurrence.source]}{engagementLabel(item.preferred_occurrence.engagement) ? <span> · {engagementLabel(item.preferred_occurrence.engagement)}</span> : null}</p>
                {(item.transcript || item.description || item.preferred_occurrence.post_text) && <p className={styles.excerpt}>{item.transcript ?? item.description ?? item.preferred_occurrence.post_text}</p>}
                <div className={styles.reasonRow}>{item.ranking_reasons.slice(0, 2).map((reason) => <span key={reason}>{reason}</span>)}</div>
                <div className={styles.scoreRow}><span><small>Match</small><b>{scoreValue(item.scores.relevance)}</b></span><span><small>Confidence</small><b>{scoreValue(item.scores.confidence)}</b></span><span><small>Heat</small><b>{scoreValue(item.scores.heat)}</b></span><span><small>Opportunity</small><b>{scoreValue(item.scores.opportunity)}</b></span></div>
              </div>
              <footer className={styles.cardActions}><button type="button" className={item.saved_collection_ids.includes(collectionId) ? styles.saved : ""} onClick={() => void toggleSave(item)}>{item.saved_collection_ids.includes(collectionId) ? "✓ In collection" : item.saved ? "◇ Save here" : "◇ Save"}</button><button type="button" onClick={() => void copy(item.preferred_occurrence.url, "Original link copied.")}>⌁ Copy link</button><a href={item.preferred_occurrence.url} target="_blank" rel="noreferrer">Open original ↗</a></footer>
            </article>)}

            {!payload.items.length && !searching && <div className={`${styles.emptyState} glass-panel`}><span>▶</span><h2>{payload.count ? "No clips match these filters" : "No relevant videos found"}</h2><p>{payload.count ? "Reset one or more filters to reveal the media in this search." : unavailableCount ? "The completed sources did not return a relevant media result. Some providers were unavailable; their exact status is shown above." : "Try an alias, official handle, product version, or Deep Search. Video G does not turn text-only pages into video results."}</p>{payload.count ? <button type="button" onClick={() => setFilters((current) => ({ ...current, platform: "", official: "", mediaType: "", contentType: "", dateRange: "all", duration: "any", language: "", orientation: "", captions: "", playable: "", savedOnly: false }))}>Reset filters</button> : <button type="button" onClick={() => setDeepSearch(true)}>Enable Deep Search</button>}</div>}

            {searching && payload.items.length === 0 && Array.from({ length: 6 }, (_, index) => <div className={`${styles.skeletonCard} glass-panel`} key={index}><i /><span /><span /><b /></div>)}

            {payload.next_cursor && !searching && <div className={styles.loadMore}><span>{payload.items.length} of {payload.count} results</span><button type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading more…" : "Load more results"}</button></div>}
          </section>
        </div>
      </> : null}

      {!payload && operator.authenticated && <section className={`${styles.startState} ${sourceRows.length ? "" : styles.startStateSolo}`}>
        <div className={`${styles.startHero} glass-panel`}><span className={styles.startMark}>G</span><p className="modal-eyebrow">SEARCH THE MEDIA LAYER</p><h2>One subject. Every useful clip.</h2><p>Video G resolves the entity, expands aliases and official accounts, then searches native APIs and approved public indexes. Native hydration and indexed discovery remain visibly distinct.</p><div><span><i>1</i>Interpret</span><b>→</b><span><i>2</i>Search</span><b>→</b><span><i>3</i>Validate</span><b>→</b><span><i>4</i>Group</span></div></div>
        {sourceRows.length > 0 && <div className={styles.sourceMatrix}>{sourceRows.map((source) => <article className="glass-panel" key={source.source}><i className={styles.sourceIcon}>{sourceMark(source.source)}</i><div><strong>{source.name}</strong><p>{source.reason}</p></div><span className={styles[source.state] ?? ""}>{source.state.replaceAll("_", " ")}</span></article>)}</div>}
      </section>}
    </section>

    {selected && <div className={styles.drawerBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeDrawer(); }}>
      <aside ref={drawerRef} tabIndex={-1} className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="video-g-detail-title">
        <button ref={drawerCloseRef} className={styles.drawerClose} type="button" onClick={closeDrawer} aria-label="Close detail">×</button>
        <div className={styles.drawerPlayer}><MediaSurface item={selected} large />{!selected.preferred_occurrence.playable_in_app && <div className={styles.openOverlay}><p>This source does not provide an approved in-app player.</p><a href={selected.preferred_occurrence.url} target="_blank" rel="noreferrer">Open original ↗</a></div>}</div>
        <div className={styles.drawerContent}>
          <div className={styles.drawerMeta}><span className={styles.sourceIcon}>{sourceMark(selected.preferred_occurrence.source)}</span><p><strong>{selected.preferred_occurrence.author_name ?? selected.preferred_occurrence.author_handle ?? SOURCE_LABELS[selected.preferred_occurrence.source]}</strong><small>{selected.preferred_occurrence.author_handle ? `@${selected.preferred_occurrence.author_handle} · ` : ""}{selected.preferred_occurrence.official ? "Official" : "Community"} · {dateLabel(selected.preferred_occurrence.published_at, true)}</small></p><span>{selected.content_type}</span></div>
          <h2 id="video-g-detail-title">{selected.title ?? "Media result"}</h2>
          {selected.preferred_occurrence.post_text && <section><h3>Original post</h3><p>{selected.preferred_occurrence.post_text}</p></section>}
          {selected.transcript ? <section><h3>Transcript or captions</h3><p>{selected.transcript}</p></section> : <section className={styles.unavailableSection}><h3>Transcript or captions</h3><p>No transcript was returned by this provider. Video G does not invent one.</p></section>}
          <section><h3>Why this matched</h3><div className={styles.drawerReasons}>{selected.ranking_reasons.map((reason) => <span key={reason}>✓ {reason}</span>)}</div><div className={styles.detailScores}><span><small>Heat</small><b>{scoreValue(selected.scores.heat)}</b></span><span><small>Confidence</small><b>{scoreValue(selected.scores.confidence)}</b></span><span><small>Relevance</small><b>{scoreValue(selected.scores.relevance)}</b></span><span><small>Opportunity</small><b>{scoreValue(selected.scores.opportunity)}</b></span></div></section>
          <section><h3>Known occurrences</h3><div className={styles.occurrences}>{selected.occurrences.map((occurrence) => <a href={occurrence.url} target="_blank" rel="noreferrer" key={occurrence.id}><i className={styles.sourceIcon}>{sourceMark(occurrence.source)}</i><p><strong>{SOURCE_LABELS[occurrence.source] ?? occurrence.source}{occurrence.official ? " · Official" : ""}</strong><small>{occurrence.author_handle ? `@${occurrence.author_handle} · ` : ""}{dateLabel(occurrence.published_at)} · {occurrence.validation_status} via {occurrence.discovery_method?.replaceAll("_", " ") ?? "provider evidence"}</small></p><span>Open ↗</span></a>)}</div></section>
          <section><h3>Save to a collection</h3><div className={styles.saveRow}><select value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>{collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name} ({collection.count})</option>)}</select><button type="button" onClick={() => void toggleSave(selected)}>{selected.saved_collection_ids.includes(collectionId) ? "Remove from collection" : "Save clip"}</button></div></section>
          <footer className={styles.drawerActions}><button type="button" onClick={() => void copy(`${selected.title ?? "Video"}\n${selected.preferred_occurrence.author_name ?? "Unknown author"}\n${selected.preferred_occurrence.url}`, "Source information copied.")}>Copy source information</button><a href={selected.preferred_occurrence.url} target="_blank" rel="noreferrer">Open original ↗</a></footer>
        </div>
      </aside>
    </div>}
  </main>;
}
