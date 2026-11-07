import {
  loadPublicEvidenceReturnBrief,
  normalizePublicEvidenceBriefSince,
  publicEvidenceHistoryContract,
} from "../../../lib/public-evidence-history.ts";

const mode = "public-request-observed-return-brief";

function json(payload: unknown, status: number, cacheControl = "no-store") {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": cacheControl,
      "x-content-type-options": "nosniff",
      "x-radar-mode": mode,
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const now = Math.floor(Date.now() / 1_000);
  const sinceSeconds = normalizePublicEvidenceBriefSince(url.searchParams.get("since"), now);
  if (sinceSeconds === null) {
    return json({
      error: "invalid_checkpoint",
      message: "Use a valid past timestamp within the retained evidence window.",
    }, 400);
  }
  const requestedLimit = Number(url.searchParams.get("limit") ?? publicEvidenceHistoryContract.maximumReturnBriefResults);
  const limit = Number.isSafeInteger(requestedLimit)
    ? Math.min(publicEvidenceHistoryContract.maximumReturnBriefResults, Math.max(1, requestedLimit))
    : publicEvidenceHistoryContract.maximumReturnBriefResults;
  const result = await loadPublicEvidenceReturnBrief(new Date(sinceSeconds * 1_000).toISOString(), limit);
  if (result.status !== "available") {
    return json({
      error: "archive_unavailable",
      message: result.reason,
      brief_version: result.brief_version,
      since: result.since,
    }, 503);
  }
  return json({
    mode: result.mode,
    brief_version: result.brief_version,
    since: result.since,
    generated_at: result.generated_at,
    retention_days: result.retention_days,
    result_count: result.result_count,
    source_count: result.source_count,
    truncated: result.truncated,
    items: result.items.map((item) => ({
      item_key: item.item_key,
      title: item.title,
      topic: item.topic,
      niche: item.niche,
      source: item.source,
      source_url: item.source_url,
      creator_username: item.creator_username,
      published_at: item.published_at,
      first_observed_at: item.first_observed_at,
      last_observed_at: item.last_observed_at,
      observation_windows: item.observation_windows,
      scores: { heat: null, confidence: null, relevance: null, opportunity: null },
    })),
    boundaries: {
      request_observed: true,
      continuous_monitoring: false,
      story_membership: false,
      ranking: false,
    },
  }, 200, "private, max-age=0");
}
