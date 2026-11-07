import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://pbs.twimg.com/**", async (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/x-radar?**", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      schema_version: 4,
      mode: "x_only_radar",
      generated_at: "2026-09-02T18:00:00.000Z",
      refresh_after_seconds: 60,
      query: { keywords: ["ai", "agents", "codex"], country: "CA" },
      watched_handles: ["@OpenAI", "@AnthropicAI", "@GoogleDeepMind", "@Alibaba_Qwen", "@theo", "@karpathy", "@rasmic", "@swyx", "@simonw", "@rauchg", "@nutlope", "@jxnlco", "@levelsio", "@evanyou", "@addyosmani", "@kentcdodds", "@wesbos", "@mitsuhiko", "@sh_reya", "@chipro", "@HamelHusain"],
      sources: {
        posts: { status: "live", label: "X public watched timelines", item_count: 1 },
        trends: { status: "live", label: "XTapDown topic board", item_count: 2 },
        discovery: { status: "live", label: "Mentions inside tracked posts", item_count: 1 },
        personalization: { status: "disconnected", label: "X account personalization", item_count: 0 },
      },
      score_method: {
        name: "X virality potential v3",
        weights: { velocity: 30, acceleration: 20, engagement: 15, creator_lift: 15, recency: 10, niche_relevance: 10 },
        limitation: "Potential is a ranking, not a guarantee.",
      },
      items: [{
        id: "x-123456",
        rank: 1,
        title: "Codex agents can now review long-running work",
        body: "Codex agents can now review long-running work with @NewBuilder\n\nHere is the full post, shown directly in the radar.",
        published_at: "2026-09-02T17:45:00.000Z",
        topic: "AI coding",
        niche: "AI coding",
        source: "x",
        source_url: "https://x.com/OpenAI/status/123456",
        age_seconds: 900,
        creator: { username: "@OpenAI", display_name: "OpenAI", avatar_url: "https://pbs.twimg.com/profile_images/123/openai_normal.jpg" },
        media: [{ type: "photo", preview_url: "https://pbs.twimg.com/media/codex-card.jpg", alt_text: "Codex agent workflow diagram", width: 1600, height: 900 }],
        observed_metrics: { views: 140000, likes: 5200, reposts: 980, replies: 310 },
        score: { model_version: "x-virality-observable-v4", potential: 88, velocity: 91, acceleration: 82, engagement: 86, conversation_quality: 84, attention_quality: 72, evidence_depth: 100, creator_lift: 78, recency: 99, relevance: 100, label: "breakout", basis: "multi_snapshot_observed", confidence: "observed" },
        is_big_launch: true,
        is_growing_fast: true,
        launch_kind: "feature",
        score_reasons: ["4.0× feed velocity", "Acceleration increasing", "Strong niche match"],
        triage: { priority_score: 100, tier: "act_now" },
        growth: { rate_per_hour: 8400, baseline_rate_per_hour: 2100, baseline_multiplier: 4, creator_baseline_rate_per_hour: 1800, creator_baseline_multiplier: 4.7, basis: "multi_snapshot_observed", state: "observed" },
      }, {
        id: "x-654321",
        rank: 2,
        title: "A practical TypeScript architecture note",
        body: "A practical TypeScript architecture note for everyday projects.",
        published_at: "2026-09-02T16:45:00.000Z",
        topic: "Creator watch",
        niche: "Coding creators",
        source: "x",
        source_url: "https://x.com/theo/status/654321",
        age_seconds: 4500,
        creator: { username: "@theo", display_name: "Theo" },
        observed_metrics: { views: 14000, likes: 260, reposts: 18, replies: 22 },
        score: { potential: 54, velocity: 48, acceleration: 40, engagement: 52, creator_lift: 50, recency: 96, relevance: 100, label: "watching", basis: "single_snapshot_estimate", confidence: "estimated" },
        is_big_launch: false,
        is_growing_fast: false,
        score_reasons: ["Strong niche match"],
        triage: { priority_score: 44, tier: "background" },
        growth: { rate_per_hour: 260, baseline_rate_per_hour: 2100, baseline_multiplier: 0.1, creator_baseline_rate_per_hour: 260, creator_baseline_multiplier: 1, basis: "single_snapshot_estimate", state: "watch" },
      }, {
        id: "x-777777",
        rank: 3,
        title: "Trying Gemini for a few days",
        body: "Trying Gemini for a few days to see how it changes my coding workflow.",
        published_at: "2026-09-02T17:58:00.000Z",
        topic: "Creator watch",
        niche: "Coding creators",
        source: "x",
        source_url: "https://x.com/theo/status/777777",
        age_seconds: 120,
        creator: { username: "@theo", display_name: "Theo" },
        observed_metrics: { views: 1000, likes: 40, reposts: 2, replies: 4 },
        score: { potential: 50, velocity: 44, acceleration: 40, engagement: 55, creator_lift: 50, recency: 100, relevance: 0, label: "watching", basis: "single_snapshot_estimate", confidence: "estimated" },
        is_big_launch: false,
        is_growing_fast: false,
        score_reasons: ["Fresh post from a watched creator"],
        triage: { priority_score: 40, tier: "background" },
        growth: { rate_per_hour: 100, baseline_rate_per_hour: 200, baseline_multiplier: 0.5, creator_baseline_rate_per_hour: 80, creator_baseline_multiplier: 1.25, basis: "single_snapshot_estimate", state: "watch" },
      }, {
        id: "x-888888",
        rank: 4,
        title: "OpenAI ships a new developer platform update",
        body: "OpenAI ships a new developer platform update for agent builders.",
        published_at: "2026-09-02T17:50:00.000Z",
        topic: "Models & launches",
        niche: "Models & launches",
        source: "x",
        source_url: "https://x.com/sama/status/888888",
        age_seconds: 600,
        creator: { username: "@sama", display_name: "Sam Altman", category: "executive", organization: "OpenAI" },
        observed_metrics: { views: 90000, likes: 3200, reposts: 420, replies: 230 },
        score: { potential: 82, velocity: 85, acceleration: 72, engagement: 76, creator_lift: 70, recency: 99, relevance: 100, label: "rising_fast", basis: "multi_snapshot_observed", confidence: "observed" },
        is_big_launch: true,
        is_growing_fast: true,
        launch_kind: "feature",
        score_reasons: ["Founder launch post"],
        triage: { priority_score: 90, tier: "act_now" },
        growth: { rate_per_hour: 5200, baseline_rate_per_hour: 1700, baseline_multiplier: 3.1, creator_baseline_rate_per_hour: 1500, creator_baseline_multiplier: 3.5, basis: "multi_snapshot_observed", state: "observed" },
      }],
      trends: [
        { rank: 1, name: "AI Agents", query: "AI%20Agents", url: "https://x.com/search?q=AI%20Agents&src=trend_click&vertical=trends", is_hashtag: false },
        { rank: 22, name: "#Canada", query: "%23Canada", url: "https://x.com/search?q=%23Canada&src=trend_click&vertical=trends", is_hashtag: true },
      ],
      creators: [{ username: "@NewBuilder", display_name: "@NewBuilder", profile_url: "https://x.com/NewBuilder", discovery_score: 79, source_post_count: 1, mention_count: 1, top_post_url: "https://x.com/OpenAI/status/123456", top_post_title: "Codex agents can now review long-running work", status: "breakout", discovery_basis: "mentioned_by_tracked_creators" }],
      storylines: [{ id: "codex", title: "Codex", lifecycle: "breaking", momentum: 88, post_count: 1, unique_creators: 1, post_ids: ["x-123456"], top_post_url: "https://x.com/OpenAI/status/123456", evidence_basis: "clustered_tracked_posts" }],
      briefing: [{ id: "story-codex", title: "Codex agents can now review long-running work", phase: "breaking", momentum: 88, post_count: 1, unique_creators: 1, post_ids: ["x-123456"], top_post_url: "https://x.com/OpenAI/status/123456", latest_age_seconds: 900, reasons: ["Major launch evidence", "Observed acceleration"], personalized: false, trend_rank: 1 }],
      personalization: { configured: false, authenticated: false, basis: "niche_and_curated_creators" },
    }),
  }));
});

test.beforeEach(async ({page}) => {
  await page.route('**/api/x-master/auth', r => r.fulfill({json:{user:null}}));
  await page.route('**/api/x-radar/automation', r => r.fulfill({status:503,json:{error:'Unavailable'}}));
});

test('simple feed, direct replies, save persistence and history', async ({page}, info) => {
  await page.setViewportSize({width:info.project.name.includes('mobile')?375:1440,height:1000});
  const errors:string[]=[]; page.on('pageerror', error=>errors.push(error.message));
  await page.goto('/x-master');
  const nav=page.getByRole('navigation',{name:'Media source'});
  await expect(nav.getByRole('link')).toHaveText(['Media','Tweets','Reddit','Folders','Feed','Trending','Saved','Drafts']);
  await expect(page.getByRole('heading',{name:'Posts',exact:true})).toBeVisible();
  const post=page.locator('#signal-x-123456');
  await expect(post).toBeVisible();
  await expect(post.getByRole('link',{name:'Reply',exact:true})).toHaveAttribute('href',/in_reply_to=123456/);
  await expect(post.getByRole('link',{name:'Quote',exact:true})).toBeHidden();
  await post.getByText('More',{exact:true}).click();
  await expect(post.getByRole('link',{name:'Quote',exact:true})).toBeVisible();
  await post.getByText('More',{exact:true}).click();
  await page.getByRole('searchbox',{name:'Search posts'}).fill('long-running');
  await expect(page.locator('[id^="signal-"]')).toHaveCount(1);
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();
  await page.getByRole('combobox',{name:'Sort posts',exact:true}).selectOption('priority');
  await post.getByRole('button',{name:'Save',exact:true}).click();
  await expect(post.getByRole('button',{name:'Saved',exact:true})).toBeVisible();
  await nav.getByRole('link',{name:'Saved',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Saved posts',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByText('Codex agents can now review long-running work with @NewBuilder',{exact:false}).first()).toBeVisible();
  await nav.getByRole('link',{name:'Feed',exact:true}).click();
  await page.goBack();
  await expect(page.getByRole('heading',{name:'Saved',exact:true})).toBeVisible();
  await nav.getByRole('link',{name:'Feed',exact:true}).click();
  await expect(post).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('simple-posts.png'),fullPage:true});
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('draft list reveals editing only on request and keeps edits',async({page},info)=>{
  await page.goto('/x-master?view=drafts');
  await expect(page.getByRole('textbox',{name:'New tweet draft'})).toBeHidden();
  await expect(page.getByRole('heading',{name:'Meme library',exact:true})).toBeHidden();
  await page.getByRole('button',{name:'New draft',exact:true}).click();
  await page.getByRole('textbox',{name:'New tweet draft'}).fill('A simple draft to keep.');
  await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'New tweet draft'})).toBeHidden();
  await page.locator('summary').filter({hasText:'A simple draft to keep.'}).click();
  await page.getByRole('textbox',{name:'Edit draft: A simple draft to keep.',exact:true}).fill('Edited draft stays saved.');
  await page.getByRole('heading',{name:'Drafts',exact:true}).click();
  await page.reload();
  await expect(page.locator('summary').filter({hasText:'Edited draft stays saved.'})).toBeVisible();
  await page.screenshot({path:info.outputPath('simple-drafts.png'),fullPage:true});
});

test('extra tools stay in Settings and legacy routes still open',async({page})=>{
  await page.goto('/x-radar');
  await expect(page.getByRole('heading',{name:'Posts',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Open settings'}).click();
  const dialog=page.getByRole('dialog',{name:'Settings'});
  await expect(dialog.getByRole('button',{name:'Analytics',exact:true})).toBeHidden();
  await dialog.getByText('Extra tools',{exact:true}).click();
  await dialog.getByRole('button',{name:'Writing style',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Teach X Master how you sound'})).toBeVisible();
  await page.goto('/x-radar?view=brief');
  await expect(page.getByRole('heading',{name:'Do next',exact:true})).toBeVisible();
});

test('empty and failed feeds recover without clutter',async({page})=>{
  await page.route('**/api/x-radar?**',r=>r.fulfill({status:503,json:{error:'Temporarily unavailable'}}));
  await page.goto('/x-master');
  await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Media source'})).toBeVisible();
  await page.unroute('**/api/x-radar?**');
});
