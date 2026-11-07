import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const root=new URL('../extension/x-radar-companion/',import.meta.url);
let browser;
before(async()=>{browser=await chromium.launch({headless:true});await mkdir(new URL('../artifacts/video-save-check/',import.meta.url),{recursive:true});});
after(async()=>{await browser?.close();});

async function fixture(width=1100){
 const page=await browser.newPage({viewport:{width,height:850}});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.startsWith('/modules/')){const name=url.pathname.split('/').pop();if(!/^[\w-]+\.js$/.test(name))return route.abort();return route.fulfill({contentType:'text/javascript',body:await readFile(new URL(name,root),'utf8')});}
  if(url.pathname==='/home')return route.fulfill({contentType:'text/html',body:`<meta name="viewport" content="width=device-width"><style>body{margin:0;background:#080808;color:#eee;font:16px system-ui}main{max-width:600px;margin:24px auto}article{padding:16px;border:1px solid #333}[data-testid=videoPlayer]{position:relative;aspect-ratio:16/9;background:#202026;overflow:hidden}[data-testid=videoPlayer]>video{width:100%;height:100%;object-fit:contain}.native{position:absolute;bottom:5px;right:5px;height:40px}button{opacity:0!important;pointer-events:none!important}button.native{opacity:1!important;pointer-events:auto!important}x-master-video-save{opacity:0!important;visibility:hidden!important;position:fixed!important;pointer-events:auto!important}p{line-height:1.6}.spacer{height:1200px}</style><main><article data-testid="tweet" id="post"><div data-testid="User-Name"><span>Ada Example</span><span>@ada</span></div><a href="/ada/status/123456"><time datetime="2026-09-08T12:00:00Z">2h</time></a><p data-testid="tweetText">A useful clip to save for later.</p><div data-testid="videoPlayer" id="player"><video src="blob:https://x.com/local-video" poster="https://pbs.twimg.com/ext_tw_video_thumb/123/pu/img/poster.jpg"></video><button class="native" onclick="window.nativeClicks++">Play / pause</button></div><div role="group">Reply · Repost · Like</div></article><div class="spacer"></div></main>`});
  return route.abort();
 });
 await page.goto('https://x.com/home');
 await page.evaluate(async()=>{
  window.messages=[];window.nativeClicks=0;window.postClicks=0;window.mode='saved';
  document.querySelector('article').addEventListener('click',()=>window.postClicks++);
  window.chrome={runtime:{sendMessage:async message=>{
   window.messages.push(message);
   if(message.type==='x-master:open-saved-videos')return {ok:true};
   if(window.mode==='error')return {ok:false,error:'Pair this extension first.'};
   if(window.mode==='pending')return {ok:true,state:'pending',message:'Queued on this device · retries when Chrome is online'};
   return {ok:true,state:'saved',item:{id:'ref-1'},message:'Post saved · media queued'};
  }}};
  const mod=await import('/modules/video-save.js');mod.installVideoSaveButtons();mod.installVideoSaveButtons();
 });
 return page;
}

for(const width of [375,1100])test(`video Save stays top-left and leaves native playback alone at ${width}px`,async()=>{
 const page=await fixture(width);
 try{
  const button=page.getByRole('button',{name:'Save video to X Master',exact:true});
  await button.waitFor();assert.equal(await page.locator('x-master-video-save').count(),1);
  const owner=await page.locator('#player').boundingBox();const box=await button.boundingBox();
  assert.ok(Math.abs(box.x-owner.x-10)<1);assert.ok(Math.abs(box.y-owner.y-10)<1);
  assert.equal(await button.evaluate(el=>getComputedStyle(el).opacity),'1');
  await page.mouse.move(width-1,0);await button.click();
  assert.equal(await page.evaluate(()=>window.postClicks),0);
  const payload=await page.evaluate(()=>window.messages[0].payload);
  assert.equal(payload.source_url,'https://x.com/ada/status/123456');assert.equal(payload.attachments[0].kind,'video');assert.equal(payload.attachments[0].source_url,undefined);
  assert.equal(payload.attachments[0].preview_url,'https://pbs.twimg.com/ext_tw_video_thumb/123/pu/img/poster.jpg');
  await page.getByRole('button',{name:'Play / pause'}).click();assert.equal(await page.evaluate(()=>window.nativeClicks),1);
  await page.getByRole('button',{name:'Open saved videos'}).click();assert.equal(await page.evaluate(()=>window.messages.at(-1).type),'x-master:open-saved-videos');
  await page.evaluate(()=>window.scrollTo(0,75));
  const scrolled=await page.getByRole('button',{name:'Open saved videos'}).boundingBox();assert.ok(Math.abs(scrolled.y-(await page.locator('#player').boundingBox()).y-10)<1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:new URL(`../artifacts/video-save-check/video-save-${width}.png`,import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
 }finally{await page.close();}
});

test('errors and offline saves stay retryable; recycled videos cannot save the old post',async()=>{
 const page=await fixture();
 try{
  await page.evaluate(()=>window.mode='error');await page.getByRole('button',{name:'Save video to X Master'}).click();
  assert.match(await page.locator('x-master-video-save output').textContent(),/Pair this extension/);
  await page.evaluate(()=>window.mode='pending');await page.getByRole('button',{name:'Save video to X Master'}).click();
  assert.equal(await page.locator('x-master-video-save button').textContent(),'Queued');
  await page.locator('#post > a').evaluate(el=>el.href='/ada/status/654321');
  await page.waitForFunction(()=>document.querySelector('x-master-video-save').shadowRoot.querySelector('button').textContent==='Save video');
  await page.evaluate(()=>window.mode='saved');await page.getByRole('button',{name:'Save video to X Master'}).click();
  assert.equal(await page.evaluate(()=>window.messages.at(-1).payload.source_url),'https://x.com/ada/status/654321');
  await page.locator('#player').evaluate(el=>{el.querySelector('video').remove();});
  await page.waitForFunction(()=>!document.querySelector('x-master-video-save'));
 }finally{await page.close();}
});

test('quoted media is never attributed to its outer post; multiple videos retain order',async()=>{
 const page=await fixture();
 try{
  await page.locator('#post').evaluate(article=>{
   const quote=document.createElement('div');quote.dataset.testid='quoteTweet';quote.innerHTML='<div data-testid="videoPlayer"><video src="blob:quote"></video></div>';article.append(quote);
   const second=document.createElement('div');second.dataset.testid='videoPlayer';second.innerHTML='<video src="https://video.twimg.com/second.mp4"></video>';article.append(second);
  });
  await page.getByRole('button',{name:'Save videos to X Master'}).first().waitFor();
  assert.equal(await page.locator('[data-testid=quoteTweet] x-master-video-save').count(),0);
  await page.getByRole('button',{name:'Save videos to X Master'}).first().click();
  const attachments=await page.evaluate(()=>window.messages[0].payload.attachments);
  assert.equal(attachments.length,2);assert.deepEqual(attachments.map(item=>item.position),[0,1]);
  assert.equal(attachments[1].source_url,'https://video.twimg.com/second.mp4');
 }finally{await page.close();}
});
