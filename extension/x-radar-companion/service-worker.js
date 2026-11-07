/* global chrome */
import {ReferenceQueue} from './reference-queue.js';
const SNAPSHOT_KEY = "latest_x_radar_snapshot";
const CONNECTION_KEY = "x_master_connection";
const DEFAULT_APP_URL = "https://ai-virality-radar.wasely.chatgpt.site";
const MENU = { reference:'x-master-reference', selected:'x-master-selected-media', reply: "x-master-reply", quote: "x-master-quote", library: "x-master-library", draft: "x-master-draft", media: "x-master-media" };
const QUEUE_KEY='x_master_reference_queue';
const queue=new ReferenceQueue({get:async()=>((await chrome.storage.local.get(QUEUE_KEY))[QUEUE_KEY]||[]),set:items=>chrome.storage.local.set({[QUEUE_KEY]:items})});
// Pairing credentials must never be readable by a content script.
void chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
async function referenceApi(paired,payload){
 const response=await fetch(`${paired.appUrl}/api/x-master/references`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{authorization:`Bearer ${paired.token}`,'content-type':'application/json'},body:JSON.stringify(payload)});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(data.error||`Save failed (${response.status}).`),{status:response.status});return data;
}
async function flushReferences(){const paired=await connection();return paired?queue.flush(paired,payload=>referenceApi(paired,payload)):null;}
async function saveReference(payload){
 const paired=await connection();if(!paired)throw new Error('Pair Chrome in X Master → Saved → Account & extension first.');
 const item=await queue.add(paired,payload);const result=await queue.flush(paired,value=>referenceApi(paired,value));const confirmed=result.results.find(value=>value.key===item.key);
 if(confirmed){const assets=confirmed.data.item.attachments||[];const message=!assets.length?'Post saved to your library':assets.every(asset=>asset.state==='complete')?'Post and media archived':assets.some(asset=>asset.state==='failed')?'Post saved · media needs attention':confirmed.data.media_configured?'Post saved · media queued':'Post saved · archive needs setup';return {state:'saved',item:confirmed.data.item,message};}
 const pending=(await queue.list(paired)).find(value=>value.key===item.key);if(pending?.state==='failed')throw new Error(pending.error);return {state:'pending',message:'Queued on this device · retries when Chrome is online'};
}
async function referenceFromTab(tabId,selected=false){const response=await chrome.tabs.sendMessage(tabId,{type:'x-master:get-reference-target',selected});if(!response?.target)throw new Error('Click or right-click the exact X post first.');return response.target;}
async function ensureAlarm(){await chrome.alarms.create('x-master-reference-retry',{periodInMinutes:1});}
chrome.runtime.onStartup.addListener(()=>{void ensureAlarm();void flushReferences();});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='x-master-reference-retry')void flushReferences().catch(()=>{});});
void ensureAlarm();

function cleanUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if ((url.protocol !== "https:" && !localHttp) || url.username || url.password) return null;
    return url.origin;
  } catch { return null; }
}

async function connection() {
  const stored = await chrome.storage.local.get(CONNECTION_KEY);
  const value = stored[CONNECTION_KEY];
  return value?.token && cleanUrl(value.appUrl) ? { ...value, appUrl: cleanUrl(value.appUrl) } : null;
}

async function api(path, options = {}) {
  const paired = await connection();
  if (!paired) throw new Error("Pair this extension with X Master first.");
  const response = await fetch(`${paired.appUrl}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${paired.token}`, accept: "application/json", ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) },
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || `X Master returned ${response.status}.`);
  return data;
}

async function pair(payload) {
  const appUrl = cleanUrl(payload?.appUrl || DEFAULT_APP_URL);
  const code = String(payload?.code || "").trim().toUpperCase();
  if (!appUrl || !/^[A-Z0-9-]{6,16}$/.test(code)) throw new Error("Enter a valid X Master URL and pairing code.");
  const response = await fetch(`${appUrl}/api/x-master/extension/pair`, {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ action: "claim", code, label: "Chrome extension" }), redirect: "error",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.token) throw new Error(data.error || "Pairing failed.");
  const value = { appUrl, token: data.token, device: data.device, pairedAt: new Date().toISOString() };
  await chrome.storage.local.set({ [CONNECTION_KEY]: value });
  return { appUrl, device: data.device };
}

async function notify(title, message) {
  await chrome.notifications.create({ type: "basic", iconUrl: "icons/icon128.png", title, message: String(message).slice(0, 220) });
}

async function activeXTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(tab.url || "")) throw new Error("Open the target post on X first.");
  return tab;
}

async function targetFromTab(tabId) {
  const response = await chrome.tabs.sendMessage(tabId, { type: "x-master:get-target" });
  if (!response?.target) throw new Error("Right-click inside an X post first.");
  return response.target;
}

async function generate(payload) {
  const data = await api("/api/x-master/generate", { method: "POST", body: JSON.stringify(payload) });
  return data.artifact;
}

async function contextAction(kind, tab) {
  if (!tab?.id) return;
  if(kind==='reference'||kind==='selected'){const result=await saveReference(await referenceFromTab(tab.id,kind==='selected'));await notify('X Master',result.message);return;}
  const target = await targetFromTab(tab.id);
  if (kind === "reply" || kind === "quote") {
    const artifact = await generate({ ...target, format: kind === "reply" ? "x_reply" : "x_quote" });
    if (kind === "reply") {
      await chrome.tabs.sendMessage(tab.id, { type: "x-master:reply-insert", text: artifact.primary });
      await notify("Reply inserted", "Review it in X, then click Post yourself.");
    } else {
      const suffix = `\n\n${target.source_url}`;
      const copy = `${artifact.primary.slice(0, Math.max(1, 280 - suffix.length)).trim()}${suffix}`;
      await chrome.tabs.create({ url: `https://x.com/intent/post?text=${encodeURIComponent(copy)}` });
    }
    return;
  }
  if (kind === "library") {
    await api("/api/x-master/library", { method: "POST", body: JSON.stringify({ collection: "example", text: target.source_text, source_url: target.source_url, author_name: target.author_name, author_handle: target.author_handle }) });
    await notify("Saved to voice library", target.author_name || target.author_handle || "X post");
    return;
  }
  if (kind === "draft") {
    await api("/api/x-master/drafts", { method: "POST", body: JSON.stringify({ text: target.source_text, source_url: target.source_url, title: `From ${target.author_name || target.author_handle || "X"}` }) });
    await notify("Draft saved", "Available in X Master.");
    return;
  }
  await api("/api/x-master/media/jobs", { method: "POST", body: JSON.stringify({ kind: "x_video_drive", source_url: target.source_url, title: target.source_text.slice(0, 100) }) });
  await notify("Media request accepted", "Check its final status in X Master → Media.");
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureAlarm();
  chrome.contextMenus.removeAll(() => {
    const contexts = ["all"];
    const documentUrlPatterns = ["https://x.com/*", "https://twitter.com/*"];
    chrome.contextMenus.create({id:MENU.reference,title:'Save post + media to X Master',contexts,documentUrlPatterns});
    chrome.contextMenus.create({id:MENU.selected,title:'Save this image / video to X Master',contexts:['image','video'],documentUrlPatterns});
    chrome.contextMenus.create({ id: MENU.reply, title: "X Master: craft reply", contexts, documentUrlPatterns });
    chrome.contextMenus.create({ id: MENU.quote, title: "X Master: craft quote", contexts, documentUrlPatterns });
    chrome.contextMenus.create({ id: MENU.library, title: "X Master: save to voice library", contexts, documentUrlPatterns });
    chrome.contextMenus.create({ id: MENU.draft, title: "X Master: save as draft", contexts, documentUrlPatterns });
    chrome.contextMenus.create({ id: MENU.media, title: "X Master: save video to Drive", contexts, documentUrlPatterns });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const kind = Object.entries(MENU).find(([, id]) => id === info.menuItemId)?.[0];
  if (kind) void contextAction(kind, tab).catch((error) => notify("X Master", error.message));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const fromPage=sender.id===chrome.runtime.id&&sender.url?.startsWith(chrome.runtime.getURL(''));
  const fromX=sender.id===chrome.runtime.id&&/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(sender.url||'');
  const pageOnly=['x-master:pair','x-master:unpair','x-master:queue','x-master:clear-queue','x-master:save-active-reference','x-master:open-reference-library'];
  if(pageOnly.includes(message?.type)&&!fromPage){sendResponse({ok:false,error:'Extension page required.'});return false;}
  if(message?.type?.startsWith('x-master:')&&!fromPage&&!fromX){sendResponse({ok:false,error:'Trusted extension context required.'});return false;}
  if(message?.type==='x-master:reference'){void saveReference(message.payload).then(result=>sendResponse({ok:true,...result})).catch(error=>sendResponse({ok:false,error:error.message}));return true;}
  if(message?.type==='x-master:save-active-reference'){void activeXTab().then(tab=>referenceFromTab(tab.id)).then(saveReference).then(result=>sendResponse({ok:true,...result})).catch(error=>sendResponse({ok:false,error:error.message}));return true;}
  if(message?.type==='x-master:queue'){void connection().then(async paired=>sendResponse({ok:true,items:paired?await queue.list(paired):[]}));return true;}
  if(message?.type==='x-master:clear-queue'){void connection().then(async paired=>{if(paired)await queue.clear(paired);sendResponse({ok:true});});return true;}
  if(message?.type==='x-master:open-saved-videos'){void connection().then(async paired=>{if(!paired)throw new Error('Pair this extension first.');await chrome.tabs.create({url:`${paired.appUrl}/x-master?view=saved&media=video`});sendResponse({ok:true});}).catch(error=>sendResponse({ok:false,error:error.message}));return true;}
  if(message?.type==='x-master:open-reference-library'){void connection().then(async paired=>{if(paired)await chrome.tabs.create({url:`${paired.appUrl}/x-master?view=saved`});sendResponse({ok:Boolean(paired)});});return true;}
  if (message?.type === "x-radar:capture") {
    const fromX = /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(sender.url || "");
    const payload = message.payload;
    const bounded = payload?.version === 1 && Array.isArray(payload.posts) && payload.posts.length <= 100 && JSON.stringify(payload).length <= 250_000;
    if (fromX && bounded) void chrome.storage.session.set({ [SNAPSHOT_KEY]: payload });
    sendResponse({ ok: Boolean(fromX && bounded) });
    return false;
  }
  if (message?.type === "x-radar:get-snapshot") { void chrome.storage.session.get(SNAPSHOT_KEY).then((result) => sendResponse({ payload: result[SNAPSHOT_KEY] || null })); return true; }
  if (message?.type === "x-master:pair") { void pair(message.payload).then((result) => sendResponse({ ok: true, ...result })).catch((error) => sendResponse({ ok: false, error: error.message })); return true; }
  if (message?.type === "x-master:unpair") { void connection().then(async paired=>{if(paired&&(await queue.list(paired)).length){sendResponse({ok:false,error:'Resolve or explicitly discard local queued saves before unpairing.'});return;}await chrome.storage.local.remove(CONNECTION_KEY);sendResponse({ok:true});}).catch(error=>sendResponse({ok:false,error:error.message}));return true; }
  if (message?.type === "x-master:status") { void connection().then((result) => sendResponse({ ok: true, connection: result ? { appUrl: result.appUrl, device: result.device, pairedAt: result.pairedAt } : null })); return true; }
  if (message?.type === "x-master:session") { void api("/api/x-master/extension/session").then((data) => sendResponse({ ok: true, ...data })).catch((error) => sendResponse({ ok: false, error: error.message })); return true; }
  if (message?.type === "x-master:generate") { void generate(message.payload).then((artifact) => sendResponse({ ok: true, artifact })).catch((error) => sendResponse({ ok: false, error: error.message })); return true; }
  if (message?.type === "x-master:library") { void api("/api/x-master/library", { method: "POST", body: JSON.stringify(message.payload) }).then((data) => sendResponse({ ok: true, ...data })).catch((error) => sendResponse({ ok: false, error: error.message })); return true; }
  if (message?.type === "x-master:draft") { void api("/api/x-master/drafts", { method: "POST", body: JSON.stringify(message.payload) }).then((data) => sendResponse({ ok: true, ...data })).catch((error) => sendResponse({ ok: false, error: error.message })); return true; }
  if (message?.type === "x-master:media") { void api("/api/x-master/media/jobs", { method: "POST", body: JSON.stringify(message.payload) }).then((data) => sendResponse({ ok: true, ...data })).catch((error) => sendResponse({ ok: false, error: error.message })); return true; }
  if (message?.type === "x-master:active-target") { void activeXTab().then(async (tab) => ({ tab, target: await targetFromTab(tab.id) })).then((result) => sendResponse({ ok: true, target: result.target, tabId: result.tab.id })).catch((error) => sendResponse({ ok: false, error: error.message })); return true; }
  if (message?.type === "x-master:insert-active") { void activeXTab().then((tab) => chrome.tabs.sendMessage(tab.id, { type: "x-master:insert", text: message.payload?.text })).then((result) => sendResponse(result)).catch((error) => sendResponse({ ok: false, error: error.message })); return true; }
  if (message?.type === "x-master:open-sidepanel") { void chrome.windows.getCurrent().then((win) => chrome.sidePanel.open({ windowId: win.id })).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message })); return true; }
  return false;
});
