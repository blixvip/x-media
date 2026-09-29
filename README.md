# X Media

<p>
  <a href="https://github.com/blixvip/x-media/actions/workflows/ci.yml"><img src="https://github.com/blixvip/x-media/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/node-26%2B-111?style=flat-square" alt="Node.js 26+">
  <img src="https://img.shields.io/badge/Next.js-16-111?style=flat-square" alt="Next.js 16">
  <img src="https://img.shields.io/badge/API%20key-not%20needed-111?style=flat-square" alt="No API key needed">
  <img src="https://img.shields.io/badge/data-stays%20on%20your%20machine-111?style=flat-square" alt="Local data">
</p>

**Browse X media, search tweet history, and collect Reddit memes in one local workspace. Media, tweets, and Reddit collection need no API key or paid subscription.**

X Media is a local web app for browsing an account's available public media. Enter a username, watch results arrive, and switch between videos, photos, GIFs, newest, and oldest. Saved collections reopen without another request to X.

The archive uses the [FxTwitter public media timeline](https://docs.fxembed.com/api/twitter/operations/2profilehandlemedia/). It works with public usernames, including ordinary accounts; results depend on what the upstream service exposes. It cannot guarantee every account or a complete lifetime archive.

**Why X Media?** Finding one video in an account's years of posts is painful on X itself. Type a username, get every public video, photo, and GIF in a filterable grid, and keep the library on your own computer so it reopens instantly next time.

[Get started](#quick-start) · [Storage and privacy](#storage-and-privacy) · [Troubleshooting](#troubleshooting) · [Developer documentation](#development)

## Features

- **Tweets explorer:** browse original public tweets for free at `/posts`, with recent, oldest, popular, and short banger views. Replies, reposts, and quote posts are excluded from every view, account count, and export. Import an X archive to add older posts, and export saved originals as JSON. Collection saves resumable progress and clearly labels incomplete history. See [Tweets explorer](docs/POSTS.md).
- **Shared folders:** organize X attachments and Reddit memes together, place an item in multiple folders, search or filter folder contents, and rename or remove folders.
- **Reddit collection:** the Reddit source tab opens the integrated meme collector, with search, community and rank filters, saved favorites, review and undo, image copying/downloads, recommendation batches, and TV playback.
- **Username search:** public X / Twitter media without signing in, cookies, or a paid API.
- **Video, photo, and GIF browser:** all attachments returned for each collected post, with type filters and latest/oldest sorting.
- **Local library:** saved media records survive app restarts; refreshes merge discoveries without erasing older results.
- **Fast saved searches:** recent collections appear from a bounded browser memory cache while the local server checks for updates.
- **Progress as it happens:** saved batches appear through server-sent events, with polling as a fallback.
- **Resumable collection:** persisted cursors, cancellation, bounded retries, and recovery after restart.
- **Video playback:** seeking through a local streaming proxy, plus a refresh control for expired video links.
- **Light and dark themes:** responsive layouts, keyboard controls, and reduced-motion support.
- **Optional dashboard:** a separate watchlist, engagement scoring, and manual review workflow at `/dashboard`.

## Quick start

Install **Node.js 26 or newer**, Git, and **pnpm 11.21.0**. Use the pinned pnpm version for the included lockfile. Reddit storage uses Node's built-in SQLite.

```sh
npm install --global pnpm@11.21.0
git clone https://github.com/blixvip/x-media.git
cd x-media
pnpm install --frozen-lockfile
pnpm dev
```

Open **[http://127.0.0.1:3000](http://127.0.0.1:3000)**, enter a public username, and select **Find media**. No `.env` file is needed for the archive. Internet access is required to collect new results or play remote media. The build also fetches the Geist fonts through Next.js.

Select **Reddit** in the header to browse memes. X Media starts and supervises its bundled Reddit collector; a separate Reddit app is unnecessary. See [Reddit integration and migration](docs/REDDIT.md).

Select **Tweets**, enter a public username, and choose **Find tweets**. No login, API key, or credits are needed. **Import archive** accepts `account.js` plus `tweets.js` from an extracted X archive, or an X Media JSON export. Public timelines may omit older posts; full account history is not guaranteed.

Select **Folders** on a media card or in its viewer, create or select folders, then **Save folders**. Open **Folders** in the header to browse your collections. Uncheck one folder and check another to move an item. Deleting a folder or removing a placement preserves the source collection and other folders. See [folder storage and testing](docs/FOLDERS.md).

The commands work in PowerShell, macOS, and Linux shells. The default server binds to `127.0.0.1`, so it is reachable on your own computer. If port 3000 is occupied, run `pnpm dev --port 3101` and open that port instead.

### Run a production build locally

```sh
pnpm build
pnpm start
```

Run one server per project/data directory. Stop the development server before starting production. For another port, use `pnpm start --port 3101`.

On Windows, run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-x-media.ps1 -Open` to start the built app and open it. The launcher reuses an existing server. Tweets reconnects automatically during startup or a brief outage; displayed results remain available while it reconnects.

### Update an existing installation

Stop the server and back up `.data` before updating, then:

```sh
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Your ignored `.data` directory stays local. The former `/archive` address redirects to the new home page; the tracker is at `/dashboard`. Existing archive state and browser selection keys remain compatible.

## Using the archive

1. Enter a public username, with or without `@`.
2. Select **Find media**. Videos are the default category; results appear as batches are saved.
3. Choose **All**, **Photos**, **Videos**, or **GIFs**, then latest or oldest. Large libraries display in pages.
4. Open a card to inspect media or follow its original post link.
5. Select a saved account to reopen it. **Refresh collection** explicitly checks for more media.
6. Use **Stop collection** to stop a running job while keeping saved results. Refresh resumes a saved checkpoint when available.

A queued, waiting, or failed search with no results does not establish that an account has no videos. The status panel explains collection progress and retries.

## Storage and privacy

| Data | Location | What it contains |
| --- | --- | --- |
| Archive library and jobs | `.data/archive-jobs/state.json` | Account details, post text, media URLs, progress, and resume cursors |
| Queue ownership | `.data/archive-jobs/process.lock` | Lock for the single running archive server |
| Shared folders | `.data/folders/state.json` | Folder names, memberships, and saved media metadata |
| Foldered Reddit originals | `.data/folders/assets` | Original image copies protected from collector cache eviction |
| Optional tracker | `.data/tracker-state.json` | Watchlist, retained posts, metrics, and workflow state |
| Tweets explorer | `.data/posts/state.json` | Full post text, profiles, engagement counts, collection jobs, and resume cursors |
| Legacy Tweets API connection | `.data/posts/connection.json` | Unused by free collection; old copies may contain a secret, so keep backups private |
| Browser state | Local storage and memory | Last selected job, theme, and a bounded cache of recent collections |

**Saved X library records are not offline video downloads.** X images and videos remain on remote media servers and load when viewed. The app does not automatically download every video file, offer bulk file export, or guarantee that an old media URL will keep working. Reddit originals added to folders are copied locally and remain available independently of the collector cache.

When run on your PC, the library is saved on that PC. If you run the server elsewhere, it is saved on that server. To back up or move your library, stop the app and copy the entire `.data` folder. Restart one server against the restored directory. An unreadable archive state file is preserved for recovery instead of silently replaced.

The public repository excludes `.data`, environment files, logs, generated artifacts, and local research reports. It contains source code, not the developer's saved collections. Do not attach state files or credentials to public issues.

Collection sends the requested username to FxTwitter. Playback contacts X's media CDN; individual link repair can also use X's public syndication service. See [architecture and data flow](docs/ARCHITECTURE.md).

This is a single-user local application with no application login or multi-user access controls. Keep the default loopback binding. A public GitHub repository does not host the running app, and GitHub Pages cannot run its Node server and persistent job queue.

## How fast is it?

Saved collections can reopen immediately from browser memory, and otherwise load from the local server without querying X. The cache retains up to five recent collections and 5,000 attachments in total. First-time searches require network requests; they cannot be guaranteed instant.

The first media page supplies the account profile when possible, avoiding a separate lookup before showing results. Workers save each page and send live progress. A collection yields after three pages so another new search can run before an older continuation.

Collection is limited to 10,000 scanned posts per job across its continuations, with a 90-second worker deadline. Genuine rate limits pause the shared collector for at least 15 minutes or until the upstream reset time, whichever is later. Other transient failures delay only the affected job, starting at 30 seconds. Up to three automatic error retries are allowed. Refreshing repeatedly does not bypass these limits.

See [performance and verification](docs/PERFORMANCE.md) for reproducible checks.

## Coverage and limitations

- Public access does not expose every account or every older post. Protected, deleted, suspended, withheld, or otherwise unavailable content may be absent.
- FxTwitter and X can change behavior, return partial history, or become unavailable. A successful collection means the available pages were processed, not that lifetime coverage was proven.
- Media is accepted only when it belongs to the requested author and uses supported X media hosts. Reposts of another author's media are not treated as the account's own uploads.
- A failed or smaller refresh keeps the larger saved library. It can contain records of posts that have since disappeared upstream.
- Video links can expire. **Refresh video link** attempts a public repair; it cannot restore deleted or inaccessible files.
- The app has no automatic posting or reply automation. The optional dashboard's scores are heuristics, not predictions or guaranteed results.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| Waiting to retry | Leave the app running until the displayed time. Saved media remains usable. Repeated refreshes cannot remove an upstream cooldown. |
| No results for a public account | Check the username and collection status. Retry later if the service failed. Public availability can differ between accounts. |
| Video does not play | Open the item and use **Refresh video link**, or try its original post. Removed media may remain unavailable. |
| Another server owns the queue | Stop the other app server for this project. Do not remove a lock while that server is running. |
| Archive state cannot be read | Stop the server, preserve `.data`, and restore a known-good backup. Do not overwrite the original state file. |
| Dashboard shows demo accounts | Expected without an official X API token. The media archive itself always uses real public results. |
| Port already in use | Stop the previous server or select another port. Separate ports do not allow two queues to share one data directory. |
| pnpm or Node version error | Check `node --version` and `pnpm --version`; use the versions in Quick start. |

## Optional dashboard and configuration

The dashboard at `/dashboard` monitors a watchlist, stores metric snapshots, scores unusual engagement, and provides a manual review queue. Without configuration it uses clearly labeled deterministic demo data. An optional server-only `X_BEARER_TOKEN` enables its official X API provider; access and billing depend on the associated X account/project.

The main archive always uses anonymous collection, even when dashboard credentials are configured. The legacy synchronous `/api/media-archive` endpoint retains separate provider selection for existing integrations.

See [dashboard and configuration](docs/DASHBOARD.md) and [`.env.example`](.env.example) for all settings. Never put secrets in `NEXT_PUBLIC_*` variables.

## Development

Built with Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/Base UI, and Vitest. The archive needs a persistent Node.js process and writable local storage.

```sh
pnpm audit --audit-level high
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build
```

[GitHub Actions](https://github.com/blixvip/x-media/actions/workflows/ci.yml) runs these checks on pushes and pull requests. Tests cover collection, recovery, retry behavior, provenance, media handling, streaming, API validation, persistence, and dashboard scoring. Live network verification is separate from the deterministic test suite.

- [Architecture, source modules, and HTTP API](docs/ARCHITECTURE.md)
- [Performance and live verification](docs/PERFORMANCE.md)
- [Dashboard configuration and scoring](docs/DASHBOARD.md)
- [Product boundaries](PRODUCT.md) and [design system](DESIGN.md)

## Discovery, attribution, and licensing

The repository title, description, topics, and README describe **X / Twitter video search, public media archives, photo browsing, and local libraries** in plain language. App pages also have descriptive titles, descriptions, and sharing metadata. The personal app is marked `noindex`; discovery is directed to the public source repository, not a user's saved library. Search engines decide whether and where to show a repository, so indexing and rankings are never guaranteed. [Google's SEO guidance](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) explains these limits.

X Media is an independent project, not affiliated with X or FxTwitter. Its anonymous collector uses the [FxTwitter API](https://docs.fxembed.com/api/introduction/). Other libraries retain their own licenses and attribution requirements; see their installed package metadata and license files. No project-wide license is currently included. Public visibility does not itself grant a general license to redistribute or modify this project's code.
