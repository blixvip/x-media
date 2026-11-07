import { test, expect } from '@playwright/test';

test('shared header keeps every source reachable without overlap in both themes',async({page},info)=>{
  await page.setViewportSize({width:info.project.name.includes('mobile')?375:1280,height:900});
  await page.goto('/');
  const navigation=page.getByRole('navigation',{name:'Media source'});
  for(const name of ['Media','Tweets','Reddit','Folders','Feed','Trending','Saved','Drafts']) await expect(navigation.getByRole('link',{name,exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'X username'})).toBeVisible();
  await page.screenshot({path:info.outputPath('combined-home-dark.png')});
  await page.getByRole('button',{name:'Toggle color theme'}).click();
  await page.screenshot({path:info.outputPath('combined-home-light.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const bounds=await Promise.all([navigation,page.getByRole('link',{name:'X Media home'}),page.getByRole('button',{name:'Toggle color theme'})].map(item=>item.boundingBox()));
  for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){
    const a=bounds[i]!,b=bounds[j]!;
    expect(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)<=1||Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)<=1).toBe(true);
  }
  await navigation.getByRole('link',{name:'Feed',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Media source'})).toBeVisible();
  await page.getByRole('button',{name:'Open settings'}).click();
  await expect(page.getByRole('dialog',{name:'Settings',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('master-settings-light.png')});
  await page.getByRole('button',{name:'Close settings',exact:true}).click();
  await page.getByRole('navigation',{name:'Media source'}).getByRole('link',{name:'Drafts',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Drafts',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('master-drafts-light.png')});
});

test('Tweets save sends source and media to X Master and offers retry after failure',async({page})=>{
  const post={id:'123456789',authorId:'12345',username:'ada',text:'A useful post to keep.',createdAt:'2026-09-08T12:00:00Z',fetchedAt:'2026-09-08T12:00:00Z',likes:100,reposts:5,replies:2,views:1000,isReply:false,isQuote:false,hasMedia:false,characterCount:22,media:[]};
  const view={username:'ada',posts:[post],status:'ready',message:'Saved collection',profile:{id:'12345',username:'ada',name:'Ada',bio:'',followers:100},revision:1,runId:'r1',mode:'history',exhausted:false,recentCursors:[],pages:1,scanned:1,runPages:1,retries:0,updatedAt:post.createdAt,source:'timeline',historyComplete:false};
  await page.route('**/api/posts',r=>r.fulfill({json:r.request().method()==='GET'?{accounts:[{username:'ada',name:'Ada',count:1,status:'ready'}]}:view}));
  await page.route('**/api/posts?**',r=>r.fulfill({json:view}));
  let attempt=0;
  await page.route('**/api/x-master/references',async r=>{
    expect(r.request().postDataJSON()).toMatchObject({post_id:post.id,source_url:'https://x.com/ada/status/123456789',source_text:post.text});
    await r.fulfill(attempt++===0?{status:503,json:{error:'Library unavailable. Try again.'}}:{status:201,json:{item:{id:'ref-1'}}});
  });
  await page.goto('/posts?user=ada');
  const save=page.getByRole('button',{name:'Save to X Master',exact:true});
  await save.click();await expect(page.getByText('Library unavailable. Try again.')).toBeVisible();await save.click();
  await expect(page.getByRole('link',{name:'Saved to X Master'})).toHaveAttribute('href','/x-master?view=saved');
});
