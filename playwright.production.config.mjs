import config from './playwright.config.mjs';

// 正式包只执行通过玩家界面操作的用例，不依赖开发服务器的 /js 源码导入。
export default {
  ...config,
  testMatch: ['**/merchant-release.spec.mjs', '**/merchant-decisions.spec.mjs', '**/merchant-loading.spec.mjs'],
  testIgnore: [],
  outputDir: './test-results/production',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/production' }]],
  use: { ...config.use, baseURL: 'http://127.0.0.1:4178' },
  projects: [
    ...config.projects.map(project => ({ ...project, name: 'production-' + project.name })),
    { name: 'webkit-desktop', use: { browserName: 'webkit', viewport: { width: 1280, height: 800 }, launchOptions: { args: [] } } },
    { name: 'webkit-mobile', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, launchOptions: { args: [] } } },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4178 --strictPort',
    url: 'http://127.0.0.1:4178',
    reuseExistingServer: false,
    timeout: 30000,
  },
};
