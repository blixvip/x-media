import type { D1DatabaseLike } from "./x-automation-store.ts";

export type XMasterDraftFormat = "reply" | "quote" | "post" | "thread" | "article" | "meme";
export type XMasterDraftState = "draft" | "ready" | "scheduled" | "published" | "archived";

export type XMasterDraft = {
  id: string;
  source_text: string;
  source_url: string | null;
  author_name: string | null;
  author_handle: string | null;
  body: string;
  format: XMasterDraftFormat;
  state: XMasterDraftState;
  media_id: string | null;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  revision?: number;
};

export type ExtensionDeviceRecord = {
  id: string;
  label: string;
  token_hash: string;
  scopes: string[];
  created_at: string;
  last_used_at: string;
  revoked_at: string | null;
};

export type MediaJobKind = "x_video_drive" | "tiktok_captions";
export type MediaJobInput = { kind: MediaJobKind; source_url: string; title: string | null };
export type MediaJobState = "queued" | "processing" | "complete" | "failed";
export type MediaJob = MediaJobInput & {
  id: string;
  state: MediaJobState;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

const CREATE_DRAFTS = `CREATE TABLE IF NOT EXISTS x_master_drafts (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  source_text TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  author_name TEXT,
  author_handle TEXT,
  body TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT 'post',
  state TEXT NOT NULL DEFAULT 'draft',
  media_id TEXT,
  scheduled_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (owner_id, id)
)`;
const CREATE_DRAFT_INDEX = "CREATE INDEX IF NOT EXISTS idx_x_master_drafts_owner_state_updated ON x_master_drafts (owner_id, state, updated_at DESC)";
const CREATE_PAIRINGS = `CREATE TABLE IF NOT EXISTS x_master_extension_pairings (
  owner_id TEXT NOT NULL,
  code_hash TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
)`;
const CREATE_DEVICES = `CREATE TABLE IF NOT EXISTS x_master_extension_devices (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  revoked_at INTEGER,
  PRIMARY KEY (owner_id, id)
)`;
const CREATE_DEVICE_INDEX = "CREATE INDEX IF NOT EXISTS idx_x_master_devices_token_active ON x_master_extension_devices (token_hash, revoked_at)";
const CREATE_MEDIA_JOBS = `CREATE TABLE IF NOT EXISTS x_master_media_jobs (
  owner_id TEXT NOT NULL,
  id TEXT NOT NULL,
  kind TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT,
  state TEXT NOT NULL,
  result_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (owner_id, id)
)`;
const CREATE_MEDIA_INDEX = "CREATE INDEX IF NOT EXISTS idx_x_master_media_owner_state_updated ON x_master_media_jobs (owner_id, state, updated_at DESC)";
const CREATE_AUDIT = `CREATE TABLE IF NOT EXISTS x_master_audit_log (
  owner_id TEXT NOT NULL,
  id TEXT PRIMARY KEY NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
)`;
const CREATE_AUDIT_INDEX = "CREATE INDEX IF NOT EXISTS idx_x_master_audit_owner_created ON x_master_audit_log (owner_id, created_at DESC)";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const X_HOSTS = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.x.com", "mobile.twitter.com"]);
const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"]);
const FORMATS = new Set<XMasterDraftFormat>(["reply", "quote", "post", "thread", "article", "meme"]);
const STATES = new Set<XMasterDraftState>(["draft", "ready", "scheduled", "published", "archived"]);
const DEVICE_SCOPES = Object.freeze(["capture:write", "drafts:write", "library:write", "generate:write", "media:write", "references:write"]);

function boundedText(value: unknown, maximum: number, field: string, allowEmpty = true) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  const clean = value.replace(/\r/g, "").trim();
  if (clean.length > maximum) throw new Error(`${field} is too long.`);
  if (!allowEmpty && !clean) throw new Error(`${field} is required.`);
  return clean;
}

function optionalTimestamp(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 64 || !Number.isFinite(Date.parse(value))) throw new Error(`${field} is invalid.`);
  return new Date(value).toISOString();
}

function safeExternalUrl(value: unknown, hosts: Set<string>, field: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2_048) throw new Error(`${field} is invalid.`);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !hosts.has(url.hostname.toLowerCase()) || url.username || url.password || url.hash) throw new Error();
    return url.toString();
  } catch { throw new Error(`${field} is invalid.`); }
}

// Inspiration is a link, never a server-side download. Media jobs keep their
// separate provider allowlists below.
function inspirationUrl(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Source URL is invalid.');
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !hostname.includes('.') ||
      hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') ||
      /^[\d.]+$/.test(hostname) || hostname.includes(':')) throw new Error();
    url.hash = '';
    return url.href;
  } catch { throw new Error('Source URL is invalid.'); }
}

function cleanHandle(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("Author handle is invalid.");
  const handle = value.trim().replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new Error("Author handle is invalid.");
  return handle;
}

export function normalizeDraftInput(value: unknown, now = new Date()): XMasterDraft {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Number.isFinite(now.getTime())) throw new Error("Invalid draft.");
  const input = value as Record<string, unknown>;
  const sourceText = boundedText(input.source_text ?? input.text, 32_000, "Source text");
  const body = boundedText(input.body ?? input.myDraft ?? (input.source_text ? "" : input.text), 32_000, "Draft body");
  if (!sourceText && !body) throw new Error("Draft text is required.");
  const id = input.id === undefined ? `draft-${crypto.randomUUID()}` : boundedText(input.id, 128, "Draft id", false);
  if (!ID_PATTERN.test(id)) throw new Error("Draft id is invalid.");
  const format = typeof input.format === "string" && FORMATS.has(input.format as XMasterDraftFormat) ? input.format as XMasterDraftFormat : "post";
  const state = typeof input.state === "string" && STATES.has(input.state as XMasterDraftState) ? input.state as XMasterDraftState : "draft";
  if (state === 'scheduled' || state === 'published') throw new Error('Publishing states require an approved publishing action.');
  const createdAt = optionalTimestamp(input.created_at ?? input.createdAt, "Created time") ?? now.toISOString();
  const updatedAt = optionalTimestamp(input.updated_at ?? input.updatedAt, "Updated time") ?? createdAt;
  const scheduledAt = optionalTimestamp(input.scheduled_at ?? input.scheduledAt, "Scheduled time");
  let mediaId: string | null = null;
  if (input.media_id !== undefined && input.media_id !== null && input.media_id !== "") {
    if (typeof input.media_id !== "string" || !ID_PATTERN.test(input.media_id)) throw new Error("Media id is invalid.");
    mediaId = input.media_id;
  }
  return {
    id,
    source_text: sourceText,
    source_url: inspirationUrl(input.source_url ?? input.sourceUrl),
    author_name: boundedText(input.author_name ?? input.authorName, 200, "Author name") || null,
    author_handle: cleanHandle(input.author_handle ?? input.authorHandle),
    body,
    format,
    state,
    media_id: mediaId,
    scheduled_at: scheduledAt,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export function extensionOriginAllowed(origin: string | null) {
  return typeof origin === "string" && /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
}

export function parseBearerToken(value: string | null) {
  if (!value) return null;
  const match = value.match(/^Bearer (xm_[A-Za-z0-9_-]{40,160})$/);
  return match?.[1] ?? null;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function digestSecret(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createExtensionCredential(labelInput: unknown, now = new Date()) {
  const label = boundedText(labelInput, 80, "Device label", false);
  const token = `xm_${base64Url(crypto.getRandomValues(new Uint8Array(36)))}`;
  const timestamp = now.toISOString();
  return {
    token,
    record: {
      id: `device-${crypto.randomUUID()}`,
      label,
      token_hash: await digestSecret(token),
      scopes: [...DEVICE_SCOPES],
      created_at: timestamp,
      last_used_at: timestamp,
      revoked_at: null,
    } satisfies ExtensionDeviceRecord,
  };
}

export function parseMediaJobInput(value: unknown): MediaJobInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const kind = input.kind;
  if (kind !== "x_video_drive" && kind !== "tiktok_captions") return null;
  try {
    const sourceUrl = safeExternalUrl(input.source_url ?? input.sourceUrl, kind === "x_video_drive" ? X_HOSTS : TIKTOK_HOSTS, "Source URL");
    if (!sourceUrl) return null;
    return { kind, source_url: sourceUrl, title: boundedText(input.title, 140, "Title") || null };
  } catch { return null; }
}

export async function initializeXMasterStore(database: D1DatabaseLike) {
  await database.batch([
    database.prepare(CREATE_DRAFTS),
    database.prepare(CREATE_DRAFT_INDEX),
    database.prepare(CREATE_PAIRINGS),
    database.prepare(CREATE_DEVICES),
    database.prepare(CREATE_DEVICE_INDEX),
    database.prepare(CREATE_MEDIA_JOBS),
    database.prepare(CREATE_MEDIA_INDEX),
    database.prepare(CREATE_AUDIT),
    database.prepare(CREATE_AUDIT_INDEX),
  ]);
  // Additive upgrade for existing local stores; hosted rollout applies the same migration.
  const columns = await database.prepare('PRAGMA table_info(x_master_drafts)').all<{name:string}>();
  if (!columns.results?.some(column => column.name === 'revision')) {
    try { await database.prepare('ALTER TABLE x_master_drafts ADD COLUMN revision INTEGER NOT NULL DEFAULT 1').run(); }
    catch (error) {
      const latest = await database.prepare('PRAGMA table_info(x_master_drafts)').all<{name:string}>();
      if (!latest.results?.some(column => column.name === 'revision')) throw error;
    }
  }
}

type DraftRow = {
  id: string; source_text: string; source_url: string | null; author_name: string | null; author_handle: string | null;
  body: string; format: XMasterDraftFormat; state: XMasterDraftState; media_id: string | null; scheduled_at: number | null;
  created_at: number; updated_at: number; revision: number;
};

function rowToDraft(row: DraftRow): XMasterDraft {
  return { ...row, scheduled_at: row.scheduled_at ? new Date(row.scheduled_at * 1_000).toISOString() : null, created_at: new Date(row.created_at * 1_000).toISOString(), updated_at: new Date(row.updated_at * 1_000).toISOString() };
}

export async function listXMasterDrafts(database: D1DatabaseLike, ownerId: string, limit = 100) {
  const rows = await database.prepare(`SELECT id, source_text, source_url, author_name, author_handle, body, format, state, media_id, scheduled_at, created_at, updated_at, revision
    FROM x_master_drafts WHERE owner_id = ?1 ORDER BY updated_at DESC LIMIT ?2`).bind(ownerId, Math.max(1, Math.min(200, Math.floor(limit)))).all<DraftRow>();
  return (rows.results ?? []).map(rowToDraft);
}

export class DraftConflictError extends Error {
  constructor() { super('This draft changed on another device. Load the latest version or save your edits as a copy.'); this.name = 'DraftConflictError'; }
}

export async function getXMasterDraft(database: D1DatabaseLike, ownerId: string, id: string) {
  const row = await database.prepare('SELECT id,source_text,source_url,author_name,author_handle,body,format,state,media_id,scheduled_at,created_at,updated_at,revision FROM x_master_drafts WHERE owner_id=? AND id=?').bind(ownerId,id).first<DraftRow>();
  return row ? rowToDraft(row) : null;
}

export async function saveXMasterDraft(database: D1DatabaseLike, ownerId: string, draft: XMasterDraft, expectedRevision?: number) {
  if (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) throw new Error('Invalid draft revision.');
  const previous = await getXMasterDraft(database, ownerId, draft.id);
  const fields = ['source_text','source_url','author_name','author_handle','body','format','state','media_id','scheduled_at'] as const;
  if (previous && fields.every(key => previous[key] === draft[key])) return previous;
  if (previous && previous.revision !== expectedRevision) throw new DraftConflictError();
  if (!previous && expectedRevision !== undefined && expectedRevision !== 0) throw new DraftConflictError();
  const result = await database.prepare(`INSERT INTO x_master_drafts (owner_id, id, source_text, source_url, author_name, author_handle, body, format, state, media_id, scheduled_at, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
    ON CONFLICT(owner_id, id) DO UPDATE SET source_text=excluded.source_text, source_url=excluded.source_url, author_name=excluded.author_name, author_handle=excluded.author_handle, body=excluded.body, format=excluded.format, state=excluded.state, media_id=excluded.media_id, scheduled_at=excluded.scheduled_at, updated_at=excluded.updated_at, revision=x_master_drafts.revision+1 WHERE x_master_drafts.revision=?14`)
    .bind(ownerId, draft.id, draft.source_text, draft.source_url, draft.author_name, draft.author_handle, draft.body, draft.format, draft.state, draft.media_id, draft.scheduled_at ? Math.floor(Date.parse(draft.scheduled_at) / 1_000) : null, Math.floor(Date.parse(draft.created_at) / 1_000), Math.floor(Date.now() / 1_000), expectedRevision ?? 0).run();
  if (!result.meta?.changes) throw new DraftConflictError();
  return (await getXMasterDraft(database, ownerId, draft.id))!;
}

export async function deleteXMasterDraft(database: D1DatabaseLike, ownerId: string, id: string) {
  if (!ID_PATTERN.test(id)) return false;
  const result = await database.prepare("DELETE FROM x_master_drafts WHERE owner_id = ?1 AND id = ?2").bind(ownerId, id).run();
  return (result.meta?.changes ?? 0) === 1;
}

export async function createPairingCode(database: D1DatabaseLike, ownerId: string, now = new Date()) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const code = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  const codeHash = await digestSecret(code);
  const createdAt = Math.floor(now.getTime() / 1_000);
  const expiresAt = createdAt + 10 * 60;
  await database.prepare("DELETE FROM x_master_extension_pairings WHERE owner_id = ?1 OR expires_at <= ?2").bind(ownerId, createdAt).run();
  await database.prepare("INSERT INTO x_master_extension_pairings (owner_id, code_hash, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)").bind(ownerId, codeHash, expiresAt, createdAt).run();
  return { code, expires_at: new Date(expiresAt * 1_000).toISOString() };
}

export async function claimPairingCode(database: D1DatabaseLike, code: string, label: string, now = new Date()) {
  if (!/^[A-Z2-9]{8}$/.test(code)) return null;
  const hash = await digestSecret(code);
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  const row = await database.prepare("SELECT owner_id FROM x_master_extension_pairings WHERE code_hash = ?1 AND expires_at > ?2").bind(hash, nowSeconds).first<{ owner_id: string }>();
  if (!row) return null;
  const credential = await createExtensionCredential(label, now);
  await database.batch([
    database.prepare("DELETE FROM x_master_extension_pairings WHERE code_hash = ?1").bind(hash),
    database.prepare("INSERT INTO x_master_extension_devices (owner_id, id, label, token_hash, scopes_json, created_at, last_used_at, revoked_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, NULL)").bind(row.owner_id, credential.record.id, credential.record.label, credential.record.token_hash, JSON.stringify(credential.record.scopes), nowSeconds),
  ]);
  return { owner_id: row.owner_id, ...credential };
}

export async function authenticateExtensionToken(database: D1DatabaseLike, token: string, requiredScope?: string) {
  const hash = await digestSecret(token);
  const row = await database.prepare("SELECT owner_id, id, scopes_json FROM x_master_extension_devices WHERE token_hash = ?1 AND revoked_at IS NULL").bind(hash).first<{ owner_id: string; id: string; scopes_json: string }>();
  if (!row) return null;
  let scopes: string[] = [];
  try { const parsed = JSON.parse(row.scopes_json); if (Array.isArray(parsed)) scopes = parsed.filter((scope): scope is string => typeof scope === "string"); } catch { return null; }
  if (requiredScope && !scopes.includes(requiredScope)) return null;
  await database.prepare("UPDATE x_master_extension_devices SET last_used_at = ?2 WHERE token_hash = ?1").bind(hash, Math.floor(Date.now() / 1_000)).run();
  return { owner_id: row.owner_id, device_id: row.id, scopes };
}

export async function listExtensionDevices(database: D1DatabaseLike, ownerId: string) {
  const rows = await database.prepare("SELECT id, label, scopes_json, created_at, last_used_at, revoked_at FROM x_master_extension_devices WHERE owner_id = ?1 ORDER BY created_at DESC").bind(ownerId).all<{ id: string; label: string; scopes_json: string; created_at: number; last_used_at: number; revoked_at: number | null }>();
  return (rows.results ?? []).map((row) => ({ id: row.id, label: row.label, scopes: JSON.parse(row.scopes_json) as string[], created_at: new Date(row.created_at * 1_000).toISOString(), last_used_at: new Date(row.last_used_at * 1_000).toISOString(), revoked_at: row.revoked_at ? new Date(row.revoked_at * 1_000).toISOString() : null }));
}

export async function revokeExtensionDevice(database: D1DatabaseLike, ownerId: string, id: string) {
  if (!ID_PATTERN.test(id)) return false;
  const result = await database.prepare("UPDATE x_master_extension_devices SET revoked_at = ?3 WHERE owner_id = ?1 AND id = ?2 AND revoked_at IS NULL").bind(ownerId, id, Math.floor(Date.now() / 1_000)).run();
  return (result.meta?.changes ?? 0) === 1;
}

export async function createMediaJob(database: D1DatabaseLike, ownerId: string, input: MediaJobInput, now = new Date()) {
  const job: MediaJob = { ...input, id: `media-${crypto.randomUUID()}`, state: "queued", result: null, error: null, created_at: now.toISOString(), updated_at: now.toISOString() };
  const timestamp = Math.floor(now.getTime() / 1_000);
  await database.prepare("INSERT INTO x_master_media_jobs (owner_id, id, kind, source_url, title, state, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)").bind(ownerId, job.id, job.kind, job.source_url, job.title, job.state, timestamp).run();
  return job;
}

export async function updateMediaJob(database: D1DatabaseLike, ownerId: string, id: string, state: MediaJobState, result: Record<string, unknown> | null, error: string | null) {
  await database.prepare("UPDATE x_master_media_jobs SET state = ?3, result_json = ?4, error = ?5, updated_at = ?6 WHERE owner_id = ?1 AND id = ?2").bind(ownerId, id, state, result ? JSON.stringify(result) : null, error?.slice(0, 300) ?? null, Math.floor(Date.now() / 1_000)).run();
}

export async function listMediaJobs(database: D1DatabaseLike, ownerId: string, limit = 50) {
  const rows = await database.prepare("SELECT id, kind, source_url, title, state, result_json, error, created_at, updated_at FROM x_master_media_jobs WHERE owner_id = ?1 ORDER BY updated_at DESC LIMIT ?2").bind(ownerId, Math.max(1, Math.min(100, Math.floor(limit)))).all<{ id: string; kind: MediaJobKind; source_url: string; title: string | null; state: MediaJobState; result_json: string | null; error: string | null; created_at: number; updated_at: number }>();
  return (rows.results ?? []).map((row) => {
    let result: Record<string, unknown> | null = null;
    try { result = row.result_json ? JSON.parse(row.result_json) as Record<string, unknown> : null; } catch { result = null; }
    return {
      id: row.id,
      kind: row.kind,
      source_url: row.source_url,
      title: row.title,
      state: row.state,
      result,
      error: row.error,
      created_at: new Date(row.created_at * 1_000).toISOString(),
      updated_at: new Date(row.updated_at * 1_000).toISOString(),
    } as MediaJob;
  });
}

export async function auditXMasterAction(database: D1DatabaseLike, ownerId: string, action: string, entityType: string, entityId?: string, metadata: Record<string, unknown> = {}) {
  await database.prepare("INSERT INTO x_master_audit_log (owner_id, id, action, entity_type, entity_id, metadata_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)").bind(ownerId, crypto.randomUUID(), action.slice(0, 80), entityType.slice(0, 80), entityId?.slice(0, 260) ?? null, JSON.stringify(metadata).slice(0, 4_000), Math.floor(Date.now() / 1_000)).run();
}
