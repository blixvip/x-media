import {
  authorizeOperatorMutation,
  clearFailedLogins,
  createOperatorSession,
  destroyOperatorSessionCookie,
  isSameOriginMutation,
  loginRetryAfter,
  operatorLoginRateLimitScope,
  operatorConfigurationState,
  passwordMatches,
  readOperatorSession,
  recordFailedLogin,
} from "@/x-master/lib/operator-session";
import { radarApiBase } from "@/x-master/app/api/_radar";

function noStore(payload: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(payload, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

export async function GET(request: Request) {
  const state = await readOperatorSession(request);
  let rateLimitScope: "distributed" | "isolate" | "unavailable" = "unavailable";
  try {
    rateLimitScope = await operatorLoginRateLimitScope();
  } catch {
    // The status endpoint remains available so an operator can see that sign-in fails closed.
  }
  return noStore({
    configured: state.configured,
    authenticated: state.authenticated,
    backend_configured: Boolean(radarApiBase()),
    csrf_token: state.csrfToken,
    expires_at: state.expiresAt,
    reason: state.reason,
    development_bypass: state.developmentBypass === true,
    login_rate_limit: {
      scope: rateLimitScope,
      fail_closed: true,
    },
  });
}

export async function POST(request: Request) {
  const configuration = operatorConfigurationState();
  if (!configuration.configured) {
    return noStore({ detail: configuration.reason }, 503);
  }
  if (!isSameOriginMutation(request)) {
    return noStore({ detail: "Same-origin request required." }, 403);
  }
  if (configuration.developmentBypass) {
    return noStore({ authenticated: true, csrf_token: configuration.csrfToken });
  }

  let retryAfter = 0;
  try {
    retryAfter = await loginRetryAfter(request);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return noStore(
      { detail: "Sign-in protection is temporarily unavailable." },
      503,
      { "retry-after": "60" },
    );
  }
  if (retryAfter > 0) {
    return noStore(
      { detail: "Too many sign-in attempts. Try again later." },
      429,
      { "retry-after": String(retryAfter) },
    );
  }

  let password = "";
  try {
    const body = await request.json() as { password?: unknown };
    if (typeof body.password === "string" && body.password.length <= 1_024) {
      password = body.password;
    }
  } catch {
    return noStore({ detail: "Invalid sign-in request." }, 400);
  }

  if (!password || !await passwordMatches(password)) {
    try {
      await recordFailedLogin(request);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return noStore(
        { detail: "Sign-in protection is temporarily unavailable." },
        503,
        { "retry-after": "60" },
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
    return noStore({ detail: "Invalid operator credentials." }, 401);
  }

  try {
    await clearFailedLogins(request);
  } catch {
    return noStore(
      { detail: "Sign-in protection is temporarily unavailable." },
      503,
      { "retry-after": "60" },
    );
  }
  const created = await createOperatorSession(request);
  if (!created) return noStore({ detail: "Operator authentication is unavailable." }, 503);
  return noStore(
    {
      authenticated: true,
      csrf_token: created.session.csrfToken,
      expires_at: new Date(created.session.expiresAt * 1000).toISOString(),
    },
    200,
    { "set-cookie": created.cookie },
  );
}

export async function DELETE(request: Request) {
  const authorization = await authorizeOperatorMutation(request);
  if (!authorization.ok) return authorization.response;
  return noStore(
    { authenticated: false },
    200,
    { "set-cookie": destroyOperatorSessionCookie(request) },
  );
}
