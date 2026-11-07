import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SyncLibrary, normalizeItem, mediaType } from './library';

const input = { url: 'https://i.redd.it/fixture.png', kind: 'image', title: 'Saved meme', postUrl: 'https://www.reddit.com/r/memes/comments/abc/test', savedAt: '2026-09-11T00:00:00.000Z' };
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
describe('Wi-Fi saved media library', () => {
  it('merges retries without duplicates and survives reopening', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'x-media-sync-'));
    const first = new SyncLibrary(dir);
    const item = normalizeItem(input);
    await first.add([item, item]);
    expect((await first.list()).items).toHaveLength(1);
    const second = new SyncLibrary(dir);
    expect((await second.list()).items[0].title).toBe('Saved meme');
  });
  it('commits original bytes atomically and advertises only complete files', async () => {
    const library = new SyncLibrary(await mkdtemp(path.join(tmpdir(), 'x-media-sync-')));
    const item = normalizeItem(input);
    await library.add([item]);
    expect((await library.list()).items[0].available).toBe(false);
    await library.store(item.id, [png]);
    const stored = (await library.list()).items[0];
    expect(stored.available).toBe(true);
    expect(stored.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await readFile(library.assetPath(item.id))).toEqual(png);
  });
  it('rejects unsupported URLs, forged identities, unknown uploads and HTML files', async () => {
    for (const url of ['http://i.redd.it/a.png', 'https://127.0.0.1/a.png', 'https://i.redd.it.evil.test/a.png', 'https://user@i.redd.it/a.png']) expect(() => normalizeItem({...input, url})).toThrow();
    expect(() => normalizeItem({...input, id: 'a'.repeat(64)})).toThrow();
    const library = new SyncLibrary(await mkdtemp(path.join(tmpdir(), 'x-media-sync-')));
    const item = normalizeItem(input);
    await expect(library.store(item.id, [png])).rejects.toThrow();
    await library.add([item]);
    await expect(library.store(item.id, [Buffer.from('<html>login</html>')])).rejects.toThrow();
    expect((await library.list()).items[0].available).toBe(false);
    expect(mediaType(png)).toBe('image/png');
  });
  it('keeps prior media when a retry is interrupted', async () => {
    const library = new SyncLibrary(await mkdtemp(path.join(tmpdir(), 'x-media-sync-')));
    const item = normalizeItem(input);
    await library.add([item]);
    await library.store(item.id, [png]);
    async function* interrupted() { yield png; throw new Error('Disconnected'); }
    await expect(library.store(item.id, interrupted())).rejects.toThrow('Disconnected');
    expect(await readFile(library.assetPath(item.id))).toEqual(png);
  });
});
