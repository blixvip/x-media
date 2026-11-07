const MAX_PUBLIC_URL_LENGTH = 2_048;

export function safePublicEvidenceUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > MAX_PUBLIC_URL_LENGTH) return null;
  try {
    const parsed = new URL(text);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      || parsed.username
      || parsed.password
    ) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function canonicalPublicEvidenceUrl(value: unknown) {
  const safeUrl = safePublicEvidenceUrl(value);
  if (!safeUrl) return null;
  const parsed = new URL(safeUrl);
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLocaleLowerCase("en-US");
  for (const key of Array.from(parsed.searchParams.keys())) {
    const normalizedKey = key.toLocaleLowerCase("en-US");
    if (
      normalizedKey.startsWith("utm_")
      || ["fbclid", "gclid", "mc_cid", "mc_eid"].includes(normalizedKey)
    ) parsed.searchParams.delete(key);
  }
  parsed.searchParams.sort();
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString();
}

export function stablePublicEvidenceHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}
