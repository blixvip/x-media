import { nodeRuntime } from "@/x-master/lib/node-runtime";
import {
  claimAutomationPublish,
  directPublishGuard,
  finishAutomationPublish,
  getAutomationQueueItem,
  getAutomationSettings,
  initializeAutomationStore,
  listAutomationQueue,
  publishCounts,
  saveAutomationSettings,
  setAutomationArtifact,
  setAutomationQueueState,
  syncAutomationQueue,
  type D1DatabaseLike,
} from "@/x-master/lib/x-automation-store";
import { generateOpenAIContent, generateOpenAIImage, parseBrandProfile, type ContentFormat } from "@/x-master/lib/x-content-engine";
import { parseAutomationPolicy } from "@/x-master/lib/x-growth-copilot";
import { createXPost, repostXPost, resolveXUserSession, sameOriginRequest, xAuthConfiguration } from "@/x-master/lib/x-user-auth";

type RuntimeBindings = {
  DB?: D1DatabaseLike;
  MEDIA?: { put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown> };
  OPENAI_API_KEY?: string;
  OPENAI_CONTENT_MODEL?: string;
  X_PUBLISHING_ENABLED?: string;
  X_AUTOPILOT_ENABLED?: string;
  X_AI_REPLY_APPROVED?: string;
  X_TOKEN_ENCRYPTION_KEY?: string;
};

async function runtimeBindings(): Promise<RuntimeBindings> {
  try {
    const runtime = (await nodeRuntime());
    return runtime.env as RuntimeBindings;
  } catch { return process.env as RuntimeBindings; }
}

function isDatabase(value: unknown): value is D1DatabaseLike {
  return Boolean(value && typeof value === "object" && typeof (value as D1DatabaseLike).prepare === "function" && typeof (value as D1DatabaseLike).batch === "function");
}

async function boundedBody(request: Request, maximum = 80_000): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum) throw new Error("Request is too large.");
  const text = await request.text();
  if (text.length > maximum) throw new Error("Request is too large.");
  const value = JSON.parse(text) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid request.");
  return value as Record<string, unknown>;
}

function safeId(value: unknown) {
  return typeof value === "string" && value.length >= 5 && value.length <= 260 ? value : null;
}

function json(body: unknown, status = 200, cookie?: string) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store", ...(cookie ? { "set-cookie": cookie } : {}) } });
}

async function authenticatedContext(request: Request) {
  const configuration = xAuthConfiguration(request);
  if (!configuration.configured) return { error: json({ detail: configuration.reason }, 503) } as const;
  const resolved = await resolveXUserSession(request, configuration);
  if (!resolved.session) return { error: json({ detail: "Connect your X account first." }, 401, resolved.cookie) } as const;
  const runtime = await runtimeBindings();
  if (!isDatabase(runtime.DB)) return { error: json({ detail: "The automation database is not configured." }, 503, resolved.cookie) } as const;
  await initializeAutomationStore(runtime.DB);
  return { configuration, session: resolved.session, cookie: resolved.cookie, runtime, database: runtime.DB } as const;
}

export async function GET(request: Request) {
  const context = await authenticatedContext(request);
  if ("error" in context) return context.error;
  const [settings, queue] = await Promise.all([
    getAutomationSettings(context.database, context.session.user.id),
    listAutomationQueue(context.database, context.session.user.id),
  ]);
  return json({
    authenticated: true,
    profile: settings.profile,
    policy: settings.policy,
    queue,
    capabilities: {
      ai_generation: Boolean(context.runtime.OPENAI_API_KEY),
      direct_publishing: context.runtime.X_PUBLISHING_ENABLED === "true" && context.session.scope.split(/\s+/).includes("tweet.write"),
      autopilot: context.runtime.X_AUTOPILOT_ENABLED === "true" && Boolean(context.runtime.X_TOKEN_ENCRYPTION_KEY),
      automated_replies: context.runtime.X_AI_REPLY_APPROVED === "true",
      quote_mode: "manual_composer",
    },
  }, 200, context.cookie);
}

export async function PATCH(request: Request) {
  if (!sameOriginRequest(request)) return json({ detail: "Same-origin request required." }, 403);
  const context = await authenticatedContext(request);
  if ("error" in context) return context.error;
  try {
    const body = await boundedBody(request);
    const profile = parseBrandProfile(body.profile);
    const parsedPolicy = parseAutomationPolicy(body.policy);
    if (!profile || !parsedPolicy) return json({ detail: "Invalid brand or automation settings." }, 400, context.cookie);
    if (parsedPolicy.autopilot_enabled && (context.runtime.X_AUTOPILOT_ENABLED !== "true" || !context.runtime.X_TOKEN_ENCRYPTION_KEY)) return json({ detail: "Server autopilot or its credential vault is disabled." }, 409, context.cookie);
    if (parsedPolicy.x_ai_reply_approved && context.runtime.X_AI_REPLY_APPROVED !== "true") return json({ detail: "Automated replies require documented X approval." }, 409, context.cookie);
    const policy = {
      ...parsedPolicy,
      autopilot_enabled: parsedPolicy.autopilot_enabled && context.runtime.X_AUTOPILOT_ENABLED === "true",
      x_ai_reply_approved: parsedPolicy.x_ai_reply_approved && context.runtime.X_AI_REPLY_APPROVED === "true",
    };
    await saveAutomationSettings(context.database, context.session.user.id, profile, policy);
    return json({ profile, policy }, 200, context.cookie);
  } catch (error) {
    return json({ detail: error instanceof Error ? error.message : "Invalid request." }, 400, context.cookie);
  }
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return json({ detail: "Same-origin request required." }, 403);
  const context = await authenticatedContext(request);
  if ("error" in context) return context.error;
  let body: Record<string, unknown>;
  try { body = await boundedBody(request); }
  catch (error) { return json({ detail: error instanceof Error ? error.message : "Invalid request." }, 400, context.cookie); }
  const ownerId = context.session.user.id;
  const settings = await getAutomationSettings(context.database, ownerId);

  if (body.action === "sync") {
    if (!Array.isArray(body.candidates)) return json({ detail: "Candidates are required." }, 400, context.cookie);
    const queue = await syncAutomationQueue(context.database, ownerId, body.candidates, settings.policy);
    return json({ queue }, 200, context.cookie);
  }

  const id = safeId(body.id);
  if (!id) return json({ detail: "A valid queue item is required." }, 400, context.cookie);

  if (body.action === "generate") {
    const item = await getAutomationQueueItem(context.database, ownerId, id);
    if (!item || !item.decision.format || item.decision.format === "repost") return json({ detail: "This queue item cannot generate content." }, 409, context.cookie);
    if (!context.runtime.OPENAI_API_KEY) return json({ detail: "OpenAI generation is not configured." }, 503, context.cookie);
    try {
      const requestedFormat = typeof body.format === "string" && ["x_reply", "x_quote", "x_post", "thread", "article", "meme"].includes(body.format) ? body.format as ContentFormat : item.decision.format;
      let artifact = await generateOpenAIContent({
        format: requestedFormat,
        source_text: item.source_text,
        source_url: item.source_url,
        evidence_ids: [item.signal_id],
        profile: settings.profile,
        model: context.runtime.OPENAI_CONTENT_MODEL,
      }, context.runtime.OPENAI_API_KEY);
      if (requestedFormat === "meme") {
        if (!context.runtime.MEDIA) return json({ detail: "Meme image storage is not configured." }, 503, context.cookie);
        const generated = await generateOpenAIImage(artifact.meme_prompt ?? "", context.runtime.OPENAI_API_KEY);
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ownerId}:${id}`));
        const assetId = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
        await context.runtime.MEDIA.put(`${ownerId}/${assetId}.png`, generated.bytes, { httpMetadata: { contentType: generated.contentType } });
        artifact = { ...artifact, image_url: `/api/x-radar/media/${assetId}.png` };
      }
      const updated = await setAutomationArtifact(context.database, ownerId, id, artifact);
      return json({ item: updated }, 200, context.cookie);
    } catch (error) {
      return json({ detail: error instanceof Error ? error.message : "Content generation failed." }, 502, context.cookie);
    }
  }

  if (body.action === "approve" || body.action === "reject" || body.action === "review") {
    const item = await setAutomationQueueState(context.database, ownerId, id, body.action === "approve" ? "approved" : body.action === "reject" ? "rejected" : "review");
    if (!item) return json({ detail: "Queue item not found." }, 404, context.cookie);
    if (body.action === "approve" && item.decision.action === "original" && !item.artifact) {
      await setAutomationQueueState(context.database, ownerId, id, "review");
      return json({ detail: "Generate grounded content before approving an original post." }, 409, context.cookie);
    }
    return json({ item }, 200, context.cookie);
  }

  if (body.action === "publish") {
    if (context.runtime.X_PUBLISHING_ENABLED !== "true") return json({ detail: "Direct publishing is disabled by the server kill switch." }, 409, context.cookie);
    if (!context.session.scope.split(/\s+/).includes("tweet.write")) return json({ detail: "Reconnect X to grant tweet.write." }, 403, context.cookie);
    const item = await getAutomationQueueItem(context.database, ownerId, id);
    if (!item) return json({ detail: "Queue item not found." }, 404, context.cookie);
    const counts = await publishCounts(context.database, ownerId, item.author_handle);
    const guard = directPublishGuard({ decision: item.decision, state: item.state, has_artifact: Boolean(item.artifact), ...counts }, settings.policy);
    if (!guard.allowed) return json({ detail: guard.reason }, 409, context.cookie);
    const claimToken = crypto.randomUUID();
    if (!(await claimAutomationPublish(context.database, ownerId, id, claimToken))) return json({ detail: "This item is already publishing or no longer approved." }, 409, context.cookie);
    try {
      let publishedUrl: string;
      if (item.decision.action === "repost") {
        const postId = item.source_url.match(/\/status\/(\d+)/)?.[1];
        if (!postId) throw new Error("The source post ID is invalid.");
        await repostXPost(context.session.accessToken, ownerId, postId);
        publishedUrl = item.source_url;
      } else {
        if (!item.artifact || item.artifact.unsupported_claims.length) throw new Error("The draft contains unsupported claims and needs revision.");
        const published = await createXPost(context.session.accessToken, item.artifact.primary);
        publishedUrl = `https://x.com/${context.session.user.username.replace(/^@/, "")}/status/${published.id}`;
      }
      await finishAutomationPublish(context.database, ownerId, id, claimToken, publishedUrl, null);
      return json({ item: await getAutomationQueueItem(context.database, ownerId, id) }, 200, context.cookie);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Publishing failed.";
      await finishAutomationPublish(context.database, ownerId, id, claimToken, null, message);
      return json({ detail: message }, 502, context.cookie);
    }
  }

  return json({ detail: "Unsupported automation action." }, 400, context.cookie);
}
