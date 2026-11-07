import { createServer, type Server } from 'node:https';
import { randomBytes, timingSafeEqual, X509Certificate } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, access } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { SyncLibrary, normalizeItem, type SyncItem, MAX_MEDIA } from './library';

type Config = { enabled: boolean; token: string };
export function privateAddress(ip: string) { return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip.replace('::ffff:', '')) || ip === '::1'; }
export function controlAllowed(request: Request) {
  const url = new URL(request.url); const host = request.headers.get('host') || url.host;
  let actual: URL; try { actual = new URL(`${url.protocol}//${host}`); } catch { return false; }
  const forwarded = request.headers.get('x-forwarded-host');
  return ['localhost', '127.0.0.1', '[::1]'].includes(actual.hostname) && (!forwarded || forwarded === actual.host) && request.headers.get('sec-fetch-site') !== 'cross-site' && (!request.headers.get('origin') || request.headers.get('origin') === actual.origin);
}
export function tokenAllowed(value: string | undefined, token: string) { const expected = `Bearer ${token}`; return Boolean(value && value.length === expected.length && timingSafeEqual(Buffer.from(value), Buffer.from(expected))); }
async function body(request: IncomingMessage, maximum = 8_000_000) { const chunks: Buffer[] = []; let size = 0; for await (const chunk of request) { size += chunk.length; if (size > maximum) throw new Error('Request too large.'); chunks.push(chunk); } return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
function json(response: ServerResponse, value: unknown, status = 200) { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(value)); }
export class WifiSyncServer {
  readonly library: SyncLibrary;
  private config?: Config;
  private server?: Server;
  private timer?: NodeJS.Timeout;
  private starting?: Promise<void>;
  private scanning?: Promise<void>;
  private scanError = '';
  private lastScan: string | null = null;
  private lastSync: string | null = null;
  private fingerprint = '';
  private sources = new Map<string, string>();
  private attempts = new Map<string, number>();
  constructor(readonly directory = process.env.X_MEDIA_SYNC_DIR || path.join(process.cwd(), '.data', 'wifi-sync'), readonly appOrigin = process.env.X_MEDIA_URL || 'http://127.0.0.1:4330', readonly port = 4331) { this.library = new SyncLibrary(directory); }
  private async loadConfig() {
    if (!this.config) { try { this.config = JSON.parse(await readFile(path.join(this.directory, 'config.json'), 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Pairing configuration could not be read.'); this.config = { enabled: false, token: randomBytes(32).toString('hex') }; } }
    return this.config!;
  }
  private async saveConfig() { await mkdir(this.directory, { recursive: true }); const file = path.join(this.directory, 'config.json'); await writeFile(`${file}.tmp`, JSON.stringify(this.config), { mode: 0o600 }); await rename(`${file}.tmp`, file); }
  async startIfEnabled() { if ((await this.loadConfig()).enabled) await this.start(); }
  async enable() { const c = await this.loadConfig(); await this.start(); c.enabled = true; await this.saveConfig(); }
  async disable() { const c = await this.loadConfig(); c.enabled = false; c.token = randomBytes(32).toString('hex'); await this.saveConfig(); if (this.timer) clearInterval(this.timer); this.timer = undefined; const server = this.server; this.server = undefined; if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } }
  async start() {
    if (this.server) return;
    if (this.starting) return this.starting;
    this.starting = this.startServer().finally(() => { this.starting = undefined; }); return this.starting;
  }
  private async startServer() {
    await this.loadConfig(); await mkdir(this.directory, { recursive: true });
    const keyPath = path.join(this.directory, 'private.pem'), certPath = path.join(this.directory, 'certificate.pem');
    try { await access(certPath); await access(keyPath); } catch {
      const openssl = process.env.X_MEDIA_OPENSSL || (process.platform === 'win32' ? 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe' : 'openssl');
      await promisify(execFile)(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '3650', '-subj', '/CN=X Media Wi-Fi Sync'], { windowsHide: true, timeout: 30000 });
    }
    const cert = await readFile(certPath), key = await readFile(keyPath);
    this.fingerprint = new X509Certificate(cert).fingerprint256.replaceAll(':', '').toLowerCase();
    const server = createServer({ key, cert, minVersion: 'TLSv1.2', requestTimeout: 120000, headersTimeout: 10000 }, (request, response) => {
      void this.handle(request, response).catch(() => { if (!response.headersSent) json(response, { error: 'Transfer failed. Retry; completed copies are preserved.' }, 400); else response.destroy(); });
    });
    server.maxConnections = 8;
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(this.port, '0.0.0.0', () => { server.off('error', reject); resolve(); }); });
    server.on('error', () => { this.scanError = 'Wi-Fi listener stopped. Disable and enable sync to retry.'; });
    this.server = server;
    this.timer = setInterval(() => { void this.collect(); }, 30000); this.timer.unref();
    void this.collect();
  }
  private async handle(request: IncomingMessage, response: ServerResponse) {
    if (!privateAddress(request.socket.remoteAddress || '') || request.headers.origin || !tokenAllowed(request.headers.authorization, (await this.loadConfig()).token)) { json(response, { error: 'Pair this phone from the PC first.' }, 401); return; }
    if (Number(request.headers['content-length']) > MAX_MEDIA) { json(response, { error: 'Original exceeds 500 MB.' }, 413); return; }
    const url = new URL(request.url || '/', 'https://sync.local');
    if (request.method === 'GET' && url.pathname === '/manifest') { this.lastSync = new Date().toISOString(); json(response, await this.library.list(url.searchParams.get('after') || '')); return; }
    if (request.method === 'POST' && url.pathname === '/items') { const payload = await body(request); if (!Array.isArray(payload.items)) throw new Error('Items required.'); await this.library.add(payload.items); this.lastSync = new Date().toISOString(); json(response, { ok: true }); return; }
    const match = url.pathname.match(/^\/assets\/([a-f0-9]{64})$/);
    if (match && request.method === 'PUT') { const result = await this.library.store(match[1], request, String(request.headers['x-content-sha256'] || '')); this.lastSync = new Date().toISOString(); json(response, result); return; }
    if (match && request.method === 'GET') {
      try { const { file, item } = await this.library.file(match[1]); response.writeHead(200, { 'Content-Type': item.mime!, 'Content-Length': item.bytes!, 'X-Content-Sha256': item.sha256!, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); const stream = createReadStream(file); stream.on('error', () => response.destroy()); response.on('close', () => stream.destroy()); stream.pipe(response); } catch { json(response, { error: 'Original is not ready.' }, 404); } return;
    }
    json(response, { error: 'Not found' }, 404);
  }
  async status() {
    const c = await this.loadConfig(); const listing = await this.library.list('', 1000);
    const addresses = Object.values(networkInterfaces()).flatMap(entries => entries || []).filter(a => a.family === 'IPv4' && !a.internal && privateAddress(a.address)).map(a => a.address);
    return { enabled: c.enabled, running: Boolean(this.server), pairingCodes: this.server ? addresses.map(address => `${address}:${this.port}/${this.fingerprint}/${c.token}`) : [], lastScan: this.lastScan, lastSync: this.lastSync, error: this.scanError, ...listing };
  }
  private async api(route: string) { const r = await fetch(`${this.appOrigin}${route}`, { signal: AbortSignal.timeout(20000), cache: 'no-store' }); if (!r.ok) throw new Error('Keep the PC app running to collect saved media.'); return r.json(); }
  collect(retry = false) { if (retry) this.attempts.clear(); if (this.scanning) return this.scanning; this.scanning = this.scan().catch(() => { this.scanError = 'Some saved media could not be collected. Keep X Media running; sync retries automatically.'; }).finally(() => { this.scanning = undefined; }); return this.scanning; }
  private async scan() {
    this.scanError = '';
    const candidates: SyncItem[] = [];
    const add = (raw: unknown, localSource?: string) => { try { const item = normalizeItem(raw); candidates.push(item); if (localSource) this.sources.set(item.id, `${this.appOrigin}${localSource}`); } catch { /* Unsupported media remains in its original library. */ } };
    const results = await Promise.allSettled([
      (async () => {
        let offset = 0;
        while (offset < 10000) { const page = await this.api(`/api/x-master/references?limit=60&offset=${offset}`); for (const ref of page.items || []) for (const a of ref.attachments || []) if (a.source_url) add({ url: a.source_url, kind: a.kind, title: ref.source_text, postUrl: ref.source_url, savedAt: ref.created_at }); offset += (page.items || []).length; if (!page.items?.length || offset >= page.total) break; }
      })(),
      (async () => {
        let cursor = '0'; let count = 0;
        do { const page = await this.api(`/api/reddit/memes?view=saved&limit=60&cursor=${encodeURIComponent(cursor)}`); for (const meme of page.memes || []) add({ url: meme.imageUrl, kind: 'image', title: meme.title, postUrl: meme.permalink, savedAt: new Date((meme.created || Date.now()/1000)*1000).toISOString() }, `/api/reddit/images/${encodeURIComponent(meme.id)}`); cursor = page.nextCursor; count += (page.memes || []).length; } while (cursor && count < 10000);
      })(),
      (async () => {
        const folders = await this.api('/api/folders');
        for (const folder of folders.folders || []) { const detail = await this.api(`/api/folders/${encodeURIComponent(folder.id)}`); for (const item of detail.items || []) {
          if (item.reference.source === 'x') { const m = item.archive?.media; const video = m?.type !== 'photo'; const source = video ? [...(m?.variants || [])].sort((a, b) => (b.bitRate || 0) - (a.bitRate || 0))[0]?.url || m?.url : m?.url; if (source) add({ url: source, kind: video ? 'video' : 'image', title: item.title, postUrl: item.postUrl, savedAt: item.addedAt }); }
          else { const result = await this.api(`/api/reddit/memes/${encodeURIComponent(item.reference.id)}`); const meme = result.meme || result; add({ url: meme.imageUrl, kind: 'image', title: item.title, postUrl: item.postUrl, savedAt: item.addedAt }, `/api/folders/assets/${encodeURIComponent(item.key)}`); }
        } }
      })(),
    ]);
    if (results.some(r => r.status === 'rejected')) this.scanError = 'Some sources are unavailable. Completed copies remain usable; retry shortly.';
    for (let i = 0; i < candidates.length; i += 500) await this.library.add(candidates.slice(i, i + 500));
    let after = ''; let attempted = 0;
    do { const page = await this.library.list(after); for (const item of page.items) {
      if (item.available || (this.attempts.get(item.id) || 0) > Date.now() - 300000 || attempted >= 20) continue;
      this.attempts.set(item.id, Date.now()); attempted++;
      try { let response = await fetch(this.sources.get(item.id) || item.url, { redirect: 'error', signal: AbortSignal.timeout(120000), headers: { 'User-Agent': 'Mozilla/5.0' } }); if (!response.ok && this.sources.has(item.id)) response = await fetch(item.url, { redirect: 'error', signal: AbortSignal.timeout(120000) }); if (!response.ok || !response.body) throw new Error('Original unavailable.'); await this.library.store(item.id, response.body as unknown as AsyncIterable<Uint8Array>); }
      catch { await this.library.failed(item.id, 'Original unavailable. Sync will retry, or copy it from your phone.'); }
    } after = page.next || ''; } while (after);
    this.lastScan = new Date().toISOString();
  }
}
const shared = globalThis as typeof globalThis & { xMediaWifiSync?: WifiSyncServer };
export function wifiSync() { return shared.xMediaWifiSync ??= new WifiSyncServer(); }
