import { observedPublicSignals } from "../public-signals/route.ts";
import { PUBLIC_RADAR_ORIGIN, renderPublicAtomFeed } from "../../../lib/public-atom-feed.ts";

export async function GET() {
  try {
    const payload = await observedPublicSignals();
    return new Response(renderPublicAtomFeed(payload, PUBLIC_RADAR_ORIGIN), {
      headers: {
        "cache-control": "public, max-age=60, s-maxage=120, stale-while-revalidate=300",
        "content-type": "application/atom+xml; charset=utf-8",
        "x-content-type-options": "nosniff",
        "x-radar-mode": "public-atom-feed",
      },
    });
  } catch {
    return new Response("The public AI evidence feed is temporarily unavailable.\n", {
      status: 502,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/plain; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    });
  }
}
