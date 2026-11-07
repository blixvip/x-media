import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const extensionRoot = new URL('../extension/x-radar-companion/', import.meta.url);
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const profile = (name = 'Ada Example', handle = 'ada') => `
  <div data-testid="User-Name"><span>${name}</span><span>@${handle}</span></div>
  <div data-testid="UserAvatar-Container-${handle}"><img src="https://pbs.twimg.com/profile_images/123/avatar_normal.jpg" alt=""></div>`;
const permalink = (handle = 'ada', id = '2000000000000000001') =>
  `<a href="/${handle}/status/${id}"><time datetime="2026-09-04T12:00:00.000Z">2h</time></a>`;
const image = (name, id = name) => `<div data-testid="tweetPhoto"><img id="${id}" src="https://pbs.twimg.com/media/${name}?format=jpg&amp;name=small" alt="A reference image"></div>`;
const article = (body, id = 'post') => `<article data-testid="tweet" id="${id}">${profile()}${permalink()}${body}<div role="group"><button id="save-${id}">Save</button></div></article>`;

async function capture(markup, selector, { legacy = false } = {}) {
  const moduleName = legacy ? 'x-master-page.js' : 'reference-capture.js';
  // Read first so a missing production implementation produces an explicit RED,
  // not a misleading browser timeout.
  const source = await readFile(new URL(moduleName, extensionRoot), 'utf8');
  const page = await browser.newPage();
  try {
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/__capture_test__/')) {
        const filename = url.pathname.slice('/__capture_test__/'.length);
        if (!/^[a-zA-Z0-9_-]+\.js$/.test(filename)) return route.abort();
        const body = filename === moduleName ? source : await readFile(new URL(filename, extensionRoot), 'utf8');
        return route.fulfill({ contentType: 'text/javascript', body });
      }
      if (url.pathname === '/home') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<main><button id="outside">Outside post</button>${markup}</main>` });
      return route.abort();
    });
    await page.goto('https://x.com/home');
    return await page.evaluate(async ({ moduleName, selector, legacy }) => {
      const mod = await import(`/__capture_test__/${moduleName}`);
      return (legacy ? mod.extractXTarget : mod.extractReferenceTarget)(document.querySelector(selector));
    }, { moduleName, selector, legacy });
  } finally { await page.close(); }
}

test('legacy target capture must not save the first post when the clicked target is outside a post', async () => {
  const result = await capture(article('<div data-testid="tweetText">Do not accidentally save me</div>'), '#outside', { legacy: true });
  assert.equal(result, null);
});

test('inline Save survives hostile page CSS and recycled posts without changing native actions',async()=>{
 const page=await browser.newPage({viewport:{width:320,height:800}});
 try{
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.startsWith('/__capture_test__/')){const name=url.pathname.split('/').pop();if(!/^[\w-]+\.js$/.test(name))return route.abort();return route.fulfill({contentType:'text/javascript',body:await readFile(new URL(name,extensionRoot),'utf8')});}
   if(url.pathname==='/home')return route.fulfill({contentType:'text/html; charset=utf-8',body:`<meta name="viewport" content="width=device-width"><style>body{margin:0}button{opacity:0!important;pointer-events:none!important}article{padding:10px}[role=group]{display:flex;height:40px}</style>${article('<div data-testid="tweetText">Exact source</div>')}`});return route.abort();
  });
  await page.goto('https://x.com/home');
  await page.evaluate(async()=>{
   window.captured=[];window.chrome={runtime:{getURL:name=>`https://x.com/__capture_test__/${name}`,onMessage:{addListener(){}},sendMessage:async message=>{window.captured.push(message);return {ok:true,state:'pending',message:'Queued on this device'};}}};
   await (await import('/__capture_test__/x-master-page.js')).installXMasterPageTools();
  });
  const native=await page.locator('[role=group]').boundingBox();
  const save=page.getByRole('button',{name:'Save to X Master',exact:true});await save.click();
  assert.equal(await page.locator('x-master-controls output').textContent(),'Queued on this device');
  assert.equal(await page.evaluate(()=>window.captured[0].payload.source_text),'Exact source');
  assert.equal(await save.evaluate(el=>getComputedStyle(el).opacity),'1');
  assert.equal((await page.locator('[role=group]').boundingBox()).height,native.height);
  await page.locator('article').evaluate(el=>{el.querySelector('a').setAttribute('href','/ada/status/2000000000000000002');el.querySelector('[data-testid=tweetText]').textContent='Recycled source';});
  await page.waitForFunction(()=>document.querySelector('x-master-controls')?.dataset.post.endsWith('000000002'));
  assert.equal(await page.locator('x-master-controls').count(),1);await save.click();
  assert.equal(await page.evaluate(()=>window.captured.at(-1).payload.source_text),'Recycled source');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{await page.close();}
});

test('reference capture rejects a missing or non-post target even with a populated timeline', async () => {
  const markup = article('<div data-testid="tweetText">Unrelated first post</div>');
  assert.equal(await capture(markup, '#outside'), null);
  assert.equal(await capture(markup, '#missing'), null);
});

test('captures the clicked post, its canonical URL, author identity, date and complete text', async () => {
  const first = article('<div data-testid="tweetText">Wrong first post</div>', 'first');
  const selected = article('<div data-testid="tweetText">Useful source\nSecond line</div>', 'selected')
    .replaceAll('2000000000000000001', '2000000000000000002');
  const result = await capture(first + selected, '#save-selected');
  assert.equal(result.source_url, 'https://x.com/ada/status/2000000000000000002');
  assert.equal(result.source_text, 'Useful source\nSecond line');
  assert.equal(result.author_name, 'Ada Example');
  assert.equal(result.author_handle, 'ada');
  assert.equal(result.author_avatar_url, 'https://pbs.twimg.com/profile_images/123/avatar_normal.jpg');
  assert.equal(result.published_at, '2026-09-04T12:00:00.000Z');
  assert.equal(result.complete, true);
  assert.deepEqual(result.attachments, []);
});

test('image-only posts remain valid references and preserve attachment order without capturing avatars', async () => {
  const result = await capture(article(image('firstImage') + image('secondImage')), '#secondImage');
  assert.equal(result.source_text, '');
  assert.equal(result.complete, true);
  assert.equal(result.attachments.length, 2);
  assert.deepEqual(result.attachments.map(({ kind, position }) => ({ kind, position })), [
    { kind: 'image', position: 0 }, { kind: 'image', position: 1 },
  ]);
  assert.match(result.attachments[0].source_url, /^https:\/\/pbs\.twimg\.com\/media\/firstImage\?/);
  assert.match(result.attachments[1].source_url, /^https:\/\/pbs\.twimg\.com\/media\/secondImage\?/);
});

test('a quote card cannot replace outer post identity, text or attachments', async () => {
  const quote = `<div role="link" tabindex="0" data-testid="quoteTweet">
    ${profile('Quoted Person', 'quoted')}${permalink('quoted', '1999999999999999999')}
    <div data-testid="tweetText">Quoted text is not outer text</div>${image('quotedImage')}
  </div>`;
  const markup = `<article data-testid="tweet" id="post">${quote}${profile()}${permalink()}
    <div data-testid="tweetText">My commentary</div>${image('outerImage')}<button id="save">Save</button></article>`;
  const result = await capture(markup, '#save');
  assert.equal(result.source_url, 'https://x.com/ada/status/2000000000000000001');
  assert.equal(result.source_text, 'My commentary');
  assert.equal(result.author_handle, 'ada');
  assert.equal(result.attachments.length, 1);
  assert.match(result.attachments[0].source_url, /\/outerImage\?/);
});

test('quoted content is excluded when X marks its card only as a link container', async () => {
  const quote = `<div role="link" tabindex="0">${profile('Quoted Person', 'quoted')}${permalink('quoted', '1999999999999999999')}
    <div data-testid="tweetText">Quote body</div>${image('quotedImage')}</div>`;
  const result = await capture(article(`<div data-testid="tweetText">Outer commentary</div>${quote}${image('ownImage')}`), '#save-post');
  assert.equal(result.source_text, 'Outer commentary');
  assert.equal(result.attachments.length, 1);
  assert.match(result.attachments[0].source_url, /\/ownImage\?/);
});

test('truncated text is explicitly marked incomplete instead of silently treated as the full post', async () => {
  const result = await capture(article('<div data-testid="tweetText">Visible preview…</div><button data-testid="tweet-text-show-more-link">Show more</button>'), '#save-post');
  assert.equal(result.source_text, 'Visible preview…');
  assert.equal(result.complete, false);
});

test('video references keep a real poster but never claim a temporary blob URL is downloadable', async () => {
  const result = await capture(article('<div data-testid="tweetText">A video reference</div><div data-testid="videoPlayer"><video src="blob:https://x.com/temporary" poster="https://pbs.twimg.com/amplify_video_thumb/123/poster.jpg"></video></div>'), '#save-post');
  assert.equal(result.attachments.length, 1);
  assert.equal(result.attachments[0].kind, 'video');
  assert.equal(result.attachments[0].position, 0);
  assert.equal(result.attachments[0].preview_url, 'https://pbs.twimg.com/amplify_video_thumb/123/poster.jpg');
  assert.ok(!result.attachments[0].source_url?.startsWith('blob:'));
});

test('a malformed post without its own status permalink cannot fall back to the current timeline URL', async () => {
  const markup = `<article data-testid="tweet">${profile()}<div data-testid="tweetText">No identity</div><button id="save">Save</button></article>`;
  assert.equal(await capture(markup, '#save'), null);
});
