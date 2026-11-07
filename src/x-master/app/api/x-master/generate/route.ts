import { authorizeXMasterRequest, mutationOriginAllowed, parseGenerateRequest, readBoundedObject, xMasterJson, xMasterOptions } from "@/x-master/lib/x-master-api";
import { generateContentWithFallback, generateOpenAIImage } from "@/x-master/lib/x-content-engine";
import { getAutomationSettings } from "@/x-master/lib/x-automation-store";
import { retrieveVoiceMemory } from "@/x-master/lib/x-style-memory";
import { auditXMasterAction } from "@/x-master/lib/x-master-store";

export function OPTIONS(request: Request) { return xMasterOptions(request); }

async function evidenceId(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `source-${Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 20)}`;
}

export async function POST(request: Request) {
  const authorization = await authorizeXMasterRequest(request, "generate:write");
  if (!authorization.ok) return authorization.response;
  if (!mutationOriginAllowed(request, authorization.context.method)) return xMasterJson(request, { error: "Trusted origin required." }, 403);
  let input;
  try { input = parseGenerateRequest(await readBoundedObject(request)); }
  catch { input = null; }
  if (!input) return xMasterJson(request, { error: "Invalid generation request." }, 400, authorization.context.cookie);
  const runtime = authorization.context.runtime;
  if (!runtime.OPENAI_API_KEY) return xMasterJson(request, { error: "OpenAI generation is not configured." }, 503, authorization.context.cookie);
  const settings = await getAutomationSettings(authorization.context.database, authorization.context.ownerId);
  let voiceMemory = { voice_examples: [] as string[], avoid_examples: [] as string[] };
  try { voiceMemory = await retrieveVoiceMemory(input.source_text, runtime); } catch { /* Brand profile examples remain available if vector memory is offline. */ }
  const profile = input.tone ? { ...settings.profile, voice_traits: [input.tone, ...settings.profile.voice_traits.filter((trait) => trait !== input.tone)].slice(0, 12) } : settings.profile;
  try {
    let artifact = await generateContentWithFallback({ ...input, evidence_ids: [await evidenceId(`${input.source_url ?? "topic"}:${input.source_text}`)], profile, voice_memory: voiceMemory }, {
      openai_api_key: runtime.OPENAI_API_KEY,
      openai_model: runtime.OPENAI_CONTENT_MODEL,
      openrouter_api_key: runtime.OPENROUTER_API_KEY,
      openrouter_model: runtime.OPENROUTER_MODEL,
      site_url: new URL(request.url).origin,
    });
    if (input.format === "meme") {
      if (!runtime.MEDIA) return xMasterJson(request, { error: "Meme storage is not configured." }, 503, authorization.context.cookie);
      const generated = await generateOpenAIImage(artifact.meme_prompt ?? "", runtime.OPENAI_API_KEY);
      const assetId = crypto.randomUUID();
      await runtime.MEDIA.put(`${authorization.context.ownerId}/${assetId}.png`, generated.bytes, { httpMetadata: { contentType: generated.contentType } });
      artifact = { ...artifact, image_url: `/api/x-radar/media/${assetId}.png` };
    }
    await auditXMasterAction(authorization.context.database, authorization.context.ownerId, "content.generated", "artifact", artifact.evidence_ids[0], { format: artifact.format, provider: artifact.generator_version, source: authorization.context.method });
    return xMasterJson(request, { artifact, memory: { examples: voiceMemory.voice_examples.length, rejections: voiceMemory.avoid_examples.length } }, 200, authorization.context.cookie);
  } catch { return xMasterJson(request, { error: "Content generation failed safely. Try again." }, 502, authorization.context.cookie); }
}
