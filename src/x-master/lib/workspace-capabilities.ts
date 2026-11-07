import { appAuthConfigured, type AppAuthEnvironment } from './x-app-auth.ts';

type Setup = AppAuthEnvironment & Record<string, unknown>;
export function workspaceCapabilities(env: Setup) {
  const database = env.DB as { prepare?: unknown; batch?: unknown } | undefined;
  const storage = typeof database?.prepare === 'function' && typeof database?.batch === 'function';
  const account = appAuthConfigured(env);
  return {
    account, storage, drafts: account && storage,
    media_archive: account && storage && Boolean(env.MEDIA && env.X_REFERENCE_WORKER_TOKEN),
    official_x: Boolean(env.X_API_BEARER_TOKEN || env.XV_X_BEARER_TOKEN),
    collection_enabled: env.X_RADAR_MONITOR_ENABLED === 'true',
    publishing: account && storage && env.X_PUBLISHING_ENABLED === 'true' && Boolean(env.X_CLIENT_ID && env.X_OAUTH_SESSION_SECRET && env.X_TOKEN_ENCRYPTION_KEY),
    phone_push: false,
  };
}
export type WorkspaceCapabilities = ReturnType<typeof workspaceCapabilities>;
