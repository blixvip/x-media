/* global chrome */
const $ = (selector) => document.querySelector(selector);
let pairedUrl = "";
let activeTarget = null;
function tell(text, error = false) { $("#status").textContent = text || ""; $("#status").dataset.error = String(error); }
async function send(type, payload) { return chrome.runtime.sendMessage({ type, payload }); }
function score(post) { const m = post.metrics || {}; return Math.round((m.likes || 0) + (m.reposts || 0) * 2.5 + (m.replies || 0) * 1.6 + Math.log10((m.views || 0) + 1) * 20); }

document.querySelectorAll("nav button").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("nav button").forEach((item) => item.classList.toggle("active", item === button));
  document.querySelectorAll("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== button.dataset.tab; });
}));

function card(post) {
  const node = document.createElement("article"); node.className = "card";
  const top = document.createElement("div"); top.className = "card-top";
  const name = document.createElement("span"); name.textContent = `@${post.author?.username || "x"}`;
  const points = document.createElement("span"); points.className = "score"; points.textContent = `${score(post)} signal`;
  top.append(name, points);
  const body = document.createElement("p"); body.textContent = post.text || post.url;
  const actions = document.createElement("div"); actions.className = "card-actions";
  const reply = document.createElement("button"); reply.type = "button"; reply.textContent = "Reply";
  const open = document.createElement("button"); open.type = "button"; open.className = "secondary"; open.textContent = "Open";
  reply.addEventListener("click", async () => {
    tell("Crafting reply…");
    const response = await send("x-master:generate", { format: "x_reply", source_text: post.text || post.url, source_url: post.url });
    if (!response?.ok) return tell(response?.error || "Generation failed.", true);
    $("#output").value = response.artifact?.primary || ""; document.querySelector('[data-tab="reply"]').click(); tell("Reply ready.");
  });
  open.addEventListener("click", () => { void chrome.tabs.create({ url: post.url }); });
  actions.append(reply, open); node.append(top, body, actions); return node;
}

async function updateRadar() {
  const response = await send("x-radar:get-snapshot");
  const posts = [...(response?.payload?.posts || [])].sort((a, b) => score(b) - score(a)).slice(0, 12);
  $("#count").textContent = `${posts.length} posts`; $("#empty").hidden = posts.length > 0;
  $("#feed").replaceChildren(...posts.map(card));
}

async function getTarget() { const response = await send("x-master:active-target"); activeTarget = response?.target || null; if (!activeTarget) throw new Error(response?.error || "Open an X post first."); return activeTarget; }
async function generate(format) {
  const target = await getTarget(); const rough = $("#rough").value.trim(); tell("Writing in your voice…");
  const response = await send("x-master:generate", { ...target, format, ...(rough ? { source_text: `${target.source_text}\n\nMy rough angle:\n${rough}` } : {}) });
  if (!response?.ok) throw new Error(response?.error || "Generation failed."); $("#output").value = response.artifact?.primary || ""; tell("Ready. Review before posting.");
}
$("#make-reply").addEventListener("click", () => void generate("x_reply").catch((error) => tell(error.message, true)));
$("#make-quote").addEventListener("click", () => void generate("x_quote").catch((error) => tell(error.message, true)));
$("#copy").addEventListener("click", () => { const text = $("#output").value.trim(); if (!text) return tell("Nothing to copy.", true); void navigator.clipboard.writeText(text).then(() => tell("Copied.")); });
$("#insert").addEventListener("click", async () => { const text = $("#output").value.trim(); if (!text) return tell("Nothing to insert.", true); const response = await send("x-master:insert-active", { text }); tell(response?.ok ? "Inserted. You control Post." : response?.error, !response?.ok); });
$("#save-example").addEventListener("click", async () => { try { const target = await getTarget(); const response = await send("x-master:library", { collection: "example", text: target.source_text, source_url: target.source_url, author_name: target.author_name, author_handle: target.author_handle }); tell(response?.ok ? "Voice example saved." : response?.error, !response?.ok); } catch (error) { tell(error.message, true); } });
$("#save-draft").addEventListener("click", async () => { try { const target = await getTarget(); const response = await send("x-master:draft", { text: target.source_text, source_url: target.source_url, title: "Captured from X" }); tell(response?.ok ? "Draft saved." : response?.error, !response?.ok); } catch (error) { tell(error.message, true); } });
$("#save-video").addEventListener("click", async () => { try { const target = await getTarget(); const response = await send("x-master:media", { kind: "x_video_drive", source_url: target.source_url, title: target.source_text.slice(0, 100) }); tell(response?.ok ? "Media request accepted. Check its final status in X Master → Media." : response?.error, !response?.ok); } catch (error) { tell(error.message, true); } });
$('#save-reference').addEventListener('click',async()=>{const button=$('#save-reference');button.disabled=true;tell('Saving selected post…');try{const response=await send('x-master:save-active-reference');tell(response?.ok?response.message:response?.error||'Save failed.',!response?.ok);}catch(error){tell(error.message,true);}finally{button.disabled=false;}});
$('#open-references').addEventListener('click',()=>void send('x-master:open-reference-library'));
$("#open").addEventListener("click", () => { if (pairedUrl) void chrome.tabs.create({ url: `${pairedUrl}/x-master` }); });
$("#open-drafts").addEventListener("click", () => { if (pairedUrl) void chrome.tabs.create({ url: `${pairedUrl}/x-master?view=drafts` }); });

void send("x-master:status").then((response) => { pairedUrl = response?.connection?.appUrl || ""; $("#connection").textContent = pairedUrl ? `Paired · ${new URL(pairedUrl).host}` : "Pair from the popup"; });
void updateRadar(); setInterval(updateRadar, 5_000);
