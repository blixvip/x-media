import {
  normalizePublicEvidenceSearchQuery,
  publicEvidenceHistoryContract,
  searchPublicEvidenceHistory,
} from "../../../lib/public-evidence-history.ts";

function json(payload: unknown, status: number, cacheControl: string) {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": cacheControl,
      "x-content-type-options": "nosniff",
      "x-radar-mode": "public-request-observed-archive-search",
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = normalizePublicEvidenceSearchQuery(url.searchParams.get("q"));
  if (!query) {
    return json({
      error: "invalid_query",
      message: `Use ${publicEvidenceHistoryContract.minimumSearchQueryCharacters} to ${publicEvidenceHistoryContract.maximumSearchQueryCharacters} characters.`,
    }, 400, "no-store");
  }
  const requestedLimit = Number(url.searchParams.get("limit") ?? publicEvidenceHistoryContract.maximumSearchResults);
  const limit = Number.isSafeInteger(requestedLimit)
    ? Math.min(publicEvidenceHistoryContract.maximumSearchResults, Math.max(1, requestedLimit))
    : publicEvidenceHistoryContract.maximumSearchResults;
  const result = await searchPublicEvidenceHistory(query, limit);
  if (result.status !== "available") {
    return json({
      error: "archive_unavailable",
      message: result.reason,
      query: result.query,
      search_version: result.search_version,
    }, 503, "no-store");
  }
  return json({
    query: result.query,
    search_version: result.search_version,
    generated_at: result.generated_at,
    stories: [],
    creators: [],
    signals: result.items.map((item) => ({
      id: item.item_key,
      evidence_key: item.item_key,
      title: item.title,
      source: item.source,
      source_url: item.source_url,
      object_type: item.niche || item.topic || "retained evidence",
      age_seconds: Math.max(0, Math.floor((Date.parse(result.generated_at) - Date.parse(item.published_at)) / 1_000)),
      creator: item.creator_username ? { username: item.creator_username } : null,
      scores: { heat: null, opportunity: null },
      match: { score: item.match_score, matched_on: item.matched_on },
    })),
    truncated: { stories: false, creators: false, signals: result.truncated },
    archive: {
      mode: result.mode,
      retention_days: result.retention_days,
      matched_items: result.result_count,
      returned_items: result.items.length,
    },
  }, 200, "public, max-age=30, s-maxage=60, stale-while-revalidate=300");
}
