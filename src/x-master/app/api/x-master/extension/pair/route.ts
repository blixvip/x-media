import { authorizeXMasterRequest, isD1Database, mutationOriginAllowed, readBoundedObject, xMasterJson, xMasterOptions, xMasterRuntime } from "@/x-master/lib/x-master-api";
import { claimPairingCode, createPairingCode, extensionOriginAllowed, initializeXMasterStore, listExtensionDevices, revokeExtensionDevice } from "@/x-master/lib/x-master-store";

export function OPTIONS(request: Request) { return xMasterOptions(request); }

export async function GET(request: Request) {
  const authorization = await authorizeXMasterRequest(request);
  if (!authorization.ok) return authorization.response;
  const devices = await listExtensionDevices(authorization.context.database, authorization.context.ownerId);
  return xMasterJson(request, { devices }, 200, authorization.context.cookie);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await readBoundedObject(request, 8_000); }
  catch { return xMasterJson(request, { error: "Invalid pairing request." }, 400); }

  if (body.action === "claim") {
    if (!extensionOriginAllowed(request.headers.get("origin"))) return xMasterJson(request, { error: "Extension origin required." }, 403);
    const runtime = await xMasterRuntime();
    if (!isD1Database(runtime.DB)) return xMasterJson(request, { error: "X Master storage is not configured." }, 503);
    await initializeXMasterStore(runtime.DB);
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    const label = typeof body.label === "string" ? body.label.trim() : "Chrome extension";
    try {
      const claimed = await claimPairingCode(runtime.DB, code, label);
      if (!claimed) return xMasterJson(request, { error: "Pairing code is invalid or expired." }, 401);
      return xMasterJson(request, { token: claimed.token, device: { id: claimed.record.id, label: claimed.record.label, scopes: claimed.record.scopes } }, 201);
    } catch { return xMasterJson(request, { error: "Could not pair this extension." }, 400); }
  }

  const authorization = await authorizeXMasterRequest(request);
  if (!authorization.ok) return authorization.response;
  if (!mutationOriginAllowed(request, authorization.context.method) || authorization.context.method === "extension") return xMasterJson(request, { error: "Web session required." }, 403, authorization.context.cookie);
  if (body.action === "create") {
    const pairing = await createPairingCode(authorization.context.database, authorization.context.ownerId);
    return xMasterJson(request, pairing, 201, authorization.context.cookie);
  }
  if (body.action === "revoke" && typeof body.id === "string") {
    const revoked = await revokeExtensionDevice(authorization.context.database, authorization.context.ownerId, body.id);
    return xMasterJson(request, { ok: revoked }, revoked ? 200 : 404, authorization.context.cookie);
  }
  return xMasterJson(request, { error: "Unsupported pairing action." }, 400, authorization.context.cookie);
}
