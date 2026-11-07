import { nodeRuntime } from "@/x-master/lib/node-runtime";
import { resolveXUserSession, xAuthConfiguration } from "@/x-master/lib/x-user-auth";

type R2ObjectLike = { body: ReadableStream; httpEtag?: string; size?: number };
type RuntimeBindings = { MEDIA?: { get(key: string): Promise<R2ObjectLike | null> } };

async function bindings(): Promise<RuntimeBindings> {
  try {
    const runtime = (await nodeRuntime());
    return runtime.env as RuntimeBindings;
  } catch { return {}; }
}

export async function GET(request: Request, context: { params: Promise<{ asset: string }> }) {
  const configuration = xAuthConfiguration(request);
  if (!configuration.configured) return new Response("Not found", { status: 404 });
  const resolved = await resolveXUserSession(request, configuration);
  if (!resolved.session) return new Response("Not found", { status: 404, headers: resolved.cookie ? { "set-cookie": resolved.cookie } : undefined });
  const { asset } = await context.params;
  if (!/^[a-f0-9]{32}\.png$/.test(asset)) return new Response("Not found", { status: 404 });
  const runtime = await bindings();
  const object = await runtime.MEDIA?.get(`${resolved.session.user.id}/${asset}`);
  if (!object || (typeof object.size === "number" && object.size > 10_000_000)) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=300",
      "content-security-policy": "default-src 'none'; sandbox",
      ...(object.httpEtag ? { etag: object.httpEtag } : {}),
      ...(resolved.cookie ? { "set-cookie": resolved.cookie } : {}),
    },
  });
}
