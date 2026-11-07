import { authorizeXMasterRequest, mutationOriginAllowed, readBoundedObject, xMasterJson, xMasterOptions } from "@/x-master/lib/x-master-api";
import { auditXMasterAction, deleteXMasterDraft, listXMasterDrafts, normalizeDraftInput, saveXMasterDraft, DraftConflictError } from "@/x-master/lib/x-master-store";

export function OPTIONS(request: Request) { return xMasterOptions(request); }

export async function GET(request: Request) {
  const authorization = await authorizeXMasterRequest(request);
  if (!authorization.ok) return authorization.response;
  const drafts = await listXMasterDrafts(authorization.context.database, authorization.context.ownerId);
  return xMasterJson(request, { drafts }, 200, authorization.context.cookie);
}

export async function POST(request: Request) {
  const authorization = await authorizeXMasterRequest(request, "drafts:write");
  if (!authorization.ok) return authorization.response;
  if (!mutationOriginAllowed(request, authorization.context.method)) return xMasterJson(request, { error: "Trusted origin required." }, 403);
  try {
    const body = await readBoundedObject(request);
    if (body.revision !== undefined && (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0)) return xMasterJson(request, {error:'Invalid draft revision.'},400);
    const draft = await saveXMasterDraft(authorization.context.database, authorization.context.ownerId, normalizeDraftInput(body), body.revision as number | undefined);
    await auditXMasterAction(authorization.context.database, authorization.context.ownerId, "draft.saved", "draft", draft.id, { format: draft.format, source: authorization.context.method });
    return xMasterJson(request, { draft }, 201, authorization.context.cookie);
  } catch (error) { return xMasterJson(request, { error: error instanceof DraftConflictError ? error.message : 'Could not save this draft. Check its content and try again.' }, error instanceof DraftConflictError ? 409 : 400, authorization.context.cookie); }
}

export async function PATCH(request: Request) { return POST(request); }

export async function DELETE(request: Request) {
  const authorization = await authorizeXMasterRequest(request, "drafts:write");
  if (!authorization.ok) return authorization.response;
  if (!mutationOriginAllowed(request, authorization.context.method)) return xMasterJson(request, { error: "Trusted origin required." }, 403);
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const deleted = await deleteXMasterDraft(authorization.context.database, authorization.context.ownerId, id);
  if (!deleted) return xMasterJson(request, { error: "Draft not found." }, 404, authorization.context.cookie);
  await auditXMasterAction(authorization.context.database, authorization.context.ownerId, "draft.deleted", "draft", id);
  return xMasterJson(request, { ok: true }, 200, authorization.context.cookie);
}
