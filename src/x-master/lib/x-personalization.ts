import type { XSignalInput } from "./x-radar";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function boundedMetric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.min(value, 1_000_000_000_000) : undefined;
}

function safeImageUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["pbs.twimg.com", "video.twimg.com"].includes(url.hostname) ? url.toString() : undefined;
  } catch { return undefined; }
}

export function normalizeXHomeTimeline(payload: unknown, now = new Date()): XSignalInput[] {
  const root = record(payload);
  const data = Array.isArray(root?.data) ? root.data : [];
  const includes = record(root?.includes);
  const rawUsers = Array.isArray(includes?.users) ? includes.users : [];
  const users = new Map<string, { username: string; display_name: string; avatar_url?: string }>();
  for (const value of rawUsers.slice(0, 200)) {
    const user = record(value);
    const id = typeof user?.id === "string" && /^\d{1,19}$/.test(user.id) ? user.id : "";
    const username = typeof user?.username === "string" && /^[A-Za-z0-9_]{1,15}$/.test(user.username) ? user.username : "";
    if (!id || !username) continue;
    const displayName = typeof user?.name === "string" ? user.name.replace(/\s+/g, " ").trim().slice(0, 100) : username;
    const avatar = safeImageUrl(user?.profile_image_url);
    users.set(id, { username: `@${username}`, display_name: displayName || username, ...(avatar ? { avatar_url: avatar } : {}) });
  }

  const rawMedia = Array.isArray(includes?.media) ? includes.media : [];
  const media = new Map<string, NonNullable<XSignalInput["media"]>[number]>();
  for (const value of rawMedia.slice(0, 400)) {
    const item = record(value);
    const key = typeof item?.media_key === "string" ? item.media_key.slice(0, 100) : "";
    const type = ["photo", "video", "animated_gif"].includes(String(item?.type)) ? item?.type as "photo" | "video" | "animated_gif" : null;
    const preview = safeImageUrl(item?.url) ?? safeImageUrl(item?.preview_image_url);
    if (!key || !type || !preview) continue;
    media.set(key, { type, preview_url: preview, ...(typeof item?.alt_text === "string" ? { alt_text: item.alt_text.slice(0, 1_000) } : {}), ...(boundedMetric(item?.width) ? { width: boundedMetric(item?.width) } : {}), ...(boundedMetric(item?.height) ? { height: boundedMetric(item?.height) } : {}) });
  }

  return data.slice(0, 100).flatMap((value) => {
    const post = record(value);
    const id = typeof post?.id === "string" && /^\d{5,25}$/.test(post.id) ? post.id : "";
    const authorId = typeof post?.author_id === "string" ? post.author_id : "";
    const creator = users.get(authorId);
    const text = typeof post?.text === "string" ? post.text.normalize("NFKC").trim().slice(0, 10_000) : "";
    const publishedMs = typeof post?.created_at === "string" ? Date.parse(post.created_at) : Number.NaN;
    const ageSeconds = Math.floor((now.getTime() - publishedMs) / 1_000);
    if (!id || !creator || !text || !Number.isFinite(publishedMs) || ageSeconds < -300 || ageSeconds > 7 * 24 * 60 * 60) return [];
    const metrics = record(post?.public_metrics);
    const attachments = record(post?.attachments);
    const mediaKeys = Array.isArray(attachments?.media_keys) ? attachments.media_keys : [];
    const attachedMedia = mediaKeys.flatMap((key) => typeof key === "string" && media.has(key) ? [media.get(key)!] : []).slice(0, 4);
    const title = text.split(/\r?\n/).map((part) => part.trim()).find(Boolean)?.slice(0, 280) ?? text.slice(0, 280);
    return [{
      id: `x-${id}`,
      title,
      body: text,
      topic: "Your X home timeline",
      niche: "Personalized from X",
      source: "x",
      source_url: `https://x.com/${creator.username.slice(1)}/status/${id}`,
      age_seconds: Math.max(0, ageSeconds),
      published_at: new Date(publishedMs).toISOString(),
      creator,
      ...(attachedMedia.length ? { media: attachedMedia } : {}),
      observed_metrics: {
        likes: boundedMetric(metrics?.like_count),
        replies: boundedMetric(metrics?.reply_count),
        reposts: boundedMetric(metrics?.retweet_count),
        quotes: boundedMetric(metrics?.quote_count),
        bookmarks: boundedMetric(metrics?.bookmark_count),
        views: boundedMetric(metrics?.impression_count),
      },
      personalized: true,
      personalization_reason: "from_your_home_timeline" as const,
    } satisfies XSignalInput];
  });
}

