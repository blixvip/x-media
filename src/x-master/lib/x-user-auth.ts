import { requestOrigin } from "./request-origin";
import { sealData, unsealData } from "iron-session";

export const X_OAUTH_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"] as const;
const FLOW_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const FLOW_COOKIE = "x_radar_oauth_flow";
const SESSION_COOKIE = "x_radar_user";

type Environment = Record<string, string | undefined>;

export type XAuthConfiguration =
  | { configured: true; clientId: string; clientSecret?: string; sessionSecret: string; callbackUrl: string }
  | { configured: false; reason: string };

export type XUserIdentity = { id: string; username: string; name: string; profileImageUrl?: string };
export type XUserSession = {
  version: 1;
  subject: "x_user";
  accessToken: string;
  refreshToken?: string;
  scope: string;
  expiresAt: number;
  user: XUserIdentity;
};

type XAuthFlow = { version: 1; state: string; verifier: string; issuedAt: number };

function base64Url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function secureRequest(request: Request) {
  return new URL(request.url).protocol === "https:";
}

function cookieName(request: Request, kind: "flow" | "session") {
  const base = kind === "flow" ? FLOW_COOKIE : SESSION_COOKIE;
  return secureRequest(request) ? `__Host-${base}` : `${base}_dev`;
}

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); }
    catch { return null; }
  }
  return null;
}

function cookieHeader(request: Request, kind: "flow" | "session", value: string, maxAge: number) {
  return [
    `${cookieName(request, kind)}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    ...(secureRequest(request) ? ["Secure"] : []),
  ].join("; ");
}

function safeCallback(value: string) {
  try {
    const url = new URL(value);
    const local = url.protocol === "http:" && ["127.0.0.1", "::1"].includes(url.hostname);
    return (url.protocol === "https:" || local) && url.pathname === "/api/x-auth/callback" && !url.username && !url.password && !url.hash ? url.toString() : null;
  } catch { return null; }
}

export function xAuthConfiguration(request: Request, environment: Environment = process.env): XAuthConfiguration {
  const clientId = environment.X_CLIENT_ID?.trim() ?? "";
  const clientSecret = environment.X_CLIENT_SECRET?.trim();
  const sessionSecret = environment.X_OAUTH_SESSION_SECRET ?? "";
  const requestUrl = new URL(request.url);
  const callbackUrl = safeCallback(environment.X_OAUTH_CALLBACK_URL?.trim() || new URL("/api/x-auth/callback", requestUrl.origin).toString());
  if (!clientId || clientId.length > 300 || sessionSecret.length < 32 || !callbackUrl) {
    return { configured: false, reason: "X personalization needs an OAuth Client ID, a 32+ character session secret, and an exact callback URL." };
  }
  return { configured: true, clientId, ...(clientSecret && clientSecret.length <= 500 ? { clientSecret } : {}), sessionSecret, callbackUrl };
}

export async function createPkcePair() {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

export async function createXAuthFlow(request: Request, configuration: Extract<XAuthConfiguration, { configured: true }>) {
  const pkce = await createPkcePair();
  const flow: XAuthFlow = { version: 1, state: base64Url(crypto.getRandomValues(new Uint8Array(32))), verifier: pkce.verifier, issuedAt: Math.floor(Date.now() / 1_000) };
  const seal = await sealData(flow, { password: configuration.sessionSecret, ttl: FLOW_TTL_SECONDS });
  return { flow, challenge: pkce.challenge, cookie: cookieHeader(request, "flow", seal, FLOW_TTL_SECONDS) };
}

export async function readXAuthFlow(request: Request, configuration: Extract<XAuthConfiguration, { configured: true }>) {
  const seal = readCookie(request, cookieName(request, "flow"));
  if (!seal) return null;
  try {
    const flow = await unsealData<Partial<XAuthFlow>>(seal, { password: configuration.sessionSecret, ttl: FLOW_TTL_SECONDS });
    const now = Math.floor(Date.now() / 1_000);
    if (flow.version !== 1 || typeof flow.state !== "string" || flow.state.length < 32 || typeof flow.verifier !== "string" || flow.verifier.length < 43 || typeof flow.issuedAt !== "number" || flow.issuedAt < now - FLOW_TTL_SECONDS || flow.issuedAt > now + 30) return null;
    return flow as XAuthFlow;
  } catch { return null; }
}

export function clearXAuthFlowCookie(request: Request) {
  return cookieHeader(request, "flow", "", 0);
}

export function buildXAuthorizeUrl(input: { clientId: string; callbackUrl: string; state: string; challenge: string }) {
  const url = new URL("https://x.com/i/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.callbackUrl);
  url.searchParams.set("scope", X_OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

export type XTokenSet = { accessToken: string; refreshToken?: string; expiresIn: number; scope: string };
export type XStoredCredentials = { accessToken: string; refreshToken?: string; scope: string; expiresAt: number };
export type XEncryptedCredentials = { version: 1; iv: string; ciphertext: string };

function standardBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string, maximumBytes: number) {
  if (value.length < 1 || value.length > Math.ceil(maximumBytes * 4 / 3) + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error("Could not decrypt X credentials.");
  let binary: string;
  try { binary = atob(value); } catch { throw new Error("Could not decrypt X credentials."); }
  if (binary.length > maximumBytes) throw new Error("Could not decrypt X credentials.");
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function credentialKey(encoded: string) {
  const bytes = decodeBase64(encoded, 32);
  if (bytes.length !== 32) throw new Error("Could not decrypt X credentials.");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function validateStoredCredentials(value: unknown): XStoredCredentials {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Could not decrypt X credentials.");
  const item = value as Partial<XStoredCredentials>;
  if (typeof item.accessToken !== "string" || item.accessToken.length < 32 || item.accessToken.length > 4_000 || (item.refreshToken !== undefined && (typeof item.refreshToken !== "string" || item.refreshToken.length < 32 || item.refreshToken.length > 4_000)) || typeof item.scope !== "string" || item.scope.length > 500 || typeof item.expiresAt !== "number" || !Number.isSafeInteger(item.expiresAt) || item.expiresAt < 1) throw new Error("Could not decrypt X credentials.");
  return { accessToken: item.accessToken, ...(item.refreshToken ? { refreshToken: item.refreshToken } : {}), scope: item.scope, expiresAt: item.expiresAt };
}

export async function encryptXCredentials(credentials: XStoredCredentials, encodedKey: string): Promise<XEncryptedCredentials> {
  const clean = validateStoredCredentials(credentials);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode("x-radar-oauth-v1") }, await credentialKey(encodedKey), new TextEncoder().encode(JSON.stringify(clean)));
  return { version: 1, iv: standardBase64(iv), ciphertext: standardBase64(new Uint8Array(ciphertext)) };
}

export async function decryptXCredentials(value: XEncryptedCredentials, encodedKey: string): Promise<XStoredCredentials> {
  try {
    if (value.version !== 1) throw new Error();
    const iv = decodeBase64(value.iv, 12);
    if (iv.length !== 12) throw new Error();
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode("x-radar-oauth-v1") }, await credentialKey(encodedKey), decodeBase64(value.ciphertext, 10_000));
    return validateStoredCredentials(JSON.parse(new TextDecoder().decode(decrypted)));
  } catch { throw new Error("Could not decrypt X credentials."); }
}

export function parseXTokenResponse(value: unknown): XTokenSet | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const token = value as Record<string, unknown>;
  const accessToken = typeof token.access_token === "string" ? token.access_token : "";
  const refreshToken = typeof token.refresh_token === "string" ? token.refresh_token : undefined;
  const expiresIn = typeof token.expires_in === "number" && Number.isFinite(token.expires_in) ? Math.floor(token.expires_in) : 0;
  const scope = typeof token.scope === "string" ? token.scope.slice(0, 500) : "";
  if (accessToken.length < 32 || accessToken.length > 4_000 || expiresIn < 60 || expiresIn > 31_536_000 || (refreshToken && (refreshToken.length < 32 || refreshToken.length > 4_000))) return null;
  return { accessToken, ...(refreshToken ? { refreshToken } : {}), expiresIn, scope };
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  return difference === 0;
}

export function validXOAuthState(received: unknown, expected: string) {
  return typeof received === "string" && received.length <= 500 && constantTimeEqual(received, expected);
}

async function boundedJson(response: Response, maximumBytes = 1_500_000) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) throw new Error("X response exceeded the size limit.");
  if (!response.body) throw new Error("X returned an empty response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      await reader.cancel();
      throw new Error("X response exceeded the size limit.");
    }
    body += decoder.decode(value, { stream: true });
  }
  try { return JSON.parse(body + decoder.decode()) as unknown; }
  catch { throw new Error("X returned malformed JSON."); }
}

function validAccessToken(token: string) {
  return token.length >= 32 && token.length <= 4_000;
}

export async function createXPost(accessToken: string, text: string, replyTo?: string, fetcher: typeof fetch = fetch) {
  const cleanText = text.trim();
  if (!validAccessToken(accessToken) || cleanText.length < 1 || cleanText.length > 280 || (replyTo !== undefined && !/^\d{1,19}$/.test(replyTo))) {
    throw new Error("Invalid X post.");
  }
  const response = await fetcher("https://api.x.com/2/tweets", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ text: cleanText, ...(replyTo ? { reply: { in_reply_to_tweet_id: replyTo } } : {}) }),
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("X post publishing failed.");
  const payload = await boundedJson(response, 100_000) as { data?: { id?: unknown; text?: unknown } };
  if (!/^\d{1,19}$/.test(String(payload.data?.id ?? "")) || typeof payload.data?.text !== "string") throw new Error("X returned an invalid publish response.");
  return { id: String(payload.data.id), text: payload.data.text.slice(0, 280) };
}

export async function repostXPost(accessToken: string, userId: string, postId: string, fetcher: typeof fetch = fetch) {
  if (!validAccessToken(accessToken) || !/^\d{1,19}$/.test(userId) || !/^\d{1,19}$/.test(postId)) throw new Error("Invalid X repost.");
  const response = await fetcher(`https://api.x.com/2/users/${userId}/retweets`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ tweet_id: postId }),
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("X repost failed.");
  const payload = await boundedJson(response, 100_000) as { data?: { retweeted?: unknown } };
  if (payload.data?.retweeted !== true) throw new Error("X returned an invalid repost response.");
  return { reposted: true as const };
}

function tokenHeaders(configuration: Extract<XAuthConfiguration, { configured: true }>) {
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded", accept: "application/json" });
  if (configuration.clientSecret) headers.set("authorization", `Basic ${Buffer.from(`${configuration.clientId}:${configuration.clientSecret}`).toString("base64")}`);
  return headers;
}

async function requestToken(configuration: Extract<XAuthConfiguration, { configured: true }>, parameters: URLSearchParams) {
  if (!configuration.clientSecret) parameters.set("client_id", configuration.clientId);
  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: tokenHeaders(configuration),
    body: parameters,
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("X token exchange failed.");
  const tokens = parseXTokenResponse(await boundedJson(response, 50_000));
  if (!tokens) throw new Error("X returned an invalid token response.");
  return tokens;
}

export async function exchangeXAuthorizationCode(configuration: Extract<XAuthConfiguration, { configured: true }>, code: string, verifier: string) {
  if (code.length < 20 || code.length > 4_000 || verifier.length < 43 || verifier.length > 128) throw new Error("Invalid X authorization response.");
  return requestToken(configuration, new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: configuration.callbackUrl, code_verifier: verifier }));
}

export async function refreshXAccessToken(configuration: Extract<XAuthConfiguration, { configured: true }>, refreshToken: string) {
  if (refreshToken.length < 32 || refreshToken.length > 4_000) throw new Error("Invalid X refresh token.");
  return requestToken(configuration, new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
}

function parseXIdentity(value: unknown): XUserIdentity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = (value as { data?: unknown }).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const user = data as Record<string, unknown>;
  const id = typeof user.id === "string" && /^\d{1,19}$/.test(user.id) ? user.id : "";
  const username = typeof user.username === "string" && /^[A-Za-z0-9_]{1,15}$/.test(user.username) ? user.username : "";
  const name = typeof user.name === "string" ? user.name.replace(/\s+/g, " ").trim().slice(0, 100) : "";
  let profileImageUrl: string | undefined;
  if (typeof user.profile_image_url === "string") {
    try { const url = new URL(user.profile_image_url); if (url.protocol === "https:" && url.hostname === "pbs.twimg.com") profileImageUrl = url.toString(); } catch { /* Untrusted profile media is optional. */ }
  }
  return id && username && name ? { id, username: `@${username}`, name, ...(profileImageUrl ? { profileImageUrl } : {}) } : null;
}

export async function fetchXIdentity(accessToken: string) {
  const response = await fetch("https://api.x.com/2/users/me?user.fields=name,username,profile_image_url", {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("X identity lookup failed.");
  const identity = parseXIdentity(await boundedJson(response, 100_000));
  if (!identity) throw new Error("X returned an invalid identity.");
  return identity;
}

export async function createXUserSession(request: Request, configuration: Extract<XAuthConfiguration, { configured: true }>, tokens: XTokenSet, user: XUserIdentity) {
  const session: XUserSession = {
    version: 1,
    subject: "x_user",
    accessToken: tokens.accessToken,
    ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
    scope: tokens.scope,
    expiresAt: Math.floor(Date.now() / 1_000) + tokens.expiresIn,
    user,
  };
  const seal = await sealData(session, { password: configuration.sessionSecret, ttl: SESSION_TTL_SECONDS });
  return { session, cookie: cookieHeader(request, "session", seal, SESSION_TTL_SECONDS) };
}

export async function readXUserSession(request: Request, configuration: Extract<XAuthConfiguration, { configured: true }>) {
  const seal = readCookie(request, cookieName(request, "session"));
  if (!seal) return null;
  try {
    const session = await unsealData<Partial<XUserSession>>(seal, { password: configuration.sessionSecret, ttl: SESSION_TTL_SECONDS });
    if (session.version !== 1 || session.subject !== "x_user" || typeof session.accessToken !== "string" || session.accessToken.length < 32 || typeof session.expiresAt !== "number" || !session.user || !/^@?[A-Za-z0-9_]{1,15}$/.test(session.user.username ?? "") || !/^\d{1,19}$/.test(session.user.id ?? "")) return null;
    return session as XUserSession;
  } catch { return null; }
}

export async function resolveXUserSession(request: Request, configuration: Extract<XAuthConfiguration, { configured: true }>) {
  const session = await readXUserSession(request, configuration);
  if (!session) return { session: null, cookie: undefined };
  if (session.expiresAt > Math.floor(Date.now() / 1_000) + 60) return { session, cookie: undefined };
  if (!session.refreshToken) return { session: null, cookie: clearXUserSessionCookie(request) };
  try {
    const refreshed = await refreshXAccessToken(configuration, session.refreshToken);
    return createXUserSession(request, configuration, { ...refreshed, refreshToken: refreshed.refreshToken ?? session.refreshToken }, session.user);
  } catch {
    return { session: null, cookie: clearXUserSessionCookie(request) };
  }
}

export function clearXUserSessionCookie(request: Request) {
  return cookieHeader(request, "session", "", 0);
}

export function sameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === requestOrigin(request); }
  catch { return false; }
}

export async function fetchXHomeTimeline(accessToken: string, userId: string) {
  if (!/^\d{1,19}$/.test(userId)) throw new Error("Invalid X user.");
  const url = new URL(`https://api.x.com/2/users/${userId}/timelines/reverse_chronological`);
  url.searchParams.set("max_results", "100");
  url.searchParams.set("exclude", "replies,retweets");
  url.searchParams.set("tweet.fields", "created_at,public_metrics,author_id,attachments,lang,possibly_sensitive");
  url.searchParams.set("expansions", "author_id,attachments.media_keys");
  url.searchParams.set("user.fields", "name,username,profile_image_url,verified");
  url.searchParams.set("media.fields", "media_key,type,url,preview_image_url,width,height,alt_text");
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Your X home timeline is temporarily unavailable.");
  return boundedJson(response);
}

export async function revokeXToken(configuration: Extract<XAuthConfiguration, { configured: true }>, token: string) {
  if (token.length < 32 || token.length > 4_000) return false;
  const body = new URLSearchParams({ token });
  if (!configuration.clientSecret) body.set("client_id", configuration.clientId);
  try {
    const response = await fetch("https://api.x.com/2/oauth2/revoke", {
      method: "POST",
      headers: tokenHeaders(configuration),
      body,
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok;
  } catch { return false; }
}
