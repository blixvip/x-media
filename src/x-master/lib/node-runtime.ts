import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { D1DatabaseLike } from './x-automation-store';
import { openLocalRadarDatabase } from './x-radar-local-db';
import type { XMasterRuntime } from './x-master-api';

const shared = globalThis as typeof globalThis & { xMediaMasterDatabase?: Promise<D1DatabaseLike> };

/** Keep the original X Master contracts, backed by the local application's SQLite. */
export async function nodeRuntime(): Promise<{ env: XMasterRuntime }> {
  shared.xMediaMasterDatabase ??= (async () => {
    const path = resolve(/* turbopackIgnore: true */ process.env.X_REFERENCE_LOCAL_DB_PATH || '.data/x-master/master.sqlite');
    await mkdir(dirname(path), { recursive: true });
    return openLocalRadarDatabase(path);
  })().catch(error => { shared.xMediaMasterDatabase = undefined; throw error; });
  return { env: { ...process.env, DB: await shared.xMediaMasterDatabase, X_MEDIA_LOCAL_WORKSPACE: process.env.X_MEDIA_LOCAL_WORKSPACE ?? '1' } as XMasterRuntime };
}
