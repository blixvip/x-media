const MAX_POSTS = 100;
const MAX_TEXT = 2_000;
const MAX_METRIC = 1_000_000_000_000;

export function parseCompactMetric(value) {
  const normalized = String(value || "").replace(/,/g, "").trim().toUpperCase();
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*([KMB])?/);
  if (!match) return 0;
  const multiplier = match[2] === "K" ? 1_000 : match[2] === "M" ? 1_000_000 : match[2] === "B" ? 1_000_000_000 : 1;
  return Math.min(MAX_METRIC, Math.round(Number(match[1]) * multiplier));
}

function safeMetric(value) {
  return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, MAX_METRIC) : 0;
}

export function sanitizeCapturedPost(value) {
  if (!value || typeof value !== "object") return null;
  const id = typeof value.id === "string" ? value.id : "";
  const username = typeof value.author?.username === "string" ? value.author.username : "";
  if (!/^\d{5,25}$/.test(id) || !/^[A-Za-z0-9_]{1,15}$/.test(username)) return null;
  let url;
  try { url = new URL(value.url); } catch { return null; }
  if (url.protocol !== "https:" || !/^(?:www\.)?(?:x\.com|twitter\.com)$/i.test(url.hostname)) return null;
  const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})\/?$/);
  if (!match || match[1].toLowerCase() !== username.toLowerCase() || match[2] !== id) return null;
  const text = typeof value.text === "string" ? value.text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT) : "";
  const published = new Date(value.published_at || "");
  if (!text || !Number.isFinite(published.getTime())) return null;
  const metrics = value.metrics || {};
  return {
    id,
    url: `https://x.com/${username}/status/${id}`,
    author: {
      username,
      display_name: typeof value.author?.display_name === "string" ? value.author.display_name.replace(/\s+/g, " ").trim().slice(0, 100) : username,
    },
    text,
    published_at: published.toISOString(),
    metrics: {
      likes: safeMetric(metrics.likes),
      replies: safeMetric(metrics.replies),
      reposts: safeMetric(metrics.reposts),
      views: safeMetric(metrics.views),
    },
  };
}

function visible(article) {
  const box = article.getBoundingClientRect();
  return box.bottom >= -200 && box.top <= window.innerHeight + 200;
}

function metric(article, testId) {
  const node = article.querySelector(`[data-testid="${testId}"]`);
  return parseCompactMetric(node?.getAttribute("aria-label") || node?.textContent || "");
}

function postFromArticle(article) {
  if (!visible(article)) return null;
  const time = article.querySelector("time");
  const link = time?.closest('a[href*="/status/"]');
  const href = link?.getAttribute("href") || "";
  const path = href.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})/);
  const textNode = article.querySelector('[data-testid="tweetText"]');
  if (!path || !time || !textNode) return null;
  const userBlock = article.querySelector('[data-testid="User-Name"]');
  const authorText = userBlock?.textContent || "";
  const handle = authorText.match(/@([A-Za-z0-9_]{1,15})/)?.[1] || path[1];
  const displayName = authorText.split("@")[0]?.trim() || handle;
  const analytics = article.querySelector('a[href$="/analytics"]');
  return sanitizeCapturedPost({
    id: path[2],
    url: `https://x.com/${path[1]}/status/${path[2]}`,
    author: { username: handle, display_name: displayName },
    text: textNode.textContent,
    published_at: time.getAttribute("datetime"),
    metrics: {
      replies: metric(article, "reply"),
      reposts: metric(article, "retweet"),
      likes: metric(article, "like"),
      views: parseCompactMetric(analytics?.getAttribute("aria-label") || analytics?.textContent || ""),
    },
  });
}

export function collectVisiblePosts(root = document) {
  const posts = [];
  const seen = new Set();
  for (const article of root.querySelectorAll('article[data-testid="tweet"]')) {
    const post = postFromArticle(article);
    if (!post || seen.has(post.id)) continue;
    seen.add(post.id);
    posts.push(post);
    if (posts.length >= MAX_POSTS) break;
  }
  return posts;
}
