import { nodeRuntime } from "@/x-master/lib/node-runtime";
import { clearXUserSessionCookie, readXUserSession, revokeXToken, sameOriginRequest, xAuthConfiguration } from "@/x-master/lib/x-user-auth";
import { deleteXCredentials, initializeXCredentialVault } from "@/x-master/lib/x-oauth-vault";
import type { D1DatabaseLike } from "@/x-master/lib/x-automation-store";

async function databaseBinding(): Promise<D1DatabaseLike | null> {
  try {
    const runtime = (await nodeRuntime());
    return (runtime.env as { DB?: D1DatabaseLike }).DB ?? null;
  } catch { return null; }
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return Response.json({ detail: "Same-origin request required." }, { status: 403, headers: { "cache-control": "no-store" } });
  const configuration = xAuthConfiguration(request);
  if (!configuration.configured) return Response.json({ authenticated: false }, { headers: { "cache-control": "no-store", "set-cookie": clearXUserSessionCookie(request) } });
  const session = await readXUserSession(request, configuration);
  if (session) {
    await revokeXToken(configuration, session.refreshToken ?? session.accessToken);
    const database = await databaseBinding();
    if (database) {
      await initializeXCredentialVault(database);
      await deleteXCredentials(database, session.user.id);
    }
  }
  return Response.json({ authenticated: false }, { headers: { "cache-control": "no-store", "set-cookie": clearXUserSessionCookie(request) } });
}
