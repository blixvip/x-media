import { describe, expect, it } from 'vitest';
import { localWorkspaceUser } from './local-workspace';
import { sameOriginRequest } from './x-user-auth';

const env = { X_MEDIA_LOCAL_WORKSPACE: '1' };
const local = (headers?: HeadersInit) => new Request('http://127.0.0.1:4330/api/x-master/auth', { headers });

describe('local workspace identity', () => {
  it('opens the single-user library only on the configured local app', () => {
    expect(localWorkspaceUser(local(), env)?.id).toBe('local');
    expect(localWorkspaceUser(local({ origin: 'http://127.0.0.1:4330' }), env)?.id).toBe('local');
    expect(localWorkspaceUser(local({ host: '127.0.0.1:4330', 'x-forwarded-host': '127.0.0.1:4330' }), env)?.id).toBe('local');
    expect(localWorkspaceUser(local(), {})).toBeNull();
    expect(localWorkspaceUser(local(), { X_MEDIA_LOCAL_WORKSPACE: '0' })).toBeNull();
  });
  it('rejects remote hosts, cross-origin callers, and unpaired extensions', () => {
    const cases: HeadersInit[] = [
      { origin: 'https://evil.example' },
      { origin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      { host: 'evil.example' },
      { 'sec-fetch-site': 'cross-site' },
      { authorization: 'Bearer invalid' },
      { 'x-forwarded-host': 'evil.example' },
    ];
    for (const headers of cases) expect(localWorkspaceUser(local(headers), env)).toBeNull();
    expect(localWorkspaceUser(new Request('https://public.example/api/x-master/auth'), env)).toBeNull();
  });
  it('accepts Next localhost normalization without accepting a different browser origin', () => {
    const headers = { host: '127.0.0.1:4330', 'x-forwarded-host': '127.0.0.1:4330', origin: 'http://127.0.0.1:4330' };
    const request = new Request('http://localhost:4330/api/x-master/references', { headers });
    expect(localWorkspaceUser(request, env)?.id).toBe('local');
    expect(sameOriginRequest(request)).toBe(true);
    const foreign = new Request(request, { headers: { ...headers, origin: 'http://localhost:4330' } });
    expect(localWorkspaceUser(foreign, env)).toBeNull();
    expect(sameOriginRequest(foreign)).toBe(false);
    expect(sameOriginRequest(local())).toBe(false);
  });
  it('never replaces a configured cloud account', () => {
    expect(localWorkspaceUser(local(), { ...env, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'configured', X_MASTER_AUTH_SECRET: 'x'.repeat(32), X_MASTER_ALLOWED_EMAILS: 'user@example.com' })).toBeNull();
  });
});
