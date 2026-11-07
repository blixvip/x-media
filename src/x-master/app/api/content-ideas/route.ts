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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: "Invalid content-idea request." }, { status: 400 });
  }

  try {
    const response = await fetch(`${apiBase}/v1/content-ideas`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
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
