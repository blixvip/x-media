import { authorizeXMasterRequest, xMasterJson, xMasterOptions } from "@/x-master/lib/x-master-api";

export function OPTIONS(request: Request) { return xMasterOptions(request); }
export async function GET(request: Request) {
  const authorization = await authorizeXMasterRequest(request);
  if (!authorization.ok) return authorization.response;
  return xMasterJson(request, { authenticated: true, method: authorization.context.method, scopes: authorization.context.scopes }, 200, authorization.context.cookie);
}
