import { sealData, unsealData } from "iron-session";
import {
  clearFailedLogins as clearRateLimitFailures,
  deriveLoginClientKey,
  loginRateLimitScope,
  loginRetryAfter as distributedLoginRetryAfter,
  recordFailedLogin as recordRateLimitFailure,
} from "@/x-master/lib/login-rate-limit";

const SESSION_TTL_SECONDS = 8 * 60 * 60;
const PRODUCTION_COOKIE = "__Host-radar_operator";
const DEVELOPMENT_COOKIE = "radar_operator_dev";

type OperatorSession = {
  version: 1;
  subject: "operator";
  csrfToken: string;
  issuedAt: number;
  expiresAt: number;
};

export type OperatorAuthState = {
  configured: boolean;
  authenticated: boolean;
  csrfToken?: string;
  expiresAt?: string;
  reason?: string;
  developmentBypass?: boolean;
};

export type OperatorAuthorization =
  | { ok: true; state: OperatorAuthState }
  | { ok: false; response: Response };

function configuration() {
  const sessionSecret = process.env.RADAR_SESSION_SECRET ?? "";
  const operatorPassword = process.env.RADAR_OPERATOR_PASSWORD ?? "";
  const developmentBypass = process.env.DEV_AUTH_BYPASS === "true";
  const production = process.env.NODE_ENV === "production";

  if (production && developmentBypass) {
    return {
      configured: false as const,
      reason: "Unsafe development authentication bypass is disabled in production.",
    };
  }
  if (!production && developmentBypass) {
    return { configured: true as const, developmentBypass: true as const };
  }
  if (sessionSecret.length < 32 || operatorPassword.length < 16) {
    return {
      configured: false as const,
      reason: "Operator authentication has not been configured for this deployment.",
    };
  }
  return {
    configured: true as const,
    developmentBypass: false as const,
    sessionSecret,
    operatorPassword,
  };
}

function secureRequest(request: Request) {
  return new URL(request.url).protocol === "https:";
}

function cookieName(request: Request) {
  return secureRequest(request) ? PRODUCTION_COOKIE : DEVELOPMENT_COOKIE;
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const result = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clientAddress(request: Request) {
  const cloudflareAddress = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareAddress) return cloudflareAddress.slice(0, 64);
  return "unresolved-client";
}

async function loginClientKey(request: Request) {
  const configured = configuration();
  if (!configured.configured || configured.developmentBypass) {
    throw new Error("Operator authentication is unavailable.");
  }
  return deriveLoginClientKey(configured.sessionSecret, clientAddress(request));
}

export async function loginRetryAfter(request: Request) {
  return distributedLoginRetryAfter(await loginClientKey(request));
}

export async function recordFailedLogin(request: Request) {
  await recordRateLimitFailure(await loginClientKey(request));
}

export async function clearFailedLogins(request: Request) {
  await clearRateLimitFailures(await loginClientKey(request));
}

export async function operatorLoginRateLimitScope() {
  return loginRateLimitScope();
}

export async function passwordMatches(candidate: string) {
  const configured = configuration();
  if (!configured.configured || configured.developmentBypass) return false;
  const [candidateDigest, configuredDigest] = await Promise.all([
    digest(candidate),
    digest(configured.operatorPassword),
  ]);
  return constantTimeEqual(candidateDigest, configuredDigest);
}

export function operatorConfigurationState(): OperatorAuthState {
  const configured = configuration();
  if (!configured.configured) {
    return { configured: false, authenticated: false, reason: configured.reason };
  }
  if (configured.developmentBypass) {
    return {
      configured: true,
      authenticated: true,
      csrfToken: "development-bypass",
      developmentBypass: true,
    };
  }
  return { configured: true, authenticated: false };
}

export async function readOperatorSession(request: Request): Promise<OperatorAuthState> {
  const configured = configuration();
  if (!configured.configured) {
    return { configured: false, authenticated: false, reason: configured.reason };
  }
  if (configured.developmentBypass) return operatorConfigurationState();

  const seal = readCookie(request, cookieName(request));
  if (!seal) return { configured: true, authenticated: false };
  try {
    const session = await unsealData<Partial<OperatorSession>>(seal, {
      password: configured.sessionSecret,
      ttl: SESSION_TTL_SECONDS,
    });
    const now = Math.floor(Date.now() / 1000);
    if (
      session.version !== 1
      || session.subject !== "operator"
      || typeof session.csrfToken !== "string"
      || typeof session.expiresAt !== "number"
      || session.expiresAt <= now
    ) {
      return { configured: true, authenticated: false };
    }
    return {
      configured: true,
      authenticated: true,
      csrfToken: session.csrfToken,
      expiresAt: new Date(session.expiresAt * 1000).toISOString(),
    };
  } catch {
    return { configured: true, authenticated: false };
  }
}

export async function createOperatorSession(request: Request) {
  const configured = configuration();
  if (!configured.configured || configured.developmentBypass) return null;
  const now = Math.floor(Date.now() / 1000);
  const session: OperatorSession = {
    version: 1,
    subject: "operator",
    csrfToken: crypto.randomUUID(),
    issuedAt: now,
    expiresAt: now + SESSION_TTL_SECONDS,
  };
  const seal = await sealData(session, {
    password: configured.sessionSecret,
    ttl: SESSION_TTL_SECONDS,
  });
  const secure = secureRequest(request);
  const cookie = [
    `${cookieName(request)}=${encodeURIComponent(seal)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
  return { session, cookie };
}

export function destroyOperatorSessionCookie(request: Request) {
  return [
    `${cookieName(request)}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    ...(secureRequest(request) ? ["Secure"] : []),
  ].join("; ");
}

export async function authorizeOperatorMutation(request: Request): Promise<OperatorAuthorization> {
  const state = await readOperatorSession(request);
  if (!state.configured) {
    return {
      ok: false,
      response: Response.json(
        { detail: state.reason ?? "Operator authentication is unavailable." },
        { status: 503, headers: { "cache-control": "no-store" } },
      ),
    };
  }
  if (!state.authenticated || !state.csrfToken) {
    return {
      ok: false,
      response: Response.json(
        { detail: "Operator sign-in required." },
        { status: 401, headers: { "cache-control": "no-store" } },
      ),
    };
  }
  if (!sameOrigin(request)) {
    return {
      ok: false,
      response: Response.json(
        { detail: "Same-origin request required." },
        { status: 403, headers: { "cache-control": "no-store" } },
      ),
    };
  }
  const csrf = request.headers.get("x-radar-csrf") ?? "";
  if (!constantTimeEqual(csrf, state.csrfToken)) {
    return {
      ok: false,
      response: Response.json(
        { detail: "Valid CSRF token required." },
        { status: 403, headers: { "cache-control": "no-store" } },
      ),
    };
  }
  return { ok: true, state };
}

export async function authorizeOperatorRead(request: Request): Promise<OperatorAuthorization> {
  const state = await readOperatorSession(request);
  if (!state.configured) {
    return {
      ok: false,
      response: Response.json(
        { detail: state.reason ?? "Operator authentication is unavailable." },
        { status: 503, headers: { "cache-control": "no-store" } },
      ),
    };
  }
  if (!state.authenticated) {
    return {
      ok: false,
      response: Response.json(
        { detail: "Operator sign-in required." },
        { status: 401, headers: { "cache-control": "no-store" } },
      ),
    };
  }
  return { ok: true, state };
}

export function isSameOriginMutation(request: Request) {
  return sameOrigin(request);
}
