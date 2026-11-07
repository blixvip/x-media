import { radarApiBase } from "../_radar";
import { authorizeOperatorMutation } from "@/x-master/lib/operator-session";

export async function POST(request: Request) {
  const authorization = await authorizeOperatorMutation(request);
  if (!authorization.ok) return authorization.response;
  const apiBase = radarApiBase();
  const adminToken = process.env.RADAR_ADMIN_TOKEN;
  if (!apiBase || !adminToken) {
    return Response.json(
      { detail: "The Radar backend connection has not been configured." },
      { status: 503 },
    );
  }

  let body: { action_id?: string; event_id?: string; metrics?: Record<string, number | null>; observed_at?: string; provenance?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: "Invalid published-result request." }, { status: 400 });
  }
  if (!body.action_id || !/^[0-9a-f-]{36}$/i.test(body.action_id)) {
    return Response.json({ detail: "A valid published action ID is required." }, { status: 400 });
  }
  const { action_id: actionId, ...payload } = body;

  try {
    const response = await fetch(`${apiBase}/v1/content-actions/${actionId}/outcomes`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json(
      { detail: "The Radar backend is temporarily unavailable." },
      { status: 502 },
    );
  }
}
