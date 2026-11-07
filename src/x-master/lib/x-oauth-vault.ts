import type { D1DatabaseLike } from "./x-automation-store.ts";
import { decryptXCredentials, encryptXCredentials, type XEncryptedCredentials, type XStoredCredentials } from "./x-user-auth.ts";

const CREATE_VAULT = `CREATE TABLE IF NOT EXISTS x_oauth_credentials (
  owner_id TEXT PRIMARY KEY NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`;

export async function initializeXCredentialVault(database: D1DatabaseLike) {
  await database.prepare(CREATE_VAULT).run();
}

export async function storeXCredentials(database: D1DatabaseLike, ownerId: string, credentials: XStoredCredentials, encryptionKey: string) {
  if (!/^\d{1,19}$/.test(ownerId)) throw new Error("Invalid X credential owner.");
  const encrypted = await encryptXCredentials(credentials, encryptionKey);
  await database.prepare(`INSERT INTO x_oauth_credentials (owner_id, payload_json, updated_at) VALUES (?1, ?2, ?3)
    ON CONFLICT(owner_id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`)
    .bind(ownerId, JSON.stringify(encrypted), Math.floor(Date.now() / 1_000)).run();
}

export async function loadXCredentials(database: D1DatabaseLike, ownerId: string, encryptionKey: string) {
  const row = await database.prepare("SELECT payload_json FROM x_oauth_credentials WHERE owner_id = ?1").bind(ownerId).first<{ payload_json: string }>();
  if (!row) return null;
  let encrypted: XEncryptedCredentials;
  try { encrypted = JSON.parse(row.payload_json) as XEncryptedCredentials; }
  catch { return null; }
  try { return await decryptXCredentials(encrypted, encryptionKey); }
  catch { return null; }
}

export async function deleteXCredentials(database: D1DatabaseLike, ownerId: string) {
  await database.prepare("DELETE FROM x_oauth_credentials WHERE owner_id = ?1").bind(ownerId).run();
}
