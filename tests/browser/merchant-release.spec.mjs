import { test, expect } from '@playwright/test';
import { createInitialState, createSaveMeta } from '../../js/data/constants.js';
import { MERCHANT_TECHS } from '../../js/data/merchant.js';
import { init as initializeMerchant } from '../../js/systems/merchant/MerchantSystem.js';

async function openTools(page) {
  await page.locator('#company-tools summary').click();
  await page.locator('[data-company-action="settings"]').click();
}

// 测试档只在 Node 中生成，经玩家可见的导入与读档操作进入独立测试上下文。
async function importFixture(page, { level = 1, credits = 12000, legacyPort = false, legacyTech = false, legacyWaiting = false } = {}, slot = 1) {
  const state = createInitialState({ companyName: '浏览器验收商队', credits });
  initializeMerchant(state);
  // 通用经营验收不重播新手流程，专用新局场景使用浏览器的真实初始状态。
  state.merchant.onboarding = { step: 5, skipped: false };
  state.merchant.companyLevel = level;
  if (legacyPort) state.merchant.unlockedPorts.push('nebula_forge');
  if (legacyTech) state.merchant.researchedTechIds.push('fast_navigation');
  if (legacyWaiting) {
    // 旧版等待任务经正常导入恢复，由下一运行 tick 决定解除派遣。
    state.credits -= 220;
    state.merchant.markets.sol_prime.supply.food = 0;
    state.merchant.nextId = 3;
    state.merchant.tasks = [{
      id: 'task-2', from: 'sol_prime', to: 'mineral_belt', goodId: 'food',
      shipIds: ['ship-1'], budget: 220, available: 220, rounds: 0, profit: 0,
      recent: [], pending: null, stopping: false, createdAt: state.merchant.lastTickAt,
    }];
    Object.assign(state.merchant.ships[0], {
      taskId: 'task-2', phase: 'waiting', waitReason: '出发港暂时无货，等待供货恢复。',
    });
  }
  const raw = JSON.stringify({ meta: createSaveMeta(slot, state), data: state });
  await openTools(page);
  await page.locator('[data-tool="tab"][data-tab="saves"]').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator(`[data-tool="import"][data-slot="${slot}"]`).click(),
  ]);
  await chooser.setFiles({ name: 'merchant-test.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await expect(page.locator('#merchant-tools-status')).toContainText('导入成功');
  await page.locator(`[data-tool="load"][data-slot="${slot}"]`).click();
  await page.locator('[data-tool="confirm-yes"]').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await expect(page.locator('#company-name-display')).toContainText(state.companyName);
}

async function expectNavigation(page, expanded) {
  const navigation = page.locator('#bottom-nav [data-view]:visible');
  await expect(navigation).toHaveCount(expanded ? 5 : 3);
  await expect(navigation.nth(expanded ? 2 : 1)).toHaveAttribute('data-view', 'starmap');
  for (const view of ['ships', 'market']) {
    if (expanded) await expect(page.locator(`#bottom-nav [data-view="${view}"]`)).toBeVisible();
    else await expect(page.locator(`#bottom-nav [data-view="${view}"]`)).toBeHidden();
  }
}

// 在实际页面中比较材质，防止清理共用规则后部分容器回落到旧蓝绿色。
async function expectPanelMaterial(page, selector) {
  const material = await page.locator('#merchant-resource-bar').evaluate(element => getComputedStyle(element).backgroundImage);
  await expect(page.locator(selector)).toHaveCSS('background-image', material);
}

async function expectButtonMaterial(page, selector) {
  const material = await page.locator('#bottom-nav .bottom-nav-btn:not(.active)').first().evaluate(element => getComputedStyle(element).backgroundImage);
  await expect(page.locator(selector)).toHaveCSS('background-image', material);
}

async function expectPrimaryButtonMaterial(page, selector) {
  const accent = await page.locator('#bottom-nav .bottom-nav-btn.active').evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundImage, color: style.color };
  });
  await expect(page.locator(selector).first()).toHaveCSS('background-image', accent.background);
  await expect(page.locator(selector).first()).toHaveCSS('color', accent.color);
}

async function expectButtonState(button, state) {
  await expect(button).toHaveAttribute('data-button-state', state);
  if (state === 'ready' || state === 'danger') await expect(button).toBeEnabled();
  else await expect(button).toBeDisabled();
}

test.beforeEach(async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('#startup-loader')).toBeHidden();
  if (!testInfo.title.startsWith('新局软引导')) {
    const intro = page.locator('#merchant-onboarding-intro');
    await expect(intro).toBeVisible();
    await intro.locator('[data-onboarding-action="skip"]').click();
    await expect(intro).toBeHidden();
  }
});

test('新局软引导、初始商圈、派遣、独立航次与返港停用', async ({ page }) => {
  test.setTimeout(90000);
  const intro = page.locator('#merchant-onboarding-intro');
  const hint = page.locator('#merchant-onboarding-hint');
  await expect(intro).toBeVisible();
  await expect(page.locator('#credits')).toHaveText('1,000');
  await intro.locator('[data-onboarding-action="start"]').click();
  await expect(intro).toBeHidden();
  await expect(hint).toBeVisible();
  await expect(hint.locator('h2')).toHaveText('安排第一条商路');
  await expectPanelMaterial(page, '.merchant-operations');
  await expectPanelMaterial(page, '.merchant-detail-bay');
  await expect(page.locator('[data-merchant-action="map"]')).toHaveCount(0);
  await expectPanelMaterial(page, '#merchant-company-growth');
  await expectPrimaryButtonMaterial(page, '[data-merchant-action="new"]');
  await expectButtonState(page.locator('[data-merchant-action="upgrade-company"]'), 'blocked');
  await page.locator('[data-merchant-action="new"]').first().click();
  await expect(hint.locator('h2')).toHaveText('配船，留出周转货本');
  await expectPanelMaterial(page, '#merchant-form-panel');
  await expectButtonMaterial(page, '.merchant-form-head button');
  const form = page.locator('#merchant-form');
  const submit = form.getByRole('button', { name: '确认派遣' });
  await form.locator('[name="shipIds"]').check();
  await form.locator('[name="budget"]').fill('0');
  await expectButtonState(submit, 'blocked');
  await form.locator('[name="budget"]').fill('220');
  await expectButtonState(submit, 'ready');
  await submit.click();
  await expect(page.locator('#merchant-task-list [data-merchant-action="select-task"]')).toHaveCount(1);
  await expect(hint.locator('h2')).toHaveText('让商队完成第一趟');
  await page.locator('#bottom-nav [data-view="reports"]').click();
  const toggle = page.locator('.merchant-report-toggle');
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.merchant-report-row').first()).toBeVisible({ timeout: 40000 });
  await expect(hint.locator('h2')).toHaveText('用利润壮大公司');
  await page.locator('#bottom-nav [data-view="tasks"]').click();
  const stop = page.locator('[data-merchant-action="stop"]');
  if (await page.locator('#merchant-task-list [data-merchant-action="select-task"]').count()) {
    // 市场已经耗尽时任务会自动返港；尚可经营时仍可手动停止。
    if (await stop.getAttribute('data-button-state') === 'danger') {
      await expectButtonState(stop, 'danger');
      await stop.click();
    }
  }
  // 没有在途航次时会立即结束；仍有航次时必须禁用重复停止与调整操作。
  if (await page.locator('#merchant-task-list [data-merchant-action="select-task"]').count()) {
    await expectButtonState(stop, 'pending');
    await expectButtonState(page.locator('[data-merchant-action="edit"]'), 'pending');
  }
  await expect(page.locator('#merchant-task-list [data-merchant-action="select-task"]')).toHaveCount(0, { timeout: 40000 });
  await hint.locator('[data-onboarding-action="finish"]').click();
  await expect(hint).toBeHidden();
  await page.reload();
  await expect(page.locator('#startup-loader')).toBeHidden();
  await expect(intro).toBeHidden();
  await expect(hint).toBeHidden();
  await page.locator('[data-merchant-action="new"]').first().click();
  await expect(page.locator('#merchant-ship-picks [name="shipIds"]')).toHaveCount(1);
  await expect(page.locator('#merchant-ship-picks [name="shipIds"]')).toBeEnabled();
});

test('批量购船、科技门槛、游戏内存档确认与刷新恢复', async ({ page }) => {
  await expectNavigation(page, false);
  await page.locator('[data-merchant-action="new"]').first().click();
  await page.locator('#merchant-form .merchant-inline-shipyard > summary').click();
  const quantity = page.locator('#merchant-form [data-merchant-quantity="courier"]');
  const buy = page.locator('[data-merchant-action="buy-in-form"][data-type="courier"]');
  const total = buy.locator('..').locator('[data-merchant-total]');
  await expect(total).toHaveText('336 CR');
  await quantity.fill('0');
  await expectButtonState(buy, 'blocked');
  const blockedMaterial = await buy.evaluate(element => getComputedStyle(element).backgroundImage);
  await quantity.fill('4');
  await expectButtonState(buy, 'blocked');
  await expect(buy.locator('..')).toContainText('仅剩 3 个船位');
  await quantity.fill('2');
  await expect(total).toHaveText('740 CR');
  await expectButtonState(buy, 'ready');
  expect(await buy.evaluate(element => getComputedStyle(element).backgroundImage)).not.toBe(blockedMaterial);
  await buy.click();
  await expect(page.locator('#merchant-ship-picks [name="shipIds"]')).toHaveCount(3);
  await expect(page.locator('#credits')).toHaveText('260');
  await expectButtonState(buy, 'blocked');
  await expect(buy.locator('..')).toContainText('仅剩 1 个船位');
  await quantity.fill('1');
  await expect(total).toHaveText('484 CR');
  await expectButtonState(buy, 'blocked');
  await expect(buy.locator('..')).toContainText('可用 CR 不足');
  await expect(page.locator('[data-merchant-action="buy-in-form"][data-type="swift"]')).toHaveCount(0);
  await page.getByRole('button', { name: '关闭派遣配置' }).click();
  await openTools(page);
  await expectPanelMaterial(page, '#settings-modal .modal-box');
  await page.locator('[data-tool="tab"][data-tab="saves"]').click();
  await expectButtonState(page.locator('[data-tool="load"][data-slot="1"]'), 'blocked');
  await page.locator('[data-tool="save"][data-slot="1"]').click();
  await expect(page.locator('#merchant-tools-status')).toContainText('存档成功');
  await expectButtonState(page.locator('[data-tool="load"][data-slot="1"]'), 'ready');
  await expectButtonState(page.locator('[data-tool="delete"][data-slot="1"]'), 'danger');
  await page.locator('[data-tool="load"][data-slot="1"]').click();
  await expect(page.locator('#merchant-tools-title')).toHaveText('确认操作');
  await expectButtonState(page.locator('[data-tool="confirm-yes"]'), 'ready');
  await page.locator('[data-tool="confirm-no"]').click();
  await expect(page.locator('#merchant-tools-title')).toHaveText('设置与存档');
  await page.locator('[data-tool="load"][data-slot="1"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-modal')).toBeHidden();
  await openTools(page);
  await page.locator('[data-tool="tab"][data-tab="saves"]').click();
  await page.locator('[data-tool="load"][data-slot="1"]').click();
  await page.locator('[data-tool="confirm-yes"]').click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await page.reload();
  await expect(page.locator('#startup-loader')).toBeHidden();
  await expectNavigation(page, false);
  await page.locator('[data-merchant-action="new"]').first().click();
  await expect(page.locator('#merchant-ship-picks [name="shipIds"]')).toHaveCount(3);
  await expect(page.locator('#credits')).toHaveText('260');
  await expect(page.locator('[data-merchant-procurement="courier"] [data-merchant-total]')).toHaveText('484 CR');
  await expectButtonState(page.locator('[data-merchant-action="buy-in-form"][data-type="courier"]'), 'blocked');
});

test('五页导航、星图无经营遮挡、镜头仅平移与资产完整', async ({ page }) => {
  await importFixture(page, { level: 2 });
  await expectNavigation(page, true);
  for (const view of ['ships', 'market', 'reports', 'tasks']) {
    await page.locator(`#bottom-nav [data-view="${view}"]`).click();
    await expect(page.locator('body')).toHaveAttribute('data-active-view', view);
    await expect(page.locator('.workspace-surface.is-active')).toHaveCount(1);
    if (view !== 'tasks') await expectPanelMaterial(page, '.workspace-surface.is-active .merchant-station-heading');
  }
  await page.locator('[data-merchant-action="new"]').first().click();
  await expect(page.locator('.merchant-inline-ship-row')).toHaveCount(3);
  await expect(page.locator('[data-merchant-action="buy-in-form"][data-type="swift"]')).toHaveCount(0);
  await page.getByRole('button', { name:'关闭派遣配置' }).click();
  await page.locator('#bottom-nav [data-view="ships"]').click();
  await expect(page.locator('#merchant-company-growth')).toBeHidden();
  await expect(page.locator('[data-merchant-action="map"]')).toHaveCount(0);
  await expect(page.locator('.merchant-shop-card')).toHaveCount(3);
  await expect(page.locator('#merchant-tech-section')).toBeHidden();
  await expect(page.locator('[data-merchant-action="research"]')).toHaveCount(0);
  await expect(page.locator('[data-merchant-shop-type="swift"]')).toHaveCount(0);
  await expect(page.locator('[data-merchant-shop-type="bulk"]')).toHaveCount(0);
  await expect(page.locator('[data-merchant-shop-type="relay"]')).toHaveCount(0);
  await page.locator('#bottom-nav [data-view="tasks"]').click();
  await page.locator('[data-merchant-action="new"]').first().click();
  await expect(page.locator('.merchant-inline-ship-row')).toHaveCount(3);
  await expect(page.locator('[data-merchant-action="buy-in-form"][data-type="swift"]')).toHaveCount(0);
  await page.getByRole('button', { name:'关闭派遣配置' }).click();
  await page.locator('#bottom-nav [data-view="starmap"]').click();
  await expect(page.locator('#merchant-resource-bar')).toBeVisible();
  await expect(page.locator('#map-3d-canvas')).toHaveCount(0);
  const canvas = page.locator('#starmap-three-canvas');
  await expect(canvas).toBeVisible({ timeout: 30000 });
  await expect(canvas).toHaveAttribute('data-renderer', 'three');
  await expect(page.locator('#map-section canvas:visible')).toHaveCount(1);
  await expect(page.locator('#map-section .merchant-map-panel')).toHaveCount(0);
  await expect(canvas).toHaveAttribute('data-pan-only', 'true');
  const height = await canvas.getAttribute('data-camera-height');
  const offset = await canvas.getAttribute('data-camera-offset');
  await page.mouse.move(180, 250);
  await page.mouse.wheel(0, 800);
  await expect(canvas).toHaveAttribute('data-camera-height', height);
  await expect(canvas).toHaveAttribute('data-camera-offset', offset);
  await expect(page.locator('img')).not.toHaveCount(0);
  const broken = await page.locator('img').evaluateAll(images => images.filter(image => image.complete && !image.naturalWidth).map(image => image.src));
  expect(broken).toEqual([]);
});

test('公司升级开放采购与研发，科技解锁船型，星图探索返港后开放新港', async ({ page }) => {
  test.setTimeout(200000);
  const fastNavigationCost = MERCHANT_TECHS.find(tech => tech.id === 'fast_navigation').cost;
  const startingCredits = 1800 + 4000 + fastNavigationCost + 3200;
  const cashText = amount => amount.toLocaleString('zh-CN');
  await importFixture(page, { credits: startingCredits });
  await expectNavigation(page, false);
  await expect(page.locator('.merchant-company-level')).toHaveText('Lv.1');
  await expect(page.locator('#credits')).toHaveText(cashText(startingCredits));
  await expectButtonState(page.locator('[data-merchant-action="upgrade-company"]'), 'ready');
  await page.locator('[data-merchant-action="upgrade-company"]').click();
  await expect(page.locator('.merchant-company-level')).toHaveText('Lv.2');
  await expect(page.locator('#credits')).toHaveText(cashText(startingCredits - 1800));
  await expectNavigation(page, true);
  await page.locator('#bottom-nav [data-view="ships"]').click();
  await expect(page.locator('#merchant-company-growth')).toBeHidden();
  await expect(page.locator('.merchant-shop-card')).toHaveCount(3);
  await expect(page.locator('#merchant-tech-section')).toBeHidden();
  await expect(page.locator('[data-merchant-shop-type="swift"]')).toHaveCount(0);
  await page.locator('#bottom-nav [data-view="tasks"]').click();
  await page.locator('[data-merchant-action="upgrade-company"]').click();
  await expect(page.locator('.merchant-company-level')).toHaveText('Lv.3');
  await expect(page.locator('#credits')).toHaveText(cashText(startingCredits - 1800 - 4000));
  await page.locator('#bottom-nav [data-view="ships"]').click();
  await expect(page.locator('#merchant-tech-section')).toBeVisible();
  await expect(page.locator('[data-merchant-action="research"]')).toHaveCount(1);
  await expect(page.locator('[data-merchant-shop-type="swift"]')).toHaveCount(0);
  const research = page.locator('[data-merchant-action="research"][data-tech="fast_navigation"]');
  await expect(research).toContainText(`${cashText(fastNavigationCost)} CR`);
  await expectButtonState(research, 'ready');
  const researchReadyMaterial = await research.evaluate(element => getComputedStyle(element).backgroundImage);
  await research.click();
  await expectButtonState(research, 'complete');
  expect(await research.evaluate(element => getComputedStyle(element).backgroundImage)).not.toBe(researchReadyMaterial);
  await expect(page.locator('#credits')).toHaveText('3,200');
  await expect(page.locator('.merchant-shop-card')).toHaveCount(4);
  await expect(page.locator('[data-merchant-shop-type="swift"]')).toBeVisible();
  await expect(page.locator('[data-merchant-shop-type="bulk"]')).toHaveCount(0);
  await expect(page.locator('[data-merchant-shop-type="relay"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#startup-loader')).toBeHidden();
  await expectNavigation(page, true);
  await page.locator('#bottom-nav [data-view="ships"]').click();
  await expect(page.locator('[data-merchant-shop-type="swift"]')).toBeVisible();
  await expectButtonState(page.locator('[data-merchant-action="research"][data-tech="fast_navigation"]'), 'complete');
  await page.locator('#bottom-nav [data-view="tasks"]').click();
  await page.locator('[data-merchant-action="new"]').first().click();
  await expect(page.locator('.merchant-inline-ship-row')).toHaveCount(4);
  await page.locator('#merchant-form .merchant-inline-shipyard > summary').click();
  await expect(page.locator('[data-merchant-action="buy-in-form"][data-type="swift"]')).toBeVisible();
  await page.getByRole('button', { name: '关闭派遣配置' }).click();
  await page.locator('#bottom-nav [data-view="market"]').click();
  await expect(page.locator('[data-merchant-action="route"][data-from="nebula_forge"]')).toHaveCount(0);
  await page.locator('#bottom-nav [data-view="starmap"]').click();
  await expect(page.locator('#starmap-three-canvas')).toBeVisible({ timeout: 30000 });
  await page.locator('.merchant-exploration-signal').click({ timeout: 90000 });
  const exploration = page.locator('#merchant-exploration-panel');
  await expect(exploration).toBeVisible();
  await expect(exploration.locator('[data-exploration-cost]')).toHaveText('360 CR');
  const explore = exploration.getByRole('button', { name: '派船探索' });
  await expectButtonState(explore, 'ready');
  await explore.click();
  await expect(page.locator('#credits')).toHaveText('2,840');
  await expect(exploration.locator('[data-exploration-stage]')).toContainText('探索去程');
  await expect(exploration).toContainText('探索船已返港待命', { timeout: 90000 });
  await expect(page.locator('#credits')).toHaveText('2,840');
  await exploration.getByRole('button', { name: '关闭探索详情' }).click();
  await page.locator('#bottom-nav [data-view="market"]').click();
  await expect(page.locator('[data-merchant-action="route"][data-from="nebula_forge"]')).not.toHaveCount(0);
  await page.reload();
  await expect(page.locator('#startup-loader')).toBeHidden();
  await expect(page.locator('#credits')).toHaveText('2,840');
  await page.locator('#bottom-nav [data-view="market"]').click();
  await expect(page.locator('[data-merchant-action="route"][data-from="nebula_forge"]')).not.toHaveCount(0);
});

test('旧商队保留已开放入口，无法继续的等待任务自动解除并留存原因', async ({ page }) => {
  for (const [index, legacy] of [{ legacyPort: true }, { legacyTech: true }].entries()) {
    await importFixture(page, legacy, index + 1);
    await expect(page.locator('.merchant-company-level')).toHaveText('Lv.1');
    await expectNavigation(page, true);
    await page.locator('#bottom-nav [data-view="ships"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-active-view', 'ships');
    await expect(page.locator('[data-merchant-shop-type="courier"]')).toBeVisible();
    await page.locator('#bottom-nav [data-view="market"]').click();
    await expect(page.locator('body')).toHaveAttribute('data-active-view', 'market');
    await page.locator('#bottom-nav [data-view="tasks"]').click();
  }
  await importFixture(page, { credits: 1000, legacyWaiting: true }, 3);
  await expectNavigation(page, false);
  await expect(page.locator('#credits')).toHaveText('1,000');
  await expect(page.locator('#merchant-task-list [data-merchant-action="select-task"]')).toHaveCount(0);
  await page.locator('[data-merchant-action="new"]').first().click();
  await expect(page.locator('#merchant-ship-picks [name="shipIds"]')).toBeEnabled();
  await page.getByRole('button', { name: '关闭派遣配置' }).click();
  await page.locator('#bottom-nav [data-view="reports"]').click();
  await page.locator('.merchant-report-toggle').click();
  const reason = page.locator('.merchant-report-details .merchant-wait-note');
  await expect(reason).toContainText('自动解除');
  await expect(reason).toContainText('已返港');
  await expect(reason).toContainText('无货');
  await expect(page.locator('.merchant-report-row')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#startup-loader')).toBeHidden();
  await expect(page.locator('#credits')).toHaveText('1,000');
  await expect(page.locator('#merchant-task-list [data-merchant-action="select-task"]')).toHaveCount(0);
  await page.locator('#bottom-nav [data-view="reports"]').click();
  await page.locator('.merchant-report-toggle').click();
  await expect(reason).toContainText('无货');
  await expect(page.locator('.merchant-report-row')).toHaveCount(0);
});
