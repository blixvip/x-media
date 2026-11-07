import { proxyRadarRead } from "../../_radar";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { path = [] } = await context.params;
  return proxyRadarRead(request, path);
}
