import { defineConfig } from '@playwright/test';

// 独立端口与浏览器上下文，避免读写开发者日常游戏中的 localStorage。
export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.mjs',
  outputDir: './test-results/development',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/development' }]],
  use: {
    baseURL: 'http://127.0.0.1:4175',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--mute-audio', ...(process.platform === 'linux' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])] },
  },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', channel: process.env.LINEGAME_CHROMIUM_CHANNEL, viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { browserName: 'chromium', channel: process.env.LINEGAME_CHROMIUM_CHANNEL, viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
