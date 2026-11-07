import { resolveXUserSession, xAuthConfiguration, X_OAUTH_SCOPES } from "@/x-master/lib/x-user-auth";

export async function GET(request: Request) {
  const configuration = xAuthConfiguration(request);
  if (!configuration.configured) {
    return Response.json({ configured: false, authenticated: false, reason: configuration.reason, callback_url: new URL("/api/x-auth/callback", request.url).toString(), scopes: X_OAUTH_SCOPES }, { headers: { "cache-control": "no-store" } });
  }
  const resolved = await resolveXUserSession(request, configuration);
  return Response.json({
    configured: true,
    authenticated: Boolean(resolved.session),
    user: resolved.session?.user,
    scopes: X_OAUTH_SCOPES,
    retention: "Encrypted browser session cookie; up to 30 days; deleted and revoked on disconnect.",
  }, { headers: { "cache-control": "no-store", ...(resolved.cookie ? { "set-cookie": resolved.cookie } : {}) } });
}

