# X Media + X Master

This workspace keeps X Media's original UI and all features from `blixvip/x-media`
commit `46a5765`: public media collection, resumable jobs, streaming and link repair,
Tweets categories and archive import/export, Reddit collection/review/TV, shared
folders, and the optional dashboard.

Media, Tweets, Reddit, Folders, Feed, Trending, Saved, and Drafts share one
header and X Media's theme. Feed retains X Master's settings and extra tools.
The existing `/x-master`, `/x-radar`, and `/api/x-master/*` addresses remain.
Media viewers and Tweets include **Save to X Master**; confirmed saves appear
in Saved alongside extension captures. Folder membership remains independent.

## Run

Use Node 26 or newer and `pnpm install --frozen-lockfile`, then `pnpm build`.
On Windows run `scripts/run-x-media.ps1 -Open`. The combined app defaults to
`http://127.0.0.1:4330`, avoiding other applications on port 3000.

## Extension

Load `extension/x-radar-companion` as an unpacked Chrome extension, named
**X Master**, version **3.0.1**. It retains video Save overlays, the durable
offline queue, library shortcuts, writing tools and radar panel. **Open X Media**
opens the local combined app. Existing pairings and queued saves retain their
original destination; this update never silently re-pairs them.

## Existing accounts and data

X Media's `.data` stays in place. X Master's original project, hosted app and
remote library are preserved. No private data or credentials were copied into
the repository. Device-only browser drafts/bookmarks are tied to their original
origin; opening a new localhost port does not move those records.

The combined app uses `.data/x-master/master.sqlite` for X Master's database
(override with `X_REFERENCE_LOCAL_DB_PATH`). When cloud email sign-in is not
configured, loopback requests use one local workspace: saves, collections,
notes, server drafts, and extension pairing work without an account. Cloud
configuration keeps the existing invited-account behavior. Set
`X_MEDIA_LOCAL_WORKSPACE=0` to disable local workspace access. Cross-origin
requests cannot use the local identity; extensions still require pairing.

Saved references keep their captured public media URLs. Available videos stream
from X in the reference viewer; these are not offline MP4 copies. Private
archiving still needs X Master's media worker/storage service. Cloud files and
browser records from other origins are not silently migrated. No external
posting or Discord delivery is enabled by this merge.

## Verification

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm test:extension`.
With the app running on port 4330: `pnpm test:browser`.
Browser tests cover the merged header, themes, narrow screens, saved-library
deep links, draft persistence, trending updates, failed saves and retries.
