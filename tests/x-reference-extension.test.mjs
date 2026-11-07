/* global chrome */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

test('real MV3 extension loads, persists offline saves, and withholds its token from status',async()=>{
 const root=fileURLToPath(new URL('../extension/x-radar-companion/',import.meta.url));
 const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]});
 try{
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker',{timeout:15000});const id=new URL(worker.url()).host;
  const page=await context.newPage();await page.goto(`chrome-extension://${id}/popup.html`);await page.getByRole('heading',{name:'Pair extension'}).waitFor();
  await worker.evaluate(()=>chrome.storage.local.set({x_master_connection:{appUrl:'https://reference-fixture.invalid',token:'test-only-credential',device:{id:'test-device'}}}));
  await context.setOffline(true);
  const response=await page.evaluate(()=>chrome.runtime.sendMessage({type:'x-master:reference',payload:{source_url:'https://x.com/ada/status/123456',source_text:'Offline reference fixture',author_name:'Ada',attachments:[],complete:true}}));
  assert.equal(response.ok,true);assert.equal(response.state,'pending');
  const status=await page.evaluate(()=>chrome.runtime.sendMessage({type:'x-master:status'}));assert.equal(JSON.stringify(status).includes('test-only-credential'),false);
  await page.reload();assert.equal(await page.locator('#queue-status').textContent(),'1 local save · 0 need attention');
  await context.route('https://x.com/home',route=>route.fulfill({contentType:'text/html',body:'<article data-testid="tweet"><a href="/ada/status/123456"><time>now</time></a><div data-testid="tweetText">A video reference</div><div data-testid="videoPlayer" style="position:relative;width:500px;height:300px"><video style="width:100%;height:100%"></video></div><div role="group"></div></article>'}));
  const timeline=await context.newPage();await timeline.goto('https://x.com/home');
  await timeline.getByRole('button',{name:'Save video to X Master',exact:true}).click();
  await timeline.getByRole('button',{name:'Save video to X Master',exact:true}).filter({hasText:'Queued'}).waitFor();
  const videoQueue=await page.evaluate(()=>chrome.runtime.sendMessage({type:'x-master:queue'}));
  assert.equal(videoQueue.items.length,1);assert.equal(videoQueue.items[0].payload.attachments[0].kind,'video');
  await context.route('https://reference-fixture.invalid/x-master?**',route=>route.fulfill({contentType:'text/html',body:'Saved videos library'}));
  const opened=context.waitForEvent('page');await page.getByRole('button',{name:'Saved videos',exact:false}).click();
  const library=await opened;await library.waitForURL('**/x-master?view=saved&media=video');
  const unpair=await page.evaluate(()=>chrome.runtime.sendMessage({type:'x-master:unpair'}));assert.equal(unpair.ok,false);
  await page.evaluate(()=>chrome.runtime.sendMessage({type:'x-master:clear-queue'}));const queue=await page.evaluate(()=>chrome.runtime.sendMessage({type:'x-master:queue'}));assert.equal(queue.items.length,0);
 }finally{await context.close();}
});
