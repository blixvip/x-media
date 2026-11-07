const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}";

const ALLOWED_READ_PATHS = [
  /^v1\/feed$/,
  /^v1\/search$/,
  /^v1\/sources\/health$/,
  /^v1\/stories$/,
  new RegExp(`^v1/stories/${UUID}$`),
  /^v1\/creators$/,
  /^v1\/rankings$/,
  /^v1\/evaluation\/summary$/,
  /^v1\/opportunities$/,
  /^v1\/content-ideas$/,
  new RegExp(`^v1/content-ideas/${UUID}/performance$`),
  /^v1\/alerts$/,
  new RegExp(`^v1/replay/${UUID}$`),
  /^v1\/stream$/,
] as const;

export function radarApiBase() {
  const privateBinding = process.env.CUSTOMER_HTTP_RADAR_API;
  const configured = privateBinding ?? process.env.RADAR_API_URL;
  if (!configured) return null;
  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.username || parsed.password) return null;
    if (!privateBinding && process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
      const composeInternalApi =
        process.env.RADAR_API_ALLOW_COMPOSE_HTTP === "true"
        && parsed.hostname === "api"
        && parsed.port === "8080";
      if (!composeInternalApi) return null;
    }
    parsed.pathname = parsed.pathname.replace(/\/$/, "");
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function isAllowedRadarRead(path: string) {
  return ALLOWED_READ_PATHS.some((pattern) => pattern.test(path));
}

export async function proxyRadarRead(request: Request, pathParts: string[]) {
  const path = pathParts.join("/");
  if (!isAllowedRadarRead(path)) {
    return Response.json({ detail: "Radar endpoint not found." }, { status: 404 });
  }
  const apiBase = radarApiBase();
  if (!apiBase) {
    return Response.json(
      { detail: "The Radar backend connection has not been configured." },
      { status: 503 },
    );
  }

  const incoming = new URL(request.url);
  const upstream = new URL(`${apiBase}/${path}`);
  upstream.search = incoming.search;
  const stream = path === "v1/stream";
  const headers = new Headers({ accept: stream ? "text/event-stream" : "application/json" });
  const lastEventId = request.headers.get("last-event-id");
  if (lastEventId) headers.set("last-event-id", lastEventId.slice(0, 256));

  try {
    const response = await fetch(upstream, {
      method: "GET",
      headers,
      cache: "no-store",
      redirect: "manual",
      signal: stream ? request.signal : AbortSignal.timeout(8_000),
    });
    const responseHeaders = new Headers();
    responseHeaders.set(
      "content-type",
      response.headers.get("content-type") ?? (stream ? "text/event-stream" : "application/json"),
    );
    responseHeaders.set("cache-control", "no-store");
    if (stream) {
      responseHeaders.set("connection", "keep-alive");
      responseHeaders.set("x-accel-buffering", "no");
    }
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { detail: "The Radar backend is temporarily unavailable." },
      { status: 502 },
    );
  }
}
