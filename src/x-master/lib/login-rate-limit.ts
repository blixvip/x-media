import { nodeRuntime } from "@/x-master/lib/node-runtime";
import type { D1DatabaseLike as D1Database } from './x-automation-store';
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_ATTEMPT_LIMIT = 5;
const MAX_LOCAL_WINDOWS = 1_000;

type LoginWindow = {
  attempts: number;
  resetsAt: number;
};

type D1Window = {
  attempts: number;
  resets_at: number;
};

export type LoginRateLimitScope = "distributed" | "isolate";

export class LoginRateLimitUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Distributed sign-in protection is temporarily unavailable.", { cause });
    this.name = "LoginRateLimitUnavailableError";
  }
}

const localWindows = new Map<string, LoginWindow>();
let databasePromise: Promise<D1Database | null> | undefined;
let schemaPromise: Promise<void> | undefined;

const createTableSql = `
  CREATE TABLE IF NOT EXISTS operator_login_windows (
    client_key TEXT PRIMARY KEY NOT NULL,
    attempts INTEGER NOT NULL,
    resets_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`;

const createExpiryIndexSql = `
  CREATE INDEX IF NOT EXISTS idx_operator_login_windows_resets_at
  ON operator_login_windows (resets_at)
`;

async function sha256(value: string) {
  const result = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(
    new Uint8Array(result),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function deriveLoginClientKey(sessionSecret: string, clientAddress: string) {
  return sha256(`rate-limit-v1\0${sessionSecret}\0${clientAddress}`);
}

function isD1Database(value: unknown): value is D1Database {
  return Boolean(
    value
    && typeof value === "object"
    && typeof (value as { prepare?: unknown }).prepare === "function"
    && typeof (value as { batch?: unknown }).batch === "function",
  );
}

async function loadDatabase() {
  try {
    const runtime = (await nodeRuntime());
    const database = (runtime.env as Record<string, unknown>).DB;
    if (!isD1Database(database)) {
      throw new LoginRateLimitUnavailableError("The configured D1 binding is missing.");
    }
    return database;
  } catch (error) {
    if (error instanceof LoginRateLimitUnavailableError) throw error;
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
    if (code === "ERR_UNSUPPORTED_ESM_URL_SCHEME" || code === "ERR_MODULE_NOT_FOUND") {
      return null;
    }
    throw new LoginRateLimitUnavailableError(error);
  }
}

async function database() {
  databasePromise ??= loadDatabase();
  const value = await databasePromise;
  if (!value) return null;
  schemaPromise ??= initializeDistributedLoginRateLimit(value).catch((error) => {
    schemaPromise = undefined;
    throw new LoginRateLimitUnavailableError(error);
  });
  await schemaPromise;
  return value;
}

export async function initializeDistributedLoginRateLimit(distributed: D1Database) {
  await distributed.batch([
    distributed.prepare(createTableSql),
    distributed.prepare(createExpiryIndexSql),
  ]);
}

export async function distributedLoginRetryAfter(
  distributed: D1Database,
  clientKey: string,
  nowSeconds: number,
) {
  const window = await distributed.prepare(
    "SELECT attempts, resets_at FROM operator_login_windows WHERE client_key = ?1",
  ).bind(clientKey).first<D1Window>();
  if (!window || window.resets_at <= nowSeconds || window.attempts < LOGIN_ATTEMPT_LIMIT) {
    return 0;
  }
  return Math.max(1, window.resets_at - nowSeconds);
}

export async function distributedRecordFailedLogin(
  distributed: D1Database,
  clientKey: string,
  nowSeconds: number,
) {
  await distributed.prepare(`
    INSERT INTO operator_login_windows (client_key, attempts, resets_at, updated_at)
    VALUES (?1, 1, ?2, ?3)
    ON CONFLICT(client_key) DO UPDATE SET
      attempts = CASE
        WHEN operator_login_windows.resets_at <= excluded.updated_at THEN 1
        ELSE operator_login_windows.attempts + 1
      END,
      resets_at = CASE
        WHEN operator_login_windows.resets_at <= excluded.updated_at THEN excluded.resets_at
        ELSE operator_login_windows.resets_at
      END,
      updated_at = excluded.updated_at
  `).bind(clientKey, nowSeconds + LOGIN_WINDOW_SECONDS, nowSeconds).run();
  await distributed.prepare(
    "DELETE FROM operator_login_windows WHERE resets_at <= ?1 AND client_key != ?2",
  ).bind(nowSeconds, clientKey).run();
}

export async function distributedClearFailedLogins(
  distributed: D1Database,
  clientKey: string,
) {
  await distributed.prepare(
    "DELETE FROM operator_login_windows WHERE client_key = ?1",
  ).bind(clientKey).run();
}

function localWindow(clientKey: string, nowSeconds: number) {
  const existing = localWindows.get(clientKey);
  if (!existing || existing.resetsAt <= nowSeconds) {
    const fresh = { attempts: 0, resetsAt: nowSeconds + LOGIN_WINDOW_SECONDS };
    localWindows.set(clientKey, fresh);
    return fresh;
  }
  return existing;
}

function pruneLocalWindows(nowSeconds: number) {
  if (localWindows.size <= MAX_LOCAL_WINDOWS) return;
  for (const [key, value] of localWindows) {
    if (value.resetsAt <= nowSeconds) localWindows.delete(key);
  }
  while (localWindows.size > MAX_LOCAL_WINDOWS) {
    const oldest = localWindows.keys().next().value;
    if (typeof oldest !== "string") break;
    localWindows.delete(oldest);
  }
}

export async function loginRateLimitScope(): Promise<LoginRateLimitScope> {
  return await database() ? "distributed" : "isolate";
}

export async function loginRetryAfter(clientKey: string, nowSeconds = Math.floor(Date.now() / 1_000)) {
  const distributed = await database();
  if (!distributed) {
    const window = localWindow(clientKey, nowSeconds);
    return window.attempts < LOGIN_ATTEMPT_LIMIT
      ? 0
      : Math.max(1, window.resetsAt - nowSeconds);
  }

  try {
    return await distributedLoginRetryAfter(distributed, clientKey, nowSeconds);
  } catch (error) {
    throw new LoginRateLimitUnavailableError(error);
  }
}

export async function recordFailedLogin(clientKey: string, nowSeconds = Math.floor(Date.now() / 1_000)) {
  const distributed = await database();
  if (!distributed) {
    localWindow(clientKey, nowSeconds).attempts += 1;
    pruneLocalWindows(nowSeconds);
    return;
  }

  try {
    await distributedRecordFailedLogin(distributed, clientKey, nowSeconds);
  } catch (error) {
    throw new LoginRateLimitUnavailableError(error);
  }
}

export async function clearFailedLogins(clientKey: string) {
  const distributed = await database();
  localWindows.delete(clientKey);
  if (!distributed) return;
  try {
    await distributedClearFailedLogins(distributed, clientKey);
  } catch (error) {
    throw new LoginRateLimitUnavailableError(error);
  }
}

export const loginRateLimitContract = {
  attemptLimit: LOGIN_ATTEMPT_LIMIT,
  windowSeconds: LOGIN_WINDOW_SECONDS,
  binding: "DB",
  table: "operator_login_windows",
} as const;
