import { radarApiBase } from "../_radar";
import { authorizeOperatorMutation, authorizeOperatorRead } from "@/x-master/lib/operator-session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function upstreamConfiguration() {
  const apiBase = radarApiBase();
  const adminToken = process.env.RADAR_ADMIN_TOKEN;
  return apiBase && adminToken ? { apiBase, adminToken } : null;
}

async function forward(url: string, adminToken: string, init?: RequestInit) {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${adminToken}`,
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
      },
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

export async function GET(request: Request) {
  const authorization = await authorizeOperatorRead(request);
  if (!authorization.ok) return authorization.response;
  const configured = upstreamConfiguration();
  if (!configured) {
    return Response.json(
      { detail: "The Radar backend connection has not been configured." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  const requestUrl = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(requestUrl.searchParams.get("limit")) || 25));
  if (requestUrl.searchParams.get("view") === "operations") {
    const storyId = requestUrl.searchParams.get("story_id") ?? "";
    if (!UUID.test(storyId)) {
      return Response.json({ detail: "A valid story identifier is required." }, { status: 422 });
    }
    return forward(
      `${configured.apiBase}/v1/story-operations?story_id=${storyId}&limit=${limit}`,
      configured.adminToken,
    );
  }
  return forward(`${configured.apiBase}/v1/review/story-assignments?limit=${limit}`, configured.adminToken);
}

export async function POST(request: Request) {
  const authorization = await authorizeOperatorMutation(request);
  if (!authorization.ok) return authorization.response;
  const configured = upstreamConfiguration();
  if (!configured) {
    return Response.json(
      { detail: "The Radar backend connection has not been configured." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  let input: Record<string, unknown>;
  try {
    input = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ detail: "Invalid story-review request." }, { status: 400 });
  }
  const action = input.action;
  const id = input.id;
  if (typeof action !== "string" || typeof id !== "string" || !UUID.test(id)) {
    return Response.json({ detail: "A valid action and identifier are required." }, { status: 422 });
  }

  let upstreamPath: string;
  let body: Record<string, unknown>;
  if (["join_candidate", "keep_separate", "reject_candidate"].includes(action)) {
    upstreamPath = `/v1/review/story-assignments/${id}`;
    body = {
      action,
      event_id: input.event_id,
      actor_id: "dashboard",
      reason: input.reason,
    };
  } else if (action === "revert") {
    upstreamPath = `/v1/story-operations/${id}/revert`;
    body = {
      event_id: input.event_id,
      actor_id: "dashboard",
      reason: input.reason,
    };
  } else if (action === "split") {
    upstreamPath = `/v1/stories/${id}/split`;
    body = {
      content_item_ids: input.content_item_ids,
      new_title: input.new_title,
      event_id: input.event_id,
      actor_id: "dashboard",
      reason: input.reason,
    };
  } else if (action === "merge") {
    upstreamPath = `/v1/stories/${id}/merge`;
    body = {
      source_story_ids: input.source_story_ids,
      confidence: input.confidence ?? 1,
      event_id: input.event_id,
      actor_id: "dashboard",
      reason: input.reason,
    };
  } else {
    return Response.json({ detail: "Unsupported story-review action." }, { status: 422 });
  }

  return forward(`${configured.apiBase}${upstreamPath}`, configured.adminToken, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
