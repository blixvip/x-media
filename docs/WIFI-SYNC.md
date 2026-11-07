# Wi-Fi sync

Synced saves copies saved media between the PC app and the standalone Android app.
It needs no cloud account. Both devices keep their own original files after transfer.

## Connect once

1. Build and run the PC app normally. Open **Synced saves** in the header (`/sync`).
2. Select **Enable Wi-Fi sync**. On Windows, run `scripts/allow-wifi-sync.ps1` once
   from an administrator PowerShell window if the firewall blocks the phone.
3. Update the phone to X Media **1.5.0**, preserving app data (`adb install -r`).
4. On the phone, open **Tools → Synced saves**. Paste the complete pairing code
   displayed on the PC. Allow local network access if Android asks, then retry pairing.
5. With both devices on the same Wi-Fi, select **Sync now**. Wait for originals
   to show **Available offline** before closing the PC or leaving Wi-Fi.

PC checks for new saves every 30 seconds while enabled. The phone checks every
minute while the workspace is visible and when it becomes visible. Android can
stop work when the app closes. There is no background service or guaranteed sync
while the phone app is closed. Interrupted transfers retry; completed copies remain.

The PC app stays at `http://127.0.0.1:4330`; only the authenticated TLS sync listener
uses LAN port 4331. Git for Windows supplies OpenSSL for the per-installation
self-signed certificate. `X_MEDIA_OPENSSL` can specify another OpenSSL executable.
The pairing code pins the certificate and includes a random access token; share it
only with your own phone. The phone binds transfers to Wi-Fi rather than mobile data.

If the PC's LAN address changes, paste its newly displayed pairing code on the phone.
Guest Wi-Fi or access-point isolation can prevent device-to-device connections.
**Disable & unpair** on the PC revokes the token. **Disconnect PC** on the phone
removes its credentials. Neither action deletes downloaded originals.

## Included

- Image/video attachments saved to X Master.
- Saved Reddit favourites.
- X or Reddit media placed in folders.

The combined copies appear under **Synced saves** on both devices. The original
Saved, Reddit, and Folders views retain their own organisation. This is additive
media copying, not a complete workspace merge: drafts, notes, folder names,
unsaves, and deletions do not propagate. Source URLs are retained for provenance;
viewing a synced original uses the local file, not the source site.

A text-only X link with no captured attachments has no original to transfer.
Instagram Gallery downloads and bundled reaction clips are not included.

## Storage and limits

- PC metadata: `.data/wifi-sync/library.json`; originals: `.data/wifi-sync/media/`.
- PC credentials: `.data/wifi-sync/config.json`, `private.pem`, `certificate.pem`.
- Android metadata: private `wifi-sync-library.json`; originals reuse `workspace-media`.
- Android pairing credentials are in `noBackupFilesDir`, outside cloud/device backups.
- Limit: 10,000 originals, 500 MB per file; metadata exchange uses bounded batches.
- PC processes up to 20 pending originals per pass; failed originals retry after five minutes.
- PC viewer currently shows the first 1,000 records; device transfers include all records.
- Existing **Export phone backup** exports the workspace document, not synced originals.

Files are written to temporary paths, verified by signature and SHA-256, and renamed
only after completion. Pairing is required for every transfer endpoint. Unpaired
clients and browser-origin requests cannot read the library or upload files.

## Verification

PC: `pnpm exec vitest run src/lib/wifi-sync`, `pnpm test`, `pnpm lint`, `pnpm build`.
Phone: `node mobile-workspace/test-sync.cjs`, `node mobile-workspace/test.cjs`,
`gradlew.bat assembleDebug assembleDebugAndroidTest testDebugUnitTest lintDebug`.

The transport tests use a real HTTPS listener and isolated storage. Browser tests
mock the native boundary and verify narrow/wide pairing, retry, saved images,
restart, search, and disconnect. A real PC-to-phone test still requires the updated
APK installed on a connected, unlocked phone on the same Wi-Fi.
