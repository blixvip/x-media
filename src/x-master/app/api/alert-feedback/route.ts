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

  let body: { alert_id?: string; outcome?: string; event_id?: string; actor_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: "Invalid feedback request." }, { status: 400 });
  }
  if (!body.alert_id || !/^[0-9a-f-]{36}$/i.test(body.alert_id)) {
    return Response.json({ detail: "A valid alert ID is required." }, { status: 400 });
  }
  const { alert_id: alertId, ...payload } = body;
  try {
    const response = await fetch(`${apiBase}/v1/alerts/${alertId}/feedback`, {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json({ detail: "The Radar backend is temporarily unavailable." }, { status: 502 });
  }
}
