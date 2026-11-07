/* global chrome */
const $ = (selector) => document.querySelector(selector);
const pairSection = $("#pairing");
const creator = $("#creator");
const status = $("#status");
const result = $("#result");
let target = null;
let pairedUrl = "";
for (const id of ['#open-media', '#open-media-unpaired']) $(id).addEventListener('click', () => {
  void chrome.tabs.create({ url:'http://127.0.0.1:4330/' }).catch(error=>message(error.message,true));
});

function message(text, error = false) { status.textContent = text; status.dataset.error = String(error); }
function busy(value) { document.querySelectorAll("button").forEach((button) => { button.disabled = value; }); }
async function send(type, payload) { return chrome.runtime.sendMessage({ type, payload }); }

async function refresh() {
  const response = await send("x-master:status");
  const paired = response?.connection;
  pairSection.hidden = Boolean(paired);
  creator.hidden = !paired;
  pairedUrl = paired?.appUrl || "";
  $("#connection").textContent = paired ? `Paired · ${new URL(paired.appUrl).host}` : "Not paired";
  if (!paired) return;
  await refreshQueue();
  const found = await send("x-master:active-target");
  target = found?.target || null;
  $("#target").textContent = target ? `@${target.author_handle || "post"}` : found?.error || "Open X";
}

async function generate(format) {
  if (!target) throw new Error("Open the target post on X first.");
  const rough = $("#draft").value.trim();
  const response = await send("x-master:generate", { ...target, format, ...(rough ? { source_text: `${target.source_text}\n\nMy rough draft to improve:\n${rough}` } : {}) });
  if (!response?.ok) throw new Error(response?.error || "Generation failed.");
  result.value = response.artifact?.primary || "";
  message(`${format === "x_reply" ? "Reply" : "Quote"} ready. You control posting.`);
}

$("#pair").addEventListener("click", async () => {
  busy(true); message("Pairing…");
  try {
    const origin=new URL($("#app-url").value).origin;
    if(!await chrome.permissions.contains({origins:[`${origin}/*`]})){
      if(!await chrome.permissions.request({origins:[`${origin}/*`]}))throw new Error('Access to this app origin is required to pair.');
    }
    const response = await send("x-master:pair", { appUrl: $("#app-url").value, code: $("#pair-code").value });
    if (!response?.ok) throw new Error(response?.error || "Pairing failed.");
    message("Paired securely."); await refresh();
  } catch (error) { message(error.message, true); } finally { busy(false); }
});

$("#reply").addEventListener("click", () => { busy(true); void generate("x_reply").catch((error) => message(error.message, true)).finally(() => busy(false)); });
$("#quote").addEventListener("click", () => { busy(true); void generate("x_quote").catch((error) => message(error.message, true)).finally(() => busy(false)); });
$("#copy").addEventListener("click", () => { const text = result.value.trim(); if (!text) return message("Nothing to copy.", true); void navigator.clipboard.writeText(text).then(() => message("Copied.")); });
$("#insert").addEventListener("click", async () => {
  const text = result.value.trim() || $("#draft").value.trim();
  if (!text) return message("Nothing to insert.", true);
  const response = await send("x-master:insert-active", { text });
  message(response?.ok ? "Inserted. Review it, then click Post in X." : response?.error || "Could not insert.", !response?.ok);
});
$("#library").addEventListener("click", async () => {
  if (!target) return message("Open an X post first.", true);
  const response = await send("x-master:library", { collection: "example", text: target.source_text, source_url: target.source_url, author_name: target.author_name, author_handle: target.author_handle });
  message(response?.ok ? "Saved to voice library." : response?.error, !response?.ok);
});
$("#draft-save").addEventListener("click", async () => {
  const text = result.value.trim() || $("#draft").value.trim() || target?.source_text;
  if (!text) return message("Nothing to save.", true);
  const response = await send("x-master:draft", { text, source_url: target?.source_url, title: "Chrome extension draft" });
  message(response?.ok ? "Draft saved." : response?.error, !response?.ok);
});
$("#sidepanel").addEventListener("click", () => { void send("x-master:open-sidepanel"); });
$("#open-app").addEventListener("click", () => { if (pairedUrl) void chrome.tabs.create({ url: `${pairedUrl}/x-master` }); });
$("#unpair").addEventListener("click", async () => { const response=await send("x-master:unpair");if(!response?.ok){message(response?.error||'Unpair failed.',true);return;}target = null; message("Device unpaired. Revoke its credential in the website account settings too."); await refresh(); });
void refresh().catch((error) => message(error.message, true));
async function refreshQueue(){const response=await send('x-master:queue');const items=response?.items||[];$('#queue-status').textContent=items.length?`${items.length} local save${items.length===1?'':'s'} · ${items.filter(item=>item.state==='failed').length} need attention`:'No pending saves on this device';$('#queue-list').replaceChildren(...items.map(item=>{const node=document.createElement('li');node.textContent=`${item.payload.author_name||'X post'} · ${item.state}${item.error?` — ${item.error}`:''}`;return node;}));}
$('#save-reference').addEventListener('click',async()=>{const button=$('#save-reference');button.disabled=true;message('Saving selected post…');try{const response=await send('x-master:save-active-reference');message(response?.ok?response.message:response?.error||'Save failed.',!response?.ok);await refreshQueue();}catch(error){message(error.message,true);}finally{button.disabled=false;}});
$('#open-references').addEventListener('click',()=>void send('x-master:open-reference-library'));
$('#clear-queue').addEventListener('click',async()=>{if(!confirm('Discard local queued saves for this pairing? Already-saved cloud references stay unchanged. In-flight requests may already be accepted.'))return;await send('x-master:clear-queue');await refreshQueue();});

$('#open-videos').addEventListener('click',async()=>{try{const response=await send('x-master:open-saved-videos');if(!response?.ok)message(response?.error||'Could not open saved videos.',true);}catch{message('Could not open saved videos. Reopen the extension and try again.',true);}});
