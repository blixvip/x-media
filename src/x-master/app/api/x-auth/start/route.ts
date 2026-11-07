import { buildXAuthorizeUrl, createXAuthFlow, xAuthConfiguration } from "@/x-master/lib/x-user-auth";

function redirectTo(request: Request, query: string) {
  return new Response(null, { status: 302, headers: { location: new URL(`/x-radar?x_auth=${query}`, request.url).toString(), "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  const configuration = xAuthConfiguration(request);
  if (!configuration.configured) return redirectTo(request, "setup_required");
  const created = await createXAuthFlow(request, configuration);
  const authorizeUrl = buildXAuthorizeUrl({
    clientId: configuration.clientId,
    callbackUrl: configuration.callbackUrl,
    state: created.flow.state,
    challenge: created.challenge,
  });
  return new Response(null, {
    status: 302,
    headers: { location: authorizeUrl.toString(), "set-cookie": created.cookie, "cache-control": "no-store" },
  });
}

