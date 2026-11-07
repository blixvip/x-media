import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, open, unlink, stat } from 'node:fs/promises';
import path from 'node:path';

export type SyncItem = { id: string; url: string; kind: 'image' | 'video'; title: string; postUrl: string; savedAt: string; available?: boolean; bytes?: number; mime?: string; sha256?: string; error?: string };
export const MAX_MEDIA = 500_000_000;
export const mediaHosts = new Set(['pbs.twimg.com', 'video.twimg.com', 'i.redd.it', 'preview.redd.it', 'i.imgur.com']);
export function normalizeItem(raw: unknown): SyncItem {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid saved item.');
  const value = raw as Record<string, unknown>;
  const url = new URL(String(value.url));
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !mediaHosts.has(url.hostname) || url.href.length > 2048) throw new Error('Unsupported original URL.');
  url.hash = '';
  const id = createHash('sha256').update(url.href).digest('hex');
  if (value.id !== undefined && value.id !== id) throw new Error('Invalid media identity.');
  const post = new URL(String(value.postUrl));
  if (post.protocol !== 'https:' || post.username || post.password || post.port || !['x.com', 'twitter.com', 'www.reddit.com', 'reddit.com'].includes(post.hostname)) throw new Error('Unsupported post URL.');
  if (!['image', 'video'].includes(String(value.kind))) throw new Error('Invalid media type.');
  const savedAt = typeof value.savedAt === 'string' && Number.isFinite(Date.parse(value.savedAt)) ? new Date(value.savedAt).toISOString() : new Date().toISOString();
  return { id, url: url.href, kind: value.kind as SyncItem['kind'], title: String(value.title || 'Saved media').slice(0, 32000), postUrl: post.href, savedAt };
}
export function mediaType(bytes: Buffer): string {
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.toString('ascii', 4, 8) === 'ftyp') return /avif|avis/.test(bytes.toString('ascii', 8, 32)) ? 'image/avif' : 'video/mp4';
  if (bytes.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex'))) return 'video/webm';
  throw new Error('The original is not a supported image or video.');
}
export class SyncLibrary {
  private items?: Record<string, SyncItem>;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(readonly directory: string) {}
  assetPath(id: string) { if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid media identity.'); return path.join(this.directory, 'media', id); }
  private async load() {
    if (!this.items) {
      try { this.items = JSON.parse(await readFile(path.join(this.directory, 'library.json'), 'utf8')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Sync library could not be read. Existing files were preserved.'); this.items = {}; }
    }
    return this.items!;
  }
  private change(fn: (items: Record<string, SyncItem>) => void) {
    const job = this.tail.then(async () => {
      const next = structuredClone(await this.load()); fn(next);
      await mkdir(this.directory, { recursive: true });
      const temporary = path.join(this.directory, `${randomUUID()}.json.tmp`);
      try { const file = await open(temporary, 'wx'); try { await file.writeFile(JSON.stringify(next)); await file.sync(); } finally { await file.close(); } await rename(temporary, path.join(this.directory, 'library.json')); }
      finally { await unlink(temporary).catch(() => {}); }
      this.items = next;
    });
    this.tail = job.catch(() => {}); return job;
  }
  async add(values: unknown[]) {
    if (values.length > 1000) throw new Error('Too many items in one batch.');
    const items = values.map(normalizeItem);
    await this.change(state => { for (const item of items) { if (!state[item.id]) state[item.id] = { ...item, available: false }; } if (Object.keys(state).length > 10000) throw new Error('Sync library has reached 10,000 items.'); });
  }
  async list(after = '', limit = 100) {
    await this.tail;
    const all = Object.values(await this.load()).sort((a, b) => a.id.localeCompare(b.id));
    const items = all.filter(item => item.id > after).slice(0, Math.max(1, Math.min(1000, limit)));
    return { items, total: all.length, ready: all.filter(item => item.available).length, next: items.length && all.at(-1)?.id !== items.at(-1)?.id ? items.at(-1)!.id : null };
  }
  async get(id: string) { await this.tail; return (await this.load())[id]; }
  async failed(id: string, error: string) { await this.change(items => { if (items[id]) items[id].error = error.slice(0, 150); }); }
  async store(id: string, chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>, expectedHash?: string) {
    const item = await this.get(id); if (!item) throw new Error('Save the item before uploading its original.');
    const target = this.assetPath(id); await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.part`; const file = await open(temporary, 'wx');
    let bytes = 0; let prefix = Buffer.alloc(0); const hash = createHash('sha256');
    try {
      for await (const chunk of chunks) { bytes += chunk.length; if (bytes > MAX_MEDIA) throw new Error('Original exceeds 500 MB.'); if (prefix.length < 32) prefix = Buffer.concat([prefix, Buffer.from(chunk).subarray(0, 32 - prefix.length)]); hash.update(chunk); await file.writeFile(chunk); }
      if (!bytes) throw new Error('Empty original.');
      const mime = mediaType(prefix), digest = hash.digest('hex');
      if (expectedHash && expectedHash !== digest) throw new Error('Original checksum mismatch.');
      if (!mime.startsWith(item.kind + '/')) throw new Error('Original does not match its saved media type.');
      await file.sync(); await file.close();
      await rename(temporary, target);
      await this.change(items => { Object.assign(items[id], { available: true, bytes, mime, sha256: digest, error: undefined }); });
      return { bytes, sha256: digest, mime };
    } finally { await file.close().catch(() => {}); await unlink(temporary).catch(() => {}); }
  }
  async file(id: string) {
    const item = await this.get(id); if (!item?.available) throw new Error('Original has not downloaded yet.');
    const file = this.assetPath(id); const info = await stat(file); if (info.size !== item.bytes) throw new Error('Original needs to be downloaded again.');
    return { item, file };
  }
}
