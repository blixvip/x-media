import { radarApiBase } from "../../_radar";
import { authorizeOperatorMutation, authorizeOperatorRead } from "@/x-master/lib/operator-session";

type RouteContext = { params: Promise<{ path?: string[] }> };

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}";
const READ_PATHS = [
  /^sources$/,
  /^searches\/recent$/,
  new RegExp(`^searches/${UUID}$`),
  new RegExp(`^searches/${UUID}/stream$`),
  /^collections$/,
] as const;
const POST_PATHS = [/^searches$/, /^saved$/] as const;
const DELETE_PATHS = [new RegExp(`^saved/${UUID}$`)] as const;

function allowed(path: string, method: string) {
  const patterns = method === "GET" ? READ_PATHS : method === "POST" ? POST_PATHS : DELETE_PATHS;
  return patterns.some((pattern) => pattern.test(path));
}

async function proxy(request: Request, context: RouteContext) {
  const authorization = request.method === "GET"
    ? await authorizeOperatorRead(request)
    : await authorizeOperatorMutation(request);
  if (!authorization.ok) return authorization.response;

  const { path: parts = [] } = await context.params;
  const path = parts.join("/");
  if (!allowed(path, request.method)) {
    return Response.json({ detail: "Video G endpoint not found." }, { status: 404 });
  }
  const apiBase = radarApiBase();
  const adminToken = process.env.RADAR_ADMIN_TOKEN;
  if (!apiBase || !adminToken) {
    return Response.json(
      { detail: "The Radar backend connection has not been configured." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  const incoming = new URL(request.url);
  const upstream = new URL(`${apiBase}/v1/video-g/${path}`);
  upstream.search = incoming.search;
  const stream = path.endsWith("/stream");
  const headers = new Headers({
    authorization: `Bearer ${adminToken}`,
    accept: stream ? "text/event-stream" : "application/json",
  });
  const lastEventId = request.headers.get("last-event-id");
  if (lastEventId) headers.set("last-event-id", lastEventId.slice(0, 64));
  let body: string | undefined;
  if (request.method === "POST") {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 20_000) {
      return Response.json({ detail: "Video G request is too large." }, { status: 413 });
    }
    body = await request.text();
    if (new TextEncoder().encode(body).byteLength > 20_000) {
      return Response.json(
        { detail: "Video G request is too large." },
        { status: 413, headers: { "cache-control": "no-store" } },
      );
    }
    headers.set("content-type", "application/json");
  }
  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
      signal: stream ? request.signal : AbortSignal.timeout(15_000),
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? (stream ? "text/event-stream" : "application/json"),
        "cache-control": "no-store",
        ...(stream ? { "x-accel-buffering": "no" } : {}),
      },
    });
  } catch {
    return Response.json(
      { detail: "The Video G backend is temporarily unavailable." },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}

export async function GET(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return proxy(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  return proxy(request, context);
}
