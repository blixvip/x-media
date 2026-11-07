export type SavedPost = {
  id: string;
  title: string;
  source_url: string;
  creator?: { username?: string; display_name?: string };
  score: number;
};

export type SavedAlert = {
  id: string;
  item_id: string;
  title: string;
  source_url: string;
  score: number;
  created_at: string;
};

export type DismissedSignal = { item_id: string; dismissed_at: string };
export type SnoozedSignal = { item_id: string; until: string };

export type SavedRadar = {
  version: 2;
  posts: SavedPost[];
  creators: string[];
  topics: string[];
  presets: string[];
  alerts: SavedAlert[];
  dismissed: DismissedSignal[];
  snoozed: SnoozedSignal[];
  alert_scope: "all" | "growing" | "launches" | "saved";
};

export const EMPTY_SAVED_RADAR: SavedRadar = { version: 2, posts: [], creators: [], topics: [], presets: [], alerts: [], dismissed: [], snoozed: [], alert_scope: "all" };

function safeXUrl(value: unknown, kind: "status" | "any" = "any") {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || (url.hostname !== "x.com" && url.hostname !== "www.x.com")) return false;
    return kind === "any" || /^\/[A-Za-z0-9_]{1,15}\/status\/\d{5,25}$/.test(url.pathname);
  } catch { return false; }
}

function safePost(value: unknown): SavedPost | null {
  if (!value || typeof value !== "object") return null;
  const post = value as Partial<SavedPost>;
  if (typeof post.id !== "string" || !post.id || typeof post.title !== "string" || !post.title.trim() || !safeXUrl(post.source_url, "status")) return null;
  const username = post.creator?.username;
  return {
    id: post.id.slice(0, 120), title: post.title.trim().slice(0, 500), source_url: post.source_url as string,
    ...(typeof username === "string" && /^@[A-Za-z0-9_]{1,15}$/.test(username) ? { creator: { username, display_name: post.creator?.display_name?.slice(0, 100) } } : {}),
    score: typeof post.score === "number" && Number.isFinite(post.score) ? Math.max(0, Math.min(100, Math.round(post.score))) : 0,
  };
}

function safeDispositionId(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 120 ? value.trim() : null;
}

export function parseSavedRadar(value: unknown, now = new Date()): SavedRadar {
  const root = value && typeof value === "object" ? value as Partial<SavedRadar> : {};
  const unique = (values: unknown, validator: (item: string) => boolean, limit: number) => Array.isArray(values)
    ? Array.from(new Set(values.filter((item): item is string => typeof item === "string" && validator(item)).map((item) => item.trim()))).slice(-limit)
    : [];
  const alerts = Array.isArray(root.alerts) ? root.alerts.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const alert = value as Partial<SavedAlert>;
    if (typeof alert.id !== "string" || typeof alert.item_id !== "string" || typeof alert.title !== "string" || !safeXUrl(alert.source_url, "status") || !Number.isFinite(Date.parse(alert.created_at ?? ""))) return [];
    return [{ id: alert.id.slice(0, 160), item_id: alert.item_id.slice(0, 120), title: alert.title.slice(0, 500), source_url: alert.source_url as string, score: Math.max(0, Math.min(100, Number(alert.score) || 0)), created_at: new Date(alert.created_at as string).toISOString() }];
  }).slice(-100) : [];
  const nowMs = now.getTime();
  const dismissedCutoff = nowMs - 30 * 24 * 60 * 60 * 1_000;
  const dismissed = Array.isArray(root.dismissed) ? root.dismissed.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Partial<DismissedSignal>;
    const itemId = safeDispositionId(item.item_id);
    const timestamp = Date.parse(item.dismissed_at ?? "");
    return itemId && Number.isFinite(timestamp) && timestamp >= dismissedCutoff && timestamp <= nowMs + 5 * 60 * 1_000
      ? [{ item_id: itemId, dismissed_at: new Date(timestamp).toISOString() }]
      : [];
  }).slice(-200) : [];
  const snoozed = Array.isArray(root.snoozed) ? root.snoozed.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Partial<SnoozedSignal>;
    const itemId = safeDispositionId(item.item_id);
    const until = Date.parse(item.until ?? "");
    return itemId && Number.isFinite(until) && until > nowMs && until <= nowMs + 30 * 24 * 60 * 60 * 1_000
      ? [{ item_id: itemId, until: new Date(until).toISOString() }]
      : [];
  }).slice(-100) : [];
  return {
    version: 2,
    posts: Array.isArray(root.posts) ? root.posts.flatMap((post) => safePost(post) ?? []).slice(-50) : [],
    creators: unique(root.creators, (item) => /^@[A-Za-z0-9_]{1,15}$/.test(item.trim()), 50),
    topics: unique(root.topics, (item) => item.trim().length > 0 && item.trim().length <= 120, 50),
    presets: unique(root.presets, (item) => item.trim().length > 0 && item.trim().length <= 256, 12),
    alerts,
    dismissed,
    snoozed,
    alert_scope: ["all", "growing", "launches", "saved"].includes(root.alert_scope ?? "") ? root.alert_scope as SavedRadar["alert_scope"] : "all",
  };
}

export function dismissSignal(state: SavedRadar, itemId: string, now = new Date()): SavedRadar {
  const safeId = safeDispositionId(itemId);
  if (!safeId) return state;
  return {
    ...state,
    dismissed: [...state.dismissed.filter((item) => item.item_id !== safeId), { item_id: safeId, dismissed_at: now.toISOString() }].slice(-200),
    snoozed: state.snoozed.filter((item) => item.item_id !== safeId),
  };
}

export function snoozeSignal(state: SavedRadar, itemId: string, now = new Date()): SavedRadar {
  const safeId = safeDispositionId(itemId);
  if (!safeId) return state;
  const until = new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString();
  return {
    ...state,
    snoozed: [...state.snoozed.filter((item) => item.item_id !== safeId), { item_id: safeId, until }].slice(-100),
    dismissed: state.dismissed.filter((item) => item.item_id !== safeId),
  };
}

export function restoreSignal(state: SavedRadar, itemId: string): SavedRadar {
  return { ...state, dismissed: state.dismissed.filter((item) => item.item_id !== itemId), snoozed: state.snoozed.filter((item) => item.item_id !== itemId) };
}

export function isSignalHidden(state: SavedRadar, itemId: string, now = new Date()) {
  return state.dismissed.some((item) => item.item_id === itemId) || state.snoozed.some((item) => item.item_id === itemId && Date.parse(item.until) > now.getTime());
}

export function toggleSavedPost(state: SavedRadar, post: SavedPost): SavedRadar {
  const safe = safePost(post);
  if (!safe) return state;
  const exists = state.posts.some((item) => item.id === safe.id);
  return { ...state, posts: exists ? state.posts.filter((item) => item.id !== safe.id) : [...state.posts, safe].slice(-50) };
}

export function addAlertEvent(state: SavedRadar, alert: SavedAlert): SavedRadar {
  const parsed = parseSavedRadar({ ...state, alerts: [...state.alerts.filter((item) => item.id !== alert.id), alert] });
  return { ...state, alerts: parsed.alerts };
}
