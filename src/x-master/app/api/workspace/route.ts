import { xMasterRuntime, xMasterJson } from '@/x-master/lib/x-master-api';
import { resolveAppSession } from '@/x-master/lib/x-app-auth';
import { workspaceCapabilities } from '@/x-master/lib/workspace-capabilities';

export async function GET(request: Request) {
  const runtime = await xMasterRuntime();
  const session = await resolveAppSession(request, runtime);
  return xMasterJson(request, { capabilities: workspaceCapabilities(runtime), user: session?.user ?? null }, 200, session?.cookie);
}
