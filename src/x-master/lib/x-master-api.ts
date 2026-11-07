import { nodeRuntime } from "@/x-master/lib/node-runtime";
import { initializeXMasterStore, authenticateExtensionToken, extensionOriginAllowed, parseBearerToken } from "./x-master-store.ts";
import type { D1DatabaseLike } from "./x-automation-store.ts";
import { resolveXUserSession, sameOriginRequest, xAuthConfiguration } from "./x-user-auth.ts";
import type { ContentFormat } from "./x-content-engine.ts";
import { resolveAppSession, type AppAuthEnvironment } from './x-app-auth.ts';
import type {ReferenceBucket} from './x-reference-media.ts';
import { localWorkspaceUser } from './local-workspace';

export type XMasterRuntime = AppAuthEnvironment & {
  X_MEDIA_LOCAL_WORKSPACE?: string;
  DB?: D1DatabaseLike;
  MEDIA?: ReferenceBucket;
  OPENAI_API_KEY?: string;
  OPENAI_CONTENT_MODEL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  HUGGINGFACE_API_TOKEN?: string;
  HUGGINGFACE_EMBEDDING_MODEL?: string;
  VECTOR_COLLECTION?: string;
  VECTOR_REJECTION_COLLECTION?: string;
  X_MEDIA_SERVICE_URL?: string;
  X_MEDIA_SERVICE_TOKEN?: string;
  X_MEDIA_ALLOW_COMPOSE_HTTP?: string;
  X_MASTER_LEGACY_URL?: string;
  X_MASTER_LEGACY_BYPASS_TOKEN?: string;
  X_REFERENCE_WORKER_TOKEN?:string;
};

export type GenerateRequest = { format: ContentFormat; source_text: string; source_url?: string; tone?: string };

export async function xMasterRuntime(): Promise<XMasterRuntime> {
  try {
    const runtime = (await nodeRuntime());
    return runtime.env as XMasterRuntime;
  } catch {
    const runtime=process.env as XMasterRuntime;
    // Explicit opt-in for local development. Cloud uses its existing D1 binding.
    if(process.env.X_REFERENCE_LOCAL_DB_PATH){const {openLocalRadarDatabase}=await import('./x-radar-local-db.ts');localDatabase??=openLocalRadarDatabase(process.env.X_REFERENCE_LOCAL_DB_PATH);return {...runtime,DB:await localDatabase};}
    return runtime;
  }
}
let localDatabase:Promise<D1DatabaseLike>|undefined;

export function isD1Database(value: unknown): value is D1DatabaseLike {
  return Boolean(value && typeof value === "object" && typeof (value as D1DatabaseLike).prepare === "function" && typeof (value as D1DatabaseLike).batch === "function");
}

export function extensionCorsHeaders(origin: string | null): Record<string, string> {
  if (!extensionOriginAllowed(origin)) return {};
  return {
    "access-control-allow-origin": origin!,
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

export function xMasterJson(request: Request, body: unknown, status = 200, cookie?: string) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", ...extensionCorsHeaders(request.headers.get("origin")), ...(cookie ? { "set-cookie": cookie } : {}) } });
}

export function xMasterOptions(request: Request) {
  const headers = extensionCorsHeaders(request.headers.get("origin"));
  return Object.keys(headers).length ? new Response(null, { status: 204, headers }) : new Response(null, { status: 403 });
}

export async function readBoundedObject(request: Request, maximum = 80_000) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum) throw new Error("Request is too large.");
  if(!request.body)throw new Error('Request body is required.');
  const reader=request.body.getReader();const decoder=new TextDecoder();let text='';let bytes=0;
  try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>maximum){await reader.cancel();throw new Error('Request is too large.');}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
  if (!text || text.length > maximum) throw new Error(text ? "Request is too large." : "Request body is required.");
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Request body must be an object.");
  return parsed as Record<string, unknown>;
}

function xSourceUrl(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname.toLowerCase()) || url.username || url.password || url.hash) return null;
    return url.toString();
  } catch { return null; }
}

export function parseGenerateRequest(value: unknown): GenerateRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const formats = new Set<ContentFormat>(["x_reply", "x_quote", "x_post", "thread", "article", "meme"]);
  const format = typeof input.format === "string" && formats.has(input.format as ContentFormat) ? input.format as ContentFormat : null;
  const rawSource = input.source_text ?? input.tweetText ?? input.source ?? input.input ?? input.text;
  if (!format || typeof rawSource !== "string") return null;
  const sourceText = rawSource.replace(/\r/g, "").trim();
  if (!sourceText || sourceText.length > 12_000) return null;
  const sourceUrl = xSourceUrl(input.source_url ?? input.tweetUrl);
  if (sourceUrl === null) return null;
  const tone = typeof input.tone === "string" ? input.tone.trim().slice(0, 40) : typeof input.toneId === "string" ? input.toneId.trim().slice(0, 40) : "";
  return { format, source_text: sourceText, ...(sourceUrl ? { source_url: sourceUrl } : {}), ...(tone ? { tone } : {}) };
}

export function validateMediaServiceUrl(value: string | undefined, allowComposeHttp: boolean) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const compose = allowComposeHttp && url.protocol === "http:" && url.hostname === "api" && url.port === "8080";
    if ((url.protocol !== "https:" && !compose) || url.username || url.password || url.search || url.hash) return null;
    return url;
  } catch { return null; }
}

export function validateLegacyMigrationUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return url;
  } catch { return null; }
}

export type XMasterAuthContext = {
  ownerId: string;
  method: "x_session" | "app_session" | "local_session" | "extension";
  cookie?: string;
  runtime: XMasterRuntime;
  database: D1DatabaseLike;
  scopes: string[];
};

export function workspaceIdentityMatches(request: Request, method: XMasterAuthContext['method'], ownerId: string) {
  if (new URL(request.url).searchParams.get('identity') !== 'app') return true;
  const expected = request.headers.get('x-workspace-owner');
  return (method === 'app_session' || method === 'local_session') && !!expected && ownerId === `app:${expected}`;
}

export async function authorizeXMasterRequest(request: Request, requiredScope?: string): Promise<{ ok: true; context: XMasterAuthContext } | { ok: false; response: Response }> {
  const runtime = await xMasterRuntime();
  if (!isD1Database(runtime.DB)) return { ok: false, response: xMasterJson(request, { error: "X Master storage is not configured." }, 503) };
  await initializeXMasterStore(runtime.DB);
  const bearer = parseBearerToken(request.headers.get("authorization"));
  if (bearer) {
    if (new URL(request.url).searchParams.get('identity') === 'app') return {ok:false,response:xMasterJson(request,{error:'Workspace account session required.'},401)};
    if (!extensionOriginAllowed(request.headers.get("origin"))) return { ok: false, response: xMasterJson(request, { error: "Extension origin required." }, 403) };
    const device = await authenticateExtensionToken(runtime.DB, bearer, requiredScope);
    if (!device) return { ok: false, response: xMasterJson(request, { error: "Extension pairing is invalid or revoked." }, 401) };
    return { ok: true, context: { ownerId: device.owner_id, method: "extension", runtime, database: runtime.DB, scopes: device.scopes } };
  }
  const appSession=await resolveAppSession(request,runtime);
  if(appSession){
    if (!workspaceIdentityMatches(request,'app_session',`app:${appSession.user.id}`)) return {ok:false,response:xMasterJson(request,{error:'Account changed. Reload your workspace before syncing.'},401,appSession.cookie)};
    return {ok:true,context:{ownerId:`app:${appSession.user.id}`,method:'app_session',cookie:appSession.cookie,runtime,database:runtime.DB,scopes:['*']}};
  }
  const localUser = localWorkspaceUser(request, runtime);
  if (localUser) {
    const ownerId = `app:${localUser.id}`;
    if (!workspaceIdentityMatches(request, 'local_session', ownerId)) return { ok: false, response: xMasterJson(request, { error: 'Account changed. Reload your workspace before syncing.' }, 401) };
    return { ok: true, context: { ownerId, method: 'local_session', runtime, database: runtime.DB, scopes: ['*'] } };
  }
  if (new URL(request.url).searchParams.get('identity') === 'app') return {ok:false,response:xMasterJson(request,{error:'Sign in to your workspace account again.'},401)};
  const configuration = xAuthConfiguration(request);
  if (!configuration.configured) return { ok: false, response: xMasterJson(request, { error: configuration.reason }, 503) };
  const session = await resolveXUserSession(request, configuration);
  if (!session.session) return { ok: false, response: xMasterJson(request, { error: "Connect your X account first." }, 401, session.cookie) };
  return { ok: true, context: { ownerId: session.session.user.id, method: "x_session", cookie: session.cookie, runtime, database: runtime.DB, scopes: ["*"] } };
}

export function mutationOriginAllowed(request: Request, method: XMasterAuthContext["method"]) {
  return method === "extension" ? extensionOriginAllowed(request.headers.get("origin")) : sameOriginRequest(request);
}
