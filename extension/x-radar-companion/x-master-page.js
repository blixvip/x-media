/* global chrome */
import {extractReferenceTarget} from './reference-capture.js';
import {installVideoSaveButtons} from './video-save.js';
const ARTICLE = 'article[data-testid="tweet"]';
const TEXT = '[data-testid="tweetText"]';
const COMPOSERS = [
  '[data-testid="tweetTextarea_0"][contenteditable="true"]',
  '[data-testid="tweetTextarea_0"] [contenteditable="true"]',
  '[contenteditable="true"][role="textbox"]',
].join(",");

function clean(value, maximum = 12_000) {
  return String(value || "").replace(/\s*https?:\/\/t\.co\/\S+/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, maximum);
}

function statusUrl(article) {
  const link = Array.from(article?.querySelectorAll('a[href*="/status/"]') || []).find((node) => node.querySelector("time"));
  try { return new URL(link?.getAttribute("href") || location.href, "https://x.com").toString(); }
  catch { return location.href; }
}

function author(article) {
  const parts = Array.from(article?.querySelectorAll('[data-testid="User-Name"] span') || []).map((node) => clean(node.textContent, 80)).filter(Boolean);
  const handle = parts.find((part) => /^@[A-Za-z0-9_]{1,15}$/.test(part)) || "";
  return { author_name: parts.find((part) => part !== handle && !/^[·•]$/.test(part)) || handle, author_handle: handle.replace(/^@/, "") };
}

export function extractXTarget(node = document.activeElement) {
  const article = node?.closest?.(ARTICLE);
  if (!article) return null;
  const source_text = clean(article.querySelector(TEXT)?.textContent);
  const source_url = statusUrl(article);
  return source_text || source_url ? { source_text: source_text || source_url, source_url, ...author(article) } : null;
}

async function waitForComposer(timeout = 8_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const composer = document.querySelector(COMPOSERS);
    if (composer) return composer;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return null;
}

function normalized(value) { return clean(value, 25_000).replace(/\s+/g, " "); }

async function writeComposer(composer, text) {
  const value = clean(text, 25_000);
  composer.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(composer);
  selection?.removeAllRanges();
  selection?.addRange(range);
  try { document.execCommand("delete", false); document.execCommand("insertText", false, value); } catch { /* Direct DOM fallback below. */ }
  composer.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: value }));
  composer.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 140));
  if (normalized(composer.textContent).includes(normalized(value))) return true;
  composer.textContent = value;
  composer.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: value }));
  await new Promise((resolve) => setTimeout(resolve, 140));
  if (!normalized(composer.textContent).includes(normalized(value))) throw new Error("X did not accept the text. Click the composer and try again.");
  return true;
}

export async function insertIntoXComposer(text) {
  let composer = await waitForComposer(500);
  if (!composer) {
    document.querySelector('[data-testid="SideNav_NewTweet_Button"]')?.click();
    composer = await waitForComposer();
  }
  if (!composer) throw new Error("Open an X reply or post composer first.");
  return writeComposer(composer, text);
}

async function insertReplyIntoArticle(article, text) {
  const existing = article.querySelector(COMPOSERS);
  if (existing) return writeComposer(existing, text);
  article.querySelector('[data-testid="reply"]')?.click();
  const composer = await waitForComposer();
  if (!composer) throw new Error("X did not open the reply composer.");
  return writeComposer(composer, text);
}

function quoteText(text, sourceUrl) {
  const suffix = `\n\n${sourceUrl}`;
  return `${clean(text, Math.max(1, 280 - suffix.length)).slice(0, 280 - suffix.length).trim()}${suffix}`;
}

async function generateFor(article, format, control) {
  const target = extractXTarget(article);
  if (!target) throw new Error("Could not read this post.");
  const original = control.textContent;
  control.disabled = true;
  control.textContent = "Thinking…";
  try {
    const response = await chrome.runtime.sendMessage({ type: "x-master:generate", payload: { ...target, format } });
    if (!response?.ok) throw new Error(response?.error || "Generation failed.");
    if (format === "x_reply") {
      await insertReplyIntoArticle(article, response.artifact?.primary || "");
    } else {
      const copy = quoteText(response.artifact?.primary || "", target.source_url);
      await navigator.clipboard.writeText(copy);
      window.open(`https://x.com/intent/post?text=${encodeURIComponent(copy)}`, "_blank", "noopener");
    }
    control.textContent = format === "x_reply" ? "Inserted — you post" : "Quote ready";
  } finally {
    control.disabled = false;
    setTimeout(() => { control.textContent = original; }, 2_500);
  }
}

function enhanceArticle(article) {
  const target=extractReferenceTarget(article);if(!target)return;
  const existing=Array.from(article.querySelectorAll('x-master-controls')).find(node=>node.closest(ARTICLE)===article);
  if(existing?.dataset.post===target.source_url)return;
  existing?.remove();
  const group=Array.from(article.querySelectorAll('[role="group"]')).find(node=>node.closest(ARTICLE)===article&&!node.closest('[data-testid="quoteTweet"],div[role="link"][tabindex]'));
  if(!group)return;
  const host=document.createElement('x-master-controls');host.dataset.post=target.source_url;
  // Own layout and Shadow DOM: never resize X's action row or leak page CSS.
  host.style.cssText='display:block;position:relative;margin:8px 0 4px;max-width:100%;isolation:isolate;';
  const root=host.attachShadow({mode:'open'});const style=document.createElement('style');
  style.textContent=':host{color-scheme:dark}.row{display:flex;flex-wrap:wrap;gap:6px;font:500 13px/1.4 system-ui}button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;padding:7px 10px;border:1px solid #414047;border-radius:8px;background:#242429;color:#eeedf0;font:inherit;cursor:pointer;max-width:100%;overflow-wrap:anywhere}button.save{background:#d9bd74;color:#201c13;border-color:#d9bd74;font-weight:650}button:hover{filter:brightness(1.1)}button:active{transform:scale(.98)}button:focus-visible{outline:2px solid #e8ce8e;outline-offset:3px}button:disabled{opacity:.65;cursor:wait}img{width:16px;height:16px}output{display:block;padding-top:6px;font:12px/1.5 system-ui;color:#bfc0c9;overflow-wrap:anywhere}@media(pointer:coarse){button{min-height:44px}}@media(prefers-reduced-motion:reduce){button:active{transform:none}}';
  const row=document.createElement('div');row.className='row';const output=document.createElement('output');output.setAttribute('aria-live','polite');
  const control=(label,title)=>{const node=document.createElement('button');node.type='button';node.textContent=label;node.title=title;return node;};
  const save=control('Save to X Master','Save this exact post and its media to your private library');save.className='save';
  const reply = control("Reply", "Generate and insert a voice-matched reply");
  const quote = control("Quote", "Generate a quote post and open X composer");
  const logo=document.createElement('img');logo.src=chrome.runtime.getURL('icon.svg');logo.alt='';save.prepend(logo);
  save.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const payload=extractReferenceTarget(article);if(!payload){output.textContent='This post changed. Try again.';return;}save.disabled=true;output.textContent='Saving this post…';void chrome.runtime.sendMessage({type:'x-master:reference',payload}).then(response=>{output.textContent=response?.ok?response.message:response?.error||'Save failed. Try again.';}).catch(()=>{output.textContent='Extension disconnected. Reload X, then try again.';}).finally(()=>{save.disabled=false;});});
  reply.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); void generateFor(article, "x_reply", reply).catch((error) => { reply.textContent = error.message; }); });
  quote.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); void generateFor(article, "x_quote", quote).catch((error) => { quote.textContent = error.message; }); });
  row.append(save,reply,quote);root.append(style,row,output);group.after(host);
}

export function installXMasterPageTools() {
  installVideoSaveButtons();
  let contextTarget = null;
  document.addEventListener("contextmenu", (event) => { contextTarget = event.target; }, true);
  document.addEventListener('pointerdown',event=>{if(event.target?.closest?.(ARTICLE))contextTarget=event.target;},true);
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "x-master:get-target") { sendResponse({ target: extractXTarget(contextTarget) }); return false; }
    if(message?.type==='x-master:get-reference-target'){
      let target=extractReferenceTarget(contextTarget);
      if(target&&message.selected){const media=contextTarget?.closest?.('img,video');const url=media?.currentSrc||media?.src;const attachment=target.attachments.find(item=>(url&&item.source_url===url)||(media?.poster&&item.preview_url===media.poster));target=attachment?{...target,attachments:[attachment]}:null;}
      sendResponse({target});return false;
    }
    if (message?.type === "x-master:insert") {
      void insertIntoXComposer(message.text).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    if (message?.type === "x-master:reply-insert") {
      const article = contextTarget?.closest?.(ARTICLE);
      if (!article) { sendResponse({ ok: false, error: "Could not find the target post." }); return false; }
      void insertReplyIntoArticle(article, message.text).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }
    return false;
  });
  const scan = () => document.querySelectorAll(ARTICLE).forEach(enhanceArticle);
  let frame=0;
  new MutationObserver(()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;scan();});}).observe(document.documentElement, { childList: true, subtree: true });
  scan();
}
