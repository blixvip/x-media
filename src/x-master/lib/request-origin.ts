const loopback = (host: string) => ['127.0.0.1', 'localhost', '[::1]'].includes(host);

/** Next may normalize the internal URL to localhost while the browser uses 127.0.0.1. */
export function requestOrigin(request: Request): string | null {
  const url = new URL(request.url);
  const host = request.headers.get('host');
  if (!loopback(url.hostname) || !host) return url.origin;
  try {
    const external = new URL(`${url.protocol}//${host}`);
    if (!loopback(external.hostname) || external.port !== url.port || external.host !== host.toLowerCase()) return null;
    const forwarded = request.headers.get('x-forwarded-host');
    if (forwarded && forwarded.toLowerCase() !== host.toLowerCase()) return null;
    return external.origin;
  } catch { return null; }
}
