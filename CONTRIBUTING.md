# Contributing to X Media

Thanks for helping! Questions and ideas are welcome in the **[Discord](https://discord.gg/zEB4VjmfSb)**, and bugs go in [GitHub issues](https://github.com/blixvip/x-media/issues/new/choose).

## Finding something to work on

- [Good first issues](https://github.com/blixvip/x-media/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) are small and list the files to touch.
- [Help wanted](https://github.com/blixvip/x-media/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) issues are bigger.
- Comment on the issue to claim it so two people don't build the same thing. If you go quiet for a week, it opens up again.
- Have your own idea? For anything larger than a bug fix, raise it in the [Discord](https://discord.gg/zEB4VjmfSb) or open an issue first.

By contributing, you agree your work is released under the project's [MIT License](LICENSE).

## Setup

You need **Node.js 26+** (what CI runs; the Reddit collector uses Node's built-in SQLite) and **pnpm 11.21.0**, the version pinned for the lockfile.

```sh
npm install --global pnpm@11.21.0
git clone https://github.com/<you>/x-media.git
cd x-media
pnpm install --frozen-lockfile
pnpm dev             # http://127.0.0.1:3000
```

No `.env` is needed. The archive, the Tweets page and the Reddit collector all work anonymously. `.env.example` lists the optional settings, such as the dashboard's `X_BEARER_TOKEN`. Set `MEME_OFFLINE=1` to serve existing Reddit data without any collection requests.

## Before you open a pull request

```sh
pnpm lint
pnpm typecheck
pnpm test            # vitest run + node --test collectors/reddit/*.test.mjs
pnpm build           # only if you touched routing, config or server code
```

- Keep changes small and focused. One fix or feature per pull request.
- Check UI changes in a real browser, in light and dark themes and at phone width, and add a screenshot or GIF.
- Tests must stay deterministic. Fake `fetch` the way `scripts/fx-media-worker.test.mjs` and `collectors/reddit/v4.test.mjs` do. Never make a test depend on X, FxTwitter, Reddit or Discord being reachable.
- Vitest enforces coverage thresholds on `src/lib` and the API routes (90% statements/functions/lines, 80% branches). Add tests with your change.
- Match the style of the file you're editing. `collectors/reddit/` is deliberately dense; `src/` uses ESLint (`pnpm lint`).
- Don't commit `.data/`, `.env*`, logs, reports from `scripts/verify-archive-live.mjs` or `scripts/benchmark-archive-speed.mjs`, or anything containing usernames you collected.
- Don't add a runtime dependency without saying why in the pull request. Update `pnpm-lock.yaml` with pnpm 11.21.0.
- The server binds to `127.0.0.1` and has no login. Don't weaken the loopback and same-origin checks in `src/lib/reddit/proxy.ts`, `src/lib/folders/api.ts` or `collectors/reddit/server.mjs`, and don't widen the media host allowlists (`pbs.twimg.com`, `video.twimg.com`, the Reddit image hosts).
- Never send credentials to the anonymous collector. `src/lib/tracker/archive-job-runner.ts` clears them on purpose.

## Where things live

- `src/components/tracker/media-archive-explorer.tsx`, `use-archive-jobs.ts`: the X media home page (search, status, grid, viewer) and its cache, SSE and polling client
- `src/lib/tracker/archive-job-*.ts`: the persistent single-worker queue, state schema and atomic JSON store in `.data/archive-jobs/`, plus link repair
- `scripts/free-media-worker.mjs`, `fx-media-worker.mjs`, `stream-media-worker.mjs`: the collection worker process. FxTwitter is the current source; the scraper path is legacy
- `src/lib/posts/`, `src/components/posts/`: the Tweets explorer, archive import and export
- `src/lib/folders/`, `src/components/folders/`: shared folders across X and Reddit
- `collectors/reddit/`: the bundled Reddit collector, a plain Node HTTP server with SQLite. Next.js supervises it from `src/lib/reddit/service.ts` and proxies it through `/api/reddit/*`
- `src/components/tracker/tracker-dashboard.tsx`, `src/lib/tracker/service.ts`: the optional `/dashboard` watchlist (demo data without a token)
- `docs/`: architecture, API, performance and per-feature notes. `PRODUCT.md` and `DESIGN.md` set product and visual boundaries

Made something with it? Show it off in the [Discord](https://discord.gg/zEB4VjmfSb).
