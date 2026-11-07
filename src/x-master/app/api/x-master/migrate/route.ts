import { authorizeXMasterRequest, mutationOriginAllowed, validateLegacyMigrationUrl, xMasterJson } from "@/x-master/lib/x-master-api";
import { auditXMasterAction, normalizeDraftInput, saveXMasterDraft } from "@/x-master/lib/x-master-store";

async function payloadHash(value: unknown) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  const authorization = await authorizeXMasterRequest(request);
  if (!authorization.ok) return authorization.response;
  if (authorization.context.method !== "x_session" || !mutationOriginAllowed(request, "x_session")) {
    return xMasterJson(request, { error: "Web session required." }, 403, authorization.context.cookie);
  }
  const legacy = validateLegacyMigrationUrl(authorization.context.runtime.X_MASTER_LEGACY_URL);
  if (!legacy) return xMasterJson(request, { error: "Previous X Master migration is not configured." }, 503, authorization.context.cookie);
  const endpoint = new URL("/api/drafts", legacy);
  const headers: Record<string, string> = { accept: "application/json" };
  if (authorization.context.runtime.X_MASTER_LEGACY_BYPASS_TOKEN) headers["x-vercel-protection-bypass"] = authorization.context.runtime.X_MASTER_LEGACY_BYPASS_TOKEN;
  try {
    const response = await fetch(endpoint, { headers, redirect: "error", signal: AbortSignal.timeout(12_000) });
    const text = await response.text();
    if (!response.ok || !text || text.length > 1_000_000) throw new Error();
    const payload = JSON.parse(text) as unknown;
    const rawDrafts = Array.isArray(payload) ? payload : payload && typeof payload === "object" && Array.isArray((payload as { drafts?: unknown }).drafts) ? (payload as { drafts: unknown[] }).drafts : null;
    if (!rawDrafts || rawDrafts.length > 1_000) throw new Error();
    const drafts = rawDrafts.map((draft) => normalizeDraftInput(draft)).sort((left, right) => left.id.localeCompare(right.id));
    for (const draft of drafts) await saveXMasterDraft(authorization.context.database, authorization.context.ownerId, draft);
    const sourceHash = await payloadHash(drafts);
    await auditXMasterAction(authorization.context.database, authorization.context.ownerId, "migration.legacy_drafts", "migration", sourceHash, { imported: drafts.length, source_origin: legacy.origin });
    return xMasterJson(request, { imported: drafts.length, source_hash: sourceHash, voice_memory: "reused_in_place" }, 200, authorization.context.cookie);
  } catch {
    return xMasterJson(request, { error: "Previous X Master data could not be imported safely." }, 502, authorization.context.cookie);
  }
}
