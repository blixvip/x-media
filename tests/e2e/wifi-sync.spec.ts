import { test, expect } from '@playwright/test';

test('Wi-Fi pairing controls and offline originals fit narrow and wide screens', async ({ page }) => {
  let enabled = false;
  await page.route('**/api/wifi-sync*', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('action') === 'enable') enabled = true;
    if (url.searchParams.get('action') === 'disable') enabled = false;
    await route.fulfill({ json: { enabled, running: enabled, lastSync: null, items: [], total: 0, ready: 0, pairingCodes: enabled ? [`192.168.1.2:4331/${'a'.repeat(64)}/${'b'.repeat(64)}`] : [] } });
  });
  for (const width of [320, 1100]) {
    enabled = false;
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/sync');
    await expect(page.getByRole('heading', { name: 'Synced saves', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Enable Wi-Fi sync', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ready for your phone', exact: true })).toBeVisible();
    await page.getByText('Pairing code · 192.168.1.2:4331', { exact: true }).click();
    await expect(page.getByLabel('Paste this entire code into the phone app')).toHaveValue(`192.168.1.2:4331/${'a'.repeat(64)}/${'b'.repeat(64)}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/wifi-sync-pc-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Disable & unpair', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Enable Wi-Fi sync', exact: true })).toBeVisible();
  }
});
