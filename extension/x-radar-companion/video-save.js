/* global chrome */
import { extractVideoReferenceTarget } from './reference-capture.js';

let installed = false;
export function installVideoSaveButtons() {
  if (installed) return;
  installed = true;
  const mounted = new Map();
  const states = new Map();
  let frame = 0;

  function paint(entry) {
    const state = states.get(entry.post) || {};
    entry.button.disabled = state.busy === true;
    entry.button.textContent = state.busy ? 'Saving…' : state.saved ? 'Saved ✓' : state.pending ? 'Queued' : entry.multiple ? 'Save videos' : 'Save video';
    entry.button.setAttribute('aria-label', state.saved ? 'Open saved videos' : state.busy ? 'Saving video' : entry.multiple ? 'Save videos to X Master' : 'Save video to X Master');
    entry.button.title = state.saved ? 'Open your saved videos in X Master' : 'Save this post’s videos to your X Master library';
    entry.output.textContent = state.message || '';
    entry.output.hidden = !state.message;
  }
  function update(post, state) {
    states.set(post, state);
    // Avoid unbounded state growth during long infinite-scroll sessions.
    if (states.size > 500) {
      const oldest = [...states.keys()].find(key => key !== post && !states.get(key)?.busy);
      if (oldest) states.delete(oldest);
    }
    for (const entry of mounted.values()) if (entry.post === post) paint(entry);
  }
  function remove(owner, entry) {
    entry.host.remove();
    if (entry.changedPosition && owner.style.position === 'relative') {
      if (entry.position) owner.style.setProperty('position', entry.position, entry.priority);
      else owner.style.removeProperty('position');
    }
    mounted.delete(owner);
  }
  function mount(owner, video, payload) {
    const host = document.createElement('x-master-video-save');
    const declarations = { display:'block', position:'absolute', top:'10px', left:'10px', right:'auto', bottom:'auto', width:'max-content', 'max-width':'calc(100% - 20px)', margin:'0', padding:'0', 'z-index':'3', 'pointer-events':'none', opacity:'1', visibility:'visible', isolation:'isolate' };
    for (const [key, value] of Object.entries(declarations)) host.style.setProperty(key, value, 'important');
    const root = host.attachShadow({mode:'open'});
    const style = document.createElement('style');
    style.textContent = ':host{color-scheme:dark}*{box-sizing:border-box}button{display:flex;align-items:center;justify-content:center;min-height:40px;max-width:100%;padding:8px 12px;border:1px solid #777;border-radius:7px;background:#151517;color:#fff;font:600 13px/1.4 system-ui,sans-serif;cursor:pointer;pointer-events:auto;white-space:nowrap;opacity:1;visibility:visible;box-shadow:0 1px 4px #0005}button:hover{background:#303035}button:focus-visible{outline:2px solid #e6c979;outline-offset:3px}button:disabled{cursor:wait;color:#ccc}output{display:block;width:max-content;max-width:min(250px,100%);margin-top:6px;padding:7px 9px;border-radius:6px;background:#151517;color:#eee;font:12px/1.4 system-ui,sans-serif;overflow-wrap:anywhere;pointer-events:none}[hidden]{display:none}@media(pointer:coarse){button{min-height:44px}}';
    const button = document.createElement('button'); button.type = 'button';
    const output = document.createElement('output'); output.setAttribute('aria-live','polite'); output.hidden = true;
    const entry = {host,button,output,video,post:payload.source_url,multiple:payload.attachments.length>1,position:owner.style.getPropertyValue('position'),priority:owner.style.getPropertyPriority('position'),changedPosition:getComputedStyle(owner).position==='static'};
    if (entry.changedPosition) owner.style.setProperty('position','relative');
    for (const type of ['pointerdown','pointerup','mousedown','mouseup','dblclick']) button.addEventListener(type,event=>event.stopPropagation());
    button.addEventListener('click', async event => {
      event.preventDefault(); event.stopPropagation();
      const target = extractVideoReferenceTarget(entry.video);
      if (!target || target.source_url !== entry.post) { schedule(); return; }
      const state = states.get(entry.post);
      if (state?.busy) return;
      if (state?.saved) {
        try { const response = await chrome.runtime.sendMessage({type:'x-master:open-saved-videos'}); if (!response?.ok) throw new Error(response?.error || 'Could not open saved videos.'); }
        catch(error) { update(entry.post,{saved:true,message:error.message}); }
        return;
      }
      const post = target.source_url;
      update(post,{busy:true});
      try {
        const response = await chrome.runtime.sendMessage({type:'x-master:reference',payload:target});
        if (!response?.ok) throw new Error(response?.error || 'Save failed. Try again.');
        const saved = response.state === 'saved' && Boolean(response.item?.id);
        if (!saved && response.state !== 'pending') throw new Error('Save was not confirmed. Try again.');
        update(post,{saved,pending:!saved,message:response.message || (saved?'Saved to your X Master library.':'Queued. Will retry when online.')});
        if (saved) setTimeout(()=>{const current=states.get(post);if(current?.saved)update(post,{...current,message:''});},4500);
      } catch(error) {
        update(post,{message:/context invalidated|receiving end|disconnected/i.test(error.message)?'Reload X to reconnect the extension.':error.message});
      }
    });
    root.append(style,button,output); owner.append(host); mounted.set(owner,entry); paint(entry);
  }
  function scan() {
    frame = 0;
    const found = new Set();
    for (const video of document.querySelectorAll('video')) {
      const payload = extractVideoReferenceTarget(video);
      if (!payload) continue;
      const owner = video.closest('[data-testid="videoPlayer"]') || video.parentElement;
      if (!owner || owner.tagName === 'A' || found.has(owner)) continue;
      found.add(owner);
      const existing = mounted.get(owner);
      if (existing && existing.host.isConnected && existing.video === video && existing.post === payload.source_url) { existing.multiple=payload.attachments.length>1; paint(existing); continue; }
      if (existing) remove(owner,existing);
      mount(owner,video,payload);
    }
    for (const [owner,entry] of mounted) if (!found.has(owner)) remove(owner,entry);
  }
  function schedule() { if (!frame) frame=requestAnimationFrame(scan); }
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['href','src','poster','data-testid']});
  window.addEventListener('pageshow',schedule);
  scan();
}
