import {test,expect} from '@playwright/test';
test('extension video shortcut opens the library with videos selected',async({page})=>{
 await page.route('**/api/x-master/auth',r=>r.fulfill({json:{configured:true,user:{id:'u',email:'test@example.com'},storage:true,media:true}}));
 await page.route('**/api/x-master/references?**',r=>r.fulfill({json:{items:[],total:0,collections:[],media_configured:true}}));
 const request=page.waitForRequest(r=>r.url().includes('/api/x-master/references?')&&new URL(r.url()).searchParams.get('kind')==='video');
 await page.goto('/x-master?view=saved&media=video');await request;
 await expect(page.getByRole('heading',{name:'Saved videos',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Videos',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('navigation',{name:'Media source'}).getByRole('link',{name:'Feed',exact:true}).click();
 await expect(page).not.toHaveURL(/media=video/);
});
test.beforeEach(async({page})=>{
 await page.route('**/api/x-radar?**',r=>r.fulfill({status:503,json:{error:'Unavailable'}}));
 await page.route('**/api/x-master/auth',r=>r.fulfill({json:{configured:false,user:null,storage:false,media:false}}));
});
test('reference setup is truthful and fits a narrow screen',async({page},info)=>{
 await page.setViewportSize({width:320,height:850});await page.goto('/x-master?view=saved');
 await expect(page.getByRole('heading',{name:'Reference library',exact:true})).toBeVisible();
 await expect(page.getByText('Cloud library needs setup', {exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Send sign-in code'})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(process.env.CAPTURE_REFERENCES){await page.screenshot({path:info.outputPath('library-320.png'),fullPage:true});await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:info.outputPath('library-1440.png'),fullPage:true});}
});
test('reference notes retain edits on conflict; media status never invents a backup',async({page},info)=>{
 const item={id:'ref-1',post_id:'2000000000000000001',source_url:'https://x.com/ada/status/2000000000000000001',author_name:'Ada Example',author_handle:'ada',source_text:'A useful reference.',complete:false,notes:'Original',tags:[],favourite:false,collection_id:null,revision:1,created_at:'2026-09-04T12:00:00Z',updated_at:'2026-09-04T12:00:00Z',deleted_at:null,attachments:[{id:'asset-1',kind:'video',position:0,state:'failed',error:'Video unavailable',attempts:3}]};
 await page.route('**/api/x-master/auth',r=>r.fulfill({json:{configured:true,user:{id:'u1',email:'test@example.com'},storage:true,media:true}}));
 await page.route('**/api/x-master/references?**',r=>r.fulfill({json:{items:[item],total:1,collections:[],media_configured:true}}));
 await page.route('**/api/x-master/references',r=>r.fulfill({status:409,json:{error:'This reference changed on another device. Your edit has not been overwritten.'}}));
 await page.goto('/x-master?view=saved');await page.getByRole('button',{name:'Open reference by Ada Example'}).click();
 await expect(page.getByText('Incomplete text — open the original for the full post.')).toBeVisible();
 await expect(page.getByText('Video unavailable',{exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'Your notes'}).fill('Keep my unsaved thought');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Your notes'})).toHaveValue('Keep my unsaved thought');
 await expect(page.getByText(/changed on another device/)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(process.env.CAPTURE_REFERENCES)await page.screenshot({path:info.outputPath('reference-details.png'),fullPage:true});
});

test('an open reference receives completed media without overwriting typed notes',async({page})=>{
 let complete=false;const item={id:'ref-live',source_url:'https://x.com/ada/status/123456',author_name:'Ada',author_handle:'ada',source_text:'Media arrives later',complete:true,notes:'',tags:[],favourite:false,collection_id:null,revision:1,created_at:'2026-09-04T12:00:00Z',attachments:[]};
 await page.route('**/api/x-master/auth',r=>r.fulfill({json:{configured:true,user:{id:'u',email:'test@example.com'},storage:true,media:true}}));
 await page.route('**/api/x-master/references?**',r=>r.fulfill({json:{items:[{...item,attachments:[{id:'asset-later',kind:'image',position:0,state:complete?'complete':'processing',bytes:500,mime:'image/png'}]}],total:1,collections:[],media_configured:true}}));
 await page.route('**/api/x-master/references/asset?**',r=>r.fulfill({status:404}));
 await page.goto('/x-master?view=saved');await page.getByRole('button',{name:'Open reference by Ada'}).click();
 await page.getByRole('textbox',{name:'Your notes'}).fill('Keep typing');await expect(page.getByText('Downloading media',{exact:true})).toBeVisible();
 complete=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByRole('link',{name:'Download image'})).toBeVisible();await expect(page.getByRole('textbox',{name:'Your notes'})).toHaveValue('Keep typing');
});
