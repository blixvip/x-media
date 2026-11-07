import { test, expect } from '@playwright/test';

test('Tweets, Saved, and a paired extension use the same persistent local library', async ({ page, request, baseURL }, info) => {
  const origin = new URL(baseURL!).origin;
  const headers = { origin };
  const identity = await request.get('/api/x-master/auth');
  expect(await identity.json()).toMatchObject({ local: true, user: { id: 'local' }, storage: true });
  const id = `${Date.now()}${info.workerIndex}`;
  const post = { id, authorId: '12345', username: 'mergecheck', text: `Merge verification ${id}`, createdAt: new Date().toISOString(), fetchedAt: new Date().toISOString(), likes: 10, reposts: 1, replies: 1, views: 100, isReply: false, isQuote: false, hasMedia: false, characterCount: 30, media: [] };
  const view = { username: 'mergecheck', posts: [post], status: 'ready', message: 'Saved collection', profile: { id: '12345', username: 'mergecheck', name: 'Merge check', bio: '', followers: 10 }, revision: 1, runId: id, mode: 'history', exhausted: false, recentCursors: [], pages: 1, scanned: 1, runPages: 1, retries: 0, updatedAt: post.createdAt, source: 'timeline', historyComplete: false };
  await page.route('**/api/posts', r => r.fulfill({ json: r.request().method() === 'GET' ? { accounts: [{ username: 'mergecheck', name: 'Merge check', count: 1, status: 'ready' }] } : view }));
  await page.route('**/api/posts?**', r => r.fulfill({ json: view }));
  await page.route('**/api/x-radar?**', r => r.fulfill({ status: 503, json: { error: 'No feed needed for this library check.' } }));
  let referenceId = '';
  let deviceId = '';
  try {
    await page.goto('/posts?user=mergecheck');
    await page.getByRole('button', { name: 'Save to X Master', exact: true }).click();
    await page.getByRole('link', { name: 'Saved to X Master' }).click();
    await expect(page.getByText('Saved on this computer', { exact: true })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search references' }).fill(post.text);
    await page.getByRole('button', { name: 'Open reference by mergecheck' }).click();
    await page.getByRole('textbox', { name: 'Your notes' }).fill('Kept across the combined app');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
    const saved = await (await request.get(`/api/x-master/references?q=${id}`)).json();
    expect(saved.items).toHaveLength(1);
    referenceId = saved.items[0].id;
    expect(saved.items[0].notes).toBe('Kept across the combined app');

    const pairing = await request.post('/api/x-master/extension/pair', { headers, data: { action: 'create' } });
    expect(pairing.status()).toBe(201);
    const { code } = await pairing.json();
    const extensionOrigin = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const claim = await request.post('/api/x-master/extension/pair', { headers: { origin: extensionOrigin }, data: { action: 'claim', code, label: `Merge verification ${id}` } });
    expect(claim.status()).toBe(201);
    const device = await claim.json();
    deviceId = device.device.id;
    const capture = await request.post('/api/x-master/references', { headers: { origin: extensionOrigin, authorization: `Bearer ${device.token}` }, data: { source_url: `https://x.com/mergecheck/status/${id}`, source_text: post.text, attachments: [], complete: true } });
    expect(capture.status()).toBe(201);
    expect((await capture.json()).item.id).toBe(referenceId);
    await page.reload();
    await page.getByRole('searchbox', { name: 'Search references' }).fill(post.text);
    await page.getByRole('button', { name: 'Open reference by mergecheck' }).click();
    await expect(page.getByRole('textbox', { name: 'Your notes' })).toHaveValue('Kept across the combined app');
    await page.screenshot({ path: info.outputPath('shared-local-library.png') });
  } finally {
    if (deviceId) await request.post('/api/x-master/extension/pair', { headers, data: { action: 'revoke', id: deviceId } });
    if (!referenceId) {
      const result = await (await request.get(`/api/x-master/references?q=${id}`)).json();
      referenceId = result.items?.[0]?.id;
    }
    if (referenceId) {
      const current = await (await request.get(`/api/x-master/references?id=${referenceId}`)).json();
      await request.patch('/api/x-master/references', { headers, data: { id: referenceId, revision: current.item.revision, trash: true } });
    }
  }
});
