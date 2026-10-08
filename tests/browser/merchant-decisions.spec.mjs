import { test, expect } from '@playwright/test';
import { MERCHANT_COMPANY_LEVELS, MERCHANT_TECHS, MERCHANT_TECH_CATEGORIES } from '../../js/data/merchant.js';
import * as Merchant from '../../js/systems/merchant/MerchantSystem.js';
import { getPendingTechChain } from '../../js/systems/merchant/MerchantTechnology.js';
import { openTools, importFixture } from './helpers/merchantFixtures.mjs';
import { expectStoryPortrait } from './helpers/merchantStory.mjs';
const techCost = id => MERCHANT_TECHS.find(tech => tech.id === id).cost;
const runtimeErrors = new WeakMap();

test('科技树展示二级独立核心，支付后保留卡片、连线与成果并可跨浏览器恢复', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await importFixture(page, { level: 2, credits: 20000, legacyAccess: false });
  await page.locator('#merchant-dispatch-tab-research').click();
  const research = page.locator('#merchant-research');
  const viewport = page.locator('#merchant-tech-tree-viewport');
  const detail = page.locator('#merchant-tech-detail');
  const core = page.locator('[data-research-tech="berth_planning"]');
  const survey = page.locator('[data-research-tech="planet_survey"]');
  await expect(research.locator('[data-research-tech]')).toHaveCount(65);
  await expect(research.locator('.merchant-tech-era-column')).toHaveCount(20);
  for (const node of [core, survey]) {
    await expect(node).toHaveAttribute('data-tree-level', '2');
    await expect(node.locator('[data-tech]')).toBeEnabled();
  }
  await expect(research.locator('[data-tech="clipper_design"]')).toHaveText('Lv.6 解锁');
  await research.locator('[data-tree-action="core"]').click();
  await expect(core).toHaveClass(/is-core.*is-selected/);
  await expect(detail.locator('h3')).toHaveText('船位规划');
  await expect(detail).not.toContainText('前置尚需');
  await expect(detail).toContainText('1,300');
  await showTreeInViewport(page);
  await page.screenshot({ path: testInfo.outputPath('科技树二级船位.png'), animations: 'disabled' });
  const geometry = await techGeometry(research);
  const pan = await viewport.evaluate(node => [node.scrollLeft, node.scrollTop]);
  await core.locator('[data-tech="berth_planning"]').press('Enter');
  await expect(core).toHaveClass(/is-complete/);
  await expect(core.locator('[data-tech="berth_planning"]')).toHaveText('已研发');
  await expect(core.locator('[data-tech="berth_planning"]')).toBeDisabled();
  expect(await techGeometry(research)).toEqual(geometry);
  expect(await viewport.evaluate(node => [node.scrollLeft, node.scrollTop])).toEqual(pan);
  await expect(page.locator('#credits')).toHaveText('18,700');
  await expect(page.locator('.merchant-company-capacity')).toContainText('基础 1 · 研发 +1');
  await research.locator('[data-tree-action="core"]').click();
  await expect(detail.locator('h3')).toHaveText('新港勘察');
  await expect(detail).toContainText('2,100');
  await expect(detail).toContainText('4分钟');
  await survey.locator('[data-tech="planet_survey"]').press('Enter');
  await expect(survey).toHaveClass(/is-complete/);
  await expect(survey.locator('[data-tree-action="inspect"]')).toBeFocused();
  await page.clock.runFor(1500);
  await expect(survey.locator('[data-tree-action="inspect"]')).toBeFocused();
  expect(await techGeometry(research)).toEqual(geometry);
  await expect(page.locator('#credits')).toHaveText('16,600');
  await showTreeInViewport(page);
  await page.screenshot({ path: testInfo.outputPath('科技树已研发卡片.png'), animations: 'disabled' });
  await research.locator('#merchant-tech-categories [data-category="航速"]').click();
  await expect(research.locator('[data-research-tech]')).toHaveCount(15);
  await research.locator('[data-tree-action="core"]').click();
  await expect(research.locator('#merchant-tech-categories [data-category="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(detail.locator('h3')).toHaveText('船队管理');
  await expect(detail.locator('[data-tree-id="berth_planning"]')).toContainText('✓ 船位规划');
  await expect(detail.locator('[data-tree-id="berth_planning"]')).toContainText('已研发');
  await expect(research.locator('[data-tech="fleet_command"]')).toBeDisabled();
  await viewport.focus(); await viewport.press('Home');
  expect(await viewport.evaluate(node => node.scrollTop)).toBe(0);
  await viewport.press('ArrowDown');
  expect(await viewport.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await viewport.press('End');
  expect(await viewport.evaluate(node => node.scrollTop)).toBeGreaterThan(4000);
  expect(await viewport.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(await viewport.evaluate(node => node.scrollLeft)).toBe(0);
  await research.locator('[data-tree-action="current"]').click();
  await research.locator('#merchant-tech-era').selectOption('5');
  expect(await viewport.evaluate(node => node.scrollTop)).toBe(await research.locator('.merchant-tech-era-column').nth(4).evaluate(node => Number.parseFloat(node.style.top)));
  await research.locator('[data-research-tech="deep_survey"] [data-tree-action="inspect"]').click();
  await detail.locator('[data-tree-id="deep_survey"]').click();
  await expect(detail.locator('h3')).toHaveText('远域勘察');
  await expect(research.locator('[data-tech="deep_survey"]')).toHaveText('Lv.57 解锁');
  await showTreeInViewport(page);
  await page.screenshot({ path: testInfo.outputPath('科技树远域核心.png'), animations: 'disabled' });
  await research.locator('#merchant-tech-era').selectOption('15');
  await research.locator('[data-research-tech="integrated_freight"] [data-tree-action="inspect"]').click();
  await detail.locator('[data-tree-id="integrated_freight"]').click();
  const references = research.locator('[data-tech-reference="integrated_freight"]');
  await expect(references).toContainText('快速航路 · 重载物流 · 远域勘察');
  await expect(research.locator('.merchant-tech-edge.is-path')).toHaveCount(4);
  await showTreeInViewport(page);
  await page.screenshot({ path: testInfo.outputPath('科技树远端前置入口.png'), animations: 'disabled' });
  await references.click();
  await expect(detail.locator('h3')).toHaveText('联运调度');
  await expect(detail.locator('h3')).toBeFocused();
  const detailTop = await detail.evaluate(node => node.getBoundingClientRect().top);
  expect(detailTop).toBeGreaterThanOrEqual(await page.locator('#merchant-resource-bar').evaluate(node => node.getBoundingClientRect().bottom));
  expect(detailTop).toBeLessThan(await page.locator('#bottom-nav').evaluate(node => node.getBoundingClientRect().top));
  await detail.locator('[data-tree-id="fast_navigation"]').click();
  await expect(research.locator('[data-research-tech="fast_navigation"] [data-tree-action="inspect"]')).toBeFocused();
  await noOverflow(page);
  await page.reload(); await expect(page.locator('#startup-loader')).toBeHidden();
  await page.locator('#merchant-dispatch-tab-research').click();
  await expect(research.locator('[data-research-tech]')).toHaveCount(65);
  await expect(core).toHaveClass(/is-complete/); await expect(survey).toHaveClass(/is-complete/);
  expect(await techGeometry(research)).toEqual(geometry);
  await expect(page.locator('#credits')).toHaveText('16,600');
});

async function closeForm(page) { await page.getByRole('button', { name: '关闭派遣配置' }).click(); }
async function techGeometry(research) {
  return research.locator('[data-research-tech]').evaluateAll(nodes => nodes.map(node => ({
    id: node.dataset.researchTech, x: node.style.left, y: node.style.top,
    width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height,
  })));
}
async function showCompanyInViewport(page) {
  await page.locator('#merchant-company-growth').evaluate(node => {
    const workspace = node.closest('.workspace-surface');
    const bar = document.getElementById('merchant-resource-bar');
    workspace.scrollTop += node.getBoundingClientRect().top - bar.getBoundingClientRect().bottom - 12;
  });
}
async function showResearchInViewport(page) {
  await page.locator('#merchant-research').evaluate(node => {
    const workspace = node.closest('.workspace-surface');
    const bar = document.getElementById('merchant-resource-bar');
    workspace.scrollTop += node.getBoundingClientRect().top - bar.getBoundingClientRect().bottom - 12;
  });
}

async function showTreeInViewport(page) {
  await page.locator('#merchant-tech-tree-viewport').evaluate(node => {
    const workspace = node.closest('.workspace-surface');
    const bar = document.getElementById('merchant-resource-bar');
    workspace.scrollTop += node.getBoundingClientRect().top - bar.getBoundingClientRect().bottom - 12;
  });
}

async function noOverflow(page) {
  expect(await page.locator('.workspace-surface.is-active').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
}

async function accumulateCredits(page, target) {
  // 只推进真实商路，不补钱；每半分钟查看一次到达资金门槛的情况。
  for (let check = 0; check < 240; check++) {
    const credits = Number((await page.locator('#credits').textContent()).replaceAll(',', ''));
    if (credits >= target) return;
    await page.clock.fastForward(30_000);
  }
  throw new Error(`经营两小时后仍未积累到 ${target} CR。`);
}

test.beforeEach(async ({ page }) => {
  const errors = []; runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('#startup-loader')).toBeHidden();
  await page.locator('[data-onboarding-action="skip"]').click();
});
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
  await noOverflow(page);
});

test('市场情报购买、刷新恢复与新星球探索返港后开港', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const startingCredits = MERCHANT_COMPANY_LEVELS[22].upgradeCost + 180 + techCost('planet_survey') + 800;
  await importFixture(page, { level: 23, credits: startingCredits, legacyAccess: false, configure: state => {
    state.merchant.researchedTechIds = ['market_network'];
  } });
  await page.locator('#bottom-nav [data-view="market"]').click();
  const intel = page.locator('#merchant-intelligence');
  const first = intel.locator('[data-intel="forge_coordinates"]');
  const second = intel.locator('[data-intel="aurora_coordinates"]');
  const buy = first.locator('[data-intel-action="buy"]');
  await expect(intel).toBeVisible();
  await expect(first.locator('h3')).toHaveText('外围工业星球情报');
  await expect(buy).toHaveText('购买情报 · 180 CR');
  await expect(buy).toBeEnabled();
  await expect(second.locator('[data-intel-action="buy"]')).toBeDisabled();
  await expect(second.locator('[data-intel-hint]')).toContainText('Lv.50');
  await page.screenshot({ path: testInfo.outputPath('market-intelligence.png') });
  await buy.focus(); await buy.press('Enter');
  await expect(page.locator('#credits')).toHaveText((startingCredits - 180).toLocaleString('zh-CN'));
  await expect(first.locator('h3')).toHaveText('百炼工业星');
  await expect(first.locator('[data-intel-action="buy"]')).toHaveAttribute('data-button-state', 'complete');
  await expect(first.locator('[data-intel-action="buy"]')).toBeDisabled();
  await expect(first).toContainText('360 CR');
  await expect(first.locator('h3')).toBeFocused();
  await page.clock.runFor(1200);
  await expect(first.locator('h3')).toBeFocused();
  await expect(page.locator('#merchant-intelligence-status')).toContainText('情报已收藏');
  const unopenedRoutes = page.locator('#merchant-route-list [data-from="nebula_forge"], #merchant-route-list [data-to="nebula_forge"]');
  await expect(unopenedRoutes).toHaveCount(0);
  await page.reload(); await expect(page.locator('#startup-loader')).toBeHidden();
  await page.locator('#bottom-nav [data-view="market"]').click();
  await expect(first.locator('h3')).toHaveText('百炼工业星');
  await expect(first.locator('[data-intel-action="buy"]')).toBeDisabled();
  await expect(page.locator('#credits')).toHaveText((startingCredits - 180).toLocaleString('zh-CN'));
  await page.screenshot({ path: testInfo.outputPath('market-intelligence-owned.png') });
  await page.locator('#bottom-nav [data-view="tasks"]').click();
  await page.locator('[data-merchant-action="upgrade-company"]').click();
  await expect(page.locator('.merchant-company-level')).toHaveText('Lv.24');
  await page.locator('#merchant-dispatch-tab-research').click();
  await page.locator('[data-merchant-action="research"][data-tech="planet_survey"]').click();
  await expect(page.locator('#credits')).toHaveText('800');
  await page.locator('#bottom-nav [data-view="market"]').click();
  await first.locator('[data-intel-action="explore"]').click();
  const exploration = page.locator('#merchant-exploration-panel');
  await expect(exploration).toBeVisible({ timeout: 30000 });
  await expect(exploration.locator('h2')).toHaveText('百炼工业星');
  await exploration.getByRole('button', { name: '派船探索', exact: true }).click();
  await expect(page.locator('#credits')).toHaveText('440');
  await exploration.getByRole('button', { name: '关闭探索详情' }).click();
  await page.locator('#bottom-nav [data-view="market"]').click();
  await expect(unopenedRoutes).toHaveCount(0);
  await expect(first.locator('[data-intel-action="explore"]')).toHaveText('查看探索');
  await page.clock.fastForward(5 * 60_000);
  await expect(first.locator('[data-intel-action="port"]')).toBeEnabled();
  await expect(unopenedRoutes).not.toHaveCount(0);
  await expect(page.locator('#credits')).toHaveText('440');
  await first.locator('[data-intel-action="port"]').click();
  await expect(page.locator('.merchant-port-panel')).toBeVisible();
  await expect(page.locator('.merchant-port-panel h2')).toHaveText('百炼工业星');
});

test('情报保护首航货本，远域情报购买立即标记信号且不直接开放商路', async ({ page }) => {
  await importFixture(page, { level: 20, credits: 180, legacyAccess: false, configure: state => {
    state.merchant.researchedTechIds = ['market_network'];
  } });
  await page.locator('#bottom-nav [data-view="market"]').click();
  const first = page.locator('[data-intel="forge_coordinates"]');
  await expect(first.locator('[data-intel-action="buy"]')).toBeDisabled();
  await expect(first.locator('[data-intel-hint]')).toContainText('首航货本');
  await expect(page.locator('#credits')).toHaveText('180');
  const at = Date.now() + 1000;
  await page.clock.setFixedTime(new Date(at));
  await importFixture(page, { level: 57, credits: 12000, legacyAccess: false, configure: state => {
    const merchant = state.merchant;
    merchant.researchedTechIds = ['market_network', 'planet_survey', 'deep_survey'];
    merchant.unlockedPorts.push('nebula_forge');
    merchant.exploration.rngState = 42;
    Merchant.init(state, at); Merchant.advance(state, at);
    expect(merchant.exploration.nextEventAt).toBeGreaterThan(at);
  } }, 2);
  await expect(page.locator('#merchant-discovery-notice')).toBeHidden();
  await page.locator('#bottom-nav [data-view="market"]').click();
  await expect(first.locator('[data-intel-action="buy"]')).toHaveCount(0);
  const second = page.locator('[data-intel="aurora_coordinates"]');
  await expect(second.locator('[data-intel-action="buy"]')).toHaveText('购买情报 · 600 CR');
  await second.locator('[data-intel-action="buy"]').click();
  await expect(page.locator('#credits')).toHaveText('11,400');
  await expect(second.locator('h3')).toHaveText('聚宝原料星');
  await expect(second.locator('[data-intel-action="explore"]')).toBeEnabled();
  await expect(page.locator('#merchant-route-list')).not.toContainText('聚宝原料星');
  await second.locator('[data-intel-action="explore"]').click();
  const exploration = page.locator('#merchant-exploration-panel');
  await expect(exploration).toBeVisible({ timeout: 30000 });
  await expect(exploration.locator('h2')).toHaveText('聚宝原料星');
  await expect(exploration.locator('[data-exploration-cost]')).toHaveText('1,800 CR');
  await exploration.getByRole('button', { name: '派船探索', exact: true }).click();
  await expect(page.locator('#credits')).toHaveText('9,600');
});

for (const target of [
  { portId: 'nebula_forge', name: '百炼工业星', to: 'sol_prime', goodId: 'technology', level: 29 },
  { portId: 'aurora_depot', name: '聚宝原料星', to: 'nebula_forge', goodId: 'alloys', level: 63 },
]) test(`探索期间各界面不提前显示${target.name}商路，完整返港后同步开放`, async ({ page }) => {
  test.setTimeout(90000);
  const at = Date.now() + 1000;
  await page.clock.setFixedTime(new Date(at));
  const fixture = await importFixture(page, {
    level: target.level, credits: 12000, legacyPort: target.portId === 'aurora_depot',
    configure(state) {
      const merchant = state.merchant;
      merchant.lastTickAt = at;
      merchant.nextRestockAt = at + 30000;
      merchant.analytics.since = at;
      Merchant.advance(state, at);
      if (target.portId === 'aurora_depot') merchant.exploration.nextEventAt = at;
      Merchant.advance(state, at);
      // 预先存在的空统计不能让未开放的港口出现在报告里。
      merchant.analytics.routes.push({
        key: `${target.portId}:${target.to}:${target.goodId}`, from: target.portId, to: target.to, goodId: target.goodId,
        trips: 0, quantity: 0, capacity: 0, profit: 0, cost: 0, fee: 0, travelMs: 0, capitalMs: 0, buckets: [],
      });
    },
  });
  const form = page.locator('#merchant-form');
  const routes = `[data-from="${target.portId}"], [data-to="${target.portId}"]`;
  async function assertClosed() {
    await page.locator('#bottom-nav [data-view="market"]').click();
    await expect(page.locator('#merchant-market-list')).not.toContainText(target.name);
    await expect(page.locator('#merchant-route-list').locator(routes)).toHaveCount(0);
    await page.locator('#bottom-nav [data-view="ships"]').click();
    await expect(page.locator('[data-investment-route]')).not.toContainText(target.name);
    await page.locator('#bottom-nav [data-view="reports"]').click();
    await expect(page.locator('#merchant-report-list')).not.toContainText(target.name);
    await page.locator('#bottom-nav [data-view="tasks"]').click();
    await page.locator('[data-merchant-action="new"]').first().click();
    await expect(form.locator('#merchant-form-route-list').locator(routes)).toHaveCount(0);
    await expect(form.locator(`[name="from"] option[value="${target.portId}"]`)).toHaveCount(0);
    await expect(form.locator(`[name="to"] option[value="${target.portId}"]`)).toHaveCount(0);
    await expect(form.locator(`[name="goodId"] option[value="${target.goodId}"]`)).toHaveCount(0);
    await closeForm(page);
  }
  await assertClosed();
  const offer = Merchant.getExplorationPreview(fixture, { shipId: 'ship-1', from: 'sol_prime' });
  await page.locator('#merchant-discovery-notice [data-operation="explore"]').click();
  const exploration = page.locator('#merchant-exploration-panel');
  await expect(exploration).toBeVisible({ timeout: 30000 });
  await exploration.getByRole('button', { name: '派船探索', exact: true }).click();
  await exploration.getByRole('button', { name: '关闭探索详情' }).click();
  for (const elapsed of [1, offer.legMs, offer.durationMs - offer.legMs, offer.durationMs - 1]) {
    await page.clock.setFixedTime(new Date(at + elapsed));
    await page.clock.runFor(600);
    if (elapsed === offer.legMs) {
      await page.reload();
      await expect(page.locator('#startup-loader')).toBeHidden();
    }
    await assertClosed();
  }
  await page.locator('[data-merchant-action="new"]').first().click();
  await form.locator('[name="budget"]').fill('432');
  const oldFrom = await form.locator('[name="from"]').inputValue();
  const oldTo = await form.locator('[name="to"]').inputValue();
  const oldGood = await form.locator('[name="goodId"]').inputValue();
  // 界面每 500ms 刷新一次，跨过下一次 tick 后检查开放结果。
  await page.clock.setFixedTime(new Date(at + offer.durationMs + 500));
  await page.clock.runFor(600);
  await expect(form.locator(`[name="from"] option[value="${target.portId}"]`)).toHaveCount(1);
  await expect(form.locator(`[name="to"] option[value="${target.portId}"]`)).toHaveCount(1);
  await expect(form.locator(`[name="goodId"] option[value="${target.goodId}"]`)).toHaveCount(1);
  await expect(form.locator('[name="from"]')).toHaveValue(oldFrom);
  await expect(form.locator('[name="to"]')).toHaveValue(oldTo);
  await expect(form.locator('[name="goodId"]')).toHaveValue(oldGood);
  await expect(form.locator('[name="budget"]')).toHaveValue('432');
  await expect(form.locator('[name="budget"]')).toBeFocused();
  await form.locator(`[data-merchant-action="select-route"][data-from="${target.portId}"][data-to="${target.to}"][data-good="${target.goodId}"]`).click();
  await expect(form.locator('[name="from"]')).toHaveValue(target.portId);
  await expect(form.locator('[name="goodId"]')).toHaveValue(target.goodId);
  await closeForm(page);
  await page.locator('#bottom-nav [data-view="market"]').click();
  await expect(page.locator('#merchant-route-list')).toContainText(target.name);
  await page.locator('#bottom-nav [data-view="ships"]').click();
  await expect(page.locator('[data-investment-route]')).toContainText(target.name);
  await page.locator('#bottom-nav [data-view="reports"]').click();
  await expect(page.locator('#merchant-report-list')).toContainText(target.name);
});

test('前期节奏：首航回款、二级探索教学、第二商路与五级突破', async ({ page }) => {
  test.setTimeout(180000);
  const next = page.locator('#merchant-early-progress');
  const form = page.locator('#merchant-form');
  const budget = form.locator('[name="budget"]');
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const costs = MERCHANT_COMPANY_LEVELS.slice(0, 5).map(stage => stage.upgradeCost);
  await expect(next).toHaveAttribute('data-stage', 'first-route');
  await expect(next.locator('[data-story-phase="first-contract"]')).toBeVisible();
  await expect(next).toContainText('货本 126 CR');
  await expect(page.locator('.merchant-company-capacity')).toContainText('1 / 1 艘');
  expect(await page.locator('#merchant-company-growth').evaluate(node => node.getBoundingClientRect().height)).toBeLessThanOrEqual(220);
  await page.locator('[data-merchant-action="new"]').first().click();
  await expect(next).toBeHidden();
  await expect(budget).toHaveValue('126');
  await form.locator('[data-merchant-action="select-route"][data-good="minerals"]').click();
  await expect(budget).toHaveValue('126');
  await expect(page.locator('#merchant-budget-recommendation')).toContainText('162 CR');
  await form.getByRole('button', { name: '使用推荐货本' }).click();
  await expect(budget).toHaveValue('162');
  await form.locator('[data-merchant-action="select-route"][data-good="food"]').click();
  await expect(budget).toHaveValue('162');
  await budget.fill('100');
  await page.clock.runFor(2000);
  await expect(budget).toHaveValue('100');
  const useBudget = form.getByRole('button', { name: '使用推荐货本' });
  await useBudget.focus();
  await expect(useBudget).toBeFocused();
  await page.clock.runFor(2000);
  await expect(useBudget).toBeFocused();
  await useBudget.click();
  await form.getByRole('button', { name: '确认派遣' }).click();
  await expect(page.locator('#credits')).toHaveText('874');
  await expect(next).toHaveAttribute('data-stage', 'first-return');
  await expect(next.locator('[data-early-return]')).toContainText('返港结算');
  await page.clock.fastForward(18_000);
  await expect(next).toHaveAttribute('data-stage', 'growth');
  await expect(next.locator('[data-story-phase="first-profit"]')).toContainText('第一张回执收好了');
  await expect(next).toContainText('准备公司升级');
  await expect(next).not.toContainText(/公司成长|积累公司等级|推进当前阶段|，。/);
  await expect(page.locator('#credits')).toHaveText('916');
  await expect(next.locator('progress')).toHaveAttribute('max', String(costs[0]));
  await expect(page.locator('[data-merchant-action="upgrade-company"]')).toBeDisabled();
  await showCompanyInViewport(page);
  await page.screenshot({ path: test.info().outputPath('首次升级积累.png'), fullPage: true });
  await accumulateCredits(page, costs[0]);
  await next.getByRole('button', { name: '升级至 Lv.2' }).click();
  await expect(page.locator('.merchant-company-level')).toHaveText('Lv.2');
  await expect(next).toHaveAttribute('data-stage', 'fleet-research');
  await expect(next.locator('[data-story-phase="fleet-planning"]')).toBeVisible();
  await expect(next).toContainText('原船继续经营');
  await accumulateCredits(page, techCost('berth_planning') + 40);
  await next.getByRole('button', { name: '研发船队扩容' }).click();
  const cash = async () => Number((await page.locator('#credits').textContent()).replaceAll(',', ''));
  let before = await cash();
  await page.locator('[data-tech="berth_planning"]').click();
  expect(await cash()).toBe(before - techCost('berth_planning'));
  await expect(page.locator('.merchant-company-capacity')).toContainText('1 / 2 艘');
  await page.locator('#merchant-dispatch-tab-tasks').click();
  await expect(next).toHaveAttribute('data-stage', 'research');
  await expect(next.locator('[data-story-phase="old-callsign"]')).toBeVisible();
  await expect(next).toContainText('现场勘察4分钟');
  await accumulateCredits(page, techCost('planet_survey') + 40);
  await next.getByRole('button', { name: '前往科技研发' }).click();
  before = await cash();
  await page.locator('[data-tech="planet_survey"]').click();
  expect(await cash()).toBe(before - techCost('planet_survey'));
  await page.locator('#merchant-dispatch-tab-tasks').click();
  const discovery = page.locator('#merchant-discovery-notice');
  await expect(next).toBeHidden();
  await expect(discovery).toContainText('探索已解锁');
  await expect(discovery).toContainText('原商路继续经营');
  await expect(discovery.locator('[data-operation="buy-explorer"]')).toBeDisabled();
  await expect(page.locator('[data-merchant-task]')).toHaveCount(1);
  await page.clock.resume();
  await discovery.getByRole('button', { name: '前往探索' }).click();
  await expect(page.locator('#merchant-exploration-panel')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#merchant-exploration-panel [data-exploration-dispatch]')).toBeDisabled();
  await page.locator('#merchant-exploration-panel').getByRole('button', { name: '准备空闲船' }).click();
  await expect(page.locator('#merchant-task-workspace')).toHaveClass(/is-active/);
  await expect(discovery).toBeFocused();
  await expect(page.locator('#bottom-nav [data-view="ships"]')).toBeHidden();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await accumulateCredits(page, 336 + 360 + 40);
  before = await cash();
  const buy = discovery.locator('[data-operation="buy-explorer"]');
  await expect(buy).toHaveText('添购探索轻舟 · 336 CR');
  await buy.focus(); await buy.press('Enter');
  expect(await cash()).toBe(before - 336);
  await expect(discovery.locator('[data-operation="explore"]')).toBeFocused();
  await expect(discovery.locator('[data-operation="buy-explorer"]')).toHaveCount(0);
  await expect(page.locator('.merchant-company-capacity')).toContainText('2 / 2 艘');
  await expect(page.locator('[data-merchant-task]')).toHaveCount(1);
  await page.clock.resume();
  await discovery.getByRole('button', { name: '前往探索' }).click();
  const exploration = page.locator('#merchant-exploration-panel');
  await expect(exploration).toBeVisible({ timeout: 30000 });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const legMs = Merchant.legDuration('courier', 'sol_prime', 'nebula_forge', { researchedTechIds: ['berth_planning', 'planet_survey'] });
  await expect(exploration.locator('[data-exploration-survey]')).toHaveText('4 分 0 秒');
  await expect(exploration.locator('[data-exploration-flight]')).toContainText('× 2（去程 / 返程）');
  await expect(exploration.locator('[data-exploration-eta]')).toContainText('4 分');
  await page.screenshot({ path: test.info().outputPath('二级探索分项耗时.png') });
  before = await cash();
  const dispatchedAt = await page.evaluate(() => Date.now());
  await exploration.getByRole('button', { name: '派船探索', exact: true }).click();
  expect(await cash()).toBe(before - 360);
  await expect(exploration.locator('[data-exploration-stage]')).toHaveText('探索去程');
  await exploration.getByRole('button', { name: '关闭探索详情' }).click();
  await page.locator('#bottom-nav [data-view="tasks"]').click();
  await expect(page.locator('[data-merchant-task]')).toHaveCount(1);
  await page.clock.setSystemTime(new Date(dispatchedAt + legMs + 1000)); await page.clock.runFor(600);
  await expect(discovery).toContainText('现场勘察剩余');
  await expect(discovery).not.toContainText('已开放');
  await page.clock.setSystemTime(new Date(dispatchedAt + legMs + 150_000)); await page.clock.runFor(600);
  await expect(discovery).not.toContainText('第二章');
  await page.clock.resume();
  await page.reload(); await expect(page.locator('#startup-loader')).toBeHidden();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await expect(page.locator('.merchant-company-level')).toHaveText('Lv.2');
  await expect(page.locator('[data-merchant-task]')).toHaveCount(1);
  await expect(discovery).toContainText('现场勘察剩余');
  await page.clock.resume();
  await discovery.getByRole('button', { name: '查看探索' }).click();
  await expect(exploration).toBeVisible({ timeout: 30000 });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await expect(exploration.locator('[data-exploration-stage]')).toHaveText('勘察中');
  await expect(exploration.locator('[data-exploration-phase-remaining]')).toContainText('1 分');
  const close = exploration.getByRole('button', { name: '关闭探索详情' });
  await close.focus(); await page.clock.runFor(1000); await expect(close).toBeFocused();
  await page.screenshot({ path: test.info().outputPath('现场勘察倒计时.png') });
  await page.clock.setSystemTime(new Date(dispatchedAt + legMs + 240_000 + 500)); await page.clock.runFor(600);
  await expect(exploration.locator('[data-exploration-stage]')).toHaveText('探索返港');
  await close.click(); await page.locator('#bottom-nav [data-view="tasks"]').click();
  await expect(discovery).not.toContainText('第二章');
  await page.clock.setSystemTime(new Date(dispatchedAt + 2 * legMs + 240_000 + 1000)); await page.clock.runFor(600);
  await expect(discovery.locator('[data-story-phase="factory-reconnected"]')).toContainText('岑遥');
  await expectStoryPortrait(discovery, '岑遥');
  await expect(discovery).toContainText('第二章 · 工厂仍在运转');
  await expect(next).toHaveAttribute('data-stage', 'second-route');
  await expect(next).toContainText('使用空闲');
  await discovery.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('二级开港通讯.png') });
  await next.getByRole('button', { name: '安排这条商路' }).click();
  await expect(form.locator('[name="shipIds"]:checked')).toHaveCount(1);
  expect(await form.locator('[name="shipIds"]:checked').inputValue()).not.toBe('ship-1');
  await form.getByRole('button', { name: '确认派遣' }).click();
  await expect(page.locator('[data-merchant-task]')).toHaveCount(2);
  await expect(next.locator('[data-story-phase="regular-service"]')).toBeVisible();
  for (let level = 2; level <= 5; level++) {
    const stage = MERCHANT_COMPANY_LEVELS[level - 1];
    await expect(next).toHaveAttribute('data-stage', stage.isBreakthrough ? 'breakthrough' : 'growth');
    if (stage.isBreakthrough) {
      await expectStoryPortrait(next, '闻衡');
      await page.screenshot({ path: test.info().outputPath(`突破评估-Lv${level}.png`) });
    }
    await accumulateCredits(page, stage.upgradeCost + 40);
    await next.getByRole('button', { name: `${stage.isBreakthrough ? '突破' : '升级'}至 Lv.${level + 1}` }).click();
    await expect(page.locator('.merchant-company-level')).toHaveText(`Lv.${level + 1}`);
  }
  await page.clock.resume();
  await page.reload(); await expect(page.locator('#startup-loader')).toBeHidden();
  await expect(page.locator('.merchant-company-level')).toHaveText('Lv.6');
  await expect(page.locator('[data-merchant-task]')).toHaveCount(2);
  await expect(page.locator('.merchant-company-capacity')).toContainText('2 / 2 艘');
});

test('航运任务卡整合多船进度与账目，切换收起保留焦点，调整和结束对应任务', async ({ page }) => {
  const fixture = await importFixture(page, { level: 33, configure: state => {
    const now = state.merchant.lastTickAt;
    expect(Merchant.command(state, 'buyShip', { typeId: 'clipper' }, now).ok).toBe(true);
    expect(Merchant.command(state, 'buyShip', { typeId: 'courier' }, now).ok).toBe(true);
    expect(Merchant.command(state, 'create', { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds: ['ship-1', 'ship-2'], budget: 304 }, now).ok).toBe(true);
    expect(Merchant.command(state, 'create', { from: 'mineral_belt', to: 'sol_prime', goodId: 'minerals', shipIds: ['ship-3'], budget: 200 }, now).ok).toBe(true);
  } });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const cards = page.locator('[data-merchant-task]');
  const first = cards.filter({ has: page.locator(`[data-merchant-action="select-task"][data-id="${fixture.merchant.tasks[0].id}"]`) });
  const second = cards.filter({ has: page.locator(`[data-merchant-action="select-task"][data-id="${fixture.merchant.tasks[1].id}"]`) });
  const firstSummary = first.locator('[data-merchant-action="select-task"]');
  const secondSummary = second.locator('[data-merchant-action="select-task"]');
  await expect(firstSummary).toHaveAttribute('aria-expanded', 'true');
  await expect(secondSummary).toHaveAttribute('aria-expanded', 'false');
  await expect(first.locator('[data-task-ship]')).toHaveCount(2);
  await expect(first).toContainText('待用货本');
  await expect(first).toContainText('首趟尚未结算');
  await expect(page.locator('.merchant-command-stage')).toBeHidden();
  const progress = first.locator('[role="progressbar"]').first();
  const before = Number(await progress.getAttribute('aria-valuenow'));
  const edit = first.locator('[data-merchant-action="edit"]');
  await edit.focus();
  const focusedNode = await edit.elementHandle();
  await page.clock.fastForward(1500);
  expect(Number(await progress.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
  expect(await focusedNode.evaluate(node => node === document.activeElement)).toBe(true);
  await firstSummary.press('Enter');
  await expect(first.locator('.merchant-task-body')).toBeHidden();
  await page.clock.fastForward(1000);
  await expect(firstSummary).toBeFocused();
  await expect(firstSummary).toHaveAttribute('aria-expanded', 'false');
  await secondSummary.click();
  await expect(second.locator('[data-task-ship]')).toHaveCount(1);
  await expect(second.locator('[data-task-ship]')).toHaveAttribute('data-task-ship', 'ship-3');
  await second.locator('[data-merchant-action="edit"]').click();
  await page.locator('#merchant-form [name="budget"]').fill('250');
  await page.locator('#merchant-form').getByRole('button', { name: '提交调整' }).click();
  await expect(second).toContainText('调整待生效');
  await expect(second.locator('[data-merchant-action="edit"]')).toBeDisabled();
  await expect(firstSummary).toHaveAttribute('aria-expanded', 'false');
  await second.locator('[data-merchant-action="stop"]').click();
  await expect(second.locator('[data-merchant-action="stop"]')).toBeDisabled();
  await expect(second).toContainText('返港后归还货本');
  await firstSummary.click();
  await edit.focus();
  const firstShip = fixture.merchant.ships[0];
  const firstSettlementAt = firstShip.arriveAt + firstShip.trip.legMs;
  const remaining = firstSettlementAt - await page.evaluate(() => Date.now());
  await page.clock.fastForward(Math.max(0, remaining) + 500);
  await expect(first.locator('.merchant-detail-last')).toContainText('最近结算');
  await expect(first.locator('[data-trip-eta]').last()).toContainText('返港');
  await expect(edit).toBeFocused();
  await expect(first.locator('[data-merchant-action="edit"]')).toBeEnabled();
  await firstSummary.focus();
  await noOverflow(page);
  await first.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('航运任务.png'), fullPage: true });
  await page.clock.fastForward(30_000);
  await expect(second).toHaveCount(0);
});

test('统计窗口、船型完整投入与真实旧结构导入可操作且无溢出', async ({ page }) => {
  const fixture = await importFixture(page, { level: 5, legacyPort: true, schemaVersion: 26, configure: state => {
    const now = state.merchant.lastTickAt;
    const created = Merchant.command(state, 'create', { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds: ['ship-1'], budget: 126 }, now);
    // 主动结束后只完成已锁定的一趟，后续才是可验证的无交易统计窗口。
    Merchant.command(state, 'stop', { taskId: created.taskId }, now);
    delete state.merchant.plans; delete state.merchant.analytics;
    delete state.merchant.exploration.nextPortId; delete state.merchant.exploration.completed;
    // v26 已开放工厂的档案没有第二港的预定信号。
    state.merchant.exploration.nextEventAt = 0;
    delete state.merchant.markets.aurora_depot; delete state.merchant.markets.nebula_forge.demand.alloys;
  } });
  await page.clock.fastForward(70_000);
  await page.locator('#bottom-nav [data-view="reports"]').click();
  const summary = page.locator('[data-report-summary]');
  await expect(summary).toContainText('最近 15 分钟');
  await expect(summary).toContainText('均利 42 CR');
  await expect(page.locator('.merchant-report-profit')).toContainText('累计净利');
  await expect(page.locator('.merchant-report-profit')).toContainText('+42 CR');
  await expect(page.locator('[data-report-window]')).toBeHidden();
  await expect(page.locator('#merchant-report-summary-note')).toContainText('全队闲置率');
  await page.locator('.merchant-report-toggle').press('Enter');
  const window = page.locator('[data-report-window]');
  await expect(window).toBeVisible();
  await window.selectOption('5');
  await window.focus();
  await page.clock.fastForward(6 * 60_000);
  await expect(window).toBeFocused();
  await expect(page.locator('[data-report-period-note]')).toContainText('此前 4 分钟');
  await expect(page.locator('[data-report-detail-metrics]')).toContainText('0 趟');
  await expect(summary).toContainText('最近 15 分钟');
  await expect(summary).toContainText('1 趟');
  await expect(page.locator('.merchant-report-profit')).toContainText('+42 CR');
  // 已在首航出发时主动结束，只保留一次完整返港结算。
  await expect(page.locator('.merchant-report-row')).toHaveCount(1);
  await noOverflow(page);
  await page.screenshot({ path: test.info().outputPath('经营报告.png'), fullPage: true });
  await page.locator('#bottom-nav [data-view="ships"]').click();
  await expect(page.locator('[data-investment-type]')).toHaveCount(6);
  await expect(page.locator('[data-investment-type="relay"]')).toContainText(`${getPendingTechChain({ researchedTechIds: fixture.merchant.researchedTechIds }, 'integrated_freight').reduce((sum, tech) => sum + tech.cost, 0).toLocaleString('zh-CN')} CR`);
  await expect(page.locator('[data-merchant-shop-type="relay"]')).toHaveCount(0);
  await page.locator('[data-investment-route]').selectOption('nebula_forge:sol_prime:technology');
  await expect(page.locator('[data-investment-type="bulk"]')).toContainText('完整投入');
  await noOverflow(page);
  await page.locator('#merchant-investment-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('投资比较.png'), fullPage: true });
  const before = await page.locator('#credits').textContent();
  await openTools(page);
  await page.locator('[data-tool="tab"][data-tab="saves"]').click();
  const choosing = page.waitForEvent('filechooser');
  await page.locator('[data-tool="import"][data-slot="1"]').click();
  await page.locator('[data-tool="confirm-yes"]').click();
  const chooser = await choosing;
  await chooser.setFiles({ name: 'damaged.json', mimeType: 'application/json', buffer: Buffer.from('{bad json}') });
  await expect(page.locator('#merchant-tools-status')).toContainText('导入失败');
  await page.keyboard.press('Escape');
  await expect(page.locator('#credits')).toHaveText(before);
});

test('原料港探索途中刷新、完整返港与经营页新港商路派遣形成闭环', async ({ page }) => {
  test.setTimeout(90000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await importFixture(page, { level: 57, legacyPort: true, credits: 12000, configure: state => {
    state.merchant.exploration.rngState = 42;
    const now = state.merchant.lastTickAt;
    Merchant.advance(state, now);
    Merchant.advance(state, state.merchant.exploration.nextEventAt);
  } });
  await expect(page.locator('#merchant-discovery-notice')).toContainText('发现未知星球信号');
  await page.locator('[data-operation="explore"]').click();
  await expect(page.locator('#merchant-exploration-panel')).toBeVisible({ timeout: 30000 });
  const exploration = page.locator('#merchant-exploration-panel');
  await exploration.locator('[name="from"]').selectOption('nebula_forge');
  await expect(exploration.locator('[data-exploration-cost]')).toHaveText('1,800 CR');
  await exploration.getByRole('button', { name: '派船探索' }).click();
  await expect(page.locator('#credits')).toHaveText('10,200');
  await page.locator('#bottom-nav [data-view="tasks"]').click();
  await page.clock.fastForward(50_000);
  await page.reload();
  await expect(page.locator('#startup-loader')).toBeHidden();
  await expect(page.locator('#merchant-discovery-notice')).toContainText(/去程飞行|现场勘察/);
  await page.clock.fastForward(8 * 60_000 + 2 * Merchant.legDuration('courier', 'nebula_forge', 'aurora_depot', {}) + 90_000);
  await expect(page.locator('#merchant-discovery-notice')).toContainText('聚宝原料星已开放');
  await expect(page.locator('#credits')).toHaveText('10,200');
  await page.locator('[data-operation="port"]').click();
  await expect(page.locator('#merchant-task-workspace .merchant-port-panel')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#map-section .merchant-port-panel')).toHaveCount(0);
  await expect(page.locator('#map-section .merchant-new-port-routes')).toHaveCount(0);
  await expect(page.locator('.merchant-port-panel')).toContainText('工业原料');
  await page.screenshot({ path: test.info().outputPath('新港商路.png'), fullPage: true });
  await page.locator('[data-port-route][data-good="alloys"]').click();
  const form = page.locator('#merchant-form');
  await expect(form).toBeVisible();
  await expect(form.locator('[name="from"]')).toHaveValue('aurora_depot');
  await expect(form.locator('[name="goodId"]')).toHaveValue('alloys');
  await form.getByRole('button', { name: '确认派遣' }).click();
  await expect(page.locator('#merchant-task-list')).toContainText('聚宝原料星');
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test('航运科技集中在经营研发类型内，船只页只采购，分类切换和读档保留研发成果', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const startingCredits = MERCHANT_TECHS.reduce((sum, tech) => sum + tech.cost, 0) + 50000;
  await importFixture(page, { level: 75, credits: startingCredits, legacyAccess: false, configure: state => {
    state.merchant.researchedTechIds = ['fleet_command'];
  } });
  const ships = page.locator('#merchant-ship-workspace');
  await page.locator('#bottom-nav [data-view="ships"]').click();
  await expect(ships.locator('#merchant-tech-section, [data-merchant-action="research"]')).toHaveCount(0);
  await expect(ships.getByRole('heading', { name: '航运科技', exact: true })).toHaveCount(0);
  await expect(ships.locator('.merchant-shop-card')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('船只页研发移除.png') });
  await page.locator('#bottom-nav [data-view="tasks"]').click();
  await page.locator('#merchant-dispatch-tab-research').click();
  const research = page.locator('#merchant-research');
  const categories = research.getByRole('group', { name: '科技类型' });
  const shipping = categories.getByRole('button', { name: '航运科技', exact: true });
  const all = categories.getByRole('button', { name: '全部', exact: true });
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(research.locator('[data-research-tech]')).toHaveCount(65);
  await expect(research.locator('[data-research-tech="fleet_command"]')).toHaveClass(/is-complete/);
  await expect(all.locator('span')).toHaveText('65');
  await shipping.focus(); await shipping.press('Enter');
  await expect(shipping).toHaveAttribute('aria-pressed', 'true');
  await expect(research.locator('[data-research-tech]')).toHaveCount(5);
  await expect(research.locator('[data-research-tech]:not([data-tech-category="航运科技"])')).toHaveCount(0);
  await expect(research.locator('[data-research-tech="integrated_freight"]')).toContainText('前置：快速航路、重载物流');
  await expect(research.locator('[data-tech="integrated_freight"]')).toBeDisabled();
  const focused = await shipping.elementHandle();
  await page.clock.runFor(2000);
  expect(await focused.evaluate(node => node === document.activeElement)).toBe(true);
  const income = categories.getByRole('button', { name: '收益', exact: true });
  await income.focus(); await income.press('Space');
  await expect(income).toHaveAttribute('aria-pressed', 'true');
  await expect(research.locator('[data-research-tech]')).toHaveCount(15);
  await all.focus(); await all.press('Enter');
  await expect(research.locator('[data-research-tech]')).toHaveCount(65);
  await shipping.click();
  await expect(shipping).toHaveAttribute('aria-pressed', 'true');
  await expect(all).toHaveAttribute('aria-pressed', 'false');
  await expect(shipping).toBeFocused();
  const unselectedMaterial = await all.evaluate(node => getComputedStyle(node).backgroundImage);
  await expect.poll(() => shipping.evaluate(node => getComputedStyle(node).backgroundImage)).not.toBe(unselectedMaterial);
  await showResearchInViewport(page);
  await page.screenshot({ path: testInfo.outputPath('航运科技类型.png'), animations: 'disabled' });
  let spent = 0;
  const completedIds = ['fleet_command'];
  const shippingTechs = MERCHANT_TECHS.filter(item => item.category === '航运科技');
  for (const [index, tech] of shippingTechs.entries()) {
    const prerequisites = getPendingTechChain({ researchedTechIds: completedIds }, tech.id).filter(item => item.id !== tech.id);
    if (prerequisites.length) {
      await all.click();
      for (const required of prerequisites) {
        await research.locator(`[data-tech="${required.id}"]`).click(); spent += required.cost; completedIds.push(required.id);
      }
      await shipping.click();
    }
    const button = research.locator(`[data-merchant-action="research"][data-tech="${tech.id}"]`);
    await expect(button).toBeEnabled();
    await button.focus(); await button.press('Enter'); spent += tech.cost; completedIds.push(tech.id);
    await expect(research.locator(`[data-research-tech="${tech.id}"]`)).toHaveClass(/is-complete/);
    await expect(research.locator(`[data-research-tech="${tech.id}"] [data-tree-action="inspect"]`)).toBeFocused();
    await expect(shipping).toHaveAttribute('aria-pressed', 'true');
    await expect(research.locator('[data-research-tech]')).toHaveCount(shippingTechs.length);
    await expect(research.locator('[data-research-tech].is-complete')).toHaveCount(index + 1);
    await expect(shipping.locator('span')).toHaveText(String(shippingTechs.length));
    await expect(all.locator('span')).toHaveText(String(MERCHANT_TECHS.length));
    await expect(page.locator('#credits')).toHaveText((startingCredits - spent).toLocaleString('zh-CN'));
  }
  await expect(research.locator('#merchant-research-progress')).toHaveText(`${completedIds.length} / 65 已完成`);
  await expect(research.locator('#merchant-tech-empty')).toHaveCount(0);
  await expect(research.locator('#merchant-tech-filter-status')).toHaveText('航运科技 · 5 项 · 5 已研发 · 0 待研发');
  await showResearchInViewport(page);
  await page.screenshot({ path: testInfo.outputPath('航运科技全部完成.png'), animations: 'disabled' });
  await all.click();
  await expect(research.locator('[data-research-tech]')).toHaveCount(65);
  await expect(research.locator('[data-tech-category="航运科技"].is-complete')).toHaveCount(5);
  await expect(research.locator('#merchant-tech-empty')).toHaveCount(0);
  await expect(research.locator('#merchant-tech-filter-status')).toHaveText(`全部科技 · 65 项 · ${completedIds.length} 已研发 · ${65 - completedIds.length} 待研发`);
  await showResearchInViewport(page);
  await page.screenshot({ path: testInfo.outputPath('待研发科技.png'), animations: 'disabled' });
  await shipping.click();
  await page.locator('#bottom-nav [data-view="ships"]').click();
  await expect(ships.locator('.merchant-shop-card')).toHaveCount(6);
  await expect(ships.locator('[data-merchant-action="research"]')).toHaveCount(0);
  await ships.locator('[data-merchant-shop-type="swift"] [data-merchant-action="buy"]').click();
  await expect(ships.locator('[data-merchant-owned-type="swift"]')).toContainText('拥有 1 艘');
  await expect(page.locator('#credits')).toHaveText((startingCredits - spent - 850).toLocaleString('zh-CN'));
  await page.locator('#bottom-nav [data-view="tasks"]').click();
  await page.locator('#merchant-dispatch-tab-research').click();
  await expect(shipping).toHaveAttribute('aria-pressed', 'true');
  await expect(research.locator('[data-research-tech].is-complete')).toHaveCount(5);
  await expect(research.locator('#merchant-tech-empty')).toHaveCount(0);
  await page.reload(); await expect(page.locator('#startup-loader')).toBeHidden();
  await page.locator('#merchant-dispatch-tab-research').click();
  await expect(research.locator('[data-research-tech]')).toHaveCount(65);
  await expect(research.locator('[data-tech-category="航运科技"].is-complete, [data-research-tech="fleet_command"].is-complete')).toHaveCount(6);
  await shipping.click();
  await expect(research.locator('[data-research-tech].is-complete')).toHaveCount(5);
  await expect(shipping.locator('span')).toHaveText('5');
  await expect(research.locator('#merchant-tech-empty')).toHaveCount(0);
  await expect(research.locator('#merchant-research-progress')).toHaveText(`${completedIds.length} / 65 已完成`);
  await expect(page.locator('#credits')).toHaveText((startingCredits - spent - 850).toLocaleString('zh-CN'));
});

test('v30科技细分读档保留加成和已研发卡片，后续小项单独扣款', async ({ page }, testInfo) => {
  const startingCredits = techCost('payment_terms') + 12000;
  await importFixture(page, { level: 10, credits: startingCredits, legacyAccess: false, schemaVersion: 30, configure: state => {
    state.merchant.researchedTechIds = ['efficient_engines', 'engine_tuning', 'cargo_racks', 'trade_contracts', 'fleet_command', 'market_network', 'planet_survey'];
  } });
  await page.locator('#merchant-dispatch-tab-research').click();
  const research = page.locator('#merchant-research');
  await expect(research.locator('#merchant-research-progress')).toHaveText('24 / 65 已完成');
  await expect(research.locator('[data-research-tech]')).toHaveCount(65);
  await expect(research.locator('[data-research-tech].is-complete')).toHaveCount(24);
  await expect(research.locator('[data-research-tech="efficient_engines"].is-complete, [data-research-tech="thruster_calibration"].is-complete, [data-research-tech="engine_tuning"].is-complete, [data-research-tech="cargo_racks"].is-complete, [data-research-tech="trade_contracts"].is-complete')).toHaveCount(5);
  for (const bonus of ['航速 +15%', '载量 +10%', '商路净利 +5%']) await expect(research.locator('#merchant-research-bonuses')).toContainText(bonus);
  await expect(page.locator('#credits')).toHaveText(startingCredits.toLocaleString('zh-CN'));
  await research.locator('#merchant-tech-categories [data-category="收益"]').click();
  await expect(research.locator('[data-research-tech]')).toHaveCount(15);
  const payment = research.locator('[data-merchant-action="research"][data-tech="payment_terms"]');
  await expect(payment).toHaveText(`研发 · ${techCost('payment_terms').toLocaleString('zh-CN')} CR`);
  await payment.focus(); await payment.press('Enter');
  await expect(payment).toHaveText('已研发'); await expect(payment).toBeDisabled();
  await expect(research.locator('[data-research-tech]')).toHaveCount(15);
  await expect(research.locator('#merchant-research-progress')).toHaveText('25 / 65 已完成');
  await expect(research.locator('#merchant-research-bonuses')).toContainText('商路净利 +7%');
  await expect(research.locator('[data-research-tech="payment_terms"] [data-tree-action="inspect"]')).toBeFocused();
  await expect(page.locator('#credits')).toHaveText('12,000');
  await expect(page.locator('.merchant-company-level')).toHaveText('Lv.51');
  await showResearchInViewport(page);
  await page.screenshot({ path: testInfo.outputPath('科技细分旧档恢复.png'), animations: 'disabled' });
  await page.reload(); await expect(page.locator('#startup-loader')).toBeHidden();
  await page.locator('#merchant-dispatch-tab-research').click();
  await expect(research.locator('[data-research-tech]')).toHaveCount(65);
  await expect(payment).toHaveText('已研发'); await expect(payment).toBeDisabled();
  await expect(research.locator('#merchant-research-progress')).toHaveText('25 / 65 已完成');
  await expect(research.locator('#merchant-research-bonuses')).toContainText('商路净利 +7%');
  await expect(page.locator('#credits')).toHaveText('12,000');
  await page.locator('#bottom-nav [data-view="ships"]').click();
  await expect(page.locator('[data-merchant-owned-type="courier"]')).toContainText('载量 13 · 1.61× 航速');
});

test('科技研发替代经营方案，65项研发完成后六类能力实际生效并可恢复', async ({ page }) => {
  test.setTimeout(90000);
  const startingCredits = MERCHANT_TECHS.reduce((sum, tech) => sum + tech.cost, 0) + 200000;
  await importFixture(page, { level: 100, credits: startingCredits, legacyAccess: false });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  // 未提交派遣只是草稿，进入研发时隐藏，返回后保留配置并更新真实参数。
  await page.locator('[data-merchant-action="new"]').first().click();
  const draft = page.locator('#merchant-form');
  await draft.locator('[name="budget"]').fill('220');
  await expect(draft.locator('#merchant-ship-picks')).toContainText('载量 12 · 1.40×');
  const tab = page.locator('#merchant-dispatch-tab-research');
  await expect(page.locator('#bottom-nav [data-view="ships"]')).toBeHidden();
  await expect(page.locator('#bottom-nav [data-view="market"]')).toBeHidden();
  await tab.focus(); await tab.press('Enter');
  await expect(page.locator('#merchant-research')).toBeVisible();
  await expect(draft).toBeHidden();
  await expect(page.locator('#merchant-dispatch-tasks')).toBeHidden();
  await expect(page.locator('[data-research-tech]')).toHaveCount(65);
  await expect(page.locator('#merchant-operating-plans,[data-operation="preview-plan"]')).toHaveCount(0);
  await expect(page.locator('#merchant-research-bonuses')).toContainText('航速 +0%');
  await showResearchInViewport(page);
  await page.screenshot({ path: test.info().outputPath('科技研发可选.png'), fullPage: true });
  const geometry = await techGeometry(page.locator('#merchant-research'));
  const viewportSize = await page.locator('#merchant-tech-tree-viewport').evaluate(node => [node.clientWidth, node.clientHeight, node.scrollHeight]);
  let researchSpent = 0;
  for (const [index, tech] of MERCHANT_TECHS.entries()) {
    const button = page.locator(`[data-merchant-action="research"][data-tech="${tech.id}"]`);
    await expect(button).toBeEnabled();
    await expect(button).toHaveText(`研发 · ${tech.cost.toLocaleString('zh-CN')} CR`);
    await button.click(); researchSpent += tech.cost;
    await expect(page.locator('#credits')).toHaveText((startingCredits - researchSpent).toLocaleString('zh-CN'));
    await expect(button).toHaveText('已研发'); await expect(button).toBeDisabled();
    await expect(page.locator('[data-research-tech]')).toHaveCount(MERCHANT_TECHS.length);
    await expect(page.locator('[data-research-tech].is-complete')).toHaveCount(index + 1);
    await expect(page.locator('#merchant-tech-categories [data-category="all"] span')).toHaveText(String(MERCHANT_TECHS.length));
    await expect(page.locator(`[data-research-tech="${tech.id}"] [data-tree-action="inspect"]`)).toBeFocused();
    expect(await techGeometry(page.locator('#merchant-research'))).toEqual(geometry);
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }
  await expect(page.locator('#merchant-research-progress')).toHaveText('65 / 65 已完成');
  await expect(page.locator('#merchant-tech-empty')).toHaveCount(0);
  await expect(page.locator('#merchant-tech-filter-status')).toHaveText('全部科技 · 65 项 · 65 已研发 · 0 待研发');
  expect(await page.locator('#merchant-tech-categories button span').allTextContents()).toEqual(['65', ...MERCHANT_TECH_CATEGORIES.map(category => String(MERCHANT_TECHS.filter(tech => tech.category === category).length))]);
  expect(await page.locator('#merchant-tech-tree-viewport').evaluate(node => [node.clientWidth, node.clientHeight, node.scrollHeight])).toEqual(viewportSize);
  await expect(page.locator('#merchant-research-bonuses')).toContainText('航速 +30%');
  await expect(page.locator('#merchant-research-bonuses')).toContainText('载量 +45%');
  await expect(page.locator('#merchant-research-bonuses')).toContainText('商路净利 +30%');
  await expect(page.locator('#merchant-research-bonuses')).toContainText('船位 +15');
  await expect(page.locator('.merchant-company-capacity')).toContainText('/ 45 艘');
  await expect(page.locator('.merchant-company-capacity')).toContainText('基础 30 · 研发 +15');
  await showResearchInViewport(page);
  await page.screenshot({ path: test.info().outputPath('科技研发.png'), fullPage: true });
  await page.locator('#merchant-dispatch-tab-tasks').click();
  await expect(draft).toBeVisible();
  await expect(draft.locator('[name="budget"]')).toHaveValue('220');
  await expect(draft.locator('#merchant-ship-picks')).toContainText('载量 17 · 1.82×');
  await expect(draft.locator('.merchant-inline-ship-row')).toHaveCount(6);
  await expect(draft.locator('#merchant-plan-preview')).toContainText('+93 CR');
  await closeForm(page);
  await page.locator('#bottom-nav [data-view="ships"]').click();
  await expect(page.locator('[data-merchant-owned-type="courier"]')).toContainText('载量 17 · 1.82× 航速');
  await expect(page.locator('.merchant-shop-card')).toHaveCount(6);
  await expect(page.locator('[data-investment-type="courier"]')).toContainText('净利 +93 CR');
  await page.locator('#bottom-nav [data-view="tasks"]').click();
  await page.locator('[data-merchant-action="new"]').first().click();
  const form = page.locator('#merchant-form');
  await form.locator('[name="from"]').selectOption('sol_prime');
  await form.locator('[name="to"]').selectOption('mineral_belt');
  await form.locator('[name="goodId"]').selectOption('food');
  await form.locator('[name="shipIds"][value="ship-1"]').check();
  await form.locator('[name="budget"]').fill('220');
  await expect(form.locator('#merchant-budget-recommendation')).toContainText('166 CR');
  await expect(form.locator('#merchant-plan-preview')).toContainText('+93 CR');
  await expect(form.locator('[name="remember"],[data-merchant-action="save-plan"]')).toHaveCount(0);
  await form.getByRole('button', { name: '确认派遣' }).click();
  await page.clock.fastForward(14000);
  await expect(page.locator('[data-merchant-task]')).toContainText('+93 CR');
  await page.clock.resume();
  await page.reload(); await expect(page.locator('#startup-loader')).toBeHidden();
  await page.locator('#merchant-dispatch-tab-research').click();
  await expect(page.locator('#merchant-research-progress')).toHaveText('65 / 65 已完成');
  await expect(page.locator('#merchant-research-bonuses')).toContainText('载量 +45%');
  await expect(page.locator('[data-research-tech].is-complete')).toHaveCount(65);
  await expect(page.locator('#merchant-tech-empty')).toHaveCount(0);
  expect(await techGeometry(page.locator('#merchant-research'))).toEqual(geometry);
});

test('百级公司逐级升级，五级突破只显示当前阶路线，费用和焦点完整恢复', async ({ page }, testInfo) => {
  test.setTimeout(180000);
  const total = MERCHANT_COMPANY_LEVELS.reduce((sum, stage) => sum + (stage.upgradeCost ?? 0), 0);
  await importFixture(page, { credits: total + 126 + 74, legacyAccess: false, configure: state => {
    expect(Merchant.command(state, 'create', { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds: ['ship-1'], budget: 126 }, state.merchant.lastTickAt).ok).toBe(true);
  } });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const company = page.locator('#merchant-company-growth');
  const upgrade = company.locator('.merchant-company-upgrade button');
  const roadmap = company.locator('.merchant-company-roadmap');
  await roadmap.locator('summary').click();
  await expect(company.locator('.merchant-company-goal')).toContainText('船位规划');
  await expect(company.locator('.merchant-company-goal')).toContainText('新港勘察');
  await expect(company.locator('.merchant-company-next-unlock')).toContainText('船位规划');
  await expect(roadmap.locator('[data-company-level="2"] .merchant-company-roadmap-effects > span')).toHaveCount(2);
  let paid = 0;
  for (const stage of MERCHANT_COMPANY_LEVELS.slice(0, -1)) {
    await expect(page.locator('.merchant-company-level')).toHaveText(`Lv.${stage.level}`);
    await expect(roadmap).toHaveAttribute('data-company-tier', String(stage.tier));
    await expect(roadmap.locator('li')).toHaveCount(5);
    expect(await roadmap.locator('li').evaluateAll(nodes => nodes.map(node => Number(node.dataset.companyLevel))))
      .toEqual(Array.from({ length: 5 }, (_, index) => stage.tierStartLevel + index));
    await expect(roadmap.locator('[aria-current="step"]')).toContainText(`Lv.${stage.level}`);
    await expect(company).not.toContainText(/公司成长|积累公司等级|推进当前阶段|基础船位不变|公司发展已完成/);
    if (stage.level === 4) await expect(company.locator('.merchant-company-goal')).toContainText('达到 Lv.5 后可突破至 Lv.6');
    if (stage.level === 41) await expect(company.locator('.merchant-company-goal')).toContainText('基础船位 +1');
    if (stage.level === 61) await expect(company.locator('.merchant-company-goal')).toHaveCount(0);
    await expect(upgrade).toHaveAttribute('data-from-level', String(stage.level));
    await expect(upgrade).toHaveAttribute('data-target-level', String(stage.level + 1));
    await expect(upgrade).toHaveAttribute('data-merchant-action', stage.isBreakthrough ? 'breakthrough-company' : 'upgrade-company');
    await expect(upgrade).toHaveText(`${stage.isBreakthrough ? '突破' : '升级'}公司至 Lv.${stage.level + 1}`);
    await expect(company.locator('.merchant-company-cost')).toHaveText(`${stage.upgradeCost.toLocaleString('zh-CN')} CR`);
    if (stage.isBreakthrough) {
      await expect(company.locator('.merchant-company-breakthrough-cost')).toBeVisible();
      await expect(company.locator('.merchant-company-breakthrough-cost')).toHaveText(`升至 Lv.${stage.level} 的费用 ${stage.breakthroughBaseCost.toLocaleString('zh-CN')} CR × ${stage.breakthroughFactor}`);
      await expect(company).toContainText(`第 ${stage.tier} 阶突破`);
      await expect(company.locator('[data-merchant-action="upgrade-company"]')).toHaveCount(0);
    } else await expect(company).toContainText('每次提升 1 级');
    if ([1, 5, 41, 50, 61, 95].includes(stage.level)) {
      await showCompanyInViewport(page);
      await noOverflow(page);
      expect(await roadmap.locator('ol').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`公司${stage.isBreakthrough ? '突破' : '发展'}Lv${stage.level}.png`) });
    }
    await upgrade.focus(); await upgrade.press('Enter'); paid += stage.upgradeCost;
    await expect(page.locator('.merchant-company-level')).toHaveText(`Lv.${stage.level + 1}`);
    await expect(page.locator('#merchant-feedback')).not.toContainText(/公司成长|积累公司等级|推进当前阶段|，。|undefined|null/);
    if (stage.level === 1) {
      await expect(page.locator('#merchant-feedback')).toContainText('公司已升级至 Lv.2');
      await expect(page.locator('#merchant-feedback')).toContainText('船位规划');
      await expect(page.locator('#merchant-feedback')).toContainText('新港勘察');
    }
    await expect(page.locator('#credits')).toHaveText((total + 74 - paid).toLocaleString('zh-CN'));
    await expect(page.locator('[data-merchant-task]')).toHaveCount(1);
    await expect(page.locator('[data-merchant-task]')).toContainText('126 CR');
    await expect(stage.level < 99 ? upgrade : page.locator('.merchant-company-level')).toBeFocused();
    await expect(roadmap).toHaveAttribute('open', '');
  }
  await expect(upgrade).toHaveText('最高等级'); await expect(upgrade).toBeDisabled();
  expect(await roadmap.locator('li').evaluateAll(nodes => nodes.map(node => Number(node.dataset.companyLevel)))).toEqual([96, 97, 98, 99, 100]);
  await showCompanyInViewport(page);
  await page.screenshot({ path: testInfo.outputPath('公司满级100.png') });
  await page.clock.resume(); await page.reload(); await expect(page.locator('#startup-loader')).toBeHidden();
  await expect(page.locator('.merchant-company-level')).toHaveText('Lv.100');
  await expect(page.locator('#credits')).toHaveText('74'); await expect(upgrade).toBeDisabled();
  await importFixture(page, { level: 5, credits: 4273, legacyAccess: false }, 2);
  await expect(upgrade).toHaveText('突破公司至 Lv.6'); await expect(upgrade).toBeDisabled();
  await expect(company).toContainText('需保留 74 CR 首航货本');
  await expect(page.locator('.merchant-company-level')).toHaveText('Lv.5');
});

test('科技资格沿百级分布，前置、扣费和焦点稳定，研发后才开放船型与功能', async ({ page }) => {
  const credits = MERCHANT_COMPANY_LEVELS.slice(0, 14).reduce((sum, stage) => sum + stage.upgradeCost, 0)
    + MERCHANT_TECHS.filter(tech => tech.companyLevel <= 15).reduce((sum, tech) => sum + tech.cost, 0) + 1000;
  await importFixture(page, { level: 1, credits, legacyAccess: false });
  const tasks = page.locator('#merchant-dispatch-tab-tasks'), techs = page.locator('#merchant-dispatch-tab-research');
  const advance = page.locator('.merchant-company-upgrade button');
  await tasks.focus(); await tasks.press('ArrowRight');
  await expect(techs).toBeFocused(); await expect(techs).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-tech="clipper_design"]')).toBeDisabled();
  await expect(page.locator('[data-tech="clipper_design"]')).toHaveText('Lv.6 解锁');
  await showResearchInViewport(page);
  await page.screenshot({ path: test.info().outputPath('百级科技等级门槛.png') });
  let level = 1, paid = 0;
  for (const [id, bonus] of [['efficient_engines', 2], ['thruster_calibration', 4], ['fuel_injection', 5]]) {
    const tech = MERCHANT_TECHS.find(item => item.id === id);
    while (level < tech.companyLevel) { paid += MERCHANT_COMPANY_LEVELS[level - 1].upgradeCost; await advance.click(); level++; }
    const button = page.locator(`[data-merchant-action="research"][data-tech="${id}"]`);
    await expect(button).toBeEnabled(); await button.focus(); await button.press('Enter'); paid += tech.cost;
    await expect(page.locator('.merchant-company-level')).toHaveText(`Lv.${level}`);
    await expect(page.locator('#credits')).toHaveText((credits - paid).toLocaleString('zh-CN'));
    await expect(page.locator('#merchant-research-bonuses')).toContainText(`航速 +${bonus}%`);
    await expect(button).toHaveText('已研发'); await expect(button).toBeDisabled();
    await expect(page.locator(`[data-research-tech="${id}"] [data-tree-action="inspect"]`)).toBeFocused();
  }
  while (level < 10) { await advance.click(); level++; }
  await expect(page.locator('[data-research-tech="hauler_design"]')).toContainText('前置：翻身船体');
  await expect(page.locator('[data-tech="hauler_design"]')).toBeDisabled();
  const button = page.locator('[data-tech="clipper_design"]');
  await button.focus(); const node = await button.elementHandle(); await page.clock.runFor(2000);
  expect(await node.evaluate(element => element === document.activeElement)).toBe(true);
  await button.press('Enter');
  await expect(button).toHaveText('已研发'); await expect(button).toBeDisabled();
  await expect(page.locator('[data-research-tech="clipper_design"] [data-tree-action="inspect"]')).toBeFocused();
  await expect(page.locator('[data-tech="hauler_design"]')).toBeEnabled();
  await techs.focus(); await techs.press('Home');
  await expect(tasks).toBeFocused(); await expect(tasks).toHaveAttribute('aria-selected', 'true');
  await page.locator('[data-merchant-action="new"]').first().click();
  await expect(page.locator('.merchant-inline-ship-row')).toHaveCount(2);
  await expect(page.locator('#merchant-form')).toContainText('翻身快船'); await closeForm(page); await techs.click();
  while (level < 15) { await advance.click(); level++; }
  await expect(page.locator('#bottom-nav [data-view="ships"]')).toBeHidden();
  await expect(page.locator('[data-tech="fleet_command"]')).toBeDisabled();
  await page.locator('[data-tech="hauler_design"]').click();
  await page.locator('[data-tech="berth_planning"]').click();
  await page.locator('[data-tech="fleet_command"]').click();
  await expect(page.locator('#bottom-nav [data-view="ships"]')).toBeVisible();
  await expect(page.locator('#bottom-nav [data-view="market"]')).toBeHidden();
});

test('公司基础船位与扩容研发分开，满船位研发后可采购并在刷新后保持', async ({ page }, testInfo) => {
  await importFixture(page, { level: 9, credits: 10000, legacyAccess: false });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const capacity = page.locator('.merchant-company-capacity');
  await expect(capacity).toContainText('1 / 1 艘');
  await expect(capacity).toContainText('基础 1 · 研发 +0');
  await page.locator('[data-merchant-action="new"]').first().click();
  await page.locator('#merchant-form .merchant-inline-shipyard > summary').click();
  const quantity = page.locator('#merchant-form [data-merchant-quantity="courier"]');
  const buy = page.locator('[data-merchant-action="buy-in-form"][data-type="courier"]');
  await expect(quantity).toBeDisabled(); await expect(buy).toBeDisabled();
  await expect(buy.locator('..')).toContainText('研发船队扩容');
  await closeForm(page);
  await page.locator('#merchant-dispatch-tab-research').click();
  await page.locator('[data-tech="clipper_design"]').click();
  const filter = page.locator('#merchant-tech-categories [data-category="船队扩容"]');
  await filter.click(); await expect(filter.locator('span')).toHaveText('11');
  await expect(page.locator('[data-research-tech]')).toHaveCount(11);
  await expect(page.locator('[data-tech="dock_scheduling"]')).toBeDisabled();
  await page.locator('[data-tech="berth_planning"]').focus();
  await page.locator('[data-tech="berth_planning"]').press('Enter');
  await expect(page.locator('[data-research-tech="berth_planning"] [data-tree-action="inspect"]')).toBeFocused();
  await expect(page.locator('[data-research-tech="berth_planning"]')).toHaveClass(/is-complete/);
  await expect(filter.locator('span')).toHaveText('11');
  await expect(capacity).toContainText('1 / 2 艘');
  await expect(capacity).toContainText('基础 1 · 研发 +1');
  await expect(page.locator('.merchant-company-goal')).toContainText('聚财船体');
  await expect(page.locator('#merchant-research-bonuses')).toContainText('船位 +1');
  await expect(page.locator('#credits')).toHaveText((10000 - techCost('clipper_design') - techCost('berth_planning')).toLocaleString('zh-CN'));
  await showResearchInViewport(page);
  await page.screenshot({ path: testInfo.outputPath('船队扩容研发.png') });
  await page.locator('#merchant-dispatch-tab-tasks').click();
  await page.locator('[data-merchant-action="new"]').first().click();
  await page.locator('#merchant-form .merchant-inline-shipyard > summary').click();
  await expect(quantity).toBeEnabled(); await expect(quantity).toHaveAttribute('max', '1');
  await expect(buy).toBeEnabled(); await buy.click();
  await expect(page.locator('#merchant-ship-picks [name="shipIds"]')).toHaveCount(2);
  await expect(buy).toBeDisabled(); await expect(quantity).toBeDisabled();
  await expect(page.locator('#credits')).toHaveText((10000 - techCost('clipper_design') - techCost('berth_planning') - 336).toLocaleString('zh-CN'));
  await closeForm(page);
  await expect(capacity).toContainText('2 / 2 艘');
  await showCompanyInViewport(page);
  await page.screenshot({ path: testInfo.outputPath('公司船位拆分.png') });
  await openTools(page); await page.locator('[data-tool="tab"][data-tab="saves"]').click();
  await page.locator('[data-tool="save"][data-slot="2"]').click();
  await expect(page.locator('#merchant-tools-status')).toContainText('存档成功');
  await page.getByRole('button', { name: '关闭设置' }).click();
  await page.clock.resume(); await page.reload(); await expect(page.locator('#startup-loader')).toBeHidden();
  await expect(page.locator('.merchant-company-level')).toHaveText('Lv.9');
  await expect(capacity).toContainText('2 / 2 艘');
  await expect(capacity).toContainText('基础 1 · 研发 +1');
  await expect(page.locator('#credits')).toHaveText((10000 - techCost('clipper_design') - techCost('berth_planning') - 336).toLocaleString('zh-CN'));
  await page.locator('#merchant-dispatch-tab-research').click(); await filter.click();
  await expect(page.locator('[data-research-tech="berth_planning"]')).toHaveClass(/is-complete/);
  await expect(filter.locator('span')).toHaveText('11');
});

test('v31满额船队读档保留现有船和已研发扩容卡片，后续扩容仍需研发', async ({ page }, testInfo) => {
  await importFixture(page, { level: 10, credits: 12000, legacyAccess: false, schemaVersion: 31, configure: state => {
    const template = structuredClone(state.merchant.ships[0]);
    state.merchant.ships = Array.from({ length: 18 }, (_, index) => ({ ...structuredClone(template), id: `ship-${index + 1}` }));
    state.merchant.nextId = 19;
    state.merchant.researchedTechIds = ['fleet_command'];
  } });
  const capacity = page.locator('.merchant-company-capacity');
  await expect(capacity).toContainText('18 / 15 艘');
  await expect(capacity).toContainText('基础 9 · 研发 +6');
  await expect(capacity).toContainText('超出上限 3 艘 · 现有船只保留');
  await expect(page.locator('#credits')).toHaveText('12,000');
  await expect(page.locator('.merchant-company-goal')).toContainText('开放重载物流研发资格');
  await expect(page.locator('.merchant-company-goal')).not.toContainText('基础船位不变');
  await page.locator('#merchant-dispatch-tab-research').click();
  const filter = page.locator('#merchant-tech-categories [data-category="船队扩容"]');
  await filter.click(); await expect(filter.locator('span')).toHaveText('11');
  await expect(page.locator('[data-research-tech]')).toHaveCount(11);
  await expect(page.locator('[data-research-tech="berth_planning"].is-complete, [data-research-tech="parallel_docks"].is-complete')).toHaveCount(2);
  await expect(page.locator('[data-tech="dock_network"]')).toBeDisabled();
  await expect(page.locator('#merchant-research-bonuses')).toContainText('船位 +6');
  await showResearchInViewport(page);
  await page.screenshot({ path: testInfo.outputPath('船位旧档恢复.png') });
  await page.reload(); await expect(page.locator('#startup-loader')).toBeHidden();
  await expect(capacity).toContainText('18 / 15 艘');
  await expect(page.locator('#credits')).toHaveText('12,000');
  await page.locator('#bottom-nav [data-view="ships"]').click();
  await expect(page.locator('[data-merchant-owned-type="courier"]')).toContainText('18 艘');
  await expect(page.locator('[data-merchant-action="buy"][data-type="courier"]')).toBeDisabled();
});

test('v32旧档超出新上限的船队与周转货本保留，任务返港结算后刷新可恢复', async ({ page }, testInfo) => {
  await importFixture(page, { level: 1, credits: 1000, legacyAccess: false, schemaVersion: 32, configure: state => {
    state.merchant.ships.push({ ...structuredClone(state.merchant.ships[0]), id: 'ship-2' });
    state.merchant.nextId = 3;
    expect(Merchant.command(state, 'create', { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds: ['ship-1', 'ship-2'], budget: 252 }, state.merchant.lastTickAt).ok).toBe(true);
  } });
  const capacity = page.locator('.merchant-company-capacity');
  await expect(capacity).toContainText('2 / 1 艘');
  await expect(capacity).toContainText('超出上限 1 艘 · 现有船只保留');
  await expect(page.locator('#credits')).toHaveText('748');
  await expect(page.locator('[data-merchant-task]')).toContainText('252 CR');
  await page.locator('[data-merchant-action="new"]').first().click();
  await page.locator('#merchant-form .merchant-inline-shipyard > summary').click();
  await expect(page.locator('[data-merchant-action="buy-in-form"][data-type="courier"]')).toBeDisabled();
  await closeForm(page);
  await page.clock.fastForward(18_000);
  await expect(page.locator('#credits')).toHaveText('832');
  await expect(page.locator('[data-merchant-task]')).toContainText('+84 CR');
  await page.screenshot({ path: testInfo.outputPath('单船上限旧档保留.png'), fullPage: true });
  await page.reload(); await expect(page.locator('#startup-loader')).toBeHidden();
  await expect(capacity).toContainText('2 / 1 艘');
  await expect(page.locator('[data-merchant-task]')).toContainText('+84 CR');
  await expect(page.locator('[data-merchant-task]')).toContainText('252 CR');
  await expect(page.locator('#credits')).toHaveText('832');
});

test('研发保留首航货本并解释不足资金，研发状态随现金更新且不能重复扣款', async ({ page }) => {
  await importFixture(page, { level: 1, credits: techCost('efficient_engines') + 73, legacyAccess: false });
  await page.locator('#merchant-dispatch-tab-research').click();
  const tech = page.locator('[data-research-tech="efficient_engines"]'), button = tech.locator('[data-merchant-action="research"]');
  await expect(button).toBeDisabled();
  await expect(tech).toContainText('需保留 74 CR 首航货本');
  await expect(page.locator('#credits')).toHaveText((techCost('efficient_engines') + 73).toLocaleString('zh-CN'));
  await importFixture(page, { level: 1, credits: techCost('efficient_engines') + 74, legacyAccess: false }, 2);
  await page.locator('#merchant-dispatch-tab-research').click();
  await expect(button).toBeEnabled(); await button.click();
  await expect(page.locator('#credits')).toHaveText('74');
  await expect(tech).toHaveClass(/is-complete/);
  await expect(button).toHaveText('已研发'); await expect(button).toBeDisabled();
  await expect(page.locator('[data-research-tech]')).toHaveCount(65);
  await page.clock.runFor(1000);
  await expect(page.locator('#credits')).toHaveText('74');
  await expect(page.locator('#merchant-research-progress')).toHaveText('1 / 65 已完成');
  await expect(page.locator('#merchant-research-bonuses')).toContainText('航速 +2%');
  await page.locator('#merchant-tech-categories [data-category="航速"]').click();
  await expect(page.locator('[data-research-tech]')).toHaveCount(15);
  await expect(tech).toHaveClass(/is-complete/);
  await expect(page.locator('#merchant-tech-categories [data-category="航速"] span')).toHaveText('15');
  await page.locator('#merchant-dispatch-tab-tasks').click();
  await page.locator('[data-merchant-action="new"]').first().click();
  await expect(page.locator('#merchant-form [name="remember"],[data-merchant-action="save-plan"]')).toHaveCount(0);
  await closeForm(page);
});
