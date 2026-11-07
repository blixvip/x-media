import { authorizeXMasterRequest, mutationOriginAllowed, readBoundedObject, validateMediaServiceUrl, xMasterJson, xMasterOptions } from "@/x-master/lib/x-master-api";
import { auditXMasterAction, createMediaJob, listMediaJobs, parseMediaJobInput, updateMediaJob } from "@/x-master/lib/x-master-store";

export function OPTIONS(request: Request) { return xMasterOptions(request); }

export async function GET(request: Request) {
  const authorization = await authorizeXMasterRequest(request);
  if (!authorization.ok) return authorization.response;
  return xMasterJson(request, { jobs: await listMediaJobs(authorization.context.database, authorization.context.ownerId) }, 200, authorization.context.cookie);
}

export async function POST(request: Request) {
  const authorization = await authorizeXMasterRequest(request, "media:write");
  if (!authorization.ok) return authorization.response;
  if (!mutationOriginAllowed(request, authorization.context.method)) return xMasterJson(request, { error: "Trusted origin required." }, 403);
  let input;
  try { input = parseMediaJobInput(await readBoundedObject(request)); }
  catch { input = null; }
  if (!input) return xMasterJson(request, { error: "Invalid media job." }, 400, authorization.context.cookie);
  const job = await createMediaJob(authorization.context.database, authorization.context.ownerId, input);
  const runtime = authorization.context.runtime;
  const serviceUrl = validateMediaServiceUrl(runtime.X_MEDIA_SERVICE_URL, runtime.X_MEDIA_ALLOW_COMPOSE_HTTP === "true");
  if (!serviceUrl || !runtime.X_MEDIA_SERVICE_TOKEN || runtime.X_MEDIA_SERVICE_TOKEN.length < 20) {
    await updateMediaJob(authorization.context.database, authorization.context.ownerId, job.id, "failed", null, "Media service is not configured.");
    return xMasterJson(request, { error: "Media service is not configured.", job: { ...job, state: "failed", error: "Media service is not configured." } }, 503, authorization.context.cookie);
  }
  await updateMediaJob(authorization.context.database, authorization.context.ownerId, job.id, "processing", null, null);
  try {
    const endpoint = new URL("/v1/x-master/media", serviceUrl);
    const response = await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${runtime.X_MEDIA_SERVICE_TOKEN}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ job_id: job.id, owner_id: authorization.context.ownerId, ...input }), redirect: "error", signal: AbortSignal.timeout(input.kind === "x_video_drive" ? 190_000 : 25_000) });
    const raw = await response.text();
    if (raw.length > 1_000_000) throw new Error("Media response is too large.");
    const result = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Media processing failed.");
    await updateMediaJob(authorization.context.database, authorization.context.ownerId, job.id, "complete", result, null);
    await auditXMasterAction(authorization.context.database, authorization.context.ownerId, "media.completed", "media_job", job.id, { kind: input.kind });
    return xMasterJson(request, { job: { ...job, state: "complete", result, updated_at: new Date().toISOString() } }, 201, authorization.context.cookie);
  } catch {
    await updateMediaJob(authorization.context.database, authorization.context.ownerId, job.id, "failed", null, "Media processing failed.");
    return xMasterJson(request, { error: "Media processing failed safely.", job: { ...job, state: "failed", error: "Media processing failed." } }, 502, authorization.context.cookie);
  }
}
