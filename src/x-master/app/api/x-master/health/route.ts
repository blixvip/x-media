import { isD1Database, xMasterJson, xMasterRuntime } from "@/x-master/lib/x-master-api";

export async function GET(request: Request) {
  const runtime = await xMasterRuntime();
  return xMasterJson(request, {
    ok: true,
    product: "X Master",
    capabilities: {
      storage: isD1Database(runtime.DB),
      generation: Boolean(runtime.OPENAI_API_KEY),
      fallback_generation: Boolean(runtime.OPENROUTER_API_KEY),
      voice_memory: Boolean(runtime.SUPABASE_URL && runtime.SUPABASE_SERVICE_ROLE_KEY),
      media_service: Boolean(runtime.X_MEDIA_SERVICE_URL && runtime.X_MEDIA_SERVICE_TOKEN),
    },
  });
}
