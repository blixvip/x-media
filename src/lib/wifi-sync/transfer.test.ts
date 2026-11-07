import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { request } from 'node:https';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, X509Certificate } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { WifiSyncServer } from './server';
import { normalizeItem } from './library';

describe('paired Wi-Fi transfers', () => {
  it('copies PC originals, accepts phone originals, rejects unpaired clients, and retains bytes after restart', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
    const app = createServer((req, res) => {
      if (req.url?.startsWith('/api/reddit/images/')) { res.setHeader('Content-Type', 'image/png'); res.end(png); return; }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(req.url?.startsWith('/api/reddit/memes') ? { memes: [{ id: 'fixture', imageUrl: 'https://i.redd.it/pc.png', permalink: 'https://www.reddit.com/r/memes/comments/abc/test', title: 'Saved on PC', created: 1 }], nextCursor: null } : req.url?.startsWith('/api/x-master') ? { items: [], total: 0 } : { folders: [] }));
    });
    await new Promise<void>(resolve => app.listen(0, '127.0.0.1', resolve));
    const directory = await mkdtemp(path.join(tmpdir(), 'x-media-transfer-'));
    const sync = new WifiSyncServer(directory, `http://127.0.0.1:${(app.address() as AddressInfo).port}`, 0);
    try {
      await sync.enable(); await sync.collect();
      const listener = Reflect.get(sync, 'server'); const port = (listener.address() as AddressInfo).port;
      const { token } = JSON.parse(await readFile(path.join(directory, 'config.json'), 'utf8'));
      const cert = await readFile(path.join(directory, 'certificate.pem'));
      const fingerprint = new X509Certificate(cert).fingerprint256;
      const call = (route: string, method = 'GET', data?: Buffer, headers: Record<string, string> = {}, pin = fingerprint) => new Promise<{ status: number; bytes: Buffer }>((resolve, reject) => {
        const req = request({ hostname: '127.0.0.1', port, path: route, method, ca: cert, checkServerIdentity: (_host, peer) => peer.fingerprint256 === pin ? undefined : new Error('Pin mismatch'), agent: false, headers: { Authorization: `Bearer ${token}`, ...headers } }, res => { const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode!, bytes: Buffer.concat(chunks) })); }); req.on('error', reject); req.end(data);
      });
      expect((await call('/manifest', 'GET', undefined, { Authorization: '' })).status).toBe(401);
      expect((await call('/manifest', 'GET', undefined, { Origin: 'https://evil.test' })).status).toBe(401);
      await expect(call('/manifest', 'GET', undefined, {}, 'wrong')).rejects.toThrow('Pin mismatch');
      const manifest = JSON.parse((await call('/manifest')).bytes.toString());
      expect(manifest.items).toHaveLength(1); expect(manifest.items[0].available).toBe(true);
      expect((await call(`/assets/${manifest.items[0].id}`)).bytes).toEqual(png);
      const phone = normalizeItem({ url: 'https://i.redd.it/phone.png', kind: 'image', postUrl: 'https://www.reddit.com/r/memes/comments/def/test', title: 'Saved on phone' });
      const batch = Buffer.from(JSON.stringify({ items: [phone, phone] }));
      expect((await call('/items', 'POST', batch)).status).toBe(200);
      expect((await call(`/assets/${phone.id}`, 'PUT', png, { 'X-Content-Sha256': '0'.repeat(64) })).status).toBe(400);
      expect((await sync.library.get(phone.id))!.available).toBe(false);
      expect((await call(`/assets/${phone.id}`, 'PUT', png, { 'X-Content-Sha256': createHash('sha256').update(png).digest('hex') })).status).toBe(200);
      expect((await call(`/assets/${phone.id}`)).bytes).toEqual(png);
      expect((await sync.library.list()).total).toBe(2);
      await sync.disable();
      const reopened = new WifiSyncServer(directory);
      expect(await readFile((await reopened.library.file(phone.id)).file)).toEqual(png);
    } finally { await sync.disable(); await new Promise<void>(resolve => app.close(() => resolve())); }
  }, 60000);
});
