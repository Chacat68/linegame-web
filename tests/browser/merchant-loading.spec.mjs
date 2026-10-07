import { test, expect } from '@playwright/test';

const sizes = [
  { width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 360, height: 640 },
  { width: 320, height: 568 }, { width: 844, height: 390 }, { width: 720, height: 320 },
];

async function expectFullscreenLoader(page, selector) {
  const root = page.locator(selector);
  await expect(root).toBeVisible();
  const layout = await root.evaluate(node => {
    const panel = node.querySelector('.startup-loader__panel');
    const rootRect = node.getBoundingClientRect(), panelRect = panel.getBoundingClientRect();
    const box = rect => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    const visible = Array.from(panel.querySelectorAll('h1,h2,p,button,.startup-loader__progress,.startup-loader__meta'))
      .filter(element => element.getClientRects().length);
    return {
      viewport: { width: innerWidth, height: innerHeight }, root: box(rootRect), panel: box(panelRect),
      overflow: { rootX: node.scrollWidth - node.clientWidth, rootY: node.scrollHeight - node.clientHeight,
        panelX: panel.scrollWidth - panel.clientWidth, panelY: panel.scrollHeight - panel.clientHeight },
      panelOverflow: getComputedStyle(panel).overflowY,
      coversEdges: [[2, 2], [innerWidth - 2, 2], [2, innerHeight - 2], [innerWidth - 2, innerHeight - 2]]
        .map(([x, y]) => node.contains(document.elementFromPoint(x, y))),
      elements: visible.map(element => ({ name: element.textContent?.trim(), ...box(element.getBoundingClientRect()) })),
    };
  });
  expect(layout.root.x).toBeCloseTo(0, 0); expect(layout.root.y).toBeCloseTo(0, 0);
  expect(layout.root.width).toBeCloseTo(layout.viewport.width, 0);
  expect(layout.root.height).toBeCloseTo(layout.viewport.height, 0);
  for (const overflow of Object.values(layout.overflow)) expect(overflow).toBeLessThanOrEqual(1);
  expect(layout.panelOverflow).toBe('visible');
  expect(layout.coversEdges).toEqual([true, true, true, true]);
  for (const element of [layout.panel, ...layout.elements]) {
    expect(element.x, element.name).toBeGreaterThanOrEqual(0);
    expect(element.y, element.name).toBeGreaterThanOrEqual(0);
    expect(element.x + element.width, element.name).toBeLessThanOrEqual(layout.viewport.width + 1);
    expect(element.y + element.height, element.name).toBeLessThanOrEqual(layout.viewport.height + 1);
  }
}

test('启动Loading铺满视口，横竖屏和短窗口均无内部滚动，加载后正常退场', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  // 先只加载原生 HTML/CSS 首屏；入口请求完成后 WebKit 才能稳定截图。
  // 验收布局后重新加载真正的入口，检查实际启动与 Loading 退场。
  const entry = /\/(?:js\/main\.js|assets\/index-[^/]+\.js)(?:\?.*)?$/;
  await page.route(entry, route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.goto('/');
  await expect(page.locator('#startup-loader')).toHaveCSS('display', 'grid');
  for (const size of sizes) {
    await page.setViewportSize(size);
    await expectFullscreenLoader(page, '#startup-loader');
    if (size.width === 390 || size.height === 320 || size.width === 1280) {
      await page.screenshot({ path: testInfo.outputPath(`启动Loading-${size.width}x${size.height}.png`), animations: 'disabled' });
    }
  }
  await page.unroute(entry);
  await page.reload();
  await expect(page.locator('#startup-loader')).toBeHidden();
  await expect(page.locator('#merchant-task-workspace')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Loading存档恢复与确认操作适配短屏，按钮可见且保留焦点与原档', async ({ page }, testInfo) => {
  const original = JSON.stringify({ meta: { schemaVersion: 999 }, data: {} });
  await page.addInitScript(raw => localStorage.setItem('startrader_save_0', raw), original);
  await page.goto('/');
  await expect(page.locator('#startup-loader')).toHaveAttribute('aria-label', '存档恢复');
  for (const size of sizes) {
    await page.setViewportSize(size);
    await expectFullscreenLoader(page, '#startup-loader');
    await page.locator('#startup-loader-restart').click();
    await expect(page.locator('#startup-loader-cancel')).toBeFocused();
    await expectFullscreenLoader(page, '#startup-loader');
    if (size.height === 320 || size.width === 390) {
      await page.screenshot({ path: testInfo.outputPath(`Loading恢复-${size.width}x${size.height}.png`), animations: 'disabled' });
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('#startup-loader-confirm')).toBeHidden();
    await expect(page.locator('#startup-loader-restart')).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem('startrader_save_0'))).toBe(original);
  }
  await page.locator('#startup-loader-restart').click();
  await page.locator('#startup-loader-confirm-restart').click();
  await expect(page.locator('#startup-loader')).toBeHidden();
  await expect(page.locator('#merchant-task-workspace')).toBeVisible();
});

test('星图Loading与失败提示使用全屏布局，短屏无内部滚动且可返回经营', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let release; const held = new Promise(resolve => { release = resolve; });
  // 保留实际经营页面和场景控制器，同时覆盖开发入口与生产包的延迟模块路径。
  const rendererModule = /\/(?:js\/ui\/RendererThreeStarmap\.js|assets\/(?:RendererThreeStarmap|three-core|three-webgl)-[^/]+\.js)(?:\?.*)?$/;
  await page.route(rendererModule, async route => {
    await held; await route.abort('failed');
  });
  await page.goto('/');
  await expect(page.locator('#startup-loader')).toBeHidden();
  const skip = page.locator('[data-onboarding-action="skip"]');
  if (await skip.isVisible()) await skip.click();
  const loader = page.locator('.merchant-scene-loader');
  try {
    await page.locator('#bottom-nav [data-view="starmap"]').click();
    await expect(loader).toHaveAttribute('aria-busy', 'true');
    for (const size of sizes) {
      await page.setViewportSize(size); await expectFullscreenLoader(page, '.merchant-scene-loader');
      if (size.width === 390 || size.height === 320) await page.screenshot({ path: testInfo.outputPath(`星图Loading-${size.width}x${size.height}.png`), animations: 'disabled' });
    }
    await loader.locator('[data-scene-return]').click();
    await expect(loader).toBeHidden();
    await expect(page.locator('body')).toHaveAttribute('data-active-view', 'tasks');
    await page.locator('#bottom-nav [data-view="starmap"]').click();
  } finally { release(); }
  await expect(loader).toHaveAttribute('aria-label', '星图加载失败');
  for (const size of sizes) {
    await page.setViewportSize(size); await expectFullscreenLoader(page, '.merchant-scene-loader');
  }
  await expect(loader.locator('[data-scene-retry]')).toBeEnabled();
  await loader.locator('[data-scene-return]').click();
  await expect(loader).toBeHidden();
  expect(errors).toEqual([]);
});
