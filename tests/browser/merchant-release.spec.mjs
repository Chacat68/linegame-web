import { getPendingTechChain } from '../../js/systems/merchant/MerchantTechnology.js';
import { test, expect } from '@playwright/test';
import { MERCHANT_TECHS, MERCHANT_COMPANY_LEVELS } from '../../js/data/merchant.js';
import { COMPANY_NAMES } from '../../js/data/companyNames.js';
import * as Merchant from '../../js/systems/merchant/MerchantSystem.js';
import { openTools, importFixture } from './helpers/merchantFixtures.mjs';
import { expectStoryPortrait } from './helpers/merchantStory.mjs';
const runtimeErrors = new WeakMap();

async function expectNavigation(page, expanded) {
  const navigation = page.locator('#bottom-nav [data-view]:visible');
  const views = Array.isArray(expanded) ? expanded : expanded ? ['tasks', 'ships', 'starmap', 'market', 'reports'] : ['tasks', 'starmap', 'reports'];
  await expect(navigation).toHaveCount(views.length);
  await expect(navigation.nth(views.indexOf('starmap'))).toHaveAttribute('data-view', 'starmap');
  for (const view of ['ships', 'market']) {
    if (views.includes(view)) await expect(page.locator(`#bottom-nav [data-view="${view}"]`)).toBeVisible();
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
  const errors = []; runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('#startup-loader')).toBeHidden();
  if (!testInfo.title.startsWith('新局软引导')) {
    const intro = page.locator('#merchant-onboarding-intro');
    await expect(intro).toBeVisible();
    await intro.locator('[data-onboarding-action="skip"]').click();
    await expect(intro).toBeHidden();
  }
});
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
  expect(await page.locator('.workspace-surface.is-active').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
});

test('新局软引导、初始商圈、派遣、独立航次与返港停用', async ({ page }) => {
  test.setTimeout(90000);
  const intro = page.locator('#merchant-onboarding-intro');
  const hint = page.locator('#merchant-onboarding-hint');
  await expect(intro).toBeVisible();
  await expectStoryPortrait(intro, '梁简');
  await expect(intro).toContainText('老航运调度员');
  await expect(intro).toContainText('视频通讯');
  await expect(intro).toContainText('一张未签收的货单');
  await expect(intro.locator('[data-onboarding-assets]')).toHaveText('1 艘飞船 · 1,000 CR 启动资金');
  await expect(page.locator('#credits')).toHaveText('1,000');
  await intro.locator('[data-onboarding-action="start"]').click();
  await expect(intro).toBeHidden();
  await expect(hint).toBeVisible();
  await expect(hint.locator('h2')).toHaveText('安排第一条商路');
  await expect(hint.locator('[data-story-phase="first-contract"]')).toContainText('梁简');
  await expectPanelMaterial(page, '.merchant-operations');
  await expect(page.locator('[data-merchant-action="map"]')).toHaveCount(0);
  await expectPanelMaterial(page, '#merchant-company-growth');
  await expectPrimaryButtonMaterial(page, '[data-merchant-action="new"]');
  await expect(page.locator('.merchant-company-cost')).toHaveText(`${MERCHANT_COMPANY_LEVELS[0].upgradeCost.toLocaleString('zh-CN')} CR`);
  await expectButtonState(page.locator('[data-merchant-action="upgrade-company"]'), 'blocked');
  await page.locator('[data-merchant-action="new"]').first().click();
  await expect(hint.locator('h2')).toHaveText('配船，留出周转货本');
  await expect(hint.locator('[data-story-phase="loading"]')).toBeVisible();
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
  await expect(hint.locator('[data-story-phase="first-voyage"]')).toBeVisible();
  await expect(hint.locator('[data-story-phase="first-receipt"]')).toHaveCount(0);
  await page.locator('#bottom-nav [data-view="reports"]').click();
  const toggle = page.locator('.merchant-report-toggle');
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.clock.fastForward(18_000);
  await expect(page.locator('.merchant-report-row').first()).toBeVisible({ timeout: 40000 });
  await expect(hint.locator('h2')).toHaveText('用利润壮大公司');
  await expect(hint.locator('[data-story-phase="handover"]')).toContainText('新回执已经入档');
  await page.locator('#bottom-nav [data-view="tasks"]').click();
  await expectButtonState(page.locator('[data-merchant-action="upgrade-company"]'), 'blocked');
  const stop = page.locator('[data-merchant-action="stop"]');
  if (await page.locator('#merchant-task-list [data-merchant-action="select-task"]').count()) {
    // 临时缺货会停靠等待；玩家明确结束后，在途船按原进度返港。
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
  await page.clock.fastForward(60_000);
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

test('新局软引导剧情随实际首航回执推进，跳过与刷新不重播', async ({ page }) => {
  const intro = page.locator('#merchant-onboarding-intro');
  const hint = page.locator('#merchant-onboarding-hint');
  const companyName = await page.locator('#company-name-display').innerText();
  await expectStoryPortrait(intro, '梁简');
  await expect(intro).toContainText('你的回应');
  await expect(intro.locator('[data-onboarding-company]')).toHaveText(companyName.replace(/\s*✎\s*$/, ''));
  expect(await intro.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('序章交接.png') });
  await intro.locator('[data-onboarding-action="start"]').click();
  await hint.locator('[data-onboarding-action="dispatch"]').click();
  const form = page.locator('#merchant-form');
  const budget = form.locator('[name="budget"]');
  await expect(budget).toHaveValue('126');
  await expect(form.locator('[name="shipIds"]:checked')).toHaveCount(1);
  await expect(page.locator('#credits')).toHaveText('1,000');
  await budget.fill('137');
  await hint.locator('[data-onboarding-action="dispatch"]').click();
  await expect(budget).toBeFocused();
  await page.clock.runFor(2_000);
  await expect(budget).toHaveValue('137');
  await expect(budget).toBeFocused();
  await budget.fill('126');
  await form.getByRole('button', { name: '确认派遣' }).click();
  await expect(hint.locator('[data-story-phase="first-voyage"]')).toBeVisible();
  await expect(hint).not.toContainText('第一笔收益已结算');
  await page.clock.fastForward(18_000);
  await expect(hint.locator('[data-story-phase="first-receipt"]')).toContainText('唐禾');
  await expectStoryPortrait(hint, '唐禾');
  await expect(hint).toContainText('净赚 42 CR，已计入可用资金');
  await expect(page.locator('#credits')).toHaveText('916');
  await page.screenshot({ path: test.info().outputPath('首张回执.png') });
  await hint.locator('[data-onboarding-action="report"]').click();
  await expect(hint.locator('[data-story-phase="handover"]')).toContainText('旧货单');
  await expectStoryPortrait(hint, '梁简');
  await hint.locator('[data-onboarding-action="skip"]').click();
  await expect(hint).toBeHidden();
  await page.locator('#bottom-nav [data-view="tasks"]').click();
  await expect(page.locator('#merchant-early-progress [data-story-phase="first-profit"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('#startup-loader')).toBeHidden();
  await expect(intro).toBeHidden();
  await expect(hint).toBeHidden();
  await expect(page.locator('#merchant-early-progress')).toContainText('准备公司升级');
});

test('首单补货等待与跳过后的剧情提示保持一致，不要求重复派遣', async ({ page }) => {
  await importFixture(page, { credits: 1000, legacyAccess: false, configure: state => {
    state.merchant.onboarding = { step: 2, skipped: false };
    state.merchant.markets.sol_prime.supply.food = 0;
    expect(Merchant.command(state, 'create', { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds: ['ship-1'], budget: 126 }, state.merchant.lastTickAt).ok).toBe(true);
  } });
  const hint = page.locator('#merchant-onboarding-hint');
  const next = page.locator('#merchant-early-progress');
  await expect(hint.locator('h2')).toHaveText('等待首航出发');
  await expect(hint.locator('[data-onboarding-action="dispatch"]')).toHaveCount(0);
  await expect(hint.locator('[data-onboarding-return]')).toHaveCount(0);
  await hint.locator('[data-onboarding-action="skip"]').click();
  await expect(hint).toBeHidden();
  await expect(next).toHaveAttribute('data-stage', 'first-wait');
  await expect(next.locator('[data-story-phase="first-wait"]')).toBeVisible();
  await expect(next.locator('[data-early-return]')).toHaveCount(0);
  await page.clock.fastForward(65_000);
  await expect(next.locator('[data-story-phase="first-voyage"]')).toBeVisible();
  await page.clock.fastForward(18_000);
  await expect(next.locator('[data-story-phase="first-profit"]')).toBeVisible();
  await expect(page.locator('#credits')).toHaveText('916');
  await expect(page.locator('#merchant-task-list [data-merchant-action="select-task"]')).toHaveCount(1);
});

test('批量购船、科技门槛、游戏内存档确认与刷新恢复', async ({ page }) => {
  await expectNavigation(page, false);
  await expect(page.locator('.merchant-company-capacity')).toContainText('1 / 1 艘');
  await page.locator('[data-merchant-action="new"]').first().click();
  await page.locator('#merchant-form .merchant-inline-shipyard > summary').click();
  const quantity = page.locator('#merchant-form [data-merchant-quantity="courier"]');
  const buy = page.locator('[data-merchant-action="buy-in-form"][data-type="courier"]');
  const total = buy.locator('..').locator('[data-merchant-total]');
  await expect(quantity).toBeDisabled();
  await expectButtonState(buy, 'blocked');
  await page.getByRole('button', { name: '关闭派遣配置' }).click();
  // 批量报价与存档验收使用具备 4 个基础船位、尚未研发导航功能的独立测试档。
  await importFixture(page, { level: 33, credits: 1000, legacyAccess: false }, 2);
  await page.locator('[data-merchant-action="new"]').first().click();
  await page.locator('#merchant-form .merchant-inline-shipyard > summary').click();
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
  await expect(page.locator('#merchant-tools-title')).toHaveText('设置');
  await page.locator('[data-tool="load"][data-slot="1"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-modal')).toBeHidden();
  await expect(page.locator('#settings-btn')).toBeFocused();
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
  await expect(page.locator('#merchant-form [data-merchant-procurement="courier"] [data-merchant-total]')).toHaveText('484 CR');
  await expectButtonState(page.locator('[data-merchant-action="buy-in-form"][data-type="courier"]'), 'blocked');
});

test('公司名称独立弹窗、随机草稿、取消与存档恢复', async ({ page }, testInfo) => {
  const company = page.locator('#company-name-display');
  const initialName = (await company.textContent()).replace(/\s*✎\s*$/, '').trim();
  expect(COMPANY_NAMES).toContain(initialName);
  await importFixture(page, { level: 29 });
  await company.focus();
  await company.press('Enter');
  const modal = page.locator('#company-name-modal');
  const input = modal.getByRole('textbox', { name: '公司名称', exact: true });
  const random = modal.getByRole('button', { name: '随机公司名称' });
  const close = modal.getByRole('button', { name: '关闭公司改名' });
  const save = modal.getByRole('button', { name: '保存名称' });
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#settings-modal')).toBeHidden();
  await expect(input).toHaveValue('浏览器验收商队');
  await expect(input).toBeFocused();
  await expectPanelMaterial(page, '#company-name-modal .modal-box');
  await expectButtonMaterial(page, '[data-company-action="randomize"]');
  await expectButtonState(save, 'ready');
  await expect(close).toHaveCSS('width', '44px');
  await expect(close).toHaveCSS('height', '44px');
  await expect(close).toHaveCSS('border-radius', '50%');

  await random.click();
  const first = await input.inputValue();
  expect(COMPANY_NAMES).toContain(first);
  await random.click();
  const second = await input.inputValue();
  expect(COMPANY_NAMES).toContain(second);
  expect(second).not.toBe(first);
  await expect(company).toContainText('浏览器验收商队');
  await random.focus();
  await page.clock.runFor(2000);
  await expect(input).toHaveValue(second);
  await expect(random).toBeFocused();
  expect(await modal.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('company-name-random.png') });
  await modal.getByRole('button', { name: '取消', exact: true }).click();
  await expect(modal).toBeHidden();
  await expect(company).toBeFocused();

  await company.click();
  await expect(input).toHaveValue('浏览器验收商队');
  await input.fill('   ');
  await save.click();
  await expect(modal.locator('[role="status"]')).toHaveText('请输入公司名称。');
  await expect(company).toContainText('浏览器验收商队');
  await input.fill('  银河金帆贸易  ');
  await input.press('Enter');
  await expect(modal).toBeHidden();
  await expect(company).toContainText('银河金帆贸易');
  await expect(company).toBeFocused();
  await page.reload();
  await expect(page.locator('#startup-loader')).toBeHidden();
  await expect(company).toContainText('银河金帆贸易');
  await company.click();
  await expect(input).toHaveValue('银河金帆贸易');
  await save.focus();
  await save.press('Tab');
  await expect(close).toBeFocused();
  await close.press('Shift+Tab');
  await expect(save).toBeFocused();
  await random.click();
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(modal).toHaveAttribute('aria-hidden', 'true');
  await expect(company).toBeFocused();
  await expect(company).toContainText('银河金帆贸易');
  await company.click();
  await expect(input).toHaveValue('银河金帆贸易');
  await random.click();
  await modal.click({ position: { x: 2, y: 2 } });
  await expect(modal).toBeHidden();
  await expect(company).toBeFocused();
  await expect(company).toContainText('银河金帆贸易');
  await company.click();
  await random.click();
  const savedRandomName = await input.inputValue();
  await save.click();
  await expect(company).toContainText(savedRandomName);
  await expect(modal).toBeHidden();
  await page.reload();
  await expect(page.locator('#startup-loader')).toBeHidden();
  await expect(company).toContainText(savedRandomName);
  await company.click();
  await expect(input).toHaveValue(savedRandomName);
  await close.click();
  await expect(modal).toBeHidden();
  await expect(company).toBeFocused();
});

test('五页导航、星图无经营遮挡、镜头仅平移与资产完整', async ({ page, isMobile }, testInfo) => {
  await importFixture(page, { level: 29 });
  await expectNavigation(page, true);
  const settings = page.getByRole('button', { name: '设置', exact: true });
  await expect(page.locator('#merchant-resource-bar button')).toHaveCount(1);
  await expect(page.locator('#merchant-resource-bar details')).toHaveCount(0);
  await expect(settings).toBeVisible();
  await expectButtonMaterial(page, '#settings-btn');
  await page.screenshot({ path: testInfo.outputPath('settings-entry.png') });
  await settings.focus();
  await settings.press('Enter');
  await expect(page.locator('#merchant-tools-title')).toHaveText('设置');
  await expect(page.locator('[data-tool="tab"][data-tab="display"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.merchant-tools-tabs button')).toHaveCount(2);
  await expect(page.locator('#settings-modal #merchant-company-form')).toHaveCount(0);
  await page.locator('[data-tool="tab"][data-tab="saves"]').click();
  await expect(page.locator('.merchant-save-slot')).toHaveCount(4);
  await page.screenshot({ path: testInfo.outputPath('settings-saves.png') });
  await page.getByRole('button', { name: '关闭设置' }).click();
  await expect(page.locator('#settings-modal')).toBeHidden();
  await expect(settings).toBeFocused();
  for (const view of ['ships', 'market', 'reports', 'tasks']) {
    await page.locator(`#bottom-nav [data-view="${view}"]`).click();
    await expect(settings).toBeVisible();
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
  await expect(page.locator('#merchant-tech-section')).toHaveCount(0);
  await expect(page.locator('#merchant-ship-workspace [data-merchant-action="research"]')).toHaveCount(0);
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
  await expect(settings).toBeVisible();
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
  if (isMobile) {
    // 移动 WebKit 不支持滚轮；使用实际拖动检查平移时保持高度和朝向。
    await page.mouse.down();
    await page.mouse.move(220, 300, { steps: 5 });
    await page.mouse.up();
  } else await page.mouse.wheel(0, 800);
  await expect(canvas).toHaveAttribute('data-camera-height', height);
  await expect(canvas).toHaveAttribute('data-camera-offset', offset);
  await expect(page.locator('img')).not.toHaveCount(0);
  const broken = await page.locator('img').evaluateAll(images => images.filter(image => image.complete && !image.naturalWidth).map(image => image.src));
  expect(broken).toEqual([]);
});

test('公司升级开放研发资格，完成研发后采购与探索生效，开港条件保持完整返港', async ({ page }) => {
  test.setTimeout(90000);
  const firstTechs = MERCHANT_TECHS.filter(tech => tech.companyLevel >= 2 && tech.companyLevel <= 24 && (tech.unlockShipId || tech.unlockFeature));
  const paidIds = [], needed = new Map();
  for (const tech of [...firstTechs, MERCHANT_TECHS.find(item => item.id === 'fast_navigation')]) {
    for (const required of getPendingTechChain({ researchedTechIds: [] }, tech.id)) needed.set(required.id, required);
  }
  const qualificationCost = [...needed.values()].reduce((sum, tech) => sum + tech.cost, 0);
  const fastCost = MERCHANT_TECHS.find(tech => tech.id === 'fast_navigation').cost;
  const startingCredits = MERCHANT_COMPANY_LEVELS.slice(0, 34).reduce((sum, stage) => sum + stage.upgradeCost, 0) + qualificationCost + 3200;
  const cashText = amount => amount.toLocaleString('zh-CN');
  await importFixture(page, { credits: startingCredits, legacyAccess: false });
  await expectNavigation(page, false);
  await expect(page.locator('.merchant-company-next-unlock')).toContainText('新港勘察');
  const upgrade = page.locator('.merchant-company-upgrade button');
  await upgrade.focus(); await page.clock.runFor(1000); await expect(upgrade).toBeFocused();
  let spent = 0, level = 1;
  for (const tech of firstTechs) {
    while (level < tech.companyLevel) {
      spent += MERCHANT_COMPANY_LEVELS[level - 1].upgradeCost; await upgrade.click(); level++;
    }
    await expect(page.locator('.merchant-company-level')).toHaveText(`Lv.${tech.companyLevel}`);
    if (tech.companyLevel === 15) await expectNavigation(page, false);
    if (tech.companyLevel === 20) await expectNavigation(page, ['tasks', 'ships', 'starmap', 'reports']);
    await page.locator('#merchant-dispatch-tab-research').click();
    const button = page.locator(`[data-merchant-action="research"][data-tech="${tech.id}"]`);
    const prerequisites = getPendingTechChain({ researchedTechIds: paidIds }, tech.id).filter(item => item.id !== tech.id);
    if (prerequisites.length) await expectButtonState(button, 'blocked');
    for (const required of prerequisites) {
      const parent = page.locator(`[data-tech="${required.id}"]`);
      await expectButtonState(parent, 'ready'); await parent.click(); spent += required.cost; paidIds.push(required.id);
    }
    await expectButtonState(button, 'ready'); await button.click(); spent += tech.cost; paidIds.push(tech.id);
    await expect(button).toHaveText('已研发'); await expectButtonState(button, 'complete');
    await expect(page.locator('#credits')).toHaveText(cashText(startingCredits - spent));
    await expectNavigation(page, tech.companyLevel >= 20 ? true : tech.companyLevel === 15 ? ['tasks', 'ships', 'starmap', 'reports'] : false);
    await page.locator('#merchant-dispatch-tab-tasks').click();
    if (tech.unlockShipId) {
      await page.locator('[data-merchant-action="new"]').first().click();
      await expect(page.locator('.merchant-inline-ship-row')).toHaveCount(firstTechs.filter(item => item.unlockShipId && item.companyLevel <= tech.companyLevel).length + 1);
      await page.getByRole('button', { name: '关闭派遣配置' }).click();
    }
  }
  await expect(page.locator('#merchant-discovery-notice')).toContainText('探索已解锁');
  const roadmap = page.locator('.merchant-company-roadmap');
  await roadmap.locator('summary').click();
  await expect(roadmap.locator('li')).toHaveCount(5);
  await expect(roadmap.locator('[aria-current="step"]')).toContainText('Lv.20');
  await expect(roadmap.locator('li').last().locator('.merchant-company-roadmap-level')).toHaveText('Lv.20');
  await expect(roadmap.locator('li').last().locator('.merchant-company-roadmap-effects')).toContainText('突破关卡');
  await roadmap.locator('summary').click();
  for (const level of Array.from({ length: 15 }, (_, index) => 21 + index)) {
    await upgrade.click();
    await expect(page.locator('.merchant-company-level')).toHaveText(`Lv.${level}`);
  }
  await page.locator('#merchant-dispatch-tab-research').click();
  const research = page.locator('[data-merchant-action="research"][data-tech="fast_navigation"]');
  await expect(research).toContainText(`${cashText(fastCost)} CR`);
  await expectButtonState(research, 'blocked');
  for (const tech of getPendingTechChain({ researchedTechIds: paidIds }, 'fast_navigation').filter(item => item.id !== 'fast_navigation')) {
    const parent = page.locator(`[data-tech="${tech.id}"]`);
    await expectButtonState(parent, 'ready'); await parent.click(); paidIds.push(tech.id);
  }
  await expectButtonState(research, 'ready');
  await research.click(); paidIds.push('fast_navigation');
  await expect(research).toHaveText('已研发'); await expectButtonState(research, 'complete');
  await expect(page.locator('#merchant-research-progress')).toHaveText(`${paidIds.length} / 65 已完成`);
  await expect(page.locator('#credits')).toHaveText('3,200');
  await page.locator('#bottom-nav [data-view="ships"]').click();
  await expect(page.locator('.merchant-shop-card')).toHaveCount(4);
  await expect(page.locator('[data-merchant-shop-type="swift"]')).toBeVisible();
  await expect(page.locator('#merchant-tech-section')).toHaveCount(0);
  await page.reload(); await expect(page.locator('#startup-loader')).toBeHidden();
  await expectNavigation(page, true);
  await page.locator('#merchant-dispatch-tab-research').click();
  await expect(research).toHaveText('已研发'); await expectButtonState(research, 'complete');
  await expect(page.locator('#merchant-research-progress')).toHaveText(`${paidIds.length} / 65 已完成`);
  await page.locator('#bottom-nav [data-view="market"]').click();
  await expect(page.locator('[data-merchant-action="route"][data-from="nebula_forge"]')).toHaveCount(0);
  await page.locator('#bottom-nav [data-view="starmap"]').click();
  await expect(page.locator('#starmap-three-canvas')).toBeVisible({ timeout: 30000 });
  await page.locator('.merchant-exploration-signal').click();
  const exploration = page.locator('#merchant-exploration-panel');
  await expect(exploration).toBeVisible();
  await expect(exploration.locator('[data-exploration-cost]')).toHaveText('360 CR');
  await exploration.getByRole('button', { name: '派船探索' }).click();
  await expect(page.locator('#credits')).toHaveText('2,840');
  await page.clock.fastForward(5 * 60_000);
  await expect(exploration).toContainText('探索船已返港待命');
  await exploration.getByRole('button', { name: '关闭探索详情' }).click();
  await page.locator('#bottom-nav [data-view="market"]').click();
  await expect(page.locator('[data-merchant-action="route"][data-from="nebula_forge"]')).not.toHaveCount(0);
  await page.reload(); await expect(page.locator('#startup-loader')).toBeHidden();
  await expect(page.locator('#credits')).toHaveText('2,840');
  await page.locator('#bottom-nav [data-view="market"]').click();
  await expect(page.locator('[data-merchant-action="route"][data-from="nebula_forge"]')).not.toHaveCount(0);
});

test('旧商队保留已开放入口，等待商路刷新恢复后在原任务续跑', async ({ page }) => {
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
  await expect(page.locator('#credits')).toHaveText('780');
  const task = page.locator('[data-merchant-task]');
  await expect(task).toHaveCount(1);
  await expect(task).toHaveAttribute('data-merchant-task', 'task-2');
  await expect(task).toContainText('补货后自动续跑');
  await expect(task.locator('[data-market-retry]')).toBeVisible();
  const edit = task.locator('[data-merchant-action="edit"]');
  await edit.focus();
  await page.clock.fastForward(1000);
  await expect(edit).toBeFocused();
  await page.reload();
  await expect(page.locator('#startup-loader')).toBeHidden();
  await expect(page.locator('#credits')).toHaveText('780');
  await expect(task).toHaveAttribute('data-merchant-task', 'task-2');
  await expect(task).toContainText('补货后自动续跑');
  await page.clock.fastForward(65_000);
  await expect(task).toHaveCount(1);
  await expect(task).toHaveAttribute('data-merchant-task', 'task-2');
  await expect(task).toContainText('运行中');
  await expect(task.locator('[role="progressbar"]')).toBeVisible();
  await page.clock.fastForward(12_000);
  await expect(task).toContainText('最近结算');
  await expect(page.locator('#credits')).toHaveText('822');
});
