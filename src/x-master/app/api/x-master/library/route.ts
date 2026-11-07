import { authorizeXMasterRequest, mutationOriginAllowed, readBoundedObject, xMasterJson, xMasterOptions } from "@/x-master/lib/x-master-api";
import { deleteStyleRecord, listStyleRecords, parseStyleRecordInput, saveStyleRecord, searchStyleRecords, type StyleCollection } from "@/x-master/lib/x-style-memory";
import { auditXMasterAction } from "@/x-master/lib/x-master-store";

function collectionFrom(value: string | null): StyleCollection { return value === "rejection" || value === "rejections" ? "rejection" : "example"; }
export function OPTIONS(request: Request) { return xMasterOptions(request); }

export async function GET(request: Request) {
  const authorization = await authorizeXMasterRequest(request);
  if (!authorization.ok) return authorization.response;
  const url = new URL(request.url);
  const collection = collectionFrom(url.searchParams.get("collection"));
  const query = url.searchParams.get("query")?.trim().slice(0, 4_000) ?? "";
  try {
    const records = query ? await searchStyleRecords(collection, query, authorization.context.runtime, 25) : await listStyleRecords(collection, authorization.context.runtime, 50);
    return xMasterJson(request, { records, collection, query }, 200, authorization.context.cookie);
  } catch { return xMasterJson(request, { error: "Voice memory is temporarily unavailable." }, 503, authorization.context.cookie); }
}

export async function POST(request: Request) {
  const authorization = await authorizeXMasterRequest(request, "library:write");
  if (!authorization.ok) return authorization.response;
  if (!mutationOriginAllowed(request, authorization.context.method)) return xMasterJson(request, { error: "Trusted origin required." }, 403);
  try {
    const body = await readBoundedObject(request);
    const collection = collectionFrom(typeof body.collection === "string" ? body.collection : null);
    const record = parseStyleRecordInput(body, collection);
    await saveStyleRecord(record, collection, authorization.context.runtime);
    await auditXMasterAction(authorization.context.database, authorization.context.ownerId, "library.saved", "style_record", record.id, { collection, source: authorization.context.method });
    return xMasterJson(request, { record, collection }, 201, authorization.context.cookie);
  } catch (error) { return xMasterJson(request, { error: error instanceof Error ? error.message : "Could not save voice example." }, 400, authorization.context.cookie); }
}

export async function DELETE(request: Request) {
  const authorization = await authorizeXMasterRequest(request, "library:write");
  if (!authorization.ok) return authorization.response;
  if (!mutationOriginAllowed(request, authorization.context.method)) return xMasterJson(request, { error: "Trusted origin required." }, 403);
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const collection = collectionFrom(url.searchParams.get("collection"));
  try {
    await deleteStyleRecord(id, collection, authorization.context.runtime);
    await auditXMasterAction(authorization.context.database, authorization.context.ownerId, "library.deleted", "style_record", id, { collection });
    return xMasterJson(request, { ok: true });
  } catch (error) { return xMasterJson(request, { error: error instanceof Error ? error.message : "Could not delete voice example." }, 400, authorization.context.cookie); }
}
