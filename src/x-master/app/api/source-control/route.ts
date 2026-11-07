import { radarApiBase } from "../_radar";
import { authorizeOperatorMutation } from "@/x-master/lib/operator-session";

const SOURCE_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export async function POST(request: Request) {
  const authorization = await authorizeOperatorMutation(request);
  if (!authorization.ok) return authorization.response;

  const apiBase = radarApiBase();
  const adminToken = process.env.RADAR_ADMIN_TOKEN;
  if (!apiBase || !adminToken) {
    return Response.json(
      { detail: "The Radar backend connection has not been configured." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  let input: Record<string, unknown>;
  try {
    input = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ detail: "Invalid source-control request." }, { status: 400 });
  }
  if (
    typeof input.source_id !== "string"
    || !SOURCE_ID.test(input.source_id)
    || typeof input.enabled !== "boolean"
    || typeof input.event_id !== "string"
    || typeof input.reason !== "string"
    || input.reason.trim().length < 3
  ) {
    return Response.json(
      { detail: "A valid source, state, event identifier, and reason are required." },
      { status: 422 },
    );
  }

  try {
    const response = await fetch(`${apiBase}/v1/sources/${input.source_id}/control`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminToken}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        enabled: input.enabled,
        event_id: input.event_id,
        actor_id: "dashboard",
        reason: input.reason.trim(),
      }),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { detail: "The Radar backend is temporarily unavailable." },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
