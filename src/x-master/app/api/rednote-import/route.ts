import { radarApiBase } from "../_radar";
import { authorizeOperatorMutation } from "@/x-master/lib/operator-session";

const EVENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

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
    return Response.json({ detail: "Invalid RedNote import request." }, { status: 400 });
  }
  if (
    typeof input.import_id !== "string"
    || !EVENT_ID.test(input.import_id)
    || typeof input.external_id !== "string"
    || input.external_id.trim().length < 1
    || typeof input.canonical_url !== "string"
    || !input.canonical_url.startsWith("https://")
    || typeof input.original_text !== "string"
    || input.original_text.trim().length < 1
    || typeof input.published_at !== "string"
    || typeof input.captured_at !== "string"
    || typeof input.reason !== "string"
    || input.reason.trim().length < 3
    || typeof input.authorization_reference !== "string"
    || input.authorization_reference.trim().length < 3
  ) {
    return Response.json(
      { detail: "URL, source ID, original text, timestamps, authorization reference, and reason are required." },
      { status: 422, headers: { "cache-control": "no-store" } },
    );
  }

  const forwarded = {
    ...input,
    actor_id: "dashboard",
    external_id: input.external_id.trim(),
    reason: input.reason.trim(),
    authorization_reference: input.authorization_reference.trim(),
  };
  try {
    const response = await fetch(`${apiBase}/v1/imports/rednote`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminToken}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(forwarded),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
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
