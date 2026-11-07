import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { controlAllowed, wifiSync } from '@/lib/wifi-sync/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!controlAllowed(request)) return Response.json({ error: 'Open sync on this PC.' }, { status: 403 });
  const url = new URL(request.url), sync = wifiSync();
  if (url.searchParams.get('action') === 'asset') {
    try {
      const { file, item } = await sync.library.file(url.searchParams.get('id') || '');
      const length = item.bytes!; let start = 0, end = length - 1; const range = request.headers.get('range');
      if (range) { const match = /^bytes=(\d+)-(\d*)$/.exec(range); if (!match) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${length}` } }); start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end); if (start > end || start >= length) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${length}` } }); }
      return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, { status: range ? 206 : 200, headers: { 'Content-Type': item.mime!, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${length}` } : {}) } });
    } catch { return Response.json({ error: 'Original is not downloaded yet.' }, { status: 404 }); }
  }
  return Response.json(await sync.status(), { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
  if (!controlAllowed(request)) return Response.json({ error: 'Open sync on this PC.' }, { status: 403 });
  const action = new URL(request.url).searchParams.get('action'), sync = wifiSync();
  try {
    if (action === 'enable') await sync.enable();
    else if (action === 'disable') await sync.disable();
    else if (action === 'sync') void sync.collect(true);
    else return Response.json({ error: 'Unknown sync action.' }, { status: 400 });
    return Response.json(await sync.status(), { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Wi-Fi sync could not start. Check that Git for Windows is installed and port 4331 is available.' }, { status: 503 }); }
}
