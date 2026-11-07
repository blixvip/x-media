import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 45_000, workers: 3,
  use: { baseURL: process.env.X_MEDIA_TEST_URL || 'http://127.0.0.1:4330', serviceWorkers:'block', trace:'retain-on-failure' },
  projects: [
    { name:'desktop-chromium',use:{...devices['Desktop Chrome']} },
    { name:'mobile-chromium',use:{...devices['Pixel 7']} },
  ],
});
