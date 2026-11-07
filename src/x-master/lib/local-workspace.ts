import { appAuthConfigured, type AppAuthEnvironment } from './x-app-auth';
import { requestOrigin } from './request-origin';

type LocalEnvironment = AppAuthEnvironment & { X_MEDIA_LOCAL_WORKSPACE?: string };

/** The loopback app has one local library; cloud sessions and paired tokens stay separate. */
export function localWorkspaceUser(request: Request, env: LocalEnvironment) {
  if (env.X_MEDIA_LOCAL_WORKSPACE !== '1' || appAuthConfigured(env)) return null;
  const url = new URL(request.url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return null;
  if (request.headers.has('authorization')) return null;
  const expectedOrigin = requestOrigin(request);
  if (!expectedOrigin) return null;
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost && forwardedHost !== new URL(expectedOrigin).host) return null;
  const origin = request.headers.get('origin');
  if (origin && origin !== expectedOrigin) return null;
  if (request.headers.get('sec-fetch-site') === 'cross-site') return null;
  return { id: 'local', email: 'This computer' };
}
