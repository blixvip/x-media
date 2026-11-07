/* global chrome */
void Promise.all([
  import(chrome.runtime.getURL("collector.js")),
  import(chrome.runtime.getURL("x-master-page.js")),
]).then(([{ collectVisiblePosts }, { installXMasterPageTools }]) => {
  installXMasterPageTools();
  let timer = 0;
  let lastFingerprint = "";

  function publish() {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const posts = collectVisiblePosts();
      const fingerprint = posts.map((post) => `${post.id}:${post.metrics.likes}:${post.metrics.replies}:${post.metrics.reposts}`).join("|");
      if (!posts.length || fingerprint === lastFingerprint) return;
      lastFingerprint = fingerprint;
      void chrome.runtime.sendMessage({
        type: "x-radar:capture",
        payload: { version: 1, captured_at: new Date().toISOString(), posts },
      });
    }, 350);
  }

  const observer = new MutationObserver(publish);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("scroll", publish, { passive: true });
  window.addEventListener("focus", publish);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") publish(); });
  publish();
}).catch(() => { /* X changed or the extension was reloaded; the next page load retries. */ });
