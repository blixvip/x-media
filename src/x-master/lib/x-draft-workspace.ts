export type ManualTweetDraft = {
  id: string;
  text: string;
  meme_id?: string;
  created_at: string;
  updated_at: string;
};

const MAX_DRAFTS = 50;
const MAX_TWEET_LENGTH = 280;

function validTime(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\r\n/g, "\n").trim();
  return text.length >= 1 && text.length <= MAX_TWEET_LENGTH ? text : null;
}

function normalizeMemeId(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-z0-9-]{1,80}$/.test(value) ? value : undefined;
}

export function createManualTweetDraft(text: unknown, id: unknown, now = new Date(), memeId?: unknown): ManualTweetDraft {
  const normalizedText = normalizeText(text);
  const normalizedId = typeof id === "string" && /^[A-Za-z0-9:_-]{1,100}$/.test(id) ? id : null;
  if (!normalizedText || !normalizedId || !Number.isFinite(now.getTime())) throw new Error("Invalid tweet draft");
  const timestamp = now.toISOString();
  const normalizedMemeId = normalizeMemeId(memeId);
  if (memeId !== undefined && !normalizedMemeId) throw new Error("Invalid tweet draft");
  return { id: normalizedId, text: normalizedText, ...(normalizedMemeId ? { meme_id: normalizedMemeId } : {}), created_at: timestamp, updated_at: timestamp };
}

export function parseManualTweetDrafts(value: unknown): ManualTweetDraft[] {
  if (!Array.isArray(value)) return [];
  const drafts: ManualTweetDraft[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const draft = candidate as Partial<ManualTweetDraft>;
    const text = normalizeText(draft.text);
    if (typeof draft.id !== "string" || !/^[A-Za-z0-9:_-]{1,100}$/.test(draft.id) || seen.has(draft.id) || !text || !validTime(draft.created_at) || !validTime(draft.updated_at)) continue;
    seen.add(draft.id);
    const memeId = normalizeMemeId(draft.meme_id);
    drafts.push({ id: draft.id, text, ...(memeId ? { meme_id: memeId } : {}), created_at: new Date(draft.created_at).toISOString(), updated_at: new Date(draft.updated_at).toISOString() });
    if (drafts.length >= MAX_DRAFTS) break;
  }
  return drafts;
}

export function updateManualTweetDraft(draft: ManualTweetDraft, text: unknown, now = new Date()): ManualTweetDraft {
  const normalizedText = normalizeText(text);
  if (!normalizedText || !Number.isFinite(now.getTime())) throw new Error("Invalid tweet draft");
  return { ...draft, text: normalizedText, updated_at: now.toISOString() };
}
