import { describe, expect, it } from 'vitest';
import { controlAllowed, privateAddress, tokenAllowed } from './server';
describe('Wi-Fi sync boundaries', () => {
  it('requires a loopback browser origin for pairing controls', () => {
    expect(controlAllowed(new Request('http://localhost:4330/api/wifi-sync', { headers: { host: '127.0.0.1:4330', origin: 'http://127.0.0.1:4330' } }))).toBe(true);
    expect(controlAllowed(new Request('http://localhost:4330/api/wifi-sync', { headers: { host: '127.0.0.1:4330', 'x-forwarded-host': '127.0.0.1:4330', origin: 'http://127.0.0.1:4330' } }))).toBe(true);
    const invalid: Record<string, string>[] = [{ host: 'evil.test' }, { origin: 'https://evil.test' }, { 'sec-fetch-site': 'cross-site' }, { 'x-forwarded-host': 'evil.test' }];
    for (const headers of invalid) expect(controlAllowed(new Request('http://localhost:4330/api/wifi-sync', { headers }))).toBe(false);
  });
  it('requires a full pairing token and a private peer', () => {
    expect(tokenAllowed('Bearer abc', 'abc')).toBe(true);
    expect(tokenAllowed('Bearer ab', 'abc')).toBe(false);
    expect(tokenAllowed(undefined, 'abc')).toBe(false);
    expect(privateAddress('::ffff:192.168.1.5')).toBe(true);
    expect(privateAddress('172.32.1.1')).toBe(false);
    expect(privateAddress('8.8.8.8')).toBe(false);
  });
});
