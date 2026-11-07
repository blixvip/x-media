/* global chrome */
function publishLatest() {
  void chrome.runtime.sendMessage({ type: "x-radar:get-snapshot" }).then((response) => {
    if (!response?.payload) return;
    window.postMessage({ source: "x-radar-companion", type: "snapshot", payload: response.payload }, window.location.origin);
  }).catch(() => { /* Extension context was reloaded. */ });
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  if (event.data?.source === "x-radar-web" && event.data?.type === "request-snapshot") publishLatest();
});
publishLatest();
window.setInterval(publishLatest, 15_000);
