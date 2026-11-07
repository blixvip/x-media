import type { ContentFormat } from "./x-content-engine.ts";

export function buildXMasterIntent(text: string, format: ContentFormat, sourceUrl?: string) {
  const url = new URL("https://x.com/intent/post");
  const clean = text.trim().slice(0, 280);
  const postId = sourceUrl?.match(/\/status\/(\d{1,25})/)?.[1];
  if (format === "x_reply" && postId) url.searchParams.set("in_reply_to", postId);
  const body = format === "x_quote" && sourceUrl ? `${clean}\n\n${sourceUrl}`.slice(0, 280) : clean;
  url.searchParams.set("text", body);
  return url.toString();
}

export function summarizeXMasterPerformance(queue: Array<{ state: string; decision: { action: string } }>) {
  const count = (predicate: (item: (typeof queue)[number]) => boolean) => queue.filter(predicate).length;
  return {
    total: queue.length,
    ready: count((item) => ["review", "approved", "scheduled"].includes(item.state)),
    published: count((item) => item.state === "published"),
    failed: count((item) => item.state === "failed"),
    replies: count((item) => item.decision.action === "reply"),
    quotes: count((item) => item.decision.action === "quote"),
    originals: count((item) => item.decision.action === "original"),
    reposts: count((item) => item.decision.action === "repost"),
  };
}
