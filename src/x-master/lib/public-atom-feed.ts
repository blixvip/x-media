export const PUBLIC_RADAR_ORIGIN = "https://ai-virality-radar.wasely.chatgpt.site";
export const PUBLIC_ATOM_PATH = "/api/public-feed";

const MAX_FEED_ITEMS = 28;
const MAX_TEXT_LENGTH = 500;
const MAX_URL_LENGTH = 2_048;
const MAX_AGE_SECONDS = 366 * 24 * 60 * 60;

export type PublicAtomSignal = {
  id: string;
  title: string;
  topic: string;
  niche: string;
  source: string;
  source_url: string;
  age_seconds: number;
  creator?: { username?: string };
};

export type PublicAtomPayload = {
  generated_at: string;
  items: PublicAtomSignal[];
};

function boundedXmlText(value: unknown, maximum = MAX_TEXT_LENGTH) {
  const text = typeof value === "string" ? value.trim().slice(0, maximum) : "";
  const xmlSafeText = Array.from(text).filter((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d ||
      (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
      (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
      (codePoint >= 0x10000 && codePoint <= 0x10ffff);
  }).join("");
  return xmlSafeText
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function safeHttpsUrl(value: unknown) {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function safeFeedOrigin(value: unknown) {
  const safeUrl = safeHttpsUrl(value);
  if (!safeUrl) return null;
  const parsed = new URL(safeUrl);
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
  return parsed.origin;
}

function safeGeneratedTime(value: unknown) {
  const milliseconds = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(milliseconds) ? milliseconds : Date.now();
}

function sourceName(source: string) {
  return source
    .replace(/^feed_/, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .slice(0, 120);
}

export function renderPublicAtomFeed(payload: PublicAtomPayload, origin = PUBLIC_RADAR_ORIGIN) {
  const safeOrigin = safeFeedOrigin(origin) ?? PUBLIC_RADAR_ORIGIN;
  const selfUrl = `${safeOrigin}${PUBLIC_ATOM_PATH}`;
  const generatedMilliseconds = safeGeneratedTime(payload.generated_at);
  const generatedAt = new Date(generatedMilliseconds).toISOString();
  const seen = new Set<string>();
  const entries = payload.items.flatMap((item) => {
    const sourceUrl = safeHttpsUrl(item.source_url);
    const id = boundedXmlText(item.id, 512);
    const source = boundedXmlText(item.source, 160);
    const title = boundedXmlText(item.title);
    const ageSeconds = Number(item.age_seconds);
    if (
      !sourceUrl || !id || !source || !title || seen.has(sourceUrl) ||
      !Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > MAX_AGE_SECONDS
    ) return [];
    seen.add(sourceUrl);

    const publishedAt = new Date(generatedMilliseconds - Math.floor(ageSeconds) * 1_000).toISOString();
    const creator = boundedXmlText(item.creator?.username, 160) || boundedXmlText(sourceName(item.source), 160);
    const topic = boundedXmlText(item.topic, 160);
    const niche = boundedXmlText(item.niche, 160);
    const summary = boundedXmlText(
      `Publication evidence from ${sourceName(item.source)}. Unscored and not independently confirmed by X Master.`,
    );
    const entryId = boundedXmlText(sourceUrl, MAX_URL_LENGTH);

    return [`  <entry>
    <id>${entryId}</id>
    <title>${title}</title>
    <link rel="alternate" type="text/html" href="${boundedXmlText(sourceUrl, MAX_URL_LENGTH)}"/>
    <published>${publishedAt}</published>
    <updated>${publishedAt}</updated>
    <author><name>${creator}</name></author>
    ${topic ? `<category term="${topic}" label="${topic}"/>` : ""}
    ${niche && niche !== topic ? `<category term="${niche}" label="${niche}"/>` : ""}
    <summary type="text">${summary}</summary>
  </entry>`];
  }).slice(0, MAX_FEED_ITEMS);

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${selfUrl}</id>
  <title>X Master — Public Evidence</title>
  <subtitle>Current AI publication evidence with exact source links. Unscored, unclustered, and never auto-posted.</subtitle>
  <link rel="self" type="application/atom+xml" href="${selfUrl}"/>
  <link rel="alternate" type="text/html" href="${safeOrigin}/"/>
  <updated>${generatedAt}</updated>
  <generator uri="${safeOrigin}/">X Master</generator>
${entries.join("\n")}
</feed>
`;
}
