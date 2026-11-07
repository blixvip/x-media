export type StyleCollection = "example" | "rejection";
export type StyleMetadata = {
  createdAt: string;
  sourceType?: "tweet_url" | "manual";
  sourceUrl?: string;
  tweetId?: string;
  authorName?: string;
  authorHandle?: string;
  notes?: string;
  tags: string[];
  tagCsv?: string;
  tone?: string;
  category?: string;
  length?: string;
};
export type StyleRecord = { id: string; document: string; metadata: StyleMetadata; distance?: number };
export type VoiceMemoryContext = { voice_examples: string[]; avoid_examples: string[] };

export type VoiceMemoryEnvironment = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  HUGGINGFACE_API_TOKEN?: string;
  HUGGINGFACE_EMBEDDING_MODEL?: string;
  VECTOR_COLLECTION?: string;
  VECTOR_REJECTION_COLLECTION?: string;
};

const X_HOSTS = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.x.com", "mobile.twitter.com"]);
const PAGE_CHROME = /(?:to view keyboard shortcuts|who to follow|trending now|what'?s happening)/gi;
const EMBEDDING_DIMENSIONS = 384;

function cleanText(value: unknown, maximum: number, field: string) {
  if (typeof value !== "string") throw new Error(`${field} is required.`);
  const text = value.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text || text.length > maximum) throw new Error(`${field} is invalid.`);
  return text;
}

function optionalText(value: unknown, maximum: number) {
  if (value === undefined || value === null || value === "") return undefined;
  return cleanText(value, maximum, "Value");
}

function cleanSourceUrl(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 2_048) throw new Error("Source URL is invalid.");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !X_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password || url.hash) throw new Error();
    const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{1,25})/);
    if (!match) throw new Error();
    return `https://x.com/${match[1]}/status/${match[2]}`;
  } catch { throw new Error("Source URL is invalid."); }
}

function cleanTags(value: unknown) {
  if (value === undefined || value === null) return [];
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const result: string[] = [];
  for (const tag of raw) {
    if (typeof tag !== "string") continue;
    const clean = tag.toLowerCase().replace(/^#/, "").replace(/[^a-z0-9 +.-]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (clean.length >= 2 && !result.includes(clean)) result.push(clean);
    if (result.length >= 8) break;
  }
  return result;
}

export function parseStyleRecordInput(value: unknown, collection: StyleCollection, now = new Date()): StyleRecord {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Number.isFinite(now.getTime())) throw new Error("Invalid style record.");
  const input = value as Record<string, unknown>;
  const document = cleanText(input.text ?? input.document, 30_000, "Post text");
  if ((document.match(PAGE_CHROME) ?? []).length >= 2) throw new Error("Post text contains page chrome.");
  if (document.split(/\s+/).length < 4) throw new Error("Post text is too short to teach your voice.");
  const sourceUrl = cleanSourceUrl(input.sourceUrl ?? input.source_url);
  const status = sourceUrl?.match(/\/status\/(\d+)/)?.[1];
  const handleInput = optionalText(input.authorHandle ?? input.author_handle, 16)?.replace(/^@/, "");
  const authorHandle = handleInput && /^[A-Za-z0-9_]{1,15}$/.test(handleInput) ? handleInput : undefined;
  if (handleInput && !authorHandle) throw new Error("Author handle is invalid.");
  const tags = cleanTags(input.tags ?? input.tagCsv);
  const metadata: StyleMetadata = {
    createdAt: now.toISOString(),
    sourceType: sourceUrl ? "tweet_url" : "manual",
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(status ? { tweetId: status } : {}),
    ...(optionalText(input.authorName ?? input.author_name, 200) ? { authorName: optionalText(input.authorName ?? input.author_name, 200) } : {}),
    ...(authorHandle ? { authorHandle } : {}),
    ...(optionalText(input.notes, 1_000) ? { notes: optionalText(input.notes, 1_000) } : {}),
    tags,
    ...(tags.length ? { tagCsv: tags.join(", ") } : {}),
    ...(optionalText(input.tone, 40) ? { tone: optionalText(input.tone, 40) } : {}),
    category: optionalText(input.category, 80) ?? (collection === "rejection" ? "rejected" : "general"),
    ...(optionalText(input.length, 40) ? { length: optionalText(input.length, 40) } : {}),
  };
  return { id: status ? `x-${status}` : `${collection === "rejection" ? "dislike" : "manual"}-${crypto.randomUUID()}`, document, metadata };
}

function tokens(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []);
}

export function rankStyleRecordsLexically(records: StyleRecord[], query: string, limit: number) {
  const wanted = tokens(query);
  return records.map((record, index) => {
    const available = tokens(`${record.document} ${record.metadata.tags.join(" ")} ${record.metadata.category ?? ""}`);
    let overlap = 0;
    for (const token of wanted) if (available.has(token)) overlap += 1;
    return { record, index, score: wanted.size ? overlap / wanted.size : 0 };
  }).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, Math.max(1, Math.min(20, limit))).map(({ record }) => record);
}

export function buildVoiceMemoryContext(examples: StyleRecord[], rejections: StyleRecord[]): VoiceMemoryContext {
  return { voice_examples: examples.map((item) => item.document).filter(Boolean).slice(0, 8), avoid_examples: rejections.map((item) => item.document).filter(Boolean).slice(0, 8) };
}

function configuration(env: VoiceMemoryEnvironment) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key || key.length < 20 || key.length > 4_000) throw new Error("Voice memory is not configured.");
  let url: URL;
  try { url = new URL(env.SUPABASE_URL ?? ""); } catch { throw new Error("Voice memory is not configured."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Voice memory is not configured.");
  return { url: url.origin, key, examples: env.VECTOR_COLLECTION?.trim() || "tweet_examples", rejections: env.VECTOR_REJECTION_COLLECTION?.trim() || "tweet_rejections", model: env.HUGGINGFACE_EMBEDDING_MODEL?.trim() || "BAAI/bge-small-en-v1.5", hf: env.HUGGINGFACE_API_TOKEN?.trim() };
}

function tableName(name: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw new Error("Voice memory collection is invalid.");
  return name;
}

async function boundedJson(response: Response, maximum = 2_000_000) {
  const text = await response.text();
  if (text.length > maximum) throw new Error("Voice memory response is too large.");
  try { return text ? JSON.parse(text) as unknown : null; } catch { throw new Error("Voice memory returned invalid JSON."); }
}

function headers(key: string, extras: Record<string, string> = {}) {
  return { apikey: key, authorization: `Bearer ${key}`, accept: "application/json", ...extras };
}

function parseRecords(value: unknown): StyleRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const row = candidate as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.document !== "string" || !row.document.trim() || !row.metadata || typeof row.metadata !== "object" || Array.isArray(row.metadata)) return [];
    const metadata = row.metadata as Record<string, unknown>;
    const tags = cleanTags(metadata.tags ?? metadata.tagCsv);
    return [{ id: row.id.slice(0, 200), document: row.document.slice(0, 30_000), metadata: { ...metadata, createdAt: typeof metadata.createdAt === "string" ? metadata.createdAt : new Date(0).toISOString(), tags } as StyleMetadata, ...(typeof row.similarity === "number" ? { distance: 1 - row.similarity } : {}) }];
  });
}

async function embed(query: string, env: VoiceMemoryEnvironment, fetcher: typeof fetch) {
  const config = configuration(env);
  const response = await fetcher(`https://router.huggingface.co/hf-inference/models/${encodeURIComponent(config.model)}/pipeline/feature-extraction`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(config.hf ? { authorization: `Bearer ${config.hf}` } : {}) },
    body: JSON.stringify({ inputs: [query.slice(0, 4_000)] }),
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("Voice embedding failed.");
  const payload = await boundedJson(response, 1_000_000);
  const vector = Array.isArray(payload) && Array.isArray(payload[0]) ? payload[0] : payload;
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS || vector.some((item) => typeof item !== "number" || !Number.isFinite(item))) throw new Error("Voice embedding is invalid.");
  return vector;
}

export async function listStyleRecords(collection: StyleCollection, env: VoiceMemoryEnvironment, limit = 50, fetcher: typeof fetch = fetch) {
  const config = configuration(env);
  const table = tableName(collection === "example" ? config.examples : config.rejections);
  const response = await fetcher(`${config.url}/rest/v1/${table}?select=id,document,metadata&limit=${Math.max(1, Math.min(100, Math.floor(limit)))}`, { headers: headers(config.key), redirect: "error", signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error("Could not read voice memory.");
  return parseRecords(await boundedJson(response));
}

export async function searchStyleRecords(collection: StyleCollection, query: string, env: VoiceMemoryEnvironment, limit = 6, fetcher: typeof fetch = fetch) {
  const config = configuration(env);
  const table = tableName(collection === "example" ? config.examples : config.rejections);
  try {
    const vector = await embed(cleanText(query, 4_000, "Search query"), env, fetcher);
    const response = await fetcher(`${config.url}/rest/v1/rpc/match_${table}`, { method: "POST", headers: headers(config.key, { "content-type": "application/json" }), body: JSON.stringify({ query_embedding: vector, match_count: Math.max(1, Math.min(20, Math.floor(limit))) }), redirect: "error", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error();
    return parseRecords(await boundedJson(response));
  } catch {
    return rankStyleRecordsLexically(await listStyleRecords(collection, env, 100, fetcher), query, limit);
  }
}

export async function saveStyleRecord(record: StyleRecord, collection: StyleCollection, env: VoiceMemoryEnvironment, fetcher: typeof fetch = fetch) {
  const config = configuration(env);
  const table = tableName(collection === "example" ? config.examples : config.rejections);
  const vector = await embed(record.document, env, fetcher);
  const response = await fetcher(`${config.url}/rest/v1/${table}?on_conflict=id`, { method: "POST", headers: headers(config.key, { "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify({ id: record.id, document: record.document, metadata: record.metadata, embedding: vector }), redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("Could not save voice memory.");
  return record;
}

export async function deleteStyleRecord(id: string, collection: StyleCollection, env: VoiceMemoryEnvironment, fetcher: typeof fetch = fetch) {
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(id)) throw new Error("Style record id is invalid.");
  const config = configuration(env);
  const table = tableName(collection === "example" ? config.examples : config.rejections);
  const response = await fetcher(`${config.url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: headers(config.key), redirect: "error", signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error("Could not delete voice memory.");
}

export async function retrieveVoiceMemory(query: string, env: VoiceMemoryEnvironment, fetcher: typeof fetch = fetch) {
  const [examples, rejections] = await Promise.all([
    searchStyleRecords("example", query, env, 6, fetcher),
    searchStyleRecords("rejection", query, env, 5, fetcher),
  ]);
  return buildVoiceMemoryContext(examples, rejections);
}
