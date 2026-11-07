import { nodeRuntime } from "@/x-master/lib/node-runtime";
import {
  clearXAuthFlowCookie,
  createXUserSession,
  exchangeXAuthorizationCode,
  fetchXIdentity,
  readXAuthFlow,
  validXOAuthState,
  xAuthConfiguration,
} from "@/x-master/lib/x-user-auth";
import { initializeXCredentialVault, storeXCredentials } from "@/x-master/lib/x-oauth-vault";
import type { D1DatabaseLike } from "@/x-master/lib/x-automation-store";

async function backgroundBindings(): Promise<{ DB?: D1DatabaseLike; X_TOKEN_ENCRYPTION_KEY?: string }> {
  try {
    const runtime = (await nodeRuntime());
    return runtime.env as { DB?: D1DatabaseLike; X_TOKEN_ENCRYPTION_KEY?: string };
  } catch { return {}; }
}

function radarRedirect(request: Request, state: "connected" | "denied" | "failed" | "setup_required", cookies: string[] = []) {
  const headers = new Headers({ location: new URL(`/x-radar?x_auth=${state}`, request.url).toString(), "cache-control": "no-store" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
}

export async function GET(request: Request) {
  const configuration = xAuthConfiguration(request);
  if (!configuration.configured) return radarRedirect(request, "setup_required");
  const url = new URL(request.url);
  const flow = await readXAuthFlow(request, configuration);
  const clearFlow = clearXAuthFlowCookie(request);
  if (url.searchParams.has("error")) return radarRedirect(request, "denied", [clearFlow]);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!flow || !validXOAuthState(state, flow.state) || !code) return radarRedirect(request, "failed", [clearFlow]);
  try {
    const tokens = await exchangeXAuthorizationCode(configuration, code, flow.verifier);
    const identity = await fetchXIdentity(tokens.accessToken);
    const runtime = await backgroundBindings();
    if (runtime.DB && runtime.X_TOKEN_ENCRYPTION_KEY) {
      await initializeXCredentialVault(runtime.DB);
      await storeXCredentials(runtime.DB, identity.id, {
        accessToken: tokens.accessToken,
        ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
        scope: tokens.scope,
        expiresAt: Math.floor(Date.now() / 1_000) + tokens.expiresIn,
      }, runtime.X_TOKEN_ENCRYPTION_KEY);
    }
    const created = await createXUserSession(request, configuration, tokens, identity);
    return radarRedirect(request, "connected", [clearFlow, created.cookie]);
  } catch {
    return radarRedirect(request, "failed", [clearFlow]);
  }
}
