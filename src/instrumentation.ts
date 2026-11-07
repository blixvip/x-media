export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { getArchiveJobs } = await import("./lib/tracker/archive-jobs");
    await getArchiveJobs();
    const { getPostsService } = await import("./lib/posts/service");
    void getPostsService().catch((error) => console.error("Tweet collector:", error.message));
    const { getRedditService } = await import("@/lib/reddit/service");
    void getRedditService().catch((error) => console.error("Reddit collector:", error.message));
    const { wifiSync } = await import("./lib/wifi-sync/server");
    void wifiSync().startIfEnabled().catch(() => console.error("Wi-Fi sync could not start. Open Synced saves to retry."));
  }
}
